import { getCollection, type CollectionEntry } from "astro:content";
import { filterPublished, sortPostsByDateDesc } from "./posts";
import { buildBacklinkIndex, type BacklinkSource } from "./backlinks";

export type Post = CollectionEntry<"posts">;
export type Note = CollectionEntry<"notes">;

/** 已发布文章（过滤草稿）按日期降序 —— 所有视图共用的唯一管道，避免各处规则漂移 */
export async function getPublishedPosts(): Promise<Post[]> {
  const all = await getCollection("posts");
  return sortPostsByDateDesc(filterPublished(all));
}

/** 全部笔记按日期降序（笔记无草稿概念，但仍走同一过滤管道保持一致） */
export async function getAllNotes(): Promise<Note[]> {
  const all = await getCollection("notes");
  return sortPostsByDateDesc(filterPublished(all));
}

/** 反链索引：notes 详情页唯一入口（astro:content 只进本文件，纯逻辑在 lib/backlinks） */
export async function getBacklinkIndex(): Promise<Map<string, BacklinkSource[]>> {
  const notes = await getAllNotes();
  return buildBacklinkIndex(
    notes.map((n) => ({ id: n.id, title: n.data.title, body: n.body ?? "" })),
  );
}
