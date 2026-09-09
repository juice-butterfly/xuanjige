# -*- coding: utf-8 -*-
"""大模型客户端：智谱 GLM（OpenAI 兼容协议），带模型降级链与模拟模式。"""
import json
import os
from pathlib import Path

import httpx

BASE_URL = "https://open.bigmodel.cn/api/paas/v4"
# 模型降级链：glm-4-plus 优先（快且分析写得丰富，实测深度分析 9s/941字），
# 失败时降级到 glm-4-flash（更快但输出偏短，作兜底）。
# 注意：glm-4.5-flash / glm-4.7-flash 当前响应极慢（20s+ 超时），已移除。
MODEL_CHAIN = ["glm-4-plus", "glm-4-flash"]

_ENV = {}


def _secret_file_candidates():
    """返回外部 secrets 文件候选路径（按优先级）。
    真实凭据脱敏后放在项目目录之外，避免被部署打包上传。
    1) XUANJI_SECRET_FILE 环境变量显式指定
    2) ~/.workbuddy/xuanji-secrets.env（默认外部存放点）
    """
    cands = []
    explicit = os.environ.get("XUANJI_SECRET_FILE", "").strip()
    if explicit:
        cands.append(explicit)
    cands.append(str(Path.home() / ".workbuddy" / "xuanji-secrets.env"))
    return cands


def _read_kv_file(path: str, into: dict) -> None:
    """读一个 KEY=VALUE 文件，值不覆盖已存在的键（低优先级）。"""
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        into.setdefault(k.strip(), v.strip())


def _load_env():
    global _ENV
    if _ENV:
        return _ENV
    # 读取优先级（从低到高）：
    #   1. 项目内 .env（仅占位符或 base64 编码的真实凭据）
    #   2. 外部 secrets 文件（真实凭据，默认 ~/.workbuddy/xuanji-secrets.env）
    #   3. 进程环境变量（最高，部署时注入）
    _read_kv_file(str(Path(__file__).parent / ".env"), _ENV)
    for sp in _secret_file_candidates():
        _read_kv_file(sp, _ENV)
    # 环境变量覆盖（最高优先级）
    for k in ("ZHIPU_API_KEY", "MOCK"):
        env_val = os.environ.get(k)
        if env_val:
            _ENV[k] = env_val

    # base64 透明解码：如果存在 <KEY>_B64，覆盖对应明文 KEY
    # 这样 .env 里可以只放 base64 编码值（外观无害，被扫到也不直接是明文）
    import base64
    for k in ("ZHIPU_API_KEY",):
        b64_v = _ENV.get(k + "_B64")
        if b64_v:
            try:
                _ENV[k] = base64.b64decode(b64_v).decode("utf-8").strip()
            except Exception:
                pass

    return _ENV


async def stream_chat(messages: list, temperature: float = 0.85, max_tokens: int = 4000):
    """流式对话：依次尝试模型链，产出文本增量。全部失败时抛出 RuntimeError。"""
    env = _load_env()
    key = env.get("ZHIPU_API_KEY", "")
    if env.get("MOCK") == "1" or not key:
        async for chunk in _mock_stream(messages):
            yield chunk
        return

    last_err = None
    produced = 0
    for model in MODEL_CHAIN:
        try:
            # read 超时单独设置：读流时每 30 秒无新数据则断，避免坏模型拖满整段卡死
            timeout = httpx.Timeout(connect=10, read=30, write=20, pool=10)
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream(
                    "POST",
                    f"{BASE_URL}/chat/completions",
                    headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
                    json={
                        "model": model,
                        "messages": messages,
                        "stream": True,
                        "temperature": temperature,
                        "max_tokens": max_tokens,
                    },
                ) as resp:
                    if resp.status_code != 200:
                        body = (await resp.aread()).decode("utf-8", "ignore")[:200]
                        last_err = RuntimeError(f"{model}: HTTP {resp.status_code} {body}")
                        continue
                    model_produced = 0
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        payload = line[5:].strip()
                        if payload == "[DONE]":
                            return
                        try:
                            data = json.loads(payload)
                        except json.JSONDecodeError:
                            continue
                        delta = data.get("choices", [{}])[0].get("delta", {})
                        piece = delta.get("content", "")
                        if piece:
                            model_produced += 1
                            produced += 1
                            yield piece
                    # 流正常结束
                    return
        except Exception as e:  # 网络异常/限流 → 尝试下一个模型
            last_err = e
            # 如果已经产出了内容，不再降级重跑（否则会从头重复），直接结束
            if produced > 0:
                return
            continue
    raise RuntimeError(f"所有模型均不可用：{last_err}")


