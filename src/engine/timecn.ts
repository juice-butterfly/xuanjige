export interface UTMoment {
  year: number
  month: number
  day: number
  hour: number
  dst: boolean
}

// 中国夏令时段（官方逐段表）：每年 4 月中旬某周日 02:00 拨快至 03:00，
// 9 月中旬某周日 02:00 回拨至 01:00。期间 UTC+9，其余 UTC+8。
const DST_SPANS: Array<[string, string]> = [
  ['1986-05-04 02:00', '1986-09-14 02:00'],
  ['1987-04-12 02:00', '1987-09-13 02:00'],
  ['1988-04-10 02:00', '1988-09-11 02:00'],
  ['1989-04-16 02:00', '1989-09-17 02:00'],
  ['1990-04-15 02:00', '1990-09-16 02:00'],
  ['1991-04-14 02:00', '1991-09-15 02:00'],
]

export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y
  const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

export function civilFromDays(z: number): [number, number, number] {
  const t = z + 719468
  const era = Math.floor(t / 146097)
  const doe = t - era * 146097
  const leap = (y: number) => Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400)
  let yoe = Math.floor(doe / 365)
  while (365 * yoe + leap(yoe) > doe) yoe--
  while (365 * (yoe + 1) + leap(yoe + 1) <= doe) yoe++
  const doy = doe - (365 * yoe + leap(yoe))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp + (mp < 10 ? 3 : -9)
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d]
}

function parseSpanMin(s: string): number {
  const [date, hm] = s.split(' ')
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = hm.split(':').map(Number)
  return daysFromCivil(y, m, d) * 1440 + h * 60 + mi
}

const SPANS = DST_SPANS.map(([a, b]) => ({ start: parseSpanMin(a), end: parseSpanMin(b) }))

export function chinaLocalToUT(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): UTMoment {
  const tMin = daysFromCivil(year, month, day) * 1440 + hour * 60 + minute
  let dst = false
  for (const s of SPANS) {
    if (tMin >= s.start && tMin < s.start + 60) {
      throw new Error('出生时刻落在夏令时开始的一小时（时钟拨快，该时刻不存在），请核实出生时间')
    }
    if (tMin >= s.end - 60 && tMin < s.end) {
      throw new Error('出生时刻落在夏令时结束的一小时（时钟回拨，该时刻出现两次），请核实出生时间')
    }
    if (tMin >= s.start + 60 && tMin < s.end - 60) dst = true
  }
  const utMin = tMin - (dst ? 540 : 480)
  const days = Math.floor(utMin / 1440)
  const mins = utMin - days * 1440
  const [uy, um, ud] = civilFromDays(days)
  return { year: uy, month: um, day: ud, hour: mins / 60, dst }
}
