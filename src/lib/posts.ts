export interface PostLike {
  id: string;
  data: { pubDate: Date; draft?: boolean };
}

/** 草稿不进入任何公开视图（侧栏 / 首页 / 详情 / 上下篇共用同一规则） */
export function filterPublished<T extends PostLike>(posts: T[]): T[] {
  return posts.filter((p) => !p.data.draft);
}

/** 按发布日期降序；同日按 id 字典序升序保证稳定 */
export function sortPostsByDateDesc<T extends PostLike>(posts: T[]): T[] {
  return [...posts].sort((x, y) => {
    const dx = x.data.pubDate.getTime();
    const dy = y.data.pubDate.getTime();
    return dx !== dy ? dy - dx : x.id.localeCompare(y.id);
  });
}

/** newer = 日期更新的相邻文章（界面"上一篇"）；older = 更早的（"下一篇"） */
export function getAdjacentPosts<T extends PostLike>(
  sorted: T[],
  currentId: string,
): { newer: T | null; older: T | null } {
  const i = sorted.findIndex((p) => p.id === currentId);
  if (i === -1) return { newer: null, older: null };
  return {
    newer: i > 0 ? sorted[i - 1] : null,
    older: i < sorted.length - 1 ? sorted[i + 1] : null,
  };
}
