import assert from 'node:assert/strict'
import test from 'node:test'
import { chinaLocalToUT, daysFromCivil, civilFromDays } from '../src/engine/timecn.ts'

test('civil 往返：daysFromCivil / civilFromDays 互逆', () => {
  for (const [y, m, d] of [[1970, 1, 1], [1965, 2, 6], [2000, 2, 29], [1900, 3, 1], [2026, 11, 12]]) {
    const days = daysFromCivil(y, m, d)
    assert.deepEqual(civilFromDays(days), [y, m, d])
  }
  assert.equal(daysFromCivil(1970, 1, 1), 0)
})

test('平时（非夏令时）UTC+8：1965-02-06 15:00 上海 → UT 07:00', () => {
  const ut = chinaLocalToUT(1965, 2, 6, 15, 0)
  assert.deepEqual([ut.year, ut.month, ut.day], [1965, 2, 6])
  assert.equal(ut.hour, 7)
  assert.equal(ut.dst, false)
})

test('夏令时期间 UTC+9：1989-06-15 12:00 → UT 03:00', () => {
  const ut = chinaLocalToUT(1989, 6, 15, 12, 0)
  assert.deepEqual([ut.year, ut.month, ut.day], [1989, 6, 15])
  assert.equal(ut.hour, 3)
  assert.equal(ut.dst, true)
})

test('夏令时年代的冬天仍是 UTC+8：1989-01-15 12:00 → UT 04:00', () => {
  // 1986–1991 夏令时是每年 4 月中旬–9 月中旬分段实行，冬天不适用 +9
  const ut = chinaLocalToUT(1989, 1, 15, 12, 0)
  assert.deepEqual([ut.year, ut.month, ut.day], [1989, 1, 15])
  assert.equal(ut.hour, 4)
  assert.equal(ut.dst, false)
})

test('减 8 小时跨日：1965-02-07 03:00 → UT 1965-02-06 19:00', () => {
  const ut = chinaLocalToUT(1965, 2, 7, 3, 0)
  assert.deepEqual([ut.year, ut.month, ut.day], [1965, 2, 6])
  assert.equal(ut.hour, 19)
})

test('夏令时开始那一小时不存在：1986-05-04 02:30 报错', () => {
  assert.throws(() => chinaLocalToUT(1986, 5, 4, 2, 30), /不存在|核实/)
  assert.throws(() => chinaLocalToUT(1986, 5, 4, 2, 0), /不存在|核实/)
})

test('夏令时开始前一小时仍是 UTC+8：1986-05-04 01:30', () => {
  const ut = chinaLocalToUT(1986, 5, 4, 1, 30)
  assert.equal(ut.dst, false)
  assert.equal(ut.hour, 1.5 - 8 + 24)
})

test('夏令时期间：1986-05-04 03:30 → UTC+9', () => {
  const ut = chinaLocalToUT(1986, 5, 4, 3, 30)
  assert.equal(ut.dst, true)
})

test('夏令时结束那一小时重复：1990-09-16 01:30 报错', () => {
  assert.throws(() => chinaLocalToUT(1990, 9, 16, 1, 30), /两次|核实/)
  assert.throws(() => chinaLocalToUT(1991, 9, 15, 1, 59), /两次|核实/)
})

test('夏令时结束之后仍是 UTC+8：1991-09-15 02:30', () => {
  const ut = chinaLocalToUT(1991, 9, 15, 2, 30)
  assert.equal(ut.dst, false)
  assert.equal(ut.hour, 2.5 - 8 + 24)
})

test('用户口径边界：1991-09-15 上午已退出夏令时（UTC+8）', () => {
  // 1991-09-15 02:00 回拨后是标准时
  const ut = chinaLocalToUT(1991, 9, 15, 12, 0)
  assert.equal(ut.dst, false)
  assert.equal(ut.hour, 4)
})
