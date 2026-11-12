# 收口验收：390/360/320 三宽度 × 四屏，无横向滚动；表单一屏；页脚常驻；控制台无错
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

QA = Path(__file__).resolve().parents[2] / ".qa"
QA.mkdir(exist_ok=True)
BASE = "http://127.0.0.1:5173/"
FOOT = "本工具为传统文化娱乐内容，解读由大模型生成，仅供参考，不构成任何决策依据"

failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    tag = "PASS" if ok else "FAIL"
    print(f"[{tag}] {name}{(' :: ' + detail) if detail and not ok else ''}")
    if not ok:
        failures.append(name)


def overflow(page) -> int:
    return page.evaluate(
        "() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth"
    )


def footer_state(page) -> dict:
    return page.evaluate(
        """() => {
          const f = document.querySelector('.compliance')
          if (!f) return null
          const r = f.getBoundingClientRect()
          return {
            text: f.textContent.replace(/\\s+/g, ''),
            fixed: getComputedStyle(f).position === 'fixed',
            bottom: Math.round(r.bottom),
            vh: innerHeight,
          }
        }"""
    )


def submit_state(page) -> dict:
    return page.evaluate(
        """() => {
          const b = document.querySelector('.submit').getBoundingClientRect()
          const f = document.querySelector('.compliance').getBoundingClientRect()
          return { bottom: Math.round(b.bottom), footTop: Math.round(f.top), vh: innerHeight }
        }"""
    )


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    for width, height in [(390, 844), (360, 780), (320, 568)]:
        tag = f"{width}"

        ctx = browser.new_context(viewport={"width": width, "height": height})
        page = ctx.new_page()
        errs: list[str] = []
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append(str(e)))

        # ── 表单屏 ──
        page.goto(BASE, wait_until="networkidle")
        check(f"{tag} 表单：无横向滚动", overflow(page) == 0, str(overflow(page)))
        fs = footer_state(page)
        check(
            f"{tag} 表单：页脚常驻且文案逐字一致",
            fs is not None and fs["fixed"] and fs["text"] == FOOT and fs["bottom"] == height,
            str(fs),
        )
        ss = submit_state(page)
        check(
            f"{tag} 表单：提交按钮一屏可见且不被页脚遮挡",
            ss["bottom"] <= min(ss["footTop"], ss["vh"]),
            str(ss),
        )

        # ── 双盘屏 ──
        page.select_option("#province", label="上海")
        page.select_option("#city", label="黄浦区")
        page.fill("#dob", "1965-02-06")
        page.fill("#birth-time", "15:00")
        page.click('.seg button:has-text("女")')
        page.click(".submit")
        page.wait_for_selector(".bazi", timeout=45000)
        page.evaluate("() => window.scrollTo(0, 0)")
        check(f"{tag} 双盘：无横向滚动（中式）", overflow(page) == 0, str(overflow(page)))

        page.click('.dual-seg button:has-text("西")')
        page.wait_for_selector(".vcell--lagna", state="visible", timeout=60000)
        page.evaluate("() => window.scrollTo(0, 0)")
        check(f"{tag} 双盘：无横向滚动（印占）", overflow(page) == 0, str(overflow(page)))
        check(
            f"{tag} 双盘：页脚仍常驻",
            footer_state(page)["bottom"] == height,
            str(footer_state(page)),
        )

        # ── 玄机先生屏 ──
        page.click('.tab:has-text("玄机先生")')
        page.wait_for_selector(".master-open", timeout=15000)
        page.evaluate("() => window.scrollTo(0, 0)")
        check(f"{tag} 先生：无横向滚动", overflow(page) == 0, str(overflow(page)))

        # ── 关系人屏 ──
        page.click('.tab:has-text("关系人")')
        page.wait_for_selector(".partner-form", timeout=15000)
        page.fill("#partner-alias", "阿乙")
        page.select_option("#partner-province", label="江苏")
        page.select_option("#partner-city", label="南京")
        page.fill("#partner-dob", "1980-03-02")
        page.check('.unknown input[type="checkbox"]')
        page.click('.seg button:has-text("女")')
        page.click(".partner-form .submit")
        page.wait_for_selector(".match-warning", timeout=30000)
        check(f"{tag} 关系人：无横向滚动", overflow(page) == 0, str(overflow(page)))
        page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
        check(
            f"{tag} 关系人：滚到底页脚仍常驻",
            footer_state(page)["bottom"] == height,
            str(footer_state(page)),
        )
        page.screenshot(path=str(QA / f"close-{width}.png"), full_page=False)

        check(f"{tag} 控制台无错", len(errs) == 0, "; ".join(errs[:4]))
        ctx.close()

    browser.close()

print()
if failures:
    print(f"挂科 {len(failures)} 项：{'；'.join(failures)}")
    sys.exit(1)
print("全过")
