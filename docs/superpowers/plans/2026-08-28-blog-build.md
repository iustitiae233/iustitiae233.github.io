# Astro 7 暗色科技风博客 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建零 JS 基线、View Transitions 动画、Zod 内容契约、暗色科技风的极致流畅个人博客。

**Architecture:** Astro 7 静态站（SSG）。Markdown 经 Content Layer（glob loader + Zod schema）构建期校验后预渲染为纯静态 HTML；全站仅搜索/代码复制/主题切换三处水合，其余交互用 IntersectionObserver + CSS 实现。

**Tech Stack:** Astro 7 · TypeScript (strict) · 原生 CSS（设计令牌变量体系） · pagefind · Shiki（Astro 内置）· Vitest · GitHub Actions

**Spec:** `docs/superpowers/specs/2026-08-28-blog-design.md`

## Global Constraints

- Node 24，包管理器用 **npm**（pnpm 不可用）
- TypeScript `strict: true`
- **不引入任何 UI 框架**（React/Vue/Svelte 均不用），交互用 `.astro` 组件 + 原生 TS
- **所有动画只碰 `transform`/`opacity`**，禁止动画 `width/top/margin` 等 layout 属性
- `prefers-reduced-motion: reduce` 下所有动画降级为瞬时
- 系统字体栈：`system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`，零 webfont 请求
- 站点文案为中文；代码注释密度低、只在非直观处注释（与示例一致）
- 视觉基调：暗色为默认（`data-theme="dark"`），深蓝黑基底 + 雾氖青紫强调 + 玻璃拟态侧栏
- 涉及 UI 视觉的任务（Task 2、8、9、10、12、13）开工前先调用 **frontend-design** 技能获取设计指导
- 每个 Task 结束必须 git commit；提交信息用约定式（feat:/test:/chore:/docs:）

---

### Task 1: 项目脚手架与工具链

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `.gitignore`, `src/pages/index.astro`（脚手架生成后替换）
- Modify: `tsconfig.json`（设 strict）

**Interfaces:**
- Consumes: 无
- Produces: 可运行的 Astro 7 项目；`npm run dev`（开发）、`npm run build`（构建）、`npm run preview`（预览）、`npm run check`（类型检查）四个脚本供所有后续任务使用

- [ ] **Step 1: 脚手架初始化**

```bash
cd /e/Blog
npm create astro@latest . -- --template minimal --no-install --no-git --yes
npm install
npm install -D @astrojs/check typescript vitest
```

注意：`npm create astro` 对非空目录（docs/ 已存在）可能询问，选继续。若 `--yes` 标志不被识别，交互式选择：Empty template → strict TypeScript → 装依赖。

- [ ] **Step 2: 确认 tsconfig 严格模式**

`tsconfig.json` 应 extends `astro/tsconfigs/strict`（minimal 模板默认即 strict；若为 base 则改为）：

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 3: 配置 astro.config.mjs**

```js
// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://example.com",
  markdown: {
    shikiConfig: {
      theme: "one-dark-pro",
      wrap: true,
    },
  },
});
```

- [ ] **Step 4: 确认 .gitignore 覆盖 node_modules/dist**

脚手架生成的 `.gitignore` 已含 `node_modules/`、`dist/`、`.astro/`，逐一确认，缺则补。

- [ ] **Step 5: 验证 dev server 启动**

Run: `npm run dev`（后台启动后 curl http://localhost:4321/ 或看终端输出 "ready"）
Expected: 服务启动无报错。随后 Ctrl+C 停止。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: Astro 7 脚手架（strict TS + Shiki 配置）"
```

---

### Task 2: 设计令牌与全局样式

**Files:**
- Create: `src/styles/global.css`
- Modify: `src/pages/index.astro`（临时引入验证）

**Interfaces:**
- Consumes: 无
- Produces: 全部 CSS 自定义属性（设计令牌），后续所有组件引用。关键令牌命名（后续任务的 CSS 必须使用这些名字）：

```css
/* 色彩 */
--bg: 页面基底 | --bg-elevated: 侧栏/卡片基底
--surface: 卡片表面 | --border: 边框 | --border-strong
--text-1/2/3: 三级文字
--accent: 雾氖青 (约 #22d3ee 系) | --accent-2: 雾氖紫 (约 #a78bfa 系) | --accent-glow: 辉光色
/* 尺寸 */
--sidebar-w: 280px | --content-max: 72rem | --radius-sm/md/lg
/* 动效 */
--ease-spring: 弹簧缓动 | --ease-out: cubic-bezier(0.16,1,0.3,1) | --t-fast: 150ms | --t-med: 250ms
```

- [ ] **Step 1: 调用 frontend-design 技能**

调用 Skill 工具：`frontend-design`，args 说明要做暗色科技风博客设计令牌。按其指导落实本任务。

- [ ] **Step 2: 写 global.css**

```css
/* ========== 设计令牌 ========== */
:root {
  /* 暗色为默认（无 data-theme 或 =dark 时生效） */
  --bg: #0a0e1a;
  --bg-elevated: rgba(16, 22, 38, 0.72);
  --surface: #111726;
  --border: rgba(148, 163, 184, 0.12);
  --border-strong: rgba(148, 163, 184, 0.25);
  --text-1: #e6edf7;
  --text-2: #9aa7bd;
  --text-3: #5d6b84;
  --accent: #22d3ee;
  --accent-2: #a78bfa;
  --accent-glow: rgba(34, 211, 238, 0.25);

  --sidebar-w: 280px;
  --content-max: 72rem;
  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 18px;

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 12.9%, 0.938 16.7%, 1.017 19%, 1.058 21%, 1.099 23.5%, 1.11 25.5%, 1.101 27.6%, 1.064 30.9%, 1.023 33.8%, 0.992 36.9%, 0.967 40%, 0.956 43%, 0.955 46.1%, 0.963 49.3%, 0.978 52.6%, 0.997 56.1%, 1.005 58.9%, 1.007 61.9%, 1.002 65.5%, 0.994 69.2%, 0.991 72.8%, 0.997 77%, 1.006 81.2%, 1.013 85.4%, 1.009 91%, 1.004 96.8%, 1);
  --t-fast: 150ms;
  --t-med: 250ms;
}

[data-theme="light"] {
  --bg: #f6f8fc;
  --bg-elevated: rgba(255, 255, 255, 0.8);
  --surface: #ffffff;
  --border: rgba(15, 23, 42, 0.1);
  --border-strong: rgba(15, 23, 42, 0.2);
  --text-1: #16213a;
  --text-2: #4a5875;
  --text-3: #8391a8;
  --accent: #0891b2;
  --accent-2: #7c3aed;
  --accent-glow: rgba(8, 145, 178, 0.18);
}

/* ========== 重置与基底 ========== */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
}

html {
  color-scheme: dark;
  scroll-behavior: smooth;
}
[data-theme="light"] { color-scheme: light; }

body {
  font-family: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  background: var(--bg);
  color: var(--text-1);
  line-height: 1.75;
  -webkit-font-smoothing: antialiased;
  min-height: 100dvh;
}

img { max-width: 100%; height: auto; display: block; }

a {
  color: var(--accent);
  text-decoration: none;
  transition: color var(--t-fast) var(--ease-out);
}
a:hover { color: var(--accent-2); }

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

::selection { background: var(--accent-glow); }
```

补充说明：hero 雾氖光斑、玻璃拟态等装饰样式在具体组件任务中以其令牌实现。

- [ ] **Step 3: 验证令牌生效**

临时在 `src/pages/index.astro` 的 frontmatter 加 `import "../styles/global.css";`，body 写一行 "token test"。
Run: `npm run dev`
Expected: 浏览器暗色基底 + 浅灰文字。（视觉验证后保留此 import，后续任务重写页面内容。）

- [ ] **Step 4: Commit**

```bash
git add src/styles/global.css src/pages/index.astro
git commit -m "feat: 设计令牌体系（暗色默认 + 亮色主题 + 动效令牌）"
```

---

### Task 3: 阅读时长纯函数（TDD）

**Files:**
- Create: `src/lib/reading-time.ts`
- Test: `src/lib/reading-time.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `estimateReadingTime(text: string): { minutes: number; label: string }` —— Task 10 的 PostLayout 使用

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest";
import { estimateReadingTime } from "./reading-time";

