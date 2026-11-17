# R6 验收：页头纹样已去、时辰不详整盘暂排（对本地 mock）
import json
import sys

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://127.0.0.1:5173/"
SHOT = "C:/Users/Lenovo/AppData/Local/Temp/xjg-r6"

results = []


def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS " if cond else "FAIL ") + name + (f" | {extra}" if extra and not cond else ""))


def overflow(page):
    return page.evaluate("document.documentElement.scrollWidth - window.innerWidth")


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    sent = {}

    def grab(request):
        if "/api/interpret" in request.url and request.method == "POST":
            try:
                sent.update(json.loads(request.post_data or "{}"))
            except ValueError:
                pass

    page.on("request", grab)

    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    check("页头纹样已删", page.locator(".ornament").count() == 0)

    # ── 缺时辰排盘 ─────────────────────────
    page.select_option("#province", "上海")
    page.select_option("#city", "黄浦区")
    page.fill("#dob", "1990-05-17")
    page.locator(".unknown input").check()
    page.wait_for_selector(".time-note")
    note = page.locator(".time-note").inner_text()
    check("表单提示正午暂排", "正午" in note, note)
    page.click("#gender-male")
    page.click(".ledger--grouped .submit")
    page.wait_for_selector(".bazi")

    page.click("text=中式盘")
    page.wait_for_selector(".bazi")
    pillars = page.locator(".bazi .pillar, .pillar").count()
    caveat = page.locator(".chart-caveat")
    check("中式盘四柱齐全", pillars >= 4, str(pillars))
    check("中式盘有暂排说明", caveat.count() == 1 and "正午" in caveat.inner_text())
    check("中式盘无横滚", overflow(page) == 0, str(overflow(page)))
    page.screenshot(path=f"{SHOT}-cn-390.png", full_page=True)

    page.click("text=西式盘")
    page.wait_for_selector(".vedic-grid:not(.vedic-grid--skel)", timeout=30000)
    check("西式盘已出盘", page.locator(".vedic-grid").count() == 1)
    caveat = page.locator(".chart-caveat")
    check("西式盘有暂排说明", caveat.count() == 1 and "正午" in caveat.inner_text())
    check("西式盘无横滚", overflow(page) == 0, str(overflow(page)))
    page.screenshot(path=f"{SHOT}-ve-390.png", full_page=True)

    page.click("text=玄机先生")
    page.wait_for_selector(".master-slip:not([disabled])", timeout=30000)
    check("先生不再挡卷", page.locator("text=尚未报上生辰").count() == 0)
    mcaveat = page.locator(".chart-caveat")
    check("先生页有暂排说明", mcaveat.count() == 1 and "正午" in mcaveat.inner_text())

    page.get_by_role("button", name="事业工作").click()
    page.wait_for_selector(".master-text", timeout=30000)
    check("先生单盘可开卷", True)
    check("载荷带 time_estimated", sent.get("chart", {}).get("time_estimated") is True, json.dumps(sent, ensure_ascii=False)[:300])
    page.screenshot(path=f"{SHOT}-master-390.png", full_page=True)

    # ── 补录时辰入口 ─────────────────────────
    page.locator(".chart-caveat .link").click()
    page.wait_for_selector("#birth-time")
    check("补录时辰回到表单", page.locator("#birth-time").count() == 1 and page.locator(".ledger--grouped").count() == 1)

    unexpected = [e for e in errors if "ERR_FAILED" not in e]
    check("控制台无报错", not unexpected, "; ".join(unexpected[:3]))
    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
if failed:
    for name, _, extra in failed:
        print(f"  FAILED: {name} {extra}")
    sys.exit(1)