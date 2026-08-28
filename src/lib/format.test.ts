import { describe, expect, it } from "vitest";
import { formatDate } from "./format";

describe("formatDate", () => {
  it("输出中文年月日", () => {
    expect(formatDate(new Date(2026, 7, 28))).toBe("2026 年 8 月 28 日");
  });
  it("个位月日不补零", () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe("2026 年 1 月 5 日");
  });
});