describe("estimateReadingTime", () => {
  it("纯中文按每分钟 300 字估算", () => {
    expect(estimateReadingTime("字".repeat(600)).minutes).toBe(2);
  });

  it("纯英文按每分钟 200 词估算", () => {
    expect(estimateReadingTime("word ".repeat(400)).minutes).toBe(2);
  });

  it("中英混合分别累计", () => {
    expect(estimateReadingTime("字".repeat(300) + "word ".repeat(200)).minutes).toBe(2);
  });

  it("空文本至少 1 分钟", () => {
    expect(estimateReadingTime("").minutes).toBe(1);
  });

  it("label 含分钟中文", () => {
    expect(estimateReadingTime("测试").label).toMatch(/1 分钟/);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/reading-time.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 最小实现**

```ts
export interface ReadingTime {
  minutes: number;
  label: string;
}

/** 中文按 ~300 字/分钟，英文按 ~200 词/分钟，混合累计，下限 1 分钟 */
export function estimateReadingTime(text: string): ReadingTime {
  const cjk = (text.match(/[一-鿿㐀-䶿]/g) ?? []).length;
  const words = (text.match(/[a-zA-Z]+/g) ?? []).length;
  const minutes = Math.max(1, Math.round(cjk / 300 + words / 200));
  return { minutes, label: `${minutes} 分钟` };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/reading-time.test.ts`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/reading-time.ts src/lib/reading-time.test.ts
git commit -m "feat: 阅读时长估算（中英混合算法 + 单测）"
```

---

### Task 4: 文章排序与相邻导航纯函数（TDD）

**Files:**
- Create: `src/lib/posts.ts`
- Test: `src/lib/posts.test.ts`

**Interfaces:**
- Consumes: `CollectionEntry<"posts">`（astro:content 类型，Task 6 定义集合后生效；本任务用结构兼容的本地类型测试）
- Produces（Task 9、10 使用）:

```ts
type PostLike = { slug: string; data: { pubDate: Date; draft: boolean } };
sortPostsByDateDesc(posts: PostLike[]): PostLike[]
getAdjacentPosts(sorted: PostLike[], currentSlug: string): { newer: PostLike | null; older: PostLike | null }
```

语义约定：`newer` = 发布日期比当前文章**新**的那篇（界面上显示为"上一篇"）；`older` = 更早的（"下一篇"）。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest";
import { getAdjacentPosts, sortPostsByDateDesc } from "./posts";

const d = (s: string) => new Date(s);
const posts = [
  { slug: "b", data: { pubDate: d("2026-02-01"), draft: false } },
  { slug: "a", data: { pubDate: d("2026-03-01"), draft: false } },
  { slug: "c", data: { pubDate: d("2026-01-01"), draft: false } },
];

describe("sortPostsByDateDesc", () => {
  it("按日期降序", () => {
    expect(sortPostsByDateDesc(posts).map((p) => p.slug)).toEqual(["a", "b", "c"]);
  });
  it("同日按 slug 稳定排序", () => {
    const same = [
      { slug: "z", data: { pubDate: d("2026-01-01"), draft: false } },
      { slug: "y", data: { pubDate: d("2026-01-01"), draft: false } },
    ];
    expect(sortPostsByDateDesc(same).map((p) => p.slug)).toEqual(["y", "z"]);
  });
});

describe("getAdjacentPosts", () => {
  const sorted = sortPostsByDateDesc(posts);
  it("中间文章：newer 是更新的，older 是更早的", () => {
    expect(getAdjacentPosts(sorted, "b")).toEqual({
      newer: sorted[0],
      older: sorted[2],
    });
  });
  it("最新文章没有 newer", () => {
    expect(getAdjacentPosts(sorted, "a").newer).toBeNull();
  });
  it("最旧文章没有 older", () => {
    expect(getAdjacentPosts(sorted, "c").older).toBeNull();
  });
  it("slug 不存在时两端为 null", () => {
    expect(getAdjacentPosts(sorted, "nope")).toEqual({ newer: null, older: null });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/posts.test.ts`
Expected: FAIL

- [ ] **Step 3: 最小实现**

```ts
export interface PostLike {
  slug: string;
  data: { pubDate: Date; draft: boolean };
}

/** 按发布日期降序；同日按 slug 字典序升序保证稳定 */
export function sortPostsByDateDesc<T extends PostLike>(posts: T[]): T[] {
  return [...posts].sort((x, y) => {
    const dx = x.data.pubDate.getTime();
    const dy = y.data.pubDate.getTime();
    return dx !== dy ? dy - dx : x.slug.localeCompare(y.slug);
  });
}

/** newer = 日期更新的相邻文章（界面"上一篇"）；older = 更早的（"下一篇"） */
export function getAdjacentPosts<T extends PostLike>(
  sorted: T[],
  currentSlug: string,
): { newer: T | null; older: T | null } {
  const i = sorted.findIndex((p) => p.slug === currentSlug);
  if (i === -1) return { newer: null, older: null };
  return {
    newer: i > 0 ? sorted[i - 1] : null,
    older: i < sorted.length - 1 ? sorted[i + 1] : null,
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/posts.test.ts`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/posts.ts src/lib/posts.test.ts
git commit -m "feat: 文章排序与相邻导航计算（纯函数 + 单测）"
```

---

### Task 5: 日期格式化纯函数（TDD）

**Files:**
- Create: `src/lib/format.ts`
- Test: `src/lib/format.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `formatDate(date: Date): string`（如 `"2026 年 8 月 28 日"`）—— Task 9、10 使用

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest";
import { formatDate } from "./format";

describe("formatDate", () => {
  it("输出中文年月日", () => {
    expect(formatDate(new Date(2026, 7, 28))).toBe("2026 年 8 月 28 日");
  });
  it("个位月日不补零", () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe("2026 年 1 月 5 日");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/format.test.ts`
Expected: FAIL

- [ ] **Step 3: 最小实现**

```ts
/** 中文格式：2026 年 8 月 28 日（个位不补零） */
export function formatDate(date: Date): string {
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/format.test.ts`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "feat: 中文日期格式化（纯函数 + 单测）"
```

---

### Task 6: 内容契约与示例文章

**Files:**
- Create: `src/content.config.ts`, `src/content/posts/hello-astro.md`, `src/content/posts/css-scroll-animations.md`, `src/content/posts/typed-content-pipeline.md`

**Interfaces:**
- Consumes: 无
- Produces: `posts` 内容集合（Task 9、10 通过 `getCollection("posts")` 消费；frontmatter 字段：`title/description/pubDate/updatedDate?/heroImage?/draft`）。`getStaticPaths` 用 `post.id` 作为 URL slug（glob loader 的 id 即去扩展名文件名）。

- [ ] **Step 1: 写内容契约**

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
    heroImage: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts };
```

注：Astro 7 若将 `astro/loaders` 移至别处（如 `astro:content` 导出 glob），以官方报错提示为准调整 import。

- [ ] **Step 2: 写 3 篇示例文章**

`src/content/posts/hello-astro.md`：

```md
---
title: 你好，Astro：我为什么用它搭博客
description: 从零 JS 基线聊到岛屿架构，记录这次博客技术选型的思考过程。
pubDate: 2026-08-10
---

正文要求（每篇 400-800 字，覆盖不同 Markdown 元素便于排版测试）：

- 本篇覆盖：各级标题（##/###）、无序+有序列表、**加粗**/*斜体*/`行内代码`、
  [链接](https://docs.astro.build)、> 引用块、分隔线 ---
- 包含一个 ```js 代码块（约 10 行，展示 Shiki 高亮与复制按钮）
- 结尾一段总结

`src/content/posts/css-scroll-animations.md`：

```md
---
title: CSS 滚动驱动动画：不写 JS 的进度条与视差
description: animation-timeline 实战，以及为什么它天生符合 GPU 合成层铁律。
pubDate: 2026-08-18
heroImage: /images/hero-css.jpg
updatedDate: 2026-08-20
---

- 覆盖：一个 ```css 代码块（scroll-driven animation 示例）、表格（| 语法，2 列 4 行，
  测 prose 表格样式）、脚注式的附注段落
- heroImage 指向 `public/images/hero-css.jpg`（下一步放置一张 1200x630 占位图）

`src/content/posts/typed-content-pipeline.md`：

```md
---
title: 用 Zod 给 Markdown 上保险：类型安全的内容管线
description: frontmatter 写错字段时让构建当场失败，而不是线上白屏。
pubDate: 2026-08-25
draft: true
---

- 覆盖：一个 ```ts 代码块（zod schema 示例）、嵌套列表、行内图片语法
- `draft: true`：用于验证生产构建排除草稿（验收用，最后保留）
```

- [ ] **Step 3: 放置 hero 占位图**

创建 `public/images/hero-css.jpg`：用任意工具生成/复制一张 1200×630 的深色渐变 JPG（或临时从系统壁纸截取）。仅供图片管线测试。

- [ ] **Step 4: 验证契约生效（反向测试）**

临时把 `hello-astro.md` 的 `pubDate` 改为 `not-a-date`：
Run: `npm run build`
Expected: 构建失败，错误信息指向该文件与字段。改回 `2026-08-10` 后构建成功且 3 个页面生成（draft 文章被排除——若 Astro 默认不排除 draft，在 Task 9 的 getCollection 回调里过滤 `data.draft !== true`）。

- [ ] **Step 5: Commit**

```bash
git add src/content.config.ts src/content/posts public/images
git commit -m "feat: 内容契约（Zod schema）+ 3 篇覆盖性示例文章"
```

---

### Task 7: BaseLayout 与无闪烁主题

**Files:**
- Create: `src/layouts/BaseLayout.astro`, `src/components/ThemeToggle.astro`
- Modify: `src/pages/index.astro`（改用 BaseLayout）

**Interfaces:**
- Consumes: `global.css`（Task 2）
- Produces: `BaseLayout` props `{ title: string; description: string }`（Task 9、10、13 使用）；主题脚本读写 `localStorage("theme")` 与 `document.documentElement.dataset.theme`（Task 8 的 ThemeToggle 复用同一协议）

- [ ] **Step 1: 写 BaseLayout.astro**

```astro
---
import "../styles/global.css";
import { ClientRouter } from "astro:transitions";

interface Props {
  title: string;
  description: string;
}

const { title, description } = Astro.props;
---

<!doctype html>
<html lang="zh-CN" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <script is:inline>
      const stored = localStorage.getItem("theme");
      const theme =
        stored ??
        (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
      document.documentElement.dataset.theme = theme;
    </script>
    <ClientRouter />
  </head>
  <body>
    <slot />
  </body>
</html>
```

注：Astro 7 中 ClientRouter 的导入路径以官方文档为准（`astro:transitions`），报错则按提示修正。

- [ ] **Step 2: 写 ThemeToggle.astro（圆形扩散切换）**

```astro
---
// 纯内联脚本，非岛屿 —— 零水合成本
---

<button id="theme-toggle" type="button" aria-label="切换亮暗主题" title="切换主题">
  <svg class="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
  </svg>
  <svg class="icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
  </svg>
</button>

<style>
  #theme-toggle {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-2);
    cursor: pointer;
    transition: color var(--t-fast) var(--ease-out), border-color var(--t-fast) var(--ease-out),
      transform var(--t-fast) var(--ease-out);
  }
  #theme-toggle:hover { color: var(--accent); border-color: var(--border-strong); }
  #theme-toggle:active { transform: scale(0.92); }

  :global([data-theme="dark"]) .icon-sun { display: none; }
  :global([data-theme="dark"]) .icon-moon { display: block; }
  :global([data-theme="light"]) .icon-sun { display: block; }
  :global([data-theme="light"]) .icon-moon { display: none; }
</style>

<script>
  const btn = document.getElementById("theme-toggle");
  btn?.addEventListener("click", (event) => {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { ready: Promise<void> };
    };
    if (!doc.startViewTransition || reduced) {
      root.dataset.theme = next;
      localStorage.setItem("theme", next);
      return;
    }
    const x = (event as MouseEvent).clientX;
    const y = (event as MouseEvent).clientY;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = doc.startViewTransition(() => {
      root.dataset.theme = next;
      localStorage.setItem("theme", next);
    });
    vt.ready.then(() => {
      root.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${r}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 500,
          easing: "ease-in-out",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    });
  });
</script>
```

配套：在 `global.css` 末尾追加（theme 扩散转场需要关闭默认新旧行为）：

```css
/* 主题圆形扩散转场 */
::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
}
```

- [ ] **Step 3: index.astro 改用 BaseLayout 并放置 ThemeToggle 验证**

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
import ThemeToggle from "../components/ThemeToggle.astro";
---

<BaseLayout title="测试" description="测试">
  <ThemeToggle />
</BaseLayout>
```

Run: `npm run dev`
Expected: 点击按钮主题切换有圆形扩散动画；刷新后主题保持；查看源码确认 `<head>` 内联脚本位于样式之前（无闪烁）。

- [ ] **Step 4: Commit**

```bash
git add src/layouts src/components/ThemeToggle.astro src/styles/global.css src/pages/index.astro
git commit -m "feat: BaseLayout（无闪烁主题 + ClientRouter）与圆形扩散切换"
```

---

### Task 8: Sidebar 与 Topbar

**Files:**
- Create: `src/components/Sidebar.astro`, `src/components/Topbar.astro`, `src/components/MenuButton.astro`
- Modify: `src/layouts/BaseLayout.astro`（组装双栏骨架）

**Interfaces:**
- Consumes: 设计令牌（Task 2）、ThemeToggle（Task 7）
- Produces: 全站布局骨架 `<div class="app-shell">`（侧栏 + 主区）；侧栏导航数据结构：

```ts
const nav = [
  { href: "/", label: "首页" },
  { href: "/about", label: "关于" },
];
```

文章导航分组由 Task 9 的首页改造后回填（Sidebar 接受 `Props { posts: { slug: string; title: string }[] }`，BaseLayout 用 getCollection 传入）。

- [ ] **Step 1: 调用 frontend-design 技能获取侧栏设计指导**

- [ ] **Step 2: 写 Sidebar.astro**

```astro
---
import ThemeToggle from "./ThemeToggle.astro";

interface Props {
  posts: { slug: string; title: string }[];
}
const { posts } = Astro.props;

const nav = [
  { href: "/", label: "首页" },
  { href: "/about", label: "关于" },
];
const current = Astro.url.pathname;

function isActive(href: string): boolean {
  if (href === "/") return current === "/";
  return current === href || current.startsWith(href + "/");
}
---

<transition:persist>
  <aside class="sidebar" id="sidebar" aria-label="站点导航">
    <a class="brand" href="/">
      <span class="brand-mark">博</span>
      <span class="brand-name">我的博客</span>
    </a>

    <nav>
      <ul class="nav-list">
        {nav.map((item) => (
          <li>
            <a
              href={item.href}
              class:list={["nav-link", { active: isActive(item.href) }]}
              aria-current={isActive(item.href) ? "page" : undefined}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>

    {posts.length > 0 && (
      <div class="posts-group">
        <p class="group-title">文章</p>
        <ul class="nav-list">
          {posts.map((p) => (
            <li>
              <a
                href={`/posts/${p.slug}/`}
                class:list={["nav-link", "sub", { active: current === `/posts/${p.slug}/` }]}
              >
                {p.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    )}

    <div class="sidebar-footer">
      <ThemeToggle />
    </div>
  </aside>
</transition:persist>

<style>
  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: var(--sidebar-w);
    display: flex;
    flex-direction: column;
    padding: 1.5rem 1.25rem;
    background: var(--bg-elevated);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-right: 1px solid var(--border);
    overflow-y: auto;
    z-index: 40;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--text-1);
    margin-bottom: 2rem;
  }
  .brand:hover { color: var(--text-1); }
  .brand-mark {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    color: #0a0e1a;
    font-weight: 700;
    box-shadow: 0 0 24px var(--accent-glow);
  }

  .nav-list {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 2px;
  }

  .nav-link {
    position: relative;
    display: block;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-sm);
    color: var(--text-2);
    font-size: 0.95rem;
    transition: color var(--t-fast) var(--ease-out), background-color var(--t-fast) var(--ease-out),
      transform var(--t-fast) var(--ease-spring);
  }
  .nav-link:hover {
    color: var(--text-1);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    transform: translateX(3px);
  }
  .nav-link.active {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    font-weight: 600;
  }
  .nav-link.active::before {
    content: "";
    position: absolute;
    left: 0;
    top: 20%;
    bottom: 20%;
    width: 3px;
    border-radius: 2px;
    background: linear-gradient(var(--accent), var(--accent-2));
  }
  .nav-link.sub { font-size: 0.875rem; padding-block: 0.375rem; }

  .group-title {
    margin: 1.5rem 0 0.5rem 0.75rem;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    color: var(--text-3);
  }

  .sidebar-footer {
    margin-top: auto;
    padding-top: 1.5rem;
    display: flex;
    align-items: center;
  }

  /* 移动端抽屉 */
  @media (max-width: 1023px) {
    .sidebar {
      transform: translateX(-100%);
      transition: transform var(--t-med) var(--ease-spring);
      box-shadow: none;
    }
    .sidebar.open {
      transform: translateX(0);
      box-shadow: 0 0 60px rgba(0, 0, 0, 0.5);
    }
  }
</style>
```

- [ ] **Step 3: 写 MenuButton.astro（移动端）与 Topbar.astro**

`MenuButton.astro`：

```astro
<button id="menu-btn" type="button" aria-label="打开导航菜单" aria-controls="sidebar" aria-expanded="false">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
</button>

<style>
  #menu-btn {
    display: none;
    place-items: center;
    width: 38px;
    height: 38px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    color: var(--text-2);
    cursor: pointer;
  }
  @media (max-width: 1023px) {
    #menu-btn { display: grid; }
  }
</style>

<script>
  const btn = document.getElementById("menu-btn");
  const sidebar = document.getElementById("sidebar");
  btn?.addEventListener("click", () => {
    const open = sidebar?.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(Boolean(open)));
  });
  // 点击抽屉外区域关闭
  document.addEventListener("click", (e) => {
    if (
      sidebar?.classList.contains("open") &&
      !sidebar.contains(e.target as Node) &&
      !btn?.contains(e.target as Node)
    ) {
      sidebar.classList.remove("open");
      btn?.setAttribute("aria-expanded", "false");
    }
  });
  // Esc 关闭
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      sidebar?.classList.remove("open");
      btn?.setAttribute("aria-expanded", "false");
    }
  });
</script>
```

`Topbar.astro`：

```astro
---
import MenuButton from "./MenuButton.astro";
import { formatPath } from "../lib/path";
---

<header class="topbar">
  <MenuButton />
  <p class="breadcrumb">{formatPath(Astro.url.pathname)}</p>
  <a class="search-entry" href="#search" data-search-open>
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
    <span>搜索</span>
    <kbd>⌘K</kbd>
  </a>
</header>

<style>
  .topbar {
    position: sticky;
    top: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1.5rem;
    background: color-mix(in srgb, var(--bg) 75%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
  }
  .breadcrumb {
    color: var(--text-3);
    font-size: 0.85rem;
  }
  .search-entry {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--text-3);
    font-size: 0.85rem;
    transition: color var(--t-fast) var(--ease-out), border-color var(--t-fast) var(--ease-out);
  }
  .search-entry:hover { color: var(--text-2); border-color: var(--border-strong); }
  kbd {
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.7rem;
    font-family: inherit;
  }
</style>
```

- [ ] **Step 4: path 纯函数（breadcrumb 用，随本任务 TDD）**

`src/lib/path.ts`：

```ts
/** "/posts/hello-astro/" → "首页 / 文章 / hello-astro" */
export function formatPath(pathname: string): string {
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0) return "首页";
  if (segs[0] === "posts") return `首页 / 文章 / ${segs[1] ?? ""}`;
  return `首页 / ${segs[segs.length - 1]}`;
}
```

`src/lib/path.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { formatPath } from "./path";

describe("formatPath", () => {
  it("根路径", () => {
    expect(formatPath("/")).toBe("首页");
  });
  it("文章页", () => {
    expect(formatPath("/posts/hello-astro/")).toBe("首页 / 文章 / hello-astro");
  });
  it("关于页", () => {
    expect(formatPath("/about/")).toBe("首页 / about");
  });
});
```

Run: `npx vitest run src/lib/path.test.ts` → 3 passed

- [ ] **Step 5: BaseLayout 组装双栏骨架**

body 替换为：

```astro
---
import "../styles/global.css";
import { ClientRouter } from "astro:transitions";
import { getCollection } from "astro:content";
import Sidebar from "../components/Sidebar.astro";
import Topbar from "../components/Topbar.astro";

interface Props {
  title: string;
  description: string;
}

const { title, description } = Astro.props;
const allPosts = await getCollection("posts", ({ data }) => !data.draft);
const posts = allPosts
  .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime())
  .map((p) => ({ slug: p.id, title: p.data.title }));
---

<!-- head 部分保持 Task 7 原样 -->
<body>
  <div class="app-shell">
    <Sidebar posts={posts} />
    <div class="main-area">
      <Topbar />
      <main transition:animate="none">
        <slot />
      </main>
    </div>
  </div>
</body>

<style>
  .app-shell {
    min-height: 100dvh;
  }
  .main-area {
    margin-left: var(--sidebar-w);
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
  }
  main {
    flex: 1;
    width: 100%;
    max-width: var(--content-max);
    margin-inline: auto;
    padding: 2rem 1.5rem 4rem;
  }
  @media (max-width: 1023px) {
    .main-area { margin-left: 0; }
  }
</style>
```

- [ ] **Step 6: 浏览器验证**

Run: `npm run dev`
Expected: 桌面端侧栏固定左侧玻璃拟态，导航 hover 位移+高亮，当前页高亮；缩窗 <1024px 侧栏隐藏、汉堡按钮出现、点击滑出抽屉、点击外部/Esc 关闭。

- [ ] **Step 7: Commit**

```bash
git add src/components/Sidebar.astro src/components/Topbar.astro src/components/MenuButton.astro src/lib/path.ts src/lib/path.test.ts src/layouts/BaseLayout.astro
git commit -m "feat: 玻璃拟态侧栏（persist + 移动端抽屉）与顶栏"
```

---

### Task 9: 首页与文章卡片

**Files:**
- Create: `src/components/PostCard.astro`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: `getCollection("posts")`、`sortPostsByDateDesc`（Task 4）、`formatDate`（Task 5）、`estimateReadingTime`（Task 3）、BaseLayout
- Produces: 首页 hero + 卡片网格；PostCard props `{ slug: string; title: string; description: string; pubDate: Date; body: string }`

- [ ] **Step 1: 调用 frontend-design 技能（hero 与卡片视觉）**

- [ ] **Step 2: 写 PostCard.astro**

```astro
---
import { formatDate } from "../lib/format";
import { estimateReadingTime } from "../lib/reading-time";

interface Props {
  slug: string;
  title: string;
  description: string;
  pubDate: Date;
  body: string;
}
const { slug, title, description, pubDate, body } = Astro.props;
const reading = estimateReadingTime(body);
---

<a class="card reveal" href={`/posts/${slug}/`}>
  <article>
    <h2 class="card-title">{title}</h2>
    <p class="card-desc">{description}</p>
    <p class="card-meta">
      <time datetime={pubDate.toISOString()}>{formatDate(pubDate)}</time>
      <span aria-hidden="true">·</span>
      <span>{reading.label}阅读</span>
    </p>
  </article>
</a>

<style>
  .card {
    display: block;
    height: 100%;
    padding: 1.5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: inherit;
    transition: transform var(--t-med) var(--ease-out), border-color var(--t-med) var(--ease-out),
      box-shadow var(--t-med) var(--ease-out);
  }
  .card::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: radial-gradient(420px circle at var(--glow-x, 50%) var(--glow-y, 0%),
        var(--accent-glow), transparent 45%);
    opacity: 0;
    transition: opacity var(--t-med) var(--ease-out);
    pointer-events: none;
  }
  .card:hover {
    transform: translateY(-4px);
    border-color: var(--border-strong);
    box-shadow: 0 12px 40px -12px var(--accent-glow);
  }
  .card:hover::before { opacity: 1; }
  .card-title {
    font-size: 1.2rem;
    line-height: 1.4;
    color: var(--text-1);
    margin-bottom: 0.5rem;
  }
  .card-desc {
    color: var(--text-2);
    font-size: 0.925rem;
    margin-bottom: 1rem;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .card-meta {
    display: flex;
    gap: 0.5rem;
    color: var(--text-3);
    font-size: 0.8rem;
  }
</style>

<style>
  .card { position: relative; overflow: hidden; }
</style>
```

（合并进第一个 style 块亦可，写成两块是为说明结构；实现时合并。）

- [ ] **Step 3: 重写 index.astro**

```astro
---
import { getCollection } from "astro:content";
import BaseLayout from "../layouts/BaseLayout.astro";
import PostCard from "../components/PostCard.astro";
import { sortPostsByDateDesc } from "../lib/posts";

const posts = sortPostsByDateDesc(
  (await getCollection("posts", ({ data }) => !data.draft)).map((p) => ({
    slug: p.id,
    title: p.data.title,
    description: p.data.description,
    pubDate: p.data.pubDate,
    body: p.body,
  })),
);
---

<BaseLayout title="我的博客" description="极致流畅的暗色科技风个人博客">
  <section class="hero">
    <div class="hero-glow" aria-hidden="true"></div>
    <p class="hero-hi">你好，我是 👋</p>
    <h1>
      写点<span class="grad">代码</span>，聊点<span class="grad">技术</span>
    </h1>
    <p class="hero-sub">
      关于 Web 性能、动画与工程实践的写作实验场。
    </p>
  </section>

  <section aria-label="文章列表">
    <h2 class="section-title">最新文章</h2>
    <div class="grid">
      {posts.map((p) => <PostCard {...p} />)}
    </div>
  </section>
</BaseLayout>

<style>
  .hero {
    position: relative;
    padding: 4.5rem 0 3.5rem;
    text-align: center;
  }
  .hero-glow {
    position: absolute;
    top: -40%;
    left: 50%;
    width: min(680px, 90%);
    aspect-ratio: 2 / 1;
    transform: translateX(-50%);
    background: radial-gradient(closest-side, var(--accent-glow), transparent);
    filter: blur(60px);
    opacity: 0.6;
    pointer-events: none;
  }
  .hero-hi { color: var(--text-2); margin-bottom: 1rem; }
  .hero h1 {
    font-size: clamp(2.2rem, 5vw, 3.6rem);
    line-height: 1.25;
    letter-spacing: -0.02em;
    margin-bottom: 1rem;
  }
  .grad {
    background: linear-gradient(120deg, var(--accent), var(--accent-2));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .hero-sub { color: var(--text-2); max-width: 34em; margin-inline: auto; }

  .section-title {
    font-size: 1.1rem;
    color: var(--text-2);
    margin-bottom: 1.25rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--border);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.25rem;
  }
</style>
```

- [ ] **Step 4: 浏览器验证**

Run: `npm run dev`
Expected: hero 雾氖光斑 + 渐变标题文字；卡片 hover 上浮 + 光晕（跟随鼠标的光晕在 Task 15 用小脚本回填 `--glow-x/--glow-y`）；侧栏"文章"组显示 2 篇非草稿。draft 文章不出现。

- [ ] **Step 5: Commit**

```bash
git add src/pages/index.astro src/components/PostCard.astro
git commit -m "feat: 首页 hero 与文章卡片网格"
```

---

### Task 10: 文章页布局与路由

**Files:**
- Create: `src/layouts/PostLayout.astro`, `src/pages/posts/[slug].astro`, `src/components/PrevNext.astro`

**Interfaces:**
- Consumes: `getCollection`、`render`（astro:content）、`getAdjacentPosts`（Task 4）、`formatDate`、`estimateReadingTime`、BaseLayout
- Produces: `/posts/[slug]` 路由；PostLayout props：

```ts
interface Props {
  post: CollectionEntry<"posts">;
  headings: { depth: number; slug: string; text: string }[];
  newer: { slug: string; title: string } | null;
  older: { slug: string; title: string } | null;
}
```

（headings 由 Astro `render(post)` 返回值提供，是 TOC 的数据源。）

- [ ] **Step 1: 写 PrevNext.astro**

```astro
---
interface LinkItem {
  slug: string;
  title: string;
}
interface Props {
  newer: LinkItem | null;
  older: LinkItem | null;
}
const { newer, older } = Astro.props;
---

<nav class="prev-next" aria-label="文章导航">
  {newer ? (
    <a class="pn-link newer" href={`/posts/${newer.slug}/`}>
      <span class="pn-label">上一篇</span>
      <span class="pn-title">{newer.title}</span>
    </a>
  ) : <span class="pn-placeholder" />}
  {older ? (
    <a class="pn-link older" href={`/posts/${older.slug}/`}>
      <span class="pn-label">下一篇</span>
      <span class="pn-title">{older.title}</span>
    </a>
  ) : <span class="pn-placeholder" />}
</nav>

<style>
  .prev-next {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-top: 3rem;
  }
  .pn-link {
    display: grid;
    gap: 0.375rem;
    padding: 1rem 1.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: inherit;
    transition: border-color var(--t-fast) var(--ease-out), transform var(--t-fast) var(--ease-out);
  }
  .pn-link:hover { border-color: var(--border-strong); transform: translateY(-2px); }
  .older { text-align: right; }
  .pn-label { font-size: 0.78rem; color: var(--text-3); }
  .pn-title { font-size: 0.95rem; color: var(--text-1); }
  .pn-placeholder { visibility: hidden; }
  @media (max-width: 640px) {
    .prev-next { grid-template-columns: 1fr; }
    .older { text-align: left; }
  }
</style>
```

- [ ] **Step 2: 写 [slug].astro 路由**

```astro
---
import { getCollection, render } from "astro:content";
import PostLayout from "../../layouts/PostLayout.astro";
import { getAdjacentPosts, sortPostsByDateDesc } from "../../lib/posts";

export async function getStaticPaths() {
  const posts = await getCollection("posts", ({ data }) => !data.draft);
  return posts.map((post) => ({
    params: { slug: post.id },
    props: { post },
  }));
}

const { post } = Astro.props;
const { headings } = await render(post);
const sorted = sortPostsByDateDesc(await getCollection("posts", ({ data }) => !data.draft));
const { newer, older } = getAdjacentPosts(sorted, post.id);
---

<PostLayout post={post} headings={headings} newer={newer} older={older} />
```

- [ ] **Step 3: 写 PostLayout.astro**

```astro
---
import type { CollectionEntry } from "astro:content";
import BaseLayout from "./BaseLayout.astro";
import Toc from "../components/Toc.astro";
import ReadingProgress from "../components/ReadingProgress.astro";
import PrevNext from "../components/PrevNext.astro";
import { formatDate } from "../lib/format";
import { estimateReadingTime } from "../lib/reading-time";

interface Props {
  post: CollectionEntry<"posts">;
  headings: { depth: number; slug: string; text: string }[];
  newer: { slug: string; title: string } | null;
  older: { slug: string; title: string } | null;
}
const { post, headings, newer, older } = Astro.props;
const { title, description, pubDate, updatedDate } = post.data;
const reading = estimateReadingTime(post.body);
---

<BaseLayout title={title} description={description}>
  <ReadingProgress />
  <article class="post">
    <header class="post-header">
      <h1>{title}</h1>
      <p class="post-meta">
        <time datetime={pubDate.toISOString()}>发布于 {formatDate(pubDate)}</time>
        {updatedDate && (
          <time datetime={updatedDate.toISOString()}>更新于 {formatDate(updatedDate)}</time>
        )}
        <span>{reading.label}阅读</span>
      </p>
    </header>

    <div class="post-body">
      <div class="post-content">
        <slot />
      </div>
      <Toc headings={headings} />
    </div>
  </article>
  <PrevNext newer={newer} older={older} />
</BaseLayout>

<style>
  .post-header h1 {
    font-size: clamp(1.8rem, 4vw, 2.6rem);
    line-height: 1.3;
    letter-spacing: -0.02em;
    margin-bottom: 0.75rem;
  }
  .post-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    color: var(--text-3);
    font-size: 0.85rem;
    margin-bottom: 2.5rem;
    padding-bottom: 1.25rem;
    border-bottom: 1px solid var(--border);
  }
  .post-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 220px;
    gap: 3rem;
  }
  @media (max-width: 1279px) {
    .post-body { grid-template-columns: 1fr; }
  }
</style>
```

（`post-content` 的排版样式与 `prose.css` 在 Task 12 注入；`slot` 由 [slug].astro 改为传入 `post.rendered Content`。若 Astro 7 的 render API 是 `const { Content, headings } = await render(post)`，则 [slug].astro 里渲染 `<Content />` 传给 PostLayout 的 slot —— 实现时以 API 实际形态为准，把 `<Content />` 放在 PostLayout 调用之间。）

- [ ] **Step 4: 浏览器验证**

Run: `npm run dev`，访问 `/posts/hello-astro/`
Expected: 标题/元信息/正文渲染；`/posts/typed-content-pipeline/`（draft）返回 404；页面间跳转时侧栏不闪。

- [ ] **Step 5: Commit**

```bash
git add src/pages/posts src/layouts/PostLayout.astro src/components/PrevNext.astro
git commit -m "feat: 文章页路由、布局与上下篇导航"
```

---

### Task 11: TOC scroll-spy 与阅读进度条

**Files:**
- Create: `src/components/Toc.astro`, `src/components/ReadingProgress.astro`
- Modify: `src/styles/global.css`（reveal 样式若放全局）

**Interfaces:**
- Consumes: PostLayout 传入的 `headings`
- Produces: `Toc` props `{ headings: { depth: number; slug: string; text: string }[] }`；`.reveal` 滚动显现机制（Task 15 全站复用）

- [ ] **Step 1: 写 Toc.astro**

```astro
---
interface Props {
  headings: { depth: number; slug: string; text: string }[];
}
const { headings } = Astro.props;
const toc = headings.filter((h) => h.depth >= 2 && h.depth <= 3);
---

{toc.length > 0 && (
  <nav class="toc" aria-label="本页大纲">
    <p class="toc-title">大纲</p>
    <ul>
      {toc.map((h) => (
        <li class:list={["toc-item", `d${h.depth}`]}>
          <a href={`#${h.slug}`}>{h.text}</a>
        </li>
      ))}
    </ul>
  </nav>
)}

<style>
  .toc {
    position: sticky;
    top: 4.5rem;
    align-self: start;
    max-height: calc(100dvh - 6rem);
    overflow-y: auto;
    font-size: 0.83rem;
  }
  .toc-title {
    color: var(--text-3);
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    margin-bottom: 0.75rem;
  }
  ul { list-style: none; padding: 0; display: grid; gap: 2px; }
  .toc-item a {
    display: block;
    padding: 0.3rem 0.75rem;
    border-left: 2px solid transparent;
    color: var(--text-3);
    line-height: 1.5;
    transition: color var(--t-fast) var(--ease-out), border-color var(--t-fast) var(--ease-out);
  }
  .toc-item.d3 { padding-left: 0.75rem; font-size: 0.78rem; }
  .toc-item a:hover { color: var(--text-1); }
  .toc-item a.active {
    color: var(--accent);
    border-left-color: var(--accent);
  }
  @media (max-width: 1279px) {
    .toc { display: none; }
  }
</style>

<script>
  const links = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(".toc-item a"),
  );
  const map = new Map(
    links
      .map((a) => a.getAttribute("href")?.slice(1))
      .filter((id): id is string => Boolean(id))
      .map((id) => [id, document.getElementById(id)] as const),
  );

  const setActive = (id: string) => {
    for (const a of links) a.classList.toggle("active", a.getAttribute("href") === `#${id}`);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) setActive(entry.target.id);
      }
    },
    { rootMargin: "-15% 0px -70% 0px" },
  );
  for (const el of map.values()) if (el) observer.observe(el);
