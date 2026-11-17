import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Chapter } from './components/Chapter'
import { CnChartPage } from './components/CnChartPage'
import { MasterScreen } from './components/MasterScreen'
import { CompassArt } from './components/Ornament'
import { PartnerDialog } from './components/PartnerDialog'
import { VeChartPage } from './components/VeChartPage'
import {
  loadPartners,
  savePartners,
  type Partner,
} from './lib/partners'
import { coordsLabel, localISODate, plainDate, shichen } from './lib/format'
import {
  lunarDayLabel,
  lunarLabel,
  lunarMonths,
  lunarToSolar,
  solarToLunar,
  type CalendarKind,
  type LunarDate,
} from './lib/calendar'
import citiesRaw from './data/cities.json'

type Coord = { lat: number; lon: number }
type Gender = 'male' | 'female'
type Screen = 'form' | 'cn' | 've' | 'master'
type Theme = 'night' | 'day'

type Draft = {
  province: string
  city: string
  lat: number | null
  lon: number | null
  calendar: CalendarKind
  lunar: LunarDate | null
  date: string
  time: string
  timeUnknown: boolean
  gender: Gender | ''
}

type Entry = {
  version: 2
  province: string
  city: string
  lat: number
  lon: number
  dob: string
  time: string | null
  timeUnknown: boolean
  gender: Gender
  calendar: CalendarKind
  lunar?: LunarDate
  savedAt: string
}

const CITIES = (citiesRaw as unknown as { data: Record<string, Record<string, Coord>> }).data
const PROVINCES = Object.keys(CITIES)

const DRAFT_KEY = 'xuanjige.draft.v1'
const ENTRY_KEY = 'xuanjige.entry.v1'
const THEME_KEY = 'xuanjige.theme.v2'

const EMPTY_DRAFT: Draft = {
  province: '',
  city: '',
  lat: null,
  lon: null,
  calendar: 'solar',
  lunar: null,
  date: '',
  time: '',
  timeUnknown: false,
  gender: '',
}

const TODAY = localISODate()
const THIS_YEAR = Number(TODAY.slice(0, 4))
const LUNAR_YEARS = Array.from({ length: THIS_YEAR - 1900 + 1 }, (_, i) => THIS_YEAR - i)

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
    return localStorage.getItem(THEME_KEY) === 'night' ? 'night' : 'day'
  } catch {
    return 'day'
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 本机存储不可用时，表单仍可正常使用 */
  }
}

