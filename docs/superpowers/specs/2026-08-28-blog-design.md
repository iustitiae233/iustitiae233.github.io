# 个人博客设计规格 —— Astro 7 暗色科技风内容站

日期：2026-08-28
状态：已获用户批准（设计呈现 + 视觉方向确认）

## 1. 项目目标

为用户构建一个**极致流畅、功能完整、代码健全**的个人博客：

- **极致流畅**：零客户端 JS 基线，所有动画仅使用 `transform`/`opacity`（GPU 合成层），CLS = 0
- **炫酷交互动画**：原生 View Transitions 路由转场、滚动显现、微交互体系
- **功能完整**：左侧导航、全文搜索、暗色模式、阅读体验套件（TOC/上下篇/阅读时长/代码复制/图片放大）
- **代码健全**：Zod 内容契约、TypeScript 严格模式、CI 全量检查、纯函数单元测试
- **视觉方向**：暗色科技风（深色基底 + 雾氖光效 + 玻璃拟态侧边栏，参考 Linear/Vercel 质感）

参考站点形态（用户指定）：https://no-chicken.com/content/Power-Pico/intro.html —— VitePress 风格的左侧导航内容站。

### 明确不做（YAGNI）

- 不做文章时间线/归档页、标签/分类系统、RSS（用户明确不需要）
- 不做评论、数据库、后端、CMS 管理
- 不引入 React/Vue 等 UI 框架（零 JS 岛屿 + 原生 TS 足够）

## 2. 技术栈

| 项 | 选择 | 理由 |
|---|---|---|
| 框架 | Astro 7（`output: 'static'`） | 零 JS 默认、View Transitions 原生、Content Layer API |
| 语言 | TypeScript（strict） | 类型安全 |
| 内容 | Content Collections + `glob()` loader + Zod v4 schema | 构建期校验 frontmatter |
| 搜索 | pagefind（构建后索引） | 静态全文搜索黄金标准，索引按需加载 |
| 代码高亮 | Shiki（Astro 内置） | 构建期高亮，零运行时 |
| 测试 | Vitest | 纯函数单测 |
| 包管理 | pnpm（若环境不可用回退 npm） | 快、磁盘高效 |

## 3. 架构与数据流

```
Markdown (src/content/posts/*.md)
   │  构建期：glob loader + Zod 校验（失败 → 构建错误，指明文件与字段）
   ▼
Content Collection（类型安全的文章对象）
   │  getStaticPaths → 预渲染路由
   ▼
纯静态 HTML（零 JS 基线）──► astro build ──► pagefind 索引 ──► 部署产物
```

### 页面路由

| 路由 | 页面 | 说明 |
|---|---|---|
| `/` | 首页 | hero 区 + 文章卡片网格（draft 文章排除） |
| `/posts/[slug]` | 文章页 | 正文 + TOC + 上一篇/下一篇 + 阅读时长 |
| `/about` | 关于页 | 作者介绍 |
| `/404` | 错误页 | 定制 404 |

### 岛屿策略（水合清单 —— 全站仅此 3 处）

1. **搜索** `Search.astro`（`client:load`）—— pagefind UI，⌘K/Ctrl+K 唤起，键盘上下导航
2. **代码复制按钮** `CopyCode.astro`（`client:idle`）—— 空闲时水合
3. **主题切换** —— `<head>` 内联脚本（非岛屿），首帧绘制前设置 `data-theme`，无闪烁

其余交互（TOC scroll-spy、滚动显现、移动端抽屉）全部原生 `IntersectionObserver` + CSS。

## 4. 布局与组件

```
桌面端：
┌────────┬───────────────────────────────┐
│        │  顶部条：面包屑 + 搜索入口(⌘K)   │
│ 侧边栏  ├───────────────────┬───────────┤
│ (固定)  │                   │  右侧 TOC  │
│ · Logo │     文章/首页内容    │  scroll-  │
│ · 导航  │                   │   spy     │
│ · 文章  │  上一篇 / 下一篇    │  阅读进度  │
│ · 主题  │                   │           │
└────────┴───────────────────┴───────────┘
移动端（<1024px）：侧边栏 → 抽屉（汉堡按钮），TOC 折叠为文内details
```

### 组件清单

| 组件 | 职责 | 关键实现点 |
|---|---|---|
| `Sidebar.astro` | 左侧导航 | `transition:persist` 跨页面不重绘；导航 hover 弹簧滑动指示器；玻璃拟态背景 |
| `Topbar.astro` | 顶部条 | 面包屑 + ⌘K 搜索入口 |
| `Search.astro` | 全文搜索 | pagefind，模态框，⌘K 唤起，Esc 关闭，↑↓ 导航 |
| `ThemeToggle.astro` | 暗色切换 | 内联脚本无闪烁；View Transition 圆形扩散 |
| `Toc.astro` | 文章大纲 | IntersectionObserver 高亮当前章节 |
| `ReadingProgress.astro` | 阅读进度条 | CSS `animation-timeline: scroll()`，零 JS |
| `CopyCode.astro` | 代码复制 | 水合后为 Shiki 块注入复制按钮 |
| `PostCard.astro` | 文章卡片 | hover 光晕位移（纯 CSS） |
| `PrevNext.astro` | 上下篇导航 | 按日期排序计算相邻文章 |
| `FormattedDate.astro` | 日期显示 | 本地化格式 |

### 布局

