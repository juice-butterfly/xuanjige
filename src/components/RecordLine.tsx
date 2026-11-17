import { cnDate, cnTime, coordsLabel } from '../lib/format'
import { lunarLabel, type CalendarKind, type LunarDate } from '../lib/calendar'

export type RecordEntry = {
  province: string
  city: string
  gender: 'male' | 'female'
  dob: string
  time: string | null
  lat: number
  lon: number
  calendar: CalendarKind
  lunar?: LunarDate
}

export function RecordLine({
  entry,
  onEdit,
  onForm,
}: {
  entry: RecordEntry | null
  onEdit: () => void
  onForm: () => void
}) {
  if (!entry) {
    return (
      <div className="record record--empty">
        <div className="record-line">
          <span className="record-k">尚未报上生辰</span>
          <span className="record-quiet">两盘要等生辰落定，才肯开口。</span>
          <button className="link" type="button" onClick={onForm}>
            去报生辰
          </button>
        </div>
      </div>
    )
  }

  return (
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
        {entry.calendar === 'lunar' && entry.lunar && (
          <span>农历 {lunarLabel(entry.lunar)} 报入</span>
        )}
        <span className="record-coord">{coordsLabel(entry.lat, entry.lon)}</span>
      </div>
    </div>
  )
}
