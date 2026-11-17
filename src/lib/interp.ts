import type { BaziResult } from '../engine/bazi'
import type { VedicResult } from '../engine/vedic'
import type { Relation } from './partners'

export type InterpMode =
  | 'merge'
  | 'relation'
  | 'family'
  | 'study'
  | 'career'
  | 'marriage'
  | 'health'
  | 'social'
  | 'ask'

export const DIRECTIONS: { mode: InterpMode; label: string }[] = [
  { mode: 'family', label: '家运亲情' },
  { mode: 'study', label: '学业考试' },
  { mode: 'career', label: '事业工作' },
  { mode: 'marriage', label: '婚恋感情' },
  { mode: 'health', label: '健康' },
  { mode: 'social', label: '人际' },
]

const GRAHA_CN: Record<string, string> = {
  Ketu: '计都',
  Venus: '金星',
  Sun: '太阳',
  Moon: '月亮',
  Mars: '火星',
  Rahu: '罗睺',
  Jupiter: '木星',
  Saturn: '土星',
  Mercury: '水星',
}

const PILLAR_CN = { year: '年', month: '月', day: '日', time: '时' } as const

// 与 Function 端 validChart 白名单一一对应的载荷；多余的盘面细节不外送。
export type ChartPayload = {
  gender: '男' | '女'
  bazi: {
    day_master: string
    day_master_element: string
    day_strength: string
    favorable: string[]
    pillars: { name: string; ganzhi: string; shi_shen_gan: string }[]
    wuxing_count: Record<string, number>
    wuxing_missing: string[]
    current_dayun: string
    shen_sha: string[]
  }
  vedic: {
    lagna: string
    moon_nakshatra: string
    planets: { planet: string; sign_cn: string; house: number; retro: boolean }[]
    current_dasha: string
    ayanamsa: number
  }
}

const SHEN_SHA_ORDER = ['驿马', '桃花', '华盖', '将星', '亡神', '劫煞', '孤辰', '寡宿']

export function buildChartPayload(
  bazi: BaziResult,
  vedic: VedicResult,
  gender: 'male' | 'female',
): ChartPayload {
  const order = SHEN_SHA_ORDER.filter((name) => bazi.shen_sha[name])
  const shenSha = order
    .slice(0, 6)
    .map((name) => `${name}（${bazi.shen_sha[name].map((k) => PILLAR_CN[k]).join('')}）`)
  const current = vedic.dasha.find((d) => d.is_current)
  const dashaText = current
    ? `${GRAHA_CN[current.md_planet] ?? current.md_planet}大运${
        current.ad_planet ? ` · ${GRAHA_CN[current.ad_planet] ?? current.ad_planet}小运` : ''
      }`
    : '运限未定'
  return {
    gender: gender === 'male' ? '男' : '女',
    bazi: {
      day_master: bazi.day_master,
      day_master_element: bazi.day_master_element,
      day_strength: bazi.day_strength,
      favorable: bazi.favorable.slice(0, 2),
      pillars: (['year', 'month', 'day', 'time'] as const).map((key) => ({
        name: PILLAR_CN[key],
        ganzhi: bazi.pillars[key]?.ganzhi ?? '',
        shi_shen_gan: bazi.pillars[key]?.shi_shen_gan ?? '',
      })),
      wuxing_count: { ...bazi.wuxing_count },
      wuxing_missing: [...bazi.wuxing_missing],
      current_dayun: bazi.current_dayun,
      shen_sha: shenSha,
    },
    vedic: {
      lagna: `${vedic.lagna.sign_cn} ${vedic.lagna.degree}`,
      moon_nakshatra: `${vedic.moon_nakshatra.name} 第${vedic.moon_nakshatra.pada}步 · 主星${
        GRAHA_CN[vedic.moon_nakshatra.lord] ?? vedic.moon_nakshatra.lord
      }`,
      planets: vedic.planets.map((p) => ({
        planet: GRAHA_CN[p.planet] ?? p.planet,
        sign_cn: p.sign_cn,
        house: p.house,
        retro: p.retro,
      })),
      current_dasha: dashaText,
      ayanamsa: vedic.ayanamsa,
    },
  }
}

// 按日主五行给五种开场白
const OPENING: Record<string, string> = {
  金: '日主属金，其性刚决。两盘已陈，先生这就开卷。',
  木: '日主属木，其性生发。两盘并陈，先生落座。',
  水: '日主属水，随物赋形。两盘铺好，先生洗耳。',
  火: '日主属火，其性炎上。灯已挑亮，请讲。',
  土: '日主属土，厚而能载。两盘落定，先生坐定听问。',
}

export function openingLine(element: string): string {
  return OPENING[element] ?? '两盘已陈，先生开卷。'
}

