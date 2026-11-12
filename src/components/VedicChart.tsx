import { useEffect, useState } from 'react'
import { SIGN_CN } from '../engine/signs'
import type { VedicResult } from '../engine/vedic'
import { Term, TermSheet, useTermSheet } from './Term'

// 南印制：十二星座位置固定，中间 2×2 为信息格
const SOUTH: Array<{ sign: number; row: number; col: number }> = [
  { sign: 11, row: 1, col: 1 },
  { sign: 0, row: 1, col: 2 },
  { sign: 1, row: 1, col: 3 },
  { sign: 2, row: 1, col: 4 },
  { sign: 10, row: 2, col: 1 },
  { sign: 3, row: 2, col: 4 },
  { sign: 9, row: 3, col: 1 },
  { sign: 4, row: 3, col: 4 },
  { sign: 8, row: 4, col: 1 },
  { sign: 7, row: 4, col: 2 },
  { sign: 6, row: 4, col: 3 },
  { sign: 5, row: 4, col: 4 },
]

type VedicState =
  | { status: 'loading' }
  | { status: 'ready'; data: VedicResult }
  | { status: 'error'; message: string }

export function VedicChart({
  dob,
  time,
  place,
  lat,
  lon,
}: {
  dob: string
  time: string
  place: string
  lat: number
  lon: number
}) {
  const [state, setState] = useState<VedicState>({ status: 'loading' })
  const { activeTerm, handleTermClick, close } = useTermSheet()

  useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    import('../engine/vedic')
      .then(({ calcVedic }) => calcVedic({ dob, time, place, lat, lon }))
      .then((data) => {
        if (alive) setState({ status: 'ready', data })
      })
      .catch((err: unknown) => {
        if (alive) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : '星历加载失败，印占盘暂缺。',
          })
        }
      })
    return () => {
      alive = false
    }
  }, [dob, time, place, lat, lon])

  return (
    <section className="vedic" aria-label="西式印占命盘" onClick={handleTermClick}>
      {state.status === 'ready' && <VedicBody data={state.data} />}
      {state.status === 'loading' && <VedicSkeleton />}
      {state.status === 'error' && (
        <div className="chart-blocked vedic-error">
          <p className="chart-blocked-k">印占未成</p>
          <p className="chart-blocked-text">{state.message}</p>
        </div>
      )}
      <TermSheet term={activeTerm} onClose={close} />
    </section>
  )
}

function VedicBody({ data }: { data: VedicResult }) {
  const lagnaSign = SIGN_CN.indexOf(data.lagna.sign_cn)
  const houseOf = (sign: number) => ((sign - lagnaSign + 12) % 12) + 1
  const moonSign = SIGN_CN.indexOf(data.planets[1].sign_cn)
  const current = data.dasha.find((d) => d.is_current)

  return (
    <>
      <header className="bazi-head">
        <div className="bazi-head-main">
          <p className="bazi-lunar">恒星黄道 · 整宫十二宫</p>
          <p className="bazi-meta">
            <span>月相 {data.moon_phase ? '盈' : '亏'}</span>
            <span>
              <Term name="九曜" className="term--inline">
                九曜
              </Term>
            </span>
          </p>
        </div>
        <p className="bazi-hint">术语带虚点 · 点开看一句</p>
      </header>

      <div className="vedic-grid">
        {SOUTH.map(({ sign, row, col }) => {
          const house = houseOf(sign)
          const here = data.planets.filter(
            (p) => (lagnaSign + p.house - 1) % 12 === sign,
          )
          const isLagna = sign === lagnaSign
          const isMoon = sign === moonSign
          const cls = [
            'vcell',
            isLagna ? ' vcell--lagna' : '',
            col === 4 ? ' vcell--col-end' : '',
            row === 4 ? ' vcell--row-end' : '',
          ].join('')
          return (
            <div className={cls} key={sign} style={{ gridArea: `${row} / ${col}` }}>
              <span className="vcell-house">{house}</span>
              {isMoon && <span className="vcell-moondot" aria-label="月亮所在宫" />}
              <span className="vcell-sign">{SIGN_CN[sign]}</span>
              <ul className="vcell-planets">
                {here.map((p) => (
                  <li className="vplanet" key={p.planet}>
                    <Term name={p.planet} className="term--inline vplanet-name">
                      {p.planet}
                    </Term>
                    <span className="vplanet-deg">{p.degree}</span>
                    {p.retro && (
                      <Term name="逆行" className="term--inline vplanet-retro">
                        逆
                      </Term>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}

        <div className="vcenter">
          <div className="vcenter-row">
            <span className="vcenter-k">
              <Term name="上升" className="term--label">
                上升
              </Term>
            </span>
            <span className="vcenter-v">
              {data.lagna.sign_cn} {data.lagna.degree}
            </span>
          </div>
          <div className="vcenter-row">
            <span className="vcenter-k">
              <Term name="月宿" className="term--label">
                月宿
              </Term>
            </span>
            <span className="vcenter-v">
              {data.moon_nakshatra.name} · {data.moon_nakshatra.pada}
            </span>
          </div>
          <div className="vcenter-row">
            <span className="vcenter-k">
              <Term name="运限" className="term--label">
                现运
              </Term>
            </span>
            <span className="vcenter-v">
              {current ? `${current.md_planet} · ${current.ad_planet ?? ''}` : '—'}
            </span>
          </div>
          <div className="vcenter-row">
            <span className="vcenter-k">
              <Term name="岁差" className="term--label">
                岁差
              </Term>
            </span>
            <span className="vcenter-v">{data.ayanamsa.toFixed(2)}°</span>
          </div>
        </div>
      </div>

      <p className="vedic-note">
        罗睺计都恒逆行；度数为恒星黄道位置。四正宫为一、四、七、十。
      </p>
    </>
  )
}

function VedicSkeleton() {
  return (
    <>
      <header className="bazi-head">
        <div className="bazi-head-main">
          <p className="bazi-lunar">恒星黄道 · 整宫十二宫</p>
        </div>
        <p className="bazi-hint">星历载入中…</p>
      </header>
      <div className="vedic-grid vedic-grid--skel" aria-hidden="true">
        {SOUTH.map(({ sign, row, col }) => (
          <div
            className={`vcell vcell--skel${col === 4 ? ' vcell--col-end' : ''}${
              row === 4 ? ' vcell--row-end' : ''
            }`}
            key={sign}
            style={{ gridArea: `${row} / ${col}` }}
          >
            <span className="vcell-sign">{SIGN_CN[sign]}</span>
            <span className="vskel-line" />
          </div>
        ))}
        <div className="vcenter vcenter--skel">
          <span className="vskel-line" />
          <span className="vskel-line" />
          <span className="vskel-line" />
          <span className="vskel-line" />
        </div>
      </div>
    </>
  )
}
