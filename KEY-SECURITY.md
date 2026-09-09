# 智谱 API Key 保密方案

> 更新于 2026-09-08：新增「凭据脱敏」——真实 key 与邮件授权码不再放项目目录内任何文件，统一迁到项目外的外部 secrets 文件。

## 核心原则

**Key 只存在于服务器进程环境里，绝不传到浏览器前端，也绝不落在项目目录内的明文文件里。**

## 我们的架构（已天然安全）

```
浏览器（前端）
  ↓ 只调我们自己的后端 /api/chat
FastAPI 后端（server.py + llm.py）
  ↓ 用进程环境变量里的 ZHIPU_API_KEY 调智谱
智谱 API
```

- 前端浏览器**永远看不到** ZHIPU_API_KEY
- Key 只存在于两个地方：
  1. 本地开发：`.env` 文件（被 `.gitignore` 排除）
  2. 服务器进程：环境变量 `ZHIPU_API_KEY`

## 为什么不需要 Node.js 代理

网上"自建 Node.js 代理"方案的核心思路是：**把 API key 从浏览器挪到服务器**。

但我们已经是这个结构了——FastAPI 就是后端代理，再加一层 Node.js 是多余的。

对比：

| 方案 | 浏览器 | 服务器 | 代理层 | 评价 |
|---|---|---|---|---|
| ❌ 纯前端调智谱 | key 直接暴露 | - | - | 极不安全，**禁止** |
| ➕ 加 Node.js 代理 | 安全 | - | Node.js | 我们已有 Python 后端，重复 |
| ✅ 我们现在的方案 | 安全 | Python(FastAPI) | - | 已天然安全 |

## 保密纪律

### 1. `.env` 文件（本地开发用）
- 真实 key 放在 `.env` 文件
- `.gitignore` 已排除 `.env`、`.env.*`、`*.env`
- **永远不要**把 `.env` 文件复制、上传、提交、共享给任何人

### 2. `.env.example` 文件（团队协作占位）
- 这只是示例文件，**永远填占位符**（`your_zhipu_api_key_here`）
- 即使被提交也不会泄露真实 key
- 已被 `.gitignore` 显式排除（`!.env.example`）以便不被误排除

### 3. 部署时
- **不要**把 `.env` 上传到服务器
- 用环境变量注入 key（每个部署平台的方式不同）：
  - 命令行前缀：`ZHIPU_API_KEY=xxx python server.py`
  - 平台配置面板（如有"环境变量"选项）
- key 进部署配置是不可避免的，但**不进上传的源码包**是关键

### 4. 应急
- 如怀疑 key 泄露，立即去智谱控制台（https://bigmodel.console.zhipuai.cn/）**吊销并重新生成**
- 新生成的 key 立即更新到本地 `.env` 和部署环境变量

## 代码读取 key 的优先级

```python
# llm.py 里的 _load_env 逻辑（从低到高）：
# 1. 项目内 .env（脱敏后只留占位符，无真实凭据）
# 2. 外部 secrets 文件（真实凭据，默认 ~/.workbuddy/xuanji-secrets.env）
# 3. 进程环境变量（最高，部署时注入）
```

auth.py 的邮件配置（MAIL_*）同理：`_getenv()` 先读环境变量，回退到外部 secrets 文件。

这样：
- 本地开发：真实凭据在 `~/.workbuddy/xuanji-secrets.env`，代码自动读取，方便
- 部署：环境变量注入，`即使有人误传了项目目录，也不会带上真实凭据`（因为项目目录内根本没有明文凭据）

## 凭据脱敏（2026-09-08 起）

真实凭据（智谱 key + 邮件授权码）**不再放项目目录内**，改存项目外的外部文件：

- **外部 secrets 文件**：`C:\Users\Lenovo\.workbuddy\xuanji-secrets.env`（本机绝对路径，项目目录之外）
  - 可用 `XUANJI_SECRET_FILE` 环境变量覆盖默认路径
- **项目内 `.env`**：只留占位符 + 说明注释（值为空）
- **项目内 `.env.example`**：占位示例（`your_xxx_here`）

为什么放项目外：部署工具上传目录时不会自动排除 `.env*` 文件，若真实凭据留在项目内任何文件，都会随源码包上传。放项目目录之外，则从物理上杜绝被上传的可能。

## 已实施的安全措施

- [x] `.gitignore` 排除 `.env`、`.env.*`、`*.env`（保留 `.env.example`）
- [x] 真实凭据迁到项目外 `~/.workbuddy/xuanji-secrets.env`，项目目录内零明文凭据
- [x] `llm.py` / `auth.py` 支持读取外部 secrets 文件（`XUANJI_SECRET_FILE` 可覆盖路径）
- [x] 代码优先读环境变量，外部文件次之，项目内 `.env` 仅占位兜底
- [x] 前端不接触 key，所有智谱调用在后端完成
- [x] 文档化保密纪律（本文件）

## 部署检查清单

部署前确认：

- [ ] `.env` 文件**没有**被打包进部署包
- [ ] 部署平台的"环境变量"配置里设置了 `ZHIPU_API_KEY`
- [ ] 部署后访问网站，功能正常
- [ ] 浏览器开发者工具 → Network → 看 `/api/chat` 请求，确认**响应里没有 key 字段**