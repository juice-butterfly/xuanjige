import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { calcBazi } from '../engine/bazi'
import type { VedicResult } from '../engine/vedic'
import { Chapter } from './Chapter'
import { Enso } from './Ornament'
import { pillarRows } from '../lib/match'
import { baziOf, relationLabel, type Partner } from '../lib/partners'
import {
  DIRECTIONS,
  askFollowUp,
  buildChartPayload,
  directionLabel,
  fallbackText,
  openingLine,
  streamInterpret,
  type InterpMode,
  type RelationExtra,
  type StreamEvent,
} from '../lib/interp'

export type MasterEntry = {
  dob: string
  time: string | null
  gender: 'male' | 'female'
  province: string
  city: string
  lat: number
  lon: number
}

type VedicState =
  | { status: 'loading' }
  | { status: 'ready'; data: VedicResult }
  | { status: 'error' }

type PartnerVedic =
  | { id: string; status: 'loading' }
  | { id: string; status: 'ready'; data: VedicResult }
  | { id: string; status: 'error' }

type AskMode = 'single' | 'merge' | 'relation'

const ASK_MODES: { id: AskMode; label: string }[] = [
  { id: 'single', label: '单盘' },
  { id: 'merge', label: '双盘合参' },
  { id: 'relation', label: '关系人合参' },
]

type RunState =
  | { phase: 'idle' }
  | { phase: 'busy'; mode: InterpMode; text: string; asked?: string; note?: string }
  | { phase: 'done'; mode: InterpMode; text: string; asked?: string }
  | { phase: 'stopped'; mode: InterpMode; text: string; asked?: string; note?: string }

const STOP_NOTE = '已止。半截的话，作半截听。'

const TIMING_KEY = 'xuanjige.master.timing.v1'
const DIAG = new URLSearchParams(window.location.search).get('diag') === '1'

type TimingRecord = {
  at: string
  mode: InterpMode
  postMs: number | null
  firstMs: number | null
  totalMs: number
  ok: boolean
}

function saveTiming(record: TimingRecord) {
  try {
    const raw = sessionStorage.getItem(TIMING_KEY)
    const list: TimingRecord[] = raw ? JSON.parse(raw) : []
    sessionStorage.setItem(TIMING_KEY, JSON.stringify([record, ...list].slice(0, 20)))
  } catch {
    /* 存储不可用时只留页面上的数 */
  }
}