export function directionLabel(mode: InterpMode): string {
  if (mode === 'merge') return '合参'
  if (mode === 'relation') return '关系合参'
  if (mode === 'ask') return '追问'
  return DIRECTIONS.find((d) => d.mode === mode)?.label ?? ''
}

export type RelationExtra = {
  relation: Relation
  partner: ChartPayload
}

export type StreamEvent =
  | { kind: 'open' }
  | { kind: 'meta'; session: string }
  | { kind: 'delta'; text: string }
  | { kind: 'replace'; text: string }
  | { kind: 'done'; replies?: number }
  | { kind: 'error'; code: string }
  | { kind: 'stopped' }
  | { kind: 'network' }

const VISITOR_KEY = 'xuanjige.visitor.v1'
let memoryVisitor = ''

// 会话归属靠这个本机标识；拿不到存储时退化为本页内存值。
export function visitorId(): string {
  try {
    const saved = localStorage.getItem(VISITOR_KEY)
    if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved
    const id = crypto.randomUUID()
    localStorage.setItem(VISITOR_KEY, id)
    return id
  } catch {
    if (!memoryVisitor) memoryVisitor = crypto.randomUUID()
    return memoryVisitor
  }
}

export const FALLBACK: Record<string, string> = {
  network: '阁外风大，线路一时不通。请稍候再问。',
  login_required: '阁门未开。请先登录本站，再向先生发问。',
  ai_not_configured: '阁内尚未接通后端，先生暂时闭口。请稍后再试。',
  ai_access_denied: '阁外号牌失效，先生无法开口。请稍后再试。',
  ai_rate_limited: '问的人太多，先生需要稍歇。请等一会儿再问。',
  ai_initialization_pending: '先生正在布置书案，稍候片刻再问。',
  ai_initialization_conflict: '书案重叠了，请稍候再问一次。',
  timeout: '先生沉吟太久，线路弱了。请稍候再问。',
  no_reply: '先生沉吟许久，终究没开口。请稍候再问。',
  interrupted: '这一问被打断了。请稍候再问。',
  invalid_input: '盘面数据不合规矩，先生无法作答。',
  payload_too_large: '盘面数据太大，先生无法作答。',
  service_unavailable: '阁内灯影晃动，方才那一问没能送达。请稍候再试。',
  upstream: '阁内线路晃动，先生的话断了。请稍候再问。',
}

export function fallbackText(code: string): string {
  return FALLBACK[code] ?? FALLBACK.service_unavailable
}

type FetchOutcome = Response | 'stopped' | 'timeout' | 'network'

const START_BUDGET = 30000
const POLL_BUDGET = 12000
// 首字常要十几到几十秒；头几轮走密一点，先接住刚出现的字，随后放缓，少打上游。
const POLL_FAST = 700
const POLL_FAST_TRIES = 8
const POLL_INTERVAL = 1500
const POLL_SLOW = 2500
const POLL_SLOW_AFTER = 24000
const RUN_BUDGET = 180000

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

async function call(
  path: string,
  init: RequestInit,
  budget: number,
  external: AbortSignal,
): Promise<FetchOutcome> {
  if (external.aborted) return 'stopped'
  const local = new AbortController()
  let timedOut = false
  const stop = () => local.abort()
  external.addEventListener('abort', stop, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    local.abort()
  }, budget)
  try {
    return await fetch(path, { ...init, signal: local.signal })
  } catch {
    if (timedOut) return 'timeout'
    return external.aborted ? 'stopped' : 'network'
  } finally {
    clearTimeout(timer)
    external.removeEventListener('abort', stop)
  }
}

async function errorCodeOf(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: { code?: string } }
    return typeof data?.error?.code === 'string' ? data.error.code : 'service_unavailable'
  } catch {
    return 'service_unavailable'
  }
}

type EventPoll = { text?: string; state?: string; replies?: number }

