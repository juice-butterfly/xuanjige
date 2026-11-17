# 玄机阁二轮改版设计 · 2026-11-16

## 目标

在现有暖纸体系上完成五件事：农历输入、四页签拆分、中西两页各自细化与纹样、关系人改右上角弹窗、先生在现有版式内承接关系人合参并计量耗时。

硬边界：不改排盘算法，不加真太阳时，不改 SIDM_TRUE_CITRA / 整宫制 / flags 66386 / wasm 懒加载；不新增需要新算法的相位、流年数据；不自动提交或发布。

## 一、历法输入与数据

### 行为

- 「生辰」组新增 `公历 / 农历` 切换，默认公历。
- 公历沿用原生日期选择器。
- 农历用年 / 月 / 日三个下拉：
  - 年：1900 至今年。
  - 月：`LunarYear.fromYear(y).getMonths()` 中 `getYear() === y` 的月份，负月份显示为「闰 X 月」。
  - 日：按 `LunarMonth.getDayCount()` 生成 29 或 30 天。
  - 三个下拉都可为空；只有年月日齐全时才换算公历。
  - 不存在的闰月或超出的日数由 `Lunar.fromYmd` 抛错，界面回退为「此日不存在，请改一日」。
- 日期下方回显另一历法：农历输入显示「公历 2023-04-05」，公历输入显示「农历二〇二三年闰二月十五」。
- 切换历法时，已有日期互转保留；没有日期则保持未择。
- 换算结果须落在 1900-01-01 至今日之间；未到的农历日提示「该农历日尚未到」。
- 时辰、时辰不详、性别逻辑不变，全程不引入真太阳时。

### 数据

`Entry` 升为 v2：

```ts
type CalendarKind = 'solar' | 'lunar'
type LunarDate = { year: number; month: number; day: number } // month < 0 表示闰月

type Entry = {
  version: 2
  province: string; city: string; lat: number; lon: number
  dob: string                       // 永远是公历，engine 输入不变
  time: string | null; timeUnknown: boolean; gender: Gender
  calendar: CalendarKind
  lunar?: LunarDate                 // 仅用户以农历报入时保存，供回显与再编辑
  savedAt: string
}
```

- 读取 v1 时视为公历并升级写回 v2。
- `xuanjige.draft.v1` 增加 `calendar`、`lunar`，缺失时视为公历。
- 关系人记录沿用 `xuanjige.partners.v1` 键，追加 `calendar`、`lunar`、`relation`；旧记录缺字段时 `calendar='solar'`、`relation=null`，不猜关系。

### 模块

新增 `src/lib/calendar.ts`：

- `solarToLunar(dob): LunarDate | null`
- `lunarToSolar(lunar): string | null`（含范围校验）
- `lunarMonths(year): { month: number; days: number; label: string }[]`
- `lunarLabel(lunar): string`
- `lunarDayLabel(year, month, day): string`
- `todayISO(): string`

只做历法换算，不碰排盘。

## 二、信息架构与关系人

### 页签

`报上生辰 / 中式命盘 / 西式命盘 / 玄机先生`，对应 `form / cn / ve / master`。移除独立「关系人」页。

- 中式页章节为「卷之二 · 中式命盘」，西式页为「卷之三 · 西式命盘」，先生页为「卷之四 · 玄机先生」。
- 两页底部互放「转看西式盘 →」/「转看中式盘 →」。
- 未报生辰时两页均给出「去报生辰」入口；时辰不详时两页明确留白，不以正午估算。

### 关系人入口

- 页头工具区新增「关系人」按钮，附人数角标；≤360px 收为印形图标加数字，`aria-label` 仍为「关系人」。
- 点击打开 `PartnerDialog`：原生 `<dialog>` + `showModal()`，Esc / 遮罩 / 焦点回收由浏览器处理；桌面居中，手机全高底部弹层。
- 弹窗内容：
  - 已存列表：称呼、关系标签（未标则显示「未标」）、公历生日、城市；点击选中。
  - 删除为两步确认。
  - 添 / 改表单：称呼、关系六选一（朋友 / 情侣 / 有好感的人 / 亲人 / 陌生人 / 同学）、生地、公历/农历生日、时刻或时辰不详、性别。
  - 关系为必填；旧记录可保留「未标」，直到用户编辑。
  - 底部「与 TA 合参」：关闭弹窗并带该关系人进入先生页；另有「只存下」。
- 关掉弹窗不丢已存记录；表单草稿可丢弃。

### 状态归属

`App` 持有 `partners`、`activePartnerId`、弹窗开关与编辑目标；先生页接收同一份关系人数据。关系人存储与归一化移到 `src/lib/partners.ts`（从 `lib/match.ts` 拆出），并保留 `baziOf` 供先生页计算对方盘。

表单与关系人弹窗共享资料字段：抽出 `PlaceFields` 与 `BirthFields`（历法、生日、时刻、性别），两处使用同一套校验与回显。

## 三、中式与西式两页

同暖纸底色，两套纹样。

### 中式命盘

