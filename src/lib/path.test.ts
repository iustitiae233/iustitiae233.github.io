import { describe, expect, it } from "vitest";
import { formatPath } from "./path";

describe("formatPath", () => {
  it("根路径", () => {
    expect(formatPath("/")).toBe("首页");
  });
  it("文章页", () => {
    expect(formatPath("/posts/hello-astro/")).toBe("首页 / 文章 / hello-astro");
  });
  it("关于页", () => {
    expect(formatPath("/about/")).toBe("首页 / about");
  });
  it("笔记索引页", () => {
    expect(formatPath("/notes/")).toBe("首页 / 笔记");
  });
  it("笔记详情页（嵌套 id 取末段）", () => {
    expect(formatPath("/notes/embedded/mcu-gpio/")).toBe("首页 / 笔记 / mcu-gpio");
  });
});
