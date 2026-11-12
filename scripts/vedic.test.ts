import assert from 'node:assert/strict'
import test from 'node:test'
import { calcVedic, PLANET_FLAGS, type VedicResult } from '../src/engine/vedic.ts'
import { ensureVedic } from './vedic-env.ts'

const SIGNS_CN = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼']
const DEG_RE = /^\d{2}°\d{2}'$/

let res: VedicResult

test.before(async () => {
  await ensureVedic()
  // T001：1965-02-06 15:00 女 上海
  res = await calcVedic(
    { dob: '1965-02-06', time: '15:00', place: '上海', lat: 31.23, lon: 121.48 },
    '2026-11-12',
  )
})

test('验收①：lagna 有星座和度数（双子，两位对齐）', () => {
  assert.equal(res.lagna.sign, 'Gemini')
  assert.equal(res.lagna.sign_cn, '双子')
  assert.match(res.lagna.degree, DEG_RE)
  assert.equal(res.lagna.nakshatra.length > 0, true)
})

test('验收②：月亮宿 + pada 有值（Uttara Bhadrapada 4，宿主 Saturn）', () => {
  assert.equal(res.moon_nakshatra.name, 'Uttara Bhadrapada')
  assert.equal(res.moon_nakshatra.pada, 4)
  assert.equal(res.moon_nakshatra.lord, 'Saturn')
})

test('验收③：九曜都在 12 宫内，顺序、宫位、度数、宿齐全', () => {
  assert.deepEqual(
    res.planets.map((p) => p.planet),
    ['太阳', '月亮', '火星', '水星', '木星', '金星', '土星', '罗睺', '计都'],
  )
  for (const p of res.planets) {
    assert.ok(SIGNS_CN.includes(p.sign_cn), `${p.planet} sign_cn=${p.sign_cn}`)
    assert.ok(p.house >= 1 && p.house <= 12, `${p.planet} house=${p.house}`)
    assert.match(p.degree, DEG_RE)
    assert.ok(p.nakshatra.length > 0)
  }
  assert.equal(res.planets[7].retro, true, '罗睺恒逆行')
  assert.equal(res.planets[8].retro, true, '计都恒逆行')
  // 计都 = 罗睺 + 180°
  assert.equal((res.planets[8].house - res.planets[7].house + 12) % 12, 6)
})

test('验收④：ayanamsa 在 23–24° 之间（True Chitra）', () => {
  assert.ok(res.ayanamsa > 23 && res.ayanamsa < 24, `ayanamsa=${res.ayanamsa}`)
  assert.equal(res.meta.ayanamsa, res.ayanamsa)
})

test('T001 锚点：太阳摩羯 23°56\'、月亮双鱼、火星逆行', () => {
  const sun = res.planets[0]
  const moon = res.planets[1]
  const mars = res.planets[2]
  assert.equal(sun.sign_cn, '摩羯')
  assert.equal(sun.degree, "23°56'")
  assert.equal(sun.house, 8) // 双鱼…双子上升：摩羯为第 8 宫
  assert.equal(sun.nakshatra, 'Dhanishta')
  assert.equal(moon.sign_cn, '双鱼')
  assert.equal(mars.retro, true)
  assert.equal(mars.sign_cn, '处女')
})

test('Vimshottari：首运为月亮宿主 Saturn（余量），恰好一条 current，且带次运', () => {
  assert.equal(res.dasha[0].md_planet, 'Saturn')
  // 2026-11-12 应落在 Mars 主运（按 365.25 天/年推算）
  const cur = res.dasha.filter((d) => d.is_current)
  assert.equal(cur.length, 1)
  assert.equal(cur[0].md_planet, 'Mars')
  assert.equal(cur[0].ad_planet, 'Rahu')
  assert.match(cur[0].md_start, /^\d{4}-\d{2}-\d{2}$/)
  for (const d of res.dasha.filter((x) => !x.is_current)) {
    assert.equal(d.ad_planet, null)
  }
  // 合计 120 年：首条余量 + 后续整段
  assert.ok(res.dasha.length >= 8 && res.dasha.length <= 9)
})

test('karakas：AK/AmK/DK 各不相同，来自七曜', () => {
  const names = ['AK', 'AmK', 'DK'] as const
  const values = names.map((k) => res.karakas[k])
  assert.equal(new Set(values).size, 3)
  for (const v of values) {
    assert.ok(['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'].includes(v))
  }
})

test('yogas：恰好 8 个 bool 键', () => {
  assert.deepEqual(Object.keys(res.yogas).sort(), [
    'Budhaditya', 'Chandra-Mangala', 'Dhana Yoga', 'Gajakesari',
    'Kemadruma', 'Neecha Bhanga', 'Panch Mahapurusha', 'Raja Yoga',
  ].sort())
  for (const v of Object.values(res.yogas)) assert.equal(typeof v, 'boolean')
})

test('moon_phase 为布尔；meta 带出生信息', () => {
  assert.equal(typeof res.moon_phase, 'boolean')
  assert.equal(res.meta.dob, '1965-02-06')
  assert.equal(res.meta.time, '15:00')
  assert.equal(res.meta.place, '上海')
  assert.equal(res.meta.lat, 31.23)
  assert.equal(res.meta.lon, 121.48)
})

test('夏令时切换小时的歧义时刻直接报错，不猜', async () => {
  await assert.rejects(
    calcVedic({ dob: '1989-09-17', time: '01:30', place: '上海', lat: 31.23, lon: 121.48 }),
    /两次|核实/,
  )
  await assert.rejects(
    calcVedic({ dob: '1989-04-16', time: '02:30', place: '上海', lat: 31.23, lon: 121.48 }),
    /不存在|核实/,
  )
})

test('PLANET_FLAGS 常量保持 66386（与 PyJHora 逐位对齐）', () => {
  assert.equal(PLANET_FLAGS, 66386)
})
