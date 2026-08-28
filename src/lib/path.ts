/** "/posts/hello-astro/" → "首页 / 文章 / hello-astro" */
export function formatPath(pathname: string): string {
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0) return "首页";
  if (segs[0] === "posts") return `首页 / 文章 / ${segs[1] ?? ""}`;
  return `首页 / ${segs[segs.length - 1]}`;
}
