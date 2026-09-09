# -*- coding: utf-8 -*-
"""
印占排盘桥接脚本：在主服务中通过 subprocess + vedic skill venv 调用本脚本。
本脚本独立运行，接收 JSON 输入（stdin），输出精简 JSON（stdout）。
只提取解读所需核心要素，避免把 5 万字符的完整盘面塞进 prompt。

用法：
  vedic_venv_python vedic_bridge.py <<< '{"year":1995,...,"lat":30.59,"lon":114.30}'
"""
import json
import os
import sys

# 印占引擎脚本目录：优先环境变量，其次项目内 vedic/，最后本地 skill 路径
SCRIPTS_DIR = os.environ.get(
    "VEDIC_SCRIPTS_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "vedic"),
)
sys.path.insert(0, SCRIPTS_DIR)

from engine import calculate_full_chart  # noqa: E402

SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
         "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"]
SIGNS_CN = ["白羊", "金牛", "双子", "巨蟹", "狮子", "处女",
            "天秤", "天蝎", "射手", "摩羯", "水瓶", "双鱼"]
PLANETS_CN = {"Sun": "太阳", "Moon": "月亮", "Mars": "火星", "Mercury": "水星",
              "Jupiter": "木星", "Venus": "金星", "Saturn": "土星", "Rahu": "罗睺", "Ketu": "计都"}


def _sign_cn(sign):
    idx = SIGNS.index(sign) if sign in SIGNS else -1
    return SIGNS_CN[idx] if idx >= 0 else sign


def summarize(chart: dict, meta: dict) -> dict:
    out = {}

    # 升座（命宫）
    lagna = chart.get("lagna", {})
    out["lagna"] = {
        "sign": lagna.get("sign"), "sign_cn": _sign_cn(lagna.get("sign", "")),
        "degree": lagna.get("deg_str"),
        "nakshatra": (lagna.get("nakshatra") or {}).get("name", ""),
    }

    # 九曜落宫
    planets = []
    for pn, cn in PLANETS_CN.items():
        pd = chart.get("planets", {}).get(pn, {})
        if not pd:
            continue
        planets.append({
            "planet": cn, "sign_cn": _sign_cn(pd.get("sign", "")),
            "house": pd.get("house"), "degree": pd.get("deg_str"),
            "retro": bool(pd.get("retrograde")),
            "nakshatra": (pd.get("nakshatra") or {}).get("name", ""),
        })
    out["planets"] = planets

    # 月亮宿（Vimshottari 起运依据，印占核心）
    moon = chart.get("planets", {}).get("Moon", {})
    mn = moon.get("nakshatra") or {}
    out["moon_nakshatra"] = {"name": mn.get("name", ""), "pada": mn.get("pada", ""),
                             "lord": mn.get("lord", "")}

    # 大运（Vimshottari Dasha 完整主运序列 + 当前次运）
    dashas = chart.get("dashas", [])
    dasha_out = []
    for d in dashas:
        entry = {
            "md_planet": d.get("planet"),
            "md_start": d.get("start"),
            "md_end": d.get("end"),
            "is_current": bool(d.get("is_current")),
        }
        if d.get("is_current"):
            ads = [a for a in d.get("antardashas", []) if a.get("is_current")]
            if ads:
                entry["ad_planet"] = ads[0].get("planet")
                entry["ad_start"] = ads[0].get("start")
                entry["ad_end"] = ads[0].get("end")
        dasha_out.append(entry)
    out["dasha"] = dasha_out

    # 重要瑜伽（格局）——yoga_prescan 是嵌套结构，展平成 {名称: active}
    yoga = chart.get("yoga_prescan", {})
    yoga_flat = {}
    if yoga:
        for k, v in yoga.items():
            if isinstance(v, dict) and "active" in v:
                yoga_flat[k] = bool(v.get("active"))
    out["yogas"] = yoga_flat

    # 配偶指示星 / 事业指示星（karakas 结构：7k 是 [[角色,行星,度数]...]，另有 dk_7k 快捷字段）
    karakas = chart.get("karakas", {})
    ak = amk = None
    for role, planet, _deg in karakas.get("7k", []):
        if role == "AK":
            ak = planet
        if role == "AmK":
            amk = planet
    out["karakas"] = {
        "AK": ak,
        "DK": karakas.get("dk_7k"),
        "AmK": amk,
    }

    # 月亮盈亏
    out["moon_phase"] = chart.get("moon_phase", {}).get("waxing", None)

    # 元信息
    out["meta"] = {
        "dob": meta.get("dob", ""), "time": meta.get("time", ""),
        "place": meta.get("place", ""),
        "lat": meta.get("lat"), "lon": meta.get("lon"),
        "ayanamsa": round(chart.get("ayanamsa", 0), 2),
    }
    return out


def main():
    raw = sys.stdin.read()
    data = json.loads(raw)
    year, month, day = data["year"], data["month"], data["day"]
    hour, minute = data.get("hour", 12), data.get("minute", 0)
    lat, lon = data["lat"], data["lon"]
    tz_str = data.get("tz", "Asia/Shanghai")
    uncertainty = data.get("uncertainty_minutes", 1)

    chart = calculate_full_chart(year, month, day, hour, minute, lat, lon,
                                 tz_str=tz_str, uncertainty_minutes=uncertainty)
    meta = {"dob": f"{year:04d}-{month:02d}-{day:02d}",
            "time": f"{hour:02d}:{minute:02d}",
            "place": data.get("place", ""), "lat": lat, "lon": lon}
    result = summarize(chart, meta)
    print(json.dumps({"ok": True, "chart": result}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(json.dumps({"ok": False, "error": str(e), "trace": tb[-800:]}, ensure_ascii=False))
