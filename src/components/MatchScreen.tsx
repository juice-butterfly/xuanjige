import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Chapter } from './Chapter'
import { Term, TermSheet, useTermSheet } from './Term'
import { cnDate, cnTime, coordsLabel, localISODate } from '../lib/format'
import {
  ALIAS_MAX,
  NO_TIME_NOTE,
  UNKNOWN,
  baziOf,
  loadPartners,
  luminaryRows,
  normalizePartner,
  pairingAdvice,
  pillarRows,
  relationNotes,
  savePartners,
  spouseStarLine,
  type MatchRow,
  type Partner,
} from '../lib/match'
import type { LuminarySide } from '../engine/vedic'
import citiesRaw from '../data/cities.json'

type Coord = { lat: number; lon: number }
type Gender = 'male' | 'female'

type SelfPerson = {
  dob: string
  time: string | null
  gender: Gender
  province: string
  city: string
  lat: number
  lon: number
}

const CITIES = (citiesRaw as unknown as { data: Record<string, Record<string, Coord>> }).data
const PROVINCES = Object.keys(CITIES)

const TODAY = localISODate()

type PartnerDraft = {
  alias: string
  province: string
  city: string
  date: string
  time: string
  timeUnknown: boolean
  gender: Gender | ''
}

const EMPTY_DRAFT: PartnerDraft = {
  alias: '',
  province: '',
  city: '',
  date: '',
  time: '',
  timeUnknown: false,
  gender: '',
}

type LumPair = { a: LuminarySide; b: LuminarySide }
type LumState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: LumPair }
  | { status: 'error' }

const GENDER_CN: Record<Gender, string> = { male: '男', female: '女' }