</script>
```

- [ ] **Step 2: 写 ReadingProgress.astro**

```astro
<div class="reading-progress" aria-hidden="true"></div>

<style>
  .reading-progress {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    z-index: 60;
    background: linear-gradient(90deg, var(--accent), var(--accent-2));
    transform-origin: 0 50%;
    transform: scaleX(0);
    animation: grow-progress linear forwards;
    animation-timeline: scroll(root);
  }

  @keyframes grow-progress {
    from { transform: scaleX(0); }
    to { transform: scaleX(1); }
  }

  @media (prefers-reduced-motion: reduce) {
    .reading-progress { display: none; }
  }
</style>
```

（transform: scaleX —— 符合动画铁律；`animation-timeline` 不支持的浏览器自动退化为静态 0，可接受。）

- [ ] **Step 3: 浏览器验证**

Expected: 文章页滚动时顶部进度条平滑增长；TOC 高亮随滚动章节切换；<1280px TOC 隐藏。

- [ ] **Step 4: Commit**

```bash
git add src/components/Toc.astro src/components/ReadingProgress.astro
git commit -m "feat: TOC scroll-spy 与滚动驱动阅读进度条"
```

---

### Task 12: 排版样式与代码复制

**Files:**
- Create: `src/styles/prose.css`, `src/components/CopyCode.astro`
- Modify: `src/layouts/PostLayout.astro`（引 prose.css + 挂 CopyCode）

**Interfaces:**
- Consumes: Shiki 输出的 `.astro-code` 块（Astro 内置）
- Produces: `.post-content` 完整排版体系；CopyCode 挂载点（`client:idle` 岛屿，仅文章页使用）

- [ ] **Step 1: 调用 frontend-design 技能（排版打磨）**

- [ ] **Step 2: 写 prose.css**

```css
.post-content {
  max-width: 70ch;
  font-size: 1.02rem;
  overflow-wrap: break-word;
}

