# -*- coding: utf-8 -*-
"""玄机先生解读屏本地验收（对 mock Function）。

自管 mock 进程：先起 mock（经 vite 代理 /functions → 127.0.0.1:8787），
桌面+手机各跑一遍流式/停止；最后杀掉 mock 验证无网中文兜底。
"""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("QA_BASE", "http://127.0.0.1:5173")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, ".qa")
os.makedirs(OUT, exist_ok=True)

results = []


def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS " if cond else "FAIL ") + name + (f" | {extra}" if extra and not cond else ""))


def start_mock():
    proc = subprocess.Popen(
        ["node", os.path.join(ROOT, "scripts", "mock-function.mjs")],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(0.8)
    return proc


def fill_form(page):
    page.goto(BASE, wait_until="networkidle")
    page.select_option("#province", "上海")
    page.select_option("#city", "黄浦区")
    page.fill("#dob", "1965-02-06")
    page.fill("#birth-time", "15:00")
    page.click("#gender-male")
    page.click("button.submit")
    page.wait_for_load_state("networkidle")


def open_master(page):
    page.get_by_role("button", name="玄机先生").click()
    page.wait_for_selector(".master-live")


def main():
    mock = start_mock()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)

            # ── 桌面 1280x800 ────────────────────
            page = browser.new_page(viewport={"width": 1280, "height": 800})
            errors = []
            page.on(
                "console",
                lambda m: errors.append(m.text) if m.type == "error" else None,
            )
            fill_form(page)
            open_master(page)

            opening = page.locator(".master-open").inner_text()
            check("开场白出现且含金（T001 日主辛金）", "属金" in opening, opening)

            page.wait_for_selector(".master-btn:not([disabled])", timeout=15000)
            check(
                "印占盘就绪后按钮可用",
                page.locator(".master-btn:not([disabled])").count() == 7,
            )

            page.get_by_role("button", name="事业工作").click()
            page.wait_for_selector(".master-text", timeout=10000)
            t1 = page.locator(".master-text").inner_text()
            page.wait_for_timeout(700)
            t2 = page.locator(".master-text").inner_text()
            check("流式增量输出", len(t2) > len(t1), f"{len(t1)} -> {len(t2)}")
            page.wait_for_timeout(9000)
            full = page.locator(".master-text").inner_text()
            check("事业工作有结尾固定行", "不构成任何决策依据" in full)
            check("事业工作带依据行", "依据：" in full)
            check(
                "文本完成后不重复显示尾部合规行",
                page.locator(".master-tail").count() == 0,
            )
            page.screenshot(path=os.path.join(OUT, "master-career.png"))

            page.get_by_role("button", name="合参").click()
            page.wait_for_timeout(1200)
            page.locator(".master-stop").click()
            page.wait_for_selector(".master-note-line", timeout=5000)
            note = page.locator(".master-note-line").inner_text()
            check("停止后出现半截话说明", "半截" in note, note)
            stopped_text = page.locator(".master-text").inner_text()
            check(
                "停止保留部分文本且无结尾行",
                len(stopped_text) > 0 and "不构成任何决策依据" not in stopped_text,
            )
            page.screenshot(path=os.path.join(OUT, "master-merge-stopped.png"))

            page.get_by_role("button", name="再问一次").click()
            page.wait_for_timeout(12000)
            merge_text = page.locator(".master-text").inner_text()
            check("合参含印证段", "印证" in merge_text)
            check("合参含错位段", "错位" in merge_text)
            check("合参含综合判断段", "综合判断" in merge_text)
            check("合参有中式依据", "中式依据" in merge_text)
            check("合参有印占依据", "印占依据" in merge_text)
            check("合参结尾固定行", merge_text.rstrip().endswith("不构成任何决策依据。"))
            bad = [
                w
                for w in ("印占七杀", "八字上升", "印占正官", "八字dasha")
                if w in merge_text
            ]
            check("合参无杂交术语", not bad, str(bad))
            page.screenshot(
                path=os.path.join(OUT, "master-merge-full.png"), full_page=True
            )

            check("桌面控制台无报错", not errors, "; ".join(errors[:3]))
            page.close()

            # ── 手机 390x844 ─────────────────────
            page = browser.new_page(viewport={"width": 390, "height": 844})
            errors2 = []
            page.on(
                "console",
                lambda m: errors2.append(m.text) if m.type == "error" else None,
            )
            fill_form(page)
            open_master(page)
            page.wait_for_selector(".master-btn:not([disabled])", timeout=15000)
            page.get_by_role("button", name="健康").click()
            page.wait_for_selector(".master-text", timeout=10000)
            page.wait_for_timeout(9000)
            health = page.locator(".master-text").inner_text()
            check("健康方向有以医生意见为准", "以医生意见为准" in health)
            has_overflow = page.evaluate(
                "document.documentElement.scrollWidth > document.documentElement.clientWidth"
            )
            check("手机无横向滚动", not has_overflow)
            open_box = page.locator(".master-open").bounding_box()
            act_box = page.locator(".master-actions").bounding_box()
            stacked = (
                open_box
                and act_box
                and act_box["y"] >= open_box["y"] + open_box["height"] - 2
            )
            check("手机上开场白与按钮竖排", stacked)
            page.screenshot(path=os.path.join(OUT, "master-mobile.png"), full_page=True)
            check("手机控制台无报错", not errors2, "; ".join(errors2[:3]))
            page.close()

            # ── 无网兜底：杀 mock 后再问 ──────────
            mock.kill()
            mock.wait()
            time.sleep(0.5)
            page = browser.new_page(viewport={"width": 1280, "height": 800})
            fill_form(page)
            open_master(page)
            page.wait_for_selector(".master-btn:not([disabled])", timeout=15000)
            page.get_by_role("button", name="家运亲情").click()
            page.wait_for_selector(".master-note-line", timeout=20000)
            fb = page.locator(".master-note-line").inner_text()
            check("断网出现中文兜底", "不通" in fb or "稍候" in fb, fb)
            page.close()
            browser.close()
    finally:
        mock.kill()

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        for name, _, extra in failed:
            print(f"  FAILED: {name} {extra}")
        sys.exit(1)


if __name__ == "__main__":
    main()
