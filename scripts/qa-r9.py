# R9 验收：页签墨线、存下落印、关系人小传
import sys

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://127.0.0.1:5173/"
SHOT = "C:/Users/Lenovo/AppData/Local/Temp/xjg-r9"

results = []


def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS " if cond else "FAIL ") + name + (f" | {extra}" if extra and not cond else ""))


def ink_box(page):
    return page.evaluate(
        """() => {
            const ink = document.querySelector('.tab-ink')
            if (!ink) return null
            const r = ink.getBoundingClientRect()
            return { left: r.left, width: r.width }
        }"""
    )


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    page.goto(BASE)
    page.wait_for_load_state("networkidle")

    # 先报生辰，提交后自动到中式盘
    page.select_option("#province", "上海")
    page.select_option("#city", "黄浦区")
    page.fill("#dob", "1990-05-17")
    page.locator(".unknown input").check()
    page.click("#gender-male")
    page.click(".ledger--grouped .submit")
    page.wait_for_selector(".bazi")
    page.wait_for_timeout(350)

    # A. 墨线页签
    page.wait_for_function("document.querySelector('.tabs')?.dataset.ink === 'on'")
    ink = ink_box(page)
    active = page.locator('.tab[aria-current="page"]').bounding_box()
    check("墨线已渲染", ink is not None, str(ink))
    check(
        "墨线对齐当前页签",
        ink and active and abs(ink["left"] - active["x"]) <= 2 and abs(ink["width"] - active["width"]) <= 2,
        f"ink={ink} tab={active}",
    )
    dur = page.evaluate("getComputedStyle(document.querySelector('.tab-ink')).transitionDuration")
    check("墨线过渡 240ms", "0.24s" in dur, dur)

    page.click(".tab:has-text('西式盘')")
    page.wait_for_selector(".chart-page--ve")
    page.wait_for_timeout(350)
    ink2 = ink_box(page)
    active2 = page.locator('.tab[aria-current="page"]').bounding_box()
    check(
        "切换后墨线跟随",
        ink2 and active2 and abs(ink2["left"] - active2["x"]) <= 2 and abs(ink2["width"] - active2["width"]) <= 2,
        f"ink={ink2} tab={active2}",
    )
    old_after = page.evaluate(
        """() => getComputedStyle(document.querySelector('.tab[aria-current="page"]'), '::after').content"""
    )
    check("旧下划线已移除", old_after in ("none", "normal"), old_after)

    page.click("text=玄机先生")
    page.get_by_role("button", name="关系人合参").click()
    page.get_by_role("button", name="管理关系人").click()
    page.wait_for_selector("dialog[open]")

    page.locator("dialog").get_by_role("button", name="添一位", exact=True).first.click()
    page.fill("#partner-alias", "阿岚")
    page.click("#partner-relation-boss")
    page.select_option("#partner-province", "上海")
    page.select_option("#partner-city", "黄浦区")
    page.fill("#partner-dob", "1992-03-08")
    page.locator("dialog .unknown input").check()
    page.click("#partner-gender-female")
    page.get_by_role("button", name="只存下", exact=True).click()

    # B. 落印
    page.wait_for_selector(".partner-saved-seal")
    seal = page.locator(".partner-saved-seal")
    check("落印出现", seal.count() == 1 and seal.inner_text() == "已录", seal.inner_text() if seal.count() else "")
    page.wait_for_timeout(320)
    check("落印可见", seal.count() == 1 and float(seal.evaluate("n => getComputedStyle(n).opacity")) > 0.5)
    page.screenshot(path=f"{SHOT}-seal.png")
    page.wait_for_timeout(1100)
    check("落印自行退场", seal.count() == 0)

    page.keyboard.press("Escape")
    page.wait_for_function("!document.querySelector('dialog').open")
    page.wait_for_selector(".master-partner-select")
    target = page.evaluate(
        """() => {
            const opt = Array.from(document.querySelectorAll('.master-partner-select option'))
                .find(o => o.textContent.includes('阿岚'))
            return opt ? opt.value : ''
        }"""
    )
    page.select_option(".master-partner-select", target)
    page.wait_for_selector(".master-partner-bio")

    # C. 关系人小传
    kicker = page.locator(".master-partner-bio-k").inner_text()
    name = page.locator(".master-partner-bio-name").inner_text()
    meta = page.locator(".master-partner-bio-meta").inner_text()
    check("小传关系题签", kicker == "上下属", kicker)
    check("小传名字大字", name == "阿岚", name)
    check("小传细目完整", "一九九二年" in meta and "上海" in meta and "黄浦区" in meta and "时辰不详" in meta, meta)

    overflow_390 = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    check("390 无横滚", overflow_390 == 0, str(overflow_390))
    page.screenshot(path=f"{SHOT}-bio-390.png", full_page=True)

    page.set_viewport_size({"width": 320, "height": 760})
    page.wait_for_timeout(260)
    overflow_320 = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    check("320 无横滚", overflow_320 == 0, str(overflow_320))
    page.screenshot(path=f"{SHOT}-bio-320.png", full_page=True)

    page.set_viewport_size({"width": 1120, "height": 900})
    page.wait_for_timeout(260)
    ink3 = ink_box(page)
    active3 = page.locator('.tab[aria-current="page"]').bounding_box()
    check(
        "1120 墨线仍对齐",
        ink3 and active3 and abs(ink3["left"] - active3["x"]) <= 2 and abs(ink3["width"] - active3["width"]) <= 2,
        f"ink={ink3} tab={active3}",
    )
    page.screenshot(path=f"{SHOT}-bio-1120.png", full_page=True)
    page.click(".theme-toggle")
    page.wait_for_timeout(220)
    page.screenshot(path=f"{SHOT}-bio-1120-night.png", full_page=True)

    unexpected = [e for e in errors if "ERR_FAILED" not in e]
    check("控制台无报错", not unexpected, "; ".join(unexpected[:3]))
    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
if failed:
    for name, _, extra in failed:
        print(f"  FAILED: {name} {extra}")
    sys.exit(1)
