# -*- coding: utf-8 -*-
"""关系人档案：合婚 / 人际·具体某人的对方信息单独存档，下次可一键复用。

每份关系人 = (你给的称呼 + 与你的关系 + 出生信息 + 排盘快照 + 备注/标签)。
按用户邮箱隔离。

存储：JSON 文件，与 users.json / profiles_db.json 并列存放。
"""
import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

CONTACTS_DB_PATH = os.environ.get(
    "XUANJI_CONTACTS_DB",
    str(Path(__file__).parent / "contacts_db.json"),
)

VALID_RELATIONS = {"spouse", "ex", "parent", "child", "sibling", "friend", "colleague", "crush", "other"}


def _load_db() -> dict:
    p = Path(CONTACTS_DB_PATH)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return {"by_email": {}}
    return {"by_email": {}}


def _save_db(db: dict) -> None:
    p = Path(CONTACTS_DB_PATH)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _short_id() -> str:
    return uuid.uuid4().hex[:12]


def _basic(c: dict) -> dict:
    """列档案用的精简版（不含 chart 详情）"""
    base = c.get("base") or {}
    chart = c.get("chart") or {}
    snap = {}
    if "day_master" in chart:
        snap["day_master"] = chart["day_master"]
    if "lagna" in chart and isinstance(chart["lagna"], dict):
        snap["lagna"] = chart["lagna"].get("sign_cn")
    return {
        "id": c["id"],
        "label": c.get("label", "未命名"),
        "relation": c.get("relation", "other"),
        "gender": c.get("gender", ""),
        "base": base,
        "snap": snap,
        "created_at": c.get("created_at"),
        "updated_at": c.get("updated_at"),
    }


# ===== CRUD =====

def create_contact(
    email: str,
    label: str,
    relation: str,
    base: dict,
    chart: dict,
    note: str = "",
) -> dict:
    """创建关系人档案"""
    email = (email or "").strip().lower()
    label = (label or "").strip()[:32] or "未命名"
    relation = (relation or "other").strip()[:16]
    if relation not in VALID_RELATIONS:
        relation = "other"
    db = _load_db()
    cid = _short_id()
    contact = {
        "id": cid,
        "email": email,
        "label": label,
        "relation": relation,
        "gender": (base or {}).get("gender", ""),
        "base": base or {},
        "chart": chart or {},
        "note": (note or "").strip()[:200],
        "created_at": _now(),
        "updated_at": _now(),
    }
    db.setdefault("by_email", {}).setdefault(email, []).append(contact)
    _save_db(db)
    return contact


def list_contacts(email: str) -> List[dict]:
    email = (email or "").strip().lower()
    db = _load_db()
    return [_basic(c) for c in db.get("by_email", {}).get(email, [])]


def get_contact(email: str, cid: str) -> Optional[dict]:
    email = (email or "").strip().lower()
    db = _load_db()
    for c in db.get("by_email", {}).get(email, []):
        if c["id"] == cid:
            return c
    return None


def update_contact(
    email: str,
    cid: str,
    label: Optional[str] = None,
    relation: Optional[str] = None,
    note: Optional[str] = None,
) -> dict:
    email = (email or "").strip().lower()
    db = _load_db()
    for c in db.get("by_email", {}).get(email, []):
        if c["id"] == cid:
            if label is not None:
                c["label"] = (label or "").strip()[:32] or c.get("label", "未命名")
            if relation is not None:
                if relation in VALID_RELATIONS:
                    c["relation"] = relation
            if note is not None:
                c["note"] = (note or "").strip()[:200]
            c["updated_at"] = _now()
            _save_db(db)
            return {"ok": True}
    return {"ok": False, "error": "关系人不存在"}


def delete_contact(email: str, cid: str) -> dict:
    email = (email or "").strip().lower()
    db = _load_db()
    bucket = db.setdefault("by_email", {}).setdefault(email, [])
    new_bucket = [c for c in bucket if c["id"] != cid]
    if len(new_bucket) == len(bucket):
        return {"ok": False, "error": "关系人不存在"}
    db["by_email"][email] = new_bucket
    _save_db(db)
    return {"ok": True}
