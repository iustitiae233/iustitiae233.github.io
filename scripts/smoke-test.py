"""端到端冒烟测试：暗色科技风博客（serve dist @ 127.0.0.1:4327）
适配 ClientRouter 软导航：断言一律用 DOM 状态，不依赖 page.url。"""
import sys

sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4327"
results = []


def check(name: str, cond: bool, detail: str = ""):
    results.append((name, cond, detail))
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"  [{detail}]" if detail else ""))


with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    ctx = browser.new_context(color_scheme="dark")  # 系统偏好暗色
    page = ctx.new_page()
    page.goto(BASE, wait_until="networkidle")

    # 1. 首页加载与卡片
    cards = page.locator(".card")
    check("首页渲染文章卡片", cards.count() == 5, f"cards={cards.count()}")
    check("跟随系统暗色偏好", page.evaluate("document.documentElement.dataset.theme") == "dark")

    # 2. 卡片点击进入文章页（软导航：以文章 DOM 为准）
    cards.first.click()
    page.wait_for_selector(".post-header h1", timeout=10000, state="attached")
    check("卡片点击进入文章页", page.locator(".post-header h1").count() == 1)
    check("文章页 TOC 渲染", page.locator(".toc-item").count() > 0,
          f"toc={page.locator('.toc-item').count()}")
    check("阅读进度条存在", page.locator(".reading-progress").count() == 1)
    check("上下篇导航存在", page.locator(".pn-link").count() >= 1)
    check("侧栏跨页持久存在", page.locator(".sidebar").count() == 1)

    # 2.5 文章→文章软导航：TOC 滚动追踪与侧栏高亮必须在新页面上重新初始化
    page.click(".pn-link")  # 最新一篇只有"下一篇"
    page.wait_for_selector("h1:has-text('你好，Astro')", timeout=10000, state="attached")
    check("下一篇软导航到旧文章", page.locator(".post-header h1").count() == 1)
    page.mouse.wheel(0, 350)
    page.wait_for_timeout(250)
    page.mouse.wheel(0, 350)
    page.wait_for_timeout(250)
    page.mouse.wheel(0, 350)
    page.wait_for_timeout(600)  # 等 IntersectionObserver 触发
    check("软导航后 TOC 滚动追踪仍生效", page.locator(".toc-item a.active").count() >= 1,
          f"active={page.locator('.toc-item a.active').count()}")
    side_active = page.evaluate(
        "document.querySelector(\".sidebar .nav-link[href='/posts/hello-astro/']\")"
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

    # 4. 搜索：Ctrl+K 唤起 → 输入 → Enter 进入
    page.keyboard.press("Control+k")
    page.wait_for_timeout(600)  # pagefind 索引异步加载
    check("Ctrl+K 打开搜索模态", page.locator("#search-modal:not([hidden])").count() == 1)
    page.fill("#search-input", "Astro")
    page.wait_for_timeout(800)
    n_results = page.locator("#search-results .result").count()
    check("搜索出结果", n_results >= 1, f"results={n_results}")
    if n_results >= 1:
        # 第 1 条可能是首页（卡片文案含关键词）—— 按 ↓ 选中第 2 条（文章），
        # 顺带覆盖键盘导航；Enter 后应落在文章页
        page.keyboard.press("ArrowDown")
        page.wait_for_timeout(200)
        sel_url = page.evaluate(
            "document.querySelector('#search-results .result.selected .r-title')?.textContent")
        page.keyboard.press("Enter")
        try:
            page.wait_for_selector(".post-header h1", timeout=10000, state="attached")
            check("Enter 进入搜索结果", True, f"selected={sel_url!r}")
        except Exception:
            check("Enter 进入搜索结果", False, f"selected={sel_url!r}")
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
    mob.click(".card")
    mob.wait_for_selector(".post-header h1", timeout=10000, state="attached")
    mob.click("#menu-btn")
    mob.wait_for_timeout(500)
    t3 = mob.evaluate("getComputedStyle(document.getElementById('sidebar')).transform")
    check("软导航后汉堡仍可打开抽屉", t3 == "matrix(1, 0, 0, 1, 0, 0)", t3)
    mob.close()

    browser.close()

fails = [r for r in results if not r[1]]
print(f"\n===== {len(results) - len(fails)}/{len(results)} passed =====")
exit(1 if fails else 0)
