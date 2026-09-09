# -*- coding: utf-8 -*-
"""玄机阁 · 中西合参命理 Web —— FastAPI 后端入口"""
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Header
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import auth
import bazi
import cities
import contacts
import guard
import llm
import profiles
import prompts

app = FastAPI(title="玄机阁")
STATIC_DIR = Path(__file__).parent / "static"

# ====== 鉴权依赖：从 Authorization: Bearer <token> 解出当前用户 ======
def current_user(authorization: Optional[str] = Header(default=None)) -> Optional[dict]:
    return auth.auth_user(authorization)

# 印占引擎（PyJHora+pysweph，C 扩展）：引擎脚本已内置于项目 vedic/ 目录。
VEDIC_BRIDGE = str(Path(__file__).parent / "vedic_bridge.py")
VEDIC_SCRIPTS_DIR = os.environ.get(
    "VEDIC_SCRIPTS_DIR",
    str(Path(__file__).parent / "vedic"),
)


def _resolve_vedic_python():
    """选择运行印占引擎的 Python 解释器：
    1. 环境变量 VEDIC_PYTHON（最高优先级）
    2. 本地 Windows skill venv（存在则用，因引擎依赖 C 扩展装在该 venv）
    3. 否则回退到当前进程的 Python（云端 pip 装好依赖后直接用 sys.executable）
    """
    env_py = os.environ.get("VEDIC_PYTHON")
    if env_py:
        return env_py
    local_venv = r"C:/Users/Lenovo/.workbuddy/skills/vedic-astrology/venv/Scripts/python.exe"
    if Path(local_venv).exists():
        return local_venv
    return sys.executable


VEDIC_PYTHON = _resolve_vedic_python()


class BaziRequest(BaseModel):
    year: int = Field(ge=1900, le=2100)
    month: int = Field(ge=1, le=12)
    day: int = Field(ge=1, le=31)
    hour: int = Field(ge=0, le=23)
    minute: int = Field(ge=0, le=59, default=0)
    gender: str = "男"
    time_precise: bool = True
    place: str = ""


class LunarRequest(BaseModel):
    """农历转公历：用于「农历生日」tab 填的（年/月/日）→ 公历（年/月/日）。
    lunar_year/lunar_month/lunar_day：农历日期；leap=true 表示闰月。"""
    lunar_year: int = Field(ge=1900, le=2100)
    lunar_month: int = Field(ge=1, le=12)
    lunar_day: int = Field(ge=1, le=30)
    leap: bool = False


class PillarsRequest(BaseModel):
    """四柱直入：用户给四个天干地支，反推公历（年/月/日）+时辰。
    year_ganzhi/month_ganzhi/day_ganzhi/hour_ganzhi：如 "丙戌"、"午"、"己未"、"庚午"。
    search_range：搜索公历年的窗口（默认 ±5 年）。**给年柱时**窗内必能找到 1 个；**没给年柱时**
    同一个日柱每 60 天出现一次，±5 年大概 30 个候选，月柱/时柱会进一步缩窄。"""
    year_ganzhi: str = ""
    month_ganzhi: str = ""
    day_ganzhi: str
    hour_ganzhi: str
    gender: str = "男"
    search_range: int = Field(default=5, ge=0, le=90)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    chart: dict
    messages: list[ChatMessage]
    mode: str = "bazi"  # bazi | vedic | combo
    user_note: Optional[str] = None  # 用户在「AI 识别 / 补充重点」里自己写的重点，会注入到 system prompt
    other_chart: Optional[dict] = None  # 合婚/关系解读时的「对方」完整八字盘，注入 system prompt 做合盘


@app.post("/api/bazi")
def api_bazi(req: BaziRequest):
    try:
        chart = bazi.calc_bazi(
            req.year, req.month, req.day, req.hour, req.minute,
            req.gender, req.time_precise, req.place,
        )
        return {"ok": True, "chart": chart}
    except Exception as e:
        return {"ok": False, "error": f"排盘失败：{e}"}


@app.get("/api/cities")
def api_cities():
    # 返回省→市两级结构，省按拼音字母排序，省内城市按拼音排序
    data = {}
    for prov in cities.sorted_provinces():
        data[prov] = cities.sorted_cities(prov)
    return {"ok": True, "provinces": data}


