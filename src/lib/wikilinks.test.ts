import { describe, expect, it } from "vitest";
import {
  buildNoteTargetIndex,
  findWikilinks,
  resolveWikilink,
  type NoteTargetInput,
} from "./wikilinks";

const ENTRIES: NoteTargetInput[] = [
  { id: "embedded/mcu-gpio", title: "GPIO 基础" },
  { id: "embedded/mcu-pwm", title: "PWM 输出" },
  { id: "hardware/diode-basics", title: "二极管基础" },
  { id: "hardware/transistor-basics", title: "三极管基础" },
  { id: "a/shared-name", title: "共享名 A" },
  { id: "b/shared-name", title: "共享名" },
];

const index = buildNoteTargetIndex(ENTRIES);

describe("findWikilinks", () => {
  it("基本形：start/end 覆盖整个 token，target 已 trim", () => {
    const [t] = findWikilinks("前文 [[ mcu-gpio ]] 后文");
    expect(t).toBeDefined();
    expect(t.start).toBe(3);
    expect(t.end).toBe(17);
    expect(t.target).toBe("mcu-gpio");
    expect(t.alias).toBeUndefined();
    expect(t.embed).toBe(false);
  });

  it("alias 形：| 分隔，alias 已 trim", () => {
    const [t] = findWikilinks("[[mcu-gpio| 显示文本 ]]");
    expect(t.target).toBe("mcu-gpio");
    expect(t.alias).toBe("显示文本");
  });

  it("表格转义：\\| 作分隔符，alias 内 \\| 还原为 |", () => {
    const [t] = findWikilinks("[[mcu-gpio|左\\|右]]");
    expect(t.target).toBe("mcu-gpio");
    expect(t.alias).toBe("左|右");
  });

  it("embed：! 前缀纳入 token 区间", () => {
    const [t] = findWikilinks("贴图 ![[photo.png]]");
    expect(t.start).toBe(3);
    expect(t.end).toBe(17);
    expect(t.embed).toBe(true);
    expect(t.target).toBe("photo.png");
  });

  it("未闭合不匹配", () => {
    expect(findWikilinks("[[mcu-gpio")).toHaveLength(0);
    expect(findWikilinks("mcu-gpio]]")).toHaveLength(0);
  });

  it("同段多 token 偏移互不干扰", () => {
    const tokens = findWikilinks("[[a]] 中间 [[b|别名]] 结尾");
    expect(tokens).toHaveLength(2);
    expect(tokens[0].target).toBe("a");
    expect(tokens[1].target).toBe("b");
    expect(tokens[1].alias).toBe("别名");
    expect(tokens[1].start).toBe(9);
  });

  it("#heading 锚剥除；纯页内锚留空", () => {
    const [a] = findWikilinks("[[mcu-gpio#寄存器]]");
    expect(a.target).toBe("mcu-gpio");
    const [b] = findWikilinks("[[#页内锚]]");
    expect(b.target).toBe("");
  });
});

describe("buildNoteTargetIndex / resolveWikilink", () => {
  it("完整 id 精确命中（大小写不敏感），url 带尾斜杠", () => {
    const r = resolveWikilink("Embedded/MCU-GPIO", index);
    expect(r.reason).toBe("found");
    if (r.reason === "found") {
      expect(r.target.id).toBe("embedded/mcu-gpio");
      expect(r.target.url).toBe("/notes/embedded/mcu-gpio/");
    }
  });

  it("basename 唯一命中", () => {
    const r = resolveWikilink("diode-basics", index);
    expect(r.reason).toBe("found");
    if (r.reason === "found") expect(r.target.id).toBe("hardware/diode-basics");
  });

  it("中文标题命中", () => {
    const r = resolveWikilink("二极管基础", index);
    expect(r.reason).toBe("found");
    if (r.reason === "found") expect(r.target.id).toBe("hardware/diode-basics");
  });

  it("basename 多候选 → ambiguous 拒绝猜并列出候选", () => {
    const r = resolveWikilink("shared-name", index);
    expect(r.reason).toBe("ambiguous");
    if (r.reason === "ambiguous") {
      expect(r.candidates.map((c) => c.id).sort()).toEqual(["a/shared-name", "b/shared-name"]);
    }
  });

  it("未知目标 → not-found；空串同样 not-found", () => {
    expect(resolveWikilink("不存在", index).reason).toBe("not-found");
    expect(resolveWikilink("", index).reason).toBe("not-found");
  });

  it("id 优先于 basename（含斜杠的目标串不会走 basename 兜底）", () => {
    const r = resolveWikilink("b/shared-name", index);
    expect(r.reason).toBe("found");
    if (r.reason === "found") expect(r.target.id).toBe("b/shared-name");
  });

  it("主标题剥取：长 title「主——副」按主段可链，display 为短主标题", () => {
    const longIndex = buildNoteTargetIndex([
      { id: "hardware/diode-basics", title: "二极管基础——从整流到稳压的通断哲学" },
    ]);
    const r = resolveWikilink("二极管基础", longIndex);
    expect(r.reason).toBe("found");
    if (r.reason === "found") {
      expect(r.target.id).toBe("hardware/diode-basics");
      expect(r.target.display).toBe("二极管基础");
    }
    // 完整 title 同样命中（两个 key 指向同一目标，byTitle 唯一不歧义）
    expect(resolveWikilink("二极管基础——从整流到稳压的通断哲学", longIndex).reason).toBe("found");
  });
});
