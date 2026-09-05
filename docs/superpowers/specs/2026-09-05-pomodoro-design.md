# 番茄钟设计规格 —— 顶栏胶囊 + popover

日期：2026-09-05
状态：设计已获用户口头批准（入口形态 A / 功能范围 / 两个决策点），待 spec 审阅

## 1. 目标

为博客加入全站常驻的番茄钟：

- **入口即显示**：顶栏胶囊（搜索胶囊旁），闲置时是 `◎ 番茄钟`，运行时本身成为倒计时显示（`◉ 24:59`），浏览任何页面都能瞥见剩余时间
- **跨导航存活**：ClientRouter 软导航不打断计时；硬刷新/关标签页后回来，计时按墙钟继续结算
- **零框架零请求**：沿用站内「.astro 内联脚本」模式，无新依赖、无网络请求（环形进度 SVG、光晕用现有 token）
- **性能纪律**：只有 running 状态存在定时器（500ms），暂停/闲置零定时器；textContent 有变化才写

### 明确不做（YAGNI，用户已确认）

- 不做提示音（用户明确不要）——阶段结束用**视觉**补强（胶囊呼吸态 + 标题翻转）
- 不做系统通知（Notification API 权限弹窗打断感）
- 不做时长自定义（固定 25/5/15，后续要加容易）
- 不做统计/历史（localStorage 只存计时状态，不存记录）
- 不做独立工具页、全局快捷键、多计时器

## 2. 文件与模块边界

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/lib/pomodoro.ts` | 新增 | **纯逻辑状态机**：阶段/时长定义、剩余时间计算、阶段推进、过期结算、localStorage 序列化。零 DOM、零 astro:content（vitest 直接测） |
| `src/components/Pomodoro.astro` | 新增 | 胶囊按钮 + popover 面板；样式全 scoped；脚本沿用 Search.astro 模式（document 事件委托 + 动态查 DOM + `astro:page-load` 重同步） |
| `src/components/Topbar.astro` | 修改 | 搜索胶囊左侧渲染 `<Pomodoro />`（仅此一处改动） |
| `scripts/smoke-test.py` | 修改 | 追加番茄钟冒烟用例（见 §7） |

## 3. 状态机（`src/lib/pomodoro.ts`）

```ts
type Phase = "focus" | "short" | "long";

const DURATIONS: Record<Phase, number> = { focus: 1500, short: 300, long: 900 }; // 秒

interface PomodoroState {
  phase: Phase;
  running: boolean;        // true 时 endsAt 有效
  endsAt: number | null;   // epoch ms；暂停/待确认时为 null
  remainingMs: number;     // 暂停时冻结的剩余；running 时忽略
  completedFocus: number;  // 自然走完的专注总数（驱动周期圆点：completedFocus % 4）
  awaiting: boolean;       // 阶段自然结束、等待用户确认（呼吸态）
}
```

默认态：`{ phase: "focus", running: false, endsAt: null, remainingMs: 1500_000, completedFocus: 0, awaiting: false }`。

### 纯函数（全部以 `now: number` 显式传参，可测）

- `remainingOf(state, now)`：running → `max(0, endsAt - now)`；否则 `remainingMs`
- `advance(state)`：返回阶段推进后的**新 state**（不自动开始）：
  - focus 自然结束 → `completedFocus + 1`；新值 `% 4 === 0` → `long`，否则 → `short`
  - short / long 结束 → `focus`
  - 推进后 `running=false`、`endsAt=null`、`remainingMs=新阶段满时长`、`awaiting=true`
- `skip(state)`：换阶段但 **`completedFocus` 不变**（跳过 ≠ 完成）；focus 中跳过 → `short`；休息中跳过 → `focus`；`awaiting=false`
- `reset(state)`：当前阶段回满时长、暂停、`awaiting=false`；`completedFocus` 不动
- `start(state, now)` / `pause(state, now)`：设置/冻结 `endsAt` / `remainingMs`
- `settleExpired(state, now)`：载入时若 `running && endsAt <= now` → 按自然结束结算**一步**（等同 `advance`），不连环追账
- `serialize(state)` / `parse(raw)`：JSON roundtrip，payload 带 `version: 1`（未来字段变更时的迁移依据）；损坏/缺失/版本不符/字段非法 → 回默认态（`try/catch` 包裹，隐身模式下 localStorage 抛异常也不炸）
- `formatMs(ms)`：`mm:ss`（分钟可上到两位如 `25:00`，不进位到小时）

### 两个已批准的决策点

1. **阶段结束不自动开始下一阶段**：结束 → `awaiting` 呼吸态等用户点「开始」。理由：无声环境下自动链式会「无意识刷番茄」。
2. **跳过 ≠ 完成**：`skip` 不增加 `completedFocus`，只有自然走完才点亮周期圆点。

## 4. 数据流：三种存活场景

```
状态存两处：
  模块作用域（Pomodoro.astro 脚本） ── 软导航存活（ClientRouter 不重执行已加载模块）
  localStorage key "pomodoro"      ── 硬刷新/关标签存活（每次状态变更 write-through）
