# -*- coding: utf-8 -*-
"""validate_chart 三模式回归测试"""
import sys, os
sys.path.insert(0, r"D:\AI coding test\fortune-web")
import guard

# 八字 chart（含 day_master + pillars）
bazi_chart = {
    "day_master": "甲",
    "pillars": {"year": {}, "month": {}, "day": {}, "time": {}},
    "wuxing_normalized": {"木": 3, "火": 1, "土": 1, "金": 0.5, "水": 1},
}

# 印占 chart（含 lagna + planets + moon_nakshatra，无 day_master）
vedic_chart = {
    "lagna": {"sign": "Cancer", "sign_cn": "巨蟹"},
    "planets": [{"planet": "太阳"}, {"planet": "月亮"}],
    "moon_nakshatra": {"name": "Pushya", "pada": 3, "lord": "Saturn"},
    "dasha": [],
    "yogas": {},
    "karakas": {},
    "meta": {"dob": "1995-08-10"},
}

# 合参 chart（两个子盘）
combo_chart = {
    "bazi": bazi_chart,
    "vedic": vedic_chart,
}

cases = [
    ("八字模式正常盘", bazi_chart, "bazi", True, ""),
    ("印占模式正常盘", vedic_chart, "vedic", True, ""),
    ("合参模式正常盘", combo_chart, "combo", True, ""),
    ("八字缺 day_master", {**bazi_chart, "day_master": ""}, "bazi", False, "日主"),
    ("八字缺 pillars", {**bazi_chart, "pillars": None}, "bazi", False, "四柱"),
    ("印占缺 moon_nakshatra", {**vedic_chart, "moon_nakshatra": {}}, "vedic", False, "月亮宿"),
    ("印占缺 lagna", {**vedic_chart, "lagna": {}}, "vedic", False, "升座"),
    ("合参缺 vedic", {"bazi": bazi_chart}, "combo", False, "印占"),
    ("合参缺 bazi", {"vedic": vedic_chart}, "combo", False, "八字"),
    ("未知模式", bazi_chart, "astrology", False, "未知"),
    ("chart 非字典", "hello", "bazi", False, "对象"),
]

failures = 0
for name, ch, mode, expect_ok, expect_hint in cases:
    ok, err = guard.validate_chart(ch, mode=mode)
    passed = (ok == expect_ok) and (expect_hint in err if not expect_ok else True)
    mark = "✅" if passed else "❌"
    if not passed:
        failures += 1
    print(f"{mark} [{mode}] {name}: ok={ok} err={err!r}")

print()
if failures:
    print(f"❌ {failures} 用例失败")
    sys.exit(1)
else:
    print(f"✅ 全部 {len(cases)} 用例通过")