.post-content > * + * { margin-top: 1.1em; }
.post-content h2 { font-size: 1.5rem; margin-top: 2.2em; padding-bottom: 0.4em; border-bottom: 1px solid var(--border); }
.post-content h3 { font-size: 1.22rem; margin-top: 1.8em; }
.post-content h2, .post-content h3 { scroll-margin-top: 4.5rem; letter-spacing: -0.01em; }

.post-content p { color: var(--text-1); }
.post-content strong { color: var(--text-1); }
.post-content blockquote {
  padding: 0.25em 1.25em;
  border-left: 3px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--text-2);
}
.post-content ul, .post-content ol { padding-left: 1.5em; color: var(--text-1); display: grid; gap: 0.4em; }
.post-content code {
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  font-size: 0.875em;
  padding: 0.15em 0.4em;
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
}

/* Shiki 代码块外壳 */
.post-content .astro-code {
  position: relative;
  padding: 1rem 1.25rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  font-size: 0.9rem;
  line-height: 1.7;
}

.post-content table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.92rem;
}
.post-content th, .post-content td {
  padding: 0.6em 0.9em;
  border: 1px solid var(--border);
  text-align: left;
}
.post-content th { background: color-mix(in srgb, var(--accent) 8%, transparent); color: var(--text-1); }
.post-content td { color: var(--text-2); }

