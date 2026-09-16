/** 标签聚合。纯逻辑（无 astro:content），vitest 直接可测。 */

export interface TagLike {
  id: string;
  data: { tags: string[] };
}

export interface TagCount {
  tag: string;
  count: number;
}

/** 全部标签计数。大小写不敏感合并（key 取小写），展示保留首次出现的原始写法。
 *  排序确定性：count 降序，同 count 按字典序（code unit 比较稳定跨平台）。
 *  空串标签（脏数据）静默跳过。 */
export function collectTags(notes: TagLike[]): TagCount[] {
  const counts = new Map<string, TagCount>();
  for (const n of notes) {
    for (const raw of n.data.tags) {
      const tag = raw.trim();
      if (!tag) continue;
      const key = tag.toLowerCase();
      const hit = counts.get(key);
      if (hit) hit.count++;
      else counts.set(key, { tag, count: 1 });
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0),
  );
}

/** 带某标签的笔记，保持传入顺序（上层已按日期降序）。
 *  匹配做 trim + 大小写不敏感（手写标签大小写漂移容错），URL/展示用规范化的 counts key。 */
export function notesWithTag<T extends TagLike>(notes: T[], tag: string): T[] {
  const key = tag.trim().toLowerCase();
  return notes.filter((n) =>
    n.data.tags.some((t) => t.trim().toLowerCase() === key),
  );
}

/** 标签页 URL：中文等非 ASCII 标签 encodeURIComponent，尾斜杠保持站内约定 */
export function tagUrl(tag: string): string {
  return `/tags/${encodeURIComponent(tag)}/`;
}