MOCK_TEXT = (
    "【模拟模式】未检测到可用 API key（或 MOCK=1）。"
    "这是用于联调的占位回复：排盘数据已生成，接通真实模型后，"
    "这里将流式输出命理师傅的完整解读。"
)


async def _mock_stream(messages):
    text = MOCK_TEXT
    for i in range(0, len(text), 6):
        yield text[i:i + 6]


# ====== 非流式小调用：用于「AI 识别」端点把用户大段文本解析成结构化字段 ======
# 故意与 stream_chat 走同一模型链 + 同步超时更短，避免解析环节拖慢排盘体验。
PARSE_MODEL_CHAIN = ["glm-4-flash", "glm-4-plus"]  # 解析任务用 flash 即可（快、便宜、足够稳）


PARSE_SYSTEM = (
    "你是玄机阁的「生辰信息抽取员」。用户会给你一段可能很随意的话（聊天记录、备注、身份证号、"
    "出生证明摘抄、八字四柱如「丙戌 午 己未 庚午」等等），你要尽可能从中抽取他/她的生辰信息，"
    "并以**严格的 JSON** 返回（不要任何解释、不要 Markdown 代码块、字段缺失就省略）：\n"
    '{'
    '"name": "求测者姓名（若用户没给则省略）",'
    '"year": 1998,'
    '"month": 7,'
    '"day": 31,'
    '"hour": 14,'
    '"minute": 10,'
    '"lunar": false,'
    '"place": "若提到出生地则填省/市/区/县/城市名（必须能被中国城市表识别）",'
    '"gender": "男 | 女（若文本明确则填）",'
    '"time_precise": true,'
    '"calendar_kind": "公历 | 农历 | 四柱",'
    '"pillars": {'
    '"year_ganzhi": "丙戌",'
    '"month_ganzhi": "午",'
    '"day_ganzhi": "己未",'
    '"hour_ganzhi": "庚午"'
    '}'
    '}\n\n'
    "规则：\n"
    "1) 农历日期必须转成公历（精确到日；月份也要算上闰月）。\n"
    "2) 仅给出四柱天干地支（如「丙戌 午 己未 庚午」）时，按四柱反推公历年月日（用万年历法：年柱定年、月柱+节气定月、日柱查表、时柱定时辰）。\n"
    "3) 若时间根本看不出（如「大概春天」、「八十年代」），hour/minute 可以省略、time_precise=false。\n"
    "4) 性别若是「女性/女生/她」之类也归女，「他/男」归男；不明确就省略 gender。\n"
    "5) 提取不出任何有效日期信息时，返回 {} （空对象）。\n"
    "6) 必须返回合法 JSON；任何多余文字都会让前端的 JSON.parse 失败。"
)


async def parse_info_text(text: str, timeout_s: float = 18) -> str:
    """调智谱把用户大段文本解析成结构化 JSON 字符串。
    返回原始模型输出（前端会 JSON.parse），失败时抛 RuntimeError。"""
    import asyncio as _aio
    env = _load_env()
    key = env.get("ZHIPU_API_KEY", "")
    if env.get("MOCK") == "1" or not key:
        # mock 模式：返回空 JSON，前端走兜底
        return "{}"

    user_text = (text or "").strip()[:1500]  # 限长
    if not user_text:
        return "{}"

    messages = [
        {"role": "system", "content": PARSE_SYSTEM},
        {"role": "user", "content": user_text},
    ]
    last_err = None
    for model in PARSE_MODEL_CHAIN:
        try:
            timeout = httpx.Timeout(connect=8, read=timeout_s, write=10, pool=8)
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    f"{BASE_URL}/chat/completions",
                    headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
                    json={
                        "model": model,
                        "messages": messages,
                        "stream": False,
                        "temperature": 0.2,
                        "max_tokens": 600,
                    },
                )
                if resp.status_code != 200:
                    body = resp.text[:200]
                    last_err = RuntimeError(f"{model}: HTTP {resp.status_code} {body}")
                    continue
                data = resp.json()
                content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
                return (content or "").strip()
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(f"AI 识别失败：{last_err}")
