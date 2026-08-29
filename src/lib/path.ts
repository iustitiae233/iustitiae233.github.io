/** "/posts/hello-astro/" → "首页 / 文章 / hello-astro"；"/notes/embedded/mcu-gpio/" → "首页 / 笔记 / mcu-gpio" */
export function formatPath(pathname: string): string {
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0) return "首页";
  if (segs[0] === "posts") return `首页 / 文章 / ${segs[1] ?? ""}`;
  if (segs[0] === "notes")
    return segs.length === 1 ? "首页 / 笔记" : `首页 / 笔记 / ${segs[segs.length - 1]}`;
  return `首页 / ${segs[segs.length - 1]}`;
}
