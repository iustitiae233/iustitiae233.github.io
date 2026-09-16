import { describe, expect, it } from "vitest";
import { collectTags, notesWithTag, tagUrl } from "./tags";

const NOTES = [
  { id: "a/gpio", data: { tags: ["GPIO", "寄存器"] } },
  { id: "a/pwm", data: { tags: ["gpio", "定时器"] } },
  { id: "b/diode", data: { tags: ["无源器件"] } },
  { id: "b/plain", data: { tags: [] } },
];

describe("collectTags", () => {
  it("大小写不敏感合并计数：GPIO 与 gpio 计 2", () => {
    const tags = collectTags(NOTES);
    const gpio = tags.find((t) => t.tag === "GPIO");
    expect(gpio).toEqual({ tag: "GPIO", count: 2 }); // 保留首次出现的写法
  });

  it("排序确定性：count 降序，同 count 字典序（code unit：定 U+5B9A < 寄 U+5BC4 < 无 U+65E0）", () => {
    const tags = collectTags(NOTES);
    expect(tags.map((t) => t.tag)).toEqual(["GPIO", "定时器", "寄存器", "无源器件"]);
    // 展示写法取首现（真实输入是固定日期序）；稳定性断言用规范化 key 对比，
    // 不受输入顺序影响
    const again = collectTags([...NOTES].reverse());
    expect(again.map((t) => t.tag.toLowerCase())).toEqual(
      tags.map((t) => t.tag.toLowerCase()),
    );
    expect(again.map((t) => t.count)).toEqual(tags.map((t) => t.count));
  });

  it("空标签跳过；无标签笔记不产生条目", () => {
    expect(collectTags([{ id: "x", data: { tags: ["", "  "] } }])).toEqual([]);
    expect(collectTags([NOTES[3]])).toEqual([]);
  });
});

describe("notesWithTag", () => {
  it("大小写不敏感过滤，保持传入顺序", () => {
    expect(notesWithTag(NOTES, "GPIO").map((n) => n.id)).toEqual(["a/gpio", "a/pwm"]);
    expect(notesWithTag(NOTES, "gpio").map((n) => n.id)).toEqual(["a/gpio", "a/pwm"]);
  });

  it("无命中返回空数组", () => {
    expect(notesWithTag(NOTES, "不存在")).toEqual([]);
  });
});

describe("tagUrl", () => {
  it("ASCII 原样，中文编码，尾斜杠", () => {
    expect(tagUrl("GPIO")).toBe("/tags/GPIO/");
    expect(tagUrl("定时器")).toBe(`/tags/${encodeURIComponent("定时器")}/`);
  });
});
