import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { NOTE_CATEGORY_VALUES } from "./lib/notes";

const posts = defineCollection({
  // 允许嵌套组织（如 2026/relaunch.md），id 含斜杠，由 posts/[...slug] rest 路由承接
  loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

const notes = defineCollection({
  // 嵌入式/硬件基础学习笔记，目录与分类对应（embedded/ hardware/），id 形如 embedded/mcu-gpio
  loader: glob({ pattern: "**/*.md", base: "./src/content/notes" }),
  schema: z.object({
    title: z.string(),
    description: z.string().default(""),
    pubDate: z.coerce.date(),
    category: z.enum(NOTE_CATEGORY_VALUES),
  }),
});

export const collections = { posts, notes };
