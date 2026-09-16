#!/usr/bin/env python3
"""一次性脚本（2026-09-16）：从 E:\\Blog\\image\\ 的硬件讲义扫描图里裁出电路图，
输出到 public/images/ 供笔记用 ![[xxx.png|alt]] 引用。

来源 15 张微信图（原图不入库，见 .gitignore 的 /image/）：
  49=p26  50=p25  51=p23  52=p22  53=p21  54=p20  55=p38  56=p35
  57=p34  58=p33  59=p31  60=海报「电容常用电路」 61=海报「RL/RC/LC滤波和阻抗匹配」
  62=海报「PCB布局布线指导」 63=海报「整流后为什么还要滤波」

框坐标靠 reports/analyze.py（墨迹行带分析）定位，本脚本两类处理：
  trim —— 讲义页白底线稿：先框住整块图形，再按墨迹行/列剖面自动收边（空白收干净）
  raw  —— 海报深色底：框必须精确（不能用墨迹阈值收边），按板块/子图手定
用法：python scripts/crop-figures.py [名称...]（不带参数=全部）
"""
import os
import re
import sys
import glob
from PIL import Image, ImageDraw

SRC_DIR = "image"
OUT_DIR = "public/images"
SHEET_DIR = "reports/crops"

# (输出名, 源图序号, (x0, y0, x1, y1), 模式)
# 海报类（60-63）的框用 reports/rows.py 的纵向游程（红条带=区块标题）+ reports/grid.py
# 的坐标网格定，框都落在区块之间的空白带里，连标题带一起收进去、不切邻格
CROPS = [
    # ---- 电容：p22 / p23 ----
    ("cap-roles-amp-circuit.png", 52, (84, 578, 737, 995), "trim"),
    ("cap-ce-bypass.png", 51, (399, 111, 950, 425), "trim"),
    ("cap-power-01u-10u.png", 51, (418, 825, 950, 1003), "trim"),
    # ---- 电容：海报 A 子图（3 列 × 4 行网格；含每格标题，止于红色分隔线之前） ----
    ("cap-decoupling-chip.png", 60, (18, 48, 432, 322), "raw"),      # 行1列1 电源电容去耦电路
    ("cap-crystal-active.png", 60, (438, 48, 840, 322), "raw"),      # 行1列2 有源晶振电路
    ("cap-crystal-passive.png", 60, (18, 350, 432, 638), "raw"),     # 行2列1 晶振电路（无源）
    ("cap-xy-safety.png", 60, (18, 664, 486, 956), "raw"),           # 行3列1 X/Y 电容接法
    ("cap-input-emi-filter.png", 60, (498, 664, 1074, 956), "raw"),  # 行3列2 共模/差模电感 + X/Y 电容输入滤波
    # 行4列1 标题写「X电容和Y电容接法电路」，画的却是共射极放大器（源图标签有误）——不裁
    # ---- 电感：p38 ----
    ("ind-series-shunt-matching.png", 55, (106, 258, 762, 428), "trim"),
    ("ind-lc-l-pi-match.png", 55, (45, 501, 1025, 718), "trim"),
    ("ind-lc-t-match.png", 55, (227, 743, 866, 980), "trim"),
    # ---- 阻抗匹配：海报 B 的三行（每行=标题带+子图，行边界在区块间空白里） ----
    ("imp-capacitor-matching.png", 61, (6, 674, 1074, 892), "raw"),
    ("imp-inductor-matching.png", 61, (6, 898, 1074, 1142), "raw"),
    ("imp-lc-networks.png", 61, (6, 1148, 1074, 1319), "raw"),
    # ---- RC：p25 ----
    ("rc-filters.png", 50, (216, 115, 875, 311), "trim"),
    ("rc-reset-delay.png", 50, (455, 381, 648, 637), "trim"),
    ("rc-integrator.png", 50, (410, 700, 678, 1025), "trim"),
    ("rc-differentiator.png", 50, (380, 1090, 704, 1323), "trim"),
    # ---- RC：p26 ----
    ("rc-dropper.png", 49, (310, 33, 795, 283), "trim"),
    ("rc-bias-networks.png", 49, (104, 353, 897, 640), "trim"),
    ("rc-debounce.png", 49, (449, 709, 652, 1002), "trim"),
    ("rc-coupling.png", 49, (424, 1111, 667, 1315), "trim"),
    # ---- RC：海报 B ----
    ("rc-filters-poster.png", 61, (6, 274, 1074, 455), "raw"),
    # ---- RL：p33 ----
    ("rl-lowpass.png", 58, (296, 172, 816, 300), "trim"),
    ("rl-highpass.png", 58, (283, 497, 820, 627), "trim"),
    ("rl-delay.png", 58, (278, 739, 810, 981), "trim"),
    ("rl-divider-limit.png", 58, (246, 1161, 782, 1358), "trim"),
    # ---- RL：p34 ----
    ("rl-coupling.png", 57, (207, 173, 892, 360), "trim"),
    ("rl-snubber.png", 57, (54, 481, 926, 825), "trim"),
    ("rl-oscillator.png", 57, (281, 955, 818, 1335), "trim"),
    # ---- RL：海报 B ----
    ("rl-filters-poster.png", 61, (6, 44, 1074, 264), "raw"),
    # ---- LC：p35 ----
    ("lc-lpf-hpf.png", 56, (374, 114, 950, 342), "trim"),
    ("lc-pi-t-filters.png", 56, (172, 457, 950, 628), "trim"),
    ("lc-resonance.png", 56, (95, 888, 950, 1052), "trim"),
    # ---- LC：海报 B ----
    ("lc-filters-poster.png", 61, (6, 486, 1074, 666), "raw"),
    # ---- 整流与滤波：海报 D ----
    ("rect-block.png", 63, (20, 296, 518, 422), "raw"),
    ("rect-waveforms.png", 63, (522, 228, 1074, 430), "raw"),
    ("rect-cap-filter.png", 63, (532, 572, 1046, 776), "raw"),
    ("rect-water-analogy.png", 63, (532, 776, 1074, 850), "raw"),
    # ---- PCB：海报 C ----
    ("pcb-partition-zones.png", 62, (502, 190, 1076, 585), "raw"),
    ("pcb-dcdc-loop.png", 62, (790, 632, 1076, 940), "raw"),
    ("pcb-stackup.png", 62, (14, 985, 350, 1250), "raw"),
    ("pcb-wrong-vs-right.png", 62, (506, 978, 1076, 1335), "raw"),
    ("pcb-good-practices.png", 62, (502, 1343, 1076, 1548), "raw"),
]

