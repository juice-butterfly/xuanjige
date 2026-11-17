import { calcBazi, type BaziResult } from '../engine/bazi.ts'
import { lunarToSolar, type CalendarKind, type LunarDate } from './calendar.ts'

export type Gender = 'male' | 'female'

export type Relation =
  | 'friend'
  | 'partner'
  | 'crush'
  | 'family'
  | 'teacher'
  | 'classmate'
  | 'boss'

export const RELATIONS: { id: Relation; label: string }[] = [
  { id: 'friend', label: '朋友' },
  { id: 'partner', label: '情侣' },
  { id: 'crush', label: '暧昧对象' },
  { id: 'family', label: '亲人' },
  { id: 'teacher', label: '师生' },
  { id: 'classmate', label: '同学' },
  { id: 'boss', label: '上下属' },
]

export function relationLabel(relation: Relation | null): string {
  return RELATIONS.find((item) => item.id === relation)?.label ?? '未标'
}

export type Person = {
  dob: string
  time: string | null
  gender: Gender
  province: string
  city: string
  lat: number
  lon: number
}

export type Partner = Person & {
  id: string
  alias: string
  relation: Relation | null
  calendar: CalendarKind
  lunar?: LunarDate
}

export const ALIAS_MAX = 12
export const PARTNERS_KEY = 'xuanjige.partners.v1'

function normalizeLunar(value: unknown): LunarDate | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const year = typeof v.year === 'number' ? v.year : NaN
  const month = typeof v.month === 'number' ? v.month : NaN
  const day = typeof v.day === 'number' ? v.day : NaN
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  if (month === 0 || Math.abs(month) > 12 || day < 1 || day > 30) return null
  return lunarToSolar({ year, month, day }) ? { year, month, day } : null
}

export function loadPartners(): Partner[] {
  try {
    const raw = localStorage.getItem(PARTNERS_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.map(normalizePartner).filter((p): p is Partner => p !== null)
  } catch {
    return []
  }
}

export function savePartners(list: Partner[]) {
  try {
    localStorage.setItem(PARTNERS_KEY, JSON.stringify(list))
  } catch {
    /* 本机存储不可用时，当次合参仍可用 */
  }
}

export function normalizePartner(value: unknown): Partner | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const alias = typeof v.alias === 'string' ? v.alias.trim().slice(0, ALIAS_MAX) : ''
  if (!alias || typeof v.id !== 'string' || !v.id) return null
  if (
    typeof v.province !== 'string' ||
    typeof v.city !== 'string' ||
    typeof v.lat !== 'number' ||
    typeof v.lon !== 'number' ||
    typeof v.dob !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v.dob) ||
    (v.gender !== 'male' && v.gender !== 'female')
  ) {
    return null
  }
  const time = typeof v.time === 'string' && /^\d{2}:\d{2}$/.test(v.time) ? v.time : null
  const relation = RELATIONS.some((item) => item.id === v.relation)
    ? (v.relation as Relation)
    : null
  const lunar = v.calendar === 'lunar' ? normalizeLunar(v.lunar) : null
  const keptLunar = lunar && lunarToSolar(lunar) === v.dob ? lunar : null
  return {
    id: v.id,
    alias,
    relation,
    province: v.province,
    city: v.city,
    lat: v.lat,
    lon: v.lon,
    dob: v.dob,
    time,
    gender: v.gender,
    calendar: keptLunar ? 'lunar' : 'solar',
    ...(keptLunar ? { lunar: keptLunar } : {}),
  }
}

export function baziOf(person: Person): BaziResult {
  const [year, month, day] = person.dob.split('-').map(Number)
  const [hour, minute] = person.time ? person.time.split(':').map(Number) : [null, null]
  return calcBazi(
    year,
    month,
    day,
    hour,
    minute,
    person.gender === 'male' ? '男' : '女',
    true,
    '',
    new Date().getFullYear(),
  )
}
