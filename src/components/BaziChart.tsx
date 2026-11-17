import { useMemo } from 'react'
import { calcBazi, type BaziResult, type Element, type PillarKey } from '../engine/bazi'
import { Term, TermSheet, useTermSheet } from './Term'

const ELEMENTS: Element[] = ['金', '木', '水', '火', '土']
const PILLAR_KEYS: PillarKey[] = ['year', 'month', 'day', 'time']
const PILLAR_LABELS: Record<PillarKey, string> = {
  year: '年柱',
  month: '月柱',
  day: '日柱',
  time: '时柱',
}
const POS_SHORT: Record<PillarKey, string> = { year: '年', month: '月', day: '日', time: '时' }
const SHEN_SHA_ORDER = ['驿马', '桃花', '华盖', '将星', '亡神', '劫煞', '孤辰', '寡宿']

export function BaziChart({
  dob,
  time,
  gender,
}: {
  dob: string
  time: string
  gender: 'male' | 'female'
}) {
  const chart = useMemo(() => {
    const [year, month, day] = dob.split('-').map(Number)
    const [hour, minute] = time.split(':').map(Number)
    return calcBazi(
      year,
      month,
      day,
      hour,
      minute,
      gender === 'male' ? '男' : '女',
      true,
      '',
      new Date().getFullYear(),
    )
  }, [dob, time, gender])

  const { activeTerm, handleTermClick, close } = useTermSheet()

  const totalStrength =
    ELEMENTS.reduce((sum, elem) => sum + chart.wuxing_strength[elem], 0) || 1
  const dayScore = chart.wuxing_strength[chart.day_master_element]
  const othersAvg =
    ELEMENTS.filter((elem) => elem !== chart.day_master_element).reduce(
      (sum, elem) => sum + chart.wuxing_strength[elem],
      0,
    ) / 4
  const ratio = othersAvg > 0 ? dayScore / othersAvg : 1
  const markerPos = Math.min(96, Math.max(4, ((ratio - 0.3) / 1.4) * 100))

  const nowYear = new Date().getFullYear()
  const currentDayunIndex = chart.dayun.findIndex(
    (d) => d.start_year <= nowYear && nowYear <= d.end_year,
  )

  const shensha = SHEN_SHA_ORDER.filter((name) => chart.shen_sha[name]).map(
    (name) => [name, chart.shen_sha[name]] as const,
  )

  const relationLines = chart.zhi_relations.split('；').filter(Boolean)
  const monthZhi = chart.pillars.month.ganzhi[1]
  const useText =
    chart.day_strength === '身弱'
      ? '喜印比生扶'
      : chart.day_strength === '身旺'
        ? '喜官杀食伤财泄耗'
        : '取用看调候与扶抑'

  return (
    <section className="bazi" aria-label="中式四柱命盘" onClick={handleTermClick}>
      <header className="bazi-head">
        <div className="bazi-head-main">
          <p className="bazi-lunar">{chart.lunar}</p>
          <p className="bazi-meta">
            <span>{chart.solar}</span>
            <span>
              属
              <Term name="生肖" className="term--inline">
                {chart.zodiac}
              </Term>
            </span>
            <span>
              日主{' '}
              <Term name="日主" className="term--strong">
                {chart.day_master}
                {chart.day_master_element}
              </Term>
            </span>
          </p>
        </div>
        <p className="bazi-hint">术语带虚点 · 点开看一句</p>
      </header>

      <div className="bazi-layout">
        <div className="bazi-main">
      <div className="pillars">
        {PILLAR_KEYS.map((key) => {
          const pillar = chart.pillars[key]
          const isDay = key === 'day'
          if (!pillar) {
            return (
              <article key={key} className="pillar pillar--unknown">
                <div className="pillar-head">
                  <Term name={PILLAR_LABELS[key]}>{PILLAR_LABELS[key]}</Term>
                </div>
                <span className="pillar-unknown">未知</span>
              </article>
            )
          }
          return (
            <article key={key} className={`pillar${isDay ? ' pillar--day' : ''}`}>
              <div className="pillar-head">
                <Term name={PILLAR_LABELS[key]}>{PILLAR_LABELS[key]}</Term>
              </div>
              <Term
                name="天干"
                className={`term--glyph${isDay ? ' term--day-gan' : ''}`}
              >
                {pillar.ganzhi[0]}
              </Term>
              <Term name="地支" className="term--glyph">
                {pillar.ganzhi[1]}
              </Term>
              <div className="pillar-ten">
                {isDay ? (
                  <span className="ten-self">日主</span>
                ) : (
                  <Term name={pillar.shi_shen_gan}>{pillar.shi_shen_gan}</Term>
                )}
              </div>
              <div className="pillar-line">
                <Term name="藏干" className="term--label">
                  藏干
                </Term>
                <span className="hidden-gan">{pillar.hidden_gan.join(' ')}</span>
              </div>
              <div className="pillar-line">
                <Term name="纳音" className="term--label">
                  纳音
                </Term>
                <span className="nayin">{pillar.nayin}</span>
              </div>
              <div className="pillar-misc">
                <span>
                  <Term name="空亡" className="term--label">
                    空亡
                  </Term>{' '}
                  {chart.xun_kong[key] || '—'}
                </span>
                <span>
                  <Term name="十二长生" className="term--label">
                    长生
                  </Term>{' '}
                  {chart.di_shi[key] || '—'}
                </span>
              </div>
            </article>
          )
        })}
      </div>

      <section className="bazi-block">
        <header className="block-head">
          <span className="block-num">一</span>
          <h3 className="block-title">
            <Term name="五行">五行分布</Term>
          </h3>
          <span className="block-note">气之厚薄</span>
        </header>
        <div className="wx-list">
          {ELEMENTS.map((elem) => {
            const missing = chart.wuxing_missing.includes(elem)
            const share = Math.round((chart.wuxing_strength[elem] / totalStrength) * 100)
            return (
              <div className={`wx-row${missing ? ' wx-row--missing' : ''}`} key={elem}>
                <Term name={elem} className="wx-name">
                  {elem}
                </Term>
                <div className="wx-track" aria-hidden="true">
                  {!missing && <span className="wx-fill" style={{ width: `${share}%` }} />}
                </div>
                {missing ? (
                  <span className="wx-missing">缺</span>
                ) : (
                  <span className="wx-pct">{share}%</span>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="bazi-block">
        <header className="block-head">
          <span className="block-num">二</span>
          <h3 className="block-title">
            <Term name="身强弱">身强弱</Term>
          </h3>
          <span className="block-note">日主之根</span>
        </header>
        <p className="strength-sentence">
          日主{chart.day_master}
          {chart.day_master_element}，生于{monthZhi}月，{chart.day_strength}；{useText}
          {chart.diaohou ? `，调候取${chart.diaohou}` : ''}。
        </p>
        <div className="strength-gauge">
          <div className="strength-zones" aria-hidden="true">
            <span className="zone zone--weak" />
            <span className="zone zone--mid" />
            <span className="zone zone--strong" />
            <span className="strength-marker" style={{ left: `${markerPos}%` }} />
          </div>
          <div className="strength-scale" aria-hidden="true">
            <span>身弱</span>
            <span>中和</span>
            <span>身旺</span>
          </div>
        </div>
        <div className="fav-row">
          <Term name="喜用神" className="term--label">
            喜用
          </Term>
          {chart.favorable.map((item) => (
            <span className="fav-chip" key={item}>
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className="bazi-block">
        <header className="block-head">
          <span className="block-num">三</span>
          <h3 className="block-title">
            <Term name="大运">大运</Term>
          </h3>
          <span className="block-note">十年一步</span>
        </header>
        {chart.dayun.length ? (
          <div className="dayun-track">
            {chart.dayun.map((item, index) => {
              const current = index === currentDayunIndex
              return (
                <article
                  className={`dayun${current ? ' dayun--now' : ''}`}
                  key={`${item.ganzhi}-${item.start_year}`}
                >
                  <span className="dayun-gz">{item.ganzhi}</span>
                  <span className="dayun-age">
                    {item.start_age}–{item.end_age} 岁
                  </span>
                  <span className="dayun-year">
                    {item.start_year}–{item.end_year}
                  </span>
                  {current && <span className="dayun-now">当前</span>}
                </article>
              )
            })}
          </div>
        ) : (
          <p className="empty-line">此盘未取到大运。</p>
        )}
      </section>

      <section className="bazi-block">
        <header className="block-head">
          <span className="block-num">四</span>
          <h3 className="block-title">
            <Term name="神煞">神煞</Term>
          </h3>
          <span className="block-note">只作取象</span>
        </header>
        <div className="sha-row">
          {shensha.length ? (
            shensha.map(([name, positions]) => (
              <span className="sha-tag" key={name}>
                <Term name={name} className="term--tag">
                  {name}
                </Term>
                <span className="sha-pos">{positions.map((p) => POS_SHORT[p]).join('·')}</span>
              </span>
            ))
          ) : (
            <span className="empty-line">此盘不见常用神煞。神煞只作辅助，不必强求。</span>
          )}
        </div>
      </section>

      <section className="bazi-block">
        <header className="block-head">
          <span className="block-num">五</span>
          <h3 className="block-title">
            <Term name="干支关系">干支关系</Term>
          </h3>
          <span className="block-note">盘内张力</span>
        </header>
        <div className="relation-lines">
          {relationLines.map((line) => (
            <p className={`relation-line${relationTone(line)}`} key={line}>
              {line}
            </p>
          ))}
        </div>
      </section>

      <details className="bazi-details">
        <summary>
          <span className="details-title">盘面细节</span>
          <span className="details-hint">空亡 · 十二长生 · 命宫</span>
          <span className="details-toggle" aria-hidden="true" />
        </summary>
        <DetailBlocks chart={chart} />
      </details>
        </div>

        <aside className="bazi-side">
          <section className="side-section">
            <h2 className="side-k">盘面细节</h2>
            <DetailBlocks chart={chart} />
          </section>
          <section className="side-section">
            <h2 className="side-k">读盘三步</h2>
            <ol className="side-steps">
              <li>
                <span className="side-step-n" aria-hidden="true">
                  一
                </span>
                <p>
                  <strong>先看日主强弱</strong>
                  日主{chart.day_master}
                  {chart.day_master_element}，{chart.day_strength}。
                </p>
              </li>
              <li>
                <span className="side-step-n" aria-hidden="true">
                  二
                </span>
                <p>
                  <strong>再看十神取舍</strong>
                  喜用{chart.favorable.join('、') || '未定'}，十神定其用。
                </p>
              </li>
              <li>
                <span className="side-step-n" aria-hidden="true">
                  三
                </span>
                <p>
                  <strong>最后看大运与干支关系</strong>
                  现运{chart.current_dayun || '未排'}；
                  {relationLines.length ? '盘内有合冲，须并看。' : '盘内无明显合冲。'}
                </p>
              </li>
            </ol>
          </section>
        </aside>
      </div>

      <TermSheet term={activeTerm} onClose={close} />
    </section>
  )
}

function DetailBlocks({ chart }: { chart: BaziResult }) {
  return (
    <div className="detail-grid">
      <div className="detail-block">
        <h4>
          <Term name="空亡">空亡</Term>
        </h4>
        <dl className="detail-list">
          {PILLAR_KEYS.map((key) => (
            <div className="detail-row" key={key}>
              <dt>{POS_SHORT[key]}</dt>
              <dd>{chart.xun_kong[key] || '—'}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="detail-block">
        <h4>
          <Term name="十二长生">十二长生</Term>
        </h4>
        <dl className="detail-list">
          {PILLAR_KEYS.map((key) => (
            <div className="detail-row" key={key}>
              <dt>{POS_SHORT[key]}</dt>
              <dd>{chart.di_shi[key] || '—'}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="detail-block detail-block--wide">
        <h4>宫位</h4>
        <dl className="detail-list detail-list--inline">
          <div className="detail-row">
            <dt>
              <Term name="命宫">命宫</Term>
            </dt>
            <dd>{chart.ming_shen.命宫 || '—'}</dd>
          </div>
          <div className="detail-row">
            <dt>
              <Term name="身宫">身宫</Term>
            </dt>
            <dd>{chart.ming_shen.身宫 || '—'}</dd>
          </div>
          <div className="detail-row">
            <dt>
              <Term name="胎元">胎元</Term>
            </dt>
            <dd>{chart.ming_shen.胎元 || '—'}</dd>
          </div>
          <div className="detail-row">
            <dt>
              <Term name="胎息">胎息</Term>
            </dt>
            <dd>{chart.ming_shen.胎息 || '—'}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

function relationTone(line: string): string {
  if (/相冲|相刑|相害|相破/.test(line)) return ' relation-line--clash'
  if (line.includes('合')) return ' relation-line--join'
  return ''
}
