"""端到端冒烟测试：暗色科技风博客（serve dist @ 127.0.0.1:4327）
适配 ClientRouter 软导航：断言一律用 DOM 状态，不依赖 page.url。"""
import json
import re
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from urllib.parse import quote

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4327"
ROOT = Path(__file__).resolve().parents[1]
# 产物目录：用来做页面级断言看不见的全站扫描（死链 / 该消失的页面）
DIST = ROOT / "dist"
results = []

# 项目页断言不写死仓库数：直接读构建期数据文件 —— 加减仓库 / 改忽略列表都不用动测试。
# 合并规则与 src/lib/projects.ts#mergeRepoFiles 同款：同名镜像保留 GitHub 版。
try:
    gh_repos = json.loads((ROOT / "src" / "data" / "github-repos.json")
                          .read_text(encoding="utf-8"))["repos"]
    try:
        gitee_repos = json.loads((ROOT / "src" / "data" / "gitee-repos.json")
                                 .read_text(encoding="utf-8"))["repos"]
    except Exception:
        gitee_repos = []  # gitee 文件缺失不该让 GitHub 侧断言一起崩
    gh_names = {r["name"] for r in gh_repos}
    repo_total = len(gh_repos) + sum(1 for r in gitee_repos if r["name"] not in gh_names)
except Exception:
    repo_total = -1  # 主数据文件缺失 / 损坏时让项目页断言红，而不是整个脚本崩掉
# hero 署名读同一份源（侧栏品牌区读的也是它）——两处写死必然漂移
try:
    profile_name = json.loads((ROOT / "src" / "data" / "github-profile.json")
                              .read_text(encoding="utf-8"))["name"]
except Exception:
    profile_name = ""


def check(name: str, cond: bool, detail: str = ""):
    results.append((name, cond, detail))
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"  [{detail}]" if detail else ""))