.post-content img {
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  cursor: zoom-in;
  transition: transform var(--t-med) var(--ease-out);
}
.post-content img:hover { transform: scale(1.01); }
/* 无 JS 图片放大：:has 悬浮预览（渐进增强） */
.post-content figure:has(img:hover) { position: relative; }
```

图片点击放大最终形态：`<Image>` 组件 + 极轻内联脚本 toggle `.lightbox` 类（一个 `<dialog>` 全屏展示），在本任务一并实现到 PostLayout 内联脚本中：

```html
<dialog id="lightbox" class="lightbox">
  <img alt="" src="" />
</dialog>
<script>
  const lb = document.getElementById("lightbox") as HTMLDialogElement | null;
  const lbImg = lb?.querySelector("img");
  document.querySelectorAll(".post-content img").forEach((img) => {
    img.addEventListener("click", () => {
      if (!lb || !lbImg) return;
      lbImg.src = img.currentSrc || img.src;
      lbImg.alt = img.alt;
      lb.showModal();
    });
  });
  lb?.addEventListener("click", () => lb.close());
</script>
```

（lightbox 样式：透明背景、内容居中、`dialog::backdrop` 半透明暗化。）

- [ ] **Step 3: 写 CopyCode.astro（client:idle 岛屿）**

```astro
<script>
  // 为每个代码块注入复制按钮（水合后执行一次）
  for (const block of document.querySelectorAll(".astro-code")) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.textContent = "复制";
    btn.addEventListener("click", async () => {
      const text = block.querySelector("code")?.innerText ?? "";
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "已复制 ✓";
        btn.classList.add("copied");
      } catch {
        btn.textContent = "复制失败";
      }
      setTimeout(() => {
        btn.textContent = "复制";
        btn.classList.remove("copied");
      }, 2000);
    });
    block.appendChild(btn);
  }
