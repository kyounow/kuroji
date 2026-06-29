import { totalEquity, type CompanyState } from '@core/index'
import type { TurnRecord } from '../state'
import { yen } from '../format'

interface Props {
  initial: CompanyState
  history: TurnRecord[]
}

/** 純資産と現金の推移を描く簡易折れ線グラフ（依存ライブラリなしの SVG）。 */
export function HistoryChart({ initial, history }: Props) {
  // 期0（期首）＋各期末の系列。
  const states = [initial, ...history.map((h) => h.stateAfter)]
  const equity = states.map((s) => totalEquity(s.balanceSheet))
  const cash = states.map((s) => s.balanceSheet.currentAssets.cash)

  if (states.length < 2) {
    return (
      <section className="panel">
        <h2>推移</h2>
        <p className="muted">1期以上進めるとグラフが表示されます。</p>
      </section>
    )
  }

  const W = 600
  const H = 220
  const pad = { l: 8, r: 8, t: 12, b: 22 }
  const all = [...equity, ...cash, 0]
  const min = Math.min(...all)
  const max = Math.max(...all)
  const span = max - min || 1
  const n = states.length

  const x = (i: number) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b)

  const line = (series: number[]) => series.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const zeroY = y(0)

  return (
    <section className="panel">
      <h2>推移（純資産・現金）</h2>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="純資産と現金の推移">
        {min < 0 && max > 0 && (
          <line x1={pad.l} y1={zeroY} x2={W - pad.r} y2={zeroY} className="axis-zero" />
        )}
        <polyline points={line(equity)} className="line-equity" />
        <polyline points={line(cash)} className="line-cash" />
        {states.map((_, i) => (
          <text key={i} x={x(i)} y={H - 6} className="x-label" textAnchor="middle">
            {i}
          </text>
        ))}
      </svg>
      <div className="legend">
        <span className="key key-equity">純資産 {yen(equity[equity.length - 1])}</span>
        <span className="key key-cash">現金 {yen(cash[cash.length - 1])}</span>
        <span className="muted small">横軸 = 期（0=期首）</span>
      </div>
    </section>
  )
}
