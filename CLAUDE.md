# CLAUDE.md

Astro 7 静态博客（zh-CN，暗色科技风）。零框架 JS——交互全用原生脚本，性能是核心约束。

## 常用命令

```bash
npm run check              # astro check（类型检查）
npm test                   # vitest 单测（纯逻辑，无 Astro 插件）
npm run build              # 先拉 GitHub 头像（失败沿用旧文件不阻断）再 astro build
npm run profile            # 手动刷新 GitHub 头像/昵称（scripts/fetch-github-profile.mjs）
npm run preview            # 本地预览 dist
npx serve dist -l 4327     # 冒烟测试依赖的静态服务器（保持 4327 端口）
python scripts/smoke-test.py   # Playwright/Edge headless 冒烟（当前 110 项，需先起 serve）
```

**门禁**：改动后跑 check → test → build → smoke，全绿才提交。commit message 用中文，格式 `类型: 描述`（feat/fix/test/docs/ci）。

## 架构

- `src/content/posts/` 文章集 + `src/content/notes/{embedded,hardware,ai}/` 笔记集（glob loader，id 可含斜杠，由 rest 路由 `[...slug].astro` 承接）
- `src/lib/` 分三类：**纯逻辑**（posts.ts / notes.ts / path.ts / format.ts / reading-time.ts / pomodoro.ts / stand-reminder.ts，vitest 直接测）· **astro:content 封装**（只有 collections.ts——vitest 不加载 Astro 插件，`astro:content` 导入绝不能进纯逻辑模块）· **DOM 适配层**（`pomodoro.ts` 之外的 `stand-reminder-client.ts`：摸 localStorage / Notification / 定时器，与两个宿主页面共用，无 vitest，靠冒烟覆盖）
- 整点站立提醒（2026-09-17）：**独立于番茄钟**——存储 key `stand-reminder`（不吃 `pomodoro` 的版本化 payload）、面板里独立开关、默认关闭、番茄钟不开也提醒。`Pomodoro.astro` 与 `pages/pomodoro.astro` 各自建一份 `createStandReminder()`（降级小窗可能是主标签页关掉后唯一活着的窗口，必须有自带调度器）；Document PiP 不需要调度代码，由主页面 `renderPip` 驱动。通知用 `tag` + **`renotify: true` 成对出现**（只有 tag 时浏览器静默替换上一条，第二条不响 = 功能失效）；`new Notification` 必须 try/catch（Chrome Android 没实现构造函数，但 permission 仍是 granted）。CSS 有坑：`[data-stand="1"]` 单独写会输给 `[data-state][data-phase]` 的特异性；整条 `animation` 要一起替掉，单独加 `box-shadow` 会被既有呼吸关键帧吃掉；`prefers-reduced-motion` 的 `animation:none` 必须写**完整选择器**凑同特异性，否则是空操作（站内曾有三处这种哑弹）
- 路由：`pages/posts/[...slug].astro` 与 `pages/notes/[...slug].astro` 镜像结构，共用 `PostLayout`（Props 是 `ContentEntryLike` 结构类型 + `basePath` 区分前缀）。`pages/notes/[category].astro` 是**自动分类页**（列表由 collection 推导，加笔记不用改它），`params` 只生成 `NOTE_CATEGORY_VALUES` 里那三个，与 rest 路由无冲突
- 索引职责划分：**分类页 `pages/notes/[category].astro` 是各分类唯一的索引**（列表完全由 collection 推导）。曾经并存的「分类总览」（`<分类>/overview`）**已删除**——它同时被当成策展文章和索引，结果每加一篇笔记都要回去改手写列表，并被冒烟断言和图谱连通性一起锁死。**不要再引入手写索引**：加笔记不需要动任何手写文件。笔记列表组件 `components/NoteList.astro`（分类页与笔记索引共用；tags 页样式有分叉，未合并）
- 索引页不是笔记：`/notes/<分类>/` 是路由不是内容，正文里写 `[AI 原理](/notes/ai/)` 这种标准链接是安全的——`backlinks.ts` 的 `NOTE_LINK_RE` 命中后会查 `index.byId`，查不到就静默忽略（无幻影边、无构建警告）
- 搜索：标题索引由 BaseLayout 构建期内联到页面（`<script type="application/json">` + `set:html`；`<` 写成 JSON 转义序列防 `</script>` 逃逸——script 是原始文本元素，不能用 Astro 表达式转义，`&quot;` 不会解码回引号）；`Search.astro` 每次搜索从 DOM 现读索引，过滤逻辑在纯函数 `src/lib/search.ts`
- GitHub 联动：`scripts/fetch-github-profile.mjs <用户名>` 生成 `src/data/github-profile.json` + `public/images/github-avatar.*`（均提交进 git，离线可构建）；Sidebar 构建期读 JSON 渲染头像+昵称，读不到回退「博/我的博客」占位
- KaTeX（remark-math + rehype-katex）全局启用，但 `katex/dist/katex.min.css` **只在 notes 路由引入**——公式字体不得泄漏到文章/首页
- 知识库（2026-09）：wikilink 解析纯逻辑在 `src/lib/wikilinks.ts`，remark 薄壳 `src/plugins/remark-wikilinks.ts`（fs 扫 notes 建 id/basename/主标题三路索引，进程内惰性一次）。三形态：`[[mcu-gpio]]`/`[[二极管基础]]`（主标题，title 剥「——」副题后索引）/`[[x|别名]]`；歧义多候选拒绝猜（警告列出候选），未命中渲染纯文本+构建警告不 fail build。反链 `src/lib/backlinks.ts`（双语法：wikilink + 手写 `/notes/<id>/` 标准链接，source→target 去重、自链忽略），`collections.ts#getBacklinkIndex()` 是唯一入口。图谱 `src/lib/graph.ts`（确定性分类多圆环布局——`CENTER`/`RING` 是 `Record<NoteCategory,…>`，**加分类必须同时补这两处**，否则类型检查失败且运行时 `TypeError`；`RING` 的圆弧缺口给节点最多、标题最长的 ai 环让开中线；**禁随机性**，同输入同输出有 vitest 断言），页面 `/notes/graph/`（SVG，静态段优先于 [...slug] 无冲突）。图谱标签在独立图层 `labelLayer`（class `graph-labels`）里、**不在 `.graph-node` 内部**——改图层结构必须同步改 CSS 选择器，否则文字命中 0 个元素、退回 SVG 默认黑字 16px，在暗底上完全隐形（踩坑：87 项冒烟全绿而图上一个字都没有）；标签重叠靠客户端一遍确定性竖直避让兜底（环间隙 148px < 12 字标题 142px，错行补不满）。**图谱的边只来自正文链接**（`extractOutgoingLinks`：wikilink + 手写 `/notes/<id>/`）——`tags` 完全不参与构图，只喂 `/tags/` 页，所以给孤立节点补标签**不会**让它脱离孤立，只能靠正文互链（孤立是合法状态，淡显即可，冒烟只断言标记与真实度数一致）。全文搜索双层索引：标题索引内联（首屏）+ `/search-index.json`（`src/pages/search-index.json.ts` 端点，`markdownToPlainText` 去语法），客户端模块级 promise 缓存按需 fetch，失败降级标题搜索。`.claude/skills/` 有 obsidian-markdown/defuddle skill；本地 Obsidian vault 即本仓库（附件文件夹 `public/images/`，![[x.png]] 渲染为 /images/x.png）