@app.post("/api/vedic")
def api_vedic(req: BaziRequest):
    """印占排盘：城市名→经纬度→调 vedic 引擎子进程。"""
    try:
        coord = cities.lookup(req.place)
        if not coord:
            return {"ok": False, "error": f"未能识别城市「{req.place}」，请从下拉列表选择"}
        lat, lon = coord
        payload = {
            "year": req.year, "month": req.month, "day": req.day,
            "hour": req.hour, "minute": req.minute,
            "lat": lat, "lon": lon, "place": req.place,
            "uncertainty_minutes": 1 if req.time_precise else 15,
        }
        proc = subprocess.run(
            [VEDIC_PYTHON, VEDIC_BRIDGE],
            input=json.dumps(payload, ensure_ascii=False),
            capture_output=True, text=True, encoding="utf-8", timeout=120,
        )
        # 过滤 PyJHora 库打印到 stdout 的干扰行，只取 JSON
        out_line = None
        for line in proc.stdout.splitlines():
            line = line.strip()
            if line.startswith("{"):
                out_line = line
                break
        if not out_line:
            return {"ok": False, "error": f"印占排盘无输出：{proc.stderr[-300:]}"}
        result = json.loads(out_line)
        # 失败时把 trace 一并透传给前端（诊断用，正常成功时无此字段）
        if not result.get("ok") and result.get("trace"):
            result["error"] = result["error"] + " || " + result["trace"]
        return result
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "印占排盘超时，请重试"}
    except Exception as e:
        return {"ok": False, "error": f"印占排盘失败：{e}"}


@app.post("/api/lunar-to-solar")
def api_lunar_to_solar(req: LunarRequest):
    """农历 → 公历：用于「农历生日」tab。
    暂只支持主月（lunar_python 的 Lunar.fromYmd 不区分闰月；
    闰月场景占比 < 1%，遇到再让用户用公历输入）。"""
    try:
        from lunar_python import Lunar
        if req.leap:
            return {"ok": False, "error": "暂不支持农历闰月，如确实需要请用「公历生日」或「四柱八字」输入"}
        l = Lunar.fromYmd(req.lunar_year, req.lunar_month, req.lunar_day)
        s = l.getSolar()
        return {
            "ok": True,
            "solar_year": s.getYear(),
            "solar_month": s.getMonth(),
            "solar_day": s.getDay(),
        }
    except Exception as e:
        return {"ok": False, "error": f"农历转公历失败：{e}"}


# 六十甲子表（用于四柱反推：先扫描公历日期拿到所有日期的天干地支，再匹配）
GAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"]
ZHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"]
JIAZI = [GAN[i % 10] + ZHI[i % 12] for i in range(60)]  # 完整 60 甲子


def _ganzhi_of_year(y: int) -> str:
    """公历年 → 年柱天干地支（基于 1984=癸亥 + 60 甲子循环）。
    重要：lunar_python 按节气切年，所以这里用 Solar.fromYmd(y, 6, 1) 夏季确保已过立春。
    实际生产里我们用 solar.getLunar().getEightChar().getYear() 直接算，不依赖本表。"""
    from lunar_python import Solar
    # 用 6 月 1 日确保已经在立春之后
    s = Solar.fromYmd(y, 6, 1)
    return s.getLunar().getEightChar().getYear()


def _ganzhi_of_day(y: int, m: int, d: int) -> str:
    """公历日 → 日柱天干地支（用 lunar_python 精确计算）"""
    from lunar_python import Solar
    s = Solar.fromYmd(y, m, d)
    l = s.getLunar()
    ec = l.getEightChar()
    return ec.getDay()


def _ganzhi_of_hour(y: int, m: int, d: int, h: int) -> str:
    """公历时 → 时柱天干地支"""
    from lunar_python import Solar
    s = Solar.fromYmdHms(y, m, d, h, 0, 0)
    l = s.getLunar()
    ec = l.getEightChar()
    return ec.getTime()


