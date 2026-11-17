import { Chapter } from './Chapter'
import { RecordLine, type RecordEntry } from './RecordLine'
import { VedicChart } from './VedicChart'
import { chartTime } from '../lib/format'

// 时辰不详时按正午暂排，上升、宫位与运限均以正午为准，页面另注明误差。
const NOON = '12:00'

export function VeChartPage({
  entry,
  onForm,
  onEdit,
  onSwitch,
}: {
  entry: RecordEntry | null
  onForm: () => void
  onEdit: () => void
  onSwitch: () => void
}) {
  return (
    <div className="chart-page chart-page--ve">
      <Chapter num="叁" kicker="卷 之 三" title="西式命盘" sub="恒星黄道，整宫为盘。" />
      <RecordLine entry={entry} onEdit={onEdit} onForm={onForm} />

      {entry && !entry.time && (
        <p className="chart-caveat">
          时辰不详：上升、宫位与运限按正午暂排，边界处或有出入。
          <button className="link" type="button" onClick={onEdit}>
            补录时辰
          </button>
        </p>
      )}

      {entry && (
        <VedicChart
          dob={entry.dob}
          time={chartTime(entry.time, NOON)}
          place={`${entry.province}·${entry.city}`}
          lat={entry.lat}
          lon={entry.lon}
        />
      )}

      {entry && (
        <button className="chart-cross" type="button" onClick={onSwitch}>
          转看中式盘
          <span aria-hidden="true">→</span>
        </button>
      )}
    </div>
  )
}