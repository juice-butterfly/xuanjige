import assert from 'node:assert/strict'
import test from 'node:test'
import {
  lunarDayLabel,
  lunarLabel,
  lunarMonths,
  lunarToSolar,
  solarToLunar,
} from '../src/lib/calendar.ts'

test('公历 1990-05-17 → 农历四月廿三', () => {
  assert.deepEqual(solarToLunar('1990-05-17'), { year: 1990, month: 4, day: 23 })
})

test('农历 2023 闰二月十五 → 公历 2023-04-05', () => {
  assert.equal(lunarToSolar({ year: 2023, month: -2, day: 15 }), '2023-04-05')
})

test('2023 年月表含闰二月且为 29 天', () => {
  const months = lunarMonths(2023)
  const leap = months.find((m) => m.month === -2)
  assert.equal(leap?.days, 29)
  assert.equal(leap?.label, '闰二')
})

test('2024 年月表无闰月', () => {
  assert.equal(lunarMonths(2024).some((m) => m.month < 0), false)
})

test('不存在的闰月与超出的日数返回 null', () => {
  assert.equal(lunarToSolar({ year: 2024, month: -2, day: 15 }), null)
  assert.equal(lunarToSolar({ year: 2023, month: -2, day: 30 }), null)
})

test('范围外返回 null', () => {
  assert.equal(lunarToSolar({ year: 1899, month: 1, day: 1 }), null)
  assert.equal(solarToLunar('1899-12-31'), null)
})

test('标签', () => {
  assert.match(lunarLabel({ year: 2023, month: -2, day: 15 }), /闰二月十五/)
  assert.equal(lunarDayLabel(2023, -2, 15), '十五')
})

test('公历⇄农历往返', () => {
  for (const dob of ['1900-01-31', '1965-02-06', '2000-02-29', '2023-04-05', '2026-11-16']) {
    const lunar = solarToLunar(dob)
    assert.ok(lunar)
    assert.equal(lunarToSolar(lunar), dob)
  }
})
