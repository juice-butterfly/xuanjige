import { Lunar, LunarYear, Solar } from 'lunar-javascript'

export type CalendarKind = 'solar' | 'lunar'
export type LunarDate = { year: number; month: number; day: number }

const MIN_SOLAR = '1900-01-01'
export const MIN_LUNAR_YEAR = 1900

export function todayISO(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function lunarOf(year: number, month: number, day: number): Lunar | null {
  try {
    return Lunar.fromYmd(year, month, day)
  } catch {
    return null
  }
}

export function solarToLunar(dob: string): LunarDate | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || dob < MIN_SOLAR) return null
  const [year, month, day] = dob.split('-').map(Number)
  try {
    const lunar = Solar.fromYmd(year, month, day).getLunar()
    const result = { year: lunar.getYear(), month: lunar.getMonth(), day: lunar.getDay() }
    return lunarToSolar(result) === dob ? result : null
  } catch {
    return null
  }
}

export function lunarToSolar(lunar: LunarDate): string | null {
  if (!Number.isInteger(lunar.year) || lunar.year < MIN_LUNAR_YEAR) return null
  const value = lunarOf(lunar.year, lunar.month, lunar.day)
  if (!value) return null
  const solar = value.getSolar()
  const iso = `${solar.getYear()}-${String(solar.getMonth()).padStart(2, '0')}-${String(
    solar.getDay(),
  ).padStart(2, '0')}`
  return iso >= MIN_SOLAR && iso <= todayISO() ? iso : null
}

export function lunarMonths(year: number): { month: number; days: number; label: string }[] {
  if (!Number.isInteger(year) || year < MIN_LUNAR_YEAR) return []
  try {
    return LunarYear.fromYear(year)
      .getMonths()
      .filter((m) => m.getYear() === year)
      .map((m) => {
        const month = m.getMonth()
        const first = lunarOf(year, month, 1)
        return {
          month,
          days: m.getDayCount(),
          label: first ? first.getMonthInChinese() : String(Math.abs(month)),
        }
      })
  } catch {
    return []
  }
}

export function lunarLabel(lunar: LunarDate): string {
  const value = lunarOf(lunar.year, lunar.month, lunar.day)
  return value ? value.toString() : ''
}

export function lunarDayLabel(year: number, month: number, day: number): string {
  const value = lunarOf(year, month, day)
  return value ? value.getDayInChinese() : String(day)
}
