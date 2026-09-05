import { describe, expect, it } from "vitest";
import {
  advance,
  defaultState,
  formatMs,
  fullMs,
  parse,
  pause,
  remainingOf,
  reset,
  serialize,
  settleExpired,
  skip,
  start,
} from "./pomodoro";

const NOW = 1_700_000_000_000;

describe("advance", () => {
  it("专注结束 → 短休，完成数 +1，待确认不自动开始", () => {
    const s = advance(start(defaultState(), NOW));
    expect(s.phase).toBe("short");
    expect(s.completedFocus).toBe(1);
    expect(s.running).toBe(false);
    expect(s.endsAt).toBeNull();
    expect(s.awaiting).toBe(true);
    expect(s.remainingMs).toBe(fullMs("short"));
  });
  it("第 4 个专注完成 → 长休", () => {
    const s = advance({ ...defaultState(), completedFocus: 3 });
    expect(s.phase).toBe("long");
    expect(s.completedFocus).toBe(4);
  });
  it("休息结束 → 专注，完成数不变", () => {
    const s = advance({ ...defaultState(), phase: "long", completedFocus: 4 });
    expect(s.phase).toBe("focus");
    expect(s.completedFocus).toBe(4);
    expect(s.awaiting).toBe(true);
  });
});

describe("skip / reset", () => {
  it("跳过专注 → 短休但不计完成", () => {
    const s = skip(start(defaultState(), NOW));
    expect(s.phase).toBe("short");
    expect(s.completedFocus).toBe(0);
    expect(s.awaiting).toBe(false);
    expect(s.running).toBe(false);
  });
  it("跳过休息 → 专注", () => {
    const s = skip({ ...defaultState(), phase: "short", completedFocus: 2 });
    expect(s.phase).toBe("focus");
    expect(s.completedFocus).toBe(2);
  });
  it("重置只回当前阶段满时长，完成数不动", () => {
    const s = reset(pause(start(defaultState(), NOW), NOW + 5_000));
    expect(s.remainingMs).toBe(fullMs("focus"));
    expect(s.running).toBe(false);
    expect(s.completedFocus).toBe(0);
  });
});

describe("remainingOf / start / pause", () => {
  it("running 用墙钟差并 clamp 到 0", () => {
    const s = start(defaultState(), NOW);
    expect(remainingOf(s, NOW + 60_000)).toBe(fullMs("focus") - 60_000);
    expect(remainingOf(s, (s.endsAt ?? NOW) + 5_000)).toBe(0);
  });
  it("暂停冻结剩余；再 start 从冻结值续跑", () => {
    const paused = pause(start(defaultState(), NOW), NOW + 5_000);
    expect(paused.running).toBe(false);
    expect(paused.endsAt).toBeNull();
    expect(remainingOf(paused, NOW + 999_000)).toBe(fullMs("focus") - 5_000);
    const resumed = start(paused, NOW + 100_000);
    expect(resumed.endsAt).toBe(NOW + 100_000 + (fullMs("focus") - 5_000));
  });
});

describe("settleExpired", () => {
  it("未过期原样返回", () => {
    const s = start(defaultState(), NOW);
    expect(settleExpired(s, NOW)).toBe(s);
  });
  it("过期（哪怕数小时）只结算一步：专注算完成、待确认", () => {
    const s = settleExpired(start(defaultState(), NOW), NOW + 10 * 3600_000);
    expect(s.phase).toBe("short");
    expect(s.completedFocus).toBe(1);
    expect(s.awaiting).toBe(true);
    expect(s.running).toBe(false);
  });
});

describe("serialize / parse", () => {
  it("roundtrip 保真", () => {
    const s = pause(start({ ...defaultState(), completedFocus: 2 }, NOW), NOW + 30_000);
    expect(parse(serialize(s))).toEqual(s);
  });
  it("损坏 JSON / 版本不符 / 非法阶段 / null → 默认态", () => {
    expect(parse("{oops")).toEqual(defaultState());
    expect(parse('{"version":99}')).toEqual(defaultState());
    expect(parse(serialize(defaultState()).replace('"focus"', '"sleep"'))).toEqual(
      defaultState(),
    );
    expect(parse(null)).toEqual(defaultState());
  });
});

describe("formatMs", () => {
  it("mm:ss 与边界", () => {
    expect(formatMs(1500_000)).toBe("25:00");
    expect(formatMs(300_000)).toBe("05:00");
    expect(formatMs(0)).toBe("00:00");
    expect(formatMs(1)).toBe("00:01"); // ceil 语义：最后 1ms 仍显示 00:01
  });
});
