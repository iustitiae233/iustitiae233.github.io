import { describe, expect, test } from "vitest";
import { filterEntries, type SearchEntry } from "./search";

const ENTRIES: SearchEntry[] = [
  { title: "你好 Astro：静态博客入门", url: "/posts/hello-astro/", kind: "post" },
  { title: "CSS 滚动驱动动画", url: "/posts/css-scroll-animations/", kind: "post" },
  { title: "FreeRTOS 入门——配置与任务管理", url: "/notes/embedded/freertos-config-tasks/", kind: "note" },
  { title: "二极管基础", url: "/notes/hardware/diode-basics/", kind: "note" },
];

describe("filterEntries 标题子串过滤", () => {
  test("空 query 返回空数组", () => {
    expect(filterEntries(ENTRIES, "")).toEqual([]);
  });

  test("仅空白的 query 返回空数组", () => {
    expect(filterEntries(ENTRIES, "   ")).toEqual([]);
  });

  test("无匹配返回空数组", () => {
    expect(filterEntries(ENTRIES, "量子计算")).toEqual([]);
  });

  test("大小写不敏感：小写 query 命中大写标题", () => {
    const r = filterEntries(ENTRIES, "astro");
    expect(r).toHaveLength(1);
    expect(r[0].url).toBe("/posts/hello-astro/");
  });

  test("中文子串匹配", () => {
    const r = filterEntries(ENTRIES, "滚动");
    expect(r).toHaveLength(1);
    expect(r[0].url).toBe("/posts/css-scroll-animations/");
  });

  test("同一关键词命中多篇时全部返回", () => {
    const r = filterEntries(ENTRIES, "入门");
    expect(r.map((x) => x.url)).toEqual([
      "/posts/hello-astro/",
      "/notes/embedded/freertos-config-tasks/",
    ]);
  });

  test("matchStart/matchLength 定位原文中的匹配段（用于 <mark> 高亮）", () => {
    const r = filterEntries(ENTRIES, "astro");
    expect(r[0].title.slice(r[0].matchStart, r[0].matchStart + r[0].matchLength).toLowerCase()).toBe("astro");
  });

  test("超过 limit 条时截断（默认 8）", () => {
    const many: SearchEntry[] = Array.from({ length: 20 }, (_, i) => ({
      title: `内核笔记 ${i}`,
      url: `/notes/n${i}/`,
      kind: "note",
    }));
    expect(filterEntries(many, "内核")).toHaveLength(8);
  });

  test("结果保留索引原顺序", () => {
    const r = filterEntries(ENTRIES, "o");
    const titles = r.map((x) => x.title);
    const expected = ENTRIES.filter((e) => e.title.toLowerCase().includes("o")).map((e) => e.title);
    expect(titles).toEqual(expected);
  });
});
