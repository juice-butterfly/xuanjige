import { useEffect, useState, type FormEvent } from 'react'
import { Chapter } from './components/Chapter'
import { BaziChart } from './components/BaziChart'
import { MasterScreen } from './components/MasterScreen'
import { MatchScreen } from './components/MatchScreen'
import { VedicChart } from './components/VedicChart'
import { cnDate, cnTime, coordsLabel, localISODate } from './lib/format'
import citiesRaw from './data/cities.json'

type Coord = { lat: number; lon: number }
type Gender = 'male' | 'female'
type Screen = 'form' | 'charts' | 'master' | 'match'
type Theme = 'night' | 'day'

type Draft = {
  province: string
  city: string
  lat: number | null
  lon: number | null
  date: string
  time: string
  timeUnknown: boolean
  gender: Gender | ''
}

type Entry = {
  version: 1
  province: string
  city: string
  lat: number
  lon: number
  dob: string
  time: string | null
  timeUnknown: boolean
  gender: Gender
  savedAt: string
}

const CITIES = (citiesRaw as unknown as { data: Record<string, Record<string, Coord>> }).data
const PROVINCES = Object.keys(CITIES)

const DRAFT_KEY = 'xuanjige.draft.v1'
const ENTRY_KEY = 'xuanjige.entry.v1'
const THEME_KEY = 'xuanjige.theme.v1'

const EMPTY_DRAFT: Draft = {
  province: '',
  city: '',
  lat: null,
  lon: null,
  date: '',
  time: '',
  timeUnknown: false,
  gender: '',
}

const TODAY = localISODate()

function readStorage(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'day' ? 'day' : 'night'
  } catch {
    return 'night'
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 本机存储不可用时，表单仍可正常使用 */
  }
}

function normalizeDraft(value: unknown): Draft | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const province = typeof v.province === 'string' && v.province in CITIES ? v.province : ''
  const city =
    province && typeof v.city === 'string' && v.city in CITIES[province] ? v.city : ''
  const coord = city ? CITIES[province][city] : null
  const date = typeof v.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : ''
  const time = typeof v.time === 'string' && /^\d{2}:\d{2}$/.test(v.time) ? v.time : ''
  const timeUnknown = v.timeUnknown === true
  const gender: Gender | '' = v.gender === 'male' || v.gender === 'female' ? v.gender : ''
  return {
    province,
    city,
    lat: coord ? coord.lat : null,
    lon: coord ? coord.lon : null,
    date,
    time,
    timeUnknown,
    gender,
  }
}

function normalizeEntry(value: unknown): Entry | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (
    v.version !== 1 ||
    typeof v.province !== 'string' ||
    typeof v.city !== 'string' ||
    typeof v.lat !== 'number' ||
    typeof v.lon !== 'number' ||
    typeof v.dob !== 'string' ||
    (v.gender !== 'male' && v.gender !== 'female')
  ) {
    return null
  }
  return {
    version: 1,
    province: v.province,
    city: v.city,
    lat: v.lat,
    lon: v.lon,
    dob: v.dob,
    time: typeof v.time === 'string' ? v.time : null,
    timeUnknown: v.timeUnknown === true,
    gender: v.gender,
    savedAt: typeof v.savedAt === 'string' ? v.savedAt : '',
  }
}

function initialForm() {
  const entry = normalizeEntry(readStorage(ENTRY_KEY))
  const saved = normalizeDraft(readStorage(DRAFT_KEY))
  if (saved) return { entry, draft: saved }
  if (entry) {
    return {
      entry,
      draft: {
        province: entry.province,
        city: entry.city,
        lat: entry.lat,
        lon: entry.lon,
        date: entry.dob,
        time: entry.time ?? '',
        timeUnknown: entry.timeUnknown,
        gender: entry.gender,
      },
    }
  }
  return { entry: null, draft: EMPTY_DRAFT }
}

const TABS: { id: Screen; num: string; label: string }[] = [
  { id: 'form', num: '壹', label: '报上生辰' },
  { id: 'charts', num: '贰', label: '双盘' },
  { id: 'master', num: '叁', label: '玄机先生' },
  { id: 'match', num: '肆', label: '关系人' },
]