- 四柱保留天干、地支、十神、藏干、纳音。
- 每柱补一行「旬空 / 十二长生」（现有数据）。
- 「盘面细节」在 ≥1100px 改为常驻右侧盘侧栏：空亡、十二长生、命宫、身宫、胎元、胎息，加「读盘三步」静态说明；窄屏仍用折叠。
- 五行、身强弱、大运、神煞、干支关系保留，只重排节奏。
- 纹样：云雷纹细边、卦象角标、朱砂印、页边竖排「四柱为骨」。

### 西式命盘

- 4×4 南印盘放大；外围加十二宫刻度环与星座符号，宫位旁以罗马数字装饰编号。
- 右侧「九曜细目」表：星曜 / 星座 / 度数 / 宫位 / 所落月宿 / 逆行。
- 下方补：月宿主、当前大运 MD/AD 起止、瑜伽、指示星 AK/AmK/DK、岁差。
- 纹样：星盘弧线、行星符号、星座点阵、页边竖排 `LAGNA · RASI`。
- 全部取自现有 `VedicResult`，不新增相位或流年。

### 空处补白

- 表单页桌面右侧放罗盘 / 星盘线稿与「左执四柱，右观星盘」。
- 先生空闲态加淡墨圆相。
- 章节之间用 `Ornament` 分隔件（cn / ve 两种）。
- 全部为 aria-hidden 的纯 SVG / CSS 装饰，不压正文，不引入图片与新依赖，默认静态。

## 四、先生三模式与关系类型

### 交互

先生页版式不变，方向区上方加三段模式：

- 单盘方向：现有六方向。
- 双盘合参：现有 merge。
- 与关系人合参：选一位关系人，显示关系标签与「两盘速览」（默认折叠的年月日时合冲对照），按钮「与 TA 合参」。

规则：

- 对方时辰不详时，不合参，显示「对方时辰不详，合参不开」与补录入口；不得用正午估算。
- 对方关系未标时，CTA 禁用并提示「先标注关系」。
- 对方盘按需懒算，选中后加载，按 id 缓存；不因进入先生页就运行 wasm。
- 关系人模式下，记录行显示「与 {称呼}（{关系}）合参」。

### 载荷与服务端

- `InterpMode` 增加 `relation`。
- 请求在 `relation` 模式下增加 `partner`（完整盘面，复用现有白名单形状）与 `relation`（六值白名单）。
- 服务端 `MODES` 增加 `relation`；缺 `partner` 或 `relation` 时以 `invalid_input` 拒绝。
- `buildPrompt` 为 relation 生成双盘提示：
  - 盘面分「本人」与「关系人（{relation}）」两段。
  - 关系尺度：情侣看相处与磨合；有好感的人看靠近的分寸，不预测对方心意、不替对方表态；朋友看边界；亲人看代际与照应；同学看同侪分寸；陌生人只谈气场与相处注意。
  - 四段输出：两人底色 → 相合处（双方依据）→ 相冲处（双方依据）→ 一句相处建议。
  - 禁止：判分合、预测对方感情、替对方下结论、为凑结论编矛盾；结尾固定免责句。
- 追问沿用同一会话，自然继承关系上下文。

## 五、先生计时（先量后改）

- 记录三段：起卷（POST 建立会话）、首字、总时长；写入 `sessionStorage['xuanjige.master.timing.v1']`，保留最近 20 条。
- 平时界面不显示；`?diag=1` 时在答案下显示「起卷 x.xs · 首字 x.xs · 总 x.xs」。
- 本地 mock 只验证客户端计量；真实首字与冷启动需线上采样。
- 判读：POST 慢 → 会话冷启动；POST 快、首字慢 → 模型思考；首字后断续 → 轮询或网络。
- 在拿到真实数据前不接外部 API，也不改模型。

## 六、工程与验收

### 新增

- `src/lib/calendar.ts`
- `src/lib/partners.ts`
- `src/components/PartnerDialog.tsx`
- `src/components/BirthFields.tsx`、`PlaceFields.tsx`
- `src/components/Ornament.tsx`
- `src/components/CnChartPage.tsx`、`VeChartPage.tsx`
- `scripts/calendar.test.ts`

### 移除

- `MatchScreen`、`DualScreen`、`merge-band` 与旧 dual 样式、`lib/match.ts` 中仅供旧页使用的展示函数与测试脚本 `qa-dual.py`、`qa-match.py`。

### 修改

`App.tsx`、`MasterScreen.tsx`、`BaziChart.tsx`、`VedicChart.tsx`、`lib/interp.ts`、`functions/routes.mjs`、`scripts/mock-function.mjs`、`styles.css`、`package.json`。

### 验收

- 构建：`npm run build`。
- 单测：`test:bazi`、`test:vedic`、`test:timecn`、新增 `test:calendar`。
- 浏览器：320 / 360 / 390 / 768 / 1440 五档；日间与夜间；对比度 AA；正文四档字号；动效 token 与 reduced-motion；无水平溢出。
- 功能：公历/农历互转、闰月、旧数据读取、四页签、关系人增删改选、先生三模式、关系类型入 prompt、计时写入。
- 关系人合参的真实云端链路留待发布后验证；发布须另行明确指令。
