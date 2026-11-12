# 关系人页验收：双盘对照、时辰不详句、冲线可见、术语点击、手机视口、控制台无错
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

QA = Path(__file__).resolve().parents[2] / ".qa"
QA.mkdir(exist_ok=True)
BASE = "http://127.0.0.1:5173/"
NO_TIME_NOTE = "对方时辰缺失，婚姻宫与上升星座判断受限，结论确定性下降"

failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    tag = "PASS" if ok else "FAIL"
    print(f"[{tag}] {name}{(' :: ' + detail) if detail and not ok else ''}")
    if not ok:
        failures.append(name)


def collect_console(page) -> list[str]:
    errors: list[str] = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    return errors


def fill_self_form(page) -> None:
    page.goto(BASE, wait_until="networkidle")
    page.select_option("#province", label="上海")
    page.select_option("#city", label="黄浦区")
    page.fill("#dob", "1965-02-06")
    page.fill("#birth-time", "15:00")
    page.click('.seg button:has-text("女")')
    page.click(".submit")
    page.wait_for_selector(".bazi", timeout=45000)


def goto_match(page) -> None:
    page.click('.tab:has-text("关系人")')
    page.wait_for_selector(".partner-form", timeout=15000)


def add_partner(page, alias: str, dob: str, time: str | None, gender: str) -> None:
    page.fill("#partner-alias", alias)
    page.select_option("#partner-province", label="江苏")
    page.select_option("#partner-city", label="南京")
    page.fill("#partner-dob", dob)
    if time is None:
        page.check('.unknown input[type="checkbox"]')
    else:
        page.fill("#partner-time", time)
    page.click(f'.seg button:has-text("{gender}")')
    page.click('.partner-form .submit')


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # ── 桌面 1280×800 ──
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    page = ctx.new_page()
    errs = collect_console(page)
    fill_self_form(page)
    goto_match(page)

    blocked = page.locator(".chart-blocked").count()
    check("入口：本人有时辰，无拦阻卡", blocked == 0)

    # ── 阿甲：有时辰，年日双冲 ──
    add_partner(page, "阿甲", "1983-03-10", "14:30", "男")
    page.wait_for_selector(".match-board", timeout=30000)
    check("阿甲：对照板出现", page.locator(".match-board").count() == 1)

    head_mid = page.eval_on_selector(".match-head-mid", "el => el.textContent")
    head_r = page.eval_on_selector(".match-head-side--r", "el => el.textContent")
    check("阿甲：表头三栏（本人/对照/阿甲）", head_mid == "对照" and "阿甲" in head_r, f"{head_mid}|{head_r}")

    warn = page.locator(".match-warning").count()
    check("阿甲：有时辰不出时辰缺失句", warn == 0)

    chong = page.locator(".match-link--chong").count()
    check("阿甲：至少一条相冲", chong >= 1, f"chong={chong}")

    chong_style = page.eval_on_selector(
        ".match-link--chong",
        """el => {
          const s = getComputedStyle(el, '::before')
          const tag = el.querySelector('.match-link-tag')
          return {
            img: s.backgroundImage,
            tag: tag ? tag.textContent : '',
            tagColor: tag ? getComputedStyle(tag).color : '',
          }
        }""",
    )
    check(
        "阿甲：冲线为朱砂虚线且标「冲」",
        "repeating-linear-gradient" in chong_style["img"] and chong_style["tag"] == "冲",
        json.dumps(chong_style, ensure_ascii=False),
    )

    advices = page.eval_on_selector_all(".match-advices li", "els => els.map(e => e.textContent.trim())")
    check("相处三则：恰好三条且非空", len(advices) == 3 and all(advices), str(advices))

    spouse = page.eval_on_selector_all(".match-spouse p", "els => els.map(e => e.textContent.trim())")
    check("配偶星：两行都有内容", len(spouse) == 2 and all("配偶星" in s for s in spouse), str(spouse))

    notes = page.eval_on_selector_all(".match-notes p", "els => els.map(e => e.textContent.trim())")
    check("干支关系注记：非空", len(notes) >= 1 and all(notes), str(notes))

    stored = page.evaluate("() => JSON.parse(localStorage.getItem('xuanjige.partners.v1') || '[]')")
    check(
        "存档：只存称呼不存真名",
        len(stored) == 1 and stored[0]["alias"] == "阿甲" and all(
            k not in ("name", "realName", "真名") for k in stored[0]
        ),
        json.dumps(stored, ensure_ascii=False),
    )

    # ── 阿乙：时辰不详 ──
    add_partner(page, "阿乙", "1980-03-02", None, "男")
    page.wait_for_selector(".match-warning", timeout=30000)

    warn_text = page.eval_on_selector(".match-warning", "el => el.textContent.trim()")
    check("阿乙：时辰缺失句逐字出现", warn_text == NO_TIME_NOTE, warn_text)

    unknown_cells = page.eval_on_selector_all(
        ".match-cell--unknown .match-cell-v", "els => els.map(e => e.textContent.trim())"
    )
    check("阿乙：中式时柱与西式上升标未知", unknown_cells.count("未知") >= 2, str(unknown_cells))

    ve_note = page.eval_on_selector(".match-ve-note", "el => el.textContent.trim()")
    check("阿乙：正午估算说明出现", "正午" in ve_note, ve_note)

    he = page.locator(".match-link--he").count()
    check("阿乙：年日相合可见", he >= 2, f"he={he}")
    he_style = page.eval_on_selector(
        ".match-link--he",
        "el => { const s = getComputedStyle(el, '::before'); return { img: s.backgroundImage, tag: el.querySelector('.match-link-tag').textContent } }",
    )
    check(
        "阿乙：合线为金色实线且标「合」",
        he_style["img"] in ("none", "") and he_style["tag"] == "合",
        json.dumps(he_style, ensure_ascii=False),
    )

    # ── 术语点击 ──
    page.click('.match-spouse [data-term="配偶星"]')
    page.wait_for_selector(".term-sheet", timeout=5000)
    sheet_title = page.eval_on_selector("#term-sheet-title", "el => el.textContent")
    sheet_text = page.eval_on_selector(".term-sheet-text", "el => el.textContent.trim()")
    check("术语：配偶星弹出释义", sheet_title == "配偶星" and sheet_text not in ("", "这一条暂无释义。"), sheet_text)
    page.click(".term-sheet-close")

    # ── 切换与删除 ──
    page.click('.partner-chip:has-text("阿甲") > button:first-child')
    page.wait_for_timeout(300)
    warn_after = page.locator(".match-warning").count()
    check("切换：点回阿甲无缺失句", warn_after == 0)

    page.click('.partner-chip:has-text("阿乙") .partner-del')
    page.wait_for_timeout(300)
    left = page.evaluate("() => JSON.parse(localStorage.getItem('xuanjige.partners.v1') || '[]').length")
    check("删除：阿乙移除且存档同步", left == 1, str(left))

    page.screenshot(path=str(QA / "match-desktop.png"), full_page=True)

    # ── 手机 375×700 ──
    mctx = browser.new_context(viewport={"width": 375, "height": 700})
    mpage = mctx.new_page()
    merrs = collect_console(mpage)
    fill_self_form(mpage)
    goto_match(mpage)
    add_partner(mpage, "阿甲", "1983-03-10", "14:30", "男")
    mpage.wait_for_selector(".match-board", timeout=30000)
    overflow = mpage.evaluate(
        "() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth"
    )
    check("手机：无横向溢出", overflow <= 1, str(overflow))
    chong_m = mpage.locator(".match-link--chong").count()
    check("手机：冲线仍可见", chong_m >= 1, str(chong_m))
    mpage.screenshot(path=str(QA / "match-mobile.png"), full_page=True)

    all_errs = errs + merrs
    check("控制台无错", len(all_errs) == 0, "; ".join(all_errs[:5]))

    ctx.close()
    mctx.close()
    browser.close()

print()
if failures:
    print(f"挂科 {len(failures)} 项：{'；'.join(failures)}")
    sys.exit(1)
print("全过")
