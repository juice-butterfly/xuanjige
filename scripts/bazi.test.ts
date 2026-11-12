import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { calcBazi, relationBetween, shiShen } from '../src/engine/bazi.ts'

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
const samples: Sample[] = existsSync(FIXTURE)
  ? (JSON.parse(readFileSync(FIXTURE, 'utf8')) as { samples: Sample[] }).samples
  : []

test('十神阴阳方向：辛见乙为偏财，辛见戊为正印', () => {
  // 02 第五节①：我克同阴阳为偏财；生我异阴阳为正印。
  // 辛(阴金) 克 乙(阴木) → 偏财；辛(阴金) 被 戊(阳土) 生 → 正印。
  assert.equal(shiShen('辛', '辛'), '比肩')
  assert.equal(shiShen('辛', '庚'), '劫财')
  assert.equal(shiShen('辛', '癸'), '食神')
  assert.equal(shiShen('辛', '壬'), '伤官')
  assert.equal(shiShen('辛', '戊'), '正印')
  assert.equal(shiShen('辛', '己'), '偏印')
  assert.equal(shiShen('辛', '甲'), '正财')
  assert.equal(shiShen('辛', '乙'), '偏财')
  assert.equal(shiShen('辛', '丙'), '正官')
  assert.equal(shiShen('辛', '丁'), '七杀')
})

test('T001 验收：1965-02-06 15:00 女 上海', () => {
  const bazi = calcBazi(1965, 2, 6, 15, 0, '女', true, '上海', 2026)

  assert.equal(bazi.solar, '1965-02-06 15:00')
  assert.equal(bazi.lunar, '农历一九六五年正月初五')
  assert.equal(bazi.zodiac, '蛇')
  assert.deepEqual(
    {
      year: bazi.pillars.year.ganzhi,
      month: bazi.pillars.month.ganzhi,
      day: bazi.pillars.day.ganzhi,
      time: bazi.pillars.time.ganzhi,
    },
    { year: '乙巳', month: '戊寅', day: '辛卯', time: '丙申' },
  )
  assert.equal(bazi.day_master, '辛')
  assert.equal(bazi.day_master_element, '金')
  assert.equal(bazi.day_strength, '身弱')
  assert.deepEqual(bazi.favorable, ['印', '比劫'])
  assert.deepEqual(bazi.wuxing_missing, ['水'])
  assert.equal(bazi.current_dayun, '甲申')
  assert.equal(bazi.pillars.day.shi_shen_gan, '')
  assert.equal(bazi.pillars.month.shi_shen_gan, '正印')
  assert.deepEqual(bazi.pillars.year.hidden_gan, ['丙', '庚', '戊'])
  assert.deepEqual(bazi.pillars.year.shi_shen_zhi, ['正官', '劫财', '正印'])
})

test('T001 五行归一化与规格样例一致（±0.02）', () => {
  const bazi = calcBazi(1965, 2, 6, 15, 0, '女', true, '上海', 2026)
  const expected: Record<string, number> = { 金: 2.88, 木: 10, 水: 0.73, 火: 6.91, 土: 1.18 }
  for (const [elem, value] of Object.entries(expected)) {
    assert.ok(
      Math.abs(bazi.wuxing_normalized[elem] - value) <= 0.02,
      `${elem}: ${bazi.wuxing_normalized[elem]} != ${value}`,
    )
  }
})

test('bazi 顶层字段与规格第三节完全一致', () => {
  const bazi = calcBazi(1965, 2, 6, 15, 0, '女', true, '上海', 2026)
  assert.deepEqual(Object.keys(bazi).sort(), [
    'current_dayun',
    'day_master',
    'day_master_element',
    'day_strength',
    'dayun',
    'di_shi',
    'diaohou',
    'favorable',
    'liunian',
    'lunar',
    'ming_shen',
    'pillars',
    'shen_sha',
    'solar',
    'wuxing_count',
    'wuxing_missing',
    'wuxing_normalized',
    'wuxing_strength',
    'xun_kong',
    'zhi_relations',
    'zodiac',
  ])
})

