/** 笔记关系图谱数据与布局。纯逻辑（无 astro:content），vitest 直接可测。
 *  布局是确定性的分类聚类多圆环（构建期算好坐标，不做客户端力导向）——
 *  同输入同输出，可断言全等，构图稳定可当站点视觉资产。禁止引入随机性。
 *
 *  纵向只有横向的约 60%（W:H ≈ 860:520 viewBox px），所以"把三个环在 y 上排开"
 *  是最贵的资源——每一档 y 间距都要靠环半径去换。三类圆心构成上中一个、下方左右
 *  两个的三角形，ai 那环节点最多（15 篇措辞也最长），额外用圆弧缺口（见 RING）
 *  把节点从下方拥挤区推开。 */

import { extractOutgoingLinks } from "./backlinks";
import { buildNoteTargetIndex, mainTitleOf, type NoteTargetIndex } from "./wikilinks";
import type { NoteCategory } from "./notes";

export interface GraphNodeInput {
  id: string;
  title: string;
  category: NoteCategory;
}

export interface GraphEdge {
  source: string;
  target: string;
}

/** 节点含归一化坐标（x/y ∈ [-1,1] 附近），前端映射到 viewBox */
export interface GraphNode extends GraphNodeInput {
  label: string;
  url: string;
  x: number;
  y: number;
  /** 无向度数（出+入去重，自环不计），映射节点显示半径 */
  degree: number;
  /** 孤立节点（degree=0）排外圈，前端淡显 */
  isolated: boolean;
  /** 该节点在环上的角度（弧度，0=右、+π/2=下）。前端据此把标签朝环外放 */
  angle: number;
  /** 环内序号奇偶（0/1）。上下弧上相邻节点在 x 方向只差一个环步长，
   *  短于一个中文标题——前端用它把相邻标签错开一行高度 */
  stagger: 0 | 1;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** 边集 = 全部出链（复用反链的双语法提取），(source,target) 去重、自链忽略 */
export function buildGraphData(
  inputs: GraphNodeInput[],
  bodies: Map<string, string>,
): GraphData {
  const index: NoteTargetIndex = buildNoteTargetIndex(inputs);
  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const n of inputs) {
    for (const targetId of extractOutgoingLinks(bodies.get(n.id) ?? "", index)) {
      if (targetId === n.id) continue;
      const key = `${n.id} ${targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: n.id, target: targetId });
    }
  }

  // 无向度数（去重后的边两端各计一次）
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  const nodes: GraphNode[] = computeLayout(inputs, edges, degree);
  return { nodes, edges };
}

/** 分类聚类多圆环：每分类一个圆心（embedded 左下 / hardware 右下 / ai 上中），
 *  类内按 id 字典序均匀角度。连通节点占主环，孤立节点（degree=0）退到更远外圈。 */
export function computeLayout(
  inputs: GraphNodeInput[],
  edges: GraphEdge[],
  degree?: Map<string, number>,
): GraphNode[] {
  const deg =
    degree ??
    (() => {
      const m = new Map<string, number>();
      for (const e of edges) {
        m.set(e.source, (m.get(e.source) ?? 0) + 1);
        m.set(e.target, (m.get(e.target) ?? 0) + 1);
      }
      return m;
    })();

  const groups = new Map<NoteCategory, GraphNodeInput[]>();
  for (const n of inputs) {
    const list = groups.get(n.category);
    if (list) list.push(n);
    else groups.set(n.category, [n]);
  }

  // 分类圆心：embedded 左下 / hardware 右下 / ai 上中，构成三角
  //（NOTE_CATEGORY_VALUES 顺序无关，固定锚定位置保证构图稳定）
  // y 的取值由纵向余量决定：viewBox 1000×660 pad 70 → y 可用区仅约 [-0.92, 0.51]
  const CENTER: Record<NoteCategory, { x: number; y: number }> = {
    embedded: { x: -0.5, y: 0.224 },
    hardware: { x: 0.5, y: 0.224 },
    ai: { x: 0, y: -0.61 },
  };
  const OUTER_R = 0.52; // 孤立节点外圈半径
  // 每分类的环参数（角度：0=右、90=下、270=上）。
  // 整环时 from→to 跨度取 360（节点按 360/n 等分，首尾不重合）；
  // 跨度小于 360 的圆弧按 (to-from)/(n-1) 等分，两端正好落在弧端点上。
  // ai 有 15 篇（最多）且标题最长，把缺口（290° 圆弧留 70° 空档）朝正下方——
  // 让开 embedded/hardware 两环所在的方向，否则三环在中线互相压标签。
  const RING: Record<NoteCategory, { r: number; from: number; to: number }> = {
    embedded: { r: 0.32, from: 0, to: 360 },
    hardware: { r: 0.32, from: 36, to: 396 },
    ai: { r: 0.4, from: 125, to: 415 },
  };

  const out: GraphNode[] = [];
  for (const [category, listRaw] of groups) {
    const list = [...listRaw].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const center = CENTER[category];
    const ring = RING[category];
    const connected = list.filter((n) => (deg.get(n.id) ?? 0) > 0);
    const isolated = list.filter((n) => (deg.get(n.id) ?? 0) === 0);
    const place = (nodes: GraphNodeInput[], radius: number, from: number, to: number) => {
      const span = to - from;
      // 整环按 n 等分（首尾不重合）；圆弧按 n-1 等分（两端落在弧端点）
      const step = span >= 360 ? span / Math.max(nodes.length, 1) : span / Math.max(nodes.length - 1, 1);
      nodes.forEach((n, i) => {
        const angle = (((from + step * i) % 360) * Math.PI) / 180;
        out.push({
          ...n,
          label: mainTitleOf(n.title),
          url: `/notes/${n.id}/`,
          x: center.x + radius * Math.cos(angle),
          y: center.y + radius * Math.sin(angle) * 0.85, // 纵向略压扁适配宽屏
          degree: deg.get(n.id) ?? 0,
          isolated: (deg.get(n.id) ?? 0) === 0,
          angle,
          stagger: (i % 2) as 0 | 1,
        });
      });
    };
    place(connected, ring.r, ring.from, ring.to);
    // 外圈错开半步，避免孤立节点正压在连通节点外侧同一条射线上
    place(isolated, OUTER_R, ring.from + 15, ring.from + 375);
  }
  return out;
}
