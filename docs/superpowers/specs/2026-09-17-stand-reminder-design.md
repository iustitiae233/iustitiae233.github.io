# 整点站立提醒设计规格 —— 番茄钟面板里的独立开关

日期：2026-09-17
状态：已实现（check / test / build / smoke 全绿，110/110）

## 1. 目标

用户想要「每个整点提醒站起来活动一下，不要久坐」，挂到既有的番茄钟那一块。

- **与番茄钟正交**：番茄钟不开也提醒。独立开关、独立存储 key，互不影响
- **默认关闭**：不主动申请通知权限，用户点了开关才走权限询问
- **到点 5 分钟内不重复**：超出宽限窗视为「错过」，不补账（休眠唤醒后不会连环弹）
- **不静默失败**：通知不可用（权限被拒 / 浏览器没实现构造函数）时降级为站内琥珀闪烁，并把原因写在面板文案里
- **已打开的置顶小窗一起闪**：Document PiP 与 `/pomodoro/` 降级页都跟着进琥珀态

### 翻转的旧决策

[2026-09-05-pomodoro-design.md](./2026-09-05-pomodoro-design.md) §「明确不做」写过「不做系统通知（Notification API 权限弹窗打断感）」。本次是新需求翻转了这半条，区别在于**打断感由用户自己承担**：整点提醒默认关闭，只有用户主动打开开关时才会在用户手势里发起 `requestPermission()`。番茄钟自己的阶段结束仍然只走视觉，没有提示音、没有通知。旧文档对应位置已就地加注指向本文。

