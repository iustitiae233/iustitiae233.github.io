# 验收记录 — 2026-08-28

对照 `docs/superpowers/specs/2026-08-28-blog-design.md` 的验收标准逐条验证。

## 1. Lighthouse 性能（标准：Performance ≥ 95，CLS = 0）

对 `dist`（`npx serve` @ 127.0.0.1:4327）实测：

| 页面 | Performance | FCP | LCP | TBT | CLS | Speed Index |
| --- | --- | --- | --- | --- | --- | --- |
| 首页 `/` | **100** | 0.9s | 0.9s | 0ms | **0** | 0.9s |
| 文章 `/posts/hello-astro/` | **100** | 0.9s | 0.9s | 0ms | **0** | 0.9s |

报告：`reports/lh-home.json`、`reports/lh-post.json`（lighthouse 13.4.1，headless Edge 151）。
说明：CLI 在进程收尾阶段报临时目录 EPERM（Windows 特有的 chrome-launcher 清理问题），不影响审计结果，JSON 完整产出。

## 2. 端到端冒烟（标准：核心路径全通过）

`python scripts/smoke-test.py`（Playwright + Edge headless，暗色系统偏好）：**17/17 通过**

- 首页渲染文章卡片（2 张）· 跟随系统暗色偏好
- 卡片点击进入文章页（软导航，DOM 断言）
- TOC（3 项）· 阅读进度条 · 上下篇导航 · 侧栏跨页持久
- 侧栏导航到 About
- Ctrl+K 搜索模态 · 搜索出结果（5 条）· ↓ 键选中 + Enter 进入文章
- 主题切换 + 刷新保持（localStorage）
- 404 定制页
- 移动端 375px：汉堡按钮 · 抽屉滑出 · 点击外部收起

## 3. 质量 门禁（标准：check / test / build 全绿）

- `npm run check`（astro check + tsc）：通过
- `npm test`（vitest）：reading-time / posts 排序与相邻 / format 全部通过
- `npm run build`：干净构建，pagefind 索引正常生成
- CI（`.github/workflows/ci.yml`）：node 24，check → test → build

## 4. 体验细节（标准：零闪烁 + 动画体系）

- 主题：首帧前内联脚本读取 localStorage/系统偏好，无 FOUC；切换走 View Transitions 圆形扩散
- 动画：滚动显现（IntersectionObserver）、路由转场（ClientRouter）、卡片光晕跟随（pointermove）
- 无 JS 基线：内容与导航在禁用 JS 时仍可读可用

## 已知边界

- `pagefind` 索引仅存在于构建产物——dev server 下搜索会提示"索引不可用"，属预期（静态优先架构）
- Astro 7 preview 只服务构建清单内资产，本地验证 pagefind 需 `npx serve dist`

## 5. 合并前代码审查修复 — 2026-08-29

/code-review（high）对 `git diff main...HEAD` 审出 12 项确认缺陷，全部修复：

- 软导航重初始化 ×4：汉堡按钮改 document 事件委托；侧栏 `transition:persist` 后按
  `location.pathname` 重算 active/aria-current；TOC 滚动追踪断开旧观察器重建；灯箱随
  `astro:page-load` 重挂载
- 搜索：结果标题 HTML 转义（excerpt 保留原生 `<mark>`）；Enter/点击改
  `astro:transitions/client` 的 `navigate()` 软导航
- 路由：`posts/[slug]` → `posts/[...slug]` rest 路由，嵌套文章（如 `2026/x.md`）不再炸构建
- 管道统一：`getPublishedPosts()`（`src/lib/collections.ts`）收敛 4 处草稿过滤+排序，
  草稿规则在已测纯函数 `filterPublished` 中单一来源
- 性能：卡片光晕 pointermove 以 rAF 合并（每帧最多一次读+写）
- heroImage：PostLayout 渲染（width/height 锁宽高比，CLS 保持 0）

门禁复验：check 0 错误 · vitest **19/19**（+3 草稿过滤）· build 干净（pagefind 5 页）·
冒烟 **22/22**（+5 软导航回归：文章→文章 TOC 追踪、侧栏高亮同步、About aria-current、
移动端软导航后汉堡可用）

## 6. IustitiaeBlog 内容迁移 — 2026-08-29

**迁移范围**：3 篇 AI 文章（三部曲全部发布）+ 16 篇学习笔记（嵌入式 10 / 硬件基础 6）→ 独立 `/notes/` 板块。图片全在远程图床，零文件迁移；tags/mood 按用户决策丢弃；说说/评论/音乐不做。

**提交链**：9782355（内容集+脚本+19 篇）→ e0e40ec（/notes 页面+侧栏）→ ea723dc（测试）→ 8a94ba2（61 处坍塌表格重建）。

**过程中修掉的深层 bug**：侧栏 active 前缀匹配 `startsWith(href + "/")` 拼出双斜杠永不命中——构建端与客户端同源问题，旧导航全靠精确匹配故从未暴露；笔记页首次出现前缀场景即现形。数据插桩（data-current/data-dbg 内联对照）定位。

**门禁**：astro check 0 错误 · vitest 26/26 · build 25 页 · 冒烟 29/29 · KaTeX 153 处渲染仅笔记页加载 · 残留坍塌行扫描 = 0。