</script>

<style is:global>
  .copy-btn {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    padding: 0.25rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--bg) 80%, transparent);
    color: var(--text-3);
    font-size: 0.75rem;
    cursor: pointer;
    opacity: 0;
    transition: opacity var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out);
  }
  .astro-code:hover .copy-btn,
  .copy-btn:focus-visible { opacity: 1; }
  .copy-btn:hover { color: var(--accent); }
  .copy-btn.copied { color: var(--accent); opacity: 1; }
</style>
```

- [ ] **Step 4: PostLayout 集成**

frontmatter 加 `import "../styles/prose.css";` 与 `import CopyCode from "../components/CopyCode.astro";`，在 `</article>` 后放 `<CopyCode client:idle />`。

- [ ] **Step 5: 浏览器验证**

Expected: 文章内标题/引用/表格/图片排版统一；代码块 hover 出现复制按钮，点击后"已复制 ✓"且剪贴板内容正确；图片点击弹出 lightbox，点击背景关闭。

- [ ] **Step 6: Commit**

```bash
git add src/styles/prose.css src/components/CopyCode.astro src/layouts/PostLayout.astro
git commit -m "feat: 文章排版体系与代码复制、图片灯箱"
```

---

### Task 13: About 页与 404 页

**Files:**
- Create: `src/pages/about.astro`, `src/pages/404.astro`

**Interfaces:**
- Consumes: BaseLayout、prose.css 排版类
- Produces: 完整页面集

- [ ] **Step 1: 调用 frontend-design 技能**

- [ ] **Step 2: 写 about.astro**

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
import "../styles/prose.css";
---

<BaseLayout title="关于 · 我的博客" description="关于这个博客与作者">
  <article class="post-content about">
    <h1>关于</h1>
    <p>
      你好！这里是我的个人博客。我用 <strong>Astro</strong> 搭建了它 ——
      零 JavaScript 基线、原生 View Transitions、类型安全的内容管线。
    </p>
    <p>这里主要写：Web 性能优化、CSS 动画、前端工程实践。</p>
    <blockquote>
      <p>极致流畅不是优化出来的，是从第一行代码开始的设计约束。</p>
    </blockquote>
    <h2>本站技术栈</h2>
    <ul>
      <li>Astro 7 —— 静态生成，零 JS 基线</li>
      <li>原生 CSS —— 设计令牌 + scroll-driven animations</li>
      <li>pagefind —— 静态全文搜索</li>
      <li>Zod —— 内容契约</li>
    </ul>
  </article>
</BaseLayout>

<style>
  .about { margin-inline: auto; padding-top: 2rem; }
</style>
```

