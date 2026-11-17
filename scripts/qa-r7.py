# R7 验收：关系人时辰不详也可合参（对本地 mock）
import json
import sys

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://127.0.0.1:5173/"
SHOT = "C:/Users/Lenovo/AppData/Local/Temp/xjg-r7"

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

    # 本人：时辰不详
    page.select_option("#province", "上海")
    page.select_option("#city", "黄浦区")
    page.fill("#dob", "1990-05-17")
    page.locator(".unknown input").check()
    page.click("#gender-male")
    page.click(".ledger--grouped .submit")
    page.wait_for_selector(".bazi")

    # 先生 → 关系人合参 → 添一位无时辰的关系人
    page.click("text=玄机先生")
    page.get_by_role("button", name="关系人合参").click()
    page.get_by_role("button", name="管理关系人").click()
    page.wait_for_selector("dialog[open]")
    page.locator("dialog").get_by_role("button", name="添一位", exact=True).first.click()
    page.fill("#partner-alias", "欣")
    page.click("#partner-relation-crush")
    page.select_option("#partner-province", "上海")
    page.select_option("#partner-city", "黄浦区")
    page.fill("#partner-dob", "1992-03-08")
    page.locator("dialog .unknown input").check()
    page.click("#partner-gender-female")
    page.get_by_role("button", name="只存下", exact=True).click()
    page.keyboard.press("Escape")
    page.wait_for_function("!document.querySelector('dialog').open")

    # 选中无时辰的关系人：先看提示与速览，再手动开卷
    page.wait_for_selector(".master-partner-select")
    options = page.evaluate(
        "Array.from(document.querySelectorAll('.master-partner-select option')).map(o => ({v:o.value,t:o.textContent}))"
    )
    target = next((o for o in options if "欣" in (o["t"] or "")), None)
    check("关系人已入名单", target is not None, json.dumps(options, ensure_ascii=False))
    page.select_option(".master-partner-select", target["v"])
    page.wait_for_selector(".master-partner-card")

    hint = page.locator(".master-partner-hint").first
    check("有正午暂排说明", "正午" in hint.inner_text(), hint.inner_text())
    check("不再出现合参不开", page.locator("text=合参不开").count() == 0)
    check("补录入口仍在", page.locator(".master-partner-hint .link").count() == 1)

    # 两盘速览：时柱行应有两盘干支
    page.locator(".peek-summary").click()
    rows = page.locator(".peek-row").all_inner_texts()
    time_row = [r for r in rows if r.startswith("时柱")]
    check("速览含时柱且不全未知", bool(time_row) and "未知" not in time_row[0], str(time_row))
    page.screenshot(path=f"{SHOT}-relation-panel-390.png", full_page=True)

    page.get_by_role("button", name="与 欣 合参").click()
    page.wait_for_selector(".master-text", timeout=40000)
    check("对方缺时辰仍能开卷", True)

    check("关系模式载荷", sent.get("mode") == "relation", str(sent.get("mode")))
    partner_chart = sent.get("partner", {})
    check(
        "对方载荷带 time_estimated",
        partner_chart.get("time_estimated") is True,
        json.dumps(partner_chart, ensure_ascii=False)[:200],
    )
    check(
        "对方时柱已按正午排出",
        len(partner_chart.get("bazi", {}).get("pillars", [])) == 4
        and all(p.get("ganzhi") for p in partner_chart["bazi"]["pillars"]),
        json.dumps(partner_chart.get("bazi", {}).get("pillars", []), ensure_ascii=False),
    )

    # 两盘速览（开卷后折叠区仍在时可复查）
    overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    check("390 无横滚", overflow == 0, str(overflow))
    page.screenshot(path=f"{SHOT}-relation-390.png", full_page=True)

    unexpected = [e for e in errors if "ERR_FAILED" not in e]
    check("控制台无报错", not unexpected, "; ".join(unexpected[:3]))
    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
if failed:
    for name, _, extra in failed:
        print(f"  FAILED: {name} {extra}")
    sys.exit(1)