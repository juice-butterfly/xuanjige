import { Solar, type EightChar } from 'lunar-javascript'

export type Element = '金' | '木' | '水' | '火' | '土'
export type Gender = '男' | '女'
export type PillarKey = 'year' | 'month' | 'day' | 'time'
type PillarPart = 'Year' | 'Month' | 'Day' | 'Time'

export interface Pillar {
  ganzhi: string
  nayin: string
  gan_element: Element
  zhi_element: Element
  hidden_gan: string[]
  shi_shen_gan: string
  shi_shen_zhi: string[]
}

export interface Dayun {
  ganzhi: string
  start_age: number
  end_age: number
  start_year: number
  end_year: number
}

export interface Liunian {
  year: number
  ganzhi: string
  yingshi: string
}

export interface BaziResult {
  solar: string
  lunar: string
  zodiac: string
  pillars: { year: Pillar; month: Pillar; day: Pillar; time: Pillar | null }
  day_master: string
  day_master_element: Element
  wuxing_count: Record<Element, number>
  wuxing_missing: Element[]
  wuxing_strength: Record<Element, number>
  wuxing_normalized: Record<Element, number>
  day_strength: string
  favorable: string[]
  diaohou: string
  dayun: Dayun[]
  current_dayun: string
  liunian: Liunian[]
  zhi_relations: string
  shen_sha: Record<string, PillarKey[]>
  xun_kong: Record<PillarKey, string>
  di_shi: Record<PillarKey, string>
  ming_shen: { 命宫: string; 身宫: string; 胎元: string; 胎息: string }
}

export interface RelationResult {
  gan_rel: string
  couple_rel: string
  cross_zhi_rel: string
  complement: string
  day_gan_a: string
  day_gan_b: string
  day_zhi_a: string
  day_zhi_b: string
}

export const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
export const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
const ELEM_STEM: Element[] = ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水']
const ELEM_BRANCH: Record<string, Element> = {
  子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火',
  午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水',
}

const SEASON_STRENGTH: Record<string, Record<Element, number>> = {
  寅: { 木: 1.5, 火: 1.2, 水: 0.8, 金: 0.5, 土: 0.3 },
  卯: { 木: 1.5, 火: 1.2, 水: 0.8, 金: 0.5, 土: 0.3 },
  辰: { 木: 1.2, 火: 1.0, 水: 0.8, 金: 0.6, 土: 1.5 },
  巳: { 火: 1.5, 土: 1.2, 木: 0.8, 水: 0.5, 金: 0.3 },
  午: { 火: 1.5, 土: 1.2, 木: 0.8, 水: 0.5, 金: 0.3 },
  未: { 火: 1.2, 土: 1.5, 木: 0.8, 水: 0.6, 金: 0.5 },
  申: { 金: 1.5, 水: 1.2, 土: 0.8, 火: 0.5, 木: 0.3 },
  酉: { 金: 1.5, 水: 1.2, 土: 0.8, 火: 0.5, 木: 0.3 },
  戌: { 金: 1.2, 水: 1.0, 土: 1.5, 火: 0.6, 木: 0.5 },
  亥: { 水: 1.5, 木: 1.2, 金: 0.8, 土: 0.5, 火: 0.3 },
  子: { 水: 1.5, 木: 1.2, 金: 0.8, 土: 0.5, 火: 0.3 },
  丑: { 水: 1.2, 木: 1.0, 金: 0.8, 土: 1.5, 火: 0.5 },
}

const HIDDEN_WEIGHT = [0.6, 0.3, 0.1]
const HIDDEN: Record<string, string[]> = {
  子: ['癸'], 丑: ['己', '癸', '辛'], 寅: ['甲', '丙', '戊'], 卯: ['乙'],
  辰: ['戊', '乙', '癸'], 巳: ['丙', '庚', '戊'], 午: ['丁', '己'],
  未: ['己', '丁', '乙'], 申: ['庚', '壬', '戊'], 酉: ['辛'],
  戌: ['戊', '辛', '丁'], 亥: ['壬', '甲'],
}
const SHENG: Record<Element, Element> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }
const KE: Record<Element, Element> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' }

