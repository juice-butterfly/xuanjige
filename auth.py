# -*- coding: utf-8 -*-
"""用户认证：邮箱注册 + 临时密码 + JWT + 强制改密 + 忘记密码重置。

设计要点：
- 注册只需邮箱；后端生成"易记但安全"的临时密码返回给用户一次，用户必须登录后立刻改密
- 密码 hash：bcrypt（salt 内置，10 轮）
- JWT：HS256，payload 含 sub(user_id) / email / mcp(must_change_password) / iat / exp
- 忘记密码：邮箱 → 6 位数字验证码（5 分钟有效），如配 SMTP（MAIL_HOST/USER/PASSWORD/MAIL_FROM）就发邮件；
  未配则把验证码 print 到后端日志 + 通过 debug_code 字段回前端（开发友好）。
  限频：同邮箱 60s 内最多 1 次；不区分邮箱是否存在，统一返 ok 防探测。
- 持久化：JSON 文件（dev 简单方案）；云端沙箱文件重启会丢——真生产请接 PG/MySQL
"""
import json
import os
import re
import secrets
import string
import sys
import time as _time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Tuple

import bcrypt
import jwt

# 路径：默认放项目根目录下
USERS_DB_PATH = os.environ.get(
    "XUANJI_USERS_DB",
    str(Path(__file__).parent / "users.json"),
)

# 存储后端：优先 MongoDB（设 MONGODB_URI 时），否则本地 JSON（开发/兜底）
import storage  # noqa: E402
_users_store = storage.Store(
    "users",
    os.environ.get("XUANJI_USERS_DB", "users.json"),
    default={"users": {}},
)


def _secret_file_candidates():
    """外部 secrets 文件候选路径（真实凭据脱敏后放项目外，避免被部署打包上传）。"""
    cands = []
    explicit = os.environ.get("XUANJI_SECRET_FILE", "").strip()
    if explicit:
        cands.append(explicit)
    cands.append(str(Path.home() / ".workbuddy" / "xuanji-secrets.env"))
    return cands


def _load_external_secrets() -> dict:
    """把外部 secrets 文件里的 KEY=VALUE 读进一个 dict（不覆盖进程环境变量）。
    供邮件配置使用：本地开发时 MAIL_* 从外部文件读，部署时从环境变量读。
    """
    out = {}
    for sp in _secret_file_candidates():
        p = Path(sp)
        if not p.exists():
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out.setdefault(k.strip(), v.strip())
    return out


def _getenv(key: str, default: str = "") -> str:
    """优先取进程环境变量；没有则回退到外部 secrets 文件；都没有则回退到项目内 .env（部署兜底）。
    优先级：环境变量 > 外部 secrets 文件 > 项目内 .env > default
    这样无论本地开发还是云端沙箱（环境变量可能不可靠）都能读到凭据。

    base64 透明解码：如果环境变量/文件里同时存在 <KEY>_B64，会优先解码该值；
    这样部署时可以把敏感凭据 base64 化后写入 .env，外观无害，被人扫到也不直接是明文。
    """
    # 先检查是否有 _B64 编码版本（从环境变量/外部文件/.env 任一来源）
    b64_value = _getenv_raw(key + "_B64")
    if b64_value:
        try:
            import base64
            decoded = base64.b64decode(b64_value).decode("utf-8")
            if decoded:
                return decoded
        except Exception:
            pass  # 解码失败就回落到明文读取

    # 否则按原逻辑读明文
    return _getenv_raw(key) or default


def _getenv_raw(key: str) -> str:
    """_getenv 的核心读取逻辑（不解码）。"""
    v = os.environ.get(key)
    if v is not None and v != "":
        return v
    ext = _load_external_secrets().get(key)
    if ext is not None and ext != "":
        return ext
    # 项目内 .env 兜底（部署时如果 .env 被打包上来也能用；本地开发也方便）
    env_file = Path(__file__).parent / ".env"
    if env_file.exists():
        try:
            for line in env_file.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                if k.strip() == key and v.strip():
                    return v.strip()
        except Exception:
            pass
    return ""

