import { useState } from 'react'
import type { TurnRecord } from '../state'
import { aggregateTrend, type Granularity } from '../trend'
import { yen } from '../format'
import { TrendChart } from './TrendChart'

interface Props {
  history: TurnRecord[]
  periodsPerYear: number
}

// B/S 資産の積み上げ色（BalanceSheetChart と揃える）。
const A = {
  cash: '#2f9e7f',
  receivable: '#49b596',
  rawMaterials: '#69c2a6',
  finishedGoods: '#8fd2bf',
  equipment: '#b5e0d3',
}

/** 財務三表（B/S・P/L・C/F）を年/月単位の時系列グラフで並べて表示する。 */
export function StatementsTrend({ history, periodsPerYear }: Props) {
  const [granularity, setGranularity] = useState<Granularity>(periodsPerYear >= 12 ? 'year' : 'month')

  if (history.length === 0) {
    return <p className="muted">1ヶ月以上進めると、財務三表の推移グラフが表示されます。</p>
  }

  const buckets = aggregateTrend(history, periodsPerYear, granularity)
  const labels = buckets.map((b) => b.label)
  const val = (f: (b: (typeof buckets)[number]) => number) => buckets.map(f)

  return (
    <div className="trend">
      <div className="trend-toggle">
        <span className="muted small">単位:</span>
        <div className="seg">
          <button className={granularity === 'year' ? 'on' : ''} onClick={() => setGranularity('year')}>
            年単位
          </button>
          <button className={granularity === 'month' ? 'on' : ''} onClick={() => setGranularity('month')}>
            月単位
          </button>
        </div>
        <span className="muted small">
          直近 {buckets.length}
          {granularity === 'year' ? '年' : 'ヶ月'}（フローは期間合算・B/Sは期末時点）
        </span>
      </div>

      <TrendChart
        title="貸借対照表（資産の構成と純資産）"
        labels={labels}
        mode="stacked"
        formatY={yen}
        series={[
          { key: 'cash', label: '現金', color: A.cash, values: val((b) => b.assets.cash) },
          { key: 'ar', label: '売掛金', color: A.receivable, values: val((b) => b.assets.receivable) },
          { key: 'raw', label: '原材料', color: A.rawMaterials, values: val((b) => b.assets.rawMaterials) },
          { key: 'fin', label: '製品', color: A.finishedGoods, values: val((b) => b.assets.finishedGoods) },
          { key: 'eq', label: '設備', color: A.equipment, values: val((b) => b.assets.equipment) },
        ]}
        line={{ label: '純資産', color: '#3f7cc0', values: val((b) => b.totalEquity) }}
      />

      <TrendChart
        title="損益計算書（売上高・当期純利益）"
        labels={labels}
        mode="grouped"
        formatY={yen}
        series={[
          { key: 'rev', label: '売上高', color: '#9aa7b2', values: val((b) => b.revenue) },
          { key: 'ni', label: '当期純利益', color: '#0b6e4f', values: val((b) => b.netIncome) },
        ]}
        line={{ label: '営業利益', color: '#2f6fb0', values: val((b) => b.operatingIncome) }}
      />

      <TrendChart
        title="キャッシュ・フロー（営業・投資・財務）"
        labels={labels}
        mode="stacked"
        formatY={yen}
        series={[
          { key: 'cfo', label: '営業CF', color: '#2f9e7f', values: val((b) => b.cfOperating) },
          { key: 'cfi', label: '投資CF', color: '#3f7cc0', values: val((b) => b.cfInvesting) },
          { key: 'cff', label: '財務CF', color: '#e0875a', values: val((b) => b.cfFinancing) },
        ]}
      />
    </div>
  )
}
