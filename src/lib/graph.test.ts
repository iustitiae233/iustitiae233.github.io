import { describe, expect, it } from "vitest";
import { buildGraphData, computeLayout } from "./graph";

const INPUTS = [
  { id: "embedded/mcu-gpio", title: "GPIO 基础——从寄存器到HAL库", category: "embedded" as const },
  { id: "embedded/mcu-pwm", title: "PWM 输出", category: "embedded" as const },
  { id: "embedded/mcu-adc", title: "ADC 采样", category: "embedded" as const },
  { id: "hardware/diode-basics", title: "二极管基础", category: "hardware" as const },
  { id: "hardware/mosfet-basics", title: "MOS管基础", category: "hardware" as const },
  { id: "hardware/capacitor-basics", title: "电容基础", category: "hardware" as const },
];

const BODIES = new Map<string, string>([
  ["embedded/mcu-pwm", "引脚见 [[mcu-gpio]]，又见 [[mcu-gpio|GPIO]]。"],
  ["hardware/mosfet-basics", "见 [[二极管基础]] 与 [GPIO](/notes/embedded/mcu-gpio/)。"],
]);

const graph = buildGraphData(INPUTS, BODIES);

describe("buildGraphData", () => {
  it("边去重：同源多次链同一目标只计一条", () => {
    const pwmToGpio = graph.edges.filter(
      (e) => e.source === "embedded/mcu-pwm" && e.target === "embedded/mcu-gpio",
    );
    expect(pwmToGpio).toHaveLength(1);
  });

  it("双语法都进边集：wikilink 标题形 + 标准链接跨分类", () => {
    expect(graph.edges).toContainEqual({
      source: "hardware/mosfet-basics",
      target: "hardware/diode-basics",
    });
    expect(graph.edges).toContainEqual({
      source: "hardware/mosfet-basics",
      target: "embedded/mcu-gpio",
    });
  });

  it("度数：无向（出+入合并），mcu-gpio = 2（pwm + mosfet），mcu-pwm = 1", () => {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    expect(byId.get("embedded/mcu-gpio")!.degree).toBe(2);
    expect(byId.get("embedded/mcu-pwm")!.degree).toBe(1);
  });

  it("label 用主标题（剥——副题），url 带尾斜杠", () => {
    const gpio = graph.nodes.find((n) => n.id === "embedded/mcu-gpio")!;
    expect(gpio.label).toBe("GPIO 基础");
    expect(gpio.url).toBe("/notes/embedded/mcu-gpio/");
  });
});