with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    # notifications：让整点提醒的开关走「已授权」路径（headless 下 requestPermission 行为不稳）
    ctx = browser.new_context(color_scheme="dark", permissions=["notifications"])
    page = ctx.new_page()
    page.goto(BASE, wait_until="networkidle")

    # 1. 首页：hero（固定文案 + 构建期推导的篇数）→ 项目预览 → 文章（空则整块不渲染）
    hero_h1 = (page.locator(".hero h1").text_content() or "").strip()
    check("首页 hero 主标题为固定文案", hero_h1 == "嵌入式 · 硬件电路 · AI 底层原理",
          f"h1={hero_h1!r}")
    hero_hi = (page.locator(".hero-hi").text_content() or "").strip()
    check("首页 hero 署名取自 github-profile.json",
          hero_hi == f"你好，我是 {profile_name}", f"hi={hero_hi!r} name={profile_name!r}")
    hero_sub = (page.locator(".hero-sub").text_content() or "").strip()
    check("首页 hero 副标题的篇数来自笔记 collection",
          hero_sub == "35 篇从零学起的学习笔记，持续更新中", f"sub={hero_sub!r}")
    check("首页 hero 装饰图存在且对辅助技术隐藏",
          page.locator("svg.hero-motif[aria-hidden='true']").count() == 1)
    # 这条是机制断言：内联 svg 根元素不是 LCP 候选，里面也没有 <image>，
    # 所以首屏 LCP 只可能是文本（结果由 Lighthouse 人工验，这里锁构造）
    check("首页 hero 装饰图不含 LCP 候选元素（无 <image>）",
          page.locator("svg.hero-motif image").count() == 0)
    check("跟随系统暗色偏好", page.evaluate("document.documentElement.dataset.theme") == "dark")

    check("首页项目区渲染项目卡（最多 3 张，与数据文件一致）",
          page.locator(".proj-card").count() == min(3, repo_total),
          f"cards={page.locator('.proj-card').count()} repos={repo_total}")
    check("首页项目区提供「全部项目」入口",
          page.locator(".home-projects a[href='/projects/']").count() == 1)
    # 文章区按有无文章自动显隐：section 与 .card 同真同假 —— 发布第一篇后不用改这条。
    # 顺带锁死「项目卡不得复用 .card」：项目卡若也叫 .card，这条立刻红。
    card_n = page.locator(".card").count()
    article_n = page.locator("section[aria-label='文章列表']").count()
    check("首页文章区按有无文章自动显隐", article_n == (1 if card_n > 0 else 0),
          f"sections={article_n} cards={card_n}")
    # 知识库入口已从首页挪到侧栏（首页不再重建分类卡）
    check("侧栏知识库入口齐全",
          page.locator(".sidebar a[href='/notes/']").count() == 1
          and page.locator(".sidebar a[href='/notes/graph/']").count() == 1
          and page.locator(".sidebar a[href='/tags/']").count() == 1)

    # 1.6 项目页 /projects/（数据来自构建期抓取的 src/data/github-repos.json）
    page.goto(f"{BASE}/projects/", wait_until="networkidle")
    check("项目页 h1", (page.locator(".projects-page h1").text_content() or "").strip() == "项目",
          f"h1={page.locator('.projects-page h1').text_content()!r}")
    proj_cards = page.locator(".proj-card")
    check("项目页列出全部仓库（与数据文件一致）", proj_cards.count() == repo_total,
          f"cards={proj_cards.count()} repos={repo_total}")
    proj_hrefs = [a.get_attribute("href") for a in proj_cards.all()]
    check("项目卡全部指向外部 https 且新窗口打开",
          bool(proj_hrefs)
          and all(h and h.startswith("https://") for h in proj_hrefs)
          and all(a.get_attribute("target") == "_blank"
                  and "noopener" in (a.get_attribute("rel") or "")
                  for a in proj_cards.all()),
          f"hrefs={proj_hrefs[:2]}")
    check("项目页标出数据来源（GitHub 与 Gitee）",
          "GitHub" in (page.locator(".projects-source").text_content() or "")
          and "Gitee" in (page.locator(".projects-source").text_content() or ""))
    proj_side = page.evaluate(
        "const q = s => document.querySelector(`.sidebar .nav-link[href='${s}']`);"
        "({ projects: q('/projects/')?.classList.contains('active'),"
        "  aria: q('/projects/')?.getAttribute('aria-current'),"
        "  home: q('/')?.classList.contains('active') })")
    check("项目页侧栏高亮且首页不误高亮",
          proj_side.get("projects") is True and proj_side.get("aria") == "page"
          and proj_side.get("home") is not True, f"{proj_side}")
    check("项目页面包屑为中文", "首页 / 项目" in (page.locator(".breadcrumb").text_content() or ""))

    # 软导航（不是 goto）点进项目页：persist 侧栏的 active 是构建期烘焙值，
    # 必须在 astro:page-load 后按当前路径重算 —— 这是新 nav href 唯一的失效面
    page.goto(BASE, wait_until="networkidle")
    page.click(".home-projects a[href='/projects/']")
    page.wait_for_selector(".projects-page h1", timeout=10000, state="attached")
    soft_side = page.evaluate(
        "const q = document.querySelector(\".sidebar .nav-link[href='/projects/']\");"
        "({ active: q?.classList.contains('active'), aria: q?.getAttribute('aria-current') })")
    check("软导航进项目页后侧栏高亮同步",
          soft_side.get("active") is True and soft_side.get("aria") == "page", f"{soft_side}")

    # 2. 侧栏 → 笔记索引 → **自动分类页**（列表完全由 collection 推导，是各分类唯一的索引）
    page.click(".sidebar .nav-link[href='/notes/']")
    page.wait_for_selector("h2.cat-title", timeout=10000, state="attached")
    page.click(".cat-title a[href='/notes/embedded/']")
    page.wait_for_selector(".cat-page h1", timeout=10000)
    check("分类卡进入自动分类页",
          (page.locator(".cat-page h1").text_content() or "").strip() == "嵌入式",
          f"h1={page.locator('.cat-page h1').text_content()!r}")
    cat_rows = page.locator(".cat-page .note-row")
    check("分类页列出该分类全部 14 篇笔记", cat_rows.count() == 14, f"rows={cat_rows.count()}")
    cat_hrefs = [a.get_attribute("href") for a in cat_rows.all()]
    check("分类页每条都链到本分类笔记",
          bool(cat_hrefs) and all(h and h.startswith("/notes/embedded/") for h in cat_hrefs),
          f"hrefs={cat_hrefs[:3]}")

    # 2.5 分类页→笔记软导航：上下篇链路 + persist 侧栏的 active 必须在新页面上重算
    first_title = (page.locator(".cat-page .note-row .note-title").first.text_content() or "").strip()
    page.locator(".cat-page .note-row").first.click()
    page.wait_for_selector(".post-header h1", timeout=10000)
    check("分类页点击进入笔记详情",
          (page.locator(".post-header h1").text_content() or "").strip() == first_title,
          f"h1={page.locator('.post-header h1').text_content()!r} want={first_title!r}")
    check("笔记页 TOC 渲染", page.locator(".toc-item").count() > 0,
          f"toc={page.locator('.toc-item').count()}")
    check("阅读进度条存在", page.locator(".reading-progress").count() == 1)
    check("上下篇导航存在", page.locator(".pn-link").count() >= 1)
    check("侧栏跨页持久存在", page.locator(".sidebar").count() == 1)
    avatar = page.locator("#sidebar .brand img.brand-avatar")
    check("侧栏 GitHub 头像加载", avatar.count() == 1
          and avatar.first.evaluate("el => el.complete && el.naturalWidth > 0"),
          f"count={avatar.count()}")

    # 软导航：点上下篇，页面必须真的换掉，且 persist 侧栏的高亮要在新页面上重算
    title_before = (page.locator(".post-header h1").text_content() or "").strip()
    page.click(".pn-link")
    page.wait_for_selector(".post-header h1", timeout=10000)
    check("上下篇软导航到邻近笔记",
          (page.locator(".post-header h1").text_content() or "").strip() != title_before,
          f"仍停在 {title_before!r}")
    side_active = page.evaluate(
        "document.querySelector(\".sidebar .nav-link[href='/notes/']\")"
        "?.classList.contains('active')")
    check("软导航后侧栏高亮同步", side_active is True)

    # 3. 侧栏导航到 About（persist 的侧栏在软导航后仍可点击）
    page.wait_for_selector(".sidebar .nav-link[href='/about/']", timeout=10000)
    page.click(".sidebar .nav-link[href='/about/']")
    page.wait_for_selector("h1:has-text('关于')", timeout=10000, state="attached")
    check("侧栏导航到 About", page.locator("h1", has_text="关于").count() == 1)
    about_state = page.evaluate(
        "const q = s => document.querySelector(`.sidebar .nav-link[href='${s}']`);"
        "({ about: q('/about/')?.classList.contains('active'),"
        "  aboutAria: q('/about/')?.getAttribute('aria-current'),"
        "  home: q('/')?.classList.contains('active') })")
    check("About 页侧栏高亮正确", about_state.get("about") is True
          and about_state.get("aboutAria") == "page" and about_state.get("home") is not True,
          f"{about_state}")

    # 3.5 笔记板块：索引分类 → 软导航进详情（KaTeX / C 高亮 / 同分类上下篇 / 侧栏前缀高亮）
    page.click(".sidebar .nav-link[href='/notes/']")
    page.wait_for_selector("h2.cat-title", timeout=10000, state="attached")
    check("笔记索引按分类分组", page.locator("h2.cat-title").count() == 3)
    check("笔记列表共 35 篇", page.locator(".note-row").count() == 35,
          f"rows={page.locator('.note-row').count()}")
    page.click("a[href='/notes/hardware/mosfet-basics/']")
    page.wait_for_selector(".post-header h1", timeout=10000, state="attached")
    katex_n = page.locator(".katex").count()
    check("硬件笔记 KaTeX 公式渲染", katex_n > 50, f"katex={katex_n}")
    # 渐进滚动：软导航后新页面的 TOC 追踪必须重新初始化
    # （单次大跳跃会让标题全落在 IntersectionObserver 的 15%-30% 视口带外，必挂）
    for _ in range(6):
        page.mouse.wheel(0, 350)
        page.wait_for_timeout(250)
        if page.locator(".toc-item a.active").count() >= 1:
            break
    page.wait_for_timeout(400)  # 等 IntersectionObserver 收尾
    check("软导航后 TOC 滚动追踪仍生效", page.locator(".toc-item a.active").count() >= 1,
          f"active={page.locator('.toc-item a.active').count()}")
    note_side = page.evaluate(
        "const q = document.querySelector(\".sidebar .nav-link[href='/notes/']\");"
        "({ active: q?.classList.contains('active'), aria: q?.getAttribute('aria-current') })")
    check("软导航后侧栏「笔记」前缀高亮", note_side.get("active") is True
          and note_side.get("aria") == "page", f"{note_side}")
    page.goto(f"{BASE}/notes/embedded/mcu-gpio/", wait_until="networkidle")
    check("嵌入式笔记 C 代码高亮", page.locator("pre[data-language='c']").count() >= 1)
    page.goto(f"{BASE}/notes/hardware/comparator-basics/", wait_until="networkidle")
    check("硬件笔记表格渲染", page.locator(".post-content table th").count() > 0)
    pn_hrefs = [a.get_attribute("href") for a in page.locator(".pn-link").all()]
    check("笔记上下篇留在 /notes/ 内", pn_hrefs and all(h and h.startswith("/notes/") for h in pn_hrefs),
          f"{pn_hrefs}")

    # 4. 搜索：Ctrl+K 唤起 → 输入 → Enter 进入（标题索引内联，结果即时渲染）
    page.keyboard.press("Control+k")
    check("Ctrl+K 打开搜索模态", page.locator("#search-modal:not([hidden])").count() == 1)
    page.fill("#search-input", "Transformer")
    page.wait_for_timeout(1200)  # 等正文索引 fetch 落地，结果集才稳定

    def sel_title():
        return page.evaluate(
            "document.querySelector('#search-results .result.selected .r-title')?.textContent")

    n_results = page.locator("#search-results .result").count()
    check("搜索出结果", n_results >= 2, f"results={n_results}")
    if n_results >= 2:
        # 标题命中排在正文命中之前，且 selected 初始为 0 —— 默认选中的就是首条。
        # 只断言「首条是标题命中」（标题含查询词），不断言具体是哪篇 —— 标题改写
        # （如剥副题）会改变谁命中标题，位次不是机制本身
        first = sel_title()
        check("搜索结果默认选中首条（标题命中优先）",
              bool(first) and "transformer" in first.lower(), f"first={first!r}")
        page.keyboard.press("ArrowDown")
        page.wait_for_timeout(150)
        moved = sel_title()
        check("↓ 在结果间移动选中项", moved != first, f"{first!r} -> {moved!r}")
        page.keyboard.press("ArrowUp")
        page.wait_for_timeout(150)
        check("↑ 回到首条", sel_title() == first, f"{sel_title()!r}")
        page.keyboard.press("Enter")
        try:
            page.wait_for_selector(".post-header h1", timeout=10000, state="attached")
            check("Enter 进入搜索结果", True, f"selected={first!r}")
        except Exception:
            check("Enter 进入搜索结果", False, f"selected={first!r}")
    page.keyboard.press("Escape")

    # 5. 主题切换 + 刷新保持
    page.click("#theme-toggle")
    page.wait_for_timeout(700)  # View Transition 圆形扩散
    check("点击切换到亮色", page.evaluate("document.documentElement.dataset.theme") == "light")
    page.reload(wait_until="networkidle")
    check("刷新后主题保持", page.evaluate("document.documentElement.dataset.theme") == "light")
    page.click("#theme-toggle")
    page.wait_for_timeout(700)

    # 6. 404 页
    page.goto(BASE + "/not-exist-page/", wait_until="networkidle")
    check("404 定制页", "飘走了" in page.content())

    # 7. 移动端 375px 抽屉
    mob = ctx.new_page()
    mob.set_viewport_size({"width": 375, "height": 720})
    mob.goto(BASE, wait_until="networkidle")
    check("移动端汉堡按钮可见", mob.locator("#menu-btn").is_visible())
    mob.click("#menu-btn")
    mob.wait_for_timeout(500)
    t1 = mob.evaluate("getComputedStyle(document.getElementById('sidebar')).transform")
    check("点击后抽屉滑出", t1 == "matrix(1, 0, 0, 1, 0, 0)", t1)
    mob.mouse.click(360, 400)  # 点击抽屉外区域
    mob.wait_for_timeout(500)
    t2 = mob.evaluate("getComputedStyle(document.getElementById('sidebar')).transform")
    check("点击外部抽屉收起", t2 != "matrix(1, 0, 0, 1, 0, 0)", t2)

    # 7.5 软导航后汉堡按钮仍可打开抽屉（按钮是新 DOM，监听必须重新生效）
    mob.click("#menu-btn")
    mob.wait_for_timeout(500)
    mob.click(".sidebar .nav-link[href='/notes/']")
    mob.wait_for_selector("h2.cat-title", timeout=10000, state="attached")
    check("移动端软导航进入笔记索引", mob.locator("h2.cat-title").count() == 3,
          f"cats={mob.locator('h2.cat-title').count()}")
    # 抽屉已关时 Escape 是空操作 —— 这样断言在「.open 跨软导航残留」和「已修」两种情况下都成立
    mob.keyboard.press("Escape")
    mob.click("#menu-btn")
    mob.wait_for_timeout(500)
    t3 = mob.evaluate("getComputedStyle(document.getElementById('sidebar')).transform")
    check("软导航后汉堡仍可打开抽屉", t3 == "matrix(1, 0, 0, 1, 0, 0)", t3)
    mob.close()

    # 8. 番茄钟：胶囊 → 面板 → 开始/暂停/跳过/重置（跳过驱动状态机，不等真实时长）
    page.goto(BASE, wait_until="networkidle")
    check("顶栏番茄钟胶囊存在", page.locator("#pomodoro-pill").count() == 1)
    page.click("#pomodoro-pill")
    check("点击胶囊弹出面板", page.locator("#pomodoro-panel:not([hidden])").count() == 1)
    page.click("[data-pomo-start]")
    page.wait_for_timeout(1300)
    t_run = page.locator("#pomodoro-pill .pomo-time").text_content()
    check("开始后胶囊显示倒计时", t_run == "24:59", f"time={t_run!r}")
    check("运行中标签页标题同步", page.title().startswith("24:59"), f"title={page.title()!r}")
    page.click("[data-pomo-start]")  # 同一按钮切换为暂停
    page.wait_for_timeout(1300)
    t_paused = page.locator("#pomodoro-pill .pomo-time").text_content()
    check("暂停后时间冻结", t_paused == t_run, f"{t_run!r} -> {t_paused!r}")
    page.click("[data-pomo-skip]")  # 跳过专注 → 短休（不计完成，胶囊回闲置态故读面板）
    page.wait_for_timeout(300)
    ph = page.locator("[data-pomo-phase-label]").text_content()
    t_short = page.locator("#pomodoro-panel [data-pomo-time]").text_content()
    check("跳过专注进入短休", ph == "短休" and t_short == "05:00", f"phase={ph!r} time={t_short!r}")
    page.click("[data-pomo-start]")  # 短休开始计时
    page.wait_for_timeout(1300)
    t_going = page.locator("#pomodoro-panel [data-pomo-time]").text_content()
    check("短休计时走到 04:59", t_going == "04:59", f"time={t_going!r}")
    page.click("[data-pomo-reset]")
    page.wait_for_timeout(300)
    t_reset = page.locator("#pomodoro-panel [data-pomo-time]").text_content()
    check("重置回短休满时长", t_reset == "05:00", f"time={t_reset!r}")
    page.keyboard.press("Escape")
    check("Esc 关闭番茄钟面板", page.locator("#pomodoro-panel[hidden]").count() == 1)

    # 8.5 书钉固定：面板 → 右下迷你卡 → 软导航常驻 → 取消固定回面板
    page.click("#pomodoro-pill")
    page.wait_for_timeout(200)
    page.click("[data-pomo-pin]")
    page.wait_for_timeout(300)
    check("书钉固定后迷你卡出现", page.locator("#pomodoro-mini:not([hidden])").count() == 1)
    check("固定时面板关闭", page.locator("#pomodoro-panel[hidden]").count() == 1)
    page.click("[data-pomo-mini-toggle]")  # 短休开始计时
    page.wait_for_timeout(1300)
    mt = page.locator("[data-pomo-mini-time]").text_content()
    check("迷你卡计时走动", mt == "04:59", f"time={mt!r}")
    # 软导航进分类页：迷你卡必须跨页常驻（每页重挂 body）。
    # 用固定定位的侧栏而不是首页链接 —— 这条测的是迷你卡常驻，导航路径该选最不脆的那个
    # （侧栏 z-index 40，不会被 sticky 顶栏截获）
    page.click(".sidebar .nav-link[href='/notes/']")
    page.wait_for_selector("h2.cat-title", timeout=10000, state="attached")
    page.click(".cat-title a[href='/notes/embedded/']")
    page.wait_for_selector(".cat-page h1", timeout=10000, state="attached")
    check("软导航进入分类页（迷你卡常驻的前置条件）",
          page.locator(".cat-page .note-row").count() >= 1)
    check("软导航后迷你卡仍常驻", page.locator("#pomodoro-mini:not([hidden])").count() == 1)
    page.click("[data-pomo-mini-unpin]")
    page.wait_for_timeout(300)
    check("取消固定后卡收面板回", page.locator("#pomodoro-mini[hidden]").count() == 1
          and page.locator("#pomodoro-panel:not([hidden])").count() == 1)
    page.keyboard.press("Escape")

    # 8.7 弹出置顶小窗：画中画（Document PiP）优先 —— 同 JS 上下文直连主页状态机；
    # headless 拒绝 PiP 时脚本自动降级 window.open 独立页（storage 事件同步），两条路都断言
    page.click("#pomodoro-pill")
    page.wait_for_timeout(200)
    page.click("[data-pomo-skip]")  # 8.5 遗留的短休计时 → 专注 25:00 闲置
    page.wait_for_timeout(200)

    def pip_eval(expr):
        return page.evaluate(f"documentPictureInPicture.window?.{expr}")

    new_pages = []
    page.context.on("page", lambda pg: new_pages.append(pg))
    page.click("[data-pomo-popout]")
    page.wait_for_timeout(800)
    pip_open = page.evaluate("!!documentPictureInPicture.window")

    if pip_open:
        pt = pip_eval("document.querySelector('[data-pip-time]').textContent")
        check("弹出画中画置顶小窗", pt == "25:00", f"time={pt!r}")
        check("弹小窗时主面板关闭", page.locator("#pomodoro-panel[hidden]").count() == 1)
        pip_eval("document.querySelector('[data-pip-start]').click()")
        page.wait_for_timeout(1300)
        pt_run = pip_eval("document.querySelector('[data-pip-time]').textContent")
        t_main = page.locator("#pomodoro-pill .pomo-time").text_content()
        check("小窗开始同步到主页胶囊", t_main == "24:59" and pt_run == "24:59",
              f"main={t_main!r} pip={pt_run!r}")
        pip_eval("document.querySelector('[data-pip-start]').click()")  # 小窗里暂停
        page.wait_for_timeout(1300)
        t_main2 = page.locator("#pomodoro-pill .pomo-time").text_content()
        check("小窗暂停同步到主页胶囊", t_main2 == t_main, f"{t_main!r} -> {t_main2!r}")
        page.evaluate("documentPictureInPicture.window.close()")
        page.wait_for_timeout(400)
        check("关闭小窗后引用清空", page.evaluate("!documentPictureInPicture.window"))

        # 降级路径：屏蔽 PiP API 后重载，弹出应走 window.open 独立页
        page.add_init_script(
            "Object.defineProperty(window, 'documentPictureInPicture', { value: undefined })")
        page.reload(wait_until="networkidle")
        page.click("#pomodoro-pill")
        page.wait_for_timeout(200)
        with page.context.expect_page() as pop_info:
            page.click("[data-pomo-popout]")
        popup = pop_info.value
        popup.wait_for_load_state("domcontentloaded")
        popup.wait_for_timeout(500)
        pt = popup.locator("[data-pop-time]").text_content()
        check("无画中画时降级独立小窗", popup.locator("[data-pop-time]").count() == 1
              and pt == "24:59", f"time={pt!r}")  # 暂停冻结的剩余，非满时长
        popup.close()
    else:
        # headless 拒绝画中画 → 脚本已降级开出独立页（storage 事件同步语义）
        popup = new_pages[-1]
        popup.wait_for_load_state("domcontentloaded")
        popup.wait_for_timeout(500)
        pt = popup.locator("[data-pop-time]").text_content()
        check("弹出小窗为独立页面", popup.locator("[data-pop-time]").count() == 1 and pt == "25:00",
              f"time={pt!r}")
        popup.click("[data-pop-start]")
        popup.wait_for_timeout(1300)
        check("小窗标题同步倒计时", popup.title().startswith("24:59"), f"title={popup.title()!r}")
        t_main = page.locator("#pomodoro-pill .pomo-time").text_content()
        check("小窗开始同步到主页胶囊", t_main == "24:59", f"time={t_main!r}")
        popup.click("[data-pop-start]")  # 小窗里暂停
        popup.wait_for_timeout(1300)
        t_main2 = page.locator("#pomodoro-pill .pomo-time").text_content()
        check("小窗暂停同步到主页胶囊", t_main2 == t_main, f"{t_main!r} -> {t_main2!r}")
        popup.close()

    # 8.9 整点站立提醒：面板里的独立开关（与番茄钟互不影响）
    page.goto(BASE, wait_until="networkidle")
    page.click("#pomodoro-pill")
    page.wait_for_timeout(200)
    check("面板含整点提醒开关", page.locator("[data-stand-toggle]").count() == 1)
    check("整点提醒默认关闭", page.locator('[data-stand-toggle][aria-checked="false"]').count() == 1)
    off_text = page.locator("[data-stand-next]").text_content() or ""
    check("关闭态提示文案", "站起来" in off_text, f"text={off_text!r}")
    page.click("[data-stand-toggle]")
    # toggle 是 async（即便权限已 granted 也至少一个微任务），等状态而不是裸断言
    page.wait_for_selector('[data-stand-toggle][aria-checked="true"]', timeout=5000)
    check("点开关不顺手关面板", page.locator("#pomodoro-panel:not([hidden])").count() == 1)
    on_text = page.locator("[data-stand-next]").text_content() or ""
    check("开启后显示下次整点", "下次 " in on_text and ":00" in on_text, f"text={on_text!r}")
    raw = page.evaluate("localStorage.getItem('stand-reminder')") or ""
    check("开启落盘（独立于 pomodoro key）", '"enabled":true' in raw, f"raw={raw!r}")
    page.click("[data-stand-toggle]")
    page.wait_for_selector('[data-stand-toggle][aria-checked="false"]', timeout=5000)
    raw = page.evaluate("localStorage.getItem('stand-reminder')") or ""
    check("关闭落盘", '"enabled":false' in raw, f"raw={raw!r}")
    page.keyboard.press("Escape")

    # 8.9b 触发路径：假时钟快进到整点 —— 通知 + 胶囊琥珀态 + 落盘推进。
    # 必须用【独立 context】：page.clock 挂在 context 上且无法卸载（Playwright 实现里
    # Page.clock 就是 browser_context.clock），在共享 context 里装会让本节之后所有页面
    # 全部跑在被定死的时间里。顺带隔离存储，不污染后续用例。
    HOUR_MS = 3_600_000
    grid = (int(time.time() * 1000) // HOUR_MS) * HOUR_MS
    base = grid + 30 * 60_000  # 停在 :30 —— 距下一个整点整整 30 分钟真实时间余量，避开实时竞态
    h_index_next = base // HOUR_MS + 1
    h_next = time.localtime((base + HOUR_MS) / 1000).tm_hour  # 断言用的本地小时，别写死

    ctx2 = browser.new_context(color_scheme="dark", permissions=["notifications"])
    p2 = ctx2.new_page()
    # 新 context 存储为空，必须靠 init script 播种 —— 它先于页面脚本执行，即先于读盘。
    # pomodoro 也播成闲置态，这条用例才真的证明「提醒与番茄钟互不影响」。
    p2.add_init_script("""
      localStorage.setItem("pomodoro", JSON.stringify({version:1,phase:"focus",running:false,
        endsAt:null,remainingMs:1500000,completedFocus:0,awaiting:false}));
      localStorage.setItem("stand-reminder", JSON.stringify({version:1,enabled:true,lastFiredHour:-1}));
      window.__notes = [];
      function FakeNotification(title, opts){
        var o = opts || {};
        window.__notes.push({title:title, body:o.body, tag:o.tag, renotify:o.renotify === true});
      }
      FakeNotification.permission = "granted";
      FakeNotification.requestPermission = function(){ return Promise.resolve("granted"); };
      window.Notification = FakeNotification;
    """)
    # 注意：install(time=) 的数值单位是【Unix 秒】，不是毫秒（Playwright 的 parse_time
    # 对数字一律 ×1000）。传毫秒会再乘一次、落到公元 57000 年，表现是「什么都没发生」。
    p2.clock.install(time=base / 1000)
    p2.goto(BASE, wait_until="networkidle")
    p2.wait_for_selector("#pomodoro-pill", timeout=10000)
    check("未到整点不触发提醒（番茄钟处于闲置态）",
          p2.evaluate("window.__notes.length") == 0
          and p2.locator('#pomodoro-pill[data-stand="1"]').count() == 0)
    # "30:01" = 30 分 1 秒，越过边界与 250ms 余量；写成 "30:00" 定时器【不会】触发
    p2.clock.fast_forward("30:01")
    p2.wait_for_timeout(300)
    notes = p2.evaluate("window.__notes")
    check("整点触发系统通知", len(notes) == 1, f"notes={notes!r}")
    check("通知标题带整点与诉求",
          bool(notes) and f"{h_next:02d}:00" in notes[0]["title"] and "站起来" in notes[0]["title"],
          f"title={notes[0]['title']!r}" if notes else "无通知")
    # tag + renotify 成对才有意义：只有 tag 时浏览器会静默替换上一条，第二条就不响
    check("通知带 tag+renotify（否则下一条静默）",
          bool(notes) and notes[0]["tag"] == "stand-reminder" and notes[0]["renotify"] is True,
          f"tag={notes[0]['tag']!r} renotify={notes[0]['renotify']!r}" if notes else "无通知")
    check("胶囊进入琥珀提醒态", p2.locator('#pomodoro-pill[data-stand="1"]').count() == 1)
    check("播报进入 aria-live", "站起来" in (p2.locator("[data-pomo-live]").text_content() or ""))
    fired = p2.evaluate("JSON.parse(localStorage.getItem('stand-reminder')).lastFiredHour")
    check("落盘推进到已提醒的整点（同整点不再重复）", fired == h_index_next,
          f"lastFiredHour={fired!r} 期望={h_index_next}")
    ctx2.close()

    # ---- 知识库：wikilink 渲染（三种形态）----
    page.goto(f"{BASE}/notes/embedded/mcu-pwm/", wait_until="networkidle")
    wl = page.locator("a.wikilink[href='/notes/embedded/mcu-gpio/']")
    check("wikilink basename 形渲染为站内链接", wl.count() == 1)
    check("wikilink 无别名用目标主标题", wl.text_content() == "单片机GPIO原理与实战",
          f"text={wl.text_content()!r}")

    page.goto(f"{BASE}/notes/embedded/mcu-timer-interrupt/", wait_until="networkidle")
    wl_alias = page.locator("a.wikilink[href='/notes/embedded/mcu-gpio/']")
    check("wikilink 别名形锚文本生效", wl_alias.text_content() == "GPIO 基础",
          f"text={wl_alias.text_content()!r}")

    page.goto(f"{BASE}/notes/hardware/comparator-basics/", wait_until="networkidle")
    wl_title = page.locator("a.wikilink[href='/notes/hardware/diode-basics/']")
    check("wikilink 主标题形解析命中", wl_title.text_content() == "二极管基础",
          f"text={wl_title.text_content()!r}")

    # ---- 知识库：反向链接面板（DOM attached 即断言，无需滚动进视口）----
    page.goto(f"{BASE}/notes/embedded/mcu-gpio/", wait_until="networkidle")
    bl = page.locator("section.backlinks .backlink-link")
    bl_titles = [bl.nth(i).text_content() for i in range(bl.count())]
    check("反链面板列出 wikilink 来源", any("PWM" in t for t in bl_titles), f"sources={bl_titles}")

    page.goto(f"{BASE}/notes/hardware/diode-basics/", wait_until="networkidle")
    bl2 = page.locator("section.backlinks .backlink-link")
    bl2_titles = [bl2.nth(i).text_content() for i in range(bl2.count())]
    check("反链面板覆盖手写标准链接来源", any("三极管" in t for t in bl2_titles),
          f"sources={bl2_titles}")

    # ---- 知识库：关系图谱页 ----
    page.goto(f"{BASE}/notes/graph/", wait_until="networkidle")
    check("图谱页 SVG 节点渲染", page.locator("svg .graph-node").count() == 35,
          f"nodes={page.locator('svg .graph-node').count()}")
    check("图谱页边渲染", page.locator("svg .graph-edge").count() > 0)
    check("图谱页图例三项", page.locator(".legend-item").count() == 3)
    # 孤立节点（degree=0）是**合法状态**：新加一篇没写正文互链的笔记就会出现，淡显即可。
    # 这里只断言「淡显标记与真实度数一致」，不再要求 0 孤立——旧断言等于强迫每次加笔记
    # 都必须挂进分类总览，正是把索引职责压给手写文章的那根绳子。
    # 顺带记一笔：标签**不**产生图谱的边（graph.ts 只读 extractOutgoingLinks 的正文链接），
    # 所以给孤立笔记补标签不会让它脱离孤立——只能靠正文互链。
    iso = page.evaluate(
        """() => {
          const d = JSON.parse(document.getElementById('graph-data').textContent);
          return { zero: d.nodes.filter(n => n.degree === 0).length,
                   flag: d.nodes.filter(n => n.isolated).length,
                   cls: document.querySelectorAll('#graph-canvas svg .graph-node.isolated').length };
        }"""
    )
    check("图谱孤立标记与真实度数一致", iso["zero"] == iso["flag"] == iso["cls"], f"{iso}")
    check("图谱节点是可点链接", page.locator("svg .graph-node a").first.get_attribute("href") is not None)
    # 标签在独立图层 labelLayer 里，不在 .graph-node 内部：CSS 选择器一旦没跟着搬，
    # 文字就退回 SVG 默认的黑色 16px，在暗底上等于隐形——而节点数断言完全看不出来
    # （已踩坑：87 项全绿，图上一个字都没有）
    labels = page.evaluate(
        """() => {
          const ts = [...document.querySelectorAll('#graph-canvas svg .graph-labels text')];
          const cs = ts[0] && getComputedStyle(ts[0]);
          return { n: ts.length, fill: cs && cs.fill, size: cs && cs.fontSize };
        }"""
    )
    check("图谱标签渲染且未退回 SVG 默认样式（黑字/16px 即失效）",
          labels["n"] == page.locator("svg .graph-node").count()
          and labels["fill"] not in (None, "rgb(0, 0, 0)")
          and labels["size"] == "11px",
          f"labels={labels}")
    # 标签撞车是结构性的：embedded 环最右到 hardware 环最左只有约 148px，环内相邻节点
    # 相距约 74px，而 12 字中文标题宽 142px——错行补不满，靠客户端那步确定性竖直避让兜底
    overlaps = page.evaluate(
        """() => {
          const bs = [...document.querySelectorAll('#graph-canvas svg .graph-labels text')]
            .map(t => t.getBBox());
          let n = 0;
          for (let i = 0; i < bs.length; i++)
            for (let j = i + 1; j < bs.length; j++) {
              const a = bs[i], c = bs[j];
              const ox = Math.min(a.x + a.width, c.x + c.width) - Math.max(a.x, c.x);
              const oy = Math.min(a.y + a.height, c.y + c.height) - Math.max(a.y, c.y);
              if (ox > 0 && oy > 0 && ox * oy > 8) n++;
            }
          return n;
        }"""
    )
    check("图谱标签无重叠（确定性避让生效）", overlaps == 0, f"overlaps={overlaps}")

    # ---- 知识库：全文搜索（wait_for_function 等 fetch 完成，不固定 sleep）----
    page.goto(BASE, wait_until="networkidle")
    page.keyboard.press("Control+k")
    page.wait_for_selector("#search-modal:not([hidden])")
    page.fill("#search-input", "迟滞")  # 仅存在于比较器笔记正文
    page.wait_for_function("document.querySelectorAll('.result').length > 0", timeout=5000)
    check("全文搜索正文词命中", page.locator(".result").count() >= 1)
    check("正文命中带上下文片段", page.locator(".result .r-snippet").count() >= 1)
    page.fill("#search-input", "GPIO")
    page.wait_for_timeout(300)
    check("标题命中仍优先", page.locator(".result .r-title").first.text_content() is not None
          and "GPIO" in page.locator(".result .r-title").first.text_content())

    # ---- 知识库：标签系统 ----
    page.goto(f"{BASE}/tags/", wait_until="networkidle")
    chips = page.locator(".tag-chip")
    check("标签云渲染且数量 > 0", chips.count() > 0, f"chips={chips.count()}")

    page.goto(f"{BASE}/tags/GPIO/", wait_until="networkidle")
    rows = page.locator(".note-row")
    row_titles = [rows.nth(i).text_content() for i in range(rows.count())]
    check("GPIO 标签页列出相关笔记", any("GPIO" in t for t in row_titles), f"rows={row_titles}")

    page.goto(f"{BASE}/tags/{quote('注意力机制')}/", wait_until="networkidle")
    ai_rows = page.locator(".note-row")
    ai_row_titles = [ai_rows.nth(i).text_content() for i in range(ai_rows.count())]
    check("AI 新标签页有内容", any("自注意力" in t for t in ai_row_titles),
          f"rows={ai_row_titles}")

    page.goto(f"{BASE}/notes/embedded/mcu-gpio/", wait_until="networkidle")
    tag_chip = page.locator(".note-tags .tag-chip")
    check("笔记详情页显示标签胶囊", tag_chip.count() >= 1, f"chips={tag_chip.count()}")
    tag_chip.first.click()
    page.wait_for_timeout(500)
    check("点击胶囊软导航进标签页", page.locator(".tag-page .note-row").count() >= 1)

    # ---- 知识库：三个分类总览（MOC）已删除 ----
    # 删文章只是第一步：正文里原有 15 处 [[<分类>/overview]]，漏改一处就是死链，
    # 而那种链接点下去才 404——页面级断言看不见。直接扫产物，一次覆盖全站（正文 /
    # 侧栏 / 搜索索引 / 上下篇……），不用逐个页面访问。
    html_files = sorted(DIST.rglob("*.html"))  # 产物缺失时下面两条会一起挂，不会假绿
    stale_pages = []
    for p in html_files:
        text = p.read_text(encoding="utf-8", errors="ignore")
        if any(f"/notes/{c}/overview/" in text for c in ("embedded", "hardware", "ai")):
            stale_pages.append(p.relative_to(DIST).as_posix())
    check("全站无指向已删除分类总览的死链", bool(html_files) and not stale_pages,
          f"html={len(html_files)} pages={stale_pages[:3]}")
    left = [
        f"{c}/overview"
        for c in ("embedded", "hardware", "ai")
        if (DIST / "notes" / c / "overview" / "index.html").exists()
    ]
    check("分类总览页面已从产物中消失", bool(html_files) and not left, f"left={left}")

    # ---- 知识库：AI 分类（第三分类的配图 / 公式 / 反链 / 上下篇不越类）----
    AI_NOTES = [
        "neural-network-basics", "optimization-and-stability", "transformer",
        "tokens-and-decoding", "llm-training", "vision-models",
        "multimodal-models", "diffusion-models",
    ]
    # 「覆盖全部」的职责在自动分类页；MOC 删除后 AI 分类的篇数 == 正文篇数
    page.goto(f"{BASE}/notes/ai/", wait_until="networkidle")
    ai_rows = page.locator(".cat-page .note-row")
    ai_cat_hrefs = {a.get_attribute("href") for a in ai_rows.all()}
    check("AI 分类页列出全部 8 篇", ai_rows.count() == 8, f"rows={ai_rows.count()}")
    cat_missing = [s for s in AI_NOTES if f"/notes/ai/{s}/" not in ai_cat_hrefs]
    check("AI 分类页覆盖全部 8 篇正文", not cat_missing, f"missing={cat_missing}")

    page.goto(f"{BASE}/notes/ai/vision-models/", wait_until="networkidle")
    ai_imgs = page.locator(".post-content img")
    check("AI 笔记配图全部渲染（含 2 张 GIF）", ai_imgs.count() == 4, f"imgs={ai_imgs.count()}")
    check("AI 配图 alt 为中文描述",
          all(len(ai_imgs.nth(i).get_attribute("alt") or "") > 4
              for i in range(ai_imgs.count())))
    check("AI 配图惰性加载（不拖首屏）",
          all(ai_imgs.nth(i).get_attribute("loading") == "lazy"
              for i in range(ai_imgs.count())))
    ai_pn = [a.get_attribute("href") for a in page.locator(".pn-link").all()]
    check("AI 笔记上下篇不越分类",
          bool(ai_pn) and all(h and h.startswith("/notes/ai/") for h in ai_pn), f"{ai_pn}")

    page.goto(f"{BASE}/notes/ai/transformer/", wait_until="networkidle")
    check("AI 笔记 KaTeX 公式渲染", page.locator(".katex").count() > 0,
          f"katex={page.locator('.katex').count()}")
    ai_bl = [page.locator("section.backlinks .backlink-link").nth(i).text_content()
             for i in range(page.locator("section.backlinks .backlink-link").count())]
    # 反链只能来自正文互链（wikilink）——原来这条断言靠 ai/overview 链过来，MOC 删了就必须
    # 换成真实互链来源。用「≥3 条且含已知来源」而不是写死条数：再加互链不该让冒烟挂。
    check("AI 笔记反链来自正文互链（不再依赖已删的 MOC）",
          len(ai_bl) >= 3 and any("Transformer" in t for t in ai_bl), f"sources={ai_bl}")
    # 每篇 AI 笔记开头那句「本分类全部笔记见 …」，MOC 删除时从 [[ai/overview]] 改指分类页
    ai_cat_link = page.locator(".post-content a[href='/notes/ai/']")
    check("AI 笔记正文链到自动分类页",
          ai_cat_link.count() == 1 and (ai_cat_link.first.text_content() or "").strip() == "AI 原理",
          f"n={ai_cat_link.count()}")

    # ---- 知识库：笔记配图（![[x.png|alt]] → /images/，点击开灯箱）----
    page.goto(f"{BASE}/notes/hardware/rc-circuit-applications/", wait_until="networkidle")
    imgs = page.locator(".post-content img")
    check("笔记配图全部渲染", imgs.count() == 9, f"imgs={imgs.count()}")
    check("配图 alt 为中文描述（进全文搜索索引）",
          all(len(imgs.nth(i).get_attribute("alt") or "") > 4 for i in range(imgs.count())))
    imgs.first.click()
    page.wait_for_timeout(400)
    check("点击配图打开灯箱", page.evaluate("document.getElementById('lightbox')?.open === true"))

    browser.close()

fails = [r for r in results if not r[1]]
print(f"\n===== {len(results) - len(fails)}/{len(results)} passed =====")
exit(1 if fails else 0)
