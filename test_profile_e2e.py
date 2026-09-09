# -*- coding: utf-8 -*-
"""profile CRUD 端到端测试"""
import json
import os
import pathlib
import sys
import tempfile

TMP_DIR = tempfile.mkdtemp(prefix="xuanji_profile_test_")
os.environ["XUANJI_USERS_DB"] = str(pathlib.Path(TMP_DIR) / "users.json")
os.environ["XUANJI_PROFILES_DB"] = str(pathlib.Path(TMP_DIR) / "profiles.json")
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


def register_and_login(email, password=None):
    r = client.post("/api/register", json={"email": email})
    assert r.json()["ok"], r.json()
    pw = password or r.json()["temp_password"]
    r = client.post("/api/login", json={"email": email, "password": pw})
    assert r.json()["ok"], r.json()
    return pw, r.json()["token"]


# 用户 A
pw_a, token_a = register_and_login("alice@example.com")
# 用户 B
pw_b, token_b = register_and_login("bob@example.com")

print("建立两个账号用于隔离测试")

# 1. 匿名访问 list 应被拒
r = client.get("/api/profiles")
expect("匿名 list 被拒", r.json()["ok"] is False)

# 2. 带 token 的 A 创建档案
r = client.post("/api/profiles", json={
    "label": "我自己",
    "relation": "self",
    "base": {"year": 1990, "month": 8, "day": 15, "hour": 12, "minute": 0,
             "gender": "男", "time_precise": True, "place": "杭州"},
    "chart": {"day_master": "甲", "pillars": {}},
    "modes": ["bazi"],
    "history": {"bazi": [{"role": "user", "content": "开始"}]},
}, headers={"Authorization": "Bearer " + token_a})
expect("创建档案成功", r.json()["ok"] is True)
pid_a1 = r.json()["id"]
print("A 档案 id:", pid_a1)

# 3. A 列档案
r = client.get("/api/profiles", headers={"Authorization": "Bearer " + token_a})
expect("A 列出 1 个档案", len(r.json()["profiles"]) == 1)
expect("档案有 snapshot.day_master", r.json()["profiles"][0]["snapshot"].get("day_master") == "甲")

# 4. A 拉档案完整
r = client.get(f"/api/profiles/{pid_a1}", headers={"Authorization": "Bearer " + token_a})
expect("A 拉档案 ok", r.json()["ok"] is True)
expect("chart 完整", r.json()["profile"]["chart"]["day_master"] == "甲")
expect("history 含初条", len(r.json()["profile"]["history"]["bazi"]) == 1)

# 5. B 看不到 A 的档案（隔离）
r = client.get(f"/api/profiles/{pid_a1}", headers={"Authorization": "Bearer " + token_b})
expect("B 看不到 A 档案", r.json()["ok"] is False and "不存在" in r.json()["error"])

# 6. B 自己创建一份
r = client.post("/api/profiles", json={
    "label": "我自己",
    "relation": "self",
    "base": {"year": 1995, "month": 3, "day": 22, "hour": 8, "minute": 30,
             "gender": "女", "time_precise": True, "place": "上海"},
    "chart": {"day_master": "乙"},
    "modes": ["combo"],
}, headers={"Authorization": "Bearer " + token_b})
expect("B 创建成功", r.json()["ok"] is True)
pid_b1 = r.json()["id"]

# 7. B 列档案只看自己
r = client.get("/api/profiles", headers={"Authorization": "Bearer " + token_b})
expect("B 列 1 个档案", len(r.json()["profiles"]) == 1)
expect("B 档案是自己的（不是 A 的）", r.json()["profiles"][0]["id"] == pid_b1)

# 8. A 同步 history（增加一条）
r = client.patch(f"/api/profiles/{pid_a1}/history", json={
    "mode": "bazi",
    "messages": [
        {"role": "user", "content": "开始"},
        {"role": "assistant", "content": "你的日主是甲木..."},
        {"role": "user", "content": "我想看事业"},
    ],
}, headers={"Authorization": "Bearer " + token_a})
expect("同步 history 成功", r.json()["ok"] is True)

# 9. A 拉档案确认历史增长
r = client.get(f"/api/profiles/{pid_a1}", headers={"Authorization": "Bearer " + token_a})
expect("history 增至 3 条", len(r.json()["profile"]["history"]["bazi"]) == 3)
expect("modes 含 bazi", "bazi" in r.json()["profile"]["modes"])

# 10. PATCH 标签 / 关系
r = client.patch(f"/api/profiles/{pid_a1}", json={
    "label": "我的本命",
    "relation": "self",
}, headers={"Authorization": "Bearer " + token_a})
expect("改 label 成功", r.json()["ok"] is True)
r = client.get("/api/profiles", headers={"Authorization": "Bearer " + token_a})
expect("label 已更新", r.json()["profiles"][0]["label"] == "我的本命")

# 11. PATCH 错模式
r = client.patch(f"/api/profiles/{pid_a1}/history", json={
    "mode": "xxx", "messages": []
}, headers={"Authorization": "Bearer " + token_a})
expect("错模式被拒", r.json()["ok"] is False)

# 12. 同步超长 history 应被截断
huge = [{"role": "user", "content": "a" * 5000} for _ in range(300)]
r = client.patch(f"/api/profiles/{pid_a1}/history", json={
    "mode": "combo", "messages": huge
}, headers={"Authorization": "Bearer " + token_a})
expect("超长 history 同步成功（被截断）", r.json()["ok"] is True)
r = client.get(f"/api/profiles/{pid_a1}", headers={"Authorization": "Bearer " + token_a})
combo_size = len(r.json()["profile"]["history"]["combo"])
print(f"combo history 实际写入 {combo_size} 条")
expect("history ≤ MAX_HISTORY_LEN", combo_size <= 200)
expect("单条 content ≤ MAX_CONTENT_LEN", all(len(m["content"]) <= 3000 for m in r.json()["profile"]["history"]["combo"]))

# 13. 删除
r = client.delete(f"/api/profiles/{pid_a1}", headers={"Authorization": "Bearer " + token_a})
expect("A 删自己档案", r.json()["ok"] is True)
r = client.get("/api/profiles", headers={"Authorization": "Bearer " + token_a})
expect("A 现在 0 个档案", len(r.json()["profiles"]) == 0)

# 14. B 删 A 的档案应被拒（隔离）
r = client.delete(f"/api/profiles/{pid_b1}", headers={"Authorization": "Bearer " + token_a})
expect("A 删 B 档案被拒", r.json()["ok"] is False)

# 清理
import shutil
shutil.rmtree(TMP_DIR, ignore_errors=True)

print()
print("🎉 全部 14 profile 用例通过")
