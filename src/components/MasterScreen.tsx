import { useEffect, useMemo, useRef, useState } from 'react'
import { calcBazi } from '../engine/bazi'
import type { VedicResult } from '../engine/vedic'
import { Chapter } from './Chapter'
import {
  DIRECTIONS,
  buildChartPayload,
  fallbackText,
  openingLine,
  streamInterpret,
  type InterpMode,
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
  | { phase: 'busy'; mode: InterpMode; text: string; note?: string }
  | { phase: 'done'; mode: InterpMode; text: string }
  | { phase: 'stopped'; mode: InterpMode; text: string; note?: string }

const STOP_NOTE = '已止。半截的话，作半截听。'

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
  const abortRef = useRef<AbortController | null>(null)
  const runSeq = useRef(0)
  const outputRef = useRef<HTMLDivElement | null>(null)

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
    const node = outputRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [run])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  function startRun(mode: InterpMode) {
    if (!entry || !bazi || vedic.status !== 'ready') return
    abortRef.current?.abort()
    const token = ++runSeq.current
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const payload = buildChartPayload(bazi, vedic.data, entry.gender)
    setRun({ phase: 'busy', mode, text: '' })
    void streamInterpret(
      payload,
      mode,
      (event) => {
        if (token !== runSeq.current) return
        setRun((prev) => {
          if (event.kind === 'delta') {
            const base = prev.phase === 'busy' ? prev.text : ''
            return { phase: 'busy', mode, text: base + event.text }
          }
          if (event.kind === 'replace') {
            return { phase: 'busy', mode, text: event.text }
          }
          if (event.kind === 'done') {
            // 只从 busy 态转移，重复的终态事件不改写已定文本。
            return prev.phase === 'busy'
              ? { phase: 'done', mode, text: prev.text }
              : prev
          }
          if (event.kind === 'error') {
            return prev.phase === 'busy'
              ? { phase: 'stopped', mode, text: prev.text, note: fallbackText(event.code) }
              : prev
          }
          if (event.kind === 'stopped') {
            return prev.phase === 'busy'
              ? {
                  phase: 'stopped',
                  mode,
                  text: prev.text,
                  note: prev.text ? STOP_NOTE : '先生还没开口就停了。',
                }
              : prev
          }
          if (event.kind === 'network') {
            return prev.phase === 'busy'
              ? { phase: 'stopped', mode, text: prev.text, note: fallbackText('network') }
              : prev
          }
          return prev
        })
      },
      ctrl.signal,
    )
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
  const activeMode = busy ? run.mode : run.phase === 'idle' ? null : run.mode
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
          <div className="master-actions" role="group" aria-label="解读方向">
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

        <div className="master-output" ref={outputRef} aria-live="polite">
          {run.phase === 'idle' && <p className="master-quiet">点一个方向，或请先生合参。</p>}
          {run.phase === 'busy' && (
            <>
              <p className="master-text">{run.text || '先生翻盘中……'}</p>
              <button className="link master-stop" type="button" onClick={stopRun}>
                停止
              </button>
            </>
          )}
          {run.phase === 'done' && <p className="master-text">{run.text}</p>}
          {run.phase === 'stopped' && (
            <>
              {run.text && <p className="master-text">{run.text}</p>}
              {run.note && (
                <p className={`master-note-line${run.text ? '' : ' master-note-line--only'}`}>
                  {run.note}
                </p>
              )}
              <button className="link master-stop" type="button" onClick={() => startRun(run.mode)}>
                再问一次
              </button>
            </>
          )}
        </div>

        {showTail && (
          <p className="master-tail">本解读为传统文化娱乐内容，不构成任何决策依据。</p>
        )}
      </div>

      <p className="screen-note">六方向，每条附依据；合参找印证，也找错位。</p>
    </>
  )
}
