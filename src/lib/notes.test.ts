import { describe, expect, it } from "vitest";
import { groupNotesByCategory, notesInCategory } from "./notes";
import type { NoteLike } from "./notes";

const d = (s: string) => new Date(s);
const note = (id: string, category: NoteLike["data"]["category"], date: string): NoteLike => ({
  id,
  data: { pubDate: d(date), category },
});

// 乱序输入：硬件在前、日期乱序，含第三分类 ai
const notes = [
  note("mos", "hardware", "2026-08-03"),
  note("cap", "hardware", "2026-07-21"),
  note("gpio", "embedded", "2026-06-27"),
  note("pwm", "embedded", "2026-06-26"),
  note("attn", "ai", "2026-09-16"),
];

describe("groupNotesByCategory", () => {
  it("按固定顺序分组（嵌入式在前、新分类追加在末尾），组内日期降序", () => {
    const groups = groupNotesByCategory(notes);
    expect(groups.map((g) => g.category)).toEqual(["embedded", "hardware", "ai"]);
    expect(groups[0].notes.map((n) => n.id)).toEqual(["gpio", "pwm"]);
    expect(groups[1].notes.map((n) => n.id)).toEqual(["mos", "cap"]);
    expect(groups[2].notes.map((n) => n.id)).toEqual(["attn"]);
  });
  it("带中文标签", () => {
    expect(groupNotesByCategory(notes).map((g) => g.label)).toEqual([
      "嵌入式",
      "硬件基础",
      "AI 原理",
    ]);
  });
  it("跳过空分类", () => {
    const groups = groupNotesByCategory([note("cap", "hardware", "2026-07-21")]);
    expect(groups.map((g) => g.category)).toEqual(["hardware"]);
  });
  it("空输入返回空数组", () => {
    expect(groupNotesByCategory([])).toEqual([]);
  });
});

describe("notesInCategory", () => {
  it("只取该分类且按日期降序（详情页上一篇/下一篇的相邻链）", () => {
    expect(notesInCategory(notes, "embedded").map((n) => n.id)).toEqual(["gpio", "pwm"]);
    expect(notesInCategory(notes, "hardware").map((n) => n.id)).toEqual(["mos", "cap"]);
    expect(notesInCategory(notes, "ai").map((n) => n.id)).toEqual(["attn"]);
  });
});
