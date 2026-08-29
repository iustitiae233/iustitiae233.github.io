# -*- coding: utf-8 -*-
"""一次性迁移：IustitiaeBlog/XHBlogs（Next.js）→ 本站（Astro）。

用法：python scripts/migrate-iustitiae.py [--dry-run]

做四件事：
1. 3 篇文章迁入 src/content/posts/（frontmatter 改写：date→pubDate、cover→heroImage，
   丢弃 tags/mood，draft_ 前缀文件按映射重命名后直接发布）
2. 16 篇笔记迁入 src/content/notes/{embedded,hardware}/（目录→分类，
   嵌入式的裸 ``` 围栏改写为 ```c；硬件笔记的围栏是 ASCII 电路图，保持不动）
3. 输出"坍塌表格"清单（file:line）——旧站 CMS 导出时管道丢失的表格行，留待人工修复
4. 自校验：每个产出文件重新用 yaml 解析、围栏数成偶数

不迁移：moments（说说）、_meta.json、public/images 里的 7 张孤儿 PNG（无引用）、tags。
"""
import re
import sys
from pathlib import Path

import yaml

sys.stdout.reconfigure(encoding="utf-8")

SRC = Path(r"E:\Myblog\IustitiaeBlog\XHBlogs")
DST = Path(r"E:\Blog")
DRY_RUN = "--dry-run" in sys.argv

# draft_/chatter_ 时间戳文件名 → 语义化 slug
RENAMES = {
    "draft_1783055377293.md": "llm-transformer-gpt.md",      # 大语言模型的实现原理
    "draft_1783055401660.md": "vision-cnn-diffusion.md",     # 视觉模型的实现原理
    "chatter_1783068887.md": "flash-partition-ota.md",       # flash 分区表与 OTA
    "chatter_1783403941.md": "product-numbering-flashing.md",  # 产品编号烧录
}
CHATTER_DIR_TO_CATEGORY = {"嵌入式": "embedded", "硬件基础": "hardware"}

FENCE_OPEN = re.compile(r"^```\s*$")
BOLD_RUN = re.compile(r"\*\*[^*]+\*\*")
# 坍塌表格候选行：非标题/引用/列表/表格/围栏开头，无管道符，较长，且含 ≥2 段 **bold**
COLLAPSED = re.compile(r"^(?![#>\-*|`])[^|*]{0,80}(\*\*[^*]+\*\*[^|]{1,120}){2,}")


def scalar(v: str) -> str:
    """单行单引号标量：强制引用样式并禁用折行，避免 safe_dump 输出 `...` 文档结束符。"""
    return yaml.safe_dump(v, allow_unicode=True, default_style="'", width=10**6).strip()


def emit_frontmatter(fm: dict) -> str:
    """按固定字段顺序输出 Astro frontmatter，pubDate 保留原始字符串（秒级时间戳参与排序）。"""
    lines = ["---"]
    lines.append(f"title: {scalar(fm['title'])}")
    desc = fm.get("description", "")
    lines.append(f"description: {scalar(desc)}")
    lines.append(f"pubDate: {scalar(fm['pubDate'])}")
    if "heroImage" in fm:
        lines.append(f"heroImage: {scalar(fm['heroImage'])}")
    if "category" in fm:
        lines.append(f"category: {fm['category']}")
    lines.append("---")
    return "\n".join(lines)


def rewrite_bare_fences_c(body: str) -> tuple[str, int]:
    """嵌入式笔记：裸 ``` 开围栏改 ```c（配对跟踪，闭围栏不动）。返回新正文与改写数。"""
    out, count, in_fence = [], 0, False
    for line in body.split("\n"):
        if not in_fence and FENCE_OPEN.match(line):
            out.append("```c")
            count += 1
            in_fence = True
        else:
            if line.startswith("```"):
                in_fence = False
            out.append(line)
    return "\n".join(out), count


