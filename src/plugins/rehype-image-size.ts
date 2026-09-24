/** rehype 插件：给指向 public/images/ 的内容 <img> 注入 width/height 属性。
 *  浏览器据此在图片载入前预留纵横比（配合全局 img{max-width:100%;height:auto}），
 *  惰性图片到达时不再把下方内容顶下去（CLS）。构建期读文件头解析尺寸，
 *  手写 PNG/GIF/WebP 三种头部解析——零第三方依赖，无运行时 JS。
 *
 *  图片不过 Astro 优化管线（public/ 直拷贝），remark 层不知道文件尺寸，
 *  所以只能在 rehype/hast 层回填。读不到/解析不了就告警跳过，不 fail build。 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Nodes, Root } from "hast";
import type { Plugin } from "unified";

const IMAGES_DIR = resolve(process.cwd(), "public/images");
/** 只认一层文件名（无斜杠、无 ..），src 直接映射到 public/images 之下，堵路径穿越 */
const CONTENT_SRC = /^\/images\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

interface Size {
  width: number;
  height: number;
}

const cache = new Map<string, Size | null>();

/** 按魔数分派解析；WebP 三种 chunk（VP8X 扩展 / VP8L 无损 / VP8 有损）都支持 */
function parseSize(buf: Buffer): Size | null {
  // PNG：8B 签名，IHDR 固定在第 16 字节起（宽高各 4 字节大端）
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // GIF87a/89a：签名后第 6 字节起宽高各 2 字节小端
  if (buf.length > 10 && buf.subarray(0, 3).toString("latin1") === "GIF") {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  // WebP：RIFF....WEBP 后第一个 chunk 就是尺寸信息
  if (
    buf.length > 30 &&
    buf.readUInt32LE(0) === 0x46464952 && // 'RIFF'
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    const fourcc = buf.subarray(12, 16).toString("latin1");
    if (fourcc === "VP8X") {
      // 扩展头（动画/透明）：payload 4 字节标志后，宽高各 3 字节小端存「值-1」
      return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    }
    if (fourcc === "VP8L") {
      // 无损：1 字节签名 0x2F 后 u32 小端打包两个 14 位「值-1」
      const v = buf.readUInt32LE(21);
      return { width: 1 + (v & 0x3fff), height: 1 + ((v >>> 14) & 0x3fff) };
    }
    if (fourcc === "VP8 ") {
      // 有损：3B 帧标签 + 3B 同步码，宽高各 2 字节小端（高 2 位是缩放标志）
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
  }
  return null;
}

function sizeOf(src: string): Size | null {
  if (cache.has(src)) return cache.get(src) ?? null;
  let size: Size | null = null;
  try {
    size = parseSize(readFileSync(join(IMAGES_DIR, src.slice("/images/".length))));
  } catch {
    console.warn(`[image-size] ${src}: public/images 下找不到对应文件`);
  }
  if (!size) console.warn(`[image-size] ${src}: 无法解析尺寸（非 PNG/GIF/WebP?）`);
  cache.set(src, size);
  return size;
}

function walk(node: Nodes): void {
  if (!("children" in node) || !Array.isArray(node.children)) return;
  for (const child of node.children as Nodes[]) {
    if (child.type === "element" && child.tagName === "img") {
      const src = child.properties?.src;
      if (
        typeof src === "string" &&
        CONTENT_SRC.test(src) &&
        child.properties.width === undefined
      ) {
        const size = sizeOf(src);
        if (size) {
          child.properties.width = size.width;
          child.properties.height = size.height;
        }
      }
    } else {
      walk(child);
    }
  }
}

// Plugin 泛型须显式锚定 Root（与 remark-wikilinks 同款约束）
export const rehypeImageSize: Plugin<[], Root, Root> = function rehypeImageSize() {
  return (tree: Root) => {
    walk(tree);
  };
};
