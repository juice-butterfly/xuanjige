import sys
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://127.0.0.1:5173/"
SHOT = "C:/Users/Lenovo/AppData/Local/Temp/xjg-r4"


def overflow(page):
    return page.evaluate("document.documentElement.scrollWidth - window.innerWidth")


def vis(page, sel):
    return page.evaluate(
        "(s) => { const n = document.querySelector(s); if (!n) return 'missing';"
        " const r = n.getBoundingClientRect(); const cs = getComputedStyle(n);"
        " return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 ? 'shown' : 'hidden' }",
        sel,
    )


def fill(page, dob, time):
    page.select_option("#province", "上海")
    page.select_option("#city", "黄浦区")
    page.fill("#dob", dob)
    page.fill("#birth-time", time)
    page.click("#gender-male")


def open_cn(page):
    page.click(".ledger--grouped .submit")
    page.wait_for_selector(".bazi")
    page.wait_for_timeout(200)


def open_ve(page):
    page.click(".chart-cross")
    page.wait_for_selector(".vedic-grid:not(.vedic-grid--skel)", timeout=30000)
    page.wait_for_timeout(200)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 320, "height": 800})
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    print("320 form overflow:", overflow(page), "| aside:", vis(page, ".form-aside"), "| ornament:", vis(page, ".ornament--form"))

    fill(page, "1990-05-17", "14:30")
    open_cn(page)
    print("320 cn overflow:", overflow(page), "| bazi-side:", vis(page, ".bazi-side"), "| pillar-misc:", page.locator(".pillar-misc").count())
    page.screenshot(path=f"{SHOT}-cn-320.png", full_page=True)
    open_ve(page)
    print("320 ve overflow:", overflow(page), "| vedic-side:", vis(page, ".vedic-side"), "| roman:", page.locator(".vcell-roman").count())
    page.screenshot(path=f"{SHOT}-ve-320.png", full_page=True)

    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(300)
    print("390 ve overflow:", overflow(page))
    page.screenshot(path=f"{SHOT}-ve-390.png", full_page=True)

    page.set_viewport_size({"width": 768, "height": 900})
    page.wait_for_timeout(300)
    print("768 ve overflow:", overflow(page), "| vedic-side:", vis(page, ".vedic-side"))
    page.click("text=中式盘")
    page.wait_for_selector(".bazi")
    print("768 cn overflow:", overflow(page), "| bazi-side:", vis(page, ".bazi-side"))
    page.screenshot(path=f"{SHOT}-cn-768.png", full_page=True)

    page.set_viewport_size({"width": 1120, "height": 900})
    page.wait_for_timeout(400)
    print("1120 cn overflow:", overflow(page), "| bazi-side:", vis(page, ".bazi-side"), "| bazi-details:", vis(page, ".bazi-details"))
    print("1120 side sections:", page.locator(".bazi-side .side-section").count(), "| steps:", page.locator(".side-steps li").count())
    page.screenshot(path=f"{SHOT}-cn-1120.png")
    open_ve(page)
    print("1120 ve overflow:", overflow(page), "| vedic-side:", vis(page, ".vedic-side"), "| ring:", vis(page, ".vedic-ring"))
    print("1120 roster rows:", page.locator(".vrow").count(), "| meta rows:", page.locator(".vmeta-row").count())
    print("1120 yogas:", page.locator(".vedic-meta .term").all_inner_texts())
    page.screenshot(path=f"{SHOT}-ve-1120.png")

    page.set_viewport_size({"width": 1440, "height": 900})
    page.wait_for_timeout(400)
    print("1440 ve overflow:", overflow(page))
    page.screenshot(path=f"{SHOT}-ve-1440-day.png")
    page.click(".theme-toggle")
    page.wait_for_timeout(500)
    print("night theme:", page.evaluate("document.documentElement.dataset.theme"))
    page.screenshot(path=f"{SHOT}-ve-1440-night.png")
    page.click("text=中式盘")
    page.wait_for_selector(".bazi")
    page.wait_for_timeout(300)
    print("1440 cn night overflow:", overflow(page))
    page.screenshot(path=f"{SHOT}-cn-1440-night.png")
    page.click("text=报上生辰")
    page.wait_for_timeout(300)
    print("1440 form night overflow:", overflow(page), "| aside:", vis(page, ".form-aside"))
    page.screenshot(path=f"{SHOT}-form-1440-night.png")
    page.click(".theme-toggle")
    page.wait_for_timeout(400)
    page.screenshot(path=f"{SHOT}-form-1440-day.png")

    print("console errors:", errors)
    browser.close()
