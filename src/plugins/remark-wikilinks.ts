/** remark 插件：把 [[wikilink]] 渲染成站内链接，![[xxx.png]] 渲染成图片。
 *  解析逻辑全部在 src/lib/wikilinks.ts（纯函数，vitest 可测）——本文件只是
 *  mdast 变换薄壳 + node:fs 笔记索引扫描，零第三方运行时依赖。
 *
 *  已知限制：索引在进程内惰性建一次——dev server 下新增/改名/改 title 笔记后
 *  wikilink 目标不刷新，重启 dev 解决；build 单进程无此问题。 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { Nodes, PhrasingContent, Root } from "mdast";
import type { Plugin } from "unified";
import type { VFile } from "vfile";
import {
  buildNoteTargetIndex,
  findWikilinks,
  resolveWikilink,
  type NoteTargetIndex,
  type WikilinkToken,
} from "../lib/wikilinks";

const NOTES_DIR = "src/content/notes";
const IMAGE_EXT = /\.(png|jpe?g|webp|svg|gif)$/i;

let cachedIndex: NoteTargetIndex | null = null;

function getNoteIndex(): NoteTargetIndex {
  cachedIndex ??= buildNoteTargetIndex(scanNotesDir(resolve(process.cwd(), NOTES_DIR)));
  return cachedIndex;
}

/** 递归扫 notes 目录：id = 相对路径去扩展名（与 glob loader 的 id 规则一致） */
function scanNotesDir(root: string): { id: string; title: string }[] {
  const out: { id: string; title: string }[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full, `${prefix}${name}/`);
      } else if (name.endsWith(".md")) {
        const id = `${prefix}${name.slice(0, -3)}`;
        out.push({ id, title: readTitle(full) ?? id });
      }
    }
  };
  walk(root, "");
  return out;
}

/** 只读文件头部，正则提取 frontmatter 的 title（缺省回退 id，不让构建失败） */
function readTitle(file: string): string | undefined {
  const head = readFileSync(file, "utf8").slice(0, 2048);
  const fm = head.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const title = fm?.[1].match(/^title:\s*(.*)$/m)?.[1].trim();
  return title?.replace(/^["']|["']$/g, "") || undefined;
}

interface Ctx {
  index: NoteTargetIndex;
  warned: Set<string>;
  source: string;
}

function warn(ctx: Ctx, tk: WikilinkToken, detail: string): void {
  const key = `${ctx.source} ${tk.target}`;
  if (ctx.warned.has(key)) return;
  ctx.warned.add(key);
  const shown = `[[${tk.target}${tk.alias ? `|${tk.alias}` : ""}]]`;
  console.warn(`[wikilinks] ${ctx.source}: 未解析 ${shown}（${detail}）`);
}

/** 单个 wikilink token → mdast 节点；未命中降级为纯文本（不 fail build） */
function makeNode(tk: WikilinkToken, ctx: Ctx): PhrasingContent {
  // 图片 embed：附件约定存 public/images/，取 basename 映射到站点根
  if (tk.embed && IMAGE_EXT.test(tk.target)) {
    const url = tk.target.startsWith("/")
      ? tk.target
      : `/images/${basename(tk.target.replace(/\\/g, "/"))}`;
    return { type: "image", url, alt: tk.alias ?? "" };
  }
  if (tk.embed) {
    warn(ctx, tk, "笔记 embed 暂不支持，仅支持图片附件");
    return { type: "text", value: tk.alias ?? tk.target };
  }
  const r = resolveWikilink(tk.target, ctx.index);
  if (r.reason === "found") {
    return {
      type: "link",
      url: r.target.url,
      data: { hProperties: { class: "wikilink" } },
      // 无 alias 用目标主标题 —— [[二极管基础]] 与 [[diode-basics]] 渲染同样可读文本，
      // 且不像完整 title（含——副题）那样把句子撑爆
      children: [{ type: "text", value: tk.alias ?? r.target.display }],
    };
  }
  warn(
    ctx,
    tk,
    r.reason === "ambiguous"
      ? `歧义目标，请写完整 id：${r.candidates.map((c) => c.id).join(" / ")}`
      : "目标不存在",
  );
  return { type: "text", value: tk.alias ?? tk.target };
}

/** 按 token 区间把 text 节点切分为 text / link / image 序列 */
function splitTextNode(text: string, tokens: WikilinkToken[], ctx: Ctx): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  let cursor = 0;
  for (const tk of tokens) {
    if (tk.start > cursor) out.push({ type: "text", value: text.slice(cursor, tk.start) });
    out.push(makeNode(tk, ctx));
    cursor = tk.end;
  }
  if (cursor < text.length) out.push({ type: "text", value: text.slice(cursor) });
  return out;
}

/** 倒序遍历 + splice 替换，只处理 text 节点 —— code/inlineCode/math 节点天然免疫 */
function walk(node: Nodes, ctx: Ctx): void {
  if (!("children" in node) || !Array.isArray(node.children)) return;
  const children = node.children as Nodes[];
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];
    if (child.type === "text") {
      const tokens = findWikilinks(child.value);
      if (tokens.length > 0) {
        children.splice(i, 1, ...(splitTextNode(child.value, tokens, ctx) as Nodes[]));
        continue;
      }
    }
    walk(child, ctx);
  }
}

// Plugin 泛型须显式锚定 Root —— 默认 Node 与 Astro 期望的 RemarkPlugin<Root> 不兼容
export const remarkWikilinks: Plugin<[], Root, Root> = function remarkWikilinks() {
  const index = getNoteIndex();
  const warned = new Set<string>();
  return (tree: Root, file: VFile) => {
    walk(tree, { index, warned, source: file.history[0] ?? file.path ?? "<unknown>" });
  };
};