- `BaseLayout.astro`：`<html>` 骨架、`<ClientRouter />`、主题内联脚本、全局样式、Sidebar/Topbar
- `PostLayout.astro`：继承 Base，文章元信息 + TOC + PrevNext + prose 排版

## 5. 动画体系

**铁律：所有动画只碰 `transform`/`opacity`，禁止动画 layout 属性（width/top/margin 等）。**

| 层次 | 实现 |
|---|---|
| 路由转场 | View Transitions API：内容区淡入 + 8px 上浮（200ms ease-out），Sidebar `transition:persist` |
| 滚动显现 | IntersectionObserver 加 `.in-view` 类 + CSS `@starting-style` 过渡，元素进入视口浮现（仅一次） |
| 导航指示器 | 纯 CSS `transform` 弹簧跟随（spring easing：`linear()` 时间函数） |
| 卡片 hover | `translateY(-4px)` + 边框光晕（伪元素 opacity） |
| 阅读进度 | CSS scroll-driven animation |
| 暗色切换 | `document.startViewTransition` 圆形扩散（`clip-path` circle，从点击坐标展开） |

无障碍底线：`@media (prefers-reduced-motion: reduce)` 下全部动画降级为瞬时切换。

## 6. 视觉设计（暗色科技风）

- **基底**：深色为默认主题（`data-theme="dark"`），浅色为辅助（同样精细打磨）
- **色板**：深蓝黑基底（如 `#0a0e1a` 级）、雾氖强调色（青/紫渐变）、文字高对比（WCAG AA+）
- **质感**：侧边栏玻璃拟态（`backdrop-filter: blur` + 半透明）、细边框微光、hero 区雾氖渐变光斑
- **字体**：系统字体栈（中文站零字体请求）：`system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`
- **排版**：prose 行长上限 ~70ch，行高 1.75（中文），标题层级间距节奏统一
- **设计令牌**：全部颜色/间距/圆角/动效时长收进 `global.css` CSS 变量，亮暗双主题各一套令牌

## 7. 内容契约（Zod schema）

```ts
// src/content.config.ts（示意）
const postSchema = z.object({
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  heroImage: z.string().optional(),
  draft: z.boolean().default(false),
});
```

- 校验失败 → 构建失败，错误信息含文件路径与字段名
- `draft: true` 的文章在生产构建中排除
- 附 3 篇高质量示例文章（真实结构，含代码块/图片/引用等元素覆盖测试面）

## 8. 健壮性措施

1. **构建即测试**：frontmatter 契约 + `astro check`（TS 类型）+ 构建成功 = 内容回归通过
2. **图片**：`astro:assets` `<Image>` 自动压缩 + 显式尺寸（CLS=0）；hero 图 `loading="eager"` + `fetchpriority="high"`，其余 lazy
3. **无闪烁主题**：`<head>` 内联脚本在首次绘制前读取 localStorage/系统偏好
4. **404 页**：友好错误页 + 返回首页引导
5. **元数据**：每页 title/description/OG 标签；`astro.config` 配 `site`
6. **可访问性**：语义化地标、键盘可达（搜索/抽屉 focus 管理、Esc 关闭）、`prefers-reduced-motion`

## 9. 测试策略

| 层 | 工具 | 覆盖 |
|---|---|---|
| 纯函数单测 | Vitest | `reading-time.ts`（中英文混合时长）、日期格式化、文章排序/相邻文章计算、slug 处理 |
| 类型与契约 | `astro check` + Zod | 全量类型检查 + frontmatter 校验 |
| 构建 | `astro build` | 全站可构建、pagefind 索引生成 |
| 冒烟 | webapp-testing 技能 | 关键路径：导航跳转、搜索、暗色切换、移动端抽屉、404 |

CI（GitHub Actions）：`pnpm install → astro check → vitest run → astro build → pagefind`，任一步失败即阻断。

## 10. 目录结构

```
E:\Blog\
├── astro.config.mjs
├── package.json / tsconfig.json / vitest.config.ts
├── public/                     # favicon 等
├── docs/superpowers/specs/     # 本文档
├── src/
│   ├── content.config.ts       # Zod 内容契约
│   ├── content/posts/          # Markdown 文章（3 篇示例）
│   ├── components/             # 第 4 节全部组件
│   ├── layouts/BaseLayout.astro / PostLayout.astro
│   ├── pages/
│   │   ├── index.astro
│   │   ├── about.astro
│   │   ├── 404.astro
│   │   └── posts/[slug].astro
│   ├── styles/
│   │   ├── global.css          # 设计令牌 + 重置 + 双主题
│   │   ├── prose.css           # 文章排版
│   │   └── animations.css      # 动画 keyframes + reveal 类
│   └── lib/                    # reading-time.ts / prev-next.ts / format.ts（带单测）
└── .github/workflows/ci.yml
```

## 11. 验收标准

1. Lighthouse（桌面，暗色首页）：Performance ≥ 95，CLS = 0
2. 页面切换有 View Transition 转场，侧边栏不闪烁
3. ⌘K 搜索可全文字检索并键盘导航
4. 主题切换无闪烁、有圆形扩散动画、刷新后保持
5. 移动端（375px）侧边栏抽屉正常，TOC 折叠可用
6. `astro check` / `vitest` / `astro build` 全绿
7. 写一篇 frontmatter 缺字段的文章 → 构建失败且报错定位准确
