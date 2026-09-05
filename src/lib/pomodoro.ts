// 番茄钟状态机 —— 纯逻辑，零 DOM / 零 astro:content（vitest 直接测）。
// 核心不变量：剩余时间永远由调用方传入的墙钟 now 与 endsAt/remainingMs 推导，
// 不做递减计数器 —— 后台标签页 setInterval 节流到每分钟一次也无损。
export type Phase = "focus" | "short" | "long";

/** 各阶段时长（秒）：专注 25 / 短休 5 / 长休 15 */
export const DURATIONS: Record<Phase, number> = { focus: 1500, short: 300, long: 900 };

export interface PomodoroState {
  phase: Phase;
  running: boolean; // true 时 endsAt 有效
  endsAt: number | null; // epoch ms；非 running 时为 null
  remainingMs: number; // 暂停/待确认时冻结的剩余；running 时忽略
  completedFocus: number; // 自然走完的专注总数（周期圆点取 completedFocus % 4）
  awaiting: boolean; // 阶段自然结束、等待用户确认（呼吸态）
}

export const defaultState = (): PomodoroState => ({
  phase: "focus",
  running: false,
  endsAt: null,
  remainingMs: DURATIONS.focus * 1000,
  completedFocus: 0,
  awaiting: false,
});

export const fullMs = (phase: Phase): number => DURATIONS[phase] * 1000;

/** 剩余毫秒：running 用墙钟差（clamp 0），否则用冻结值 */
export function remainingOf(s: PomodoroState, now: number): number {
  if (s.running && s.endsAt !== null) return Math.max(0, s.endsAt - now);
  return Math.max(0, s.remainingMs);
}

/** 阶段自然结束后的下一阶段：第 4 个专注 → 长休，其余专注 → 短休，休息 → 专注 */
function nextPhase(phase: Phase, completedFocus: number): Phase {
  if (phase === "focus") return (completedFocus + 1) % 4 === 0 ? "long" : "short";
  return "focus";
}

/** 自然结束：完成计数、切换阶段、待确认（决策点：不自动开始下一阶段） */
export function advance(s: PomodoroState): PomodoroState {
  const completedFocus = s.phase === "focus" ? s.completedFocus + 1 : s.completedFocus;
  const phase = nextPhase(s.phase, s.completedFocus);
  return {
    phase,
    running: false,
    endsAt: null,
    remainingMs: fullMs(phase),
    completedFocus,
    awaiting: true,
  };
}

/** 跳过：换阶段但 completedFocus 不变（决策点：跳过 ≠ 完成） */
export function skip(s: PomodoroState): PomodoroState {
  const phase: Phase = s.phase === "focus" ? "short" : "focus";
  return { ...s, phase, running: false, endsAt: null, remainingMs: fullMs(phase), awaiting: false };
}

/** 重置：当前阶段回满时长并暂停；完成计数不动 */
export function reset(s: PomodoroState): PomodoroState {
  return { ...s, running: false, endsAt: null, remainingMs: fullMs(s.phase), awaiting: false };
}

export function start(s: PomodoroState, now: number): PomodoroState {
  const remaining = remainingOf(s, now);
  return { ...s, running: true, endsAt: now + remaining, remainingMs: remaining, awaiting: false };
}

export function pause(s: PomodoroState, now: number): PomodoroState {
  if (!s.running) return s;
  return { ...s, running: false, endsAt: null, remainingMs: remainingOf(s, now) };
}

/** 载入结算：running 且已过期 → 按自然结束结算一步，不连环追账 */
export function settleExpired(s: PomodoroState, now: number): PomodoroState {
  if (s.running && s.endsAt !== null && s.endsAt <= now) return advance(s);
  return s;
}

const STORAGE_VERSION = 1;

export function serialize(s: PomodoroState): string {
  return JSON.stringify({ version: STORAGE_VERSION, ...s });
}

/** 损坏/版本不符/字段非法 → 默认态；任何异常都不抛（隐身模式由调用方 try/catch 兜底） */
export function parse(raw: string | null): PomodoroState {
  const d = defaultState();
  if (!raw) return d;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (obj.version !== STORAGE_VERSION) return d;
    if (obj.phase !== "focus" && obj.phase !== "short" && obj.phase !== "long") return d;
    const phase = obj.phase;
    const endsAt =
      typeof obj.endsAt === "number" && Number.isFinite(obj.endsAt) ? obj.endsAt : null;
    const running = obj.running === true && endsAt !== null;
    const completedFocus =
      typeof obj.completedFocus === "number" &&
      Number.isFinite(obj.completedFocus) &&
      obj.completedFocus >= 0
        ? Math.floor(obj.completedFocus)
        : 0;
    const remainingMs =
      typeof obj.remainingMs === "number" &&
      Number.isFinite(obj.remainingMs) &&
      obj.remainingMs >= 0
        ? obj.remainingMs
        : fullMs(phase);
    return { phase, running, endsAt, remainingMs, completedFocus, awaiting: obj.awaiting === true };
  } catch {
    return d;
  }
}

/** mm:ss（ceil 语义：最后 1ms 显示 00:01，起点整秒显示满时长） */
export function formatMs(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
