# -*- coding: utf-8 -*-
"""多 SMTP provider 配置 + 邮件发送链路测试。
不真发邮件（不可能有自己的测试邮箱），用 unittest.mock 替代 smtplib。
"""
import os
import pathlib
import shutil
import sys
import tempfile
import unittest.mock as mock

# 隔离 DB
TMP_DIR = tempfile.mkdtemp(prefix="xj_prov_test_")
os.environ["XUANJI_USERS_DB"] = str(pathlib.Path(TMP_DIR) / "users.json")
os.environ["XUANJI_PROFILES_DB"] = str(pathlib.Path(TMP_DIR) / "profiles.json")
os.environ["XUANJI_CONTACTS_DB"] = str(pathlib.Path(TMP_DIR) / "contacts.json")
os.environ["XUANJI_JWT_SECRET"] = "x" * 32

sys.path.insert(0, r"D:\AI coding test\fortune-web")
import auth

PASSED = 0
FAILED = 0


def expect(label, cond, *extra):
    global PASSED, FAILED
    if cond:
        PASSED += 1
        print(f"  \u2705 {label}")
    else:
        FAILED += 1
        print(f"  \u274c {label}: {extra}")
        if extra:
            print(f"    extra: {[str(e)[:200] for e in extra]}")


def reset_env():
    for k in list(os.environ.keys()):
        if k.startswith("MAIL_"):
            del os.environ[k]