test('身强弱使用加权绝对值 wuxing_strength', () => {
  const bazi = calcBazi(1965, 2, 6, 15, 0, '女', true, '上海', 2026)
  assert.equal(bazi.wuxing_strength.金, 0.95)
  assert.equal(bazi.wuxing_strength.木, 3.3)
  assert.equal(bazi.wuxing_strength.水, 0.24)
  assert.ok(Math.abs(bazi.wuxing_strength.火 - 2.28) < 1e-12)
  assert.equal(bazi.wuxing_strength.土, 0.39)
  assert.equal(bazi.day_strength, '身弱')
})

test('生地不参与排盘：上海与北京四柱相同（无真太阳时校正）', () => {
  const shanghai = calcBazi(1965, 2, 6, 15, 0, '女', true, '上海', 2026)
  const beijing = calcBazi(1965, 2, 6, 15, 0, '女', true, '北京', 2026)
  assert.deepEqual(shanghai.pillars, beijing.pillars)
})

test('纯函数：同一输入连排两次完全一致', () => {
  const a = calcBazi(1965, 2, 6, 15, 0, '女', true, '上海', 2026)
  const b = calcBazi(1965, 2, 6, 15, 0, '女', true, '上海', 2026)
  assert.equal(JSON.stringify(a), JSON.stringify(b))
})

test('源码不含 Date.now / Math.random', () => {
  const source = readFileSync(new URL('../src/engine/bazi.ts', import.meta.url), 'utf8')
  assert.ok(!source.includes('Date.now'))
  assert.ok(!source.includes('Math.random'))
})

test('20 条回归样本：四柱/日主/生肖/身强弱/喜用/缺五行/归一化/现行大运', (t) => {
  if (!samples.length) {
    t.skip('回归样本20条.json 未随仓库提供')
    return
  }
  for (const sample of samples) {
    const { input, expected } = sample
    const bazi = calcBazi(
      input.year,
      input.month,
      input.day,
      input.hour,
      input.minute,
      input.gender,
      true,
      input.place,
      2026,
    )
    const actual = {
      四柱: {
        年柱: bazi.pillars.year.ganzhi,
        月柱: bazi.pillars.month.ganzhi,
        日柱: bazi.pillars.day.ganzhi,
        时柱: bazi.pillars.time.ganzhi,
      },
      日主: bazi.day_master,
      日主五行: bazi.day_master_element,
      生肖: bazi.zodiac,
      身强弱: bazi.day_strength,
      喜用神: bazi.favorable,
      缺五行: bazi.wuxing_missing,
      现行大运: bazi.current_dayun,
    }
    assert.deepEqual(actual, {
      四柱: expected.四柱,
      日主: expected.日主,
      日主五行: expected.日主五行,
      生肖: expected.生肖,
      身强弱: expected.身强弱,
      喜用神: expected.喜用神,
      缺五行: expected.缺五行,
      现行大运: expected.现行大运,
    }, sample.id)
    for (const [elem, value] of Object.entries(expected.五行归一化)) {
      assert.ok(
        Math.abs(bazi.wuxing_normalized[elem] - value) <= 0.02,
        `${sample.id} ${elem}: ${bazi.wuxing_normalized[elem]} != ${value}`,
      )
    }
  }
})

test('双盘关系：T001 与另一盘返回确定性四支关系', () => {
  const a = calcBazi(1965, 2, 6, 15, 0, '女', true, '上海', 2026)
  const b = calcBazi(1990, 1, 1, 12, 0, '男', true, '杭州', 2026)
  const rel = relationBetween(a, b)
  assert.equal(rel.day_gan_a, '辛')
  assert.equal(typeof rel.gan_rel, 'string')
  assert.equal(typeof rel.couple_rel, 'string')
  assert.ok(rel.cross_zhi_rel.length > 0)
  assert.equal(JSON.stringify(rel), JSON.stringify(relationBetween(a, b)))
})
