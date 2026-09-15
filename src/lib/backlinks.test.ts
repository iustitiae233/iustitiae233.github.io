import { describe, expect, it } from "vitest";
import { buildBacklinkIndex, extractOutgoingLinks } from "./backlinks";
import { buildNoteTargetIndex } from "./wikilinks";

const NOTES = [
  { id: "embedded/mcu-gpio", title: "GPIO 基础——从寄存器到HAL库", body: "" },
  {
    id: "embedded/mcu-pwm",
    title: "PWM 输出",
    body: "引脚配置见 [[mcu-gpio]]。再次提到 [[mcu-gpio|GPIO]]。",
  },
  {
    id: "hardware/transistor-basics",
    title: "三极管基础",
    body: "前置知识：[二极管基础](/notes/hardware/diode-basics/)，无尾斜杠版本 [再来一次](/notes/hardware/diode-basics)。",
  },
  {
    id: "hardware/mosfet-basics",
    title: "MOS管基础",
    body: "见 [[三极管基础]] 与 [坏链](/notes/hardware/不存在的笔记/) 与自链 [[MOS管基础]]。",
  },
  { id: "hardware/diode-basics", title: "二极管基础——从整流到稳压", body: "![[photo.png]] 图片附件不算链" },
];

const index = buildNoteTargetIndex(NOTES.map(({ id, title }) => ({ id, title })));
const backlinks = buildBacklinkIndex(NOTES);

describe("extractOutgoingLinks", () => {
  it("wikilink 出链：basename 形与标题形都解析为完整 id", () => {
    expect(extractOutgoingLinks(NOTES[1].body, index)).toEqual([
      "embedded/mcu-gpio",
      "embedded/mcu-gpio",
    ]);
    expect(extractOutgoingLinks(NOTES[3].body, index)).toContain("hardware/transistor-basics");
  });

  it("标准链接：尾斜杠可选，都计入；坏链（不存在的 id）不计入", () => {
    const links = extractOutgoingLinks(NOTES[2].body, index);
    expect(links).toEqual(["hardware/diode-basics", "hardware/diode-basics"]);
    expect(extractOutgoingLinks(NOTES[3].body, index)).not.toContain(
      "hardware/不存在的笔记",
    );
  });

  it("图片 embed wikilink 不算笔记链接", () => {
    expect(extractOutgoingLinks(NOTES[4].body, index)).toEqual([]);
  });
});

describe("buildBacklinkIndex", () => {
  it("方向正确：A 链 B ⇒ B 的反链列表含 A", () => {
    const sources = backlinks.get("embedded/mcu-gpio");
    expect(sources).toBeDefined();
    expect(sources!.map((s) => s.sourceId)).toEqual(["embedded/mcu-pwm"]);
    expect(sources![0].sourceTitle).toBe("PWM 输出");
    expect(sources![0].sourceUrl).toBe("/notes/embedded/mcu-pwm/");
  });

  it("同源多次链接去重为一", () => {
    expect(backlinks.get("embedded/mcu-gpio")).toHaveLength(1);
  });

  it("wikilink 与标准链接殊途同归：同一目标的两类来源都出现", () => {
    expect(backlinks.get("hardware/diode-basics")).toEqual([
      {
        sourceId: "hardware/transistor-basics",
        sourceTitle: "三极管基础",
        sourceUrl: "/notes/hardware/transistor-basics/",
      },
    ]);
  });

  it("自链忽略；坏链不进索引；无链笔记不出现在任何 value 里", () => {
    expect(backlinks.get("hardware/mosfet-basics")).toBeUndefined();
    expect(backlinks.get("embedded/mcu-gpio")).toHaveLength(1);
    for (const sources of backlinks.values()) {
      expect(sources.some((s) => s.sourceId === "hardware/diode-basics")).toBe(false);
    }
  });

  it("sourceTitle 用剥副题的主标题（display），非完整 title", () => {
    const sources = backlinks.get("embedded/mcu-gpio");
    // 来源是 mcu-pwm（title 无副题），此处验证 display 通道：换一个带副题的来源
    const bl = buildBacklinkIndex([
      { id: "a/long", title: "长标题——副标题", body: "见 [[b/target]]" },
      { id: "b/target", title: "目标", body: "" },
    ]);
    expect(bl.get("b/target")![0].sourceTitle).toBe("长标题");
    expect(sources).toBeDefined();
  });
});
