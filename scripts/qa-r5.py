# R5 验收：五宽度 × 日夜 × 先生计时/停止/断网兜底（对本地 mock）
import json
import sys

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://127.0.0.1:5173/"
SHOT = "C:/Users/Lenovo/AppData/Local/Temp/xjg-r5"

results = []


def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS " if cond else "FAIL ") + name + (f" | {extra}" if extra and not cond else ""))


def overflow(page):
    return page.evaluate("document.documentElement.scrollWidth - window.innerWidth")


def fill(page):
    page.select_option("#province", "上海")
    page.select_option("#city", "黄浦区")
    page.fill("#dob", "1990-05-17")
    page.fill("#birth-time", "14:30")
    page.click("#gender-male")
    page.click(".ledger--grouped .submit")
    page.wait_for_selector(".bazi")


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 320, "height": 800})
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    fill(page)

    for width in (320, 360, 390, 768, 1440):
        page.set_viewport_size({"width": width, "height": 900})
        page.wait_for_timeout(250)
        page.click("text=报上生辰")
        page.wait_for_selector(".ledger--grouped")
        check(f"{width} 报生辰无横滚", overflow(page) == 0, str(overflow(page)))
        page.click("text=中式盘")
        page.wait_for_selector(".bazi")
        check(f"{width} 中式盘无横滚", overflow(page) == 0, str(overflow(page)))
        page.click("text=西式盘")
        page.wait_for_selector(".vedic-grid:not(.vedic-grid--skel)", timeout=30000)
        check(f"{width} 西式盘无横滚", overflow(page) == 0, str(overflow(page)))
        page.click("text=玄机先生")
        page.wait_for_selector(".master-slip")
        check(f"{width} 先生页无横滚", overflow(page) == 0, str(overflow(page)))

    # ── 390 细节：农历闰月、关系人弹窗 Esc、术语点击 ──
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(250)
    page.click("text=报上生辰")
    page.wait_for_selector("#calendar-lunar")
    page.click("#calendar-lunar")
    page.select_option("#lunar-year", "2020")
    months = page.locator("#lunar-month option").all_inner_texts()
    check("农历有闰月项", any("闰" in m for m in months), str(months))
    page.select_option("#lunar-day", "3")
    page.click("#calendar-solar")
    check("回公历保留生日", page.locator("#dob").input_value() != "")

    page.click(".partner-trigger")
    page.wait_for_selector("dialog[open]")
    page.keyboard.press("Escape")
    page.wait_for_function("!document.querySelector('dialog').open")
    focused = page.evaluate("document.activeElement?.className || ''")
    check("弹窗 Esc 关闭并回焦", "partner-trigger" in focused, focused)

    page.click("text=中式盘")
    page.wait_for_selector(".bazi")
    page.locator(".term--label").first.click()
    page.wait_for_selector(".term-sheet")
    term_text = page.locator(".term-sheet-text").inner_text()
    check("术语释义可读", len(term_text) > 8, term_text)
    page.keyboard.press("Escape")

    # ── 1440 日夜截图 ─────────────────────────
    page.set_viewport_size({"width": 1440, "height": 900})
    page.wait_for_timeout(450)
    page.screenshot(path=f"{SHOT}-master-1440-day.png")
    page.click("text=报上生辰")
    page.wait_for_selector(".ledger--grouped")
    page.wait_for_timeout(450)
    page.screenshot(path=f"{SHOT}-form-1440-day.png")
    page.click("text=中式盘")
    page.wait_for_selector(".bazi")
    page.wait_for_timeout(450)
    page.screenshot(path=f"{SHOT}-cn-1440-day.png")
    page.click("text=西式盘")
    page.wait_for_selector(".vedic-grid:not(.vedic-grid--skel)", timeout=30000)
    page.wait_for_timeout(450)
    page.screenshot(path=f"{SHOT}-ve-1440-day.png")
    page.click(".theme-toggle")
    page.wait_for_timeout(400)
    page.click("text=报上生辰")
    page.wait_for_selector(".ledger--grouped")
    page.wait_for_timeout(450)
    page.screenshot(path=f"{SHOT}-form-1440-night.png")
    page.click("text=中式盘")
    page.wait_for_selector(".bazi")
    page.wait_for_timeout(450)
    page.screenshot(path=f"{SHOT}-cn-1440-night.png")
    page.click("text=西式盘")
    page.wait_for_selector(".vedic-grid:not(.vedic-grid--skel)", timeout=30000)
    page.wait_for_timeout(450)
    page.screenshot(path=f"{SHOT}-ve-1440-night.png")
    page.click(".theme-toggle")
    page.wait_for_timeout(300)

    # ── 计时：?diag=1 下开一卷 ────────────────
    page.goto(BASE + "?diag=1")
    page.wait_for_load_state("networkidle")
    page.click("text=玄机先生")
    page.wait_for_selector(".master-slip:not([disabled])", timeout=30000)
    page.get_by_role("button", name="事业工作").click()
    page.wait_for_selector(".master-timing", timeout=40000)
    line = page.locator(".master-timing").inner_text()
    print("timing:", line)
    check("计时行三段齐全", all(k in line for k in ("起卷", "首字", "总")), line)
    records = page.evaluate("JSON.parse(sessionStorage.getItem('xuanjige.master.timing.v1') || '[]')")
    check("计时落库一条", len(records) == 1, json.dumps(records, ensure_ascii=False))
    if records:
        rec = records[0]
        check(
            "计时字段成序",
            isinstance(rec.get("postMs"), int)
            and isinstance(rec.get("firstMs"), int)
            and isinstance(rec.get("totalMs"), int)
            and rec["totalMs"] >= rec["firstMs"] >= rec["postMs"] >= 0,
            json.dumps(rec, ensure_ascii=False),
        )
        check("计时首字晚于首发", rec["firstMs"] >= rec["postMs"], json.dumps(rec, ensure_ascii=False))
    page.screenshot(path=f"{SHOT}-timing-1440.png")

    # 无 ?diag 时不显示计时
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    page.click("text=玄机先生")
    page.wait_for_selector(".master-slip:not([disabled])", timeout=30000)
    page.get_by_role("button", name="事业工作").click()
    page.wait_for_selector(".master-text", timeout=20000)
    page.wait_for_timeout(4000)
    check("默认不露计时", page.locator(".master-timing").count() == 0)

    # ── 停止：半截话 ─────────────────────────
    page.locator(".master-reopen").click()
    page.get_by_role("button", name="双盘合参", exact=True).click()
    page.locator(".master-merge").click()
    page.wait_for_timeout(250)
    page.locator(".master-stop").click()
    page.wait_for_selector(".master-note-line", timeout=10000)
    stop_note = page.locator(".master-note-line").inner_text()
    check("停止有说明", ("半截" in stop_note or "没开口" in stop_note), stop_note)
    page.screenshot(path=f"{SHOT}-stopped-1440.png")

    # ── 断网兜底：拦住 interpret ──────────────
    page.route("**/api/interpret", lambda route: route.abort())
    page.locator(".master-reopen").click()
    page.get_by_role("button", name="单盘", exact=True).click()
    page.get_by_role("button", name="家运亲情").click()
    page.wait_for_selector(".master-note-line", timeout=20000)
    fb = page.locator(".master-note-line").inner_text()
    check("断网中文兜底", ("不通" in fb or "稍候" in fb or "送达" in fb), fb)
    page.unroute("**/api/interpret")
    page.screenshot(path=f"{SHOT}-offline-1440.png")

    final = page.evaluate("JSON.parse(sessionStorage.getItem('xuanjige.master.timing.v1') || '[]')")
    print("records:", [(r["mode"], r["ok"], r["totalMs"]) for r in final])
    check("多卷累积且含未成卷记录", len(final) >= 4 and any(not r["ok"] for r in final), json.dumps(final, ensure_ascii=False))

    unexpected = [e for e in errors if "ERR_FAILED" not in e]
    check("控制台无报错（断网用例的 ERR_FAILED 除外）", not unexpected, "; ".join(unexpected[:3]))
    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
if failed:
    for name, _, extra in failed:
        print(f"  FAILED: {name} {extra}")
    sys.exit(1)