## 2. 文件与模块边界

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/lib/stand-reminder.ts` | 新增 | **纯逻辑**：整点网格编号、距下一个整点的毫秒数、是否到点（宽限窗）、序列化。零 DOM、零 astro:content |
| `src/lib/stand-reminder.test.ts` | 新增 | vitest（21 例），边界集中在整点 / 整点±1ms / 宽限窗边界 |
| `src/lib/stand-reminder-client.ts` | 新增 | **DOM 适配层**：定时器 / localStorage / Notification / 跨窗口同步。两个宿主共用。**不属于** `src/lib/` 里「纯逻辑」那一类（见 CLAUDE.md 模块边界约定），无 vitest，由冒烟测试 8.9 节覆盖 |
| `src/components/Pomodoro.astro` | 修改 | 面板开关 + 文案四态、胶囊/迷你卡/PiP 琥珀态、`announce()` 抽取 |
| `src/pages/pomodoro.astro` | 修改 | 降级小窗自带调度器 + `.pop` 琥珀态 + 标题翻转 |
| `scripts/smoke-test.py` | 修改 | 8.9 节：A 开关路径（真权限）、B 触发路径（假时钟） |

调度器抽成共享模块而不是在两个页面各写一份：`/pomodoro/` 那份几乎必然漏掉「开关被另一个窗口关掉」的同步。

**为什么降级小窗需要自己的调度器**：Document PiP 是空白文档、随 opener document 关闭而消失，所以它不需要调度代码；但 `window.open` 的 `/pomodoro/` 是 Firefox/Safari 下唯一能「主标签页关掉后仍在」的窗口，必须自带调度器，不能只等主页面广播。

## 3. 纯逻辑（`src/lib/stand-reminder.ts`）

```ts
export const HOUR_MS = 3_600_000;
export const GRACE_MS = 5 * 60_000;   // 显式决策点，非默认值：到点后 5 分钟内不重复
export interface StandState { enabled: boolean; lastFiredHour: number }  // -1 = 从未提醒
export const hourIndexOf  = (now: number) => Math.floor(now / HOUR_MS);
export const msToNextHour = (now: number) => (hourIndexOf(now) + 1) * HOUR_MS - now;
export function dueHour(now, lastFiredHour): number | null;
export const formatHour = (h) => `${String(new Date(h * HOUR_MS).getHours()).padStart(2, "0")}:00`;
```

`hourIndexOf` 是 UTC 整点网格。在整小时偏移的时区（中国 +8、CI 的 UTC）下与本地 `:00` 完全重合，所以它既能当「唯一编号」与 `lastFiredHour` 比大小，又能喂给 `formatHour` 出本地文案。**半时区（如 +05:30）会错位**——本站只面向 zh-CN，不做处理。

`dueHour` 返回 `null` 的三种情况：已提醒过（`h <= lastFiredHour`）、时钟回拨（同上）、超出宽限窗（`now - h*HOUR_MS > GRACE_MS`）。**不做「补账」**：跨过多个整点后回到页面只为当前小时的宽限窗命中，不会连环补。

`parseStand` 逐字段严格校验（照抄 `pomodoro.ts` 的风格）：`JSON.parse` 对 `1e999` 不抛异常（得到 `Infinity`），所以只判 `typeof` 挡不住，必须 `Number.isFinite` + `>= -1`。任何异常返回默认态，不抛。

存储 key：`localStorage("stand-reminder")`，版本化 payload `{ version: 1, ... }`，**独立于** `pomodoro` key——不污染番茄钟的 payload，降级小窗的 parse 路径也不用动。

## 4. 调度器不变量（`src/lib/stand-reminder-client.ts`）

- **关闭态零定时器**。开启时 `setTimeout(cb, msToNextHour(Date.now()) + 250)`；`+250ms` 保证回调落在新整点之后，与 arm 发生得多晚无关（踩在 0ms 上会被 `hourIndexOf` 算回上一小时）。回调里 `check(); arm();` 重新武装——`arm()` 无参重算，所以休眠 3 小时后唤醒 → 超出宽限不补 → 直接瞄准下一个整点。
- **`check()` 以落盘值为准**，不信任内存里的 `enabled`：另一个窗口可能刚把它关掉。注释诚实说明 read→write 之间仍可交错，**这不是 CAS**——真同时触发会发两条通知，同一个 `tag` 让它们视觉合并。
- **`fire()` 必须先 try/catch 再闪烁**：Chrome for Android / WebView 从未实现 `Notification` 构造函数，调用直接抛 `TypeError: Illegal constructor. Use ServiceWorkerRegistration.showNotification() instead.`，而 `Notification.permission` 仍是 `"granted"`。只判权限会抛异常炸掉整条路径，恰好把「通知不可用就降级纯视觉」的设计意图反过来。本站不引 service worker（零依赖），Android 上退化为纯站内闪烁是已知可接受行为。
- **`renotify: true` 是功能性的，不是锦上添花**：`tag` 相同且未设 `renotify` 时浏览器**替换**上一条通知且不弹横幅、不发声。用户 14:00 那条没点掉，15:00 就完全无声。`renotify` 依赖 `tag`，两者成对出现。该属性尚未进 TS 的 `lib.dom.d.ts`，在模块内 `declare global` 补声明（沿站内 `documentPictureInPicture` 的既有做法）。
- **`perm()` 每次实时读**，不缓存——用户事后在浏览器设置里改掉权限时文案能自愈。
- **`toggle()` 先落盘先武装再问权限**：`await requestPermission()` 期间 UI 不空转，连点两次的竞态被「先落盘」自然吃掉。开启时把 `lastFiredHour` 置为**当前**小时编号，语义是「从下一个整点开始提醒」——否则 14:02 开启会命中 14:00 的宽限窗、当场弹一次。
- **`visibilitychange` 转前台补算 + 重武装**：后台标签页定时器被节流、休眠唤醒后可能整体错过。
- **`storage` 监听要把 `enabled` 同步回来并清定时器**（只做「闪」不做「关」是错的）；落盘 `lastFiredHour === hourIndexOf(now)` 时也跟着闪。

## 5. 渲染接入

**文案四态**（面板 `[data-stand-next]`）：

| 态 | 文案 |
|---|---|
| 关 | 每小时提醒你站起来活动 |
| 开 | 下次 HH:00 |
| 开 + 权限被拒 | 下次 HH:00 · 通知已被拒绝，仅站内闪烁 |
| 开 + 无 Notification | 下次 HH:00 · 浏览器不支持通知，仅站内闪烁 |

开关是 `role="switch"` + `aria-checked`——`aria-checked` 放在裸 `<button>` 上是无效 ARIA，加了 `role` 冒烟断言的才是真语义。

`announce()` 从 `commit()` 里抽出来是因为提醒**不能**走 `commit`：那会白写一次 `pomodoro` key 并触发 `ensureTicker()`，语义错了。提醒同时写 `[data-pomo-live]` 与 PiP 的 `[data-pip-live]`——通知不可用时这条播报是屏幕阅读器唯一听得到的提醒。

**点击委托**里 `[data-stand-toggle]` 分支必须排在 `if (!panel.contains(t)) closePanel()` 兜底**之前**，否则点开关会顺手关掉面板（冒烟有专门一条锁住它）。清除闪烁放在 `[data-pomodoro-open]` 分支最前，否则固定态下点击不清闪。

### CSS 的两个坑

1. **特异性**：`#pomodoro-pill[data-stand="1"]` 是 (1,2,0)，输给 (1,3,0) 的 `#pomodoro-pill[data-state="running"][data-phase="focus"]`——琥珀边框在 running 态完全不生效。必须补一个属性凑同特异性（`[data-stand="1"][data-state]`），并写在态规则之后。
2. **动画来源优先于普通声明**：整条 `animation` 属性必须一起替掉，单独写 `box-shadow` 会被 `pomo-breathe-cyan` 的关键帧吃掉。代价是闪烁期间 awaiting 的呼吸被顶掉 60 秒，可接受。`/pomodoro/` 页的 `.pop` 反过来——它的 awaiting 关键帧动的正是 `box-shadow`，所以琥珀态只动 `border-color` 与 `background`，连特异性都不必争。

