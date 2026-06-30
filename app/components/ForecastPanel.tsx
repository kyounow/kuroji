import type { Decision, TurnResult } from '@core/index'
import { breakEven } from '@core/index'
import { yen, pct, num } from '../format'

const intOr = (n: number, suffix = '') => (Number.isFinite(n) ? `${num(n)}${suffix}` : '—')

/** 今期の確定前プレビュー＋原価率・損益分岐（利益維持ライン）の表示。 */
export function ForecastPanel({
  preview,
  decision,
  demandNoise = 0,
}: {
  preview: TurnResult
  decision: Decision
  /** 実需のブレ幅 σ（見込み数量の幅表示に使う）。 */
  demandNoise?: number
}) {
  const pl = preview.incomeStatement
  const be = breakEven({ unitPrice: decision.unitPrice, unitsSold: preview.unitsSold, income: pl })
  const sold = preview.unitsSold
  const profit = pl.netIncome
  const aboveBE = Number.isFinite(be.breakEvenUnits) && sold >= be.breakEvenUnits

  // 見込み販売数量の幅（実需 ±σ を在庫上限でクリップ）。
  const lo = Math.max(0, Math.min(Math.round(preview.demand * (1 - demandNoise)), preview.availableToSell))
  const hi = Math.max(0, Math.min(Math.round(preview.demand * (1 + demandNoise)), preview.availableToSell))
  const hasRange = demandNoise > 0 && hi > lo
  const soldLabel = hasRange ? `${num(lo)}〜${num(hi)}個` : `${num(sold)}個`

  return (
    <section className="panel forecast">
      <h2>今期の見込み（この判断のプレビュー）</h2>
      <div className="product-grid">
        <div className="metric">
          <div className="metric-value">{soldLabel}</div>
          <div className="metric-label">見込み販売数量{hasRange ? `（中心 ${num(sold)}個）` : ''}</div>
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
          見込み販売は <span className={aboveBE ? 'ok' : 'ng'}>{soldLabel}（中心 {num(sold)}個）</span>。
          中心がこのライン以上なら黒字寄り。この販売数量での損益分岐単価は{' '}
          <strong>{yen(be.breakEvenPrice)}</strong>。
          {hasRange && <>（実際の需要は±{Math.round(demandNoise * 100)}%ほどブレるため、利益も上下します）</>}
        </p>
      )}
    </section>
  )
}
