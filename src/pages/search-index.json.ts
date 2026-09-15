import type { APIRoute } from "astro";
import { getPublishedPosts, getAllNotes } from "../lib/collections";
import { markdownToPlainText } from "../lib/plaintext";
import type { FullTextEntry } from "../lib/search";

export const prerender = true;

/** 全文搜索索引端点：build 产出 /search-index.json（约 300KB / gzip ~80KB）。
 *  与内联标题索引（首屏零等待）组成双层结构——全文索引由客户端首次搜索时
 *  按需 fetch。走 filterPublished 同一管道，草稿永不进索引。
 *  单篇 text cap 20000 字符，纯防御（当前最大笔记远不及）。 */

const TEXT_CAP = 20000;

export const GET: APIRoute = async () => {
  const entries: FullTextEntry[] = [
    ...(await getPublishedPosts()).map((p) => ({
      title: p.data.title,
      url: `/posts/${p.id}/`,
      kind: "post" as const,
      text: markdownToPlainText(p.body ?? "").slice(0, TEXT_CAP),
    })),
    ...(await getAllNotes()).map((n) => ({
      title: n.data.title,
      url: `/notes/${n.id}/`,
      kind: "note" as const,
      text: markdownToPlainText(n.body ?? "").slice(0, TEXT_CAP),
    })),
  ];
  return new Response(JSON.stringify(entries), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
