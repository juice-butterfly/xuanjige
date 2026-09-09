# -*- coding: utf-8 -*-
"""玄机阁 存储后端抽象层。

支持两种后端，按环境变量自动选择：
1. MongoDB Atlas（生产 / 云端）：设 MONGODB_URI 即启用，数据永久持久化。
2. 本地 JSON 文件（开发 / 兜底）：未设 MONGODB_URI 时使用，保持原有行为。

两者暴露相同的读写接口，调用方（auth.py / profiles.py）无需感知差异。
MongoDB 不可用（连接失败）时自动回退到 JSON，保证服务不崩。
"""
import json
import os
import threading
from pathlib import Path

# ---------------------------------------------------------------------------
# MongoDB 后端（惰性连接，避免本地无 pymongo 时导入即报错）
# ---------------------------------------------------------------------------

_mongo_client = None
_mongo_db = None
_mongo_lock = threading.Lock()
_mongo_failed = False


def _mongo_available() -> bool:
    """判断是否应该走 MongoDB：有 URI 且 pymongo 可导入。"""
    uri = os.environ.get("MONGODB_URI", "").strip()
    if not uri:
        return False
    try:
        import pymongo  # noqa: F401
        return True
    except Exception:
        return False


def _get_mongo_db():
    """惰性建立 MongoDB 连接并返回 db 对象；失败返回 None 并标记回退。"""
    global _mongo_client, _mongo_db, _mongo_failed
    if _mongo_failed:
        return None
    if _mongo_db is not None:
        return _mongo_db
    with _mongo_lock:
        if _mongo_db is not None:
            return _mongo_db
        if _mongo_failed:
            return None
        uri = os.environ.get("MONGODB_URI", "").strip()
        dbname = os.environ.get("MONGODB_DB", "xuanji").strip() or "xuanji"
        try:
            import pymongo
            _mongo_client = pymongo.MongoClient(
                uri, serverSelectionTimeoutMS=3000, connectTimeoutMS=3000
            )
            # 触发性校验：ping 一次，失败即回退
            _mongo_client.admin.command("ping")
            _mongo_db = _mongo_client[dbname]
            print("[storage] 使用 MongoDB 后端，库=" + dbname, flush=True)
            return _mongo_db
        except Exception as e:
            _mongo_failed = True
            print("[storage] MongoDB 连接失败，回退 JSON 后端：" + str(e), flush=True)
            return None


def _mongo_fetch(key: str) -> dict:
    """从 MongoDB 读取一个文档，按 _id=key；不存在返回空 dict。"""
    db = _get_mongo_db()
    if db is None:
        return {}
    try:
        doc = db.kv.find_one({"_id": key})
        if not doc:
            return {}
        return doc.get("value", {})
    except Exception:
        return {}


def _mongo_store(key: str, value: dict) -> bool:
    """把 dict 整体写回 MongoDB（upsert）。成功返回 True。"""
    db = _get_mongo_db()
    if db is None:
        return False
    try:
        db.kv.update_one({"_id": key}, {"$set": {"value": value}}, upsert=True)
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# JSON 后端（本地文件）
# ---------------------------------------------------------------------------

def _json_load(path: Path) -> dict:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _json_save(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------
# 统一接口：一个"库名"对应一个 dict（内存即整个库的形态）
# 后端语义：MongoDB 把整个 dict 存进一个文档；JSON 存进一个文件。
# ---------------------------------------------------------------------------

class Store:
    """按"库名"划分的键值文档存储。

    用法：
        store = Store("users", "users.json", default={"users": {}})
        db = store.load()            # 读取整个 dict（Mongo 缓存 + JSON 兜底）
        store.save(db)               # 写回
    """

    def __init__(self, name: str, filename: str, default: dict):
        self.name = name              # MongoDB collection 内 _id 前缀
        self.filename = filename      # JSON 文件名
        self.default = default or {}
        self._path = Path(__file__).parent / filename
        self._cache = None            # 内存缓存，避免每次都打 Mongo/磁盘

    def _read(self) -> dict:
        """读取完整 dict：优先 Mongo，其次 JSON 文件，最后默认值。"""
        if _mongo_available():
            val = _mongo_fetch(self.name)
            if val:
                return val
            # Mongo 里没有 → 尝试从本地 JSON 迁移一次（首次切换后端时的数据迁移）
            local = _json_load(self._path)
            if local:
                _mongo_store(self.name, local)
                return local
        return _json_load(self._path)

    def load(self) -> dict:
        if self._cache is None:
            data = self._read()
            if not data:
                data = dict(self.default)
            self._cache = data
        return self._cache

    def save(self, data: dict) -> None:
        self._cache = data
        if _mongo_available():
            if _mongo_store(self.name, data):
                return
            # Mongo 写失败 → 回退 JSON，保证数据不丢
        _json_save(self._path, data)
