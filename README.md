# 玄机阁 · 中西合参命盘

一次输入，同时排出中式四柱与南印（Vedic）命盘，再由「玄机先生」做合参解读；另设关系人一屏，做中式合婚与日月互看。

> 本工具为传统文化娱乐内容，解读由大模型生成，仅供参考，不构成任何决策依据。

## 功能

- **中式命盘**：四柱四列、五行条、身强弱、喜用、大运时间轴、神煞、干支关系。术语可点击查看释义，盘面细节可折叠。
- **印占命盘**：4×4 方形十二宫，Lagna / 宫位 / 逆行 / 月宿 / 大运（Dasha）。swisseph wasm 在进入双盘页时才加载，首屏不阻塞。
- **玄机先生**：把两张盘的要点按白名单压成载荷，经同源 Function 流式返回解读，支持六类问事方向。
- **关系人**：对方省市 + 生日 + 时辰（可选）+ 性别，只存称呼、只存 localStorage。时辰不详时时柱与 Lagna 标「未知」，不做假造。
- **合婚**：年柱日柱六合六冲、五行互补、配偶星状态、三条相处建议；西式只做太阳月亮宫位互看。双盘对照，中间金线，相合实线、相冲朱砂虚线。

## 技术栈

- Vite 8 + React 19 + TypeScript 5.9
- `lunar-javascript` 做农历与节气，`@swisseph/browser`（wasm）做 Vedic 计算
- 排盘引擎为纯函数，同一输入永远同一输出（不使用 `Date.now` / `Math.random`）
- 中国时区换算含 1986–1991 夏令时；Vedic 用 SIDM_TRUE_CITRA + 整宫制，`PLANET_FLAGS = 66386`

## 本地开发

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # tsc --noEmit && vite build
npm run preview
```

## 测试

```bash
npm run test:bazi            # 十神、确定性、验收盘
npm run test:bazi:regression # 20 条回归样本逐项比对
npm run test:timecn          # 时区与夏令时
npm run test:vedic           # Vedic 排盘
```

`test:bazi` 与 `test:bazi:regression` 读取仓库外的 `回归样本20条.json`；该基准文件不随仓库提供，缺失时自动跳过。

浏览器验收脚本在 `scripts/qa-*.py`（Playwright），针对本地 dev server 运行，截图输出到 `.qa/`（不入库）。

## 目录

```
src/engine/     bazi.ts 四柱引擎 / vedic.ts 印占引擎 / timecn.ts 时区 / signs.ts 星历表
src/lib/        interp.ts 载荷与上行 / match.ts 合婚规则 / format.ts
src/components/ BaziChart / VedicChart / MasterScreen / MatchScreen / Term
src/content/    terms.ts 术语词典
functions/      Sites Function：/api/interpret 流式解读（服务端读取平台注入的 QODER_PAT）
public/         favicon.svg / swisseph.wasm
```

## 部署

前端为静态产物（`dist/`），解读接口由同源 Function 提供。Function 通过平台注入的环境变量 `QODER_PAT` 调用 Qoder Cloud Agents，仓库内不含任何密钥或令牌。

## 许可

本项目以 [GNU AGPL-3.0](LICENSE) 发布。

选择 AGPL 是因为印占计算依赖 `@swisseph/browser`，其中打包了 Swiss Ephemeris 的 wasm，该组件本身即 AGPL-3.0。按其网络条款，任何人修改后作为网站对外提供服务，也需向使用者提供对应源码。若需闭源商用，应另行取得 Astrodienst 的 Swiss Ephemeris 商业授权。
