import { BaziChart } from './BaziChart'
import { Chapter } from './Chapter'
import { RecordLine, type RecordEntry } from './RecordLine'
import { chartTime } from '../lib/format'

// 时辰不详时按正午暂排，时柱由引擎照常排出，页面另注明误差。
const NOON = '12:00'

export function CnChartPage({
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
    <div className="chart-page chart-page--cn">
      <Chapter num="贰" kicker="卷 之 二" title="中式命盘" sub="四柱为骨，十神为用。" />
      <RecordLine entry={entry} onEdit={onEdit} onForm={onForm} />

      {entry && !entry.time && (
        <p className="chart-caveat">
          时辰不详：时柱按正午暂排，晚运与子女一项仅供参考。
          <button className="link" type="button" onClick={onEdit}>
            补录时辰
          </button>
        </p>
      )}

      {entry && (
        <BaziChart
          dob={entry.dob}
          time={chartTime(entry.time, NOON)}
          gender={entry.gender}
        />
      )}

      {entry && (
        <button className="chart-cross" type="button" onClick={onSwitch}>
          转看西式盘
          <span aria-hidden="true">→</span>
        </button>
      )}
    </div>
  )
}