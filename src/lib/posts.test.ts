import { describe, expect, it } from "vitest";
import { filterPublished, getAdjacentPosts, sortPostsByDateDesc } from "./posts";

const d = (s: string) => new Date(s);
const posts = [
  { id: "b", data: { pubDate: d("2026-02-01"), draft: false } },
  { id: "a", data: { pubDate: d("2026-03-01"), draft: false } },
  { id: "c", data: { pubDate: d("2026-01-01"), draft: false } },
];

describe("filterPublished", () => {
  it("过滤草稿", () => {
    const withDraft = [
      ...posts,
      { id: "wip", data: { pubDate: d("2026-04-01"), draft: true } },
    ];
    expect(filterPublished(withDraft).map((p) => p.id)).toEqual(["b", "a", "c"]);
  });
  it("draft 缺省视为已发布", () => {
    expect(filterPublished([{ id: "x", data: { pubDate: d("2026-01-01") } }])).toHaveLength(1);
  });
});

describe("getPublishedPosts 管道（filterPublished + sortPostsByDateDesc）", () => {
  it("草稿被排除且其余按日期降序", () => {
    const pipeline = sortPostsByDateDesc(filterPublished(posts));
    expect(pipeline.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
});;

describe("sortPostsByDateDesc", () => {
  it("按日期降序", () => {
    expect(sortPostsByDateDesc(posts).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
  it("同日按 id 稳定排序", () => {
    const same = [
      { id: "z", data: { pubDate: d("2026-01-01"), draft: false } },
      { id: "y", data: { pubDate: d("2026-01-01"), draft: false } },
    ];
    expect(sortPostsByDateDesc(same).map((p) => p.id)).toEqual(["y", "z"]);
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
  it("id 不存在时两端为 null", () => {
    expect(getAdjacentPosts(sorted, "nope")).toEqual({ newer: null, older: null });
  });
});
