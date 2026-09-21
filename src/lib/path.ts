/** "/posts/neural-networks-llm-vision/" → "首页 / 文章 / neural-networks-llm-vision"；"/notes/embedded/mcu-gpio/" → "首页 / 笔记 / mcu-gpio" */
export function formatPath(pathname: string): string {
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0) return "首页";
  if (segs[0] === "posts") return `首页 / 文章 / ${segs[1] ?? ""}`;
  if (segs[0] === "notes")
    return segs.length === 1 ? "首页 / 笔记" : `首页 / 笔记 / ${segs[segs.length - 1]}`;
  // 定向补一条，不做通用标签表：/about/、/tags/ 等仍渲染原始段，
  // 通用映射会改掉既有行为并打破已有测试
  if (segs[0] === "projects") return "首页 / 项目";
  return `首页 / ${segs[segs.length - 1]}`;
}
