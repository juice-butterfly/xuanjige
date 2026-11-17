# R8 验收：关系类型改版（暧昧对象 / 师生 / 上下属）及合参载荷
import json
import sys

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://127.0.0.1:5173/"
SHOT = "C:/Users/Lenovo/AppData/Local/Temp/xjg-r8"

results = []


def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS " if cond else "FAIL ") + name + (f" | {extra}" if extra and not cond else ""))


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

    page.select_option("#province", "上海")
    page.select_option("#city", "黄浦区")
    page.fill("#dob", "1990-05-17")
    page.locator(".unknown input").check()
    page.click("#gender-male")
    page.click(".ledger--grouped .submit")
    page.wait_for_selector(".bazi")

    page.click("text=玄机先生")
    page.get_by_role("button", name="关系人合参").click()
    page.get_by_role("button", name="管理关系人").click()
    page.wait_for_selector("dialog[open]")

    def add_partner(alias, relation_id):
        page.locator("dialog").get_by_role("button", name="添一位", exact=True).first.click()
        page.fill("#partner-alias", alias)
        page.click(f"#partner-relation-{relation_id}")
        page.select_option("#partner-province", "上海")
        page.select_option("#partner-city", "黄浦区")
        page.fill("#partner-dob", "1992-03-08")
        page.locator("dialog .unknown input").check()
        page.click("#partner-gender-female")
        page.get_by_role("button", name="只存下", exact=True).click()

    page.locator("dialog").get_by_role("button", name="添一位", exact=True).first.click()
    labels = page.locator(".relation-picker button").all_inner_texts()
    check(
        "关系类型共七种且更名",
        labels == ["朋友", "情侣", "暧昧对象", "亲人", "师生", "同学", "上下属"],
        str(labels),
    )
    check("旧称已不在表单", page.locator("text=有好感的人").count() == 0 and page.locator("text=陌生人").count() == 0)

    page.fill("#partner-alias", "阿岚")
    page.click("#partner-relation-boss")
    page.select_option("#partner-province", "上海")
    page.select_option("#partner-city", "黄浦区")
    page.fill("#partner-dob", "1992-03-08")
    page.locator("dialog .unknown input").check()
    page.click("#partner-gender-female")
    page.get_by_role("button", name="只存下", exact=True).click()

    add_partner("小满", "crush")
    page.keyboard.press("Escape")
    page.wait_for_function("!document.querySelector('dialog').open")

    page.wait_for_selector(".master-partner-select")
    options = page.evaluate(
        "Array.from(document.querySelectorAll('.master-partner-select option')).map(o => ({v:o.value,t:o.textContent}))"
    )
    texts = [o["t"] for o in options]
    check("上下属标签入名单", any("阿岚（上下属）" in (t or "") for t in texts), str(texts))
    check("暧昧对象标签入名单", any("小满（暧昧对象）" in (t or "") for t in texts), str(texts))
    check("名单无旧称", not any("有好感的人" in (t or "") or "陌生人" in (t or "") for t in texts))

    target = next(o for o in options if "阿岚" in (o["t"] or ""))
    page.select_option(".master-partner-select", target["v"])
    page.wait_for_selector(".master-partner-card")
    page.get_by_role("button", name="与 阿岚 合参").click()
    page.wait_for_selector(".master-text", timeout=40000)
    check("上下属可以合参", True)
    check("上下属载荷 id", sent.get("relation") == "boss", str(sent.get("relation")))

    overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    check("390 无横滚", overflow == 0, str(overflow))
    page.screenshot(path=f"{SHOT}-relations-390.png", full_page=True)

    unexpected = [e for e in errors if "ERR_FAILED" not in e]
    check("控制台无报错", not unexpected, "; ".join(unexpected[:3]))
    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
if failed:
    for name, _, extra in failed:
        print(f"  FAILED: {name} {extra}")
    sys.exit(1)