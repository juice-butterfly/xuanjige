import { existsSync, readFileSync } from 'node:fs'
import { calcBazi } from '../src/engine/bazi.ts'

type Sample = {
  id: string
  category: string
  input: {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    gender: string
    place: string
  }
  expected: {
    四柱: { 年柱: string; 月柱: string; 日柱: string; 时柱: string }
    日主: string
    日主五行: string
    生肖: string
    身强弱: string
    喜用神: string[]
    缺五行: string[]
    五行归一化: Record<string, number>
    现行大运: string
  }
}

const FIXTURE = new URL('../../回归样本20条.json', import.meta.url)
if (!existsSync(FIXTURE)) {
  console.log('未找到 回归样本20条.json（该基准文件不随仓库提供），跳过回归。')
  process.exit(0)
}
const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
  total: number
  samples: Sample[]
}
const samples = fixture.samples

// 基准答案只读：以下判定全部拿 expected 去比 actual，不做任何反向适配
const NOW_YEAR = 2026
const TOLERANCE = 0.02
const ELEMENTS = ['金', '木', '水', '火', '土'] as const

const widthOf = (s: string) =>
  [...s].reduce((n, ch) => n + ((ch.codePointAt(0) ?? 0) > 0x1100 ? 2 : 1), 0)
const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - widthOf(s)))

type Row = {
  sample: Sample
  pillarsCell: string
  dayCell: string
  strengthCell: string
  favorableCell: string
  maxError: number
  passed: boolean
  problems: string[]
}

function check(sample: Sample): Row {
  const { input, expected } = sample
  const bazi = calcBazi(
    input.year,
    input.month,
    input.day,
    input.hour,
    input.minute,
    input.gender as '男' | '女',
    true,
    input.place,
    NOW_YEAR,
  )

  const problems: string[] = []

  // 1) 四柱：逐字一致
  const actualPillars = {
    年柱: bazi.pillars.year.ganzhi,
    月柱: bazi.pillars.month.ganzhi,
    日柱: bazi.pillars.day.ganzhi,
    时柱: bazi.pillars.time.ganzhi,
  }
  const badPillars = (Object.keys(expected.四柱) as (keyof typeof expected.四柱)[]).filter(
    (k) => actualPillars[k] !== expected.四柱[k],
  )
  for (const k of badPillars) {
    problems.push(`四柱·${k} 实际${actualPillars[k]}≠期望${expected.四柱[k]}`)
  }
  const pillarsCell = badPillars.length ? `✗ ${badPillars.join('、')}` : '✓'

  // 2) 日主
  const dayPass = bazi.day_master === expected.日主
  if (!dayPass) problems.push(`日主 实际${bazi.day_master}≠期望${expected.日主}`)
  const dayCell = dayPass ? bazi.day_master : `${bazi.day_master}≠${expected.日主} ✗`

  // 3) 身强弱
  const strengthPass = bazi.day_strength === expected.身强弱
  if (!strengthPass) problems.push(`身强弱 实际${bazi.day_strength}≠期望${expected.身强弱}`)
  const strengthCell = strengthPass ? bazi.day_strength : `${bazi.day_strength}≠${expected.身强弱} ✗`

  // 4) 喜用神
  const favActual = bazi.favorable.join('/')
  const favExpected = expected.喜用神.join('/')
  const favPass = favActual === favExpected
  if (!favPass) problems.push(`喜用神 实际${favActual}≠期望${favExpected}`)
  const favorableCell = favPass ? favActual : `${favActual}≠${favExpected} ✗`

  // 5) 其余字段：日主五行 / 生肖 / 缺五行 / 现行大运
  if (bazi.day_master_element !== expected.日主五行) {
    problems.push(`日主五行 实际${bazi.day_master_element}≠期望${expected.日主五行}`)
  }
  if (bazi.zodiac !== expected.生肖) {
    problems.push(`生肖 实际${bazi.zodiac}≠期望${expected.生肖}`)
  }
  const missingActual = [...bazi.wuxing_missing].sort().join('')
  const missingExpected = [...expected.缺五行].sort().join('')
  if (missingActual !== missingExpected) {
    problems.push(`缺五行 实际[${missingActual}]≠期望[${missingExpected}]`)
  }
  if (bazi.current_dayun !== expected.现行大运) {
    problems.push(`现行大运 实际${bazi.current_dayun || '（空）'}≠期望${expected.现行大运}`)
  }

  // 6) 五行归一化：取五个元素误差的最大值，容差 ±0.02
  let maxError = 0
  let worstElement = ''
  for (const elem of ELEMENTS) {
    const exp = expected.五行归一化[elem]
    if (typeof exp !== 'number') {
      problems.push(`五行归一化 期望缺${elem}`)
      continue
    }
    const diff = Math.abs(bazi.wuxing_normalized[elem] - exp)
    if (diff > maxError) {
      maxError = diff
      worstElement = elem
    }
  }
  let maxErrorCell = `${maxError.toFixed(4)} ${maxError <= TOLERANCE ? '✓' : '✗'}`
  if (maxError > TOLERANCE) {
    maxErrorCell = `${maxError.toFixed(3)} ✗ ${worstElement}`
    problems.push(
      `五行归一化·${worstElement} 实际${bazi.wuxing_normalized[worstElement].toFixed(2)}≠期望${expected.五行归一化[worstElement].toFixed(2)}（超差${maxError.toFixed(3)}）`,
    )
  }

  return {
    sample,
    pillarsCell,
    dayCell,
    strengthCell,
    favorableCell,
    maxError,
    passed: problems.length === 0,
    problems,
  }
}

