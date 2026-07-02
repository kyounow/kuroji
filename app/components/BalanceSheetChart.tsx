import type { BalanceSheet } from '@core/index'
import { yen } from '../format'

interface Segment {
  label: string
  value: number
  color: string
}

/** 資産と「負債＋純資産」を積み上げ棒で並べ、左右が釣り合う（＝恒等式）ことを示す。 */
export function BalanceSheetChart({ bs }: { bs: BalanceSheet }) {
  const assets: Segment[] = [
    { label: '現金', value: bs.currentAssets.cash, color: '#2f9e7f' },
    { label: '売掛金', value: bs.currentAssets.accountsReceivable, color: '#49b596' },
    { label: '原材料', value: bs.currentAssets.rawMaterials, color: '#69c2a6' },
    { label: '製品', value: bs.currentAssets.finishedGoods, color: '#8fd2bf' },
    { label: '設備', value: bs.fixedAssets.equipment, color: '#b5e0d3' },
    // のれん（M&A後のみ非0。恒等式の左辺に含める）
    { label: 'のれん', value: bs.fixedAssets.goodwill ?? 0, color: '#d4c08f' },
    // 開発資産（商材開発の仕掛＋無形。開発中のみ非0）
    { label: '開発資産', value: bs.fixedAssets.developmentAsset ?? 0, color: '#c3a6de' },
  ]
  const liabEquity: Segment[] = [
    { label: '買掛金', value: bs.currentLiabilities.accountsPayable, color: '#e0875a' },
    { label: '短期借入', value: bs.currentLiabilities.shortTermDebt, color: '#e9a980' },
    { label: '長期借入', value: bs.nonCurrentLiabilities.longTermDebt, color: '#f0c4a6' },
    { label: '資本金', value: bs.equity.capitalStock, color: '#3f7cc0' },
    { label: '利益剰余金', value: bs.equity.retainedEarnings, color: '#6f9fd4' },
  ]

  const W = 360
  const H = 280
  const pad = { t: 24, b: 40 }
  const barW = 96
  const gap = 60
  const x1 = W / 2 - barW - gap / 2
  const x2 = W / 2 + gap / 2

  const sumPos = (segs: Segment[]) => segs.reduce((a, s) => a + Math.max(0, s.value), 0)
  const sumNeg = (segs: Segment[]) => segs.reduce((a, s) => a + Math.min(0, s.value), 0)
  const domainMax = Math.max(sumPos(assets), sumPos(liabEquity), 1)
  const domainMin = Math.min(sumNeg(assets), sumNeg(liabEquity), 0)
  const span = domainMax - domainMin || 1
  const plotH = H - pad.t - pad.b
  const y = (v: number) => pad.t + (1 - (v - domainMin) / span) * plotH
  const zeroY = y(0)

  // 正の値は0から上へ、負の値は0から下へ積む。
  const renderBar = (segs: Segment[], x: number, title: string) => {
    let up = 0
    let down = 0
    return (
      <g>
        {segs.map((s) => {
          if (s.value === 0) return null
          let top: number
          let h: number
          if (s.value > 0) {
            const base = up
            up += s.value
            top = y(up)
            h = y(base) - y(up)
          } else {
            const base = down
            down += s.value
            top = y(base)
            h = y(down) - y(base)
          }
          return (
            <rect key={s.label} x={x} y={top} width={barW} height={Math.max(1, h)} fill={s.color} />
          )
        })}
        <text x={x + barW / 2} y={H - 22} className="wf-label" textAnchor="middle">
          {title}
        </text>
        <text x={x + barW / 2} y={H - 8} className="wf-value" textAnchor="middle">
          {yen(sumPos(segs) + sumNeg(segs))}
        </text>
      </g>
    )
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart chart-bs" role="img" aria-label="貸借対照表グラフ">
        <line x1={8} y1={zeroY} x2={W - 8} y2={zeroY} className="axis-zero" />
        {renderBar(assets, x1, '資産')}
        {renderBar(liabEquity, x2, '負債+純資産')}
      </svg>
      <div className="legend bs-legend">
        {[...assets, ...liabEquity].map((s) => (
          <span className="key" key={s.label}>
            <span className="swatch" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
