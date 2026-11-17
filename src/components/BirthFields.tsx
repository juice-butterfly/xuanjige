import { useState } from 'react'
import { plainDate, shichen } from '../lib/format'
import {
  lunarDayLabel,
  lunarLabel,
  lunarMonths,
  lunarToSolar,
  solarToLunar,
  todayISO,
  type CalendarKind,
  type LunarDate,
} from '../lib/calendar'
import type { Gender } from '../lib/partners'

export type BirthValue = {
  calendar: CalendarKind
  lunar: LunarDate | null
  date: string
  time: string
  timeUnknown: boolean
  gender: Gender | ''
}

export const EMPTY_BIRTH: BirthValue = {
  calendar: 'solar',
  lunar: null,
  date: '',
  time: '',
  timeUnknown: false,
  gender: '',
}

const THIS_YEAR = Number(todayISO().slice(0, 4))
const LUNAR_YEARS = Array.from({ length: THIS_YEAR - 1900 + 1 }, (_, i) => THIS_YEAR - i)

export function validateBirth(
  value: BirthValue,
  idPrefix: string,
  today = todayISO(),
): { message: string; focusId: string } | null {
  if (value.calendar === 'lunar') {
    if (!value.lunar)
      return { message: '请择农历生日。', focusId: `${idPrefix}-lunar-year` }
    if (!value.date)
      return { message: '该农历日尚未到，请改一日。', focusId: `${idPrefix}-lunar-day` }
  } else if (!value.date) {
    return { message: '请择公历生日。', focusId: `${idPrefix}-dob` }
  }
  if (value.date < '1900-01-01' || value.date > today)
    return { message: '生日须在一九〇〇年至今之间。', focusId: `${idPrefix}-dob` }
  if (!value.timeUnknown && !value.time)
    return { message: '请择出生时刻，或勾选「时辰不详」。', focusId: `${idPrefix}-time` }
  if (!value.gender) return { message: '请择男或女。', focusId: `${idPrefix}-gender-male` }
  return null
}

