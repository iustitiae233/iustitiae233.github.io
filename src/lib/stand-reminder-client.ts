// 整点站立提醒的 DOM 适配层 —— 定时器 / localStorage / Notification / 跨窗口同步。
// 注意：这**不属于** src/lib/ 里「纯逻辑」那一类（见 CLAUDE.md 的模块边界约定），
// 它直接摸 DOM，因此没有 vitest —— 由 scripts/smoke-test.py 的 8.9 节覆盖。
// 纯时间数学在 ./stand-reminder。两个宿主（Pomodoro.astro 与 pages/pomodoro.astro）
// 共用本模块，避免降级小窗那份漏掉「开关被别的窗口关掉」的同步。
import {
  defaultStandState,
  dueHour,
  formatHour,
  hourIndexOf,
  msToNextHour,
  parseStand,
  serializeStand,
  type StandState,
} from "./stand-reminder";

// TS 的 lib.dom.d.ts 尚未收录 renotify（WHATWG 通知规范里有，Chrome/Firefox 均已实现）。
// 沿站内既有做法就地补声明（对比 Pomodoro.astro 里的 documentPictureInPicture），别用 any 绕。
declare global {
  interface NotificationOptions {
    /** 同一个 tag 再次提醒时是否重新弹横幅/发声；不设则静默替换上一条 */
    renotify?: boolean;
  }
}

const KEY = "stand-reminder";
/** 越过边界再触发，避免踩在 0ms 上被 hourIndexOf 算回上一小时 */
const BOUNDARY_SLACK_MS = 250;
/** 提醒态（琥珀闪烁）持续时间 */
const FLASH_MS = 60_000;

export type StandPermission = NotificationPermission | "unsupported";

export interface StandHooks {
  /** 提醒态开 / 关 —— 宿主据此渲染胶囊、迷你卡、PiP 的琥珀态 */
  onFlash(active: boolean): void;
  /** 开关或权限变化 —— 有开关 UI 的宿主据此刷新「下次 HH:00」文案（降级小窗不需要） */
  onState?(): void;
}

export interface StandApi {
  /** 宿主就绪 / 软导航后调用：重读落盘值、重新武装、刷新文案 */
  sync(): void;
  toggle(): Promise<void>;
  state(): StandState;
  permission(): StandPermission;
}

export function createStandReminder(hooks: StandHooks): StandApi {
  let stand: StandState = defaultStandState();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  refresh();

  /** 实时读、不缓存：用户事后在浏览器设置里改掉权限时，文案能自愈 */
  function perm(): StandPermission {
    return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  }

  /** 从 localStorage 重读内存态。读不到（隐身模式）时返回 false 并保留内存态 —— 本次会话内仍能触发，只是刷新即回到关闭 */
  function refresh(): boolean {
    try {
      stand = parseStand(localStorage.getItem(KEY));
      return true;
    } catch {
      return false;
    }
  }

  function save(s: StandState) {
    try {
      localStorage.setItem(KEY, serializeStand(s));
    } catch {
      /* 隐身模式：跳过持久化 */
    }
  }

  /** 定时器 ≤ 1 个，且只在开启时存在；关闭调用它即清零 */
  function arm() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (!stand.enabled) return;
    timer = setTimeout(() => {
      check();
      arm(); // 无参重算：休眠数小时后唤醒 → 超出宽限窗不补账 → 直接瞄准下一个整点
    }, msToNextHour(Date.now()) + BOUNDARY_SLACK_MS);
  }

  function check(now = Date.now()): boolean {
    refresh(); // 内存以落盘为准：开关可能已被另一个窗口关掉
    if (!stand.enabled) return false;
    const due = dueHour(now, stand.lastFiredHour);
    if (due === null) return false;
    // 诚实说明：read → write 之间仍可交错，这不是 CAS，只是把多窗口重复触发的窗口缩到极小。
    // 真撞上会发两条通知，同一个 tag 让它们在系统侧视觉合并。
    stand = { ...stand, lastFiredHour: due };
    save(stand);
    fire(due);
    return true;
  }

  function fire(hour: number) {
    try {
      if (perm() === "granted") {
        // Chrome for Android / WebView 从未实现 Notification 构造函数，此处必抛 TypeError
        // （permission 却仍是 granted）。异常必须吞在这里，否则连视觉降级一起炸掉——
        // 那恰好把「通知不可用就降级为纯视觉」的意图反过来了。
        new Notification(`${formatHour(hour)} · 该站起来了`, {
          body: "起来接杯水、走两步，5 分钟后回来。",
          tag: "stand-reminder",
          // 同一个 tag 不带 renotify 时浏览器会**静默替换**上一条：上一条没点掉，这一条就不响，
          // 整点提醒的核心价值就没了。renotify 依赖 tag，两者成对出现。
          renotify: true,
        });
      }
    } catch {
      /* 通知不可用：静默降级为站内闪烁 */
    }
    hooks.onFlash(true);
    if (flashTimer !== null) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flashTimer = null;
      hooks.onFlash(false);
    }, FLASH_MS);
  }

  async function toggle() {
    if (stand.enabled) {
      stand = { ...stand, enabled: false };
      save(stand);
      arm();
      hooks.onState?.();
      return;
    }
    // 先落盘先武装：await 权限期间 UI 不空转，连点两次的竞态也被自然吃掉。
    // 开启时把 lastFiredHour 置为**当前**小时编号，语义是「从下一个整点开始提醒」——
    // 否则 14:02 开启会命中 14:00 的宽限窗，当场弹一次。
    stand = { enabled: true, lastFiredHour: hourIndexOf(Date.now()) };
    save(stand);
    arm();
    hooks.onState?.();
    try {
      // requestPermission 必须在用户手势里发起 —— 本函数只由开关点击调用，满足
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        await Notification.requestPermission();
      }
    } catch {
      /* 不支持 requestPermission：照开，降级纯视觉，不让开关点了没反应 */
    }
    hooks.onState?.();
  }

  // 后台标签页定时器被节流、休眠唤醒后可能整体错过 —— 回前台补算并重武装
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    check();
    arm();
  });

  // 跨窗口：另一个窗口改了开关，或刚刚触发过提醒
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key !== KEY) return;
    refresh();
    arm(); // 被关掉 → 内部清定时器；被打开 → 补武装
    if (stand.lastFiredHour === hourIndexOf(Date.now())) hooks.onFlash(true);
    hooks.onState?.();
  });

  return {
    sync() {
      refresh();
      arm();
      hooks.onState?.();
    },
    toggle,
    state: () => stand,
    permission: perm,
  };
}
