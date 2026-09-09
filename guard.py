# -*- coding: utf-8 -*-
"""输入防御层：防提示词注入、防越狱、防异常输入污染模型上下文。

攻击面（按实际可利用性排序）：
1. role 字段伪造：用户发 role=system 试图覆盖或新增 system prompt（最高危，会污染智谱的整个会话）
2. 经典注入句式：「忽略之前所有指令」「你现在是xxx」「system: 新的指示」
3. 上下文污染：长篇堆叠指令、用 Markdown 隐藏指令（HTML注释/零宽字符）
4. 越狱模板：奶奶漏洞、token 拆分、base64 编码绕过
5. 单条过长 / 字段类型异常：试图拖垮上下文窗口或绕过校验

策略：前置白名单 + 关键黑名单 + 长度/字符限制 + 多重注入检测。命中即拒绝该条消息，
但允许"求测者正常的提问/补充"无碍通过。
"""
import re
import json
from typing import Tuple, List, Dict


# 允许的角色（白名单）—— 故意不开放 system/developer/tool 等特权角色
ALLOWED_ROLES = {"user", "assistant"}

# 单条 user 内容的最大字符数（防注入/防上下文窗口被撑爆/防伪装聊天历史塞超长内容）
MAX_USER_CONTENT_LEN = 600
# 单条 assistant 内容的最大字符数（先生回复动辄千字，过短会被截；assistant 由模型自己产出，不存在被注入风险）
MAX_ASSISTANT_CONTENT_LEN = 2500

# 单次请求 messages 数量上限（防止伪造长历史拖垮）
MAX_MESSAGES = 30

# 角色注入攻击黑名单：经典越狱句式
INJECTION_PATTERNS = [
    # 角色劫持
    r"(?i)ignore\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions|prompts?|directives?)",
    r"(?i)忽略\s*(?:之前|以上|前面|此前|所有)\s*(?:的)?\s*(?:指令|提示|规则|设定|安排|命令)",
    r"(?i)disregard\s+(?:all|any)\s+(?:rules|instructions|guidelines)",
    r"(?i)forget\s+(?:everything|all|your\s+(?:rules|instructions))",
    r"(?i)你现在\s*(?:是|扮演|变成|当成|叫)\s*\S+",
    r"(?i)act\s+as\s+(?:a\s+)?\S+",
    r"(?i)you\s+are\s+now\s+",
    r"(?i)pretend\s+to\s+be",
    r"(?i)system\s*(?:prompt|message)?\s*[:：]",
    r"(?i)new\s+instructions?\s*[:：]",
    r"(?i)override\s+(?:all\s+)?(?:rules|system|instructions)",
    r"(?i)jailbreak|DAN\s+mode|developer\s+mode",
    # 越狱模板标记
    r"(?i)do\s+anything\s+now",
    r"(?i)bypass\s+(?:all\s+)?(?:filter|safety|restriction)",
    r"(?i)without\s+(?:any\s+)?(?:filter|restriction|limit)",
    # 奶奶漏洞 / 角色扮演绕过
    r"(?i)my\s+(?:grandmother|grandma)\s+(?:used\s+to|would)",
    r"(?i)as\s+a\s+fiction\s+character",
    r"(?i)roleplay\s+(?:as|that)",
    # 中文常见注入
    r"从现在开始",
    r"重新定义",
    r"系统(?:提示|指令)\s*[:：]",
    r"new\s*role\s*[:：]",
    r"更新(?:你的|所有|系统)\s*(?:规则|设定|提示)",
    r"解除\s*(?:限制|封禁|审核|安全)",
    r"清空(?:你的)?\s*(?:记忆|历史|上下文)",
    r"覆写\s*(?:系统|你的)\s*(?:提示|规则|设定)",
    r"关闭\s*(?:内容)?\s*审核",
    r"启用\s*(?:开发者|调试|无限制)\s*模式",
    r"返回\s*(?:完整|原始|未过滤)\s*内容",
]

# 零宽字符（攻击者常用 Unicode 隐藏字符绕过审核）
ZERO_WIDTH_CHARS = re.compile(r"[\u200b-\u200f\u2028-\u202f\u205f-\u206f\ufeff\ufffe]")


def _strip_zero_width(text: str) -> str:
    return ZERO_WIDTH_CHARS.sub("", text)


def _check_injection(text: str) -> Tuple[bool, str]:
    """检查单条文本是否含注入模式。返回 (是否命中, 命中原因)。
    仅检测，不修改内容——命中的消息由调用方决定是拒绝还是脱敏。"""
    if not text:
        return False, ""
    cleaned = _strip_zero_width(text)
    for pat in INJECTION_PATTERNS:
        m = re.search(pat, cleaned)
        if m:
            return True, f"检测到疑似越狱/注入句式: {m.group(0)[:40]}"
    return False, ""


