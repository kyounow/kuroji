import { memo } from 'react'
import { bookValuePerShare, earningsPerShare } from '@core/index'
import { yen, num } from '../format'
import { InfoTip } from './Glossary'

/** 資本（株式）の状態: 発行済株数・1株あたり純資産(BVPS)・1株あたり純利益(EPS)。 */
export const CapitalPanel = memo(function CapitalPanel({
  sharesOutstanding,
  equity,
  lastNetIncome,
  listed = false,
  marketCap,
  lastDividendPaid,
}: {
  sharesOutstanding: number
  equity: number
  /** 直近に確定した期の当期純利益（EPS の算定に使う）。履歴がなければ null。 */
  lastNetIncome: number | null
  /** 上場済みか */
  listed?: boolean
  /** 時価総額（年間純利益×PER。上場中のみ表示） */
  marketCap?: number
  /** 直近に支払った配当（あれば配当/株を表示） */
  lastDividendPaid?: number
}) {
  const bvps = bookValuePerShare(equity, sharesOutstanding)
  const eps = lastNetIncome != null ? earningsPerShare(lastNetIncome, sharesOutstanding) : null
  const sharePrice = listed && marketCap != null && sharesOutstanding > 0 ? marketCap / sharesOutstanding : null
  return (
    <section className="panel">
      <h2>資本（株式）{listed && <span className="badge-rec">🏛 上場企業</span>}</h2>
      <div className="product-grid">
        <div className="metric">
          <div className="metric-value">{num(sharesOutstanding)}株</div>
          <div className="metric-label">発行済株式数</div>
        </div>
        <div className="metric">
          <div className="metric-value">{yen(Math.round(bvps))}</div>
          <div className="metric-label">
            1株あたり純資産（BVPS） <InfoTip term="BVPS" />
          </div>
        </div>
        <div className="metric">
          <div className={`metric-value ${eps != null && eps < 0 ? 'ng' : ''}`}>
            {eps != null ? yen(Math.round(eps)) : '—'}
          </div>
          <div className="metric-label">
            1株あたり純利益（直近月・EPS） <InfoTip term="EPS" />
          </div>
        </div>
        {listed && marketCap != null && (
          <div className="metric">
            <div className="metric-value">{yen(marketCap)}</div>
            <div className="metric-label">
              時価総額（年間純利益×PER） <InfoTip term="時価総額" />
            </div>
          </div>
        )}
        {sharePrice != null && (
          <div className="metric">
            <div className="metric-value">{yen(Math.round(sharePrice))}</div>
            <div className="metric-label">株価（時価総額÷株数）</div>
          </div>
        )}
        {lastDividendPaid != null && lastDividendPaid > 0 && sharesOutstanding > 0 && (
          <div className="metric">
            <div className="metric-value">{yen(Math.round(lastDividendPaid / sharesOutstanding))}</div>
            <div className="metric-label">
              配当/株（直近月） <InfoTip term="配当" />
            </div>
          </div>
        )}
      </div>
      <p className="muted small">
        増資（株式発行）は無利息・返済不要で自己資本を厚くし借入枠も広げますが、株数が増えて1株の価値・EPSが薄まります（希薄化）。
        借入（利息・返済）との使い分けが資本政策です。
      </p>
    </section>
  )
})
