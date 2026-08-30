// 拉取 GitHub 个人信息用于侧栏品牌区联动。
// 用法: node scripts/fetch-github-profile.mjs <username>
//
// 产物（均提交进 git，离线构建不依赖网络）:
//   - public/images/github-avatar.(png|jpg|webp)  头像，按 content-type 定扩展名
//   - src/data/github-profile.json                { login, name, html_url, avatar }
//
// 失败语义：网络错误/限流时保留旧文件并退出码 0 —— 构建链不因 GitHub
// 不可达而挂（国内网络环境常见）；仅参数错误以非零退出。

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGES_DIR = join(ROOT, "public", "images");
const JSON_PATH = join(ROOT, "src", "data", "github-profile.json");
const TIMEOUT_MS = 15_000;
const AVATAR_SIZE = 128; // 侧栏显示 40px，留 2x 余量

const EXT_BY_TYPE = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

const username = process.argv[2];
if (!username) {
  console.error("用法: node scripts/fetch-github-profile.mjs <github-username>");
  process.exit(1);
}

async function main() {
  const headers = {
    // GitHub API 要求 User-Agent，否则 403
    "User-Agent": "blog-profile-fetch",
    Accept: "application/vnd.github+json",
  };

  const res = await fetch(`https://api.github.com/users/${username}`, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const { login, name, html_url, avatar_url } = await res.json();

  // avatar_url 形如 https://avatars.githubusercontent.com/u/xxx?v=4，追加尺寸参数
  const avatarRes = await fetch(`${avatar_url}&s=${AVATAR_SIZE}`, {
    headers: { "User-Agent": "blog-profile-fetch" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!avatarRes.ok) throw new Error(`头像下载 ${avatarRes.status}`);
  const ext = EXT_BY_TYPE[avatarRes.headers.get("content-type")?.split(";")[0]] ?? "png";

  await mkdir(IMAGES_DIR, { recursive: true });
  const avatarPath = join(IMAGES_DIR, `github-avatar.${ext}`);
  await writeFile(avatarPath, Buffer.from(await avatarRes.arrayBuffer()));

  // 清掉其它扩展名的旧头像，保证 img src 唯一指向 JSON 里记录的文件
  for (const f of await readdir(IMAGES_DIR)) {
    if (f.startsWith("github-avatar.") && f !== `github-avatar.${ext}`) {
      await rm(join(IMAGES_DIR, f));
    }
  }

  await mkdir(dirname(JSON_PATH), { recursive: true });
  const profile = {
    login,
    name: name ?? login, // 该账号未设昵称时回退 login
    html_url,
    avatar: `/images/github-avatar.${ext}`,
  };
  await writeFile(JSON_PATH, `${JSON.stringify(profile, null, 2)}\n`, "utf-8");
  console.log(`github profile 已更新: ${login} (${profile.name}) -> ${profile.avatar}`);
}

try {
  await main();
} catch (err) {
  // 保留旧产物，读出来提示当前缓存的是谁
  let cached = "无缓存";
  try {
    cached = JSON.parse(await readFile(JSON_PATH, "utf-8")).login;
  } catch {}
  console.warn(`拉取 GitHub profile 失败（${err.message}），沿用旧文件（当前: ${cached}）`);
}
