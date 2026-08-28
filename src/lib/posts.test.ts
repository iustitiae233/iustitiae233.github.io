import { describe, expect, it } from "vitest";
import { getAdjacentPosts, sortPostsByDateDesc } from "./posts";

const d = (s: string) => new Date(s);
const posts = [
  { slug: "b", data: { pubDate: d("2026-02-01"), draft: false } },
  { slug: "a", data: { pubDate: d("2026-03-01"), draft: false } },
  { slug: "c", data: { pubDate: d("2026-01-01"), draft: false } },
];

describe("sortPostsByDateDesc", () => {
  it("按日期降序", () => {
    expect(sortPostsByDateDesc(posts).map((p) => p.slug)).toEqual(["a", "b", "c"]);
  });
  it("同日按 slug 稳定排序", () => {
    const same = [
      { slug: "z", data: { pubDate: d("2026-01-01"), draft: false } },
      { slug: "y", data: { pubDate: d("2026-01-01"), draft: false } },
    ];
    expect(sortPostsByDateDesc(same).map((p) => p.slug)).toEqual(["y", "z"]);
  });
});

describe("getAdjacentPosts", () => {
  const sorted = sortPostsByDateDesc(posts);
  it("中间文章：newer 是更新的，older 是更早的", () => {
    expect(getAdjacentPosts(sorted, "b")).toEqual({
      newer: sorted[0],
      older: sorted[2],
    });
  });
  it("最新文章没有 newer", () => {
    expect(getAdjacentPosts(sorted, "a").newer).toBeNull();
  });
  it("最旧文章没有 older", () => {
    expect(getAdjacentPosts(sorted, "c").older).toBeNull();
  });
  it("slug 不存在时两端为 null", () => {
    expect(getAdjacentPosts(sorted, "nope")).toEqual({ newer: null, older: null });
  });
});
