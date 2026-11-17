import { BaziChart } from './BaziChart'
import { Chapter } from './Chapter'
import { Ornament } from './Ornament'
import { RecordLine, type RecordEntry } from './RecordLine'

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
      <Ornament variant="cn" />

      {entry && !entry.time && (
        <div className="chart-blocked">
          <p className="chart-blocked-k">时辰不详</p>
          <p className="chart-blocked-text">四柱缺一，时柱不猜。补上出生时刻，命盘才完整。</p>
          <button className="link" type="button" onClick={onEdit}>
            补录时辰
          </button>
        </div>
      )}

      {entry?.time && <BaziChart dob={entry.dob} time={entry.time} gender={entry.gender} />}

      {entry && (
        <button className="chart-cross" type="button" onClick={onSwitch}>
          转看西式盘
          <span aria-hidden="true">→</span>
        </button>
      )}
    </div>
  )
}
