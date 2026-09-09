import json, os, urllib.request

def load_env():
    env = {}
    with open(os.path.join(os.path.dirname(__file__), ".env"), encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if "=" in line:
                k, v = line.split("=", 1)
                env[k] = v
    return env

env = load_env()
key = env["ZHIPU_API_KEY"]

for model in ["glm-4.7-flash", "glm-4-flash", "glm-4.5-flash"]:
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": "回复两个字：连通"}],
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + key},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read().decode("utf-8"))
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            print(f"{model}: OK -> {content!r}")
    except urllib.error.HTTPError as e:
        print(f"{model}: HTTP {e.code} -> {e.read().decode('utf-8')[:200]}")
    except Exception as e:
        print(f"{model}: FAIL -> {e}")
