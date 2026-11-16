import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { calcBazi } from '../engine/bazi'
import type { VedicResult } from '../engine/vedic'
import { Chapter } from './Chapter'
import {
  DIRECTIONS,
  askFollowUp,
  buildChartPayload,
  directionLabel,
  fallbackText,
  openingLine,
  streamInterpret,
  type InterpMode,
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

type RunState =
  | { phase: 'idle' }
  | { phase: 'busy'; mode: InterpMode; text: string; asked?: string; note?: string }
  | { phase: 'done'; mode: InterpMode; text: string; asked?: string }
  | { phase: 'stopped'; mode: InterpMode; text: string; asked?: string; note?: string }

const STOP_NOTE = '已止。半截的话，作半截听。'

const HEADING_RE = /^[一二三四五六七八九十]+、/
const EVIDENCE_RE = /^(中式依据|印占依据|依据)[：:]\s*/
const DISCLAIMER_AT = '本解读为传统文化娱乐内容'

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

function splitDisclaimer(text: string): [string, string] {
  const at = text.lastIndexOf(DISCLAIMER_AT)
  if (at < 0) return [text, '']
  return [text.slice(0, at).trimEnd(), text.slice(at).trim()]
}

function AnswerBody({ text, busy }: { text: string; busy: boolean }) {
  const [body, disclaimer] = splitDisclaimer(text)
  return (
    <div className="master-text">
      {parseBlocks(body).map((block, index) => {
        if (block.kind === 'h') {
          return (
            <h3 className="master-h3" key={index}>
              {block.text}
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
      {disclaimer && <p className="master-disclaimer">{disclaimer}</p>}
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
}: {
  entry: MasterEntry | null
  onForm: () => void
  onEdit: () => void
}) {
  const [vedic, setVedic] = useState<VedicState>({ status: 'loading' })
  const [vedicNonce, setVedicNonce] = useState(0)
  const [run, setRun] = useState<RunState>({ phase: 'idle' })
  const [askText, setAskText] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [runKey, setRunKey] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const runSeq = useRef(0)
  const sessionRef = useRef('')
  const repliesRef = useRef(0)
  const answerRef = useRef<HTMLDivElement | null>(null)

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
  }, [entry])

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
    abortRef.current?.abort()
    const token = ++runSeq.current
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const payload = buildChartPayload(bazi, vedic.data, entry.gender)
    const session = sessionRef.current
    setRun({ phase: 'busy', mode, text: '', asked: question })
    setRunKey((key) => key + 1)
    revealAnswer()
    const handle = (event: StreamEvent) => {
      if (token !== runSeq.current) return
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
    void streamInterpret(payload, mode, handle, ctrl.signal, question)
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
        <Chapter num="叁" kicker="卷 之 三" title="玄机先生" sub="先生不言吉凶，只按盘说话。" />
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
  const showTail = !(
    (run.phase === 'done' || run.phase === 'stopped') &&
    run.text.includes('不构成任何决策依据')
  )

  return (
    <>
      <Chapter num="叁" kicker="卷 之 三" title="玄机先生" sub="先生不言吉凶，只按盘说话。" />

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
      </div>

      <div className="master-live">
        <div className="master-top">
          <p className="master-open">{opening}</p>
          <div className="master-actions" role="group" aria-label="问事方向">
            <span className="master-actions-label" aria-hidden="true">
              问事方向
            </span>
            {DIRECTIONS.map((d) => (
              <button
                key={d.mode}
                type="button"
                className={`master-btn${activeMode === d.mode ? ' master-btn--active' : ''}`}
                disabled={!chartsReady || busy}
                onClick={() => startRun(d.mode)}
              >
                {d.label}
              </button>
            ))}
            <button
              type="button"
              className={`master-btn master-btn--merge${activeMode === 'merge' ? ' master-btn--active' : ''}`}
              disabled={!chartsReady || busy}
              onClick={() => startRun('merge')}
            >
              合参
            </button>
          </div>
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
            <>
              <p className="master-quiet">点一个方向，先生按盘说话。</p>
              <p className="master-quiet-sub">六方向各附依据；合参找印证，也找错位。</p>
            </>
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
            className="master-btn"
            type="submit"
            disabled={!chartsReady || busy || !askText.trim()}
          >
            问
          </button>
        </form>

        {showTail && (
          <p className="master-tail">本解读为传统文化娱乐内容，不构成任何决策依据。</p>
        )}
      </div>

      <p className="screen-note">本页只陈六方向，不判生死，不承诺财运。</p>
    </>
  )
}
