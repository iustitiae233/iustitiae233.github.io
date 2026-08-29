import { getCollection, type CollectionEntry } from "astro:content";
import { filterPublished, sortPostsByDateDesc } from "./posts";

export type Post = CollectionEntry<"posts">;

/** 已发布文章（过滤草稿）按日期降序 —— 所有视图共用的唯一管道，避免各处规则漂移 */
export async function getPublishedPosts(): Promise<Post[]> {
  const all = await getCollection("posts");
  return sortPostsByDateDesc(filterPublished(all));
}