async function pollReply(
  session: string,
  baseline: number,
  settle: 'turn' | 'reply',
  onEvent: (event: StreamEvent) => void,
  external: AbortSignal,
): Promise<void> {
  let text = ''
  let misses = 0
  let tries = 0
  const began = Date.now()
  const until = began + RUN_BUDGET
  while (Date.now() < until) {
    const age = Date.now() - began
    const gap = tries < POLL_FAST_TRIES ? POLL_FAST : age > POLL_SLOW_AFTER ? POLL_SLOW : POLL_INTERVAL
    tries++
    await wait(gap)
    if (external.aborted) {
      onEvent({ kind: 'stopped' })
      return
    }
    const poll = await call(
      `/functions/v1/app/api/events?session=${encodeURIComponent(session)}`,
      { headers: { accept: 'application/json' } },
      POLL_BUDGET,
      external,
    )
    if (poll === 'stopped') {
      onEvent({ kind: 'stopped' })
      return
    }
    if (typeof poll === 'string') {
      if (++misses < 3) continue
      if (poll === 'network') onEvent({ kind: 'network' })
      else onEvent({ kind: 'error', code: 'timeout' })
      return
    }
    if (!poll.ok) {
      if (++misses < 3) continue
      onEvent({ kind: 'error', code: await errorCodeOf(poll) })
      return
    }
    let data: EventPoll = {}
    try {
      data = (await poll.json()) as EventPoll
    } catch {
      if (++misses < 3) continue
      onEvent({ kind: 'network' })
      return
    }
    misses = 0
    if (typeof data.text === 'string' && data.text && data.text !== text) {
      // 服务端每次给的是整段最新文本；能接上就只送新增的尾巴，读的人不必重看。
      if (text && data.text.startsWith(text)) {
        onEvent({ kind: 'delta', text: data.text.slice(text.length) })
      } else {
        onEvent({ kind: 'replace', text: data.text })
      }
      text = data.text
    }
    const replies = typeof data.replies === 'number' ? data.replies : 0
    if (settle === 'reply' && replies > baseline) {
      onEvent({ kind: 'done', replies })
      return
    }
    if (data.state === 'completed') {
      // 追问等待期里，上一轮的 completed 不算本轮结束，继续等新回复。
      if (settle === 'reply') continue
      if (text) onEvent({ kind: 'done', replies })
      else onEvent({ kind: 'error', code: 'no_reply' })
      return
    }
    if (data.state === 'failed') {
      onEvent({ kind: 'error', code: 'upstream' })
      return
    }
    if (data.state === 'interrupted') {
      onEvent({ kind: 'error', code: 'interrupted' })
      return
    }
  }
  onEvent({ kind: 'error', code: text ? 'timeout' : 'no_reply' })
}

// 两段式问答：POST 起会话并投递盘面，随后短轮询取回结果。
// 平台对单次响应有约 60 秒上限，而首字可能迟至 50 秒才出现，长连接必被截断。
export async function streamInterpret(
  payload: ChartPayload,
  mode: InterpMode,
  onEvent: (event: StreamEvent) => void,
  external: AbortSignal,
  question?: string,
  extra?: RelationExtra,
): Promise<void> {
  const start = await call(
    '/functions/v1/app/api/interpret',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': crypto.randomUUID() },
      body: JSON.stringify({
        mode,
        chart: payload,
        visitor: visitorId(),
        ...(question ? { question } : {}),
        ...(extra ? { relation: extra.relation, partner: extra.partner } : {}),
      }),
    },
    START_BUDGET,
    external,
  )
  if (start === 'stopped') {
    onEvent({ kind: 'stopped' })
    return
  }
  if (start === 'timeout') {
    onEvent({ kind: 'error', code: 'timeout' })
    return
  }
  if (start === 'network') {
    onEvent({ kind: 'network' })
    return
  }
  if (!start.ok) {
    onEvent({ kind: 'error', code: await errorCodeOf(start) })
    return
  }

  let session = ''
  try {
    const data = (await start.json()) as { session?: string }
    if (typeof data?.session === 'string') session = data.session
  } catch {
    /* 非 JSON 一律按未起会话处理 */
  }
  if (!/^sess_[A-Za-z0-9_-]+$/.test(session)) {
    onEvent({ kind: 'error', code: 'service_unavailable' })
    return
  }

  onEvent({ kind: 'meta', session })
  onEvent({ kind: 'open' })
  await pollReply(session, 0, 'turn', onEvent, external)
}

// 追问沿用同一会话：模型看得到前文与同一张盘，只等新一条回复出现。
export async function askFollowUp(
  session: string,
  question: string,
  baseline: number,
  onEvent: (event: StreamEvent) => void,
  external: AbortSignal,
): Promise<void> {
  const start = await call(
    '/functions/v1/app/api/ask',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': crypto.randomUUID() },
      body: JSON.stringify({ session, visitor: visitorId(), question }),
    },
    START_BUDGET,
    external,
  )
  if (start === 'stopped') {
    onEvent({ kind: 'stopped' })
    return
  }
  if (start === 'timeout') {
    onEvent({ kind: 'error', code: 'timeout' })
    return
  }
  if (start === 'network') {
    onEvent({ kind: 'network' })
    return
  }
  if (!start.ok) {
    onEvent({ kind: 'error', code: await errorCodeOf(start) })
    return
  }
  onEvent({ kind: 'open' })
  await pollReply(session, baseline, 'reply', onEvent, external)
}