def rewrite_relative_links(body: str, category: str) -> tuple[str, int]:
    """旧站笔记互链 ./xxx → 新站绝对路径 /notes/<category>/xxx/。返回新正文与改写数。"""
    pattern = re.compile(r"\]\(\./([a-z0-9-]+)\)")
    replaced = pattern.sub(lambda m: f"](/notes/{category}/{m.group(1)}/)", body)
    return replaced, len(pattern.findall(body))


def collapsed_manifest(body: str) -> list[int]:
    """坍塌表格候选行号（1 基）。启发式，供人工修复时筛选。"""
    hits = []
    in_fence = False
    for i, line in enumerate(body.split("\n"), start=1):
        if line.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if len(line) > 100 and "|" not in line and len(BOLD_RUN.findall(line)) >= 2:
            hits.append(i)
    return hits


def read_split(path: Path) -> tuple[dict, str]:
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.DOTALL)
    if not m:
        raise SystemExit(f"无法解析 frontmatter: {path}")
    return yaml.safe_load(m.group(1)), m.group(2)


def write_out(rel: Path, text: str) -> None:
    target = DST / rel
    if DRY_RUN:
        print(f"  [dry-run] {rel}")
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8", newline="\n")
    print(f"  {rel}")


def validate(text: str, rel: Path) -> None:
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.DOTALL)
    assert m, f"产出文件缺 frontmatter: {rel}"
    yaml.safe_load(m.group(1))
    fences = sum(1 for ln in m.group(2).split("\n") if ln.startswith("```"))
    assert fences % 2 == 0, f"围栏数为奇数 {fences}: {rel}"


def main() -> None:
    manifest: list[str] = []

    print("== 文章（3 篇 → src/content/posts/）==")
    for src in sorted((SRC / "posts").glob("*.md")):
        fm, body = read_split(src)
        name = RENAMES.get(src.name)
        if src.name.startswith("draft_") and not name:
            raise SystemExit(f"draft_ 文件缺少重命名映射: {src.name}")
        out_name = name or src.name
        out_fm = {
            "title": fm["title"],
            "description": fm.get("description", ""),
            # 保留 'YYYY-MM-DD HH:mm:ss' 原串：秒级时间戳决定三部曲排序
            "pubDate": fm["date"],
            "heroImage": fm.get("cover"),
        }
        out_fm = {k: v for k, v in out_fm.items() if v}
        text = emit_frontmatter(out_fm) + "\n" + body
        rel = Path("src/content/posts") / out_name
        validate(text, rel)
        write_out(rel, text)
        for ln in collapsed_manifest(body):
            manifest.append(f"{out_name}:{ln}")

    for d, category in CHATTER_DIR_TO_CATEGORY.items():
        files = sorted((SRC / "chatters" / d).glob("*.md"))
        print(f"== 笔记 {d}（{len(files)} 篇 → src/content/notes/{category}/）==")
        for src in files:
            fm, body = read_split(src)
            name = RENAMES.get(src.name)
            if src.name.startswith("chatter_") and not name:
                raise SystemExit(f"chatter_ 文件缺少重命名映射: {src.name}")
            out_name = name or src.name
            body, n_links = rewrite_relative_links(body, category)
            if n_links:
                print(f"  （{out_name}: {n_links} 个互链改写为 /notes/{category}/…/）")
            if category == "embedded":
                body, n = rewrite_bare_fences_c(body)
                print(f"  （{out_name}: {n} 个围栏改写为 ```c）")
            out_fm = {
                "title": fm["title"],
                "description": fm.get("description") or "",
                "pubDate": fm["date"],
                "category": category,
            }
            text = emit_frontmatter(out_fm) + "\n" + body
            rel = Path("src/content/notes") / category / out_name
            validate(text, rel)
            write_out(rel, text)
            for ln in collapsed_manifest(body):
                manifest.append(f"{category}/{out_name}:{ln}")

    print(f"\n== 坍塌表格候选清单（{len(manifest)} 行，待人工修复）==")
    for entry in manifest:
        print(f"  {entry}")
    print("\n完成：3 篇文章 + 16 篇笔记" + ("（dry-run，未写盘）" if DRY_RUN else ""))


if __name__ == "__main__":
    main()