const LIU_HE: Record<string, string> = {
  子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯',
  辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午',
}
const LIU_HE_HUA: Record<string, Element> = {
  子丑: '土', 寅亥: '木', 卯戌: '火', 辰酉: '金', 巳申: '水', 午未: '土',
}
const LIU_CHONG: Record<string, string> = {
  子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅',
  卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳',
}
const XIANG_XING: Record<string, string[]> = {
  寅: ['巳', '申'], 巳: ['寅', '申'], 申: ['寅', '巳'],
  丑: ['戌', '未'], 戌: ['丑', '未'], 未: ['丑', '戌'],
  子: ['卯'], 卯: ['子'],
  辰: ['辰'], 午: ['午'], 酉: ['酉'], 亥: ['亥'],
}
const XIANG_HAI: Record<string, string> = {
  子: '未', 未: '子', 丑: '午', 午: '丑', 寅: '巳', 巳: '寅',
  卯: '辰', 辰: '卯', 申: '亥', 亥: '申', 酉: '戌', 戌: '酉',
}
const XIANG_PO: Record<string, string> = {
  子: '酉', 酉: '子', 卯: '午', 午: '卯', 辰: '丑', 丑: '辰',
  戌: '未', 未: '戌', 寅: '亥', 亥: '寅', 巳: '申', 申: '巳',
}

const YI_MA: Record<string, string> = {
  申: '寅', 子: '寅', 辰: '寅',
  寅: '申', 午: '申', 戌: '申',
  巳: '亥', 酉: '亥', 丑: '亥',
  亥: '巳', 卯: '巳', 未: '巳',
}
const TAO_HUA: Record<string, string> = {
  申: '酉', 子: '酉', 辰: '酉',
  寅: '卯', 午: '卯', 戌: '卯',
  巳: '午', 酉: '午', 丑: '午',
  亥: '子', 卯: '子', 未: '子',
}
const HUA_GAI: Record<string, string> = {
  申: '辰', 子: '辰', 辰: '辰',
  寅: '戌', 午: '戌', 戌: '戌',
  巳: '丑', 酉: '丑', 丑: '丑',
  亥: '未', 卯: '未', 未: '未',
}
const JIANG_XING: Record<string, string> = {
  申: '子', 子: '子', 辰: '子',
  寅: '午', 午: '午', 戌: '午',
  巳: '酉', 酉: '酉', 丑: '酉',
  亥: '卯', 卯: '卯', 未: '卯',
}
const WANG_SHEN: Record<string, string> = {
  申: '亥', 子: '亥', 辰: '亥',
  寅: '巳', 午: '巳', 戌: '巳',
  巳: '申', 酉: '申', 丑: '申',
  亥: '寅', 卯: '寅', 未: '寅',
}
const JIE_SHA: Record<string, string> = {
  申: '巳', 子: '巳', 辰: '巳',
  寅: '亥', 午: '亥', 戌: '亥',
  巳: '寅', 酉: '寅', 丑: '寅',
  亥: '申', 卯: '申', 未: '申',
}
const GU_CHEN: Record<string, string> = {
  亥: '寅', 子: '寅', 丑: '寅',
  寅: '巳', 卯: '巳', 辰: '巳',
  巳: '申', 午: '申', 未: '申',
  申: '亥', 酉: '亥', 戌: '亥',
}
const GUA_SU: Record<string, string> = {
  亥: '戌', 子: '戌', 丑: '戌',
  寅: '丑', 卯: '丑', 辰: '丑',
  巳: '辰', 午: '辰', 未: '辰',
  申: '未', 酉: '未', 戌: '未',
}

function stemIndex(gan: string): number {
  const index = STEMS.indexOf(gan)
  if (index < 0) throw new Error(`未知天干：${gan}`)
  return index
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('')
}

const WU_HE: Record<string, string> = {
  甲己: '土', 乙庚: '金', 丙辛: '水', 丁壬: '木', 戊癸: '火',
}

