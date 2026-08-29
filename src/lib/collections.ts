import { getCollection, type CollectionEntry } from "astro:content";
import { filterPublished, sortPostsByDateDesc } from "./posts";

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
