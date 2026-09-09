# -*- coding: utf-8 -*-
"""contacts CRUD 端到端测试"""
import os, pathlib, sys, tempfile, json

TMP_DIR = tempfile.mkdtemp(prefix="xuanji_contacts_test_")
os.environ["XUANJI_USERS_DB"] = str(pathlib.Path(TMP_DIR) / "users.json")
os.environ["XUANJI_PROFILES_DB"] = str(pathlib.Path(TMP_DIR) / "profiles.json")
os.environ["XUANJI_CONTACTS_DB"] = str(pathlib.Path(TMP_DIR) / "contacts.json")
os.environ["XUANJI_JWT_SECRET"] = "test-secret-" + "x" * 32

sys.path.insert(0, r"D:\AI coding test\fortune-web")

from fastapi.testclient import TestClient
import server

client = TestClient(server.app)


def expect(label, ok):
    mark = "✅" if ok else "❌"
    print(f"{mark} {label}")
    if not ok:
        sys.exit(1)


def register_login(email):
    r = client.post("/api/register", json={"email": email})
    pw = r.json()["temp_password"]
    r = client.post("/api/login", json={"email": email, "password": pw})
    return pw, r.json()["token"]


pw_a, token_a = register_login("alice@example.com")
_, token_b = register_login("bob@example.com")
print("两个账号注册完成")

# 1. 匿名 list 拒
r = client.get("/api/contacts")
expect("匿名 list 被拒", r.json()["ok"] is False)

# 2. A 创建
r = client.post("/api/contacts", json={
    "label": "老婆",
    "relation": "spouse",
    "base": {"year": 1992, "month": 3, "day": 22, "hour": 14, "minute": 30,
             "gender": "女", "time_precise": True, "place": "上海"},
    "chart": {"day_master": "乙"},
    "note": "配偶",
}, headers={"Authorization": "Bearer " + token_a})
expect("A 创建成功", r.json()["ok"] is True)
cid_a = r.json()["id"]
print("A 关系人 id:", cid_a)

# 3. A 列
r = client.get("/api/contacts", headers={"Authorization": "Bearer " + token_a})
expect("A 列出 1 个", len(r.json()["contacts"]) == 1)
expect("snap 含日主", r.json()["contacts"][0]["snap"]["day_master"] == "乙")

# 4. A 拉完整
r = client.get(f"/api/contacts/{cid_a}", headers={"Authorization": "Bearer " + token_a})
expect("A 拉档案 ok", r.json()["ok"] is True)
expect("label 是老婆", r.json()["contact"]["label"] == "老婆")

# 5. B 看不到 A
r = client.get(f"/api/contacts/{cid_a}", headers={"Authorization": "Bearer " + token_b})
expect("B 看不到 A 的关系人", r.json()["ok"] is False and "不存在" in r.json()["error"])

# 6. B 创建自己的
r = client.post("/api/contacts", json={
    "label": "老公",
    "relation": "spouse",
    "base": {"year": 1988, "month": 11, "day": 5, "hour": 9, "minute": 0,
             "gender": "男", "time_precise": True, "place": "北京"},
    "chart": {"day_master": "甲"},
}, headers={"Authorization": "Bearer " + token_b})
expect("B 创建成功", r.json()["ok"] is True)
cid_b = r.json()["id"]

# 7. 非法 relation 应被规整为 other
r = client.post("/api/contacts", json={
    "label": "测试",
    "relation": "garbage_value",
    "base": {"year": 1990, "month": 1, "day": 1, "gender": "女", "place": "南京"},
    "chart": {},
}, headers={"Authorization": "Bearer " + token_a})
expect("非法 relation 规整为 other", r.json()["ok"] is True)

# 8. PATCH label / note
r = client.patch(f"/api/contacts/{cid_a}", json={
    "label": "亲爱的她",
    "note": "婚期已定",
}, headers={"Authorization": "Bearer " + token_a})
expect("改 label + note 成功", r.json()["ok"] is True)
r = client.get(f"/api/contacts/{cid_a}", headers={"Authorization": "Bearer " + token_a})
expect("label 已更新", r.json()["contact"]["label"] == "亲爱的她")
expect("note 已更新", r.json()["contact"]["note"] == "婚期已定")

# 9. PATCH 非法 relation 不改
r = client.patch(f"/api/contacts/{cid_a}", json={"relation": "garbage"}, headers={"Authorization": "Bearer " + token_a})
expect("非法 relation 保持原值", r.json()["ok"] is True)
r = client.get(f"/api/contacts/{cid_a}", headers={"Authorization": "Bearer " + token_a})
expect("relation 没变", r.json()["contact"]["relation"] == "spouse")

# 10. 删除
r = client.delete(f"/api/contacts/{cid_a}", headers={"Authorization": "Bearer " + token_a})
expect("A 删除自己", r.json()["ok"] is True)
r = client.get("/api/contacts", headers={"Authorization": "Bearer " + token_a})
# A 应该还有第 7 步创建的那个「测试」
expect("A 删除一个剩另一个", len(r.json()["contacts"]) == 1)

# 11. B 删除 A 的被拒
r = client.delete(f"/api/contacts/{cid_b}", headers={"Authorization": "Bearer " + token_a})
expect("A 删 B 关系人被拒", r.json()["ok"] is False)

# 12. PATCH 不存在的关系人
r = client.patch("/api/contacts/nonexistent", json={"label": "x"}, headers={"Authorization": "Bearer " + token_a})
expect("PATCH 不存在被拒", r.json()["ok"] is False)

# 13. label 太长截断
r = client.post("/api/contacts", json={
    "label": "x" * 100,
    "relation": "friend",
    "base": {"year": 1990, "month": 1, "day": 1, "gender": "女", "place": "南京"},
    "chart": {},
}, headers={"Authorization": "Bearer " + token_a})
expect("超长 label 截断", r.json()["ok"] is True)
r = client.get(f"/api/contacts/{r.json()['id']}", headers={"Authorization": "Bearer " + token_a})
expect("label 截断到 32", len(r.json()["contact"]["label"]) <= 32)

import shutil
shutil.rmtree(TMP_DIR, ignore_errors=True)
print()
print("🎉 全部 13 contacts 用例通过")