// 合婚对照用：两支之间的六合（带所化）或六冲，无则 null
export function branchPairRel(a: string, b: string): { rel: 'he' | 'chong'; hua: string } | null {
  if (LIU_HE[a] === b) return { rel: 'he', hua: LIU_HE_HUA[pairKey(a, b)] ?? '' }
  if (LIU_CHONG[a] === b) return { rel: 'chong', hua: '' }
  return null
}

// 两天干五合所化之行，无则 null
export function stemPairHe(a: string, b: string): string | null {
  return WU_HE[pairKey(a, b)] ?? null
}

function readPillar(ec: EightChar, part: PillarPart): { gz: string; nayin: string } {
  switch (part) {
    case 'Year':
      return { gz: ec.getYear(), nayin: ec.getYearNaYin() }
    case 'Month':
      return { gz: ec.getMonth(), nayin: ec.getMonthNaYin() }
    case 'Day':
      return { gz: ec.getDay(), nayin: ec.getDayNaYin() }
    case 'Time':
      return { gz: ec.getTime(), nayin: ec.getTimeNaYin() }
  }
}

function readXunKong(ec: EightChar, part: PillarPart): string {
  switch (part) {
    case 'Year':
      return ec.getYearXunKong()
    case 'Month':
      return ec.getMonthXunKong()
    case 'Day':
      return ec.getDayXunKong()
    case 'Time':
      return ec.getTimeXunKong()
  }
}

function readDiShi(ec: EightChar, part: PillarPart): string {
  switch (part) {
    case 'Year':
      return ec.getYearDiShi()
    case 'Month':
      return ec.getMonthDiShi()
    case 'Day':
      return ec.getDayDiShi()
    case 'Time':
      return ec.getTimeDiShi()
  }
}

export function shiShen(dayGan: string, otherGan: string): string {
  const dayIndex = stemIndex(dayGan)
  const otherIndex = stemIndex(otherGan)
  const dayElement = ELEM_STEM[dayIndex]
  const otherElement = ELEM_STEM[otherIndex]
  const same = dayIndex % 2 === otherIndex % 2

  if (dayElement === otherElement) return same ? '比肩' : '劫财'
  if (SHENG[dayElement] === otherElement) return same ? '食神' : '伤官'
  if (SHENG[otherElement] === dayElement) return same ? '偏印' : '正印'
  if (KE[dayElement] === otherElement) return same ? '偏财' : '正财'
  return same ? '七杀' : '正官'
}

function makePillar(ec: EightChar, dayGan: string, part: PillarPart): Pillar {
  const { gz, nayin } = readPillar(ec, part)
  const gan = gz[0]
  const zhi = gz[1]
  const hidden = HIDDEN[zhi] ?? []
  return {
    ganzhi: gz,
    nayin,
    gan_element: ELEM_STEM[stemIndex(gan)],
    zhi_element: ELEM_BRANCH[zhi],
    hidden_gan: [...hidden],
    shi_shen_gan: part === 'Day' ? '' : shiShen(dayGan, gan),
    shi_shen_zhi: hidden.map((h) => shiShen(dayGan, h)),
  }
}

function zhiRelationStr(zhiList: string[]): string {
  const out: string[] = []
  const seenPairs = new Set<string>()
  for (let i = 0; i < zhiList.length; i++) {
    for (let j = i + 1; j < zhiList.length; j++) {
      const a = zhiList[i]
      const b = zhiList[j]
      const key = pairKey(a, b)
      if (seenPairs.has(key)) continue
      seenPairs.add(key)

      const rel: string[] = []
      if (LIU_HE[a] === b) {
        const hua = LIU_HE_HUA[key] ?? ''
        rel.push(`${a}${b}六合${hua ? `化${hua}` : ''}`)
      }
      if (LIU_CHONG[a] === b) rel.push(`${a}${b}相冲`)
      if ((XIANG_XING[a] ?? []).includes(b)) rel.push(`${a}${b}相刑`)
      if (XIANG_HAI[a] === b) rel.push(`${a}${b}相害`)
      if (XIANG_PO[a] === b) rel.push(`${a}${b}相破`)
      if (rel.length) out.push(rel.join('、'))
    }
  }
  return out.length ? out.join('；') : '（四支之间无冲合刑害）'
}

