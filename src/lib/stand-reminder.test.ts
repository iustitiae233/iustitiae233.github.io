import { describe, expect, it } from "vitest";
import {
  defaultStandState,
  dueHour,
  formatHour,
  GRACE_MS,
  HOUR_MS,
  hourIndexOf,
  msToNextHour,
  parseStand,
  serializeStand,
} from "./stand-reminder";

/** 恰好落在整点网格上的基准时刻（472222 × 3600000），便于表达边界 */
const H0 = 1_699_999_200_000;
const H = hourIndexOf(H0);

describe("hourIndexOf / msToNextHour", () => {
  it("整点上：编号就是该小时，距下一个整点是满一小时", () => {
    expect(hourIndexOf(H0)).toBe(H);
    expect(msToNextHour(H0)).toBe(HOUR_MS);
  });
  it("整点后一毫秒：仍在同一小时，差一毫秒到下一个整点", () => {
    expect(hourIndexOf(H0 + 1)).toBe(H);
    expect(msToNextHour(H0 + 1)).toBe(HOUR_MS - 1);
  });
  it("半点：距下一个整点半小时", () => {
    expect(msToNextHour(H0 + 1_800_000)).toBe(1_800_000);
  });
  it("整点前一毫秒：距下一个整点一毫秒", () => {
    expect(hourIndexOf(H0 - 1)).toBe(H - 1);
    expect(msToNextHour(H0 - 1)).toBe(1);
  });
});

describe("dueHour", () => {
  it("刚过整点且未提醒过 → 命中该整点", () => {
    expect(dueHour(H0 + 60_000, H - 1)).toBe(H);
  });
  it("恰好卡在宽限窗上仍算命中（含边界）", () => {
    expect(dueHour(H0 + GRACE_MS, H - 1)).toBe(H);
  });
  it("超出宽限窗一毫秒 → 错过不补", () => {
    expect(dueHour(H0 + GRACE_MS + 1, H - 1)).toBeNull();
  });
  it("同一小时内已提醒过 → 不重复", () => {
    expect(dueHour(H0 + 60_000, H)).toBeNull();
  });
  it("时钟回拨（落盘值比当前小时还新）→ 不提醒", () => {
    expect(dueHour(H0 + 60_000, H + 1)).toBeNull();
  });
  it("整点上（宽限窗起点）→ 命中", () => {
    expect(dueHour(H0, H - 1)).toBe(H);
  });
  it("跨过多个整点后回到页面 → 只认当前小时的宽限窗", () => {
    // 从 H-3 那一小时离开，H+2 分钟回来：只可能为 H 命中，不会连环补账
    expect(dueHour(H0 + 120_000, H - 3)).toBe(H);
    expect(dueHour(H0 + 20 * 60_000, H - 3)).toBeNull();
  });
});

describe("formatHour", () => {
  it("形如 HH:00", () => {
    expect(formatHour(H)).toMatch(/^\d{2}:00$/);
  });
  it("相邻整点文案相差一小时（跨日按 24 取模）", () => {
    const a = Number(formatHour(H).slice(0, 2));
    const b = Number(formatHour(H + 1).slice(0, 2));
    expect(b).toBe((a + 1) % 24);
  });
});

describe("serializeStand / parseStand", () => {
  it("往返一致", () => {
    const s = { enabled: true, lastFiredHour: 472222 };
    expect(parseStand(serializeStand(s))).toEqual(s);
  });
  it("默认态往返一致", () => {
    expect(parseStand(serializeStand(defaultStandState()))).toEqual(defaultStandState());
  });
  it("null / 非 JSON / 版本不符 → 默认态", () => {
    expect(parseStand(null)).toEqual(defaultStandState());
    expect(parseStand("not json")).toEqual(defaultStandState());
    expect(parseStand('{"version":2,"enabled":true,"lastFiredHour":1}')).toEqual(defaultStandState());
  });
  it("enabled 非布尔 → 默认态（只判 typeof 挡不住字符串）", () => {
    expect(parseStand('{"version":1,"enabled":"yes","lastFiredHour":1}')).toEqual(defaultStandState());
  });
  it("lastFiredHour 为 Infinity（1e999 不抛异常）→ 默认态", () => {
    expect(parseStand('{"version":1,"enabled":true,"lastFiredHour":1e999}')).toEqual(
      defaultStandState(),
    );
  });
  it("lastFiredHour 小于 -1 → 默认态", () => {
    expect(parseStand('{"version":1,"enabled":true,"lastFiredHour":-2}')).toEqual(defaultStandState());
  });
  it("小数 lastFiredHour 向下取整", () => {
    expect(parseStand('{"version":1,"enabled":true,"lastFiredHour":472222.7}')).toEqual({
      enabled: true,
      lastFiredHour: 472222,
    });
  });
  it("enabled 为 false 时保留 lastFiredHour（关掉再开不该补账）", () => {
    expect(parseStand('{"version":1,"enabled":false,"lastFiredHour":472222}')).toEqual({
      enabled: false,
      lastFiredHour: 472222,
    });
  });
});