export function BirthFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string
  value: BirthValue
  onChange: (patch: Partial<BirthValue>) => void
}) {
  const [note, setNote] = useState('')
  const today = todayISO()
  const solarEcho = value.calendar === 'solar' && value.date ? solarToLunar(value.date) : null
  const lunarMonthList = value.lunar ? lunarMonths(value.lunar.year) : []
  const lunarDayCount = value.lunar
    ? (lunarMonthList.find((m) => m.month === value.lunar?.month)?.days ?? 29)
    : 0

  function chooseCalendar(next: CalendarKind) {
    if (next === value.calendar) return
    setNote('')
    if (next === 'lunar') {
      const lunar = value.date ? solarToLunar(value.date) : null
      onChange({ calendar: 'lunar', lunar })
    } else {
      onChange({ calendar: 'solar' })
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
    const solar = lunarToSolar(lunar)
    setNote(solar ? '' : '该农历日尚未到，请改一日。')
    onChange({ lunar, date: solar ?? '' })
  }

  return (
    <>
      <div className="ledger-row">
        <div className="row-main">
          <span className="row-label" id={`${idPrefix}-calendar-label`}>
            历法
          </span>
          <span className="leader" aria-hidden="true" />
          <span
            className="seg"
            role="group"
            aria-labelledby={`${idPrefix}-calendar-label`}
          >
            <button
              id={`${idPrefix}-calendar-solar`}
              type="button"
              aria-pressed={value.calendar === 'solar'}
              onClick={() => chooseCalendar('solar')}
            >
              公历
            </button>
            <button
              id={`${idPrefix}-calendar-lunar`}
              type="button"
              aria-pressed={value.calendar === 'lunar'}
              onClick={() => chooseCalendar('lunar')}
            >
              农历
            </button>
          </span>
        </div>
      </div>

      {value.calendar === 'solar' ? (
        <div className="ledger-row">
          <div className="row-main">
            <label className="row-label" htmlFor={`${idPrefix}-dob`}>
              公历生日
            </label>
            <span className="leader" aria-hidden="true" />
            <span className="control control--date">
              <span className="field">
                <span className={`field-value${value.date ? '' : ' is-empty'}`} aria-hidden="true">
                  {value.date ? plainDate(value.date) : '未择'}
                </span>
                <input
                  id={`${idPrefix}-dob`}
                  type="date"
                  min="1900-01-01"
                  max={today}
                  value={value.date}
                  className="field-native"
                  onChange={(e) => onChange({ date: e.target.value })}
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
          {value.date && solarEcho && (
            <p className="date-echo">农历 {lunarLabel(solarEcho)}</p>
          )}
        </div>
      ) : (
        <div className="ledger-row ledger-row--lunar">
          <div className="row-main">
            <span className="row-label">农历生日</span>
            <span className="leader" aria-hidden="true" />
            <span className="control control--lunar">
              <span className="lunar-selects">
                <select
                  id={`${idPrefix}-lunar-year`}
                  aria-label="农历年"
                  value={value.lunar?.year ?? ''}
                  className={value.lunar ? '' : 'is-empty'}
                  onChange={(e) => {
                    if (!e.target.value) {
                      setNote('')
                      onChange({ lunar: null, date: '' })
                      return
                    }
                    applyLunar({ year: Number(e.target.value) })
                  }}
                >
                  <option value="">未择年</option>
                  {LUNAR_YEARS.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
                <select
                  id={`${idPrefix}-lunar-month`}
                  aria-label="农历月"
                  disabled={!value.lunar}
                  value={value.lunar?.month ?? ''}
                  className={value.lunar ? '' : 'is-empty'}
                  onChange={(e) => {
                    if (!value.lunar || !e.target.value) return
                    applyLunar({ year: value.lunar.year, month: Number(e.target.value) })
                  }}
                >
                  <option value="">未择月</option>
                  {lunarMonthList.map((month) => (
                    <option key={month.month} value={month.month}>
                      {month.label}月
                    </option>
                  ))}
                </select>
                <select
                  id={`${idPrefix}-lunar-day`}
                  aria-label="农历日"
                  disabled={!value.lunar}
                  value={value.lunar?.day ?? ''}
                  className={value.lunar ? '' : 'is-empty'}
                  onChange={(e) => {
                    if (!value.lunar || !e.target.value) return
                    applyLunar({
                      year: value.lunar.year,
                      month: value.lunar.month,
                      day: Number(e.target.value),
                    })
                  }}
                >
                  <option value="">未择日</option>
                  {value.lunar &&
                    Array.from({ length: lunarDayCount }, (_, index) => index + 1).map((day) => (
                      <option key={day} value={day}>
                        {lunarDayLabel(value.lunar!.year, value.lunar!.month, day)}
                      </option>
                    ))}
                </select>
              </span>
            </span>
          </div>
          <p className={`date-echo${value.date ? '' : ' is-empty'}`}>
            {value.date ? `公历 ${plainDate(value.date)}` : (note || '择农历年月日，自动换算公历')}
          </p>
        </div>
      )}

      <div className="ledger-row">
        <div className="row-main">
          <label className="row-label" htmlFor={`${idPrefix}-time`}>
            出生时刻
          </label>
          <span className="leader" aria-hidden="true" />
          <span className="control control--time">
            <span className="field">
              <span
                className={`field-value${value.time && !value.timeUnknown ? '' : ' is-empty'}`}
                aria-hidden="true"
              >
                {value.timeUnknown
                  ? '不填'
                  : value.time
                    ? `${value.time}（${shichen(value.time)}）`
                    : '未填'}
              </span>
              <input
                id={`${idPrefix}-time`}
                type="time"
                step="60"
                value={value.time}
                disabled={value.timeUnknown}
                className="field-native"
                onChange={(e) => onChange({ time: e.target.value })}
                onClick={(e) => {
                  if (value.timeUnknown) return
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
                checked={value.timeUnknown}
                onChange={(e) => onChange({ timeUnknown: e.target.checked })}
              />
              <span className="box" aria-hidden="true" />
              <span className="unknown-label">时辰不详</span>
            </label>
          </span>
        </div>
        {value.timeUnknown && (
          <p className="time-note">时辰不详 · 盘面按正午暂排，准确性有限。</p>
        )}
      </div>

      <div className="ledger-row">
        <div className="row-main">
          <span className="row-label" id={`${idPrefix}-gender-label`}>
            性别
          </span>
          <span className="leader" aria-hidden="true" />
          <span
            className="seg"
            role="group"
            aria-labelledby={`${idPrefix}-gender-label`}
          >
            <button
              id={`${idPrefix}-gender-male`}
              type="button"
              aria-pressed={value.gender === 'male'}
              onClick={() => onChange({ gender: 'male' })}
            >
              男
            </button>
            <button
              id={`${idPrefix}-gender-female`}
              type="button"
              aria-pressed={value.gender === 'female'}
              onClick={() => onChange({ gender: 'female' })}
            >
              女
            </button>
          </span>
        </div>
      </div>
    </>
  )
}
