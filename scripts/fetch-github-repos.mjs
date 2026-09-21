// 拉取 GitHub 公开仓库清单，供 /projects/ 与首页项目预览使用。
// 用法: node scripts/fetch-github-repos.mjs <username>
//
// 产物（提交进 git，离线构建不依赖网络）:
//   - src/data/github-repos.json
//
// 失败语义与 fetch-github-profile.mjs 完全一致：网络错误/限流时保留旧文件并退出 0
// —— 构建链不因 GitHub 不可达而挂；仅参数错误以非零退出。

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { githubHeaders } from "./lib/github-auth.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const JSON_PATH = join(ROOT, "src", "data", "github-repos.json");
const TIMEOUT_MS = 15_000;
const PER_PAGE = 100;

/** 不展示的仓库名 —— 唯一的事实来源。
 *  产物 JSON 里的 ignored 只是导出快照：页面既不读它也不按它过滤（两条同义规则必然
 *  漂移），**改 JSON 里的 ignored 不生效**，要排除仓库只改这里。 */
const IGNORE = new Set([
  "Comments",  // 空仓库（无描述/无语言），只是拿来做 giscus 存储的，不是项目
  // "iustitiae233.github.io",  // 博客源码本身：只想留硬件/工具项目就取消注释
]);

const username = process.argv[2];
if (!username) {
  console.error("用法: node scripts/fetch-github-repos.mjs <github-username>");
  process.exit(1);
}

/** GitHub 的 snake_case → 平台中立的 camelCase。
 *  接 Gitee 时字段差异全部吸收在这一层，页面与 src/lib/projects.ts 不用动。 */
function toRepo(r) {
  return {
    platform: "github",
    name: r.name,
    fullName: r.full_name,
    url: r.html_url,
    description: r.description ?? null,
    language: r.language ?? null,
    stars: r.stargazers_count ?? 0,
    forks: r.forks_count ?? 0,
    fork: r.fork === true,
    pushedAt: r.pushed_at,
  };
}

async function main() {
  // type=owner：只要本人拥有的仓库。sort=pushed 只为让提交进 git 的文件本身可读 ——
  // 展示顺序由 src/lib/projects.ts 决定（那里有 vitest）。
  const url =
    `https://api.github.com/users/${username}/repos` +
    `?per_page=${PER_PAGE}&sort=pushed&direction=desc&type=owner`;
  const res = await fetch(url, {
    headers: githubHeaders(url),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw)) throw new Error("GitHub API 返回结构异常");
  if (raw.length === PER_PAGE) {
    console.warn(`仓库数达到 per_page=${PER_PAGE}，可能被截断（本脚本未实现分页）`);
  }

  const all = raw.map(toRepo);
  const kept = all.filter((r) => !IGNORE.has(r.name));

  const file = {
    platform: "github",
    username,
    // 只到日：同一天内重复构建产物完全一致，不会每次 build 都脏一个文件
    fetchedAt: new Date().toISOString().slice(0, 10),
    ignored: [...IGNORE].sort(), // 排序 → 输出与 Set 插入顺序无关，保持确定性
    repos: kept,
  };

  await mkdir(dirname(JSON_PATH), { recursive: true });
  await writeFile(JSON_PATH, `${JSON.stringify(file, null, 2)}\n`, "utf-8");
  // 不打印 description（含中文，Windows 控制台会乱码，纯噪音）
  console.log(`github 仓库已更新: ${kept.length}/${all.length} 个（忽略 ${IGNORE.size} 个）`);
}

try {
  await main();
} catch (err) {
  // 保留旧产物，读出来提示当前缓存的是什么
  let cached = "无缓存";
  try {
    cached = `${JSON.parse(await readFile(JSON_PATH, "utf-8")).repos.length} 个仓库`;
  } catch {}
  console.warn(`拉取 GitHub 仓库失败（${err.message}），沿用旧文件（当前: ${cached}）`);
}