const rows = samples.map(check)
const passed = rows.filter((r) => r.passed)
const failed = rows.filter((r) => !r.passed)

const headers = ['id', '分类', '四柱', '日主', '身强弱', '喜用神', '五行归一化最大误差']
const widths = [6, 8, 14, 14, 16, 26, 20]

console.log('天机阁八字引擎 · 20 条回归自检')
console.log('基准：回归样本20条.json（expected 只读，未改动）')
console.log('判定：四柱逐字一致；五行归一化误差 ≤0.02；日主/日主五行/生肖/身强弱/喜用神/缺五行/现行大运完全一致')
console.log('')
console.log(headers.map((h, i) => pad(h, widths[i])).join('  '))
console.log(widths.map((w) => '-'.repeat(w)).join('  '))
for (const r of rows) {
  console.log(
    [
      r.sample.id,
      r.sample.category,
      r.pillarsCell,
      r.dayCell,
      r.strengthCell,
      r.favorableCell,
      r.maxError <= TOLERANCE ? `${r.maxError.toFixed(4)} ✓` : `${r.maxError.toFixed(3)} ✗`,
    ]
      .map((cell, i) => pad(cell, widths[i]))
      .join('  '),
  )
}

console.log('')
console.log(`全对：${passed.length} / ${samples.length}`)

const categories = [...new Set(samples.map((s) => s.category))]
console.log(
  '分类：' +
    categories
      .map((c) => {
        const group = rows.filter((r) => r.sample.category === c)
        return `${c} ${group.filter((r) => r.passed).length}/${group.length}`
      })
      .join('，'),
)

if (failed.length) {
  console.log('')
  console.log('挂科清单：')
  for (const r of failed) {
    console.log(`  ${r.sample.id}（${r.sample.category}）`)
    for (const p of r.problems) console.log(`    - ${p}`)
  }

  console.log('')
  console.log('排查方向：')
  const failedIn = (c: string) => rows.filter((r) => r.sample.category === c && !r.passed)
  const shichen = failedIn('时辰')
  const jieqi = failedIn('节气')
  if (shichen.length === 4) {
    console.log('  · 时辰类 4 条全挂：先查 EightChar.sect（1/2）是否与基准一致')
  }
  if (jieqi.length === 4) {
    console.log('  · 节气类 4 条全挂：查是否严格执行节气换月柱，并核对 lunar-javascript 版本')
  }
  const onlyTenGod = failed.every((r) => r.problems.every((p) => p.includes('十神')))
  if (onlyTenGod) {
    console.log('  · 仅十神出错：回到 02 排盘移植清单 §5① 核对阴阳同异判定')
  }
} else {
  console.log('')
  console.log('挂科：无')
}

process.exitCode = failed.length ? 1 : 0
