import { describe, expect, it } from "vitest";
import { remarkWikilinks } from "./remark-wikilinks";
import type { Root } from "mdast";

/** 集成测试：跑真实 notes 目录扫描 + mdast 变换全链路（不依赖 astro:content）。
 *  依赖仓库真实内容 mcu-gpio / mcu-pwm 两篇笔记的存在与标题格式。 */

function transform(text: string) {
  const tree: Root = {
    type: "root",
    children: [
      { type: "paragraph", children: [{ type: "text", value: text }] },
    ],
  };
  remarkWikilinks()(tree, { history: ["test.md"] } as never);
  const para = tree.children[0];
  if (!("children" in para)) throw new Error("unexpected node");
  return para.children;
}

describe("remarkWikilinks（真实目录集成）", () => {
  it("[[basename]] 无 alias → link 节点，锚文本是目标主标题（display，非完整 title）", () => {
    const nodes = transform("见 [[mcu-gpio]] 说明");
    const link = nodes.find((n) => n.type === "link");
    expect(link).toBeDefined();
    if (link?.type === "link") {
      expect(link.url).toBe("/notes/embedded/mcu-gpio/");
      expect(link.data?.hProperties).toEqual({ class: "wikilink" });
      expect(link.children[0]).toMatchObject({
        type: "text",
        value: "单片机GPIO原理与实战", // 主标题——副标题 剥取后的短主标题
      });
    }
  });

  it("[[标题形]] 按主标题命中", () => {
    const nodes = transform("器件基础见 [[二极管基础]]");
    const link = nodes.find((n) => n.type === "link");
    expect(link).toBeDefined();
    if (link?.type === "link") expect(link.url).toBe("/notes/hardware/diode-basics/");
  });

  it("未知目标 → 纯文本节点（去括号），不产出 link", () => {
    const nodes = transform("见 [[不存在的笔记]]");
    expect(nodes.some((n) => n.type === "link")).toBe(false);
    expect(nodes.some((n) => n.type === "text" && n.value === "不存在的笔记")).toBe(true);
  });
});