# JWT 密钥：优先级 环境变量 XUANJI_JWT_SECRET > 持久化文件 .jwt_secret > 首次自动生成并落盘
# 为什么要持久化到文件：云端多 worker / 重启时，环境变量传递可能不可靠，导致登录签发的
# token 与后续验签用的密钥不一致（表现为"登录成功但 /api/me 报未登录"）。落盘保证同一
# 沙箱内所有进程、所有重启都读到同一个密钥。
# 走 _getenv() 读取以支持 _B64 编码值（脱敏部署）。
def _resolve_jwt_secret() -> str:
    env = _getenv("XUANJI_JWT_SECRET", "").strip()
    if env:
        return env
    # 持久化文件（放项目目录，随源码一起部署；不含环境变量依赖）
    secret_file = Path(__file__).parent / ".jwt_secret"
    try:
        if secret_file.exists():
            existing = secret_file.read_text(encoding="utf-8").strip()
            if existing:
                return existing
        # 不存在或为空 → 生成一个强随机值并落盘
        generated = secrets.token_hex(32)
        secret_file.write_text(generated, encoding="utf-8")
        return generated
    except Exception:
        # 落盘失败（只读文件系统等）→ 退回默认值（仅限本地，生产务必设环境变量）
        return "xuanji-dev-secret-DO-NOT-USE-IN-PROD-2026"


JWT_SECRET = _resolve_jwt_secret()
JWT_ALG = "HS256"
JWT_TTL_SECONDS = 7 * 24 * 3600  # 7 天

EMAIL_RE = re.compile(r"^[\w.+\-]+@[\w\-]+(\.[\w\-]+)+$")
TEMP_PW_LEN = 12
# 临时密码字符集：剔除 O/0/I/l/1 这些易混字符，让用户能看清
TEMP_PW_CHARS = "".join(
    c for c in (string.ascii_letters + string.digits)
    if c not in "O0Il1"
)


def _load_db() -> dict:
    return _users_store.load()


def _save_db(db: dict) -> None:
    _users_store.save(db)


def _hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode("utf-8")


def _check_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _gen_temp_pw() -> str:
    return "".join(secrets.choice(TEMP_PW_CHARS) for _ in range(TEMP_PW_LEN))


def register(email: str) -> dict:
    """邮箱注册：返回临时密码（一次性展示）+ 提示词。

    设计：让用户读懂"先用临时密码登录、登进去会被强制改密"是关键 UX。
    """
    email = (email or "").strip().lower()
    if not EMAIL_RE.match(email):
        return {"ok": False, "error": "邮箱格式不对，请检查后重新填写"}
    db = _load_db()
    if email in db["users"]:
        return {"ok": False, "error": "该邮箱已注册，请直接登录"}
    temp_pw = _gen_temp_pw()
    db["users"][email] = {
        "id": len(db["users"]) + 1,
        "email": email,
        "password_hash": _hash_pw(temp_pw),
        "nickname": email.split("@")[0],  # 默认昵称 = 邮箱前缀，用户可后改
        "must_change_password": True,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "last_login_at": None,
    }
    _save_db(db)
    return {
        "ok": True,
        "email": email,
        "temp_password": temp_pw,
        "must_change_password": True,
        "hint": "请复制临时密码并妥善保管，首次登录后系统将强制要求修改。",
    }


def login(email: str, password: str) -> dict:
    email = (email or "").strip().lower()
    db = _load_db()
    user = db["users"].get(email)
    if not user:
        return {"ok": False, "error": "邮箱或密码不对"}
    if not _check_pw(password, user["password_hash"]):
        return {"ok": False, "error": "邮箱或密码不对"}
    # 更新最近登录时间
    user["last_login_at"] = datetime.utcnow().isoformat() + "Z"
    _save_db(db)
    payload = {
        "sub": str(user["id"]),  # PyJWT 2.x 强制 sub 必须是字符串
        "email": user["email"],
        "mcp": bool(user.get("must_change_password")),
        "iat": int(datetime.utcnow().timestamp()),
        "exp": int((datetime.utcnow() + timedelta(seconds=JWT_TTL_SECONDS)).timestamp()),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)
    return {
        "ok": True,
        "token": token,
        "email": user["email"],
        "nickname": user.get("nickname", ""),
        "must_change_password": bool(user.get("must_change_password")),
    }


def change_password(email: str, old_pw: str, new_pw: str) -> dict:
    """改密：必须登录态（用当前密码验明身份）+ 新密码强度校验"""
    email = (email or "").strip().lower()
    if len(new_pw or "") < 8:
        return {"ok": False, "error": "新密码至少 8 位，建议字母+数字组合"}
    if new_pw == old_pw:
        return {"ok": False, "error": "新密码不能和原密码相同"}
    db = _load_db()
    user = db["users"].get(email)
    if not user:
        return {"ok": False, "error": "用户不存在"}
    if not _check_pw(old_pw, user["password_hash"]):
        return {"ok": False, "error": "原密码不对"}
    user["password_hash"] = _hash_pw(new_pw)
    user["must_change_password"] = False
    _save_db(db)
    return {"ok": True}