## 关键约定

**软导航重初始化**：ClientRouter（View Transitions）下 body DOM 每次导航被替换，`document` 级监听器存活。组件脚本的模式：定义 `init()` → 立即调用 → `document.addEventListener("astro:page-load", init)`（见 CopyCode.astro）。

**transition:persist 的侧栏**：Sidebar 跨导航保留旧 DOM，构建期烘焙的 active 会过期——客户端 `syncActive()` 必须与构建端 `isActive()` 用**同一套规则**。前缀匹配写 `current.startsWith(href)`（href 自带尾斜杠，段安全）；不要写 `startsWith(href + "/")`——会拼出 `//` 永不命中（已踩坑，见 verification.md §6）。

**路由转场**（animations.css）：旧页快照 70ms 快速淡出、新页 180ms 淡入上浮。不要改回交叉淡化——新旧页同时半透明会叠出残影（用户明确不要）。

**排序即时间戳**：文章/笔记排序比较 `pubDate.getTime()` 全精度，同刻再按 id 字典序。迁移内容时保留 `'YYYY-MM-DD HH:mm:ss'` 原字符串（`z.coerce.date()` 解析），秒级差异决定上下篇链条。

**内容 frontmatter**：posts = title/description/pubDate/updatedDate?/heroImage?/draft（默认 false）；notes = title/description(默认 "")/pubDate/category（embedded|hardware|ai）。草稿不进任何公开视图（filterPublished 单一管道）。

