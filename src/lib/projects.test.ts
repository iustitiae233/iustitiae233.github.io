import { describe, expect, it } from "vitest";
import {
  mergeRepoFiles,
  platformLabel,
  sortReposByPushed,
  topRepos,
  type RepoFile,
  type RepoLike,
} from "./projects";

function repo(name: string, pushedAt: string, platform = "github"): RepoLike {
  const owner = platform === "gitee" ? "liang-jiacheng111" : "iustitiae233";
  return {
    platform,
    name,
    fullName: `${owner}/${name}`,
    url: `https://${platform}.com/${owner}/${name}`,
    description: null,
    language: null,
    stars: 0,
    forks: 0,
    fork: false,
    pushedAt,
  };
}

function file(platform: string, repos: RepoLike[]): RepoFile {
  return { platform, username: platform, fetchedAt: "2026-09-21", ignored: [], repos };
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
    expect(platformLabel("gitee")).toBe("Gitee");
  });
  it("未知平台原样返回而不是抛错", () => {
    expect(platformLabel("codeberg")).toBe("codeberg");
  });
});

describe("mergeRepoFiles", () => {
  const gh = file("github", [
    repo("mirror", "2026-09-01T00:00:00Z"),
    repo("gh-only", "2026-08-01T00:00:00Z"),
  ]);
  const gitee = file("gitee", [
    repo("gitee-only", "2026-09-10T00:00:00Z", "gitee"),
    repo("mirror", "2026-09-05T00:00:00Z", "gitee"), // 比 GitHub 版还新，也仍被折叠
  ]);

  it("同名镜像折叠且靠前的参数（GitHub）赢", () => {
    const merged = mergeRepoFiles(gh, gitee);
    const mirror = merged.find((r) => r.name === "mirror");
    expect(mirror?.platform).toBe("github");
    expect(mirror?.url).toContain("github.com");
  });

  it("各平台独有仓库都保留，总数 = 去重后的并集", () => {
    const names = mergeRepoFiles(gh, gitee).map((r) => r.name).sort();
    expect(names).toEqual(["gh-only", "gitee-only", "mirror"]);
  });

  it("参数顺序反过来则 Gitee 版赢（规则只依赖顺序，不绑定平台）", () => {
    const mirror = mergeRepoFiles(gitee, gh).find((r) => r.name === "mirror");
    expect(mirror?.platform).toBe("gitee");
  });

  it("空产物文件可传入", () => {
    expect(mergeRepoFiles(file("github", []), gitee)).toHaveLength(2);
  });
});