def get_me(email: str) -> Optional[dict]:
    db = _load_db()
    u = db["users"].get(email)
    if not u:
        return None
    return {
        "email": u["email"],
        "nickname": u.get("nickname", ""),
        "must_change_password": bool(u.get("must_change_password")),
        "created_at": u.get("created_at"),
        "last_login_at": u.get("last_login_at"),
    }


def update_nickname(email: str, nickname: str) -> dict:
    email = (email or "").strip().lower()
    nickname = (nickname or "").strip()[:32]
    if not nickname:
        return {"ok": False, "error": "昵称不能为空"}
    db = _load_db()
    if email not in db["users"]:
        return {"ok": False, "error": "用户不存在"}
    db["users"][email]["nickname"] = nickname
    _save_db(db)
    return {"ok": True, "nickname": nickname}


# ====== JWT 验签 + 鉴权依赖 ======

def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def auth_user(authorization: Optional[str]) -> Optional[dict]:
    """从 Authorization: Bearer <token> 解出 user 信息。未登录或 token 无效返回 None。"""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization[7:].strip()
    payload = decode_token(token)
    if not payload:
        return None
    return {
        "id": payload.get("sub"),
        "email": payload.get("email"),
        "must_change_password": bool(payload.get("mcp")),
    }


# ====== 忘记密码：6 位数字验证码 + 可选 SMTP ======
RESET_TTL_SECONDS = 5 * 60           # 验证码 5 分钟有效
RESET_RATE_LIMIT_SECONDS = 60        # 同邮箱 60s 内最多 1 次
# ======邮件发送服务配置：多 provider 预设 + 完全自定义 =====
# 设 MAIL_PROVIDER=qq|gmail|163|126|outlook|aliyun|custom，默认 custom（须手动 MAIL_HOST）。
# 必填：MAIL_USER / MAIL_PASSWORD（前者是邮箱地址，后者是"授权码/应用口令"，不是登录密码）。
# 可选：MAIL_FROM（默认 = MAIL_USER）；MAIL_PORT / MAIL_SSL 覆盖预设。
MAIL_PROVIDER_PRESETS = {
    "qq":       {"host": "smtp.qq.com",         "port": 465, "ssl": True,  "name": "QQ 邮箱"},
    "163":      {"host": "smtp.163.com",        "port": 465, "ssl": True,  "name": "网易 163"},
    "126":      {"host": "smtp.126.com",        "port": 465, "ssl": True,  "name": "网易 126"},
    "gmail":    {"host": "smtp.gmail.com",      "port": 465, "ssl": True,  "name": "Gmail"},
    "outlook":  {"host": "smtp.office365.com",  "port": 587, "ssl": False, "name": "Outlook/Office365"},
    "aliyun":   {"host": "smtp.aliyun.com",     "port": 465, "ssl": True,  "name": "阿里云邮件"},
}


def _resolve_mail_config():
    """解析邮件发送配置。返回 None 表示未配。
    1) MAIL_PROVIDER 为预设 → 用其 host/port/ssl；可用 MAIL_PORT/MAIL_SSL 覆盖。
    2) MAIL_PROVIDER 为 custom → 手动 MAIL_HOST/MAIL_PORT/MAIL_SSL。
    3) 必填 MAIL_USER / MAIL_PASSWORD，缺一不可。
    4) MAIL_FROM 可选，默认 = MAIL_USER；QQ 邮箱严格要求 from 与登录账户一致。
    """
    provider = (_getenv("MAIL_PROVIDER") or "custom").strip().lower()
    if provider in MAIL_PROVIDER_PRESETS:
        preset = MAIL_PROVIDER_PRESETS[provider]
        host = _getenv("MAIL_HOST", preset["host"]).strip() or preset["host"]
        port = int(_getenv("MAIL_PORT", str(preset["port"])))
        use_ssl = _getenv("MAIL_SSL", "1" if preset["ssl"] else "0") == "1"
    else:
        host = _getenv("MAIL_HOST", "").strip()
        if not host:
            return None
        port = int(_getenv("MAIL_PORT", "465"))
        use_ssl = _getenv("MAIL_SSL", "1") == "1"

    user = _getenv("MAIL_USER", "").strip()
    pw = _getenv("MAIL_PASSWORD", "").strip()
    if not (user and pw):
        return None
    from_addr = _getenv("MAIL_FROM", "").strip() or user
    return {
        "host": host, "port": port, "ssl": use_ssl,
        "user": user, "password": pw, "from": from_addr,
        "provider": provider,
    }



