// 两个抓取脚本共用的请求头（本仓老坑：同一套规则写两遍必然漂移）。
// 注意：绝不 console.log(headers) —— token 会进 CI 日志。

const UA = "blog-build-fetch";
const TOKEN_HOST = "api.github.com";

/**
 * GITHUB_TOKEN（CI 注入）/ GH_TOKEN（本地 gh CLI 用户常见）存在时带上，
 * 把匿名配额从 60 次/小时提到 5000 次/小时；缺失或空串时静默退回匿名，
 * 本地无 token 也能构建。
 *
 * token 只发给 api.github.com —— 头像在 avatars.githubusercontent.com 是另一台
 * 主机，凭证不跨主机送，所以 host 判断写在这里，而不是交给调用方记得。
 */
export function githubHeaders(url, accept = "application/vnd.github+json") {
  const headers = { "User-Agent": UA, Accept: accept };
  const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  if (token && new URL(url).hostname === TOKEN_HOST) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}
