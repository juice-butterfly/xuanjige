import { swisseph, SiderealMode, HouseSystem } from '@swisseph/browser'
import { chinaLocalToUT, daysFromCivil, civilFromDays } from './timecn.ts'
import { SIGN_CN } from './signs.ts'

// 与原实现 PyJHora drik.PLANET_FLAGS 逐位对齐：
// SWIEPH(2) | TRUEPOS(16) | NONUT(64) | SPEED(256) | NOGDEFL(512) | SIDEREAL(65536)
export const PLANET_FLAGS = 66386
const AYANAMSA_FLAGS = PLANET_FLAGS & ~(64 * 1024)

const SIGN_EN = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
]

const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu',
  'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta',
  'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha',
  'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada',
  'Uttara Bhadrapada', 'Revati',
]
// 27 宿宿主九星循环，从 Ashwini 起
const NAK_LORDS = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury']
const NAK_SPAN = 40 / 3 // 13°20'
const NAK_PADA = 10 / 3 // 3°20'

const DASHA_ORDER = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury']
const DASHA_YEARS: Record<string, number> = {
  Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17,
}
const YEAR_DAYS = 365.25

// 九曜输出顺序（03 第三节）
const GRAHAS: Array<{ cn: string; en: string; body: number }> = [
  { cn: '太阳', en: 'Sun', body: 0 },
  { cn: '月亮', en: 'Moon', body: 1 },
  { cn: '火星', en: 'Mars', body: 4 },
  { cn: '水星', en: 'Mercury', body: 2 },
  { cn: '木星', en: 'Jupiter', body: 5 },
  { cn: '金星', en: 'Venus', body: 3 },
  { cn: '土星', en: 'Saturn', body: 6 },
]
const MEAN_NODE = 10 // SE_MEAN_NODE，平均节点
const SIGN_LORDS = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter']
const OWN_SIGNS: Record<string, number[]> = {
  Mars: [0, 7], Mercury: [2, 5], Jupiter: [8, 11], Venus: [1, 6], Saturn: [9, 10],
}
const DEBILITATION: Record<string, number> = {
  Sun: 6, Moon: 7, Mars: 3, Mercury: 11, Jupiter: 9, Venus: 5, Saturn: 0,
}

export interface VedicInput {
  dob: string
  time: string
  place: string
  lat: number
  lon: number
}

export interface VedicPlanet {
  planet: string
  sign_cn: string
  house: number
  degree: string
  retro: boolean
  nakshatra: string
}

export interface VedicDasha {
  md_planet: string
  md_start: string
  md_end: string
  is_current: boolean
  ad_planet: string | null
  ad_start: string | null
  ad_end: string | null
}

export interface VedicResult {
  lagna: { sign: string; sign_cn: string; degree: string; nakshatra: string }
  planets: VedicPlanet[]
  moon_nakshatra: { name: string; pada: number; lord: string }
  dasha: VedicDasha[]
  yogas: Record<string, boolean>
  karakas: { AK: string; AmK: string; DK: string }
  moon_phase: boolean
  ayanamsa: number
  meta: {
    dob: string
    time: string
    place: string
    lat: number
    lon: number
    ayanamsa: number
  }
}

let initialized = false

export async function initVedic(wasmPath = '/swisseph.wasm'): Promise<void> {
  if (initialized) return
  await swisseph.init(wasmPath)
  swisseph.setSiderealMode(SiderealMode.TrueCitra, 0, 0)
  initialized = true
}

export function isVedicReady(): boolean {
  return initialized
}

function norm360(x: number): number {
  return ((x % 360) + 360) % 360
}

// 度°分' 两位对齐
function formatDegree(siderealLon: number): string {
  const within = norm360(siderealLon) % 30
  const totalMin = Math.floor(within * 60)
  const deg = Math.floor(totalMin / 60)
  const min = totalMin % 60
  return `${String(deg).padStart(2, '0')}°${String(min).padStart(2, '0')}'`
}

