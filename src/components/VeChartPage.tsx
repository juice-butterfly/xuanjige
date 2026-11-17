import { Chapter } from './Chapter'
import { Ornament } from './Ornament'
import { RecordLine, type RecordEntry } from './RecordLine'
import { VedicChart } from './VedicChart'

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
      <Ornament variant="ve" />

      {entry && !entry.time && (
        <div className="chart-blocked">
          <p className="chart-blocked-k">时辰不详</p>
          <p className="chart-blocked-text">上升与宫位无从落定。补上出生时刻，星盘才完整。</p>
          <button className="link" type="button" onClick={onEdit}>
            补录时辰
          </button>
        </div>
      )}

      {entry?.time && (
        <VedicChart
          dob={entry.dob}
          time={entry.time}
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