function App() {
  const [initial] = useState(initialForm)
  const [screen, setScreen] = useState<Screen>('form')
  const [draft, setDraft] = useState<Draft>(initial.draft)
  const [entry, setEntry] = useState<Entry | null>(initial.entry)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    writeStorage(DRAFT_KEY, draft)
  }, [draft])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* 主题仍可在本次会话内切换 */
    }
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'day' ? '#EDE6D6' : '#0B0B0D')
  }, [theme])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen])

  function go(next: Screen) {
    setScreen(next)
    setError('')
  }

  function edit(patch: Partial<Draft>) {
    setDraft((prev) => ({ ...prev, ...patch }))
    setError('')
  }

  function chooseProvince(province: string) {
    edit({ province, city: '', lat: null, lon: null })
  }

  function chooseCity(city: string) {
    const coord = draft.province ? CITIES[draft.province]?.[city] : null
    edit({ city, lat: coord ? coord.lat : null, lon: coord ? coord.lon : null })
  }

  function validate(): { message: string; focusId: string } | null {
    if (!draft.province) return { message: '请先择出生省份。', focusId: 'province' }
    if (!draft.city) return { message: '请再择出生城市。', focusId: 'city' }
    if (!draft.date) return { message: '请择公历生日。', focusId: 'dob' }
    if (draft.date < '1900-01-01' || draft.date > TODAY)
      return { message: '生日须在一九〇〇年至今之间。', focusId: 'dob' }
    if (!draft.timeUnknown && !draft.time)
      return { message: '请择出生时刻，或勾选「时辰不详」。', focusId: 'birth-time' }
    if (!draft.gender) return { message: '请择男或女。', focusId: 'gender-male' }
    return null
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const problem = validate()
    if (problem) {
      setError(problem.message)
      requestAnimationFrame(() => document.getElementById(problem.focusId)?.focus())
      return
    }
    const coord = CITIES[draft.province][draft.city]
    const next: Entry = {
      version: 1,
      province: draft.province,
      city: draft.city,
      lat: coord.lat,
      lon: coord.lon,
      dob: draft.date,
      time: draft.timeUnknown ? null : draft.time,
      timeUnknown: draft.timeUnknown,
      gender: draft.gender as Gender,
      savedAt: new Date().toISOString(),
    }
    writeStorage(ENTRY_KEY, next)
    setEntry(next)
    setError('')
    go('charts')
  }

  function editRecord() {
    if (!entry) {
      go('form')
      return
    }
    setDraft({
      province: entry.province,
      city: entry.city,
      lat: entry.lat,
      lon: entry.lon,
      date: entry.dob,
      time: entry.time ?? '',
      timeUnknown: entry.timeUnknown,
      gender: entry.gender,
    })
    go('form')
  }

  return (
    <div className="site">
      <div className="frame" aria-hidden="true" />

      <header className="masthead">
        <div className="brand">
          <span className="seal" aria-hidden="true">
            玄
          </span>
          <span className="brand-copy">
            <span className="brand-title">玄机阁</span>
            <span className="brand-sub">中西合参 · 命盘</span>
          </span>
        </div>
        <div className="mast-tools">
          <p className="credo">不卜生死 · 不问吉凶</p>
          <button
            type="button"
            className="theme-toggle"
            aria-label={theme === 'night' ? '切换到日间模式' : '切换到夜间模式'}
            title={theme === 'night' ? '日间模式' : '夜间模式'}
            onClick={() => setTheme(theme === 'night' ? 'day' : 'night')}
          >
            {theme === 'night' ? '日间' : '夜间'}
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="导航">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="tab"
            aria-current={screen === tab.id ? 'page' : undefined}
            onClick={() => go(tab.id)}
          >
            <span className="tab-num" aria-hidden="true">
              {tab.num}
            </span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <main className={`page${screen === 'charts' || screen === 'match' ? ' page--wide' : ''}`}>
        <section className="screen" key={screen}>
          {screen === 'form' && (
            <>
              <Chapter num="壹" kicker="卷 之 一" title="报上生辰" sub="以公历为凭，以生地定经纬。所报不存姓名。" />
              <form className="ledger" onSubmit={handleSubmit} noValidate>
                <div className="ledger-row">
                  <div className="row-main">
                    <label className="row-label" htmlFor="province">
                      出生省份
                    </label>
                    <span className="leader" aria-hidden="true" />
                    <span className="control control--select">
                      <select
                        id="province"
                        value={draft.province}
                        className={draft.province ? '' : 'is-empty'}
                        onChange={(e) => chooseProvince(e.target.value)}
                      >
                        <option value="">未择</option>
                        {PROVINCES.map((province) => (
                          <option key={province} value={province}>
                            {province}
                          </option>
                        ))}
                      </select>
                    </span>
                  </div>
                </div>

                <div className="ledger-row">
                  <div className="row-main">
                    <label className="row-label" htmlFor="city">
                      出生城市
                    </label>
                    <span className="leader" aria-hidden="true" />
                    <span className="control control--select">
                      <select
                        id="city"
                        value={draft.city}
                        disabled={!draft.province}
                        className={draft.city ? '' : 'is-empty'}
                        onChange={(e) => chooseCity(e.target.value)}
                      >
                        <option value="">{draft.province ? '未择' : '先择省份'}</option>
                        {draft.province &&
                          Object.keys(CITIES[draft.province]).map((city) => (
                            <option key={city} value={city}>
                              {city}
                            </option>
                          ))}
                      </select>
                    </span>
                  </div>
                  <p className={`coords${draft.lat !== null && draft.lon !== null ? '' : ' is-empty'}`}>
                    {draft.lat !== null && draft.lon !== null
                      ? coordsLabel(draft.lat, draft.lon)
                      : '择地而后定经纬'}
                  </p>
                </div>

                <div className="ledger-row">
                  <div className="row-main">
                    <label className="row-label" htmlFor="dob">
                      公历生日
                    </label>
                    <span className="leader" aria-hidden="true" />
                    <span className="control">
                      <input
                        id="dob"
                        type="date"
                        min="1900-01-01"
                        max={TODAY}
                        value={draft.date}
                        className={draft.date ? '' : 'is-empty'}
                        onChange={(e) => edit({ date: e.target.value })}
                        onClick={(e) => {
                          try {
                            e.currentTarget.showPicker?.()
                          } catch {
                            /* 浏览器自行处理 */
                          }
                        }}
                      />
                    </span>
                  </div>
                </div>

                <div className="ledger-row">
                  <div className="row-main">
                    <label className="row-label" htmlFor="birth-time">
                      出生时刻
                    </label>
                    <span className="leader" aria-hidden="true" />
                    <span className="control">
                      <input
                        id="birth-time"
                        type="time"
                        step="60"
                        value={draft.time}
                        disabled={draft.timeUnknown}
                        className={draft.time ? '' : 'is-empty'}
                        onChange={(e) => edit({ time: e.target.value })}
                        onClick={(e) => {
                          if (draft.timeUnknown) return
                          try {
                            e.currentTarget.showPicker?.()
                          } catch {
                            /* 浏览器自行处理 */
                          }
                        }}
                      />
                      <label className="unknown">
                        <input
                          type="checkbox"
                          checked={draft.timeUnknown}
                          onChange={(e) => edit({ timeUnknown: e.target.checked })}
                        />
                        <span className="box" aria-hidden="true" />
                        <span className="unknown-label">时辰不详</span>
                      </label>
                    </span>
                  </div>
                  {draft.timeUnknown && (
                    <p className="time-note">时辰不详 · 时柱留白，先生不猜。</p>
                  )}
                </div>

                <div className="ledger-row">
                  <div className="row-main">
                    <span className="row-label" id="gender-label">
                      性别
                    </span>
                    <span className="leader" aria-hidden="true" />
                    <span className="seg" role="group" aria-labelledby="gender-label">
                      <button
                        id="gender-male"
                        type="button"
                        aria-pressed={draft.gender === 'male'}
                        onClick={() => edit({ gender: 'male' })}
                      >
                        男
                      </button>
                      <button
                        type="button"
                        aria-pressed={draft.gender === 'female'}
                        onClick={() => edit({ gender: 'female' })}
                      >
                        女
                      </button>
                    </span>
                  </div>
                </div>

                <div className="submit-wrap">
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                  <button className="submit" type="submit">
                    起盘
                  </button>
                  <p className="micro">只在本机留存 · 不存姓名</p>
                </div>
              </form>
            </>
          )}

          {screen === 'charts' && (
            <DualScreen
              entry={entry}
              onEdit={editRecord}
              onForm={() => go('form')}
              onMaster={() => go('master')}
            />
          )}
          {screen === 'master' && (
            <MasterScreen entry={entry} onForm={() => go('form')} onEdit={editRecord} />
          )}
          {screen === 'match' && (
            <MatchScreen
              entry={entry}
              onForm={() => go('form')}
              onEdit={editRecord}
            />
          )}
        </section>
      </main>

      <footer className="compliance">
        <p>
          <span>本工具为传统文化娱乐内容，解读由大模型生成，</span>
          <span>仅供参考，不构成任何决策依据</span>
        </p>
      </footer>
    </div>
  )
}

