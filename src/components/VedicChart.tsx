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

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
const GRAHA_CN: Record<string, string> = {
  Sun: '太阳',
  Moon: '月亮',
  Mars: '火星',
  Mercury: '水星',
  Jupiter: '木星',
  Venus: '金星',
  Saturn: '土星',
}
const YOGA_CN: Record<string, string> = {
  Gajakesari: '象王',
  Budhaditya: '日水同宫',
  'Chandra-Mangala': '月火',
  'Panch Mahapurusha': '五大人',
  Kemadruma: '孤月',
  'Raja Yoga': '王者',
  'Dhana Yoga': '财',
  'Neecha Bhanga': '落陷解',
}
// 末尾的 U+FE0E 强制文字呈现，避免 Windows 把黄道符号画成紫底 emoji
const RING_GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map(
  (g) => `${g}\uFE0E`,
)

function VedicBody({ data }: { data: VedicResult }) {
  const lagnaSign = SIGN_CN.indexOf(data.lagna.sign_cn)
  const houseOf = (sign: number) => ((sign - lagnaSign + 12) % 12) + 1
  const moonSign = SIGN_CN.indexOf(data.planets[1].sign_cn)
  const current = data.dasha.find((d) => d.is_current)
  const cn = (name: string) => GRAHA_CN[name] ?? name
  const yogas = Object.entries(data.yogas)
    .filter(([, on]) => on)
    .map(([name]) => YOGA_CN[name] ?? name)

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

      <div className="vedic-ring" aria-hidden="true">
        <svg viewBox="0 0 220 220" focusable="false">
          <g fill="none" stroke="currentColor">
            <circle cx="110" cy="110" r="103" strokeWidth="1" />
            <circle cx="110" cy="110" r="94" strokeWidth="0.6" strokeDasharray="1 4" />
            <circle cx="110" cy="110" r="56" strokeWidth="0.5" />
            <path d="M110 7v20M110 193v20M7 110h20M193 110h20" strokeWidth="0.9" />
          </g>
          <text
            x="110"
            y="105"
            fill="currentColor"
            textAnchor="middle"
            style={{ fontFamily: 'var(--font-kai), serif', fontSize: 19, letterSpacing: '0.12em' }}
          >
            {data.lagna.sign_cn}
          </text>
          <text
            x="110"
            y="123"
            fill="currentColor"
            textAnchor="middle"
            style={{ fontFamily: 'var(--font-kai), serif', fontSize: 8.5, letterSpacing: '0.1em' }}
          >
            {data.moon_nakshatra.name} · {data.moon_nakshatra.pada}
          </text>
          {RING_GLYPHS.map((glyph, index) => {
            const angle = (index * Math.PI) / 6 - Math.PI / 2
            const tickIn = { x: 110 + Math.cos(angle) * 88, y: 110 + Math.sin(angle) * 88 }
            const tickOut = { x: 110 + Math.cos(angle) * 96, y: 110 + Math.sin(angle) * 96 }
            const text = { x: 110 + Math.cos(angle) * 77, y: 110 + Math.sin(angle) * 77 }
            return (
              <g key={glyph}>
                <line
                  x1={tickIn.x}
                  y1={tickIn.y}
                  x2={tickOut.x}
                  y2={tickOut.y}
                  stroke="currentColor"
                  strokeWidth="0.8"
                />
                <text
                  x={text.x}
                  y={text.y}
                  fill="currentColor"
                  fontSize="10"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {glyph}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="vedic-layout">
        <div className="vedic-main">
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
                  <span className="vcell-house">
                    <span className="vcell-roman">{ROMAN[house - 1]}</span>
                    {house}
                  </span>
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
                  {current ? `${cn(current.md_planet)} · ${current.ad_planet ? cn(current.ad_planet) : ''}` : '—'}
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
        </div>

        <aside className="vedic-side">
          <section className="side-section">
            <h2 className="side-k">九曜细目</h2>
            <div className="vedic-roster">
              {data.planets.map((p) => (
                <div className="vrow" key={p.planet}>
                  <div className="vrow-main">
                    <Term name={p.planet} className="vrow-name">
                      {p.planet}
                    </Term>
                    <span className="vrow-deg">{p.degree}</span>
                    {p.retro && <span className="vrow-retro">逆</span>}
                  </div>
                  <div className="vrow-sub">
                    <span>{p.sign_cn}</span>
                    <span>第{p.house}宫</span>
                    <span>{p.nakshatra}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="side-section">
            <h2 className="side-k">盘中标记</h2>
            <dl className="vedic-meta">
              <div className="vmeta-row">
                <dt>月宿主</dt>
                <dd>{cn(data.moon_nakshatra.lord)}</dd>
              </div>
              <div className="vmeta-row">
                <dt>大运</dt>
                <dd>
                  {current
                    ? `${cn(current.md_planet)} ${current.md_start} 至 ${current.md_end}`
                    : '—'}
                </dd>
              </div>
              <div className="vmeta-row">
                <dt>小运</dt>
                <dd>
                  {current?.ad_planet
                    ? `${cn(current.ad_planet)} ${current.ad_start ?? ''} 至 ${current.ad_end ?? ''}`
                    : '—'}
                </dd>
              </div>
              <div className="vmeta-row">
                <dt>
                  <Term name="瑜伽">瑜伽</Term>
                </dt>
                <dd>{yogas.length ? yogas.join(' · ') : '未见常见瑜伽'}</dd>
              </div>
              <div className="vmeta-row">
                <dt>指示星</dt>
                <dd>
                  AK {cn(data.karakas.AK)} · AmK {cn(data.karakas.AmK)} · DK{' '}
                  {cn(data.karakas.DK)}
                </dd>
              </div>
              <div className="vmeta-row">
                <dt>岁差</dt>
                <dd>{data.ayanamsa.toFixed(2)}°</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
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
