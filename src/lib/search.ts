export type SearchEntry = { title: string; url: string; kind: "post" | "note" };
export type SearchResult = SearchEntry & { matchStart: number; matchLength: number };

/** 按标题做大小写不敏感的子串过滤，保留索引顺序，截断至 limit 条。
 *  matchStart/matchLength 指向原文的下标（toLowerCase 对中英文等长，可安全切片高亮）。 */
export function filterEntries(entries: SearchEntry[], query: string, limit = 8): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: SearchResult[] = [];
  for (const e of entries) {
    const title = e.title.toLowerCase();
    const i = title.indexOf(q);
    if (i === -1) continue;
    out.push({ ...e, matchStart: i, matchLength: q.length });
    if (out.length >= limit) break;
  }
  return out;
}