_src_cache: dict[int, Image.Image] = {}


def load_src(idx: int) -> Image.Image:
    if idx not in _src_cache:
        for f in glob.glob(os.path.join(SRC_DIR, "*.jpg")):
            m = re.search(r"_(\d+)_\d+\.jpg$", f)
            if m and int(m.group(1)) == idx:
                _src_cache[idx] = Image.open(f).convert("RGB")
                break
        else:
            raise SystemExit(f"找不到源图序号 {idx}")
    return _src_cache[idx]


def smart_trim(im: Image.Image, pad: int = 10, thr: int = 190, min_hits: int = 3) -> Image.Image:
    """按墨迹行/列剖面收边：统计每行/列的暗像素数，取计数 >= min_hits 的外接范围。
    用 min_hits 而不是 >0，是为了忽略 JPEG 噪点与扫描边缘的孤立暗线。"""
    g = im.convert("L")
    w, h = g.size
    px = g.load()
    cols = [0] * w
    rows = [0] * h
    for y in range(h):
        for x in range(w):
            if px[x, y] < thr:
                cols[x] += 1
                rows[y] += 1
    xs = [i for i, c in enumerate(cols) if c >= min_hits]
    ys = [i for i, r in enumerate(rows) if r >= min_hits]
    if not xs or not ys:
        return im
    box = (max(xs[0] - pad, 0), max(ys[0] - pad, 0),
           min(xs[-1] + 1 + pad, w), min(ys[-1] + 1 + pad, h))
    return im.crop(box)


def save(im: Image.Image, name: str) -> None:
    out = os.path.join(OUT_DIR, name)
    if name.endswith(".webp"):  # 海报类：降采样 + 有损，控制体积
        if im.width > 900:
            im = im.resize((900, round(im.height * 900 / im.width)), Image.LANCZOS)
        im.save(out, "WEBP", quality=88, method=6)
    else:
        im.save(out, "PNG", optimize=True)


def contact_sheet(items: list[tuple[str, Image.Image]], path: str, cols: int = 3) -> None:
    """拼版核对用：每格上方贴输出文件名，格子内容缩放到统一宽度。"""
    cell_w, pad, label_h = 720, 12, 26
    scaled = []
    for name, im in items:
        r = cell_w / im.width
        scaled.append((name, im.resize((cell_w, max(1, round(im.height * r))), Image.LANCZOS)))
    rows = (len(scaled) + cols - 1) // cols
    row_h = [max(im.height for _, im in scaled[r * cols:(r + 1) * cols]) for r in range(rows)]
    W = cols * cell_w + (cols + 1) * pad
    H = sum(h + label_h for h in row_h) + (rows + 1) * pad
    sheet = Image.new("RGB", (W, H), (235, 235, 235))
    d = ImageDraw.Draw(sheet)
    y = pad
    for r in range(rows):
        x = pad
        for name, im in scaled[r * cols:(r + 1) * cols]:
            d.text((x + 2, y + 6), name, fill=(20, 20, 20))
            sheet.paste(im, (x, y + label_h))
            x += cell_w + pad
        y += row_h[r] + label_h + pad
    sheet.save(path)


def main() -> None:
    want = set(sys.argv[1:])
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(SHEET_DIR, exist_ok=True)
    made: list[tuple[str, Image.Image]] = []
    for name, idx, box, mode in CROPS:
        if want and name not in want:
            continue
        # 海报类（raw）走 WebP：深色渐变+抗锯齿，PNG 体积是 WebP 的 5-10 倍
        out = name[:-4] + ".webp" if mode == "raw" else name
        im = load_src(idx).crop(box)
        if mode == "trim":
            im = smart_trim(im)
        save(im, out)
        made.append((out, im))
        print(f"{out:32s} <- img{idx} {box}  -> {im.size}")
    # 分主题拼版（每 12 张一版）便于人工核对
    for i in range(0, len(made), 12):
        contact_sheet(made[i:i + 12], os.path.join(SHEET_DIR, f"sheet-{i // 12 + 1}.png"))


if __name__ == "__main__":
    main()
