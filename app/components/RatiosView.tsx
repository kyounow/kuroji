import type { Ratios } from '@core/index'
import { pct, ratio, periodLabel } from '../format'
import { InfoTip } from './Glossary'

/** 主要な経営指標の一覧。 */
export function RatiosView({
  ratios,
  turn,
  periodsPerYear,
}: {
  ratios: Ratios | null
  turn?: number
  periodsPerYear: number
}) {
  if (!ratios) return null
  // 目安に照らした健全度。good=◎/ok=○/bad=△。
  const j = (good: boolean, ok: boolean): Judge => (good ? 'good' : ok ? 'ok' : 'bad')
  const cost = 1 - ratios.grossMargin
  const items: Item[] = [
    { label: '流動比率', term: '流動比率', value: ratio(ratios.currentRatio), help: '短期の支払能力。200%以上が目安', judge: j(ratios.currentRatio >= 2, ratios.currentRatio >= 1) },
    { label: '自己資本比率', term: '自己資本比率', value: pct(ratios.equityRatio), help: '資産に占める純資産。40%以上が目安', judge: j(ratios.equityRatio >= 0.4, ratios.equityRatio >= 0.15) },
    { label: 'ROE', term: 'ROE', value: pct(ratios.roe), help: '純資産に対する利益率。15%以上が目安', judge: j(ratios.roe >= 0.15, ratios.roe >= 0) },
    { label: 'ROA', term: 'ROA', value: pct(ratios.roa), help: '総資産に対する利益率', judge: j(ratios.roa >= 0.08, ratios.roa >= 0) },
    { label: '売上原価率', term: '売上原価', value: pct(cost), help: '売上に占める原価。低いほど粗利が厚い', judge: j(cost <= 0.6, cost <= 0.8) },
    { label: '売上総利益率', term: '粗利', value: pct(ratios.grossMargin), help: '粗利の厚さ（1−原価率）', judge: j(ratios.grossMargin >= 0.4, ratios.grossMargin >= 0.2) },
    { label: '営業利益率', term: '営業利益', value: pct(ratios.operatingMargin), help: '本業の稼ぐ力', judge: j(ratios.operatingMargin >= 0.1, ratios.operatingMargin >= 0) },
  ]
  return (
    <section className="panel">
      <h2>経営指標{turn ? `（${periodLabel(turn, periodsPerYear)}）` : ''}</h2>
      <div className="metrics">
        {items.map((it) => {
          const v = VERDICT[it.judge]
          return (
            <div className="metric" key={it.label} title={it.help}>
              <div className={`metric-value ${v.cls}`}>{it.value}</div>
              <div className="metric-label">
                {it.label} <InfoTip term={it.term} />
              </div>
              <div className={`metric-verdict ${v.cls}`}>{v.text}</div>
            </div>
          )
        })}
      </div>
      <p className="muted small">◎ 健全 / ○ 標準 / △ 注意（一般的な目安との比較）。ⓘ で用語の意味を確認できます。</p>
    </section>
  )
}

type Judge = 'good' | 'ok' | 'bad'
interface Item {
  label: string
  term: string
  value: string
  help: string
  judge: Judge
}
const VERDICT: Record<Judge, { cls: string; text: string }> = {
  good: { cls: 'ok', text: '◎ 健全' },
  ok: { cls: '', text: '○ 標準' },
  bad: { cls: 'ng', text: '△ 注意' },
}
