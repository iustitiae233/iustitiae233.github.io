/** 笔记关系图谱数据与布局。纯逻辑（无 astro:content），vitest 直接可测。
 *  布局是确定性的分类聚类双圆环（构建期算好坐标，不做客户端力导向）——
 *  同输入同输出，可断言全等，构图稳定可当站点视觉资产。禁止引入随机性。 */

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

/** 分类聚类双圆环：embedded 左圆心 / hardware 右圆心，类内按 id 字典序均匀角度。
 *  连通节点占主环，孤立节点（degree=0）退到更远外圈。 */
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

  // 分类圆心：embedded 左 / hardware 右（NOTE_CATEGORY_VALUES 顺序无关，
  // 固定锚定位置保证构图稳定）
  const CENTER: Record<NoteCategory, { x: number; y: number }> = {
    embedded: { x: -0.5, y: 0 },
    hardware: { x: 0.5, y: 0 },
  };
  const MAIN_R = 0.34; // 连通节点主环半径
  const OUTER_R = 0.5; // 孤立节点外圈半径
  // 分类相位错开，避免两环节点在中线方向正对
  const PHASE: Record<NoteCategory, number> = {
    embedded: 0,
    hardware: Math.PI / 5,
  };

  const out: GraphNode[] = [];
  for (const [category, listRaw] of groups) {
    const list = [...listRaw].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const center = CENTER[category];
    const phase = PHASE[category];
    const connected = list.filter((n) => (deg.get(n.id) ?? 0) > 0);
    const isolated = list.filter((n) => (deg.get(n.id) ?? 0) === 0);
    const place = (nodes: GraphNodeInput[], radius: number, offset: number) => {
      nodes.forEach((n, i) => {
        const angle = phase + (2 * Math.PI * i) / Math.max(nodes.length, 1) + offset;
        out.push({
          ...n,
          label: mainTitleOf(n.title),
          url: `/notes/${n.id}/`,
          x: center.x + radius * Math.cos(angle),
          y: center.y + radius * Math.sin(angle) * 0.85, // 纵向略压扁适配宽屏
          degree: deg.get(n.id) ?? 0,
          isolated: (deg.get(n.id) ?? 0) === 0,
        });
      });
    };
    place(connected, MAIN_R, 0);
    place(isolated, OUTER_R, Math.PI / 7); // 外圈也错开角度
  }
  return out;
}