function normalizeLunarDate(value: unknown): LunarDate | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const year = typeof v.year === 'number' ? v.year : NaN
  const month = typeof v.month === 'number' ? v.month : NaN
  const day = typeof v.day === 'number' ? v.day : NaN
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  if (year < 1900 || year > THIS_YEAR) return null
  if (month === 0 || Math.abs(month) > 12 || day < 1 || day > 30) return null
  return lunarToSolar({ year, month, day }) ? { year, month, day } : null
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
  const calendar: CalendarKind = v.calendar === 'lunar' ? 'lunar' : 'solar'
  const lunar = calendar === 'lunar'
    ? (normalizeLunarDate(v.lunar) ?? (date ? solarToLunar(date) : null))
    : null
  return {
    province,
    city,
    lat: coord ? coord.lat : null,
    lon: coord ? coord.lon : null,
    calendar,
    lunar,
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
    (v.version !== 1 && v.version !== 2) ||
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
  const lunar = v.version === 2 && v.calendar === 'lunar' ? normalizeLunarDate(v.lunar) : null
  const keptLunar = lunar && lunarToSolar(lunar) === v.dob ? lunar : null
  return {
    version: 2,
    province: v.province,
    city: v.city,
    lat: v.lat,
    lon: v.lon,
    dob: v.dob,
    time: typeof v.time === 'string' && /^\d{2}:\d{2}$/.test(v.time) ? v.time : null,
    timeUnknown: v.timeUnknown === true,
    gender: v.gender,
    calendar: keptLunar ? 'lunar' : 'solar',
    ...(keptLunar ? { lunar: keptLunar } : {}),
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
        calendar: entry.calendar,
        lunar: entry.lunar ?? null,
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
  { id: 'cn', num: '贰', label: '中式盘' },
  { id: 've', num: '叁', label: '西式盘' },
  { id: 'master', num: '肆', label: '玄机先生' },
]

function App() {
  const [initial] = useState(initialForm)
  const [screen, setScreen] = useState<Screen>('form')
  const [draft, setDraft] = useState<Draft>(initial.draft)
  const [entry, setEntry] = useState<Entry | null>(initial.entry)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState<Theme>(readTheme)
  const [masterIntent, setMasterIntent] = useState<'merge' | 'relation' | null>(null)
  const [partners, setPartners] = useState<Partner[]>(loadPartners)
  const [activePartnerId, setActivePartnerId] = useState<string | null>(null)
  const [partnerOpen, setPartnerOpen] = useState(false)
  const [partnerEditId, setPartnerEditId] = useState<string | null>(null)
  const tabsRef = useRef<HTMLElement | null>(null)
  const [tabInk, setTabInk] = useState<{ left: number; width: number } | null>(null)
  const [tabInkOn, setTabInkOn] = useState(false)

  useLayoutEffect(() => {
    const nav = tabsRef.current
    if (!nav) return
    const measure = () => {
      const active = nav.querySelector<HTMLElement>('.tab[aria-current="page"]')
      if (!active) {
        setTabInk(null)
        return
      }
      setTabInk({ left: active.offsetLeft, width: active.offsetWidth })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(nav)
    return () => observer.disconnect()
  }, [screen])

  useEffect(() => {
    window.dispatchEvent(new Event('xuanjige:ready'))
  }, [])

  useEffect(() => {
    if (!tabInk || tabInkOn) return
    const timer = window.setTimeout(() => setTabInkOn(true), 60)
    return () => window.clearTimeout(timer)
  }, [tabInk, tabInkOn])

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
      ?.setAttribute('content', theme === 'day' ? '#FBF8F0' : '#15140F')
  }, [theme])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen])

  function go(next: Screen) {
    if (next !== 'master') setMasterIntent(null)
    setScreen(next)
    setError('')
  }

  function updatePartners(next: Partner[]) {
    savePartners(next)
    setPartners(next)
    setActivePartnerId((id) => (id && next.some((partner) => partner.id === id) ? id : null))
  }

  function requestRelation(id: string) {
    setActivePartnerId(id)
    setPartnerOpen(false)
    setMasterIntent('relation')
    go('master')
  }

  function openPartners() {
    setPartnerEditId(null)
    setPartnerOpen(true)
  }

  function editPartner(id: string) {
    setPartnerEditId(id)
    setPartnerOpen(true)
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

  function chooseCalendar(next: CalendarKind) {
    if (next === draft.calendar) return
    if (next === 'lunar') {
      const lunar = draft.date ? solarToLunar(draft.date) : null
      edit({ calendar: 'lunar', lunar })
    } else {
      edit({ calendar: 'solar' })
    }
  }

  function applyLunar(next: { year: number; month?: number; day?: number }) {
    const months = lunarMonths(next.year)
    const month =
      next.month !== undefined && months.some((m) => m.month === next.month)
        ? next.month
        : (months[0]?.month ?? 1)
    const info = months.find((m) => m.month === month)
    const day = Math.min(next.day ?? 1, info?.days ?? 30)
    const lunar = { year: next.year, month, day }
    edit({ lunar, date: lunarToSolar(lunar) ?? '' })
  }

  function chooseLunarYear(value: string) {
    if (!value) {
      edit({ lunar: null, date: '' })
      return
    }
    applyLunar({ year: Number(value) })
  }

  function chooseLunarMonth(value: string) {
    if (!draft.lunar || !value) return
    applyLunar({ year: draft.lunar.year, month: Number(value) })
  }

  function chooseLunarDay(value: string) {
    if (!draft.lunar || !value) return
    applyLunar({
      year: draft.lunar.year,
      month: draft.lunar.month,
      day: Number(value),
    })
  }

  function validate(): { message: string; focusId: string } | null {
    if (!draft.province) return { message: '请先择出生省份。', focusId: 'province' }
    if (!draft.city) return { message: '请再择出生城市。', focusId: 'city' }
    if (draft.calendar === 'lunar') {
      if (!draft.lunar) return { message: '请择农历生日。', focusId: 'lunar-year' }
      if (!draft.date)
        return { message: '该农历日尚未到，请改一日。', focusId: 'lunar-day' }
    } else if (!draft.date) {
      return { message: '请择公历生日。', focusId: 'dob' }
    }
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
      version: 2,
      province: draft.province,
      city: draft.city,
      lat: coord.lat,
      lon: coord.lon,
      dob: draft.date,
      time: draft.timeUnknown ? null : draft.time,
      timeUnknown: draft.timeUnknown,
      gender: draft.gender as Gender,
      calendar: draft.calendar,
      ...(draft.calendar === 'lunar' && draft.lunar ? { lunar: draft.lunar } : {}),
      savedAt: new Date().toISOString(),
    }
    writeStorage(ENTRY_KEY, next)
    setEntry(next)
    setError('')
    go('cn')
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
      calendar: entry.calendar,
      lunar: entry.lunar ?? null,
      date: entry.dob,
      time: entry.time ?? '',
      timeUnknown: entry.timeUnknown,
      gender: entry.gender,
    })
    go('form')
  }

  const solarEcho = draft.calendar === 'solar' && draft.date ? solarToLunar(draft.date) : null
  const lunarMonthList = draft.lunar ? lunarMonths(draft.lunar.year) : []
  const lunarDayCount = draft.lunar
    ? (lunarMonthList.find((m) => m.month === draft.lunar?.month)?.days ?? 29)
    : 0

  return (
    <div className="site">
      <header className="masthead">
        <div className="brand">
          <span className="brand-ear" aria-hidden="true" />
          <span className="brand-copy">
            <span className="brand-title">天机阁</span>
            <span className="brand-sub">中西合参 · 命盘</span>
          </span>
        </div>
        <div className="mast-tools">
          <p className="credo">不卜生死 · 不问吉凶</p>
          <button
            type="button"
            className="partner-trigger"
            onClick={openPartners}
            aria-haspopup="dialog"
            aria-label={partners.length ? `关系人，已存 ${partners.length} 位` : '关系人'}
            title="关系人"
          >
            <span className="partner-trigger-glyph" aria-hidden="true">
              缘
            </span>
            <span className="partner-trigger-label">关系人</span>
            {partners.length > 0 && (
              <span className="partner-trigger-count">{partners.length}</span>
            )}
          </button>
          <button
            type="button"
            className="theme-toggle"
            aria-label={theme === 'night' ? '切换到日间模式' : '切换到夜间模式'}
            title={theme === 'night' ? '日间模式' : '夜间模式'}
            onClick={() => setTheme(theme === 'night' ? 'day' : 'night')}
          >
            {theme === 'night' ? (
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <circle cx="8" cy="8" r="3.2" fill="currentColor" />
                <path
                  d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.4 1.4M11.55 11.55l1.4 1.4M12.95 3.05l-1.4 1.4M4.45 11.55l-1.4 1.4"
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path
                  d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z"
                  fill="currentColor"
                />
              </svg>
            )}
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="导航" ref={tabsRef} data-ink={tabInkOn ? 'on' : 'off'}>
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
        {tabInk && (
          <span
            className="tab-ink"
            aria-hidden="true"
            style={{ left: tabInk.left, width: tabInk.width }}
          />
        )}
      </nav>

      <main className={`page${screen !== 'master' ? ' page--wide' : ''}`}>
        <section className="screen" key={screen}>
          {screen === 'form' && (
            <div className="form-layout">
              <div className="form-main">
              <Chapter num="壹" kicker="卷 之 一" title="报上生辰" sub="以生辰为凭，以生地定经纬。所报不存姓名。" />
              <form className="ledger ledger--grouped" onSubmit={handleSubmit} noValidate>
                <section className="ledger-group">
                  <h2 className="ledger-group-k">生地</h2>
                  <div className="ledger-group-body">
                    <div className="ledger-row">
                      <div className="row-main">
                        <label className="row-label" htmlFor="province">
                          出生省份
                        </label>
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
                  </div>
                </section>

                <section className="ledger-group">
                  <h2 className="ledger-group-k">生辰</h2>
                  <div className="ledger-group-body">
                    <div className="ledger-row">
                      <div className="row-main">
                        <span className="row-label" id="calendar-label">
                          历法
                        </span>
                        <span className="seg" role="group" aria-labelledby="calendar-label">
                          <button
                            id="calendar-solar"
                            type="button"
                            aria-pressed={draft.calendar === 'solar'}
                            onClick={() => chooseCalendar('solar')}
                          >
                            公历
                          </button>
                          <button
                            id="calendar-lunar"
                            type="button"
                            aria-pressed={draft.calendar === 'lunar'}
                            onClick={() => chooseCalendar('lunar')}
                          >
                            农历
                          </button>
                        </span>
                      </div>
                    </div>

                    {draft.calendar === 'solar' ? (
                      <div className="ledger-row">
                        <div className="row-main">
                          <label className="row-label" htmlFor="dob">
                            公历生日
                          </label>
                          <span className="control control--date">
                            <span className="field">
                              <span className={`field-value${draft.date ? '' : ' is-empty'}`} aria-hidden="true">
                                {draft.date ? plainDate(draft.date) : '未择'}
                              </span>
                              <input
                                id="dob"
                                type="date"
                                min="1900-01-01"
                                max={TODAY}
                                value={draft.date}
                                className="field-native"
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
                          </span>
                        </div>
                        {draft.date && solarEcho && (
                          <p className="date-echo">农历 {lunarLabel(solarEcho)}</p>
                        )}
                      </div>
                    ) : (
                      <div className="ledger-row ledger-row--lunar">
                        <div className="row-main">
                          <span className="row-label">农历生日</span>
                          <span className="control control--lunar">
                            <span className="lunar-selects">
                              <select
                                id="lunar-year"
                                aria-label="农历年"
                                value={draft.lunar?.year ?? ''}
                                className={draft.lunar ? '' : 'is-empty'}
                                onChange={(e) => chooseLunarYear(e.target.value)}
                              >
                                <option value="">未择年</option>
                                {LUNAR_YEARS.map((year) => (
                                  <option key={year} value={year}>
                                    {year}
                                  </option>
                                ))}
                              </select>
                              <select
                                id="lunar-month"
                                aria-label="农历月"
                                disabled={!draft.lunar}
                                value={draft.lunar?.month ?? ''}
                                className={draft.lunar ? '' : 'is-empty'}
                                onChange={(e) => chooseLunarMonth(e.target.value)}
                              >
                                <option value="">未择月</option>
                                {lunarMonthList.map((month) => (
                                  <option key={month.month} value={month.month}>
                                    {month.label}月
                                  </option>
                                ))}
                              </select>
                              <select
                                id="lunar-day"
                                aria-label="农历日"
                                disabled={!draft.lunar}
                                value={draft.lunar?.day ?? ''}
                                className={draft.lunar ? '' : 'is-empty'}
                                onChange={(e) => chooseLunarDay(e.target.value)}
                              >
                                <option value="">未择日</option>
                                {draft.lunar &&
                                  Array.from({ length: lunarDayCount }, (_, index) => index + 1).map(
                                    (day) => (
                                      <option key={day} value={day}>
                                        {lunarDayLabel(draft.lunar!.year, draft.lunar!.month, day)}
                                      </option>
                                    ),
                                  )}
                              </select>
                            </span>
                          </span>
                        </div>
                        {draft.date ? (
                          <p className="date-echo">公历 {plainDate(draft.date)}</p>
                        ) : (
                          <p className="date-echo is-empty">择农历年月日，自动换算公历</p>
                        )}
                      </div>
                    )}

                    <div className="ledger-row">
                      <div className="row-main">
                        <label className="row-label" htmlFor="birth-time">
                          出生时刻
                        </label>
                        <span className="control control--time">
                          <span className="field">
                            <span
                              className={`field-value${draft.time && !draft.timeUnknown ? '' : ' is-empty'}`}
                              aria-hidden="true"
                            >
                              {draft.timeUnknown
                                ? '不填'
                                : draft.time
                                  ? `${draft.time}（${shichen(draft.time)}）`
                                  : '未填'}
                            </span>
                            <input
                              id="birth-time"
                              type="time"
                              step="60"
                              value={draft.time}
                              disabled={draft.timeUnknown}
                              className="field-native"
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
                          </span>
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
                        <p className="time-note">时辰不详 · 时柱与上升按正午暂排，仅供参考。</p>
                      )}
                    </div>
                  </div>
                </section>

                <section className="ledger-group">
                  <h2 className="ledger-group-k">性别</h2>
                  <div className="ledger-group-body">
                    <div className="ledger-row">
                      <div className="row-main">
                        <span className="row-label" id="gender-label">
                          本人
                        </span>
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
                            id="gender-female"
                            type="button"
                            aria-pressed={draft.gender === 'female'}
                            onClick={() => edit({ gender: 'female' })}
                          >
                            女
                          </button>
                        </span>
                      </div>
                    </div>
                  </div>
                </section>

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
              </div>
              <aside className="form-aside" aria-hidden="true">
                <CompassArt />
                <p className="form-aside-line">
                  左执四柱
                  <br />
                  右观星盘
                </p>
                <p className="form-aside-note">四柱看骨 · 星盘看气</p>
              </aside>
            </div>
          )}

          {screen === 'cn' && (
            <CnChartPage
              entry={entry}
              onForm={() => go('form')}
              onEdit={editRecord}
              onSwitch={() => go('ve')}
            />
          )}
          {screen === 've' && (
            <VeChartPage
              entry={entry}
              onForm={() => go('form')}
              onEdit={editRecord}
              onSwitch={() => go('cn')}
            />
          )}
          {screen === 'master' && (
            <MasterScreen
              entry={entry}
              onForm={() => go('form')}
              onEdit={editRecord}
              intent={masterIntent}
              onIntentDone={() => setMasterIntent(null)}
              partners={partners}
              activePartnerId={activePartnerId}
              onActivePartner={(id) => setActivePartnerId(id || null)}
              onOpenPartners={openPartners}
              onEditPartner={editPartner}
            />
          )}
        </section>
      </main>

      <PartnerDialog
        open={partnerOpen}
        editId={partnerEditId}
        partners={partners}
        activeId={activePartnerId}
        onClose={() => {
          setPartnerOpen(false)
          setPartnerEditId(null)
        }}
        onSave={updatePartners}
        onActive={(id) => setActivePartnerId(id || null)}
        onMerge={requestRelation}
      />

      <footer className="compliance">
        <p>
          <span>本工具为传统文化娱乐内容，解读由大模型生成，</span>
          <span>仅供参考，不构成任何决策依据</span>
        </p>
      </footer>
    </div>
  )
}

export default App
