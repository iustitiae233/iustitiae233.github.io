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
    // 外圈：到本类圆心的距离更远（embedded 圆心 -0.5,0）
    const dist = (n: { x: number; y: number }, cx: number) =>
      Math.hypot(n.x - cx, n.y / 0.85);
    const pwm = byId.get("embedded/mcu-pwm")!;
    expect(dist(adc, -0.5)).toBeGreaterThan(dist(pwm, -0.5));
  });

  it("独立调用 computeLayout（不传 degree）与 buildGraphData 内部一致", () => {
    const nodes = computeLayout(INPUTS, graph.edges);
    expect(nodes).toEqual(graph.nodes);
  });
});
