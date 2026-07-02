import { useGameView } from '../GameViewContext'
import { MacroPanel } from '../components/MacroPanel'
import { yen, pct } from '../format'

/** 市況タブ: マクロ経済（景気・物価・政策金利）と競合・市場シェア。 */
export function MarketTab() {
  const v = useGameView()
  const { game, scenario, product, competitor } = v
  const params = scenario.params

  return (
    <div role="tabpanel" id="panel-market" aria-labelledby="tab-market">
      <MacroPanel macro={game.macro} effectiveRate={v.effectiveRate} />

      {game.current.acquiredCompetitor ? (
        <section className="product">
          <h2>競合・市場シェア</h2>
          <p className="small">
            🤝 <strong>競合は買収済みです。</strong>シェアの取り合いはなくなり、獲得した顧客基盤で需要が +
            {pct(params.acqTargetDemandBoost ?? 0)} されています。B/S には
            <strong>のれん</strong>が計上され、毎期償却されています（財務タブ参照）。
          </p>
        </section>
      ) : v.hasCompetitor ? (
        <section className="product">
          <h2>競合・市場シェア</h2>
          <div className="product-grid">
            <div className="metric">
              <div className="metric-value">{yen(competitor.price)}</div>
              <div className="metric-label">競合の価格</div>
            </div>
            <div className="metric">
              <div className="metric-value">{competitor.quality.toFixed(2)}</div>
              <div className="metric-label">競合の品質（自社 {product.demandModifier.toFixed(2)}）</div>
            </div>
            <div className="metric">
              <div className={`metric-value ${v.ourShare >= 0.5 ? 'ok' : 'ng'}`}>{pct(v.ourShare)}</div>
              <div className="metric-label">自社シェア（この価格での試算）</div>
            </div>
          </div>
          <p className="muted small">
            シェアは「価格あたり品質」で競合と取り合います。値下げや研究開発（品質）でシェアが伸び、需要に反映されます。
          </p>
        </section>
      ) : (
        <p className="muted small">このシナリオには直接の競合はいません（市場を独占的に供給）。</p>
      )}
    </div>
  )
}
