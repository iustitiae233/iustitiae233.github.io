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

export type FullTextEntry = SearchEntry & { text: string };
export type FullTextResult = SearchResult & {
  /** 正文命中时的上下文片段（原文切片，未 lower） */
  snippet?: string;
  /** match 在 snippet 内的偏移，供 <mark> 高亮 */
  snippetStart?: number;
  snippetLength?: number;
};

/** 全文过滤：标题命中排前（沿用 filterEntries 语义），正文命中次之。
 *  正文命中给 ±30 字符上下文；match 区间指向各自原文下标，切片高亮安全
 *  （toLowerCase 对中英文等长）。 */
export function filterEntriesFullText(
  entries: FullTextEntry[],
  query: string,
  limit = 8,
): FullTextResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const titleHits: FullTextResult[] = [];
  const bodyHits: FullTextResult[] = [];
  for (const e of entries) {
    const title = e.title.toLowerCase();
    const ti = title.indexOf(q);
    if (ti >= 0) {
      titleHits.push({ ...e, matchStart: ti, matchLength: q.length });
      continue;
    }
    const text = e.text.toLowerCase();
    const bi = text.indexOf(q);
    if (bi >= 0) {
      const start = Math.max(0, bi - 30);
      const end = Math.min(e.text.length, bi + q.length + 30);
      bodyHits.push({
        ...e,
        matchStart: bi,
        matchLength: q.length,
        snippet: e.text.slice(start, end),
        snippetStart: bi - start,
        snippetLength: q.length,
      });
    }
  }
  return [...titleHits, ...bodyHits].slice(0, limit);
}
