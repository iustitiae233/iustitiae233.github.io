import { describe, expect, it } from "vitest";
import { markdownToPlainText } from "./plaintext";

describe("markdownToPlainText", () => {
  it("frontmatter 整块剥掉，正文保留", () => {
    const out = markdownToPlainText("---\ntitle: 测试\npubDate: 2026-01-01\n---\n\n正文开始");
    expect(out).toBe("正文开始");
  });

  it("围栏代码块整块移除（含语言标注行）", () => {
    const out = markdownToPlainText("前文\n\n```c\nint main() { return 0; }\n```\n\n后文");
    expect(out).toBe("前文 后文");
    expect(out).not.toContain("int main");
  });

  it("行内 code 去反引号保留内容", () => {
    expect(markdownToPlainText("用 `HAL_GPIO_Init()` 初始化")).toBe(
      "用 HAL_GPIO_Init() 初始化",
    );
  });

  it("链接取锚文本，图片取 alt", () => {
    expect(markdownToPlainText("见 [二极管基础](/notes/hardware/diode-basics/) 一文")).toBe(
      "见 二极管基础 一文",
    );
    expect(markdownToPlainText("![电路图](/images/circuit.png)")).toBe("电路图");
  });

  it("wikilink 取别名优先的可读文本", () => {
    expect(markdownToPlainText("见 [[mcu-gpio]] 与 [[mcu-gpio|GPIO 基础]]")).toBe(
      "见 mcu-gpio 与 GPIO 基础",
    );
  });

  it("标题/列表/引用/表格标记清除，内容保留", () => {
    expect(markdownToPlainText("## 二、工作原理")).toBe("二、工作原理");
    expect(markdownToPlainText("- 推挽输出")).toBe("推挽输出");
    expect(markdownToPlainText("1. 第一步")).toBe("第一步");
    expect(markdownToPlainText("> 引用的话")).toBe("引用的话");
    expect(markdownToPlainText("| 运放 | 比较器 |")).toBe("运放 | 比较器");
  });

  it("表格分隔行清除", () => {
    const out = markdownToPlainText("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(out).toBe("a | b 1 | 2");
  });

  it("math 去定界符留公式内容", () => {
    expect(markdownToPlainText("阈值 $V_{hys} = 0.7V$ 附近")).toContain("V_{hys} = 0.7V");
    expect(markdownToPlainText("$$E = mc^2$$")).toBe("E = mc^2");
  });

  it("加粗斜体删除线标记清除；单下划线保留（snake_case）", () => {
    expect(markdownToPlainText("**关键** 点")).toBe("关键 点");
    expect(markdownToPlainText("*斜体* 文本")).toBe("斜体 文本");
    expect(markdownToPlainText("~~废弃~~ 写法")).toBe("废弃 写法");
    expect(markdownToPlainText("MAX_IO_NUM 常量")).toBe("MAX_IO_NUM 常量");
  });

  it("连续空白折叠为单空格", () => {
    expect(markdownToPlainText("第一行\n\n\n第二行   继续")).toBe("第一行 第二行 继续");
  });

  it("中文内容无反斜杠转义残留（表格里的 \\| wikilink）", () => {
    expect(markdownToPlainText("| 见 [[x\\|别名]] |")).toContain("别名");
  });
});