- [ ] **Step 3: 写 404.astro**

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
---

<BaseLayout title="404 · 页面未找到" description="页面不存在">
  <section class="not-found">
    <p class="code">404</p>
    <h1>这个页面飘走了 🛸</h1>
    <p class="hint">你要找的页面不存在，或者已经被移动。</p>
    <a class="back" href="/">← 回到首页</a>
  </section>
</BaseLayout>

<style>
  .not-found {
    display: grid;
    place-items: center;
    gap: 0.75rem;
    padding: 6rem 0;
    text-align: center;
  }
  .code {
    font-size: 5rem;
    font-weight: 800;
    line-height: 1;
    background: linear-gradient(120deg, var(--accent), var(--accent-2));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .hint { color: var(--text-2); }
  .back {
    margin-top: 1rem;
    padding: 0.6rem 1.5rem;
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    color: var(--text-1);
    transition: border-color var(--t-fast) var(--ease-out), transform var(--t-fast) var(--ease-out);
  }
  .back:hover { border-color: var(--accent); transform: translateY(-2px); }
</style>
```

- [ ] **Step 4: 验证**

Run: `npm run build && npm run preview`，访问不存在路径
Expected: 404 页显示渐变大数字与返回按钮；about 页排版正常；侧栏高亮正确。

- [ ] **Step 5: Commit**

```bash
git add src/pages/about.astro src/pages/404.astro
git commit -m "feat: 关于页与 404 页"
```

---

### Task 14: 全文搜索（pagefind + ⌘K）

**Files:**
- Create: `src/components/Search.astro`
- Modify: `package.json`（build 脚本追加 pagefind）、`src/layouts/BaseLayout.astro`（挂 Search）

**Interfaces:**
- Consumes: Topbar 的 `[data-search-open]` 触发器（Task 8）
- Produces: `npm run build` 产出 `dist/pagefind/` 索引；生产可用搜索（dev 模式下搜索显示"索引仅生产构建可用"提示）

- [ ] **Step 1: 安装并接线 pagefind**

```bash
npm install -D pagefind
```

`package.json` scripts 修改：

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro build && pagefind --site dist",
    "preview": "astro preview",
    "check": "astro check",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: 写 Search.astro**

```astro
---
// client:load 岛屿：搜索需要立即可用（⌘K）
---

<div
  id="search-modal"
  class="search-modal"
  hidden
  role="dialog"
  aria-modal="true"
  aria-label="搜索"
>
  <div class="search-panel" data-panel>
    <div class="search-box">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
      </svg>
      <input
        id="search-input"
        type="search"
        placeholder="搜索文章…"
        autocomplete="off"
        spellcheck="false"
      />
      <kbd>Esc</kbd>
    </div>
    <ul id="search-results" class="search-results" role="listbox"></ul>
    <p id="search-hint" class="search-hint">↑↓ 选择 · Enter 打开 · Esc 关闭</p>
  </div>
</div>

<style>
  .search-modal {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: start center;
    padding-top: 12vh;
    background: color-mix(in srgb, #05070d 65%, transparent);
    backdrop-filter: blur(6px);
  }
  .search-modal[hidden] { display: none; }
  .search-panel {
    width: min(640px, 92vw);
    display: grid;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: 0 24px 80px -20px rgba(0, 0, 0, 0.6), 0 0 60px -30px var(--accent-glow);
    overflow: hidden;
  }
  .search-box {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.9rem 1.25rem;
    border-bottom: 1px solid var(--border);
    color: var(--text-3);
  }
  .search-box input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--text-1);
    font-size: 1.05rem;
    outline: none;
    font-family: inherit;
  }
  .search-box kbd {
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.7rem;
    color: var(--text-3);
  }
  .search-results {
    list-style: none;
    margin: 0;
    padding: 0.5rem;
    max-height: 50vh;
    overflow-y: auto;
    display: grid;
    gap: 2px;
  }
  .result {
    display: grid;
    gap: 0.2rem;
    padding: 0.7rem 0.9rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .result.selected { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .result .r-title { color: var(--text-1); font-size: 0.95rem; }
  .result .r-excerpt {
    color: var(--text-3);
    font-size: 0.82rem;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
  }
  .result .r-excerpt :global(mark) { color: var(--accent); background: none; }
  .search-hint {
    padding: 0.6rem 1.25rem;
    border-top: 1px solid var(--border);
    color: var(--text-3);
    font-size: 0.75rem;
  }
</style>

<script>
  type PFResult = {
    meta: { title?: string; url?: string };
    excerpt: () => string;
  };
  type Pagefind = {
    search: (q: string) => Promise<{ results: { data: () => Promise<PFResult> }[] }>;
  };

  const modal = document.getElementById("search-modal");
  const input = document.getElementById("search-input") as HTMLInputElement | null;
  const resultsEl = document.getElementById("search-results");
  let pagefind: Pagefind | null = null;
  let results: (PFResult & { url: string })[] = [];
  let selected = 0;
  let lastController: AbortController | null = null;

  const open = async () => {
    modal?.removeAttribute("hidden");
    input?.focus();
    if (!pagefind) {
      try {
        pagefind = (await import("/pagefind/pagefind.js")) as unknown as Pagefind;
      } catch {
        if (resultsEl && import.meta.env.DEV) {
          resultsEl.innerHTML =
            '<li class="result"><span class="r-title">搜索索引仅在生产构建（npm run build && npm run preview）中可用</span></li>';
        }
      }
    }
  };
  const close = () => modal?.setAttribute("hidden", "");

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      modal?.hasAttribute("hidden") ? void open() : close();
    }
    if (e.key === "Escape") close();
  });
  document.querySelector("[data-search-open]")?.addEventListener("click", (e) => {
    e.preventDefault();
    void open();
  });
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  const render = () => {
    if (!resultsEl) return;
    selected = Math.min(selected, Math.max(0, results.length - 1));
    resultsEl.innerHTML = results
      .map(
        (r, i) => `
        <li class="result${i === selected ? " selected" : ""}" role="option" aria-selected="${i === selected}" data-i="${i}">
          <span class="r-title">${r.meta.title ?? "无标题"}</span>
          <span class="r-excerpt">${r.excerpt()}</span>
        </li>`,
      )
        .join("");
  };

  const go = (r: { url: string }) => {
    close();
    window.location.href = r.url;
  };

  input?.addEventListener("input", async () => {
    const q = input.value.trim();
    if (!q || !pagefind) {
      results = [];
      render();
      return;
    }
    lastController?.abort();
    lastController = new AbortController();
    const signal = lastController.signal;
    const search = await pagefind.search(q);
    if (signal.aborted) return;
    const items = await Promise.all(
      search.results.slice(0, 8).map((r) => r.data()),
    );
    if (signal.aborted) return;
    results = items.map((it) => ({ ...it, url: it.meta.url ?? "/" }));
    selected = 0;
    render();
  });

  input?.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selected = Math.min(selected + 1, results.length - 1);
      render();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selected = Math.max(selected - 1, 0);
      render();
    } else if (e.key === "Enter" && results[selected]) {
      go(results[selected]);
    }
  });

  resultsEl?.addEventListener("click", (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>(".result");
    if (li) {
      const i = Number(li.dataset.i);
      if (results[i]) go(results[i]);
    }
  });
