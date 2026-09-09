# -*- coding: utf-8 -*-
"""端到端集成测试：注册 → 登录 → 强制改密 → 普通访问 me"""
import json
import os
import sys
import tempfile
import pathlib

# 隔离 DB 和 secret
TMP_DIR = tempfile.mkdtemp(prefix="xuanji_test_")
os.environ["XUANJI_USERS_DB"] = str(pathlib.Path(TMP_DIR) / "users.json")
os.environ["XUANJI_JWT_SECRET"] = "integration-test-secret-" + "x" * 32

sys.path.insert(0, r"D:\AI coding test\fortune-web")

from fastapi.testclient import TestClient
import server

client = TestClient(server.app)

def expect(label, ok):
    mark = "✅" if ok else "❌"
    print(f"{mark} {label}")
    if not ok:
        sys.exit(1)

# 1. 注册
r = client.post("/api/register", json={"email": "alice@example.com"})
print("注册:", r.json())
expect("注册成功", r.json()["ok"] is True)
expect("拿到临时密码", "temp_password" in r.json() and len(r.json()["temp_password"]) >= 8)
temp_pw = r.json()["temp_password"]

# 2. 重复注册应被拒
r2 = client.post("/api/register", json={"email": "alice@example.com"})
expect("重复注册被拒", r2.json()["ok"] is False and "已注册" in r2.json()["error"])

# 3. 注册时邮箱格式无效
r3 = client.post("/api/register", json={"email": "not-an-email"})
expect("格式无效被拒", r3.json()["ok"] is False)

# 4. 用临时密码登录
r = client.post("/api/login", json={"email": "alice@example.com", "password": temp_pw})
login1 = r.json()
expect("登录成功", login1["ok"] is True)
expect("首次登录 must_change=true", login1["must_change_password"] is True)
expect("拿到 token", "token" in login1 and len(login1["token"]) > 50)
token1 = login1["token"]

# 5. 密码错误
r = client.post("/api/login", json={"email": "alice@example.com", "password": "wrongpw"})
expect("密码错被拒", r.json()["ok"] is False)

# 6. /api/me 用 token
r = client.get("/api/me", headers={"Authorization": "Bearer " + token1})
me = r.json()
expect("me 返回 ok", me["ok"] is True)
expect("me 邮箱对", me["email"] == "alice@example.com")

# 7. /api/me 无 token
r = client.get("/api/me")
expect("无 token 报错", r.json()["ok"] is False)

# 8. /api/me 错 token
r = client.get("/api/me", headers={"Authorization": "Bearer bogus"})
expect("错 token 报错", r.json()["ok"] is False)

# 9. 改密
r = client.post("/api/change-password",
                json={"old_password": temp_pw, "new_password": "NewSecurePw123"},
                headers={"Authorization": "Bearer " + token1})
expect("改密成功", r.json()["ok"] is True)

# 10. 新密码登录（must_change=false）
r = client.post("/api/login", json={"email": "alice@example.com", "password": "NewSecurePw123"})
login2 = r.json()
expect("新密码登录成功", login2["ok"] is True)
expect("改密后 must_change=false", login2["must_change_password"] is False)
token2 = login2["token"]
print("新 token 长度:", len(token2))

# 11. me 用新 token 拿到昵称
r = client.get("/api/me", headers={"Authorization": "Bearer " + token2})
me2 = r.json()
expect("me 改昵称成功", me2["ok"] is True)

# 12. 改密不能用旧密码
r = client.post("/api/change-password",
                json={"old_password": "wrong-old", "new_password": "AnotherPw123"},
                headers={"Authorization": "Bearer " + token2})
expect("旧密码错被拒", r.json()["ok"] is False)

# 13. 新密码强度太短
r = client.post("/api/change-password",
                json={"old_password": "NewSecurePw123", "new_password": "123"},
                headers={"Authorization": "Bearer " + token2})
expect("短密码被拒", r.json()["ok"] is False)

# 14. 改密必须登录
r = client.post("/api/change-password",
                json={"old_password": "NewSecurePw123", "new_password": "AnotherPw123"})
expect("未登录改密被拒", r.json()["ok"] is False)

# 15. 主功能（/api/bazi）保持可匿名访问
r = client.post("/api/bazi", json={
    "year": 1990, "month": 8, "day": 15, "hour": 12, "minute": 0,
    "gender": "男", "time_precise": True, "place": "杭州"
})
print("/api/bazi 匿名访问:", "ok" if r.json().get("ok") else r.json())
expect("匿名访问主功能不受影响", r.json().get("ok") is True)

# 清理
import shutil
shutil.rmtree(TMP_DIR, ignore_errors=True)

print()
print("🎉 全部 15 用例通过")
