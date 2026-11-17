import {
  calcBazi,
  relationBetween,
  branchPairRel,
  stemPairHe,
  type BaziResult,
} from '../engine/bazi.ts'
import { SIGN_CN } from '../engine/signs.ts'
import type { LuminarySide } from '../engine/vedic.ts'

export type Person = {
  dob: string
  time: string | null
  gender: 'male' | 'female'
  province: string
  city: string
  lat: number
  lon: number
}

export type Partner = Person & { id: string; alias: string }

export const ALIAS_MAX = 12
export const NO_TIME_NOTE = '对方时辰缺失，婚姻宫与上升星座判断受限，结论确定性下降'

const PARTNERS_KEY = 'xuanjige.partners.v1'

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
    /* 本机存储不可用时，当次对照仍可用 */
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
  return {
    id: v.id,
    alias,
    province: v.province,
    city: v.city,
    lat: v.lat,
    lon: v.lon,
    dob: v.dob,
    time,
    gender: v.gender,
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

export type MatchRel = 'he' | 'chong' | null

export type MatchRow = {
  label: string
  left: string
  leftSub: string
  right: string
  rightSub: string
  rel: MatchRel
  tag: string
  note?: string
}

export const UNKNOWN = '未知'

const PILLAR_LABEL: Record<string, string> = { year: '年柱', month: '月柱', day: '日柱', time: '时柱' }

// 中式对照行：年、月、日、时（任一侧有才出）。相合相冲只取六合与六冲，
// 天干五合并入日柱行；细节句由 relationBetween 提供。
export function pillarRows(a: BaziResult, b: BaziResult): MatchRow[] {
  const relOf = (x: string, y: string): { rel: MatchRel; tag: string } => {
    const r = branchPairRel(x, y)
    if (!r) return { rel: null, tag: '' }
    return { rel: r.rel, tag: r.rel === 'he' ? '合' : '冲' }
  }

  const rows: MatchRow[] = [
    {
      label: '年柱',
      left: a.pillars.year.ganzhi,
      leftSub: '',
      right: b.pillars.year.ganzhi,
      rightSub: '',
      ...relOf(a.pillars.year.ganzhi[1], b.pillars.year.ganzhi[1]),
    },
  ]

  const monthA = a.pillars.month.ganzhi
  const monthB = b.pillars.month.ganzhi
  rows.push({
    label: '月柱',
    left: monthA,
    leftSub: '',
    right: monthB,
    rightSub: '',
    ...relOf(monthA[1], monthB[1]),
  })

  const dayA = a.pillars.day.ganzhi
  const dayB = b.pillars.day.ganzhi
  const dayRel = relOf(dayA[1], dayB[1])
  const stemHua = stemPairHe(dayA[0], dayB[0])
  rows.push({
    label: '日柱',
    left: dayA,
    leftSub: '',
    right: dayB,
    rightSub: '',
    rel: dayRel.rel === 'chong' ? 'chong' : stemHua || dayRel.rel === 'he' ? 'he' : null,
    tag: dayRel.rel === 'chong' ? '冲' : stemHua || dayRel.rel === 'he' ? '合' : '',
  })

  if (a.pillars.time || b.pillars.time) {
    const tA = a.pillars.time?.ganzhi ?? UNKNOWN
    const tB = b.pillars.time?.ganzhi ?? UNKNOWN
    const tRel = a.pillars.time && b.pillars.time ? relOf(tA[1], tB[1]) : { rel: null, tag: '' }
    rows.push({
      label: PILLAR_LABEL.time,
      left: tA,
      leftSub: a.pillars.time ? '' : '时辰不详',
      right: tB,
      rightSub: b.pillars.time ? '' : '时辰不详',
      ...tRel,
    })
  }
  return rows
}

// 西式互看：太阳与月亮，同宫为合、对宫为冲，同元素只记一笔，不做完整 synastry
export function luminaryRows(a: LuminarySide, b: LuminarySide): MatchRow[] {
  const cell = (p: LuminarySide['sun']) => ({
    main: `${p.sign_cn} ${p.degree}`,
    sub: p.house ? `第${p.house}宫` : '',
  })
  const relOf = (sa: string, sb: string): { rel: MatchRel; tag: string; note: string } => {
    const ia = SIGN_CN.indexOf(sa)
    const ib = SIGN_CN.indexOf(sb)
    if (ia < 0 || ib < 0) return { rel: null, tag: '', note: '' }
    if (ia === ib) return { rel: 'he', tag: '合', note: '同宫' }
    if ((ia - ib + 12) % 12 === 6) return { rel: 'chong', tag: '冲', note: '对宫' }
    if (ia % 4 === ib % 4) return { rel: null, tag: '', note: '同元素' }
    return { rel: null, tag: '', note: '' }
  }

  const lagnaA = a.lagna ? `${a.lagna.sign_cn} ${a.lagna.degree}` : UNKNOWN
  const lagnaB = b.lagna ? `${b.lagna.sign_cn} ${b.lagna.degree}` : UNKNOWN
  const sunA = cell(a.sun)
  const sunB = cell(b.sun)
  const moonA = cell(a.moon)
  const moonB = cell(b.moon)
  const sunRel = relOf(a.sun.sign_cn, b.sun.sign_cn)
  const moonRel = relOf(a.moon.sign_cn, b.moon.sign_cn)

  return [
    { label: '上升', left: lagnaA, leftSub: '', right: lagnaB, rightSub: '', rel: null, tag: '' },
    {
      label: '太阳',
      left: sunA.main,
      leftSub: sunA.sub,
      right: sunB.main,
      rightSub: sunB.sub,
      rel: sunRel.rel,
      tag: sunRel.tag,
      note: sunRel.note,
    },
    {
      label: '月亮',
      left: moonA.main,
      leftSub: moonA.sub,
      right: moonB.main,
      rightSub: moonB.sub,
      rel: moonRel.rel,
      tag: moonRel.tag,
      note: moonRel.note,
    },
  ]
}

const SPOUSE_WANT: Record<'male' | 'female', string[]> = {
  male: ['正财', '偏财'],
  female: ['正官', '七杀'],
}
const GAN_POS: Record<string, string> = { year: '年干', month: '月干', day: '日干', time: '时干' }
const ZHI_POS: Record<string, string> = { year: '年支', month: '月支', day: '日支', time: '时支' }

function spouseStarScan(chart: BaziResult, gender: 'male' | 'female') {
  const want = SPOUSE_WANT[gender]
  const keys = (['year', 'month', 'day', 'time'] as const).filter((k) => chart.pillars[k])
  let trans = false
  let any = false
  for (const k of keys) {
    const p = chart.pillars[k]!
    if (want.includes(p.shi_shen_gan)) {
      trans = true
      any = true
    }
    if (p.shi_shen_zhi.some((ss) => want.includes(ss))) any = true
  }
  return { trans, any, want }
}

export function spouseStarLine(chart: BaziResult, gender: 'male' | 'female'): string {
  const { trans, want } = spouseStarScan(chart, gender)
  const keys = (['year', 'month', 'day', 'time'] as const).filter((k) => chart.pillars[k])
  const parts: string[] = []
  for (const k of keys) {
    const p = chart.pillars[k]!
    if (want.includes(p.shi_shen_gan)) parts.push(`${p.shi_shen_gan}透${GAN_POS[k]}`)
    p.shi_shen_zhi.forEach((ss) => {
      if (want.includes(ss)) {
        const item = `${ss}藏${ZHI_POS[k]}`
        if (!parts.includes(item)) parts.push(item)
      }
    })
  }
  const scope = chart.pillars.time ? '' : '（时柱未知，按三柱论）'
  if (!parts.length) return `盘内不见${want.join('、')}，配偶星不显${scope}。`
  return `${trans ? '' : '配偶星不透干，'}${parts.join('、')}${scope}。`
}

// 三条相处建议：年日冲合、五行互补、配偶星状态，各出一条，全部由盘面推出
export function pairingAdvice(
  a: BaziResult,
  b: BaziResult,
  aGender: 'male' | 'female',
  bGender: 'male' | 'female',
): string[] {
  const rows = pillarRows(a, b)
  const rels = rows.filter((r) => r.label === '年柱' || r.label === '日柱').map((r) => r.rel)
  const first = rels.includes('chong')
    ? '年日之间见冲，棱角难免——争执时先隔半刻，话凉一凉再出口。'
    : rels.includes('he')
      ? '年日之间有合，底子相投——默契之外，大事仍要摆上桌面说清。'
      : '年日之间无冲无合，相处如常水——定时留一段只属于两个人的时光。'

  const missA = a.wuxing_missing
  const missB = b.wuxing_missing
  const fillForA = missA.find((e) => b.wuxing_count[e] >= 2)
  const fillForB = missB.find((e) => a.wuxing_count[e] >= 2)
  const bothLack = missA.filter((e) => missB.includes(e))
  const second = fillForA
    ? `对方${fillForA}旺，恰补你之所缺——这方面的事，多听对方一面之词。`
    : fillForB
      ? `你${fillForB}旺，恰补对方之所缺——这类担子你多担一点。`
      : bothLack.length
        ? `两盘同缺${bothLack.join('、')}——要刻意立个章程，别指望对方天然兜底。`
        : '两盘五行各有偏重，分工各用所长，不必强求处处同步。'

  const sa = spouseStarScan(a, aGender)
  const sb = spouseStarScan(b, bGender)
  const third = sa.trans && sb.trans
    ? '两造配偶星都透干，情分都摆在明处——有话直说，胜过冷战。'
    : !sa.any && !sb.any
      ? '两造配偶星都不显，感情宜慢火细炖——多给彼此一点确认，别急着要答案。'
      : !sa.any
        ? '你方配偶星不显——心里的话要说出口，别等人猜。'
        : '对方配偶星不显——TA 的在意多半藏在事里，别只听话头。'

  return [first, second, third]
}

export function relationNotes(a: BaziResult, b: BaziResult): string[] {
  const rel = relationBetween(a, b)
  return [rel.gan_rel, rel.couple_rel, rel.complement]
}
