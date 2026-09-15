/** wikilink 词法解析与目标解析。纯逻辑（无 astro:content / node API），vitest 直接可测。
 *  三种形态：[[mcu-gpio]]（basename 或完整 id）、[[二极管基础]]（frontmatter title）、
 *  [[mcu-gpio|显示文本]]（alias 作渲染文本）。
 *  表格里 Obsidian 强制写 [[x\|y]] —— 分隔符认未转义的 |，alias 里的 \| 还原为 |。
 *  不支持的语法（[[#页内锚]]、块引用 ^）解析为 not-found，由上层渲染为纯文本。 */

export interface WikilinkToken {
  /** 指向 "[["（embed 时含前置 "!"） */
  start: number;
  /** "]]" 之后（排他） */
  end: number;
  /** 原始目标串：已 trim、已剥 #heading 锚（锚后内容忽略，链接仍指向整篇） */
  target: string;
  /** "|别名"；已把 \| 还原为 | */
  alias?: string;
  /** "![" 前缀（嵌入语法，图片附件 ![[xxx.png]] 走此分支） */
  embed: boolean;
}

/** 词法正则：inner 不含方括号（嵌套 [[a[b]] 不匹配整体，内层按独立 wikilink 处理） */
const WIKILINK_RE = /!?\[\[([^\[\]]+)\]\]/g;

export function findWikilinks(text: string): WikilinkToken[] {
  const tokens: WikilinkToken[] = [];
  for (const m of text.matchAll(WIKILINK_RE)) {
    const inner = m[1];
    // 找第一个未被 \ 转义的 | 作为 target/alias 分隔符
    let sep = -1;
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === "\\") {
        i++; // 跳过转义字符对（\|）
        continue;
      }
      if (inner[i] === "|") {
        sep = i;
        break;
      }
    }
    let target = (sep === -1 ? inner : inner.slice(0, sep)).trim();
    // 剥 #heading 锚（# 在开头是页内锚链接，不支持 → 留空走 not-found）
    const hash = target.indexOf("#");
    if (hash >= 0) target = target.slice(0, hash).trim();
    tokens.push({
      start: m.index,
      end: m.index + m[0].length,
      target,
      alias: sep === -1 ? undefined : inner.slice(sep + 1).trim().replace(/\\\|/g, "|"),
      embed: m[0].startsWith("!"),
    });
  }
  return tokens;
}

export interface NoteTargetInput {
  id: string;
  title: string;
}

export interface NoteTarget {
  id: string;
  title: string;
  /** 渲染用短标题：title 剥掉「——」副题后的主标题（无分隔符时即 title 本身） */
  display: string;
  /** 站内链接格式约定：带尾斜杠（段安全的 isActive/starts-with 规则依赖它） */
  url: string;
}

/** 剥「主标题——副标题」的主段（—— 或 —）；剥后为空则回退原 title */
export function mainTitleOf(title: string): string {
  const i = title.search(/——|—/);
  if (i <= 0) return title;
  const main = title.slice(0, i).trim();
  return main || title;
}

/** 三路索引：完整 id（小写）/ basename（id 末段，小写）/ 标题（trim + 小写） */
export interface NoteTargetIndex {
  byId: Map<string, NoteTarget>;
  byBasename: Map<string, NoteTarget[]>;
  byTitle: Map<string, NoteTarget[]>;
}

function addTo(map: Map<string, NoteTarget[]>, key: string, t: NoteTarget): void {
  const list = map.get(key);
  if (list) list.push(t);
  else map.set(key, [t]);
}

export function buildNoteTargetIndex(entries: NoteTargetInput[]): NoteTargetIndex {
  const byId = new Map<string, NoteTarget>();
  const byBasename = new Map<string, NoteTarget[]>();
  const byTitle = new Map<string, NoteTarget[]>();
  for (const e of entries) {
    const t: NoteTarget = {
      id: e.id,
      title: e.title,
      display: mainTitleOf(e.title),
      url: `/notes/${e.id}/`,
    };
    byId.set(e.id.toLowerCase(), t);
    addTo(byBasename, e.id.slice(e.id.lastIndexOf("/") + 1).toLowerCase(), t);
    const titleKey = e.title.trim().toLowerCase();
    addTo(byTitle, titleKey, t);
    // 长标题（主标题——副标题）额外按主标题可链：[[二极管基础]] 命中
    // 「二极管基础——从整流到稳压的通断哲学」。无分隔符时与 titleKey 相同，
    // 跳过以免同一目标重复入列造成假性歧义
    const displayKey = t.display.trim().toLowerCase();
    if (displayKey !== titleKey) addTo(byTitle, displayKey, t);
  }
  return { byId, byBasename, byTitle };
}

export type WikilinkResolution =
  | { target: NoteTarget; reason: "found" }
  | { target: null; reason: "not-found" }
  | { target: null; reason: "ambiguous"; candidates: NoteTarget[] };

/** 解析优先级：精确 id（含分类前缀）> 唯一 basename > 唯一标题。
 *  歧义时拒绝猜测（candidates 供警告列出），避免链接悄悄指向错误笔记。 */
export function resolveWikilink(raw: string, index: NoteTargetIndex): WikilinkResolution {
  const key = raw.trim().toLowerCase();
  if (!key) return { target: null, reason: "not-found" };
  const byId = index.byId.get(key);
  if (byId) return { target: byId, reason: "found" };
  const base = index.byBasename.get(key);
  if (base) {
    if (base.length === 1) return { target: base[0], reason: "found" };
    return { target: null, reason: "ambiguous", candidates: base };
  }
  const title = index.byTitle.get(key);
  if (title) {
    if (title.length === 1) return { target: title[0], reason: "found" };
    return { target: null, reason: "ambiguous", candidates: title };
  }
  return { target: null, reason: "not-found" };
}
