import json
import sys
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://127.0.0.1:5173/"
SHOT = "C:/Users/Lenovo/AppData/Local/Temp/xjg-r3"


def overflow(page):
    return page.evaluate("document.documentElement.scrollWidth - window.innerWidth")


def wait_answer(page, needle, timeout=40000):
    page.wait_for_function(
        """([needle]) => {
            const body = document.querySelector('.master-answer')
            return body && body.innerText.includes(needle) && !document.querySelector('.master-stop')
        }""",
        arg=[needle],
        timeout=timeout,
    )


def goto_master(page):
    page.click("text=玄机先生")
    page.wait_for_selector(".master-live")


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()
    errors = []
    requests = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    def grab(req):
        if "/api/interpret" in req.url and req.method == "POST":
            try:
                requests.append(req.post_data_json)
            except Exception:
                requests.append(None)

    page.on("request", grab)

    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    page.select_option("#province", "上海")
    page.select_option("#city", "黄浦区")
    page.fill("#dob", "1990-05-17")
    page.fill("#birth-time", "14:30")
    page.click("#gender-male")
    page.click(".ledger--grouped .submit")
    page.wait_for_selector(".bazi")
    goto_master(page)

    page.wait_for_selector(".master-slip:not([disabled])")
    print("modes:", page.locator(".master-mode").all_inner_texts())

    page.click(".master-slip:has-text('事业工作')")
    wait_answer(page, "依据：")
    print("single answer head:", page.locator(".master-answer-mode").inner_text())
    page.click(".master-reopen")
    page.wait_for_selector(".master-mode")

    page.click(".master-mode:has-text('双盘合参')")
    print("merge note:", page.locator(".master-mode-note").inner_text())
    print("merge cta:", page.locator(".master-merge").inner_text())

    page.click(".master-mode:has-text('关系人合参')")
    print("relation empty:", page.locator(".master-partner-empty").inner_text().replace("\n", " / "))

    page.click(".master-partner-empty .link")
    page.wait_for_selector("dialog[open]")
    page.click(".partner-dialog-foot .submit")
    page.fill("#partner-alias", "阿青")
    page.click("#partner-relation-crush")
    page.select_option("#partner-province", "上海")
    page.select_option("#partner-city", "黄浦区")
    page.fill("#partner-dob", "1994-03-08")
    page.fill("#partner-time", "09:20")
    page.click("#partner-gender-female")
    page.click(".partner-dialog-submit .submit:not(.submit--quiet)")
    page.wait_for_function("!document.querySelector('dialog').open")
    wait_answer(page, "相处建议")

    print("record sub:", page.locator(".record-line--sub").inner_text())
    print("answer mode:", page.locator(".master-answer-mode").inner_text())
    payload = requests[-1] if requests else None
    if payload:
        print("payload mode:", payload.get("mode"))
        print("payload relation:", payload.get("relation"))
        print("payload partner alias?", "partner" in payload)
        partner = payload.get("partner") or {}
        print("partner gender:", partner.get("gender"))
        print("partner pillars:", [x.get("ganzhi") for x in (partner.get("bazi") or {}).get("pillars", [])])
        print("payload visitor uuid:", len(str(payload.get("visitor", ""))))
    else:
        print("payload: NONE")

    page.click(".master-reopen")
    page.wait_for_selector(".peek-summary")
    page.click(".peek-summary")
    print("peek rows:", page.locator(".peek-row").all_inner_texts())
    print("overflow relation 390:", overflow(page))
    page.screenshot(path=f"{SHOT}-relation-390.png", full_page=True)

    page.select_option(".master-partner-select", "")
    page.wait_for_function("!document.querySelector('.master-answer')")
    print("cleared after unselect:", page.locator(".master-answer").count())

    # 旧数据：无关系 / 无时辰
    page.evaluate(
        """() => {
            const key = 'xuanjige.partners.v1'
            const list = JSON.parse(localStorage.getItem(key) || '[]')
            list.push({
                id: 'p-legacy-a', alias: '老周', relation: null,
                province: '北京', city: '东城区', lat: 39.9289, lon: 116.416,
                dob: '1985-06-12', time: '08:00', gender: 'male', calendar: 'solar'
            })
            list.push({
                id: 'p-legacy-b', alias: '小林', relation: 'friend',
                province: '北京', city: '东城区', lat: 39.9289, lon: 116.416,
                dob: '1992-11-03', time: null, gender: 'female', calendar: 'solar'
            })
            localStorage.setItem(key, JSON.stringify(list))
        }"""
    )
    page.reload()
    page.wait_for_load_state("networkidle")
    goto_master(page)
    page.click(".master-mode:has-text('关系人合参')")

    page.select_option(".master-partner-select", "p-legacy-a")
    print("legacy no-relation block:", page.locator(".master-partner-block").inner_text().replace("\n", " / "))

    page.select_option(".master-partner-select", "p-legacy-b")
    print("legacy no-time block:", page.locator(".master-partner-block").inner_text().replace("\n", " / "))
    print("no-time cta count:", page.locator(".master-mode-panel .master-merge").count())

    page.select_option(".master-partner-select", label="阿青（有好感的人）")
    page.wait_for_selector(".master-mode-panel .master-merge:not([disabled])")
    print("ready cta:", page.locator(".master-mode-panel .master-merge").inner_text())
    print("overflow legacy 390:", overflow(page))

    page.set_viewport_size({"width": 320, "height": 760})
    page.wait_for_timeout(250)
    print("overflow relation 320:", overflow(page))
    page.screenshot(path=f"{SHOT}-relation-320.png", full_page=True)

    page.set_viewport_size({"width": 1120, "height": 900})
    page.wait_for_timeout(250)
    page.click(".peek-summary")
    print("overflow relation 1120:", overflow(page))
    page.screenshot(path=f"{SHOT}-relation-1120.png", full_page=True)

    print("interpret requests:", len(requests))
    print("console errors:", errors)
    browser.close()