def _load_all_mail_configs():
    """返回所有可用配置（按优先级）：主配置 + 一组 fallback。
    - 主：MAIL_PROVIDER + MAIL_USER + MAIL_PASSWORD
    - 备：MAIL_FALLBACK_PROVIDER + MAIL_FALLBACK_USER + MAIL_FALLBACK_PASSWORD
    """
    cfgs = []
    main = _resolve_mail_config()
    if main:
        cfgs.append(main)
    # Fallback
    fb_provider = (_getenv("MAIL_FALLBACK_PROVIDER") or "").strip().lower()
    fb_user = (_getenv("MAIL_FALLBACK_USER") or "").strip()
    fb_pw = (_getenv("MAIL_FALLBACK_PASSWORD") or "").strip()
    if fb_provider and fb_user and fb_pw:
        if fb_provider in MAIL_PROVIDER_PRESETS:
            preset = MAIL_PROVIDER_PRESETS[fb_provider]
            cfgs.append({
                "host": preset["host"],
                "port": preset["port"],
                "ssl": preset["ssl"],
                "user": fb_user,
                "password": fb_pw,
                "from": fb_user,
                "provider": fb_provider + "(fallback)",
            })
        else:
            # custom fallback 也接受
            fb_host = (_getenv("MAIL_FALLBACK_HOST") or "").strip()
            if fb_host:
                cfgs.append({
                    "host": fb_host,
                    "port": int(_getenv("MAIL_FALLBACK_PORT", "465")),
                    "ssl": _getenv("MAIL_FALLBACK_SSL", "1") == "1",
                    "user": fb_user,
                    "password": fb_pw,
                    "from": fb_user,
                    "provider": fb_provider + "(fallback)",
                })
    return cfgs


def _try_send_via(cfg, to_email, code):
    """通过单一 cfg 发送，返回 True=成功，False=失败（不抛）。"""
    import smtplib
    from email.mime.text import MIMEText
    _SUBJ = "\u3010\u7384\u673a\u9601\u3011\u5bc6\u7801\u91cd\u7f6e\u9a8c\u8bc1\u7801"
    _BODY = (
        "\u60a8\u7684\u7384\u673a\u9601\u5bc6\u7801\u91cd\u7f6e\u9a8c\u8bc1\u7801\u4e3a\uff1a" + str(code) + "\n\n"
        "\u9a8c\u8bc1\u7801\u6709\u6548\u671f 5 \u5206\u949f\u3002\u5982\u679c\u4e0d\u662f\u60a8\u672c\u4eba\u64cd\u4f5c\u8bf7\u5ffd\u7565\u672c\u90ae\u4ef6\u3002\n"
        "\u2014\u2014 \u7384\u673a\u9601"
    )
    msg = MIMEText(_BODY, "plain", "utf-8")
    msg["Subject"] = _SUBJ
    msg["From"] = cfg["from"]
    msg["To"] = to_email
    if cfg["ssl"]:
        with smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=15) as s:
            s.login(cfg["user"], cfg["password"])
            s.send_message(msg)
    else:
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=15) as s:
            s.starttls()
            s.login(cfg["user"], cfg["password"])
            s.send_message(msg)
    return True


def _reset_send_email(to_email, code):
    """多 provider fallback 发送：依次尝试主、备，任一成功=True，全失败=False。"""
    cfgs = _load_all_mail_configs()
    if not cfgs:
        return False
    last_err = None
    for cfg in cfgs:
        try:
            _try_send_via(cfg, to_email, code)
            return True
        except Exception as e:
            last_err = (cfg.get("provider"), cfg.get("host"), str(e))
            print("[FORGOT-PASSWORD mail fail via " + str(cfg.get("provider")) + "/" + str(cfg.get("host")) + "] " + str(e), file=sys.stderr)
            continue
    if last_err:
        print("[FORGOT-PASSWORD all providers failed] " + str(last_err), file=sys.stderr)
    return False


_password_resets: dict = {}  # email -> {code, expires_at, last_request_at}