```

1. **软导航**（ClientRouter）：body DOM 被替换、模块状态与定时器存活。`astro:page-load` 时从模块状态重渲染胶囊（同 Sidebar `syncActive` 模式）。**不在模块顶层缓存 DOM 引用**（Search.astro 已注释的坑）。
2. **硬刷新**：模块初始化时 `parse(localStorage)` 恢复 → `settleExpired` 结算过期 → 渲染。
3. **后台节流**：剩余时间永远 `endsAt - Date.now()` 墙钟重算，不做递减计数器——后台 `setInterval` 降到每分钟一次也无损；`visibilitychange` 时主动重渲染。tick 内检测 `remaining <= 0` → `advance` + write-through + 渲染。

## 5. UI 规格

### 胶囊（`<button>`，Topbar 内，搜索胶囊左侧）

| 状态 | 外观 |
|---|---|
| 闲置 | `◎ 番茄钟`——与搜索胶囊同款 pill 样式（border/圆角/文字层级一致） |
| 运行 | `◉ mm:ss`，底色随进度线性填充（CSS 变量 `--p` 由 tick 更新）；**专注=青 `--accent`，休息=紫 `--accent-2`** |
| 暂停 | 同运行但半透明、时间冻结 |
| 待确认（awaiting） | accent glow **呼吸脉冲**动画（`prefers-reduced-motion` 下关闭，沿用全站约定） |

`@media (max-width: 767px)` 隐藏「番茄钟」文字，闲置收成纯图标；运行态 mm:ss 仅 5 字符不换行（`white-space: nowrap`）。

### popover 面板

- 胶囊下方锚定、右对齐顶栏边缘，宽约 300px，`z-index: 90`（低于搜索 modal 的 100，高于 topbar 的 30）
- 内容：大号 SVG 环形进度（`stroke-dasharray`，配色同上）+ mono 大字 mm:ss + 阶段名（专注/短休/长休）+ 四个周期圆点（`completedFocus % 4` 填充）+ 按钮：**开始/暂停**（主按钮）、**跳过**、**重置**
- 打开/关闭动画与 Search 面板同语言（`--ease-out` 短淡入上浮，reduced-motion 关闭）
- Esc / 点击面板外关闭（document 委托，同 MenuButton/Search 模式）

### 可访问性

- 胶囊：`aria-haspopup="dialog"`、`aria-expanded` 同步
- 面板：`role="dialog"` `aria-label="番茄钟"`；打开时焦点移入主按钮，关闭时焦点移回胶囊
- 阶段切换通过视觉隐藏的 `aria-live="polite"` 区域播报；**倒计时文本不进 live 区**（每秒播报是灾难）

### 标题同步（用户选定功能）

- running：`document.title = "mm:ss 专注 · " + baseTitle`（休息同理）
- awaiting：`"🍅 该专注了 · "` / `"☕ 该休息了 · " + baseTitle`
- `baseTitle` 在每次 `astro:page-load` 后取当前 `document.title`（软导航会重置标题，需重新前缀）；只在字符串变化时赋值；停止/无状态时保持 baseTitle 不动

## 6. 错误处理

| 场景 | 行为 |
|---|---|
| localStorage 不可用（隐身模式等） | `try/catch` 包裹读写，降级为纯内存态，功能不缺 |
| 存储内容损坏/版本不符 | `parse` 回默认态 |
| 过期发生在离开期间 | `settleExpired` 结算一步，不连环追账 |
| tick 时 DOM 里没有胶囊（极端时序） | 渲染函数判空直接返回，下个 tick 自愈 |

## 7. 测试

### vitest（`src/lib/pomodoro.ts`）

- 推进：focus 自然结束 → short；第 4 个完成 → long；short/long 结束 → focus；推进后 awaiting=true、不 running
- `skip` 不加 `completedFocus`；`reset` 只重置当前阶段
- `remainingOf`：running 用 endsAt、暂停用 remainingMs、clamp 到 0
- `settleExpired`：未过期原样；过期一步；过期数小时也只结算一步
- `serialize`/`parse` roundtrip；损坏 JSON / 非法字段回默认态
- `formatMs`：`1500000 → "25:00"`、边界 `0 → "00:00"`

### 冒烟（Playwright，29 → ~35 项）

1. 首页顶栏存在「番茄钟」胶囊
2. 点击打开面板（dialog 可见）
3. 开始 → 胶囊文本匹配 `\d\d:\d\d` 且标题以倒计时开头
4. 暂停 → 两次采样时间相同
5. 跳过 → 面板阶段变「短休」、时间回 `05:00`
6. 重置 → 回专注满时长
7. Esc 关闭面板

（全程用跳过/暂停驱动状态机，不真等 25 分钟。）

### 门禁

`check → test → build → smoke` 全绿才提交，commit message 中文 `feat: …`。

## 8. 性能预算

- 零网络请求、零新依赖、不引入岛屿（无水合成本）
- JS 增量：状态机 < 1KB gzip + 组件脚本约 2-3KB
- 唯一常驻开销：running 时 500ms interval（一次字符串比较 + 条件 textContent 写入）
