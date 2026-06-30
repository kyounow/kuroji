import type { ReactNode } from 'react'

export interface TrendSeries {
  key: string
  label: string
  color: string
  values: number[]
}

interface Props {
  labels: string[]
  series: TrendSeries[]
  mode: 'stacked' | 'grouped'
  /** 重ねる折れ線（例: 純資産） */
  line?: { label: string; color: string; values: number[] }
  title: string
  formatY?: (n: number) => string
  height?: number
}

const compact = (n: number): string => {
  const a = Math.abs(n)
  if (a >= 1e8) return `${(n / 1e8).toFixed(1)}億`
  if (a >= 1e4) return `${Math.round(n / 1e4)}万`
  return `${Math.round(n)}`
}

/** 時系列の棒（積み上げ/グルーピング）＋任意の折れ線を描く SVG チャート（依存ライブラリなし）。 */
export function TrendChart({ labels, series, mode, line, title, formatY = compact, height = 200 }: Props) {
  const n = labels.length
  if (n === 0) return null

  const W = 720
  const H = height
  const pad = { l: 4, r: 4, t: 10, b: 40 }
  const plotW = W - pad.l - pad.r
  const plotH = H - pad.t - pad.b
  const slot = plotW / n

  // y ドメイン（0 を含む）。stacked は正/負を別々に積む。
  let max = 0
  let min = 0
  for (let i = 0; i < n; i++) {
    if (mode === 'stacked') {
      let pos = 0
      let neg = 0
      for (const s of series) {
        const v = s.values[i] ?? 0
        if (v >= 0) pos += v
        else neg += v
      }
      max = Math.max(max, pos)
      min = Math.min(min, neg)
    } else {
      for (const s of series) {
        max = Math.max(max, s.values[i] ?? 0)
        min = Math.min(min, s.values[i] ?? 0)
      }
    }
    if (line) {
      max = Math.max(max, line.values[i] ?? 0)
      min = Math.min(min, line.values[i] ?? 0)
    }
  }
  const span = max - min || 1
  const y = (v: number) => pad.t + (1 - (v - min) / span) * plotH
  const zeroY = y(0)

  const rects: ReactNode[] = []
  for (let i = 0; i < n; i++) {
    const cx = pad.l + slot * i + slot / 2
    if (mode === 'stacked') {
      let up = 0
      let down = 0
      const barW = Math.min(28, slot * 0.7)
      for (const s of series) {
        const v = s.values[i] ?? 0
        if (v === 0) continue
        let top: number
        let h: number
        if (v > 0) {
          const base = up
          up += v
          top = y(up)
          h = y(base) - y(up)
        } else {
          const base = down
          down += v
          top = y(base)
          h = y(down) - y(base)
        }
        rects.push(
          <rect key={`${i}-${s.key}`} x={cx - barW / 2} y={top} width={barW} height={Math.max(0.5, h)} fill={s.color} />,
        )
      }
    } else {
      const gw = slot * 0.7
      const barW = gw / series.length
      series.forEach((s, si) => {
        const v = s.values[i] ?? 0
        const x = cx - gw / 2 + si * barW
        const top = v >= 0 ? y(v) : zeroY
        const h = Math.abs(y(v) - zeroY)
        rects.push(
          <rect key={`${i}-${s.key}`} x={x} y={top} width={Math.max(0.5, barW - 1)} height={Math.max(0.5, h)} fill={s.color} />,
        )
      })
    }
  }

  // x ラベルは ~10 本に間引く。
  const tickStep = Math.max(1, Math.ceil(n / 10))
  const ticks = labels.map((lab, i) => ({ lab, i })).filter((t) => t.i % tickStep === 0 || t.i === n - 1)

  const linePts = line
    ? line.values.map((v, i) => `${pad.l + slot * i + slot / 2},${y(v)}`).join(' ')
    : ''

  return (
    <div className="trend-chart">
      <div className="trend-head">
        <strong>{title}</strong>
        <span className="trend-legend">
          {series.map((s) => (
            <span className="key" key={s.key}>
              <span className="swatch" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
          {line && (
            <span className="key">
              <span className="line-key" style={{ background: line.color }} />
              {line.label}
            </span>
          )}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${title}の推移`}>
        {min < 0 && <line x1={pad.l} y1={zeroY} x2={W - pad.r} y2={zeroY} className="axis-zero" />}
        {/* y軸の目安（最大値・0） */}
        <text x={pad.l} y={pad.t + 9} className="x-label">{formatY(max)}</text>
        {min < 0 && <text x={pad.l} y={zeroY - 3} className="x-label">0</text>}
        {rects}
        {line && <polyline points={linePts} className="trend-line" style={{ stroke: line.color }} />}
        {ticks.map((t) => (
          <text key={t.i} x={pad.l + slot * t.i + slot / 2} y={H - 6} className="x-label" textAnchor="middle">
            {t.lab}
          </text>
        ))}
      </svg>
    </div>
  )
}