describe("computeLayout（确定性）", () => {
  it("同输入两次调用输出深度全等", () => {
    const a = buildGraphData(INPUTS, BODIES).nodes;
    const b = buildGraphData(INPUTS, BODIES).nodes;
    expect(a).toEqual(b);
  });

  it("坐标均为有限数，每个输入节点恰有一个布局节点", () => {
    expect(graph.nodes).toHaveLength(INPUTS.length);
    for (const n of graph.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it("孤立节点标记 isolated 并排外圈；连通节点在主环", () => {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const adc = byId.get("embedded/mcu-adc")!;
    const capacitor = byId.get("hardware/capacitor-basics")!;
    expect(adc.isolated).toBe(true);
    expect(capacitor.isolated).toBe(true);
    // 外圈：到本类圆心的距离更远（embedded 圆心 x=-0.5，y 随构图可调）
    const dist = (n: { x: number; y: number }, cx: number, cy: number) =>
      Math.hypot(n.x - cx, (n.y - cy) / 0.85);
    const pwm = byId.get("embedded/mcu-pwm")!;
    expect(dist(adc, -0.5, 0.224)).toBeGreaterThan(dist(pwm, -0.5, 0.224));
  });

  it("独立调用 computeLayout（不传 degree）与 buildGraphData 内部一致", () => {
    const nodes = computeLayout(INPUTS, graph.edges);
    expect(nodes).toEqual(graph.nodes);
  });
});

describe("第三分类 ai 的锚点", () => {
  const AI_INPUTS = [
    { id: "embedded/mcu-gpio", title: "GPIO 基础", category: "embedded" as const },
    { id: "hardware/diode-basics", title: "二极管基础", category: "hardware" as const },
    { id: "ai/overview", title: "AI 笔记总览", category: "ai" as const },
    { id: "ai/self-attention", title: "自注意力", category: "ai" as const },
  ];
  const AI_BODIES = new Map<string, string>([
    ["ai/self-attention", "回 [[ai/overview]]，另见 [[ai/self-attention|本篇]]。"],
  ]);
  const aiGraph = buildGraphData(AI_INPUTS, AI_BODIES);

  // CENTER.ai / RING.ai 的锚点：三个环要在纵向排开，而纵向每单位像素只有横向的
  // 约 3/4，余量本就紧张。改动这些常量必须同步改这里，否则三环会重新挤到一起。
  const AI_CY = -0.61;
  const OTHER_CY = 0.224;

  it("ai 节点围绕 ai 圆心（0, -0.61）聚簇，与另两类分离", () => {
    const byId = new Map(aiGraph.nodes.map((n) => [n.id, n]));
    const ai = byId.get("ai/self-attention")!;
    const overview = byId.get("ai/overview")!;
    // 与 ai 圆心的距离不超过圆弧半径（含 0.85 纵向压缩带来的偏差）
    const distToAi = (n: { x: number; y: number }) => Math.hypot(n.x - 0, n.y - AI_CY);
    expect(distToAi(ai)).toBeLessThanOrEqual(0.41);
    expect(distToAi(overview)).toBeLessThanOrEqual(0.41);
    // 纵向必须整体偏上，才能与 embedded/hardware 两环分开
    expect(ai.y).toBeLessThan(-0.2);
    expect(overview.y).toBeLessThan(-0.2);
  });

  it("ai 环与另两环之间留出足够纵向间隙（否则三环标签互相压）", () => {
    const maxAi = Math.max(...aiGraph.nodes.filter((n) => n.category === "ai").map((n) => n.y));
    const minOther = Math.min(
      ...aiGraph.nodes.filter((n) => n.category !== "ai").map((n) => n.y),
    );
    // 两环之间必须容得下标签（约 25px，纵向 310px/单位 → 0.08）+ 节点半径的余量
    expect(minOther - maxAi).toBeGreaterThan(0.15);
  });

  it("角度字段与坐标一致（前端据 angle 把标签朝环外放）", () => {
    for (const n of graph.nodes) {
      const cy = n.category === "ai" ? AI_CY : OTHER_CY;
      const cx = n.category === "embedded" ? -0.5 : n.category === "hardware" ? 0.5 : 0;
      const r = Math.hypot(n.x - cx, (n.y - cy) / 0.85);
      const expectR = n.isolated ? 0.52 : n.category === "ai" ? 0.4 : 0.32;
      expect(r).toBeCloseTo(expectR, 6);
      // angle 必须真的是该点的极角，否则标签会放到环内那一侧
      expect(Math.cos(n.angle)).toBeCloseTo((n.x - cx) / r, 6);
      expect(Math.sin(n.angle)).toBeCloseTo((n.y - cy) / 0.85 / r, 6);
    }
  });

  it("ai 圆弧在正下方留缺口：没有节点落在 90°±30° 区间", () => {
    for (const n of aiGraph.nodes.filter((x) => x.category === "ai")) {
      const deg = (((n.angle * 180) / Math.PI) % 360 + 360) % 360;
      const off = Math.min(Math.abs(deg - 90), 360 - Math.abs(deg - 90));
      expect(off).toBeGreaterThanOrEqual(30);
    }
  });

  it("ai 分类的节点数与输入一致，坐标为有限数", () => {
    const aiNodes = aiGraph.nodes.filter((n) => n.category === "ai");
    expect(aiNodes).toHaveLength(2);
    for (const n of aiNodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it("自链被忽略：ai/self-attention → ai/overview 成立，自指不在边集", () => {
    expect(aiGraph.edges).toContainEqual({
      source: "ai/self-attention",
      target: "ai/overview",
    });
    expect(
      aiGraph.edges.some((e) => e.source === e.target),
    ).toBe(false);
  });
});
