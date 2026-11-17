import { useEffect, useRef, useState } from 'react'
import { cnDate } from '../lib/format'
import {
  ALIAS_MAX,
  RELATIONS,
  relationLabel,
  type Partner,
  type Relation,
} from '../lib/partners'
import { BirthFields, EMPTY_BIRTH, validateBirth, type BirthValue } from './BirthFields'
import { PlaceFields, type PlaceValue } from './PlaceFields'

type FormState = {
  alias: string
  relation: Relation | null
  place: PlaceValue
  birth: BirthValue
}

const EMPTY_FORM: FormState = {
  alias: '',
  relation: null,
  place: { province: '', city: '', lat: null, lon: null },
  birth: EMPTY_BIRTH,
}

export function PartnerDialog({
  open,
  editId,
  partners,
  activeId,
  onClose,
  onSave,
  onActive,
  onMerge,
}: {
  open: boolean
  editId?: string | null
  partners: Partner[]
  activeId: string | null
  onClose: () => void
  onSave: (list: Partner[]) => void
  onActive: (id: string) => void
  onMerge: (id: string) => void
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const [mode, setMode] = useState<'list' | 'form'>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    const node = dialogRef.current
    if (!node) return
    if (open) {
      if (!node.open) {
        setError('')
        setConfirmId(null)
        const target = editId ? partners.find((partner) => partner.id === editId) : null
        if (target) {
          startEdit(target)
        } else {
          setMode('list')
          setEditingId(null)
        }
        node.showModal()
      }
    } else if (node.open) {
      node.close()
    }
  }, [open, editId])

  useEffect(() => {
    if (!confirmId) return
    const timer = window.setTimeout(() => setConfirmId(null), 3000)
    return () => window.clearTimeout(timer)
  }, [confirmId])

  function editForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }))
    setError('')
  }

  function fail(message: string, focusId: string) {
    setError(message)
    requestAnimationFrame(() => document.getElementById(focusId)?.focus())
  }

  function startAdd() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setMode('form')
    setError('')
  }

  function startEdit(partner: Partner) {
    setForm({
      alias: partner.alias,
      relation: partner.relation,
      place: {
        province: partner.province,
        city: partner.city,
        lat: partner.lat,
        lon: partner.lon,
      },
      birth: {
        calendar: partner.calendar,
        lunar: partner.lunar ?? null,
        date: partner.dob,
        time: partner.time ?? '',
        timeUnknown: partner.time === null,
        gender: partner.gender,
      },
    })
    setEditingId(partner.id)
    setMode('form')
    setError('')
  }

  function buildPartner(): Partner | null {
    const alias = form.alias.trim()
    if (!alias) {
      fail('请先给对方起个称呼，不问真名。', 'partner-alias')
      return null
    }
    if (!form.relation) {
      fail('请择两人的关系。', 'partner-relation-friend')
      return null
    }
    if (!form.place.province) {
      fail('请先择出生省份。', 'partner-province')
      return null
    }
    if (!form.place.city) {
      fail('请再择出生城市。', 'partner-city')
      return null
    }
    const birthProblem = validateBirth(form.birth, 'partner')
    if (birthProblem) {
      fail(birthProblem.message, birthProblem.focusId)
      return null
    }
    return {
      id: editingId ?? crypto.randomUUID(),
      alias: alias.slice(0, ALIAS_MAX),
      relation: form.relation,
      province: form.place.province,
      city: form.place.city,
      lat: form.place.lat ?? 0,
      lon: form.place.lon ?? 0,
      dob: form.birth.date,
      time: form.birth.timeUnknown ? null : form.birth.time,
      gender: form.birth.gender as 'male' | 'female',
      calendar: form.birth.calendar,
      ...(form.birth.calendar === 'lunar' && form.birth.lunar
        ? { lunar: form.birth.lunar }
        : {}),
    }
  }

  function commit(merge: boolean) {
    const partner = buildPartner()
    if (!partner) return
    const next = editingId
      ? partners.map((item) => (item.id === partner.id ? partner : item))
      : [...partners, partner]
    onSave(next)
    onActive(partner.id)
    setMode('list')
    setEditingId(null)
    setError('')
    if (merge) onMerge(partner.id)
  }

  function removePartner(id: string) {
    if (confirmId !== id) {
      setConfirmId(id)
      return
    }
    const next = partners.filter((item) => item.id !== id)
    onSave(next)
    setConfirmId(null)
    if (activeId === id) onActive('')
  }

  return (
    <dialog
      ref={dialogRef}
      className="partner-dialog"
      aria-labelledby="partner-dialog-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current?.close()
      }}
    >
      <div className="partner-dialog-in">
        <header className="partner-dialog-head">
          <div>
            <h2 className="partner-dialog-title" id="partner-dialog-title">
              {mode === 'list' ? '关系人' : editingId ? '改一位关系人' : '添一位关系人'}
            </h2>
            <p className="partner-dialog-note">只存称呼 · 不存真名 · 只存本机</p>
          </div>
          <button
            type="button"
            className="partner-dialog-close"
            aria-label="关闭"
            onClick={() => dialogRef.current?.close()}
          >
            ×
          </button>
        </header>

        {mode === 'list' ? (
          <>
            <div className="partner-dialog-actions">
              <p className="partner-dialog-count">
                {partners.length ? `已存 ${partners.length} 位` : '还没有人。'}
              </p>
              {partners.length > 0 && (
                <button type="button" className="link" onClick={startAdd}>
                  添一位
                </button>
              )}
            </div>

            {partners.length ? (
              <ul className="partner-dialog-list">
                {partners.map((partner) => (
                  <li className="partner-dialog-item" key={partner.id}>
                    <button
                      type="button"
                      className={`partner-dialog-card${
                        partner.id === activeId ? ' partner-dialog-card--on' : ''
                      }`}
                      aria-pressed={partner.id === activeId}
                      onClick={() => onActive(partner.id)}
                    >
                      <span className="partner-dialog-main">
                        <span className="partner-dialog-alias">{partner.alias}</span>
                        <span className="partner-dialog-tag">
                          {relationLabel(partner.relation)}
                        </span>
                      </span>
                      <span className="partner-dialog-meta">
                        {cnDate(partner.dob)} · {partner.city}
                      </span>
                    </button>
                    <div className="partner-dialog-item-tools">
                      <button type="button" className="link" onClick={() => startEdit(partner)}>
                        改
                      </button>
                      <button
                        type="button"
                        className={`link partner-dialog-remove${
                          confirmId === partner.id ? ' is-confirming' : ''
                        }`}
                        onClick={() => removePartner(partner.id)}
                      >
                        {confirmId === partner.id ? '确定删？' : '删'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="partner-dialog-empty">添一位，才谈得上合参。</p>
            )}

            <footer className="partner-dialog-foot">
              <button type="button" className="submit" onClick={startAdd}>
                添一位
              </button>
              <p className="partner-dialog-hint">
                选中一位后，可在玄机先生里「与 TA 合参」。
              </p>
            </footer>
          </>
        ) : (
          <form
            className="partner-dialog-form"
            onSubmit={(e) => {
              e.preventDefault()
              commit(false)
            }}
            noValidate
          >
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
              <div className="row-main row-main--stack">
                <span className="row-label" id="partner-relation-label">
                  关系
                </span>
                <div
                  className="relation-picker"
                  role="group"
                  aria-labelledby="partner-relation-label"
                >
                  {RELATIONS.map((item) => (
                    <button
                      key={item.id}
                      id={`partner-relation-${item.id}`}
                      type="button"
                      aria-pressed={form.relation === item.id}
                      onClick={() => editForm({ relation: item.id })}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <PlaceFields
              idPrefix="partner"
              value={form.place}
              onChange={(patch) => editForm({ place: { ...form.place, ...patch } })}
            />

            <BirthFields
              idPrefix="partner"
              value={form.birth}
              onChange={(patch) => editForm({ birth: { ...form.birth, ...patch } })}
            />

            <div className="submit-wrap">
              <p className="form-error" role="alert">
                {error}
              </p>
              <div className="partner-dialog-submit">
                <button type="submit" className="submit submit--quiet">
                  只存下
                </button>
                <button
                  type="button"
                  className="submit"
                  onClick={() => commit(true)}
                >
                  存下并合参
                </button>
              </div>
            </div>
            <button
              type="button"
              className="link partner-dialog-back"
              onClick={() => {
                setMode('list')
                setEditingId(null)
                setError('')
              }}
            >
              ← 回到名单
            </button>
          </form>
        )}
      </div>
    </dialog>
  )
}