export function MatchScreen({
  entry,
  onForm,
  onEdit,
}: {
  entry: SelfPerson | null
  onForm: () => void
  onEdit: () => void
}) {
  const [partners, setPartners] = useState<Partner[]>(loadPartners)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<PartnerDraft>(EMPTY_DRAFT)
  const [formError, setFormError] = useState('')
  const [lum, setLum] = useState<LumState>({ status: 'idle' })
  const [lumNonce, setLumNonce] = useState(0)
  const { activeTerm, handleTermClick, close } = useTermSheet()

  const selected = partners.find((p) => p.id === selectedId) ?? partners[0] ?? null

  const myBazi = useMemo(() => (entry ? baziOf(entry) : null), [entry])
  const otherBazi = useMemo(() => (selected ? baziOf(selected) : null), [selected])

  useEffect(() => {
    if (!entry || !selected) {
      setLum({ status: 'idle' })
      return
    }
    let alive = true
    setLum({ status: 'loading' })
    import('../engine/vedic')
      .then((m) =>
        Promise.all([
          m.calcLuminaries({ dob: entry.dob, time: entry.time, lat: entry.lat, lon: entry.lon }),
          m.calcLuminaries({
            dob: selected.dob,
            time: selected.time,
            lat: selected.lat,
            lon: selected.lon,
          }),
        ]),
      )
      .then(([a, b]) => {
        if (alive) setLum({ status: 'ready', data: { a, b } })
      })
      .catch(() => {
        if (alive) setLum({ status: 'error' })
      })
    return () => {
      alive = false
    }
  }, [entry, selected, lumNonce])

  function editForm(patch: Partial<PartnerDraft>) {
    setForm((prev) => ({ ...prev, ...patch }))
    setFormError('')
  }

  function chooseProvince(province: string) {
    editForm({ province, city: '' })
  }

  function fail(message: string, focusId: string) {
    setFormError(message)
    requestAnimationFrame(() => document.getElementById(focusId)?.focus())
  }

  function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const alias = form.alias.trim()
    if (!alias) return fail('请先给对方起个称呼，不问真名。', 'partner-alias')
    if (!form.province) return fail('请先择出生省份。', 'partner-province')
    if (!form.city) return fail('请再择出生城市。', 'partner-city')
    if (!form.date) return fail('请择公历生日。', 'partner-dob')
    if (form.date < '1900-01-01' || form.date > TODAY)
      return fail('生日须在一九〇〇年至今之间。', 'partner-dob')
    if (!form.timeUnknown && !form.time)
      return fail('请择出生时刻，或勾选「时辰不详」。', 'partner-time')
    if (!form.gender) return fail('请择男或女。', 'partner-gender-male')

    const coord = CITIES[form.province][form.city]
    const partner: Partner = {
      id: crypto.randomUUID(),
      alias: alias.slice(0, ALIAS_MAX),
      province: form.province,
      city: form.city,
      lat: coord.lat,
      lon: coord.lon,
      dob: form.date,
      time: form.timeUnknown ? null : form.time,
      gender: form.gender as Gender,
    }
    const next = [...partners, partner]
    setPartners(next)
    savePartners(next)
    setSelectedId(partner.id)
    setForm(EMPTY_DRAFT)
    setFormError('')
  }

  function removePartner(id: string) {
    const next = partners.filter((p) => p.id !== id)
    setPartners(next)
    savePartners(next)
    if (selectedId === id) setSelectedId(null)
  }

  const normalized = partners.map(normalizePartner)

  return (
    <>
      <Chapter num="肆" kicker="卷 之 四" title="关系人" sub="对方生辰只存本机，称呼不问真名。" />

      {!entry && (
        <div className="chart-blocked">
          <p className="chart-blocked-k">尚未报上生辰</p>
          <p className="chart-blocked-text">先录自己的生辰，再添对方，两盘才有得对照。</p>
          <button className="link" type="button" onClick={onForm}>
            去报生辰
          </button>
        </div>
      )}

      {entry && (
        <>
          {partners.length > 0 && (
            <div className="partner-bar" aria-label="关系人列表">
              {partners.map((p) => (
                <span
                  key={p.id}
                  className={`partner-chip${p.id === (selected && selected.id) ? ' partner-chip--on' : ''}`}
                >
                  <button type="button" onClick={() => setSelectedId(p.id)}>
                    {p.alias}
                  </button>
                  <button
                    type="button"
                    className="partner-del"
                    aria-label={`删除 ${p.alias}`}
                    title={`删除 ${p.alias}`}
                    onClick={() => removePartner(p.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {selected && myBazi && otherBazi ? (
            <MatchBoard
              self={entry}
              partner={selected}
              myBazi={myBazi}
              otherBazi={otherBazi}
              lum={lum}
              onRetry={() => setLumNonce((n) => n + 1)}
              onEdit={onEdit}
              onTermClick={handleTermClick}
            />
          ) : (
            entry.time === null && (
              <div className="chart-blocked">
                <p className="chart-blocked-k">本人时辰不详</p>
                <p className="chart-blocked-text">时柱与上升留白不猜，也可先添对方照样对照。</p>
                <button className="link" type="button" onClick={onEdit}>
                  补录时辰
                </button>
              </div>
            )
          )}

          <form className="ledger partner-form" onSubmit={handleSave} noValidate>
            <header className="partner-form-head">
              <span className="panel-index">添一位</span>
              <span className="partner-form-note">只存称呼 · 不存真名 · 只存本机</span>
            </header>

            <div className="ledger-row">
              <div className="row-main">
                <label className="row-label" htmlFor="partner-alias">
                  称呼
                </label>
                <span className="leader" aria-hidden="true" />
                <span className="control">
                  <input
                    id="partner-alias"
                    type="text"
                    maxLength={ALIAS_MAX}
                    placeholder="怎么称呼TA"
                    value={form.alias}
                    className={form.alias ? '' : 'is-empty'}
                    onChange={(e) => editForm({ alias: e.target.value })}
                  />
                </span>
              </div>
            </div>

            <div className="ledger-row">
              <div className="row-main">
                <label className="row-label" htmlFor="partner-province">
                  出生省份
                </label>
                <span className="leader" aria-hidden="true" />
                <span className="control control--select">
                  <select
                    id="partner-province"
                    value={form.province}
                    className={form.province ? '' : 'is-empty'}
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
                <label className="row-label" htmlFor="partner-city">
                  出生城市
                </label>
                <span className="leader" aria-hidden="true" />
                <span className="control control--select">
                  <select
                    id="partner-city"
                    value={form.city}
                    disabled={!form.province}
                    className={form.city ? '' : 'is-empty'}
                    onChange={(e) => editForm({ city: e.target.value })}
                  >
                    <option value="">{form.province ? '未择' : '先择省份'}</option>
                    {form.province &&
                      Object.keys(CITIES[form.province]).map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                  </select>
                </span>
              </div>
            </div>

            <div className="ledger-row">
              <div className="row-main">
                <label className="row-label" htmlFor="partner-dob">
                  公历生日
                </label>
                <span className="leader" aria-hidden="true" />
                <span className="control">
                  <input
                    id="partner-dob"
                    type="date"
                    min="1900-01-01"
                    max={TODAY}
                    value={form.date}
                    className={form.date ? '' : 'is-empty'}
                    onChange={(e) => editForm({ date: e.target.value })}
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
                <label className="row-label" htmlFor="partner-time">
                  出生时刻
                </label>
                <span className="leader" aria-hidden="true" />
                <span className="control">
                  <input
                    id="partner-time"
                    type="time"
                    step="60"
                    value={form.time}
                    disabled={form.timeUnknown}
                    className={form.time ? '' : 'is-empty'}
                    onChange={(e) => editForm({ time: e.target.value })}
                    onClick={(e) => {
                      if (form.timeUnknown) return
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
                      checked={form.timeUnknown}
                      onChange={(e) => editForm({ timeUnknown: e.target.checked })}
                    />
                    <span className="box" aria-hidden="true" />
                    <span className="unknown-label">时辰不详</span>
                  </label>
                </span>
              </div>
              {form.timeUnknown && (
                <p className="time-note">时辰不详 · 时柱与上升留白，不猜。</p>
              )}
            </div>

            <div className="ledger-row">
              <div className="row-main">
                <span className="row-label" id="partner-gender-label">
                  性别
                </span>
                <span className="leader" aria-hidden="true" />
                <span className="seg" role="group" aria-labelledby="partner-gender-label">
                  <button
                    id="partner-gender-male"
                    type="button"
                    aria-pressed={form.gender === 'male'}
                    onClick={() => editForm({ gender: 'male' })}
                  >
                    男
                  </button>
                  <button
                    type="button"
                    aria-pressed={form.gender === 'female'}
                    onClick={() => editForm({ gender: 'female' })}
                  >
                    女
                  </button>
                </span>
              </div>
            </div>

            <div className="submit-wrap">
              <p className="form-error" role="alert">
                {formError}
              </p>
              <button className="submit" type="submit">
                存下
              </button>
            </div>
          </form>
        </>
      )}

      {normalized.length !== partners.length && (
        <p className="screen-note">存档里有不合规矩的记录，已跳过；重新存一次即可。</p>
      )}

      <TermSheet term={activeTerm} onClose={close} />
    </>
  )
}

function MatchRowView({ row }: { row: MatchRow }) {
  return (
    <div className="match-row">
      <div className={`match-cell${row.left === UNKNOWN ? ' match-cell--unknown' : ''}`}>
        <Term name={row.label} className="match-cell-k">
          {row.label}
        </Term>
        <span className="match-cell-v">{row.left}</span>
        {row.leftSub && <span className="match-cell-sub">{row.leftSub}</span>}
      </div>
      <div className={`match-link${row.rel ? ` match-link--${row.rel}` : ''}`}>
        {row.tag && <span className="match-link-tag">{row.tag}</span>}
        {row.note && <span className="match-link-note">{row.note}</span>}
      </div>
      <div
        className={`match-cell match-cell--r${row.right === UNKNOWN ? ' match-cell--unknown' : ''}`}
      >
        <span className="match-cell-v">{row.right}</span>
        {row.rightSub && <span className="match-cell-sub">{row.rightSub}</span>}
      </div>
    </div>
  )
}

function MatchBoard({
  self,
  partner,
  myBazi,
  otherBazi,
  lum,
  onRetry,
  onEdit,
  onTermClick,
}: {
  self: SelfPerson
  partner: Partner
  myBazi: NonNullable<ReturnType<typeof baziOf>>
  otherBazi: NonNullable<ReturnType<typeof baziOf>>
  lum: LumState
  onRetry: () => void
  onEdit: () => void
  onTermClick: ReturnType<typeof useTermSheet>['handleTermClick']
}) {
  const rows = pillarRows(myBazi, otherBazi)
  const notes = relationNotes(myBazi, otherBazi)
  const advices = pairingAdvice(myBazi, otherBazi, self.gender, partner.gender)
  const spouseSelf = spouseStarLine(myBazi, self.gender)
  const spouseOther = spouseStarLine(otherBazi, partner.gender)
  const veRows = lum.status === 'ready' ? luminaryRows(lum.data.a, lum.data.b) : null

  return (
    <section className="match-board" aria-label="双盘对照" onClick={onTermClick}>
      <header className="match-head">
        <span className="match-head-side">
          本人 · {GENDER_CN[self.gender]}
        </span>
        <span className="match-head-mid">对照</span>
        <span className="match-head-side match-head-side--r">
          {partner.alias} · {GENDER_CN[partner.gender]}
        </span>
      </header>

      <div className="match-record">
        <span>
          {cnDate(self.dob)} {cnTime(self.time)} · {self.city}
        </span>
        <span className="match-record-coord">{coordsLabel(self.lat, self.lon)}</span>
        <span className="match-record-r">
          {cnDate(partner.dob)} {cnTime(partner.time)} · {partner.city}
        </span>
      </div>

      {partner.time === null && (
        <p className="match-warning" role="note">
          {NO_TIME_NOTE}
        </p>
      )}
      {self.time === null && (
        <p className="match-warning match-warning--self">
          本人时辰缺失，时柱与上升星座判断受限。{' '}
          <button className="link" type="button" onClick={onEdit}>
            补录时辰
          </button>
        </p>
      )}

      <div className="match-sec-head">
        <span>中式 · 合婚</span>
        <span className="match-sec-note">六合实线 · 六冲朱砂虚线</span>
      </div>

      <div className="match-rows">
        {rows.map((row) => (
          <MatchRowView key={row.label} row={row} />
        ))}
      </div>

      <div className="match-notes">
        {notes.map((note) => (
          <p key={note.slice(0, 12)}>{note}</p>
        ))}
      </div>

      <div className="match-spouse">
        <p>
          <span className="match-k">
            <Term name="配偶星" className="term--label">
              本人配偶星
            </Term>
          </span>
          {spouseSelf}
        </p>
        <p>
          <span className="match-k">
            <Term name="配偶星" className="term--label">
              {partner.alias}配偶星
            </Term>
          </span>
          {spouseOther}
        </p>
      </div>

      <div className="match-advices">
        <p className="match-k">相处三则</p>
        <ol>
          {advices.map((advice) => (
            <li key={advice.slice(0, 12)}>{advice}</li>
          ))}
        </ol>
      </div>

      <div className="match-sec-head">
        <span>西式 · 日月互看</span>
        <span className="match-sec-note">只看太阳月亮，不做完整合盘</span>
      </div>

      {veRows ? (
        <div className="match-rows">
          {veRows.map((row) => (
            <MatchRowView key={row.label} row={row} />
          ))}
          <p className="match-ve-note">
            {self.time === null || partner.time === null
              ? '日月按正午估算，边界生日或有出入。'
              : ''}
          </p>
        </div>
      ) : lum.status === 'loading' ? (
        <p className="match-quiet">印占盘未成，先生稍候。</p>
      ) : lum.status === 'error' ? (
        <p className="match-quiet">
          印占盘未起。{' '}
          <button className="link" type="button" onClick={onRetry}>
            重新排盘
          </button>
        </p>
      ) : null}

      <p className="match-foot">本对照为传统文化娱乐内容，不构成任何决策依据。</p>
    </section>
  )
}