try:
    print("\n[1] _resolve_mail_config 各种场景")
    reset_env()
    expect("空配置 None", auth._resolve_mail_config() is None)

    os.environ.update({"MAIL_PROVIDER": "qq", "MAIL_USER": "x@qq.com", "MAIL_PASSWORD": "fake"})
    c = auth._resolve_mail_config()
    expect("QQ host/port/ssl", c["host"] == "smtp.qq.com" and c["port"] == 465 and c["ssl"] is True)
    expect("QQ provider 字段", c["provider"] == "qq")
    expect("QQ from 默认 = user", c["from"] == "x@qq.com")

    os.environ["MAIL_PROVIDER"] = "gmail"
    c = auth._resolve_mail_config()
    expect("Gmail host/ssl", c["host"] == "smtp.gmail.com" and c["ssl"] is True)

    os.environ["MAIL_PROVIDER"] = "163"
    c = auth._resolve_mail_config()
    expect("163 host", c["host"] == "smtp.163.com")

    os.environ["MAIL_PROVIDER"] = "126"
    c = auth._resolve_mail_config()
    expect("126 host", c["host"] == "smtp.126.com")

    os.environ["MAIL_PROVIDER"] = "outlook"
    c = auth._resolve_mail_config()
    expect("Outlook host/no-ssl/587", c["host"] == "smtp.office365.com" and c["ssl"] is False and c["port"] == 587)

    os.environ["MAIL_PROVIDER"] = "aliyun"
    c = auth._resolve_mail_config()
    expect("Aliyun host", c["host"] == "smtp.aliyun.com")

    os.environ["MAIL_PROVIDER"] = "custom"
    os.environ["MAIL_HOST"] = "mail.private.example.com"
    c = auth._resolve_mail_config()
    expect("custom 用 MAIL_HOST", c["host"] == "mail.private.example.com" and c["provider"] == "custom")

    # MAIL_PORT override
    os.environ["MAIL_PROVIDER"] = "qq"
    os.environ["MAIL_PORT"] = "587"
    c = auth._resolve_mail_config()
    expect("port override", c["port"] == 587)

    # MAIL_SSL override
    os.environ["MAIL_SSL"] = "0"
    c = auth._resolve_mail_config()
    expect("SSL override off", c["ssl"] is False)

    # 缺 user
    del os.environ["MAIL_USER"]
    expect("缺 user → None", auth._resolve_mail_config() is None)

    # 缺 password
    os.environ["MAIL_USER"] = "x@qq.com"
    del os.environ["MAIL_PASSWORD"]
    expect("缺 password → None", auth._resolve_mail_config() is None)

    print("\n[2] 配 SMTP 后再走流程：registered user 请求重置，发邮件链路被调")
    reset_env()
    os.environ.update({
        "MAIL_PROVIDER": "qq",
        "MAIL_USER": "me@qq.com",
        "MAIL_PASSWORD": "fake_auth_code",
    })

    auth._password_resets.clear()
    auth.register("real@user.com")

    # mock smtplib.SMTP_SSL - QQ 默认 465 + SSL
    with mock.patch("smtplib.SMTP_SSL") as m_ssl:
        conn = m_ssl.return_value.__enter__.return_value
        r = auth.request_password_reset("real@user.com")
        expect("请求 ok", r["ok"])
        expect("email_sent=True", r.get("email_sent") is True)
        expect("QQ 调用 SMTP_SSL", m_ssl.called)
        # QQ 默认 host/port/ssl
        args, kwargs = m_ssl.call_args
        expect("QQ host 实参", args[0] == "smtp.qq.com")
        expect("QQ port 实参", args[1] == 465)
        expect("QQ timeout 实参", kwargs.get("timeout") == 15)
        # login + send_message 被调
        expect("login 被调", conn.login.called)
        expect("send_message 被调", conn.send_message.called)
        # login 参数
        login_args, _ = conn.login.call_args
        expect("login user", login_args[0] == "me@qq.com")
        expect("login pw", login_args[1] == "fake_auth_code")
        # 邮件主题
        msg = conn.send_message.call_args[0][0]
        expect("邮件主题含密码重置", "密码重置" in str(msg["Subject"]))
        expect("邮件 from = 用户邮箱", "me@qq.com" in str(msg["From"]))

    print("\n[3] Gmail 走 SSL 链路")
    reset_env()
    os.environ.update({
        "MAIL_PROVIDER": "gmail",
        "MAIL_USER": "me@gmail.com",
        "MAIL_PASSWORD": "fake_app_pw",
    })
    auth._password_resets.clear()
    auth.register("user@gmail.com")
    with mock.patch("smtplib.SMTP_SSL") as m_ssl:
        r = auth.request_password_reset("user@gmail.com")
        args, _ = m_ssl.call_args
        expect("Gmail host", args[0] == "smtp.gmail.com")
        expect("Gmail port 465", args[1] == 465)
        expect("Gmail sent", r.get("email_sent") is True)

    print("\n[4] Outlook 走 TLS（无 SSL 明文）链路")
    reset_env()
    os.environ.update({
        "MAIL_PROVIDER": "outlook",
        "MAIL_USER": "me@outlook.com",
        "MAIL_PASSWORD": "fake_pw",
    })
    auth._password_resets.clear()
    auth.register("user@outlook.com")
    with mock.patch("smtplib.SMTP") as m_smtp:
        # 注意：Outlook 走 TLS 不走 SSL on connect → 进 else 分支（普通 SMTP+starttls）
        r = auth.request_password_reset("user@outlook.com")
        expect("Outlook 走 SMTP（不是 SMTP_SSL）", m_smtp.called)
        expect("Outlook starttls 被调", m_smtp.return_value.__enter__.return_value.starttls.called)
        expect("Outlook sent", r.get("email_sent") is True)

    print("\n[5] 真发失败时 → 返回 False，but 不抛异常")
    reset_env()
    os.environ.update({
        "MAIL_PROVIDER": "qq",
        "MAIL_USER": "fail@qq.com",
        "MAIL_PASSWORD": "bad_pw",
    })
    auth._password_resets.clear()
    auth.register("fail@user.com")
    with mock.patch("smtplib.SMTP_SSL", side_effect=Exception("auth failed")):
        r = auth.request_password_reset("fail@user.com")
        expect("auth 失败不抛", "True" in str(r["ok"]))
        expect("email_sent=False", r.get("email_sent") is False)
        expect("ratelimit not hit", r.get("rate_limited") is False)
        # 但 request_password_reset 仍然 ok（防探测）— 用户能继续
        expect("rate_limited=False", r.get("rate_limited") is False)
        # 设计意图：邮件失败时仍返 debug_code 兜底（防 SMTP 挂掉用户登不上）；
        # 同时 email_sent=False 让前端能识别真没发出。
        expect("邮件失败时 debug_code 兜底返", bool(r.get("debug_code")))
        expect("邮件失败时 email_sent=False", r.get("email_sent") is False)
        expect("兜底是 debug_mode=True", r.get("debug_mode") is True)

    print("\n[6] 未配 SMTP → 走原 debug_code 兜底")
    print("\n[7] Fallback 链路：主 (QQ 失败) → 备 (Gmail 成功)")
    reset_env()
    os.environ.update({
        "MAIL_PROVIDER": "qq",
        "MAIL_USER": "main@qq.com",
        "MAIL_PASSWORD": "wrong_pw",          # 主故意错 → 会失败
        "MAIL_FALLBACK_PROVIDER": "gmail",
        "MAIL_FALLBACK_USER": "backup@gmail.com",
        "MAIL_FALLBACK_PASSWORD": "valid_app_pw",  # 备用对的
    })
    auth._password_resets.clear()
    auth.register("fallback@user.com")

    # 主调 SMTP_SSL 抛、备用 SMTP_SSL 成功
    real_smtp_ssl = None
    def fake_ssl_factory(host, port, **kw):
        # 主（QQ）调 → 抛；Gmail 调 → 成功 mock
        if "qq.com" in host:
            raise Exception("Simulated QQ auth failure")
        m = mock.MagicMock()
        return m.__enter__.return_value
    with mock.patch("smtplib.SMTP_SSL", side_effect=fake_ssl_factory) as m_ssl:
        r = auth.request_password_reset("fallback@user.com")
        expect("请求 ok", r["ok"])
        expect("email_sent=True（Gmail 接手）", r.get("email_sent") is True)
        # 两次调用：主 + 备
        expect("SMTP_SSL 调过两次", m_ssl.call_count == 2)
        # 调用过 gmail
        called_hosts = [c.args[0] for c in m_ssl.call_args_list]
        expect("主被调（qq.com）", "smtp.qq.com" in called_hosts)
        expect("fallback 被调（gmail.com）", "smtp.gmail.com" in called_hosts)

    print("\n[8] Fallback 链路：主备都失败 → 返 debug_code 兜底")
    reset_env()
    os.environ.update({
        "MAIL_PROVIDER": "qq",
        "MAIL_USER": "main@qq.com",
        "MAIL_PASSWORD": "wrong1",
        "MAIL_FALLBACK_PROVIDER": "gmail",
        "MAIL_FALLBACK_USER": "backup@gmail.com",
        "MAIL_FALLBACK_PASSWORD": "wrong2",
    })
    auth._password_resets.clear()
    auth.register("allfail@user.com")
    with mock.patch("smtplib.SMTP_SSL", side_effect=Exception("both fail")):
        r = auth.request_password_reset("allfail@user.com")
        expect("仍 ok", r["ok"])
        expect("email_sent=False", r.get("email_sent") is False)
        expect("兜底 debug_code", bool(r.get("debug_code")))
        expect("debug_mode=True", r.get("debug_mode") is True)


    reset_env()
    auth._password_resets.clear()
    auth.register("debug@user.com")
    r = auth.request_password_reset("debug@user.com")
    expect("未配返 debug_code", r.get("debug_code") and len(r["debug_code"]) == 6)
    expect("debug_mode=True", r.get("debug_mode") is True)

finally:
    shutil.rmtree(TMP_DIR, ignore_errors=True)
    reset_env()

print(f"\n{'='*30}\n通过 {PASSED} / 失败 {FAILED}")
sys.exit(1 if FAILED else 0)
