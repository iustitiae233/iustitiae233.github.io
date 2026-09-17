// 整点站立提醒 —— 纯逻辑，零 DOM / 零 astro:content（vitest 直接测）。
// 与番茄钟（pomodoro.ts）同纪律：时间永远由调用方传入的墙钟 now 推导，不做递减计数器。
// DOM 侧（定时器 / localStorage / Notification）在 stand-reminder-client.ts，两页共用。
export const HOUR_MS = 3_600_000;

/** 到点后的宽限窗：超出即视为「错过」，不补提醒（决策点，非默认值） */
export const GRACE_MS = 5 * 60_000;

export interface StandState {
  enabled: boolean;
  /** 已提醒过的整点编号；-1 = 从未提醒 */
  lastFiredHour: number;
}

export const defaultStandState = (): StandState => ({ enabled: false, lastFiredHour: -1 });

/**
 * 墙钟 → 整点编号。基于 UTC 整点网格（floor(now / 1h)），
 * 在整小时偏移的时区（中国 +8、CI 的 UTC）下与本地 :00 完全重合，
 * 与 formatHour 的 getHours() 一致。半时区偏移（如 +5:30）下两者会差半小时。
 */
export const hourIndexOf = (now: number): number => Math.floor(now / HOUR_MS);

/** 距下一个整点的毫秒数（now 恰落在整点时返回 HOUR_MS，不会退化成 0） */
export const msToNextHour = (now: number): number => (hourIndexOf(now) + 1) * HOUR_MS - now;

/**
 * 该不该为「当前所处的小时」提醒。返回要提醒的整点编号，或 null。
 * 三条例外：已提醒过（含时钟回拨）/ 超出宽限窗（错过不补）。
 */
export function dueHour(now: number, lastFiredHour: number): number | null {
  const h = hourIndexOf(now);
  if (h <= lastFiredHour) return null;
  if (now - h * HOUR_MS > GRACE_MS) return null;
  return h;
}

/** 整点编号 → 本地时区的 "HH:00" 文案 */
export function formatHour(hourIndex: number): string {
  const h = new Date(hourIndex * HOUR_MS).getHours();
  return `${String(h).padStart(2, "0")}:00`;
}

const STORAGE_VERSION = 1;

export function serializeStand(s: StandState): string {
  return JSON.stringify({ version: STORAGE_VERSION, ...s });
}

/**
 * 损坏/版本不符/字段非法 → 默认态；任何异常都不抛（隐身模式由调用方 try/catch 兜底）。
 * 逐字段校验是必需的：JSON.parse 对 {"lastFiredHour":1e999} 不会抛，会静默给出 Infinity。
 */
export function parseStand(raw: string | null): StandState {
  const d = defaultStandState();
  if (!raw) return d;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (obj.version !== STORAGE_VERSION) return d;
    if (obj.enabled !== true && obj.enabled !== false) return d;
    if (
      typeof obj.lastFiredHour !== "number" ||
      !Number.isFinite(obj.lastFiredHour) ||
      obj.lastFiredHour < -1
    ) {
      return d;
    }
    return { enabled: obj.enabled, lastFiredHour: Math.floor(obj.lastFiredHour) };
  } catch {
    return d;
  }
}