function shenSha(pillars: BaziResult['pillars']): Record<string, PillarKey[]> {
  const yearZhi = pillars.year.ganzhi[1]
  const dayZhi = pillars.day.ganzhi[1]
  const monthZhi = pillars.month.ganzhi[1]

  const zhiByPos: Partial<Record<PillarKey, string>> = {
    year: yearZhi,
    month: monthZhi,
    day: dayZhi,
  }
  if (pillars.time) zhiByPos.time = pillars.time.ganzhi[1]
  const posOfZhi: Record<string, PillarKey[]> = {}
  for (const [pos, zhi] of Object.entries(zhiByPos) as [PillarKey, string][]) {
    ;(posOfZhi[zhi] ??= []).push(pos)
  }

  const result: Record<string, PillarKey[]> = {}
  function add(name: string, target: string | undefined) {
    if (!target) return
    for (const pos of posOfZhi[target] ?? []) {
      ;(result[name] ??= []).push(pos)
    }
  }

  add('驿马', YI_MA[yearZhi])
  add('桃花', TAO_HUA[yearZhi])
  add('华盖', HUA_GAI[yearZhi])
  add('将星', JIANG_XING[yearZhi])
  add('亡神', WANG_SHEN[yearZhi])
  add('劫煞', JIE_SHA[yearZhi])
  add('孤辰', GU_CHEN[yearZhi])
  add('寡宿', GUA_SU[yearZhi])

  add('驿马', YI_MA[dayZhi])
  add('桃花', TAO_HUA[dayZhi])
  add('华盖', HUA_GAI[dayZhi])
  add('将星', JIANG_XING[dayZhi])
  add('亡神', WANG_SHEN[dayZhi])
  add('劫煞', JIE_SHA[dayZhi])

  const order: Record<PillarKey, number> = { year: 0, month: 1, day: 2, time: 3 }
  for (const name of Object.keys(result)) {
    result[name] = [...new Set(result[name])].sort((a, b) => order[a] - order[b])
  }
  return result
}

function liunianYingshi(
  liunianGanzhi: string,
  pillars: BaziResult['pillars'],
  dayGan: string,
): string {
  if (liunianGanzhi.length !== 2) return ''
  const gan = liunianGanzhi[0]
  const zhi = liunianGanzhi[1]
  const keys: PillarKey[] = (['year', 'month', 'day', 'time'] as const).filter(
    (k) => pillars[k],
  ) as PillarKey[]
  const POS_CN: Partial<Record<PillarKey, string>> = {
    year: '年柱', month: '月柱', day: '日柱', time: '时柱',
  }
  const tips: string[] = []

  keys.forEach((key) => {
    const branch = pillars[key]!.ganzhi[1]
    const pos = POS_CN[key] ?? ''
    if (LIU_CHONG[zhi] === branch) {
      tips.push(`流年${zhi}冲${pos}${branch}（变动、冲撞，该宫位易有波折）`)
    } else if (LIU_HE[zhi] === branch) {
      const hua = LIU_HE_HUA[pairKey(zhi, branch)] ?? ''
      tips.push(`流年${zhi}与${pos}${branch}六合${hua ? `化${hua}` : ''}（合好、顺遂，利于该宫位事务）`)
    } else if ((XIANG_XING[zhi] ?? []).includes(branch)) {
      tips.push(`流年${zhi}与${pos}${branch}相刑（易有摩擦、口舌、隐忧）`)
    } else if (XIANG_HAI[zhi] === branch) {
      tips.push(`流年${zhi}与${pos}${branch}相害（易有小人、损耗、暗伤）`)
    }
  })

  const yearZhi = pillars.year.ganzhi[1]
  const dayZhi = pillars.day.ganzhi[1]
  if (YI_MA[yearZhi] === zhi || YI_MA[dayZhi] === zhi) {
    tips.push(`流年${zhi}逢驿马（主走动、搬迁、出行、变动）`)
  }
  if (TAO_HUA[yearZhi] === zhi || TAO_HUA[dayZhi] === zhi) {
    tips.push(`流年${zhi}逢桃花（主姻缘、人缘、情缘，易有感情际遇）`)
  }
  if (gan && dayGan) {
    const ss = shiShen(dayGan, gan)
    tips.push(`流年天干${gan}为${ss}（${ss}主事）`)
  }
  return tips.length ? tips.join('；') : `（与命局四柱无直接冲合，流年天干${gan}主事）`
}

