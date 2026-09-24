import { describe, expect, it } from "vitest";
import { remarkWikilinks } from "./remark-wikilinks";
import type { Root } from "mdast";

/** 集成测试：跑真实 notes 目录扫描 + mdast 变换全链路（不依赖 astro:content）。
 *  依赖仓库真实内容 mcu-gpio / mcu-pwm 两篇笔记的存在与标题格式。 */

// Plugin 类型带 Processor this 上下文与可选 transformer 签名，直接调用过不了
// 严格检查 —— 测试里按运行时真实形态收窄成无 this 的纯函数签名
const createTransformer = remarkWikilinks as unknown as () => (
  tree: Root,
  file: { history: string[] },
) => void;

function transform(text: string) {
  const tree: Root = {
    type: "root",
    children: [
      { type: "paragraph", children: [{ type: "text", value: text }] },
    ],
  };
  createTransformer()(tree, { history: ["test.md"] });
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
      // hProperties 不在 @types/mdast 的 Data 里（是 mdast-util-to-hast 的扩展）——cast 断言
      const data = link.data as Record<string, unknown> | undefined;
      expect(data?.hProperties).toEqual({ class: "wikilink" });
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

  it("![[图.png|中文 alt]] → image 节点：basename 路径 + alt + 惰性加载属性", () => {
    const nodes = transform("![[sub/dir/ai-pooling.webp|2×2 池化降采样示意]]");
    const img = nodes.find((n) => n.type === "image");
    expect(img).toBeDefined();
    if (img?.type === "image") {
      // 附件平铺在 public/images/，路径前缀（Obsidian 的附件目录）必须被剥掉
      expect(img.url).toBe("/images/ai-pooling.webp");
      expect(img.alt).toBe("2×2 池化降采样示意");
      const data = img.data as Record<string, unknown> | undefined;
      expect(data?.hProperties).toEqual({ loading: "lazy", decoding: "async" });
    }
  });

  it("![[非图片附件]] → 降级纯文本（不产出 image）", () => {
    const nodes = transform("![[某篇笔记]]");
    expect(nodes.some((n) => n.type === "image")).toBe(false);
    expect(nodes.some((n) => n.type === "text" && n.value === "某篇笔记")).toBe(true);
  });
});
