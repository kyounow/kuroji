import { memo } from 'react'
import { bookValuePerShare, earningsPerShare } from '@core/index'
import { yen, num } from '../format'

/** 資本（株式）の状態: 発行済株数・1株あたり純資産(BVPS)・1株あたり純利益(EPS)。 */
export const CapitalPanel = memo(function CapitalPanel({
  sharesOutstanding,
  equity,
  lastNetIncome,
}: {
  sharesOutstanding: number
  equity: number
  /** 直近に確定した期の当期純利益（EPS の算定に使う）。履歴がなければ null。 */
  lastNetIncome: number | null
}) {
  const bvps = bookValuePerShare(equity, sharesOutstanding)
  const eps = lastNetIncome != null ? earningsPerShare(lastNetIncome, sharesOutstanding) : null
  return (
    <section className="panel">
      <h2>資本（株式）</h2>
      <div className="product-grid">
        <div className="metric">
          <div className="metric-value">{num(sharesOutstanding)}株</div>
          <div className="metric-label">発行済株式数</div>
        </div>
        <div className="metric">
          <div className="metric-value">{yen(Math.round(bvps))}</div>
          <div className="metric-label">1株あたり純資産（BVPS）</div>
        </div>
        <div className="metric">
          <div className={`metric-value ${eps != null && eps < 0 ? 'ng' : ''}`}>
            {eps != null ? yen(Math.round(eps)) : '—'}
          </div>
          <div className="metric-label">1株あたり純利益（直近月・EPS）</div>
        </div>
      </div>
      <p className="muted small">
        増資（株式発行）は無利息・返済不要で自己資本を厚くし借入枠も広げますが、株数が増えて1株の価値・EPSが薄まります（希薄化）。
        借入（利息・返済）との使い分けが資本政策です。
      </p>
    </section>
  )
})
