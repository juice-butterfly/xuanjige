# 玄机阁 · 中西合参命理

中式八字 + 西式印占 + 中西合参，一站式命理娱乐体验。所有解读仅供参考娱乐。

## 技术栈

- 后端：FastAPI + uvicorn（Python）
- 排盘：中式八字用 `lunar_python`（纯本地计算）；西式印占用 `PyJHora + pysweph`（瑞士星历，C 扩展，已内置于 `vedic/` 目录）
- 大模型：智谱 GLM（OpenAI 兼容协议，流式输出），带模型降级链
- 前端：原生 HTML/CSS/JS，深色古风界面

## 目录结构

```
fortune-web/
├── server.py          # FastAPI 入口
├── bazi.py            # 八字排盘（本地计算）
├── cities.py          # 全国省市经纬度表（34 省 352 地级行政区）
├── llm.py             # 智谱 GLM 客户端 + 降级链 + MOCK 模式
├── prompts.py         # 系统提示词 + 命理知识卡
├── vedic_bridge.py    # 印占排盘桥接（子进程）
├── vedic/             # 印占引擎（engine.py + ephe 星历 + PyJHora 封装）
├── static/index.html  # 前端
└── requirements.txt   # 依赖清单
```

## 本地运行

```bash
# 1. 建虚拟环境并装依赖
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # Windows
# .venv/bin/pip install -r requirements.txt     # Linux/Mac

# 2. 配置真实凭据（二选一）
#    方式一（推荐，本地开发）：把真实凭据写到项目外的
#        ~/.workbuddy/xuanji-secrets.env  （格式见 .env.example，代码会自动读取）
#    方式二：直接设置环境变量 ZHIPU_API_KEY / MAIL_* 等

# 3. 启动
.venv/Scripts/python -m uvicorn server:app --host 127.0.0.1 --port 8787
# 浏览器打开 http://127.0.0.1:8787
```

> 真实凭据（智谱 key / 邮件授权码）**不要写进项目目录内任何文件**，统一放项目外的 `~/.workbuddy/xuanji-secrets.env`（可用 `XUANJI_SECRET_FILE` 环境变量改路径）。详见 `KEY-SECURITY.md`。

## 印占引擎说明

- 印占引擎（`vedic/`）基于开源项目 vedic-calculator，依赖 `pysweph`（C 扩展）+ `PyJHora`。
- 星历文件（`.se1`）已内置于 `vedic/ephe/`，无需额外配置。
- 本地 Windows 下若遇到 `swisseph 不可用`，通常是用了系统 Python（空壳）而非 venv 的 Python；确认用带 C 扩展的 venv 运行即可。
- 引擎 Python 解释器优先级：环境变量 `VEDIC_PYTHON` > 本地 skill venv > 当前进程 Python（`sys.executable`）。
- 印占排盘失败时，前端会优雅降级（合参模式退回纯八字）。

## API key 保密

- 线上部署务必通过**环境变量**注入 `ZHIPU_API_KEY`、邮件 `MAIL_*` 等，不要将真实凭据写进项目目录内的 `.env` 或任何文件。
- 本地开发真实凭据放项目外的 `~/.workbuddy/xuanji-secrets.env`（代码自动读取）。
- `.env.example` / `.env` 仅占位示例，不含真实凭据。

## 用户认证（玄机阁个人档案）

玄机阁目前支持邮箱注册 + 临时密码 + JWT 登录；首次登录会强制改密。

- 相关环境变量：
  - `ZHIPU_API_KEY` —— 智谱 API key（必填）
  - `XUANJI_JWT_SECRET` —— JWT 签名密钥（**强烈建议设置成 32+ 字节强随机字符串**）
  - `XUANJI_USERS_DB` —— 用户 JSON 路径，默认 `users.json`
- 用户数据当前落 JSON 文件，**云端沙箱重启会丢**（持久化需接 PG/MySQL，本期先不做）。
- 主功能（八字/印占/合参排盘与解读）**未登录也能用**，登录只是为后续的个人档案长期保存/跨设备同步做准备。

### 接口

- `POST /api/bazi` — 八字排盘（匿名可用）
- `POST /api/vedic` — 印占排盘（匿名可用）
- `POST /api/chat` — 流式对话 SSE（匿名可用）
- `GET /api/cities` — 省→市两级数据（匿名可用）
- `POST /api/register` — 邮箱注册（仅需邮箱，返回一次性临时密码）
- `POST /api/login` — 邮箱+密码登录（返回 JWT + `must_change_password`）
- `POST /api/change-password` — 改密（需登录态）
- `GET /api/me` — 当前用户信息（需登录态）
- `POST /api/profile/nickname` — 改昵称（需登录态）

## 免责声明

本服务为传统文化娱乐体验，所有解读仅供参考娱乐，不构成任何医疗、投资、法律建议。生辰信息仅用于本次排盘。



## 邮件服务配置（可选）

忘记密码流程默认走「页面直接显示验证码」的兜底，不需要任何邮件服务。但如果你想让用户真在邮箱里收到验证码，可启用 SMTP：

### 支持的 provider

设环境变量  即可切换（主流都覆盖了）：

| Provider | SMTP Host | Port | SSL | 用途 |
|----------|-----------|------|-----|------|
|  | smtp.qq.com | 465 | ✓ | QQ 邮箱（国内最稳） |
|  | smtp.163.com | 465 | ✓ | 网易 163 |
|  | smtp.126.com | 465 | ✓ | 网易 126 |
|  | smtp.gmail.com | 465 | ✓ | Gmail（需 App Password）|
|  | smtp.office365.com | 587 | ✗ (STARTTLS) | Outlook / Office365 |
|  | smtp.aliyun.com | 465 | ✓ | 阿里云邮件推送 |
|  | 自填 | 自填 | 自填 | 任何其他 SMTP |

### 关键概念：「授权码」不是登录密码

QQ / 163 / Gmail 的 SMTP 密码需要去邮箱后台单独生成一个 **授权码 / 应用口令**（16 字符），它不等同于你的登录密码。

### QQ 邮箱（5 分钟搞定）

1. 登录 https://mail.qq.com
2. 顶部「设置」→「账户」
3. 往下翻「POP3/IMAP/SMTP/Exchange/CardDAV/CardSV 服务」→ 找到「SMTP 服务」→ 开启
4. 验证密保后生成 16 位授权码
5. 部署时填到环境变量：
   

### Gmail（稍复杂）

1. 登录 Google 账号 → myaccount.google.com
2. 「安全性」→ 必须先开启「两步验证」才能生成 App Password
3. 两步验证启用后 → 「应用专用密码」→ 选「邮件 / 其他（自定义名称）」→ 生成 16 字符密码
4. 部署时填：
   

### 部署注入方式

 部署时在  里直接注入（不写进代码）：



**安全提醒**：这些凭据等于你的邮箱账号本身，永远不要写进  或 commit。 已排除 ，部署平台的环境变量不进部署包源码。

### 验证是否生效

1. 部署后打开新链接
2. 走「忘记密码」流程，输邮箱 → 点发送验证码
3. **真发邮件**：页面只显示「验证码已发送到 xxx@xxx.com，请查收」，不显示验证码本体
4. **未配成功**：页面把验证码直接展示给你，并写「邮件功能未开启」
5. 同时后端日志会打印 （真发）或 

如果走真发邮件但用户没收到，看后端日志的  排查：通常是授权码错、QQ 没开 SMTP 服务、或 Gmail 没开两步验证。
