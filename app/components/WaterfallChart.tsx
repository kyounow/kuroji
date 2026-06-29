import { yen } from '../format'

export interface WaterfallStep {
  label: string
  /** total は 0 からの絶対値の棒、delta は直前の累積からの増減（符号付き） */
  value: number
  type: 'total' | 'delta'
}

/**
 * ウォーターフォール（滝）グラフ。total は基準線(0)からの棒、
 * delta は直前の累積から積み上がる/差し引かれる棒として描く。
 * P/L（売上→各費用→純利益）や C/F（期首現金→各CF→期末現金）の可視化に使う。
 */
export function WaterfallChart({ steps }: { steps: WaterfallStep[] }) {
  const W = 640
  const H = 260
  const pad = { l: 6, r: 6, t: 18, b: 46 }

  // 各棒の [low, high]（値ドメイン）と表示値・符号を計算。
  let running = 0
  const bars = steps.map((s) => {
    let low: number
    let high: number
    let positive: boolean
    if (s.type === 'total') {
      low = Math.min(0, s.value)
      high = Math.max(0, s.value)
      positive = s.value >= 0
      running = s.value
    } else {
      const start = running
      const end = running + s.value
      low = Math.min(start, end)
      high = Math.max(start, end)
      positive = s.value >= 0
      running = end
    }
    return { ...s, low, high, positive }
  })

  const domainMin = Math.min(0, ...bars.map((b) => b.low))
  const domainMax = Math.max(0, ...bars.map((b) => b.high))
  const span = domainMax - domainMin || 1

  const plotW = W - pad.l - pad.r
  const plotH = H - pad.t - pad.b
  const slot = plotW / bars.length
  const barW = Math.min(64, slot * 0.6)
  const y = (v: number) => pad.t + (1 - (v - domainMin) / span) * plotH
  const zeroY = y(0)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart wf" role="img" aria-label="ウォーターフォールグラフ">
      <line x1={pad.l} y1={zeroY} x2={W - pad.r} y2={zeroY} className="axis-zero" />
      {bars.map((b, i) => {
        const cx = pad.l + slot * i + slot / 2
        const x = cx - barW / 2
        const top = y(b.high)
        const h = Math.max(1, y(b.low) - y(b.high))
        const cls =
          b.type === 'total' ? 'wf-total' : b.positive ? 'wf-up' : 'wf-down'
        const labelY = b.high >= 0 ? top - 4 : y(b.low) + 12
        return (
          <g key={b.label}>
            <rect x={x} y={top} width={barW} height={h} className={cls} rx={2} />
            <text x={cx} y={labelY} className="wf-value" textAnchor="middle">
              {yen(b.value)}
            </text>
            <text x={cx} y={H - 26} className="wf-label" textAnchor="middle">
              {b.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
