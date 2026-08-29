# CLAUDE.md

Astro 7 静态博客（zh-CN，暗色科技风）。零框架 JS——交互全用原生脚本，性能是核心约束。

## 常用命令

```bash
npm run check              # astro check（类型检查）
npm test                   # vitest 单测（纯逻辑，无 Astro 插件）
npm run build              # astro build && pagefind --site dist（搜索索引是构建的一部分）
npm run preview            # 本地预览 dist
npx serve dist -l 4327     # 冒烟测试依赖的静态服务器（保持 4327 端口）
python scripts/smoke-test.py   # Playwright/Edge headless 冒烟（当前 29 项，需先起 serve）
```

**门禁**：改动后跑 check → test → build → smoke，全绿才提交。commit message 用中文，格式 `类型: 描述`（feat/fix/test/docs/ci）。

## 架构

- `src/content/posts/` 文章集 + `src/content/notes/{embedded,hardware}/` 笔记集（glob loader，id 可含斜杠，由 rest 路由 `[...slug].astro` 承接）
- `src/lib/` 分两类：**纯逻辑**（posts.ts / notes.ts / path.ts / format.ts / reading-time.ts，vitest 直接测）与 **astro:content 封装**（只有 collections.ts——vitest 不加载 Astro 插件，`astro:content` 导入绝不能进纯逻辑模块）
- 路由：`pages/posts/[...slug].astro` 与 `pages/notes/[...slug].astro` 镜像结构，共用 `PostLayout`（Props 是 `ContentEntryLike` 结构类型 + `basePath` 区分前缀）
- 搜索：pagefind 后处理 dist，`Search.astro` 用 `new Function("u","return import(u)")` 绕过打包器加载
- KaTeX（remark-math + rehype-katex）全局启用，但 `katex/dist/katex.min.css` **只在 notes 路由引入**——公式字体不得泄漏到文章/首页

## 关键约定

**软导航重初始化**：ClientRouter（View Transitions）下 body DOM 每次导航被替换，`document` 级监听器存活。组件脚本的模式：定义 `init()` → 立即调用 → `document.addEventListener("astro:page-load", init)`（见 CopyCode.astro）。

**transition:persist 的侧栏**：Sidebar 跨导航保留旧 DOM，构建期烘焙的 active 会过期——客户端 `syncActive()` 必须与构建端 `isActive()` 用**同一套规则**。前缀匹配写 `current.startsWith(href)`（href 自带尾斜杠，段安全）；不要写 `startsWith(href + "/")`——会拼出 `//` 永不命中（已踩坑，见 verification.md §6）。

**路由转场**（animations.css）：旧页快照 70ms 快速淡出、新页 180ms 淡入上浮。不要改回交叉淡化——新旧页同时半透明会叠出残影（用户明确不要）。

**排序即时间戳**：文章/笔记排序比较 `pubDate.getTime()` 全精度，同刻再按 id 字典序。迁移内容时保留 `'YYYY-MM-DD HH:mm:ss'` 原字符串（`z.coerce.date()` 解析），秒级差异决定上下篇链条。

**内容 frontmatter**：posts = title/description/pubDate/updatedDate?/heroImage?/draft（默认 false）；notes = title/description(默认 "")/pubDate/category（embedded|hardware）。草稿不进任何公开视图（filterPublished 单一管道）。

## 冒烟测试注意

- TOC 滚动追踪断言必须**渐进滚动**（多次 350px + 等待）——单次大跳跃会让所有标题落在 IntersectionObserver 的 15%-30% 视口带之外，必挂
- 搜索用例按**标题文本**定位目标结果（内容量增大后 pagefind 排序会漂移，不能假定固定位次）
- C 代码高亮的标记是 `pre[data-language="c"]`（Shiki 把语言放 data 属性）

## 历史包袱提示

`src/content/` 里 2026-07 之前的迁移内容源自旧 Next.js 博客（脚本 `scripts/migrate-iustitiae.py`，一次性）。旧站 CMS 曾丢表格管道符，坍塌行已全部重建——若再见到超长无管道的乱行，是同类病害，参照 git log 8a94ba2 的修复方式。验收记录在 `docs/superpowers/verification.md`。
