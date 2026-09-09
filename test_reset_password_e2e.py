# -*- coding: utf-8 -*-
"""忘记密码 + 重置密码 端到端测试"""
import os
import pathlib
import shutil
import sys
import tempfile

# 隔离测试数据库
TMP_DIR = tempfile.mkdtemp(prefix="xj_reset_e2e_")
os.environ["XUANJI_USERS_DB"] = str(pathlib.Path(TMP_DIR) / "users.json")
os.environ["XUANJI_PROFILES_DB"] = str(pathlib.Path(TMP_DIR) / "profiles.json")
os.environ["XUANJI_CONTACTS_DB"] = str(pathlib.Path(TMP_DIR) / "contacts.json")
os.environ["XUANJI_JWT_SECRET"] = "x" * 32

sys.path.insert(0, r"D:\AI coding test\fortune-web")
from fastapi.testclient import TestClient
import server

client = TestClient(server.app)

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


def reg_login(email, pw=None):
    """注册 + 用给定的密码登录；如未指定 pw 用临时密码。"""
    r = client.post("/api/register", json={"email": email})
    expect(f"注册 {email}", r.status_code == 200 and r.json().get("ok"))
    temp_pw = r.json()["temp_password"]
    if pw is None:
        pw = temp_pw
    r2 = client.post("/api/login", json={"email": email, "password": pw})
    expect(f"登录 {email}", r2.json().get("ok"))
    return pw, r2.json().get("token"), temp_pw


