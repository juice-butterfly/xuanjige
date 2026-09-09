# -*- coding: utf-8 -*-
"""命理档案长期保存 + 跨设备同步。

每份档案 = （标签 + 与本人关系 + 出生信息 + 盘面 + 三模式对话历史）。
按 user_email 隔离：每个账号只能看自己的档案。

存储：JSON 文件（dev 简单方案）；云端沙箱重启会丢，README 已注明。
"""
import json
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Any

PROFILES_DB_PATH = os.environ.get(
    "XUANJI_PROFILES_DB",
    str(Path(__file__).parent / "profiles_db.json"),
)

# 存储后端：优先 MongoDB（设 MONGODB_URI 时），否则本地 JSON（开发/兜底）
import storage  # noqa: E402
_profiles_store = storage.Store(
    "profiles",
    os.environ.get("XUANJI_PROFILES_DB", "profiles_db.json"),
    default={"by_email": {}},
)

# 防止超长历史撑爆存储：单档 history 总消息数 / 单条 content 上限
MAX_HISTORY_LEN = 200
MAX_CONTENT_LEN = 3000


def _load_db() -> dict:
    return _profiles_store.load()


def _save_db(db: dict) -> None:
    _profiles_store.save(db)


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _short_id() -> str:
    return uuid.uuid4().hex[:12]


def _trim_history(history: Dict[str, list]) -> Dict[str, list]:
    """对 history 做基本防御：截断超长 message / 限制总条数。"""
    if not isinstance(history, dict):
        return {}
    cleaned = {}
    for mode in ("bazi", "vedic", "combo"):
        msgs = history.get(mode) or []
        if not isinstance(msgs, list):
            continue
        truncated = msgs[:MAX_HISTORY_LEN]
        for m in truncated:
            if isinstance(m, dict) and isinstance(m.get("content"), str):
                m["content"] = m["content"][:MAX_CONTENT_LEN]
        cleaned[mode] = truncated
    return cleaned


def _basic_profile_shape(p: dict) -> dict:
    """返回 list 用的精简版（不返 history / 详细 chart）"""
    chart = p.get("chart") or {}
    snapshot = {}
    if "day_master" in chart:
        snapshot["day_master"] = chart.get("day_master")
    if "bazi" in chart and isinstance(chart["bazi"], dict):
        snapshot["day_master"] = chart["bazi"].get("day_master")
    vc = chart.get("vedic")
    if isinstance(vc, dict) and vc.get("lagna"):
        snapshot["lagna"] = vc["lagna"].get("sign_cn")
    return {
        "id": p["id"],
        "label": p.get("label", "未命名"),
        "relation": p.get("relation", "other"),
        "base": p.get("base", {}),
        "modes": p.get("modes", []),
        "snapshot": snapshot,
        "created_at": p.get("created_at"),
        "updated_at": p.get("updated_at"),
        "history_size": {
            m: len(p.get("history", {}).get(m, []))
            for m in ("bazi", "vedic", "combo")
        },
    }


# ===== CRUD =====

def create_profile(
    email: str,
    label: str,
    relation: str,
    base: dict,
    chart: dict,
    modes: list,
    history: Optional[dict] = None,
) -> dict:
    email = (email or "").strip().lower()
    label = (label or "").strip()[:32] or "未命名"
    relation = (relation or "other").strip()[:16]
    db = _load_db()
    pid = _short_id()
    profile = {
        "id": pid,
        "email": email,
        "label": label,
        "relation": relation,
        "base": base or {},
        "chart": chart or {},
        "modes": list(modes or []),
        "history": _trim_history(history or {}),
        "created_at": _now(),
        "updated_at": _now(),
    }
    db.setdefault("by_email", {}).setdefault(email, []).append(profile)
    _save_db(db)
    return profile


def list_profiles(email: str) -> List[dict]:
    email = (email or "").strip().lower()
    db = _load_db()
    profiles = db.get("by_email", {}).get(email, [])
    return [_basic_profile_shape(p) for p in profiles]


def get_profile(email: str, pid: str) -> Optional[dict]:
    email = (email or "").strip().lower()
    db = _load_db()
    for p in db.get("by_email", {}).get(email, []):
        if p["id"] == pid:
            return p
    return None


def update_history(email: str, pid: str, mode: str, messages: list) -> dict:
    """同步指定模式下的历史对话（同时截 list 长度和单条 content 长度）"""
    email = (email or "").strip().lower()
    mode = (mode or "").strip()
    if mode not in ("bazi", "vedic", "combo"):
        return {"ok": False, "error": "未知模式"}
    db = _load_db()
    bucket = db.setdefault("by_email", {}).setdefault(email, [])
    for p in bucket:
        if p["id"] == pid:
            msgs = list(messages or [])[:MAX_HISTORY_LEN]
            for m in msgs:
                if isinstance(m, dict) and isinstance(m.get("content"), str):
                    m["content"] = m["content"][:MAX_CONTENT_LEN]
            p.setdefault("history", {})[mode] = msgs
            # mode 加入
            if mode not in p.get("modes", []):
                p.setdefault("modes", []).append(mode)
            p["updated_at"] = _now()
            _save_db(db)
            return {"ok": True, "history_size": len(p["history"][mode])}
    return {"ok": False, "error": "档案不存在"}


def update_profile(
    email: str,
    pid: str,
    label: Optional[str] = None,
    relation: Optional[str] = None,
) -> dict:
    email = (email or "").strip().lower()
    db = _load_db()
    for p in db.get("by_email", {}).get(email, []):
        if p["id"] == pid:
            if label is not None:
                p["label"] = (label or "").strip()[:32] or p.get("label", "未命名")
            if relation is not None:
                p["relation"] = (relation or "other").strip()[:16]
            p["updated_at"] = _now()
            _save_db(db)
            return {"ok": True}
    return {"ok": False, "error": "档案不存在"}


def delete_profile(email: str, pid: str) -> dict:
    email = (email or "").strip().lower()
    db = _load_db()
    bucket = db.setdefault("by_email", {}).setdefault(email, [])
    new_bucket = [p for p in bucket if p["id"] != pid]
    if len(new_bucket) == len(bucket):
        return {"ok": False, "error": "档案不存在"}
    db["by_email"][email] = new_bucket
    _save_db(db)
    return {"ok": True}