/**
 * 逐函数对照 素材/bazi.py。nowYear 由调用方传入，保证排盘是纯函数。
 * timePrecise / place 仅为保持原签名，原实现不做真太阳时校正，这里同样不用。
 */
export function calcBazi(
  year: number,
  month: number,
  day: number,
  hour: number | null,
  minute: number | null,
  gender: Gender = '男',
  _timePrecise = true,
  _place = '',
  nowYear: number,
): BaziResult {
  // 时辰不详：只排年月日三柱，时柱不猜（聚合、神煞、命宫一律不含时柱）
  const hasTime = hour !== null && minute !== null
  const solar = Solar.fromYmdHms(year, month, day, hour ?? 0, minute ?? 0, 0)
  const lunar = solar.getLunar()
  const ec = lunar.getEightChar()
  ec.setSect(2)
  const dayGan = ec.getDay()[0]

  const pillars: BaziResult['pillars'] = {
    year: makePillar(ec, dayGan, 'Year'),
    month: makePillar(ec, dayGan, 'Month'),
    day: makePillar(ec, dayGan, 'Day'),
    time: hasTime ? makePillar(ec, dayGan, 'Time') : null,
  }

  const usedGz = [pillars.year.ganzhi, pillars.month.ganzhi, pillars.day.ganzhi]
  if (pillars.time) usedGz.push(pillars.time.ganzhi)
  const wuxing: Record<Element, number> = { 金: 0, 木: 0, 水: 0, 火: 0, 土: 0 }
  for (const gz of usedGz) {
    wuxing[ELEM_STEM[stemIndex(gz[0])]] += 1
    wuxing[ELEM_BRANCH[gz[1]]] += 1
  }
  const elements = Object.keys(wuxing) as Element[]
  const missing = elements.filter((e) => wuxing[e] === 0)

  const zhiList = usedGz.map((gz) => gz[1])
  const zhiRelations = zhiRelationStr(zhiList)
  const shen_sha = shenSha(pillars)

  const xun_kong: Record<PillarKey, string> = {
    year: readXunKong(ec, 'Year'),
    month: readXunKong(ec, 'Month'),
    day: readXunKong(ec, 'Day'),
    time: hasTime ? readXunKong(ec, 'Time') : '',
  }
  const di_shi: Record<PillarKey, string> = {
    year: readDiShi(ec, 'Year'),
    month: readDiShi(ec, 'Month'),
    day: readDiShi(ec, 'Day'),
    time: hasTime ? readDiShi(ec, 'Time') : '',
  }
  // 命宫身宫由月支与时支推得，时辰不详则留空，不猜
  const ming_shen = {
    命宫: hasTime ? ec.getMingGong() || '' : '',
    身宫: hasTime ? ec.getShenGong() || '' : '',
    胎元: ec.getTaiYuan() || '',
    胎息: ec.getTaiXi() || '',
  }

  const monthZhi = pillars.month.ganzhi[1]
  const seasonWeight =
    SEASON_STRENGTH[monthZhi] ??
    ({ 金: 1.0, 木: 1.0, 水: 1.0, 火: 1.0, 土: 1.0 } as Record<Element, number>)

  const wuxingStrength: Record<Element, number> = { 金: 0, 木: 0, 水: 0, 火: 0, 土: 0 }
  for (const pillar of [pillars.year, pillars.month, pillars.day, ...(pillars.time ? [pillars.time] : [])]) {
    const gan = pillar.ganzhi[0]
    const zhi = pillar.ganzhi[1]
    const element = ELEM_STEM[stemIndex(gan)]
    wuxingStrength[element] += seasonWeight[element]

    const hidden = HIDDEN[zhi] ?? []
    for (let i = 0; i < hidden.length && i < HIDDEN_WEIGHT.length; i++) {
      const hiddenElement = ELEM_STEM[stemIndex(hidden[i])]
      wuxingStrength[hiddenElement] += seasonWeight[hiddenElement] * HIDDEN_WEIGHT[i]
    }
  }

  const maxStrength = Math.max(...elements.map((e) => wuxingStrength[e])) || 1.0
  const wuxingNormalized = {} as Record<Element, number>
  for (const e of elements) {
    wuxingNormalized[e] = Math.round((wuxingStrength[e] / maxStrength) * 10 * 100) / 100
  }

  const dayElement = ELEM_STEM[stemIndex(dayGan)]
  const dayScore = wuxingStrength[dayElement]
  const others = elements.filter((e) => e !== dayElement).map((e) => wuxingStrength[e])
  const othersAvg = others.reduce((sum, v) => sum + v, 0) / others.length
  let dayStrength = '中和'
  if (dayScore >= othersAvg * 1.3 && dayScore > 6) dayStrength = '身旺'
  else if (dayScore <= othersAvg * 0.7 && dayScore < 4) dayStrength = '身弱'

  const XIYONG: Record<string, string[]> = {
    身旺: ['官杀', '食伤', '财'],
    身弱: ['印', '比劫'],
    中和: ['调候用神', '扶抑平衡'],
  }
  const favorable = [...XIYONG[dayStrength]]

  const DIAOHOU: Record<string, string> = {
    寅: '丙火', 卯: '丙火', 辰: '壬水', 巳: '壬水', 午: '壬水',
    未: '癸水', 申: '丁火', 酉: '丁火', 戌: '甲木', 亥: '戊土',
    子: '戊土', 丑: '丙火',
  }
  const diaohou = DIAOHOU[monthZhi] ?? ''

  const dayun: Dayun[] = []
  if (hasTime) {
    try {
      const yun = ec.getYun(gender === '男' ? 1 : 0)
      for (const dy of yun.getDaYun()) {
        const gz = dy.getGanZhi()
        if (!gz) continue
        dayun.push({
          ganzhi: gz,
          start_age: dy.getStartAge(),
          end_age: dy.getEndAge(),
          start_year: dy.getStartYear(),
          end_year: dy.getEndYear(),
        })
      }
    } catch {
      /* 原实现对大运异常同样静默跳过 */
    }
  }

  let currentDayun = ''
  for (const d of dayun) {
    if (d.start_year <= nowYear && nowYear <= d.end_year) {
      currentDayun = d.ganzhi
      break
    }
  }

  const liunian: Liunian[] = []
  if (hasTime) {
    for (let y = nowYear; y < nowYear + 12; y++) {
      const gz = Solar.fromYmd(y, 6, 1).getLunar().getYearInGanZhi()
      liunian.push({ year: y, ganzhi: gz, yingshi: liunianYingshi(gz, pillars, dayGan) })
    }
  }

  return {
    solar: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    lunar: `农历${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    zodiac: lunar.getYearShengXiao(),
    pillars,
    day_master: dayGan,
    day_master_element: dayElement,
    wuxing_count: wuxing,
    wuxing_missing: missing,
    wuxing_strength: wuxingStrength,
    wuxing_normalized: wuxingNormalized,
    day_strength: dayStrength,
    favorable,
    diaohou,
    dayun,
    current_dayun: currentDayun,
    liunian,
    zhi_relations: zhiRelations,
    shen_sha,
    xun_kong,
    di_shi,
    ming_shen,
  }
}

function strongestElement(chart: BaziResult): Element {
  const count = chart.wuxing_count
  let strongest: Element = '金'
  for (const e of Object.keys(count) as Element[]) {
    if (count[e] > count[strongest]) strongest = e
  }
  return strongest
}

export function relationBetween(chartA: BaziResult, chartB: BaziResult): RelationResult {
  const da = chartA.day_master
  const db = chartB.day_master
  const ea = ELEM_STEM[stemIndex(da)]
  const eb = ELEM_STEM[stemIndex(db)]

  let ganRel: string
  if (ea === eb) {
    ganRel = `${da}${ea} 与 ${db}${eb} 同属${ea}，比和（同类相助，志趣相近）`
  } else if (SHENG[ea] === eb) {
    ganRel = `${da}${ea} 生 ${db}${eb}（我方${ea}生对方${eb}，我方主动付出、滋养对方）`
  } else if (SHENG[eb] === ea) {
    ganRel = `${db}${eb} 生 ${da}${ea}（对方${eb}生我方${ea}，对方主动付出、滋养我方）`
  } else if (KE[ea] === eb) {
    ganRel = `${da}${ea} 克 ${db}${eb}（我方${ea}克对方${eb}，我方占主导、易给对方压力）`
  } else if (KE[eb] === ea) {
    ganRel = `${db}${eb} 克 ${da}${ea}（对方${eb}克我方${ea}，对方占主导、我方易感压力）`
  } else {
    ganRel = `${da}${ea} 与 ${db}${eb}（无直接生克）`
  }

  const hua = WU_HE[pairKey(da, db)]
  if (hua) {
    ganRel += `；且 ${da}${db} 天干五合化${hua}（鸳鸯合，主情投意合、缘分深）`
  }

  const zhiA = chartA.pillars.day.ganzhi[1]
  const zhiB = chartB.pillars.day.ganzhi[1]
  const coupleParts: string[] = []
  if (LIU_HE[zhiA] === zhiB) coupleParts.push(`日支 ${zhiA}×${zhiB} 六合（夫妻宫相合，感情融洽）`)
  if (LIU_CHONG[zhiA] === zhiB) coupleParts.push(`日支 ${zhiA}×${zhiB} 相冲（夫妻宫相冲，易有摩擦）`)
  if ((XIANG_XING[zhiA] ?? []).includes(zhiB)) coupleParts.push(`日支 ${zhiA}×${zhiB} 相刑（夫妻宫带刑，需包容）`)
  if (XIANG_HAI[zhiA] === zhiB) coupleParts.push(`日支 ${zhiA}×${zhiB} 相害（夫妻宫带害，暗生嫌隙）`)
  if (!coupleParts.length) coupleParts.push(`日支 ${zhiA}×${zhiB} 无冲合刑害（夫妻宫平稳）`)

  const keys: PillarKey[] = ['year', 'month', 'day', 'time']
  const zhiAllA = keys.flatMap((k) => (chartA.pillars[k] ? [chartA.pillars[k]!.ganzhi[1]] : []))
  const zhiAllB = keys.flatMap((k) => (chartB.pillars[k] ? [chartB.pillars[k]!.ganzhi[1]] : []))
  const crossRel = zhiRelationStr([...zhiAllA, ...zhiAllB])

  const missA = new Set(chartA.wuxing_missing)
  const missB = new Set(chartB.wuxing_missing)
  const strongA = strongestElement(chartA)
  const strongB = strongestElement(chartB)
  const complement: string[] = []
  if (missA.has(strongB)) complement.push(`我方缺${strongB}，对方${strongB}旺，可互补`)
  if (missB.has(strongA)) complement.push(`对方缺${strongA}，我方${strongA}旺，可互补`)
  if (!complement.length) complement.push('双方五行喜忌未形成明显互补，需看具体用神')

  return {
    gan_rel: ganRel,
    couple_rel: coupleParts.join('；'),
    cross_zhi_rel: crossRel,
    complement: complement.join('；'),
    day_gan_a: da,
    day_gan_b: db,
    day_zhi_a: zhiA,
    day_zhi_b: zhiB,
  }
}
