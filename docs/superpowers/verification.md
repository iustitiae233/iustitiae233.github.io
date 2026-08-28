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
