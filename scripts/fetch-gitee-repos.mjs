// 拉取 Gitee 公开仓库清单，供 /projects/ 与首页项目预览使用（与 GitHub 侧互补）。
// 用法: node scripts/fetch-gitee-repos.mjs <username>
//
// 产物（提交进 git，离线构建不依赖网络）:
//   - src/data/gitee-repos.json
//
// 失败语义与 fetch-github-repos.mjs 完全一致：网络错误/限流时保留旧文件并退出 0
// —— 构建链不因 Gitee 不可达而挂；仅参数错误以非零退出。

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const JSON_PATH = join(ROOT, "src", "data", "gitee-repos.json");
const TIMEOUT_MS = 15_000;
const PER_PAGE = 100;

/** 不展示的仓库名（只作用于 Gitee 侧；GitHub 侧的名单在 fetch-github-repos.mjs）。
 *  同名跨平台的镜像不在这里处理 —— 合并与去重规则在 src/lib/projects.ts#mergeRepoFiles。 */
const IGNORE = new Set([
  "Notes",  // 个人技术笔记仓库，不在项目页展示
]);

const username = process.argv[2];
if (!username) {
  console.error("用法: node scripts/fetch-gitee-repos.mjs <gitee-username>");
  process.exit(1);
}

/** Gitee 的字段名与 GitHub v3 基本同形，个别字段有平台怪癖 —— 差异全部吸收在
 *  这一层，页面与 src/lib/projects.ts 不用动：
 *  - html_url 天生带 .git 后缀（是克隆地址不是网页地址），剥掉
 *  - 无描述时给的是 "" 而不是 null，`|| null` 归一 */
function toRepo(r) {
  return {
    platform: "gitee",
    name: r.name ?? r.path,
    fullName: r.full_name ?? null,
    url: typeof r.html_url === "string" ? r.html_url.replace(/\.git$/, "") : r.html_url,
    description: r.description || null,
    language: r.language ?? null,
    stars: r.stargazers_count ?? 0,
    forks: r.forks_count ?? 0,
    fork: r.fork === true,
    pushedAt: r.pushed_at ?? r.updated_at,
  };
}

async function main() {
  // 用户名可能是中文（个人空间地址），路径段必须编码。sort=pushed 只为让提交进
  // git 的文件本身可读 —— 展示顺序由 src/lib/projects.ts 决定（那里有 vitest）。
  const params = new URLSearchParams({
    type: "owner",
    sort: "pushed",
    direction: "desc",
    per_page: String(PER_PAGE),
  });
  // Gitee 私人令牌走 access_token 查询参数（v5 不支持 Authorization 头）。
  // 只发给 gitee.com 这一个主机；绝不 console.log(url) —— token 会进 CI 日志。
  const token = (process.env.GITEE_TOKEN || "").trim();
  if (token) params.set("access_token", token);

  const url =
    `https://gitee.com/api/v5/users/${encodeURIComponent(username)}/repos?${params}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Gitee API ${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw)) throw new Error("Gitee API 返回结构异常");
  if (raw.length === PER_PAGE) {
    console.warn(`仓库数达到 per_page=${PER_PAGE}，可能被截断（本脚本未实现分页）`);
  }

  const all = raw.map(toRepo);
  const kept = all.filter((r) => !IGNORE.has(r.name));

  const file = {
    platform: "gitee",
    username,
    // 只到日：同一天内重复构建产物完全一致，不会每次 build 都脏一个文件
    fetchedAt: new Date().toISOString().slice(0, 10),
    ignored: [...IGNORE].sort(), // 排序 → 输出与 Set 插入顺序无关，保持确定性
    repos: kept,
  };

  await mkdir(dirname(JSON_PATH), { recursive: true });
  await writeFile(JSON_PATH, `${JSON.stringify(file, null, 2)}\n`, "utf-8");
  // 不打印 description / username（含中文，Windows 控制台会乱码，纯噪音）
  console.log(`gitee 仓库已更新: ${kept.length}/${all.length} 个（忽略 ${IGNORE.size} 个）`);
}

try {
  await main();
} catch (err) {
  // 保留旧产物，读出来提示当前缓存的是什么
  let cached = "无缓存";
  try {
    cached = `${JSON.parse(await readFile(JSON_PATH, "utf-8")).repos.length} 个仓库`;
  } catch {}
  console.warn(`拉取 Gitee 仓库失败（${err.message}），沿用旧文件（当前: ${cached}）`);
}
