import { describe, expect, it } from "vitest";
import { platformLabel, sortReposByPushed, topRepos, type RepoLike } from "./projects";

function repo(name: string, pushedAt: string): RepoLike {
  return {
    platform: "github",
    name,
    fullName: `iustitiae233/${name}`,
    url: `https://github.com/iustitiae233/${name}`,
    description: null,
    language: null,
    stars: 0,
    forks: 0,
    fork: false,
    pushedAt,
  };
}

describe("sortReposByPushed", () => {
  it("按最近推送降序", () => {
    const list = [
      repo("old", "2026-07-02T03:26:51Z"),
      repo("new", "2026-09-17T06:36:33Z"),
      repo("mid", "2026-08-07T13:24:18Z"),
    ];
    expect(sortReposByPushed(list).map((r) => r.name)).toEqual(["new", "mid", "old"]);
  });

  it("同刻按 name 字典序升序", () => {
    const t = "2026-09-11T03:01:00Z";
    const list = [repo("bravo", t), repo("alpha", t), repo("charlie", t)];
    expect(sortReposByPushed(list).map((r) => r.name)).toEqual(["alpha", "bravo", "charlie"]);
  });

  it("不修改入参数组的顺序", () => {
    const list = [repo("a", "2026-07-01T00:00:00Z"), repo("b", "2026-09-01T00:00:00Z")];
    const before = list.map((r) => r.name);
    sortReposByPushed(list);
    expect(list.map((r) => r.name)).toEqual(before);
  });

  it("空数组", () => {
    expect(sortReposByPushed([])).toEqual([]);
  });
});

describe("topRepos", () => {
  const list = [
    repo("a", "2026-07-02T03:26:51Z"),
    repo("b", "2026-09-17T06:36:33Z"),
    repo("c", "2026-08-07T13:24:18Z"),
    repo("d", "2026-09-11T03:01:00Z"),
  ];

  it("取最近 3 个", () => {
    expect(topRepos(list, 3).map((r) => r.name)).toEqual(["b", "d", "c"]);
  });

  it("n 超过总数时全返回", () => {
    expect(topRepos(list, 99)).toHaveLength(4);
  });

  it("n 为 0 时返回空", () => {
    expect(topRepos(list, 0)).toEqual([]);
  });
});

describe("platformLabel", () => {
  it("已知平台", () => {
    expect(platformLabel("github")).toBe("GitHub");
  });
  it("未知平台原样返回而不是抛错", () => {
    expect(platformLabel("codeberg")).toBe("codeberg");
  });
});
