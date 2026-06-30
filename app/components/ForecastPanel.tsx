import type { Decision, TurnResult } from '@core/index'
import { breakEven } from '@core/index'
import { yen, pct, num } from '../format'

const intOr = (n: number, suffix = '') => (Number.isFinite(n) ? `${num(n)}${suffix}` : '—')

/** 今期の確定前プレビュー＋原価率・損益分岐（利益維持ライン）の表示。 */
export function ForecastPanel({ preview, decision }: { preview: TurnResult; decision: Decision }) {
  const pl = preview.incomeStatement
  const be = breakEven({ unitPrice: decision.unitPrice, unitsSold: preview.unitsSold, income: pl })
  const sold = preview.unitsSold
  const profit = pl.netIncome
  const aboveBE = Number.isFinite(be.breakEvenUnits) && sold >= be.breakEvenUnits

  return (
    <section className="panel forecast">
      <h2>今期の見込み（この判断のプレビュー）</h2>
      <div className="product-grid">
        <div className="metric">
          <div className="metric-value">{num(sold)}個</div>
          <div className="metric-label">見込み販売数量</div>
        </div>
        <div className="metric">
          <div className="metric-value">{yen(pl.revenue)}</div>
          <div className="metric-label">見込み売上</div>
        </div>
        <div className="metric">
          <div className={`metric-value ${profit >= 0 ? 'ok' : 'ng'}`}>{yen(profit)}</div>
          <div className="metric-label">見込み当期純利益</div>
        </div>
        <div className="metric">
          <div className="metric-value">{pct(be.costRatio)}</div>
          <div className="metric-label">原価率（粗利率 {pct(be.grossMarginRatio)}）</div>
        </div>
        <div className="metric">
          <div className="metric-value">
            {yen(be.unitCost)} / {yen(be.contributionPerUnit)}
          </div>
          <div className="metric-label">1個あたり 原価 / 粗利（限界利益）</div>
        </div>
        <div className="metric">
          <div className={`metric-value ${aboveBE ? 'ok' : 'ng'}`}>{intOr(be.breakEvenUnits, '個')}</div>
          <div className="metric-label">損益分岐 販売数量（黒字化ライン）</div>
        </div>
      </div>

      {sold <= 0 ? (
        <p className="ng small">この価格では売れません（需要0）。販売価格を下げてください。</p>
      ) : be.contributionPerUnit <= 0 ? (
        <p className="ng small">
          売価が1個あたり原価（{yen(be.unitCost)}）を下回っています。売れば売るほど赤字です。価格を上げてください。
        </p>
      ) : (
        <p className="muted small">
          <strong>利益維持ライン:</strong> 粗利 {yen(be.contributionPerUnit)}/個で固定費等{' '}
          {yen(be.fixedLike)}/月を賄うには <strong>月 {intOr(be.breakEvenUnits)}個</strong> 必要。
          今の見込みは <span className={aboveBE ? 'ok' : 'ng'}>{num(sold)}個（{aboveBE ? '黒字' : '赤字'}）</span>。
          この販売数量なら <strong>売価 {yen(be.breakEvenPrice)}</strong> 以上で黒字になります。
        </p>
      )}
    </section>
  )
}