`--accent-3`（琥珀）是第三语义，与专注青 / 休息紫正交；亮色主题下它是 `#b45309`，所以用 `color-mix` 半透明而不是实心琥珀底，两套主题都安全。

**顺带修掉的既有 bug**：三处 `prefers-reduced-motion` 抑制规则（胶囊 awaiting、迷你卡、`.pop`）今天全是空操作——`.pomo-mini{animation:none}` 是 (0,2,0)，输给 (0,4,0) 的呼吸规则；`#pomodoro-pill[data-state="awaiting"]` 是 (1,2,0)，输给 (1,3,0)。已在产物 CSS 里逐条核对，本轮一并补全选择器。**新增的琥珀规则同理必须写完整选择器**，否则「减少动效」下用户得到的是毫无提示而不是静态琥珀底。

## 6. 冒烟测试（`scripts/smoke-test.py` §8.9）

**A 开关路径**（共享 context，`permissions=["notifications"]`）：点开关 → `wait_for_selector('[aria-checked="true"]')`（`toggle` 是 async，裸断言会闪失败）→ 断言不关面板、文案变「下次 HH:00」、落盘 `"enabled":true`；再点一次复原。permission 已 granted，走不到 `requestPermission` 分支——「被拒/不支持」两档文案留给手工验收。

**B 触发路径（假时钟）——三个已核实的坑**：

1. **`clock.install(time=)` 的数值单位是 Unix 秒**（Playwright `_impl/_clock.py` 的 `parse_time`：数字一律 `int(t * 1000)`）。传毫秒会再乘一次、落到公元 57000 年，表现是「什么都没发生」而不是报错。
2. **`page.clock` 是 context 级的且无法卸载**（`_impl/_page.py`：`Page.clock` → `self._browser_context.clock`）。在共享 context 上 install 会把之后所有页面换成假时钟。**必须用独立 context**（顺带隔离存储）。
3. **新 context 存储为空**，必须靠 `add_init_script` 播种（它在页面脚本之前跑，正好在 `load()` 读盘之前）；桩必须带**静态 `permission` 属性**，否则 `perm()` 拿到 `undefined`，永远不进 `new Notification` 分支，用例以「没有通知」失败而看不出原因。顺带把 `pomodoro` 播成闲置态，那条「与番茄钟独立」的断言才真的成立。

**时序配方**：`install` 只替换定时器实现，时间仍按 1 倍真实速率流动，所以「加载后未触发」是竞态——假时钟会在约 30 分钟后自己走到边界。基准取**当前整点后的 :30**，留 30 分钟真实时间余量，于是不需要 `pause_at` 两段式。快进写 `"30:01"`（30 分 1 秒 > 30 分 0.25 秒）；**写成 `"30:00"` 定时器不会触发**——别「顺手整理」成整分钟，那会变成一条极难排查的假失败。

`lastFiredHour` 的断言用**网格编号** `base // HOUR_MS + 1`，不是本地小时——后者是与 `formatHour` 同坐标系的另一种数，混用会得到一条永远失败的断言。

## 7. 手工验收（headless 覆盖不到的）

1. 面板开「整点提醒」→ 浏览器弹权限询问 → 允许
2. 等下一个整点，确认收到系统通知且顶栏胶囊琥珀闪烁
3. **上一条通知留着不点掉**，等下一个整点确认第二条仍会弹横幅/发声（验 `renotify`）
4. 开 Document PiP 小窗 + 另开 `/pomodoro/` 降级页，确认整点时都跟着闪
5. 浏览器设置里把通知改成「阻止」→ 重开面板，确认文案变「仅站内闪烁」且胶囊仍闪
6. 开两个标签页，在 A 关掉开关，确认 B 的定时器也停
7. 系统开「减少动效」→ 确认胶囊是静态琥珀底而不是毫无提示（同时验收 awaiting 呼吸这次真的被抑制）
