/** 仓库信息的平台中立形状 —— 字段名已从各平台的原始格式归一化，接 Gitee 时
 *  差异全部吸收在各自的抓取脚本里，本文件与页面不用动。 */
export interface RepoLike {
  platform: string;
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  fork: boolean;
  pushedAt: string; // ISO 8601
}

/** 抓取产物文件 src/data/github-repos.json / gitee-repos.json 的顶层结构 */
export interface RepoFile {
  platform: string;
  username: string;
  fetchedAt: string;
  ignored: string[];
  repos: RepoLike[];
}

export const PLATFORM_LABELS: Record<string, string> = {
  github: "GitHub",
  gitee: "Gitee",
};

/** 未知平台原样返回（不抛错）——将来加平台时页面不会因为漏了标签而炸 */
export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

/** 按最近推送降序；同刻按 name 字典序升序保证稳定。
 *  与 posts.ts 的排序同一套思路：**禁随机性**，同输入同输出。返回新数组，不动入参。 */
export function sortReposByPushed<T extends RepoLike>(repos: T[]): T[] {
  return [...repos].sort((a, b) => {
    const da = Date.parse(a.pushedAt);
    const db = Date.parse(b.pushedAt);
    return db !== da ? db - da : a.name.localeCompare(b.name);
  });
}

/** 首页预览：最近 N 个 */
export function topRepos<T extends RepoLike>(repos: T[], n: number): T[] {
  return sortReposByPushed(repos).slice(0, n);
}

/** 合并各平台的抓取产物：拼接后按仓库名去重，**同名时靠前的参数赢**（调用方
 *  固定按 (github, gitee) 传入 → 镜像仓库展示 GitHub 版，Gitee 只补充独有项目）。
 *
 *  去重键故意是裸 `name` 而不是 platform+name：同一平台内 owner 的仓库名本就唯一，
 *  跨平台同名恰好就是「同一项目的镜像」这层语义本身 —— 正是要折叠的对象。
 *  （各脚本自己的 IGNORE 名单仍只作用于本平台，与本函数无关。） */
export function mergeRepoFiles(...files: RepoFile[]): RepoLike[] {
  const seen = new Set<string>();
  const out: RepoLike[] = [];
  for (const file of files) {
    for (const repo of file.repos) {
      if (seen.has(repo.name)) continue;
      seen.add(repo.name);
      out.push(repo);
    }
  }
  return out;
}
