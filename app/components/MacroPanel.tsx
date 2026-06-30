import type { MacroState } from '@core/index'
import { pct } from '../format'

const PHASE_LABEL: Record<MacroState['phase'], string> = {
  expansion: '🔼 拡大（好景気）',
  normal: '➖ 普通',
  recession: '🔽 後退（不況）',
}

/** マクロ経済（景気・インフレ/デフレ・政策金利）の表示。 */
export function MacroPanel({ macro, effectiveRate }: { macro: MacroState; effectiveRate: number }) {
  const tone = macro.phase === 'expansion' ? 'good' : macro.phase === 'recession' ? 'bad' : 'neutral'
  const infl = macro.annualInflation
  const inflLabel = infl >= 0 ? `インフレ +${pct(infl)}` : `デフレ −${pct(-infl)}`

  return (
    <section className="panel macro">
      <h2>経済の状況（マクロ）</h2>
      <div className="product-grid">
        <div className="metric">
          <div className={`metric-value ${tone === 'good' ? 'ok' : tone === 'bad' ? 'ng' : ''}`}>
            {PHASE_LABEL[macro.phase]}
          </div>
          <div className="metric-label">景気局面</div>
        </div>
        <div className="metric">
          <div className={`metric-value ${infl < 0 ? 'ng' : ''}`}>{inflLabel}</div>
          <div className="metric-label">物価の年率（インフレ/デフレ）</div>
        </div>
        <div className="metric">
          <div className="metric-value">{macro.inflationIndex.toFixed(2)}</div>
          <div className="metric-label">物価指数（1.0=開始時）</div>
        </div>
        <div className="metric">
          <div className="metric-value">{pct(macro.policyRate)}</div>
          <div className="metric-label">政策金利</div>
        </div>
        <div className="metric">
          <div className="metric-value">{pct(effectiveRate)}</div>
          <div className="metric-label">実効借入金利（政策金利＋信用）</div>
        </div>
      </div>
      <p className="muted small">
        景気は数年単位で続きます。インフレ時は名目価格を上げないと実質値下げになり粗利が圧迫されます（デフレは逆）。
      </p>
    </section>
  )
}
