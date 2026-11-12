# 双盘页验收：桌面三栏 + 手机中/西切换 + 夏令时生日 + 控制台无错
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

QA = Path(__file__).resolve().parents[2] / ".qa"
QA.mkdir(exist_ok=True)
BASE = "http://127.0.0.1:5173/"

failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    tag = "PASS" if ok else "FAIL"
    print(f"[{tag}] {name}{(' :: ' + detail) if detail and not ok else ''}")
    if not ok:
        failures.append(name)


def fill_form(page, province: str, city: str, dob: str, time: str) -> None:
    page.goto(BASE, wait_until="networkidle")
    page.select_option("#province", label=province)
    page.select_option("#city", label=city)
    page.fill("#dob", dob)
    page.fill("#birth-time", time)
    page.click('.seg button:has-text("女")')
    page.click(".submit")


def collect_console(page) -> list[str]:
    errors: list[str] = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    return errors


def houses_unique(page) -> tuple[bool, str]:
    nums = page.eval_on_selector_all(
        ".vedic-grid .vcell-house", "els => els.map(e => e.textContent.trim())"
    )
    return len(set(nums)) == 12 and len(nums) == 12, ",".join(nums)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # ── 桌面 1280×800：三栏同屏 ──
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    page = ctx.new_page()
    errs = collect_console(page)
    fill_form(page, "上海", "黄浦区", "1965-02-06", "15:00")
    page.wait_for_selector(".vcell--lagna", timeout=45000)

    seg_hidden = page.eval_on_selector(
        ".dual-seg-row", "el => getComputedStyle(el).display === 'none'"
    )
    check("桌面：中/西分段控件隐藏", seg_hidden)

    cols = page.eval_on_selector_all(
        ".dual--live > .dual-col",
        "els => els.map(e => ({t: e.className, x: e.offsetLeft, w: e.offsetWidth, vis: e.offsetParent !== null}))",
    )
    check("桌面：三栏都渲染且可见", len(cols) == 3 and all(c["vis"] for c in cols), str(cols))
    mid_title = page.eval_on_selector(".dual-col--mid .panel-title", "el => el.textContent")
    check("桌面：中栏为合参占位", mid_title == "合参")
    both_in_view = all(
        c["x"] >= 0 and c["x"] + c["w"] <= page.evaluate("window.innerWidth") for c in cols
    )
    check("桌面：两盘与中栏同屏（无横向溢出）", both_in_view)

    lagna = page.eval_on_selector(
        ".vcell--lagna",
        "el => ({sign: el.querySelector('.vcell-sign').textContent, house: el.querySelector('.vcell-house').textContent, outline: getComputedStyle(el).outlineStyle, color: getComputedStyle(el).outlineColor})",
    )
    check("桌面：lagna 宫=双子第1宫且金色描边", lagna["sign"] == "双子" and lagna["house"] == "1" and lagna["outline"] == "solid", str(lagna))

    moon_cell = page.eval_on_selector(
        ".vcell-moondot",
        "el => { const c = el.closest('.vcell'); return {sign: c.querySelector('.vcell-sign').textContent, house: c.querySelector('.vcell-house').textContent, bg: getComputedStyle(el).backgroundColor} }",
    )
    check("手机前桌面：月亮宫=双鱼第10宫且朱砂点", moon_cell["sign"] == "双鱼" and moon_cell["house"] == "10" and moon_cell["bg"] != "rgba(0, 0, 0, 0)", str(moon_cell))

    ok, nums = houses_unique(page)
    check("桌面：十二宫序号 1–12 不重不漏", ok, nums)
    planet_count = page.eval_on_selector_all(".vedic .vplanet", "els => els.length")
    check("桌面：九曜全部入格", planet_count == 9, str(planet_count))
    rahu_retro = page.eval_on_selector_all(
        ".vedic .vplanet", "els => els.map(e => e.textContent)"
    )
    print("    格内九曜:", rahu_retro)

    page.screenshot(path=str(QA / "dual-desktop.png"), full_page=True)

    # 术语点开
    page.click(".vedic .vplanet-name:has-text('太阳')")
    page.wait_for_selector(".term-sheet", timeout=5000)
    sheet = page.eval_on_selector(".term-sheet", "el => el.textContent")
    check("桌面：印占术语点开有释义", "灵魂" in sheet, sheet[:60])
    page.screenshot(path=str(QA / "dual-desktop-term.png"))
    page.click(".term-sheet-close")

    # 中式盘术语仍可用（共用术语卡）
    page.click('.bazi .term[data-term="日主"]')
    page.wait_for_selector(".term-sheet", timeout=5000)
    check("桌面：中式术语卡仍可用", "日柱天干" in page.eval_on_selector(".term-sheet", "el => el.textContent"))
    page.keyboard.press("Escape")

    check("桌面：控制台无错误", not errs, "; ".join(errs[:3]))
    ctx.close()

    # ── 手机 390×844：中/西切换 ──
    mctx = browser.new_context(viewport={"width": 390, "height": 844})
    mpage = mctx.new_page()
    errs_m = collect_console(mpage)
    fill_form(mpage, "上海", "黄浦区", "1965-02-06", "15:00")
    mpage.wait_for_selector(".dual-seg-row", timeout=10000)

    seg_vis = mpage.eval_on_selector(
        ".dual-seg-row", "el => getComputedStyle(el).display !== 'none'"
    )
    check("手机：分段控件可见", seg_vis)
    mpage.screenshot(path=str(QA / "dual-mobile-cn.png"))

    initial_ve = mpage.eval_on_selector(
        ".dual-col--ve", "el => getComputedStyle(el).display"
    )
    initial_cn = mpage.eval_on_selector(
        ".dual-col--cn", "el => getComputedStyle(el).display"
    )
    check("手机：初始只显示中式盘", initial_ve == "none" and initial_cn == "block", f"ve={initial_ve} cn={initial_cn}")

    mpage.click('.dual-seg button:has-text("西")')
    mpage.wait_for_selector(".dual-col--ve.dual-col--active", timeout=5000)
    anim = mpage.eval_on_selector(
        ".dual-col--ve.dual-col--active", "el => getComputedStyle(el).animationName"
    )
    check("手机：切西有过渡动画", anim == "screen-in", anim)
    ve_vis = mpage.eval_on_selector(
        ".dual-col--ve", "el => getComputedStyle(el).display"
    )
    cn_after = mpage.eval_on_selector(
        ".dual-col--cn", "el => getComputedStyle(el).display"
    )
    check("手机：西盘显示、中盘隐藏", ve_vis == "block" and cn_after == "none", f"ve={ve_vis} cn={cn_after}")
    no_hscroll = mpage.evaluate("document.scrollingElement.scrollWidth <= window.innerWidth + 1")
    check("手机：无横向滚动", no_hscroll)
    mpage.screenshot(path=str(QA / "dual-mobile-ve.png"), full_page=True)

    mpage.click('.dual-seg button:has-text("中")')
    mpage.wait_for_timeout(400)
    back = mpage.eval_on_selector(
        ".dual-col--cn", "el => getComputedStyle(el).display"
    )
    check("手机：切回中式顺滑", back == "block", back)

    check("手机：控制台无错误", not errs_m, "; ".join(errs_m[:3]))
    mctx.close()

    # ── 手机：夏令时生日 1989-06-15 12:00 ──
    dctx = browser.new_context(viewport={"width": 390, "height": 844})
    dpage = dctx.new_page()
    errs_d = collect_console(dpage)
    fill_form(dpage, "上海", "黄浦区", "1989-06-15", "12:00")
    dpage.wait_for_selector(".dual-seg-row", timeout=10000)
    dpage.click('.dual-seg button:has-text("西")')
    dpage.wait_for_selector(".vcell--lagna", timeout=45000)
    dpage.wait_for_selector(".dual-col--ve.dual-col--active", timeout=5000)
    ok_d, nums_d = houses_unique(dpage)
    check("夏令时盘：十二宫序号齐全", ok_d, nums_d)
    check("夏令时盘：月亮锚存在", dpage.eval_on_selector_all(".vcell-moondot", "els => els.length") == 1)
    dpage.screenshot(path=str(QA / "dual-mobile-dst-ve.png"), full_page=True)
    check("夏令时盘：控制台无错误", not errs_d, "; ".join(errs_d[:3]))
    dctx.close()

    browser.close()

print()
if failures:
    print(f"共 {len(failures)} 项未过: {failures}")
    sys.exit(1)
print("全部通过")