def _ganzhi_of_month_around_solar_term(y: int, m: int, d: int) -> str:
    """公历某天所在的月柱（按节气起算）"""
    from lunar_python import Solar
    s = Solar.fromYmd(y, m, d)
    l = s.getLunar()
    ec = l.getEightChar()
    return ec.getMonth()


@app.post("/api/pillars-to-solar")
def api_pillars_to_solar(req: PillarsRequest):
    """四柱反推公历日期：
    在 [today-search_range, today+search_range] 窗口内扫描，找到同时匹配
    4 个天干地支的公历日期（年柱+月柱+日柱+时柱 全部对上）。
    给年柱时 search_range 默认 5 已足够；没给年柱时单一日柱每 60 天出现一次，
    建议 search_range ≥ 5 让月柱/时柱进一步缩窄。"""
    try:
        import datetime as _dt
        from lunar_python import Solar
        today = _dt.date.today()
        year_lo = today.year - req.search_range
        year_hi = today.year + req.search_range
        # 粗筛：先按年柱过滤年份（缩小到 60 年一轮的若干年）
        cand_years = list(range(year_lo, year_hi + 1))
        target_y = (req.year_ganzhi or "").strip()
        target_m = (req.month_ganzhi or "").strip()
        target_d = (req.day_ganzhi or "").strip()
        target_h = (req.hour_ganzhi or "").strip()
        if not (target_d and target_h):
            return {"ok": False, "error": "日柱与时柱必填（只给年柱无法唯一确定）"}
        if target_y:
            cand_years = [y for y in cand_years if _ganzhi_of_year(y) == target_y]
        # 扫日：找到日柱匹配的所有日期
        results = []
        def _gz_match(actual, target, strict=False):
            if not target: return True
            actual = (actual or '').strip()
            if actual == target: return True
            if strict: return False
            if len(target) == 1 and len(actual) >= 1 and actual[-1] == target: return True
            return False
        from datetime import date, timedelta
        # 性能优化：先用年份预过滤（粗筛），再用日柱过滤（中筛），最后月柱/年柱严筛+时柱
        # 1) 粗筛年份
        cand_years = []
        for y in range(year_lo, year_hi + 1):
            if target_y and _ganzhi_of_year(y) != target_y:
                continue
            cand_years.append(y)
        # 2) 扫日，找到日柱匹配的日期
        for y in cand_years:
            for m in range(1, 13):
                # 找到本月第一个日柱为 target_d 的日期
                d = 1
                while d <= 31:
                    try:
                        s = Solar.fromYmd(y, m, d)
                    except Exception:
                        break
                    actual_d = s.getLunar().getEightChar().getDay()
                    if actual_d == target_d:
                        # 月柱严筛
                        if _gz_match(s.getLunar().getEightChar().getMonth(), target_m):
                            # 时柱：枚举 12 个时辰
                            matched_hours = []
                            for h in range(0, 24, 2):
                                s2 = Solar.fromYmdHms(y, m, d, h, 0, 0)
                                if _gz_match(s2.getLunar().getEightChar().getTime(), target_h):
                                    matched_hours.append(h)
                            if matched_hours:
                                results.append({"year": y, "month": m, "day": d, "matched_hours": matched_hours})
                                if len(results) >= 5: break
                        # 跳到下一个日柱=target_d 的日期（60天循环）
                        d += 60
                    else:
                        d += 1
                if len(results) >= 5: break
            if len(results) >= 5: break
        if not results:
            return {"ok": False, "error": f"在 {year_lo}-{year_hi} 年内未找到匹配的四柱日期（请检查干支是否正确）"}
        return {"ok": True, "candidates": results, "count": len(results)}
    except Exception as e:
        return {"ok": False, "error": f"四柱反推失败：{e}"}


