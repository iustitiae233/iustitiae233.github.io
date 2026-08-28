import { describe, expect, it } from "vitest";
import { estimateReadingTime } from "./reading-time";

describe("estimateReadingTime", () => {
  it("纯中文按每分钟 300 字估算", () => {
    expect(estimateReadingTime("字".repeat(600)).minutes).toBe(2);
  });

  it("纯英文按每分钟 200 词估算", () => {
    expect(estimateReadingTime("word ".repeat(400)).minutes).toBe(2);
  });

  it("中英混合分别累计", () => {
    expect(estimateReadingTime("字".repeat(300) + "word ".repeat(200)).minutes).toBe(2);
  });

  it("空文本至少 1 分钟", () => {
    expect(estimateReadingTime("").minutes).toBe(1);
  });

  it("label 含分钟中文", () => {
    expect(estimateReadingTime("测试").label).toMatch(/1 分钟/);
  });
});