function DualScreen({
  entry,
  onEdit,
  onForm,
  onMaster,
}: {
  entry: Entry | null
  onEdit: () => void
  onForm: () => void
  onMaster: () => void
}) {
  const [view, setView] = useState<'cn' | 've'>('cn')

  return (
    <>
      <Chapter num="贰" kicker="卷 之 二" title="双盘" sub="四柱在左，印占在右，中间是合参。" />

      {entry ? (
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
          <div className="record-line record-line--sub">
            <span>{cnDate(entry.dob)}</span>
            <span>{cnTime(entry.time)}</span>
            <span className="record-coord">{coordsLabel(entry.lat, entry.lon)}</span>
          </div>
        </div>
      ) : (
        <div className="record record--empty">
          <div className="record-line">
            <span className="record-k">尚未报上生辰</span>
            <span className="record-quiet">两盘要等生辰落定，才肯开口。</span>
            <button className="link" type="button" onClick={onForm}>
              去报生辰
            </button>
          </div>
        </div>
      )}

      {entry ? (
        entry.time ? (
          <>
            <div className="dual-seg-row">
              <span className="dual-seg-label">盘面</span>
              <div className="seg dual-seg" role="group" aria-label="切换中西盘">
                <button
                  type="button"
                  aria-pressed={view === 'cn'}
                  onClick={() => setView('cn')}
                >
                  中
                </button>
                <button
                  type="button"
                  aria-pressed={view === 've'}
                  onClick={() => setView('ve')}
                >
                  西
                </button>
              </div>
            </div>

            <div className="dual dual--live">
              <div
                className={`dual-col dual-col--cn${view === 'cn' ? ' dual-col--active' : ''}`}
              >
                <header className="dual-col-head">
                  <span className="panel-index">其一</span>
                  <h2 className="panel-title">四柱</h2>
                </header>
                <BaziChart dob={entry.dob} time={entry.time} gender={entry.gender} />
              </div>

              <div className="dual-col dual-col--mid">
                <header className="dual-col-head">
                  <span className="panel-index">其二</span>
                  <h2 className="panel-title">合参</h2>
                </header>
                <div className="hec-hold">
                  <span className="panel-state">待合</span>
                  <p className="hec-note">两盘并陈，先生开卷后此处合参。</p>
                  <button className="link" type="button" onClick={onMaster}>
                    去问先生
                  </button>
                  <span className="panel-ghost" aria-hidden="true">
                    参
                  </span>
                </div>
              </div>

              <div
                className={`dual-col dual-col--ve${view === 've' ? ' dual-col--active' : ''}`}
              >
                <header className="dual-col-head">
                  <span className="panel-index">其三</span>
                  <h2 className="panel-title">印占</h2>
                </header>
                <VedicChart
                  dob={entry.dob}
                  time={entry.time}
                  place={`${entry.province}·${entry.city}`}
                  lat={entry.lat}
                  lon={entry.lon}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="chart-blocked">
            <p className="chart-blocked-k">时辰不详</p>
            <p className="chart-blocked-text">四柱缺一，时柱不猜。补上出生时刻，命盘才完整。</p>
            <button className="link" type="button" onClick={onEdit}>
              补录时辰
            </button>
          </div>
        )
      ) : (
        <>
          <div className="dual">
            <article className="panel">
              <div className="panel-head">
                <span className="panel-index">其一</span>
                <h2 className="panel-title">四柱</h2>
              </div>
              <p className="panel-sub">年 · 月 · 日 · 时</p>
              <span className="panel-state">待起</span>
              <span className="panel-ghost" aria-hidden="true">
                柱
              </span>
            </article>
            <article className="panel panel--mid">
              <div className="panel-head">
                <span className="panel-index">其二</span>
                <h2 className="panel-title">合参</h2>
              </div>
              <p className="panel-sub">印证 · 错位 · 综合</p>
              <span className="panel-state">待合</span>
              <span className="panel-ghost" aria-hidden="true">
                参
              </span>
            </article>
            <article className="panel">
              <div className="panel-head">
                <span className="panel-index">其三</span>
                <h2 className="panel-title">印占</h2>
              </div>
              <p className="panel-sub">命宫 · 九曜 · 大运</p>
              <span className="panel-state">待起</span>
              <span className="panel-ghost" aria-hidden="true">
                曜
              </span>
            </article>
          </div>

          <p className="screen-note">两盘要等生辰落定，才肯开口。</p>
        </>
      )}
    </>
  )
}

export default App