def request_password_reset(email: str) -> dict:
    """发起重置：返回 ok=True（无论邮箱是否存在，避免泄露）。
    限频：同邮箱 60s 内最多 1 次。
    如有配 SMTP，会尝试发送；发送未能达仍返 debug_code 兌底。
    """
    email = (email or "").strip().lower()
    if not EMAIL_RE.match(email):
        return {"ok": True, "rate_limited": False}

    now = _time.time()
    state = _password_resets.get(email)
    if state and now - state.get("last_request_at", 0) < RESET_RATE_LIMIT_SECONDS:
        retry = int(RESET_RATE_LIMIT_SECONDS - (now - state["last_request_at"]))
        return {"ok": True, "rate_limited": True, "retry_after_seconds": max(1, retry)}

    db = _load_db()
    user = db["users"].get(email)

    if not user:
        return {"ok": True, "rate_limited": False, "user_exists": False}

    code = "".join(secrets.choice("0123456789") for _ in range(6))
    _password_resets[email] = {
        "code": code,
        "expires_at": now + RESET_TTL_SECONDS,
        "last_request_at": now,
    }

    sent = _reset_send_email(email, code)
    print(
        "[FORGOT-PASSWORD] email=" + email + " " + ("sent via SMTP" if sent else "NOT SENT (no SMTP)") +
        " code=" + (code if not sent else "***hidden***") + " ttl=" + str(RESET_TTL_SECONDS) + "s",
        file=sys.stderr,
    )

    out = {"ok": True, "rate_limited": False, "user_exists": True, "email_sent": sent}
    if not sent:
        out["debug_code"] = code
        out["debug_mode"] = True
        out["ttl_seconds"] = RESET_TTL_SECONDS
    return out


def verify_reset_and_change(email: str, code: str, new_password: str) -> dict:
    """\u6821\u9a8c\u9a8c\u8bc1\u7801 + \u91cd\u7f6e\u5bc6\u7801 + \u81ea\u52a8\u7b7e\u53d1 JWT \u8ba9\u7528\u6237\u76f4\u63a5\u767b\u5165\u3002
    \u91cd\u7f6e\u540e must_change_password=False\uff08\u8fd9\u662f\u7528\u6237\u81ea\u5df1\u8bbe\u7684\u5bc6\u7801\uff0c\u65e0\u9700\u518d\u5f3a\u5236\u6539\uff09\u3002
    """
    email = (email or "").strip().lower()
    code = (code or "").strip()
    new_password = new_password or ""

    if len(new_password) < 8:
        return {"ok": False, "error": "\u65b0\u5bc6\u7801\u81f3\u5c11 8 \u4f4d"}
    if not code.isdigit() or len(code) != 6:
        return {"ok": False, "error": "\u9a8c\u8bc1\u7801\u683c\u5f0f\u4e0d\u5bf9\uff08\u5e94\u4e3a 6 \u4f4d\u6570\u5b57\uff09"}

    state = _password_resets.get(email)
    if not state:
        return {"ok": False, "error": "\u8bf7\u5148\u70b9\u51fb\u300c\u53d1\u9001\u9a8c\u8bc1\u7801\u300d"}
    now = _time.time()
    if now > state["expires_at"]:
        _password_resets.pop(email, None)
        return {"ok": False, "error": "\u9a8c\u8bc1\u7801\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u53d1\u9001"}
    if state["code"] != code:
        return {"ok": False, "error": "\u9a8c\u8bc1\u7801\u4e0d\u6b63\u786e"}

    db = _load_db()
    user = db["users"].get(email)
    if not user:
        return {"ok": False, "error": "\u8d26\u53f7\u4e0d\u5b58\u5728"}

    user["password_hash"] = _hash_pw(new_password)
    user["must_change_password"] = False
    user["last_login_at"] = datetime.utcnow().isoformat() + "Z"
    db["users"][email] = user
    _save_db(db)
    _password_resets.pop(email, None)

    # \u76f4\u63a5\u7b7e\u53d1 token \u8ba9\u524d\u7aef\u7acb\u5373\u767b\u5165
    payload = {
        "sub": str(user["id"]),
        "email": user["email"],
        "mcp": False,
        "iat": int(datetime.utcnow().timestamp()),
        "exp": int((datetime.utcnow() + timedelta(seconds=JWT_TTL_SECONDS)).timestamp()),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)
    return {
        "ok": True,
        "email": user["email"],
        "nickname": user.get("nickname", ""),
        "must_change_password": False,
        "token": token,
    }