## 冒烟测试注意

- TOC 滚动追踪断言必须**渐进滚动**（多次 350px + 等待）——单次大跳跃会让所有标题落在 IntersectionObserver 的 15%-30% 视口带之外，必挂
- 搜索用例按**标题文本**定位目标结果（内容量增大后命中数会变，不能假定固定位次）
- C 代码高亮的标记是 `pre[data-language="c"]`（Shiki 把语言放 data 属性）
- 假时钟（`page.clock`）三个坑：`install(time=)` 的**数字单位是 Unix 秒**（传毫秒会 ×1000 落到公元 57000 年，表现是「什么都没发生」）；它挂在 **context 上且无法卸载**，会污染之后所有用例，必须开独立 context；新 context 存储为空，靠 `add_init_script` 播种（它在页面脚本之前跑，正好在读 localStorage 之前）。快进字符串要略大于定时器延时（`"30:01"` 而不是 `"30:00"`），差一秒就是不触发
- **产物级扫描**（直接读 `dist/**/*.html`，`DIST` 常量）用来覆盖页面级断言看不见的一类问题：**删内容后残留的死链**。删一篇笔记时正文里的引用若漏改一处就是 404，但没有任何页面级断言会红——只有访问到那一页、点到那个链接才会。现有两条：`全站无指向已删除分类总览的死链`、`分类总览页面已从产物中消失`。加扫描断言时记得 `bool(html_files)` 兜底：产物不存在时 `rglob` 返回空，断言会**假绿**

## 历史包袱提示

`src/content/` 里 2026-07 之前的迁移内容源自旧 Next.js 博客（脚本 `scripts/migrate-iustitiae.py`，一次性）。旧站 CMS 曾丢表格管道符，坍塌行已全部重建——若再见到超长无管道的乱行，是同类病害，参照 git log 8a94ba2 的修复方式。验收记录在 `docs/superpowers/verification.md`。

**锁文件跨平台坑**：本机在 Windows，CI 在 linux。npm 按平台裁剪理想树——Windows 上生成的锁可能缺 linux 侧可选依赖的传递项（曾缺 `@emnapi/core|runtime@1.11.3`，`@img/sharp-wasm32` 需要，导致 CI 的 `npm ci` EUSAGE）。改动依赖后若 CI 报 `Missing: xxx from lock file`，从 registry.npmjs.org 取该版本元数据补进 lock 顶层条目（参照 git log「补锁 @emnapi」提交）。另外 `.npmrc` 已固定官方源——本机全局是 npmmirror 镜像，**不要**用 `--registry` 镜像参数重装，否则锁文件 resolved 全部改写回镜像、CI 再挂。

**内容渲染缓存坑**：Astro content layer 把 markdown 渲染结果缓存在 **`node_modules/.astro/`**（data-store）——改 remark/rehype 插件代码后光清 `.astro/`、`dist/`、`node_modules/.vite` 都不够，**必须连 `node_modules/.astro` 一起删**再 build，否则构建复用旧渲染产物、新插件逻辑完全不生效（症状：vitest 过、dist 不变、插件内探针日志不打印；已踩坑，排查半天）。

**部署**：GitHub Pages 用户站点仓 `iustitiae233.github.io`（同仓库即源码），自定义域名 `www.iustitiae.top`（DNS 已指向 Pages），main 推送 → CI（verify → deploy）。旧站备份在本地分支 `old-blog-backup`。
