import type { Ratios } from '@core/index'
import { pct, ratio, periodLabel } from '../format'

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
  const items: { label: string; value: string; help: string }[] = [
    { label: '流動比率', value: ratio(ratios.currentRatio), help: '短期の支払能力。200%以上が目安' },
    { label: '自己資本比率', value: pct(ratios.equityRatio), help: '資産に占める純資産。高いほど安全' },
    { label: 'ROE', value: pct(ratios.roe), help: '純資産に対する利益率' },
    { label: 'ROA', value: pct(ratios.roa), help: '総資産に対する利益率' },
    { label: '売上原価率', value: pct(1 - ratios.grossMargin), help: '売上に占める原価。低いほど粗利が厚い' },
    { label: '売上総利益率', value: pct(ratios.grossMargin), help: '粗利の厚さ（1−原価率）' },
    { label: '営業利益率', value: pct(ratios.operatingMargin), help: '本業の稼ぐ力' },
  ]
  return (
    <section className="panel">
      <h2>経営指標{turn ? `（${periodLabel(turn, periodsPerYear)}）` : ''}</h2>
      <div className="metrics">
        {items.map((it) => (
          <div className="metric" key={it.label} title={it.help}>
            <div className="metric-value">{it.value}</div>
            <div className="metric-label">{it.label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