function timingLine(record: TimingRecord): string {
  const sec = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`)
  return `起卷 ${sec(record.postMs)} · 首字 ${sec(record.firstMs)} · 总 ${sec(record.totalMs)}`
}

const HEADING_RE = /^[一二三四五六七八九十]+、/
const HEADING_NUM_RE = /^([一二三四五六七八九十]+、)(.*)$/
const EVIDENCE_RE = /^(中式依据|印占依据|依据)[：:]\s*/

type Block =
  | { kind: 'h'; text: string }
  | { kind: 'evidence'; label: string; text: string }
  | { kind: 'p'; text: string }

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let buffer: string[] = []
  const flush = () => {
    const joined = buffer.join('\n').trim()
    if (joined) blocks.push({ kind: 'p', text: joined })
    buffer = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) {
      flush()
      continue
    }
    if (HEADING_RE.test(line) && line.length <= 24) {
      flush()
      blocks.push({ kind: 'h', text: line })
      continue
    }
    const evidence = line.match(EVIDENCE_RE)
    if (evidence) {
      flush()
      blocks.push({ kind: 'evidence', label: evidence[0].trim(), text: line.slice(evidence[0].length) })
      continue
    }
    buffer.push(line)
  }
  flush()
  return blocks
}

function splitHeading(text: string): [string, string] {
  const m = text.match(HEADING_NUM_RE)
  if (!m) return ['', text]
  return [m[1], m[2]]
}

function AnswerBody({ text, busy }: { text: string; busy: boolean }) {
  return (
    <div className="master-text">
      {parseBlocks(text).map((block, index) => {
        if (block.kind === 'h') {
          const [num, rest] = splitHeading(block.text)
          return (
            <h3 className="master-h3" key={index}>
              {num && <span className="master-h3-num">{num}</span>}
              {rest}
            </h3>
          )
        }
        if (block.kind === 'evidence') {
          return (
            <p className="master-evidence" key={index}>
              <span className="master-evidence-k">{block.label}</span>
              {block.text}
            </p>
          )
        }
        return (
          <p className="master-p" key={index}>
            {block.text}
          </p>
        )
      })}
      {busy && <p className="master-typing">先生仍在说……</p>}
    </div>
  )
}

function waitText(seconds: number): string {
  if (seconds < 6) return '先生净手展卷，两盘并陈。'
  if (seconds < 16) return '四柱与印占盘，先生正逐宫看过去。'
  if (seconds < 30) return '这一问要细看，约需三十息。'
  return '先生沉吟未止——仍可再候，或先止住。'
}

function WaitNote({ seconds }: { seconds: number }) {
  return (
    <div className="master-wait" role="status">
      <span className="master-wait-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <p className="master-wait-text">{waitText(seconds)}</p>
      {seconds >= 6 && <p className="master-wait-meta">已候 {seconds} 秒</p>}
    </div>
  )
}

export function MasterScreen({
  entry,
  onForm,
  onEdit,
  intent,
  onIntentDone,
  partners,
  activePartnerId,
  onActivePartner,
  onOpenPartners,
  onEditPartner,
}: {
  entry: MasterEntry | null
  onForm: () => void
  onEdit: () => void
  intent?: 'merge' | 'relation' | null
  onIntentDone?: () => void
  partners: Partner[]
  activePartnerId: string | null
  onActivePartner: (id: string) => void
  onOpenPartners: () => void
  onEditPartner: (id: string) => void
}) {
  const [vedic, setVedic] = useState<VedicState>({ status: 'loading' })
  const [vedicNonce, setVedicNonce] = useState(0)
  const [run, setRun] = useState<RunState>({ phase: 'idle' })
  const [askText, setAskText] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [runKey, setRunKey] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [askMode, setAskMode] = useState<AskMode>('single')
  const [timing, setTiming] = useState<string | null>(null)
  const [partnerVedic, setPartnerVedic] = useState<PartnerVedic | null>(null)
  const [partnerNonce, setPartnerNonce] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const runSeq = useRef(0)
  const intentRan = useRef<string | null>(null)
  const sessionRef = useRef('')
  const repliesRef = useRef(0)
  const answerRef = useRef<HTMLDivElement | null>(null)
  const partnerCache = useRef(new Map<string, VedicResult>())

  const bazi = useMemo(() => {
    if (!entry || !entry.time) return null
    const [year, month, day] = entry.dob.split('-').map(Number)
    const [hour, minute] = entry.time.split(':').map(Number)
    return calcBazi(
      year,
      month,
      day,
      hour,
      minute,
      entry.gender === 'male' ? '男' : '女',
      true,
      '',
      new Date().getFullYear(),
    )
  }, [entry])

  const selectedPartner =
    partners.find((partner) => partner.id === activePartnerId) ?? null
  const partnerBazi = useMemo(
    () => (selectedPartner ? baziOf(selectedPartner) : null),
    [selectedPartner],
  )

  useEffect(() => {
    if (!entry || !entry.time) return
    const time = entry.time
    let alive = true
    setVedic({ status: 'loading' })
    import('../engine/vedic')
      .then((m) =>
        m.calcVedic({
          dob: entry.dob,
          time,
          place: `${entry.province}·${entry.city}`,
          lat: entry.lat,
          lon: entry.lon,
        }),
      )
      .then((data) => {
        if (alive) setVedic({ status: 'ready', data })
      })
      .catch(() => {
        if (alive) setVedic({ status: 'error' })
      })
    return () => {
      alive = false
    }
  }, [entry, vedicNonce])

  // 对方盘只为「与关系人合参」而算；选中后才加载，按 id 记在内存里。
  useEffect(() => {
    if (askMode !== 'relation' || !selectedPartner || !selectedPartner.time) {
      setPartnerVedic(null)
      return
    }
    const time = selectedPartner.time
    const cached = partnerCache.current.get(selectedPartner.id)
    if (cached) {
      setPartnerVedic({ id: selectedPartner.id, status: 'ready', data: cached })
      return
    }
    let alive = true
    setPartnerVedic({ id: selectedPartner.id, status: 'loading' })
    import('../engine/vedic')
      .then((m) =>
        m.calcVedic({
          dob: selectedPartner.dob,
          time,
          place: `${selectedPartner.province}·${selectedPartner.city}`,
          lat: selectedPartner.lat,
          lon: selectedPartner.lon,
        }),
      )
      .then((data) => {
        partnerCache.current.set(selectedPartner.id, data)
        if (alive) setPartnerVedic({ id: selectedPartner.id, status: 'ready', data })
      })
      .catch(() => {
        if (alive) setPartnerVedic({ id: selectedPartner.id, status: 'error' })
      })
    return () => {
      alive = false
    }
  }, [askMode, selectedPartner, partnerNonce])

  useEffect(() => {
    if (run.phase !== 'busy') {
      setSeconds(0)
      return
    }
    const began = Date.now()
    setSeconds(0)
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - began) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [run.phase, runKey])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  // 换了生辰，旧盘上的会话就作废，追问不能沿用。
  useEffect(() => {
    abortRef.current?.abort()
    runSeq.current++
    sessionRef.current = ''
    repliesRef.current = 0
    setRun({ phase: 'idle' })
    setAskText('')
    setPickerOpen(false)
    setAskMode('single')
  }, [entry])

  // 换了关系人，上一张盘的答话也不能沿用。
  useEffect(() => {
    if (run.phase === 'idle') return
    abortRef.current?.abort()
    runSeq.current++
    sessionRef.current = ''
    repliesRef.current = 0
    setRun({ phase: 'idle' })
    setAskText('')
  }, [activePartnerId])

  // 双盘页或关系人弹窗的「合参」只开一次卷；StrictMode 二次执行时由清理函数保住单次。
  // 不要求旧答案已收：从先生页直接添关系人时，上一卷常还摊在案上。
  useEffect(() => {
    if (!intent) {
      intentRan.current = null
      return
    }
    if (intentRan.current === intent) return
    if (intent === 'relation') {
      if (selectedPartner) setAskMode('relation')
      if (!selectedPartner || !selectedPartner.time || !selectedPartner.relation) {
        intentRan.current = intent
        onIntentDone?.()
        return
      }
      if (
        !partnerBazi ||
        !partnerVedic ||
        partnerVedic.status !== 'ready' ||
        partnerVedic.id !== selectedPartner.id
      ) {
        return
      }
      const timer = window.setTimeout(() => {
        intentRan.current = intent
        startRun('relation')
        onIntentDone?.()
      }, 0)
      return () => window.clearTimeout(timer)
    }
    if (!entry || !entry.time || !bazi || vedic.status !== 'ready') return
    const timer = window.setTimeout(() => {
      intentRan.current = intent
      startRun(intent)
      onIntentDone?.()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [
    intent,
    entry,
    bazi,
    vedic.status,
    onIntentDone,
    selectedPartner,
    partnerBazi,
    partnerVedic,
  ])

  // 只在读的人已经翻过头时，把答案开头带回眼前；往下长的时候不拽着人走。
  function revealAnswer() {
    requestAnimationFrame(() => {
      const node = answerRef.current
      if (node && node.getBoundingClientRect().top < 0) {
        node.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
  }

  function startRun(mode: InterpMode, question?: string) {
    if (!entry || !bazi || vedic.status !== 'ready') return
    let extra: RelationExtra | undefined
    if (mode === 'relation') {
      if (
        !selectedPartner ||
        !partnerBazi ||
        !selectedPartner.relation ||
        !partnerVedic ||
        partnerVedic.status !== 'ready' ||
        partnerVedic.id !== selectedPartner.id
      ) {
        return
      }
      extra = {
        relation: selectedPartner.relation,
        partner: buildChartPayload(partnerBazi, partnerVedic.data, selectedPartner.gender),
      }
    }
    abortRef.current?.abort()
    const token = ++runSeq.current
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const payload = buildChartPayload(bazi, vedic.data, entry.gender)
    const session = sessionRef.current
    setRun({ phase: 'busy', mode, text: '', asked: question })
    setRunKey((key) => key + 1)
    setPickerOpen(false)
    setTiming(null)
    revealAnswer()
    const began = performance.now()
    const marks = { post: null as number | null, first: null as number | null }
    let timed = false
    const mark = (event: StreamEvent) => {
      if (event.kind === 'open' && marks.post === null) {
        marks.post = Math.round(performance.now() - began)
      }
      if ((event.kind === 'delta' || event.kind === 'replace') && marks.first === null) {
        marks.first = Math.round(performance.now() - began)
      }
      const terminal =
        event.kind === 'done' ||
        event.kind === 'error' ||
        event.kind === 'stopped' ||
        event.kind === 'network'
      if (!terminal || timed) return
      timed = true
      const record: TimingRecord = {
        at: new Date().toISOString(),
        mode,
        postMs: marks.post,
        firstMs: marks.first,
        totalMs: Math.round(performance.now() - began),
        ok: event.kind === 'done',
      }
      saveTiming(record)
      if (DIAG) setTiming(timingLine(record))
    }
    const handle = (event: StreamEvent) => {
      if (token !== runSeq.current) return
      mark(event)
      if (event.kind === 'meta') {
        sessionRef.current = event.session
        return
      }
      if (event.kind === 'done' && typeof event.replies === 'number') {
        repliesRef.current = event.replies
      }
      setRun((prev) => {
        const asked = prev.phase === 'idle' ? undefined : prev.asked
        if (event.kind === 'delta') {
          const base = prev.phase === 'busy' ? prev.text : ''
          return { phase: 'busy', mode, text: base + event.text, asked }
        }
        if (event.kind === 'replace') {
          return { phase: 'busy', mode, text: event.text, asked }
        }
        if (event.kind === 'done') {
          // 只从 busy 态转移，重复的终态事件不改写已定文本。
          return prev.phase === 'busy'
            ? { phase: 'done', mode, text: prev.text, asked: prev.asked }
            : prev
        }
        if (event.kind === 'error') {
          return prev.phase === 'busy'
            ? {
                phase: 'stopped',
                mode,
                text: prev.text,
                asked: prev.asked,
                note: fallbackText(event.code),
              }
            : prev
        }
        if (event.kind === 'stopped') {
          return prev.phase === 'busy'
            ? {
                phase: 'stopped',
                mode,
                text: prev.text,
                asked: prev.asked,
                note: prev.text ? STOP_NOTE : '先生还没开口就停了。',
              }
            : prev
        }
        if (event.kind === 'network') {
          return prev.phase === 'busy'
            ? {
                phase: 'stopped',
                mode,
                text: prev.text,
                asked: prev.asked,
                note: fallbackText('network'),
              }
            : prev
        }
        return prev
      })
    }
    if (question && session) {
      void askFollowUp(session, question, repliesRef.current, handle, ctrl.signal)
      return
    }
    void streamInterpret(payload, mode, handle, ctrl.signal, question, extra)
  }

  function submitAsk(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const question = askText.trim()
    if (!question || vedic.status !== 'ready') return
    setAskText('')
    startRun('ask', question)
  }

  function stopRun() {
    abortRef.current?.abort()
  }

  if (!entry || !entry.time) {
    return (
      <>
        <Chapter num="肆" kicker="卷 之 四" title="玄机先生" sub="先生不言吉凶，只按盘说话。" />
        <div className="master-note">
          <p className="master-lead">
            {!entry ? '尚未报上生辰，先生尚未开卷。' : '时辰不详，先生不开卷。'}
          </p>
          <p className="master-sub">
            {!entry
              ? '先报生辰，先生才好按盘说话；六方向，每条附依据。'
              : '四柱缺一，合参无从对起。补上出生时刻，先生才好开口。'}
          </p>
          <button className="link" type="button" onClick={entry ? onEdit : onForm}>
            {!entry ? '去报生辰' : '补录时辰'}
          </button>
        </div>
        <p className="screen-note">本页只陈六方向，不判生死，不承诺财运。</p>
      </>
    )
  }

  const opening = bazi ? openingLine(bazi.day_master_element) : ''
  const chartsReady = vedic.status === 'ready'
  const busy = run.phase === 'busy'
  const activeMode = run.phase === 'idle' ? null : run.mode
  const showPicker = run.phase === 'idle' || pickerOpen
  const partnerVedicHere =
    selectedPartner && partnerVedic?.id === selectedPartner.id ? partnerVedic : null
  const relationReady = !!(
    selectedPartner?.relation &&
    partnerBazi &&
    partnerVedicHere?.status === 'ready'
  )

  return (
    <>
      <Chapter num="肆" kicker="卷 之 四" title="玄机先生" sub="先生不言吉凶，只按盘说话。" />

      <div className="record">
        <div className="record-line">
          <span className="record-k">生辰已录</span>
          <span>
            {entry.province} · {entry.city}
          </span>
          <span>{entry.gender === 'male' ? '男' : '女'}</span>
          <button className="link" type="button" onClick={onEdit}>
            改录
          </button>
        </div>
        {askMode === 'relation' && selectedPartner && (
          <div className="record-line record-line--sub">
            <span>
              与 {selectedPartner.alias}（{relationLabel(selectedPartner.relation)}）合参
            </span>
          </div>
        )}
      </div>

      <div className="master-live">
        <div className="master-top">
          <p className="master-open">{opening}</p>

          {showPicker ? (
            <div className="master-directions">
              <div className="master-modes" role="group" aria-label="问法">
                {ASK_MODES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`master-mode${askMode === item.id ? ' master-mode--on' : ''}`}
                    aria-pressed={askMode === item.id}
                    disabled={busy}
                    onClick={() => setAskMode(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {askMode === 'single' && (
                <>
                  <span className="master-directions-k">问事方向</span>
                  <div className="master-slips" role="group" aria-label="问事方向">
                    {DIRECTIONS.map((d) => (
                      <button
                        key={d.mode}
                        type="button"
                        className={`master-slip${activeMode === d.mode ? ' master-slip--on' : ''}`}
                        disabled={!chartsReady || busy}
                        onClick={() => startRun(d.mode)}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {askMode === 'merge' && (
                <div className="master-mode-panel">
                  <p className="master-mode-note">
                    四柱看骨，印占看气；两盘对照，找印证，也找错位。
                  </p>
                  <button
                    type="button"
                    className="master-merge"
                    disabled={!chartsReady || busy}
                    onClick={() => startRun('merge')}
                  >
                    双盘合参
                  </button>
                </div>
              )}

              {askMode === 'relation' && (
                <div className="master-mode-panel">
                  <div className="master-partner-head">
                    <span className="master-directions-k">与谁合参</span>
                    <button type="button" className="link" onClick={onOpenPartners}>
                      管理关系人
                    </button>
                  </div>

                  {partners.length ? (
                    <>
                      <select
                        className="master-partner-select"
                        aria-label="选择关系人"
                        value={selectedPartner?.id ?? ''}
                        disabled={busy}
                        onChange={(e) => onActivePartner(e.target.value)}
                      >
                        <option value="">未择</option>
                        {partners.map((partner) => (
                          <option key={partner.id} value={partner.id}>
                            {partner.alias}（{relationLabel(partner.relation)}）
                          </option>
                        ))}
                      </select>

                      {selectedPartner && partnerBazi && bazi && (
                        <div className="master-partner-card">
                          <details className="peek">
                            <summary className="peek-summary">
                              <span className="peek-title">两盘速览</span>
                              <span className="peek-kicker">年月日时 · 只取合冲</span>
                            </summary>
                            <div className="peek-table">
                              <div className="peek-row peek-row--head">
                                <span className="peek-k">柱</span>
                                <span className="peek-v">本人</span>
                                <span className="peek-rel" aria-hidden="true" />
                                <span className="peek-v">关系人</span>
                              </div>
                              {pillarRows(bazi, partnerBazi).map((row) => (
                                <div className="peek-row" key={row.label}>
                                  <span className="peek-k">{row.label}</span>
                                  <span className="peek-v">{row.left}</span>
                                  <span className={`peek-rel${row.rel ? ` peek-rel--${row.rel}` : ''}`}>
                                    {row.tag || '—'}
                                  </span>
                                  <span className="peek-v">{row.right}</span>
                                </div>
                              ))}
                            </div>
                          </details>

                          {!selectedPartner.relation && (
                            <p className="master-partner-block">
                              先标注关系，先生才知以什么身份说话。
                              <button
                                type="button"
                                className="link"
                                onClick={() => onEditPartner(selectedPartner.id)}
                              >
                                标注关系
                              </button>
                            </p>
                          )}

                          {!selectedPartner.time && (
                            <p className="master-partner-block">
                              对方时辰不详，合参不开。
                              <button
                                type="button"
                                className="link"
                                onClick={() => onEditPartner(selectedPartner.id)}
                              >
                                补录时辰
                              </button>
                            </p>
                          )}

                          {selectedPartner.time && selectedPartner.relation && (
                            <>
                              {partnerVedicHere?.status === 'loading' && (
                                <p className="master-partner-hint">对方星盘排算中，稍候。</p>
                              )}
                              {partnerVedicHere?.status === 'error' && (
                                <p className="master-partner-hint master-partner-hint--err">
                                  对方星盘未能排出。
                                  <button
                                    type="button"
                                    className="link"
                                    onClick={() => setPartnerNonce((n) => n + 1)}
                                  >
                                    重排
                                  </button>
                                </p>
                              )}
                              <button
                                type="button"
                                className="master-merge"
                                disabled={!relationReady || busy}
                                onClick={() => startRun('relation')}
                              >
                                与 {selectedPartner.alias} 合参
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="master-partner-empty">
                      还没有关系人。
                      <button type="button" className="link" onClick={onOpenPartners}>
                        添一位
                      </button>
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="master-reopen"
              aria-expanded={false}
              onClick={() => setPickerOpen(true)}
            >
              <span className="master-reopen-mode">{directionLabel(run.mode)}</span>
              <span className="master-reopen-caret" aria-hidden="true">
                ▾
              </span>
              <span className="master-reopen-k">换方向</span>
            </button>
          )}
        </div>

        {vedic.status === 'loading' && <p className="master-hint">印占盘未成，先生稍候。</p>}
        {vedic.status === 'error' && (
          <p className="master-hint master-hint--err">
            印占盘没能排出，先生无法合参。
            <button className="link" type="button" onClick={() => setVedicNonce((n) => n + 1)}>
              重新排盘
            </button>
          </p>
        )}

        <div className="master-output" aria-live="polite">
          {run.phase === 'idle' ? (
            <div className="master-idle">
              <Enso />
              <p className="master-quiet">点一个方向，先生按盘说话。</p>
              <p className="master-quiet-sub">六方向各附依据；合参找印证，也找错位。</p>
            </div>
          ) : (
            <div className="master-answer" ref={answerRef}>
              {run.asked && <p className="master-asked">问：{run.asked}</p>}
              <div className="master-answer-head">
                <span className="master-answer-k">先生答</span>
                <span className="master-answer-mode">{directionLabel(run.mode)}</span>
                <span className="master-answer-rule" aria-hidden="true" />
              </div>

              {run.text ? (
                <AnswerBody text={run.text} busy={busy} />
              ) : busy ? (
                <WaitNote seconds={seconds} />
              ) : null}

              {DIAG && timing && <p className="master-timing">{timing}</p>}

              {busy && (
                <button className="link master-stop" type="button" onClick={stopRun}>
                  停止
                </button>
              )}
              {run.phase === 'stopped' && (
                <>
                  {run.note && (
                    <p className={`master-note-line${run.text ? '' : ' master-note-line--only'}`}>
                      {run.note}
                    </p>
                  )}
                  <button className="link master-stop" type="button" onClick={() => startRun(run.mode, run.asked)}>
                    再问一次
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <form className="master-ask" onSubmit={submitAsk}>
          <input
            className="master-ask-input"
            value={askText}
            onChange={(e) => setAskText(e.target.value)}
            placeholder={
              !chartsReady
                ? '印占盘未成，先生暂不开卷。'
                : busy
                  ? '先生正在说，稍候再问。'
                  : '追问一句，或随意问点别的。'
            }
            maxLength={500}
            disabled={!chartsReady || busy}
            aria-label="追问先生"
          />
          <button
            className="master-send"
            type="submit"
            disabled={!chartsReady || busy || !askText.trim()}
          >
            问
          </button>
        </form>

      </div>

      <p className="screen-note">本页只陈六方向，不判生死，不承诺财运。</p>
    </>
  )
}