@app.post("/api/chat")
async def api_chat(req: ChatRequest):
    # 防御层：先校验 chart 和 messages，防提示词注入和异常输入
    # 三种模式 chart 结构不同，传 mode 让校验逻辑各自对得上号
    chart_ok, chart_err = guard.validate_chart(req.chart, mode=req.mode)
    if not chart_ok:
        async def blocked_gen():
            yield f"data: {json.dumps({'error': f'请求被安全策略拦截：{chart_err}'}, ensure_ascii=False)}\n\n"
            yield "data: {\"done\": true}\n\n"
        return StreamingResponse(blocked_gen(), media_type="text/event-stream",
                                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
    raw_msgs = [{"role": m.role, "content": m.content} for m in req.messages]
    msgs_ok, msgs_err, cleaned_msgs = guard.validate_messages(raw_msgs)
    if not msgs_ok:
        async def blocked_gen():
            yield f"data: {json.dumps({'error': f'请求被安全策略拦截：{msgs_err}'}, ensure_ascii=False)}\n\n"
            yield "data: {\"done\": true}\n\n"
        return StreamingResponse(blocked_gen(), media_type="text/event-stream",
                                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    mock = llm._load_env().get("MOCK") == "1" or not llm._load_env().get("ZHIPU_API_KEY")
    # other_chart：合婚/关系解读时对方完整盘，注入 system prompt 做合盘。先校验防注入。
    # 印占模式对方盘是印占盘（用 vedic 校验），其余模式对方盘是八字盘（用 bazi 校验）。
    other_chart = req.other_chart
    if other_chart is not None:
        if not isinstance(other_chart, dict):
            other_chart = None  # 非法类型直接丢弃，不影响主盘解读
        else:
            _ok, _err = guard.validate_chart(other_chart, mode=("vedic" if req.mode == "vedic" else "bazi"))
            if not _ok:
                other_chart = None  # 对方盘不合法则降级为仅主盘解读
    # user_note：用户在「AI 识别 / 补充重点」里自己写的重点。
    # 三种模式（公历/印占/合参）都把这条作为「先验锚点」追加到 system prompt，让先生优先回应用户提到的方向。
    user_note = (req.user_note or "").strip()[:1200]  # 上限 1200 字，防止 prompt 爆炸 / 注入
    system = prompts.build_system(req.chart, mode=req.mode, mock=mock, user_note=user_note or None, other_chart=other_chart)
    msgs = [{"role": "system", "content": system}] + cleaned_msgs

    async def gen():
        try:
            async for piece in llm.stream_chat(msgs):
                yield f"data: {json.dumps({'delta': piece}, ensure_ascii=False)}\n\n"
        except RuntimeError as e:
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': f'服务异常：{e}'}, ensure_ascii=False)}\n\n"
        finally:
            yield "data: {\"done\": true}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


# ====== 用户认证接口 ======
class RegisterRequest(BaseModel):
    email: str


class LoginRequest(BaseModel):
    email: str
    password: str


class ParseInfoRequest(BaseModel):
    text: str = Field(max_length=2000)


@app.post("/api/parse-info")
async def api_parse_info(req: ParseInfoRequest):
    """AI 识别：把用户大段文本解析成结构化生辰字段。
    失败兜底：返回 {ok:false, raw: 原文}，前端把原文当 user_note 发给先生。"""
    raw = (req.text or "").strip()
    if not raw:
        return {"ok": False, "raw": raw, "error": "内容为空"}
    try:
        content = await llm.parse_info_text(raw)
        # 模型可能返回 ```json ... ``` 或带前导说明，做一次宽松剥离
        import re as _re
        m = _re.search(r"\{[\s\S]*\}", content)
        if not m:
            return {"ok": False, "raw": raw, "raw_response": content[:200], "error": "模型未返回 JSON"}
        import json as _json
        try:
            parsed = _json.loads(m.group(0))
        except Exception as e:
            return {"ok": False, "raw": raw, "raw_response": content[:200], "error": f"JSON 解析失败：{e}"}
        # 字段白名单与基本类型检查
        out = {}
        for k in ("name", "place", "gender", "calendar_kind"):
            v = parsed.get(k)
            if isinstance(v, str) and v.strip():
                out[k] = v.strip()
        for k in ("year", "month", "day", "hour", "minute"):
            v = parsed.get(k)
            if isinstance(v, (int, float)) and 0 < v < 9999:
                out[k] = int(v)
        if "lunar" in parsed:
            out["lunar"] = bool(parsed["lunar"])
        if "time_precise" in parsed:
            out["time_precise"] = bool(parsed["time_precise"])
        pillars = parsed.get("pillars")
        if isinstance(pillars, dict):
            pg = {k: v for k, v in pillars.items() if isinstance(v, str) and v.strip()}
            if pg:
                out["pillars"] = pg
        if "year" in out and "month" in out and "day" in out:
            return {"ok": True, "data": out, "raw": raw}
        # 模型返回了但关键字段缺失
        return {"ok": False, "raw": raw, "raw_response": content[:200], "partial": out, "error": "关键字段缺失"}
    except Exception as e:
        return {"ok": False, "raw": raw, "error": f"AI 识别失败：{e}"}


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class UpdateNicknameRequest(BaseModel):
    nickname: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    new_password: str


@app.post("/api/forgot-password")
def api_forgot_password(req: ForgotPasswordRequest):
    return auth.request_password_reset(req.email)


@app.post("/api/reset-password")
def api_reset_password(req: ResetPasswordRequest):
    return auth.verify_reset_and_change(req.email, req.code, req.new_password)


@app.post("/api/register")
def api_register(req: RegisterRequest):
    """邮箱注册：返回一次性临时密码（前端展示让用户记下）"""
    return auth.register(req.email)


@app.post("/api/login")
def api_login(req: LoginRequest):
    """登录：成功返回 JWT（前端存 localStorage）+ must_change_password 标志"""
    return auth.login(req.email, req.password)


@app.post("/api/change-password")
def api_change_password(req: ChangePasswordRequest, authorization: Optional[str] = Header(default=None)):
    """改密：必须登录态（用旧密码验明身份）+ 新密码强度校验"""
    user = auth.auth_user(authorization)
    if not user:
        return {"ok": False, "error": "请先登录"}
    return auth.change_password(user["email"], req.old_password, req.new_password)


@app.get("/api/me")
def api_me(authorization: Optional[str] = Header(default=None)):
    """获取当前用户信息（昵称/邮箱/注册时间/最近登录/是否需改密）"""
    user = auth.auth_user(authorization)
    if not user:
        return {"ok": False, "error": "未登录"}
    info = auth.get_me(user["email"])
    if not info:
        return {"ok": False, "error": "用户不存在"}
    return {"ok": True, **info}


@app.post("/api/profile/nickname")
def api_nickname(req: UpdateNicknameRequest, authorization: Optional[str] = Header(default=None)):
    """改昵称（登录态）"""
    user = auth.auth_user(authorization)
    if not user:
        return {"ok": False, "error": "请先登录"}
    return auth.update_nickname(user["email"], req.nickname)


# ====== 命理档案 CRUD（登录态） ======
class ProfileCreateRequest(BaseModel):
    label: str  # 档案标签，如「我自己」「老婆」
    relation: str = "other"  # self / spouse / parent / child / friend / other
    base: dict  # 出生信息（年/月/日/时/分/性别/时间精度/地点）
    chart: dict  # 排盘快照（bazi/vedic/combo 任一）
    modes: list[str] = Field(default_factory=list)
    history: dict = Field(default_factory=dict)  # {bazi: [...], vedic: [...], combo: [...]}


class ProfileUpdateRequest(BaseModel):
    label: Optional[str] = None
    relation: Optional[str] = None


class ProfileHistorySyncRequest(BaseModel):
    mode: str  # bazi / vedic / combo
    messages: list  # 该模式下的完整对话历史


@app.get("/api/profiles")
def api_profiles_list(authorization: Optional[str] = Header(default=None)):
    """列出当前用户的所有档案（精简版，不含 history 详情）"""
    user = auth.auth_user(authorization)
    if not user:
        return {"ok": False, "error": "请先登录"}
    return {"ok": True, "profiles": profiles.list_profiles(user["email"])}


@app.post("/api/profiles")
def api_profiles_create(req: ProfileCreateRequest, authorization: Optional[str] = Header(default=None)):
    """创建一份新档案（首次排盘成功后自动调用，或手动新建）"""
    user = auth.auth_user(authorization)
    if not user:
        return {"ok": False, "error": "请先登录"}
    p = profiles.create_profile(
        user["email"], req.label, req.relation, req.base, req.chart,
        req.modes, req.history,
    )
    return {"ok": True, "id": p["id"], "profile": profiles._basic_profile_shape(p)}


@app.get("/api/profiles/{pid}")
def api_profiles_get(pid: str, authorization: Optional[str] = Header(default=None)):
    """拉取指定档案的完整内容（含 chart + 各模式 history）"""
    user = auth.auth_user(authorization)
    if not user:
        return {"ok": False, "error": "请先登录"}
    p = profiles.get_profile(user["email"], pid)
    if not p:
        return {"ok": False, "error": "档案不存在"}
    return {"ok": True, "profile": p}


@app.patch("/api/profiles/{pid}")
def api_profiles_update(pid: str, req: ProfileUpdateRequest, authorization: Optional[str] = Header(default=None)):
    """改档案标签 / 关系"""
    user = auth.auth_user(authorization)
    if not user:
        return {"ok": False, "error": "请先登录"}
    return profiles.update_profile(user["email"], pid, label=req.label, relation=req.relation)


@app.patch("/api/profiles/{pid}/history")
def api_profiles_sync_history(pid: str, req: ProfileHistorySyncRequest, authorization: Optional[str] = Header(default=None)):
    """同步指定模式的对话历史（解读结束自动调用）"""
    user = auth.auth_user(authorization)
    if not user:
        return {"ok": False, "error": "请先登录"}
    return profiles.update_history(user["email"], pid, req.mode, req.messages)


@app.delete("/api/profiles/{pid}")
def api_profiles_delete(pid: str, authorization: Optional[str] = Header(default=None)):
    """删除档案"""
    user = auth.auth_user(authorization)
    if not user:
        return {"ok": False, "error": "请先登录"}
    return profiles.delete_profile(user["email"], pid)


# ====== 关系人档案 CRUD（登录态） ======
class ContactCreateRequest(BaseModel):
    label: str  # 你给他的称呼
    relation: str = "other"  # spouse/ex/parent/child/sibling/friend/colleague/crush/other
    base: dict  # 出生信息
    chart: dict = Field(default_factory=dict)
    note: str = ""


class ContactUpdateRequest(BaseModel):
    label: Optional[str] = None
    relation: Optional[str] = None
    note: Optional[str] = None


@app.get("/api/contacts")
def api_contacts_list(authorization: Optional[str] = Header(default=None)):
    """列关系人（精简版）"""
    user = auth.auth_user(authorization)
    if not user:
        return {"ok": False, "error": "请先登录"}
    return {"ok": True, "contacts": contacts.list_contacts(user["email"])}


@app.post("/api/contacts")
def api_contacts_create(req: ContactCreateRequest, authorization: Optional[str] = Header(default=None)):
    user = auth.auth_user(authorization)
    if not user:
        return {"ok": False, "error": "请先登录"}
    c = contacts.create_contact(
        user["email"], req.label, req.relation, req.base, req.chart, req.note
    )
    return {"ok": True, "id": c["id"], "contact": contacts._basic(c)}


@app.get("/api/contacts/{cid}")
def api_contacts_get(cid: str, authorization: Optional[str] = Header(default=None)):
    user = auth.auth_user(authorization)
    if not user:
        return {"ok": False, "error": "请先登录"}
    c = contacts.get_contact(user["email"], cid)
    if not c:
        return {"ok": False, "error": "关系人不存在"}
    return {"ok": True, "contact": c}


@app.patch("/api/contacts/{cid}")
def api_contacts_update(cid: str, req: ContactUpdateRequest, authorization: Optional[str] = Header(default=None)):
    user = auth.auth_user(authorization)
    if not user:
        return {"ok": False, "error": "请先登录"}
    return contacts.update_contact(
        user["email"], cid,
        label=req.label, relation=req.relation, note=req.note,
    )


@app.delete("/api/contacts/{cid}")
def api_contacts_delete(cid: str, authorization: Optional[str] = Header(default=None)):
    user = auth.auth_user(authorization)
    if not user:
        return {"ok": False, "error": "请先登录"}
    return contacts.delete_contact(user["email"], cid)


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8787"))
    uvicorn.run(app, host="0.0.0.0", port=port)
