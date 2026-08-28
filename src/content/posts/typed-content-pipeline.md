---
title: 用 Zod 给 Markdown 上保险：类型安全的内容管线
description: frontmatter 写错字段时让构建当场失败，而不是线上白屏。
pubDate: 2026-08-25
draft: true
---

静态博客最隐蔽的故障源不是 CSS，是 frontmatter：
一个拼错的字段名，构建照常通过，页面上默默少一块内容。

## 契约先行

给内容集合声明 schema，等于给每篇 markdown 发了张"身份证"：

```ts
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts };
```

几个字段设计的小心思：

- `z.coerce.date()`：`2026-08-25` 字符串自动转 Date 对象
- `.optional()`：更新时间可以没有
- `.default(false)`：草稿标记缺省为正式发布

## 失败即成功

写下这行 frontmatter：

```yaml
pubDate: not-a-date
```

构建立刻失败，错误信息精确到文件与字段。
这就是"构建即测试"—— 内容回归不需要单独的测试套件，
每次 `astro build` 都是全量校验。

1. 缺字段 → 构建失败
2. 类型错误 → 构建失败
3. 全部合法 → 类型安全的数据流入页面

从此外界输入（人写的 markdown）和程序逻辑之间，
有了一条编译器亲自站岗的边界。
