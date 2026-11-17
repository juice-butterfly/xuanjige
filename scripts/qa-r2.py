import sys
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://127.0.0.1:5173/"
SHOT = "C:/Users/Lenovo/AppData/Local/Temp/xjg-r2"


def overflow(page):
    return page.evaluate("document.documentElement.scrollWidth - window.innerWidth")


def fill_main(page):
    page.select_option("#province", "上海")
    page.select_option("#city", "黄浦区")
    page.fill("#dob", "1990-05-17")
    page.fill("#birth-time", "14:30")
    page.click("#gender-male")


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 320, "height": 800})
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    print("tabs:", page.locator(".tab").all_inner_texts())
    print("form overflow 320:", overflow(page))

    page.click(".partner-trigger")
    page.wait_for_selector("dialog[open]")
    print("dialog title:", page.locator(".partner-dialog-title").inner_text())
    print("dialog overflow 320:", overflow(page))
    page.screenshot(path=f"{SHOT}-dialog-empty-320.png")
    page.click(".partner-dialog-foot .submit")
    page.fill("#partner-alias", "阿青")
    page.click("#partner-relation-crush")
    page.select_option("#partner-province", "上海")
    page.select_option("#partner-city", "黄浦区")
    page.fill("#partner-dob", "1994-03-08")
    page.fill("#partner-time", "09:20")
    page.click("#partner-gender-female")
    page.click(".partner-dialog-submit .submit--quiet")
    page.wait_for_selector(".partner-dialog-card")
    print("count after save:", page.locator(".partner-trigger-count").inner_text())
    print("card:", page.locator(".partner-dialog-card").inner_text().replace("\n", " / "))
    page.click(".partner-dialog-card")
    print("card pressed:", page.locator(".partner-dialog-card").get_attribute("aria-pressed"))
    print("form overflow after save 320:", overflow(page))
    page.screenshot(path=f"{SHOT}-dialog-list-320.png")
    page.click(".partner-dialog-close")
    page.wait_for_function("!document.querySelector('dialog').open")

    page.reload()
    page.wait_for_load_state("networkidle")
    print("persisted count:", page.locator(".partner-trigger-count").inner_text())

    page.click(".partner-trigger")
    page.wait_for_selector(".partner-dialog-card")
    page.click(".partner-dialog-remove")
    print("confirm label:", page.locator(".partner-dialog-remove").inner_text())
    page.click(".partner-dialog-remove")
    page.wait_for_selector(".partner-dialog-empty")
    print("count node after delete:", page.locator(".partner-trigger-count").count())
    page.click(".partner-dialog-close")
    page.wait_for_function("!document.querySelector('dialog').open")

    fill_main(page)
    page.click(".ledger--grouped .submit")
    page.wait_for_selector(".bazi")
    print("after submit tab:", page.locator('.tab[aria-current="page"]').inner_text())
    print("cn overflow 320:", overflow(page))
    page.screenshot(path=f"{SHOT}-cn-320.png", full_page=True)
    page.click(".chart-cross")
    page.wait_for_selector(".vedic-grid:not(.vedic-grid--skel)", timeout=30000)
    print("ve tab:", page.locator('.tab[aria-current="page"]').inner_text())
    print("ve overflow 320:", overflow(page))
    page.screenshot(path=f"{SHOT}-ve-320.png", full_page=True)

    page.set_viewport_size({"width": 390, "height": 844})
    page.reload()
    page.wait_for_load_state("networkidle")
    print("reload starts on form:", page.locator('.tab[aria-current="page"]').inner_text())
    page.click(".partner-trigger")
    page.wait_for_selector("dialog[open]")
    print("dialog overflow 390:", overflow(page))
    page.screenshot(path=f"{SHOT}-dialog-empty-390.png")
    page.click(".partner-dialog-close")

    page.select_option("#province", "北京")
    page.select_option("#city", "东城区")
    page.fill("#dob", "1965-02-06")
    page.fill("#birth-time", "15:00")
    page.click("#gender-female")
    page.click(".ledger--grouped .submit")
    page.wait_for_selector(".bazi")
    print("390 cn overflow:", overflow(page))
    page.click(".chart-cross")
    page.wait_for_selector(".vedic-grid:not(.vedic-grid--skel)", timeout=30000)
    print("390 ve overflow:", overflow(page))
    page.screenshot(path=f"{SHOT}-ve-390.png", full_page=True)

    page.set_viewport_size({"width": 1120, "height": 900})
    page.wait_for_timeout(300)
    print("1120 ve overflow:", overflow(page))
    page.screenshot(path=f"{SHOT}-ve-1120.png", full_page=False)
    page.click("text=中式盘")
    page.wait_for_selector(".bazi")
    print("1120 cn overflow:", overflow(page))
    page.screenshot(path=f"{SHOT}-cn-1120.png", full_page=False)

    print("console errors:", errors)
    browser.close()