function nakOf(siderealLon: number): { idx: number; pada: number; frac: number } {
  const lon = norm360(siderealLon)
  const idx = Math.min(26, Math.floor(lon / NAK_SPAN))
  const rem = lon - idx * NAK_SPAN
  return { idx, pada: Math.min(4, Math.floor(rem / NAK_PADA) + 1), frac: rem / NAK_SPAN }
}

function jdToISO(jd: number): string {
  const [y, m, d] = civilFromDays(Math.floor(jd + 0.5) - 2440588)
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function isoToJd(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return daysFromCivil(y, m, d) + 2440587.5
}

function todayISO(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

// 整宫制：以 fromSign 为第 1 宫
function houseFrom(fromSign: number, toSign: number): number {
  return ((toSign - fromSign + 12) % 12) + 1
}

export async function calcVedic(input: VedicInput, now = todayISO()): Promise<VedicResult> {
  await initVedic()

  const [y, mo, d] = input.dob.split('-').map(Number)
  const [hh, mi] = input.time.split(':').map(Number)
  const ut = chinaLocalToUT(y, mo, d, hh, mi)
  const jd = swisseph.julianDay(ut.year, ut.month, ut.day, ut.hour)
  const ayanamsa = swisseph.getAyanamsaExUt(jd, AYANAMSA_FLAGS)

  // 九曜恒星黄经（66386 含 SIDEREAL 位，直接返回恒星黄经）与整宫宫位
  const lagnaTrop = swisseph.calculateHouses(jd, input.lat, input.lon, HouseSystem.WholeSign).ascendant
  const lagnaLon = norm360(lagnaTrop - ayanamsa)
  const lagnaSign = Math.floor(lagnaLon / 30)

  const grahas: Array<{ en: string; cn: string; lon: number; speed: number; retro: boolean }> = []
  for (const g of GRAHAS) {
    const r = swisseph.calculatePosition(jd, g.body, PLANET_FLAGS)
    grahas.push({ en: g.en, cn: g.cn, lon: norm360(r.longitude), speed: r.longitudeSpeed, retro: r.longitudeSpeed < 0 })
  }
  // Rahu 用平均节点，Ketu = Rahu + 180°，两者永远逆行
  const rahu = swisseph.calculatePosition(jd, MEAN_NODE, PLANET_FLAGS)
  grahas.push({ en: 'Rahu', cn: '罗睺', lon: norm360(rahu.longitude), speed: rahu.longitudeSpeed, retro: true })
  grahas.push({ en: 'Ketu', cn: '计都', lon: norm360(rahu.longitude + 180), speed: rahu.longitudeSpeed, retro: true })

  const planets: VedicPlanet[] = grahas.map((g) => {
    const sign = Math.floor(g.lon / 30)
    return {
      planet: g.cn,
      sign_cn: SIGN_CN[sign],
      house: houseFrom(lagnaSign, sign),
      degree: formatDegree(g.lon),
      retro: g.retro,
      nakshatra: NAKSHATRAS[nakOf(g.lon).idx],
    }
  })

  const moonSid = grahas[1].lon
  const sunSid = grahas[0].lon
  const moonNak = nakOf(moonSid)

  return {
    lagna: {
      sign: SIGN_EN[lagnaSign],
      sign_cn: SIGN_CN[lagnaSign],
      degree: formatDegree(lagnaLon),
      nakshatra: NAKSHATRAS[nakOf(lagnaLon).idx],
    },
    planets,
    moon_nakshatra: {
      name: NAKSHATRAS[moonNak.idx],
      pada: moonNak.pada,
      lord: NAK_LORDS[moonNak.idx % 9],
    },
    dasha: buildDasha(jd, moonSid, isoToJd(now)),
    yogas: computeYogas(lagnaSign, grahas),
    karakas: computeKarakas(grahas),
    moon_phase: norm360(moonSid - sunSid) < 180,
    ayanamsa: Math.round(ayanamsa * 100) / 100,
    meta: {
      dob: input.dob,
      time: input.time,
      place: input.place,
      lat: input.lat,
      lon: input.lon,
      ayanamsa: Math.round(ayanamsa * 100) / 100,
    },
  }
}

export interface LuminarySide {
  lagna: { sign_cn: string; degree: string } | null
  sun: { sign_cn: string; degree: string; house: number | null }
  moon: { sign_cn: string; degree: string; house: number | null }
  ayanamsa: number
}

// 关系人对照用：只取上升、太阳、月亮。时辰不详时上升留空、
// 日月按正午估算（边界日期有出入），宫位一并留空，不猜。
export async function calcLuminaries(input: {
  dob: string
  time: string | null
  lat: number
  lon: number
}): Promise<LuminarySide> {
  await initVedic()

  const [y, mo, d] = input.dob.split('-').map(Number)
  const [hh, mi] = input.time ? input.time.split(':').map(Number) : [12, 0]
  const ut = chinaLocalToUT(y, mo, d, hh, mi)
  const jd = swisseph.julianDay(ut.year, ut.month, ut.day, ut.hour)
  const ayanamsa = swisseph.getAyanamsaExUt(jd, AYANAMSA_FLAGS)

  const sunLon = norm360(swisseph.calculatePosition(jd, 0, PLANET_FLAGS).longitude)
  const moonLon = norm360(swisseph.calculatePosition(jd, 1, PLANET_FLAGS).longitude)

  let lagna: LuminarySide['lagna'] = null
  let sunHouse: number | null = null
  let moonHouse: number | null = null
  if (input.time) {
    const lagnaTrop = swisseph.calculateHouses(jd, input.lat, input.lon, HouseSystem.WholeSign).ascendant
    const lagnaLon = norm360(lagnaTrop - ayanamsa)
    const lagnaSign = Math.floor(lagnaLon / 30)
    lagna = { sign_cn: SIGN_CN[lagnaSign], degree: formatDegree(lagnaLon) }
    sunHouse = houseFrom(lagnaSign, Math.floor(sunLon / 30))
    moonHouse = houseFrom(lagnaSign, Math.floor(moonLon / 30))
  }

  return {
    lagna,
    sun: { sign_cn: SIGN_CN[Math.floor(sunLon / 30)], degree: formatDegree(sunLon), house: sunHouse },
    moon: { sign_cn: SIGN_CN[Math.floor(moonLon / 30)], degree: formatDegree(moonLon), house: moonHouse },
    ayanamsa: Math.round(ayanamsa * 100) / 100,
  }
}

function computeKarakas(grahas: Array<{ en: string; lon: number }>): { AK: string; AmK: string; DK: string } {
  // Jaimini 七 karaka：太阳…土星按星座内度数降序，第 1 位 AK，第 3 位 AmK，第 7 位 DK
  const seven = grahas
    .filter((g) => ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'].includes(g.en))
    .map((g) => ({ en: g.en, within: g.lon % 30 }))
    .sort((a, b) => b.within - a.within)
  return { AK: seven[0].en, AmK: seven[2].en, DK: seven[6].en }
}

function computeYogas(
  lagnaSign: number,
  grahas: Array<{ en: string; lon: number; retro: boolean }>,
): Record<string, boolean> {
  const byName = Object.fromEntries(grahas.map((g) => [g.en, g]))
  const signOf = (name: string) => Math.floor(byName[name].lon / 30)
  const housesTo = (fromSign: number, name: string) => houseFrom(fromSign, signOf(name))
  const KENDRA = [1, 4, 7, 10]

  // Gajakesari：木星在月亮起算的第 1/4/7/10 宫
  const gajakesari = KENDRA.includes(housesTo(signOf('Moon'), 'Jupiter'))

  // Budhaditya：太阳与水星同宫
  const budhaditya = signOf('Sun') === signOf('Mercury')

  // Chandra-Mangala：月亮与火星同宫或互看（互为 7 宫）
  const chandraMangala =
    signOf('Moon') === signOf('Mars') ||
    housesTo(signOf('Moon'), 'Mars') === 7 ||
    housesTo(signOf('Mars'), 'Moon') === 7

  // Panch Mahapurusha：火/水/木/金/土任一在自身星座且在上升起算的 1/4/7/10 宫
  const panchMahapurusha = (['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'] as const).some(
    (p) => OWN_SIGNS[p].includes(signOf(p)) && KENDRA.includes(housesTo(lagnaSign, p)),
  )

  // Kemadruma：月亮前后（2/12 宫）无行星，太阳不算
  const kemadruma = (['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'] as const).every(
    (p) => ![2, 12].includes(housesTo(signOf('Moon'), p)),
  )

  // Raja Yoga：九宫主与十宫主同宫或互看
  const lordOfHouse = (h: number) => SIGN_LORDS[(lagnaSign + h - 1) % 12]
  const sameOrMutual7 = (a: string, b: string) =>
    signOf(a) === signOf(b) || housesTo(signOf(a), b) === 7
  const rajaYoga = sameOrMutual7(lordOfHouse(9), lordOfHouse(10))

  // Dhana Yoga：二宫主与十一宫主同宫或互看
  const dhanaYoga = sameOrMutual7(lordOfHouse(2), lordOfHouse(11))

  // Neecha Bhanga：落陷星的定位星（其星座守护星）在上升起算的四正宫
  const neechaBhanga = (Object.entries(DEBILITATION) as Array<[string, number]>).some(([p, sign]) => {
    if (signOf(p) !== sign) return false
    return KENDRA.includes(housesTo(lagnaSign, SIGN_LORDS[sign]))
  })

  return {
    Gajakesari: gajakesari,
    Budhaditya: budhaditya,
    'Chandra-Mangala': chandraMangala,
    'Panch Mahapurusha': panchMahapurusha,
    Kemadruma: kemadruma,
    'Raja Yoga': rajaYoga,
    'Dhana Yoga': dhanaYoga,
    'Neecha Bhanga': neechaBhanga,
  }
}

function buildDasha(birthJd: number, moonSid: number, nowJd: number): VedicDasha[] {
  const nak = nakOf(moonSid)
  const startIdx = DASHA_ORDER.indexOf(NAK_LORDS[nak.idx % 9])
  const total = 120 * YEAR_DAYS
  const endAll = birthJd + total

  interface Span { lord: string; start: number; end: number }
  const mds: Span[] = []
  let cursor = birthJd
  for (let k = 0; k < 9 && cursor < endAll - 1e-9; k++) {
    const lord = DASHA_ORDER[(startIdx + k) % 9]
    // k===0：宿内已过 nak.frac，出生时只剩 (1−frac)；其余为主运整段
    const years = k === 0 ? DASHA_YEARS[lord] * (1 - nak.frac) : DASHA_YEARS[lord]
    const end = cursor + years * YEAR_DAYS
    mds.push({ lord, start: cursor, end })
    cursor = end
  }

  return mds.map((md) => {
    const isCurrent = nowJd >= md.start && nowJd < md.end
    const row: VedicDasha = {
      md_planet: md.lord,
      md_start: jdToISO(md.start),
      md_end: jdToISO(md.end),
      is_current: isCurrent,
      ad_planet: null,
      ad_start: null,
      ad_end: null,
    }
    if (isCurrent) {
      const lordIdx = DASHA_ORDER.indexOf(md.lord)
      let c = md.start
      for (let j = 0; j < 9; j++) {
        const adLord = DASHA_ORDER[(lordIdx + j) % 9]
        const adEnd = c + ((md.end - md.start) * DASHA_YEARS[adLord]) / 120
        if (nowJd >= c && nowJd < adEnd) {
          row.ad_planet = adLord
          row.ad_start = jdToISO(c)
          row.ad_end = jdToISO(adEnd)
          break
        }
        c = adEnd
      }
    }
    return row
  })
}