</script>
```

- [ ] **Step 3: BaseLayout 挂载**

body 内 `<slot />` 之前加：

```astro
import Search from "../components/Search.astro";
<!-- ... -->
<Search client:load />
```

- [ ] **Step 4: 验证（生产模式）**

Run: `npm run build && npm run preview`
Expected: ⌘K / Ctrl+K / 点击顶栏搜索入口 → 模态弹出；输入关键词出结果；↑↓ 高亮移动；Enter 跳转；Esc/点击背景关闭。

- [ ] **Step 5: Commit**

```bash
git add src/components/Search.astro src/layouts/BaseLayout.astro package.json package-lock.json
git commit -m "feat: pagefind 全文搜索（⌘K 模态 + 键盘导航）"
```

---

### Task 15: 动画体系完善（转场、显现、光晕跟随）

**Files:**
- Create: `src/styles/animations.css`
- Modify: `src/layouts/BaseLayout.astro`（引 animations.css）、`src/components/PostCard.astro`（光晕跟随）

**Interfaces:**
- Consumes: `.reveal` 类（Task 9 卡片已带）
- Produces: 全站动画体系（`.reveal` 机制、路由转场、卡片鼠标光晕）

- [ ] **Step 1: 写 animations.css**

```css
/* ========== 滚动显现（IntersectionObserver 加类） ========== */
.reveal {
  opacity: 0;
  transform: translateY(16px);
  transition: opacity var(--t-med) var(--ease-out), transform var(--t-med) var(--ease-out);
  transition-delay: var(--reveal-delay, 0ms);
}
.reveal.in-view {
  opacity: 1;
  transform: translateY(0);
}

/* 不支持 IO 或 JS 失败时兜底可见 */
.no-js .reveal, .reveal.in-view { opacity: 1; }

/* ========== 路由转场（View Transitions） ========== */
/* main 内容区：进入时淡入上浮 */
@keyframes vt-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
main {
  view-transition-name: main-content;
}
::view-transition-old(main-content) {
  animation: vt-in var(--t-med) var(--ease-out) reverse;
}
::view-transition-new(main-content) {
  animation: vt-in var(--t-med) var(--ease-out);
}

@media (prefers-reduced-motion: reduce) {
  .reveal {
    opacity: 1;
    transform: none;
    transition: none;
  }
  ::view-transition-old(main-content),
  ::view-transition-new(main-content) {
    animation: none;
  }
}
```

- [ ] **Step 2: reveal 初始化脚本（BaseLayout 内联）**

BaseLayout `<body>` 末尾追加：

```html
<script>
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("in-view");
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: "0px 0px -10% 0px" },
  );
  for (const el of document.querySelectorAll(".reveal")) {
    if (el.getBoundingClientRect().top < innerHeight) el.classList.add("in-view");
    else io.observe(el);
  }
</script>
```

（ClientRouter 软导航后需重新初始化 —— 用 `astro:page-load` 事件包裹：

```ts
import { } from "astro:transitions/client"; // 不需要具名导入
document.addEventListener("astro:page-load", initReveal);
```

实现时把初始化逻辑封成 `initReveal()` 函数并监听 `astro:page-load`。）

- [ ] **Step 3: 卡片光晕跟随鼠标（PostCard 追加）**

PostCard `<script>` 加：

```ts
for (const card of document.querySelectorAll<HTMLAnchorElement>(".card")) {
  card.addEventListener("pointermove", (e) => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--glow-x", `${e.clientX - rect.left}px`);
    card.style.setProperty("--glow-y", `${e.clientY - rect.top}px`);
  });
}
```

同样监听 `astro:page-load` 重复绑定（软导航后 DOM 重建）。

- [ ] **Step 4: 验证**

Run: `npm run dev`（转场需 build+preview 验证软导航）
Expected: 首页卡片进入视口浮现（有交错延迟更佳：给卡片 style 设 `--reveal-delay: ${i * 60}ms`）；页面切换内容区淡入上浮、侧栏稳如泰山；卡片 hover 光晕跟随鼠标。系统开启"减少动态效果"后全部动画消失。

- [ ] **Step 5: Commit**

```bash
git add src/styles/animations.css src/layouts/BaseLayout.astro src/components/PostCard.astro
git commit -m "feat: 动画体系（滚动显现 + 路由转场 + 光晕跟随）"
```

---

### Task 16: CI 工作流

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm run check` / `npm run test` / `npm run build`（前述任务产出）
- Produces: push/PR 时全量检查，任一步失败阻断

- [ ] **Step 1: 写 ci.yml**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm run test
      - run: npm run build
```

- [ ] **Step 2: 本地全量验证（模拟 CI）**

Run: `npm run check && npm run test && npm run build`
Expected: 三步全绿；`dist/` 生成完整站点 + `dist/pagefind/` 索引。

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: 类型检查 + 单测 + 构建全量流水线"
```

---

### Task 17: 端到端验收（webapp-testing + Lighthouse）

**Files:**
- Create: `docs/superpowers/verification.md`（验收记录）

**Interfaces:**
- Consumes: 全部前序任务
- Produces: 对照规格 7 条验收标准的验证记录

- [ ] **Step 1: 调用 webapp-testing 技能做冒烟测试**

覆盖路径：
1. 首页加载 → 卡片可见 → 点击卡片进入文章页
2. 侧栏导航到 About → 返回首页（验证 persist 与转场）
3. ⌘K 搜索 "Astro" → Enter 进入结果
4. 主题切换 → 刷新保持
5. 375px 视口：汉堡菜单开合抽屉
6. 访问不存在路径 → 404 页

- [ ] **Step 2: Lighthouse 审计**

对 `npm run preview` 的首页跑 Lighthouse（桌面）。
Expected: Performance ≥ 95，CLS = 0。未达标 → 用 superpowers:systematic-debugging 排查（通常是图片尺寸/字体/脚本阻塞）。

- [ ] **Step 3: 契约回归验证**

临时把一篇文章 pubDate 改成非法值 → `npm run build` 失败且报错定位准确 → 改回。

- [ ] **Step 4: 写验收记录并提交**

`docs/superpowers/verification.md` 记录：7 条标准逐条结果、Lighthouse 分数截图路径、发现并修复的问题。

```bash
git add docs/superpowers/verification.md
git commit -m "docs: 端到端验收记录"
```

---

## Self-Review 记录

1. **Spec 覆盖**：规格 §3 路由（Task 9/10/13）、§4 组件（Task 7-12/14 逐一对应）、§5 动画（Task 7/11/15）、§6 视觉（Task 2 + frontend-design 介入点）、§7 契约（Task 6）、§8 健壮性（Task 6 反向测试 + Task 16 CI + Task 7 无闪烁）、§9 测试（Task 3-5 单测 + Task 16/17）、§11 验收（Task 17）—— 无缺口
2. **占位符扫描**：示例文章正文以"覆盖清单"形式给出元素要求（标题/列表/代码块/表格等），属内容规格而非代码占位；其余步骤均含完整代码
3. **类型一致性**：`estimateReadingTime(text: string): { minutes; label }`（Task 3 ↔ 9/10）；`sortPostsByDateDesc<T extends PostLike>` / `getAdjacentPosts`（Task 4 ↔ 9/10）；`formatDate(date: Date): string`（Task 5 ↔ 9/10）；`formatPath`（Task 8 内）；Sidebar `Props { posts: { slug; title }[] }`（Task 8 ↔ 9 回填一致，BaseLayout 统一传入）；Toc/PostLayout headings 形状一致 —— 已核对