def _sanitize_content(text: str) -> str:
    """对通过校验的内容做安全脱敏（防止上下文污染）。"""
    if not text:
        return text
    # 去掉零宽字符
    text = _strip_zero_width(text)
    # 去掉 markdown 代码块标记（防止伪 system 标记混入）
    text = re.sub(r"```(?:system|assistant|user)\b", "```", text, flags=re.IGNORECASE)
    # 把"system: "开头的行中和标记
    text = re.sub(r"^\s*system\s*[:：]\s*", "「补充」：", text, flags=re.MULTILINE | re.IGNORECASE)
    return text.strip()


def validate_messages(messages: List[Dict]) -> Tuple[bool, str, List[Dict]]:
    """校验并清洗 messages 列表。

    返回 (是否通过, 拒绝原因, 清洗后的消息列表)。
    - role 白名单：只接受 user/assistant
    - 单条 content 长度限制：> 600 拒绝
    - 单条 content 注入检测：命中则整条拒绝（不替换、不改写，直接抛错）
    - 消息数量限制：> 30 拒绝
    """
    if not isinstance(messages, list) or not messages:
        return False, "消息列表为空", []

    if len(messages) > MAX_MESSAGES:
        return False, f"对话轮数超过上限（{MAX_MESSAGES}），请重置", []

    cleaned = []
    for i, m in enumerate(messages):
        if not isinstance(m, dict):
            return False, f"第 {i+1} 条消息格式错误", []
        role = (m.get("role") or "").strip()
        if role not in ALLOWED_ROLES:
            return False, f"第 {i+1} 条消息 role 越权（仅接受 user/assistant）", []
        content = m.get("content") or ""
        if not isinstance(content, str):
            return False, f"第 {i+1} 条消息 content 必须是字符串", []

        # 长度限制（按角色分别设阈值——防注入只对 user 起作用）
        limit = MAX_USER_CONTENT_LEN if role == "user" else MAX_ASSISTANT_CONTENT_LEN
        if len(content) > limit:
            role_hint = "求测者" if role == "user" else "先生回复"
            return False, f"第 {i+1} 条{role_hint}内容过长（{len(content)}>{limit}），请精简", []

        # 注入检测
        hit, reason = _check_injection(content)
        if hit:
            return False, f"第 {i+1} 条消息存在安全风险：{reason}。求测者请勿在对话中尝试修改先生的人设或绕过解读规则。", []

        cleaned.append({"role": role, "content": _sanitize_content(content)})

    return True, "", cleaned


def validate_chart(chart: dict, mode: str = "bazi") -> Tuple[bool, str]:
    """校验 chart 字段，防止伪造盘面数据污染模型判断。

    三种模式的 chart 结构完全不同：
    - bazi:  顶层有 day_master / pillars / wuxing_normalized
    - vedic: 顶层有 lagna / planets / moon_nakshatra / dasha
    - combo: 顶层包 { bazi: {...}, vedic: {...} }，递归分检
    """
    if not isinstance(chart, dict):
        return False, "chart 字段必须是对象"

    if mode == "combo":
        # 合参 = 八字盘 + 印占盘，分别校验
        bazi_chart = chart.get("bazi", {})
        vedic_chart = chart.get("vedic", {})
        ok, err = validate_chart(bazi_chart, mode="bazi")
        if not ok:
            return False, f"合参盘的八字部分：{err}"
        ok, err = validate_chart(vedic_chart, mode="vedic")
        if not ok:
            return False, f"合参盘的印占部分：{err}"
        chart_json = json.dumps(chart, ensure_ascii=False)
        if len(chart_json) > 80000:
            return False, f"合参盘数据过大（{len(chart_json)}>80000）"
        return True, ""

    if mode == "bazi":
        required = [
            ("day_master", "日主"),
            ("pillars", "四柱"),
        ]
    elif mode == "vedic":
        required = [
            ("lagna", "升座"),
            ("planets", "九曜"),
            ("moon_nakshatra", "月亮宿"),
        ]
    else:
        return False, f"未知的排盘模式：{mode}"

    for field, label in required:
        if not chart.get(field):
            return False, f"chart 缺少{label}字段"

    # 限制 chart 大小（防止塞超长字符串污染上下文）
    limit = 50000
    chart_json = json.dumps(chart, ensure_ascii=False)
    if len(chart_json) > limit:
        return False, f"chart 数据过大（{len(chart_json)}>{limit}）"
    return True, ""