try:
    print("\n[1] 基本重置流程：注册 → 忘记密码 → 重置 → 新密码登录")
    email = "alice@example.com"
    old_pw, old_token, old_temp_pw = reg_login(email)

    r = client.post("/api/forgot-password", json={"email": email})
    expect("forgot ok", r.json().get("ok"))
    expect("开发模式返 debug_code", "debug_code" in r.json())
    expect("限频字段有", "rate_limited" in r.json())
    expect("rate_limited 应为 False", r.json().get("rate_limited") is False)
    code = r.json()["debug_code"]
    expect("验证码是 6 位数", code.isdigit() and len(code) == 6, code)

    # 重置
    r = client.post("/api/reset-password", json={
        "email": email, "code": code, "new_password": "NewStrongPw789"
    })
    expect("reset ok", r.json().get("ok"))
    expect("返 token", "token" in r.json() and len(r.json()["token"]) > 50)
    expect("must_change_password=False（自己设的密码）", r.json().get("must_change_password") is False)

    # 用新密码登录
    r = client.post("/api/login", json={"email": email, "password": "NewStrongPw789"})
    expect("新密码可登录", r.json().get("ok"))
    expect("新密码登录必须改密=False", r.json().get("must_change_password") is False)

    # 旧密码失效
    r = client.post("/api/login", json={"email": email, "password": old_temp_pw})
    expect("旧临时密码失效", r.json().get("ok") is False)

    print("\n[2] 限频：60s 内重复请求")
    r1 = client.post("/api/forgot-password", json={"email": email})
    expect("首次 ok", r1.json().get("ok") and r1.json().get("rate_limited") is False)
    r2 = client.post("/api/forgot-password", json={"email": email})
    expect("立即第二次被限频", r2.json().get("rate_limited") is True)
    expect("返 retry_after_seconds", isinstance(r2.json().get("retry_after_seconds"), int))
    expect("retry 在 (0, 60]", 0 < r2.json().get("retry_after_seconds", 0) <= 60)

    print("\n[3] 验证码错误处理")
    # 重新申请以保证限频解除（这里用新邮箱防限频）
    email2 = "bob@example.com"
    reg_login(email2)
    r = client.post("/api/forgot-password", json={"email": email2})
    expect("email2 forgot ok", r.json().get("ok"))

    r = client.post("/api/reset-password", json={
        "email": email2, "code": "000000", "new_password": "NewPwStrong1234"
    })
    expect("错码拒", r.json().get("ok") is False)
    expect("错码错误信息", "验证码" in r.json().get("error", ""))

    # 不发码就重置
    r = client.post("/api/reset-password", json={
        "email": "charlie@example.com", "code": "123456", "new_password": "AnyPass12345678"
    })
    expect("从未申请过-拒", r.json().get("ok") is False)

    # 弱密码
    r = client.post("/api/reset-password", json={
        "email": email2, "code": "123456", "new_password": "short"
    })
    expect("密码太短拒", "at least 8" in str(r.json().get("error", "")) or "至少" in r.json().get("error", ""))

    # 验证码格式
    r = client.post("/api/reset-password", json={
        "email": email2, "code": "abc", "new_password": "ValidPass123456"
    })
    expect("非数字码拒", r.json().get("ok") is False)

    r = client.post("/api/reset-password", json={
        "email": email2, "code": "12345", "new_password": "ValidPass123456"
    })
    expect("5 位码拒", r.json().get("ok") is False)

    r = client.post("/api/reset-password", json={
        "email": email2, "code": "1234567", "new_password": "ValidPass123456"
    })
    expect("7 位码拒", r.json().get("ok") is False)

    print("\n[4] 不区分邮箱是否存在（防探测）")
    r = client.post("/api/forgot-password", json={"email": "ghost@nope.com"})
    expect("ghost ok=True", r.json().get("ok") is True)
    expect("ghost 不返 debug_code", "debug_code" not in r.json())
    expect("ghost 不返 user_exists=True", r.json().get("user_exists") is not True)

    # 邮箱格式不对也返 ok
    r = client.post("/api/forgot-password", json={"email": "not-an-email"})
    expect("邮箱格式错返 ok=True", r.json().get("ok") is True)

    print("\n[5] 重置后验证码失效（不能复用）")
    email3 = "diana@example.com"
    reg_login(email3)
    r = client.post("/api/forgot-password", json={"email": email3})
    code3 = r.json()["debug_code"]
    # 用掉
    r = client.post("/api/reset-password", json={
        "email": email3, "code": code3, "new_password": "PwdResetOnce333"
    })
    expect("首次用 OK", r.json().get("ok"))
    # 立即再试一次
    r = client.post("/api/reset-password", json={
        "email": email3, "code": code3, "new_password": "OtherPwd333333"
    })
    expect("第二次用同码拒", r.json().get("ok") is False)

    print("\n[6] 验证码过期（5 分钟 TTL）")
    email4 = "ed@example.com"
    reg_login(email4)
    r = client.post("/api/forgot-password", json={"email": email4})
    code4 = r.json()["debug_code"]

    # 手动过期该状态（用 monkeypatch：设 _password_resets[email4]['expires_at'] 为过去）
    import auth
    email4_norm = email4.strip().lower()
    if email4_norm in auth._password_resets:
        auth._password_resets[email4_norm]["expires_at"] = 0  # 1970 已过期

    r = client.post("/api/reset-password", json={
        "email": email4, "code": code4, "new_password": "PwdAfterExpiry333"
    })
    expect("过期码拒", r.json().get("ok") is False)
    expect("过期错误信息含 过期", "过期" in r.json().get("error", ""))

    print("\n[7] 重置后用新 JWT 调 /api/me 直接拿到账户")
    email5 = "fiona@example.com"
    reg_login(email5)
    r = client.post("/api/forgot-password", json={"email": email5})
    code5 = r.json()["debug_code"]
    r = client.post("/api/reset-password", json={
        "email": email5, "code": code5, "new_password": "NewJwtTestPw333"
    })
    new_token = r.json()["token"]
    r = client.get("/api/me", headers={"Authorization": "Bearer " + new_token})
    expect("用新 token 调 /api/me 成功", r.json().get("ok"))
    expect("/api/me 返回 email5", r.json().get("email") == email5)
    expect("must_change_password=False", r.json().get("must_change_password") is False)

    print("\n[8] 主功能匿名访问仍正常（回归）")
    r = client.post("/api/bazi", json={
        "year": 1990, "month": 5, "day": 15,
        "hour": 12, "minute": 0, "gender": "男",
        "time_precise": True, "place": "上海"
    })
    expect("匿名调 /api/bazi 200", r.status_code == 200)

finally:
    shutil.rmtree(TMP_DIR, ignore_errors=True)

print(f"\n{'='*30}\n通过 {PASSED} / 失败 {FAILED}")
sys.exit(1 if FAILED else 0)
