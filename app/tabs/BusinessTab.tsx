import { useGameView } from '../GameViewContext'
import { DecisionPanel } from '../components/DecisionPanel'
import { ForecastPanel } from '../components/ForecastPanel'
import { InfoTip } from '../components/Glossary'
import { yen, pct, num } from '../format'

/** 事業タブ: はじめかたガイド・製品/原材料の状態・経営判断・IPO/M&A・今期の見込み。 */
export function BusinessTab() {
  const v = useGameView()
  const { game, scenario, gameOver, decision, patch, play, preview, product } = v
  const params = scenario.params

  return (
    <div role="tabpanel" id="panel-business" aria-labelledby="tab-business">
      {!gameOver && game.history.length === 0 && !v.guideDismissed && (
        <section className="guide">
          <div className="guide-head">
            <strong>👋 はじめかた（1分でわかる遊び方）</strong>
            <button className="ghost icon-btn" aria-label="ガイドを閉じる" onClick={v.dismissGuide}>
              ✕
            </button>
          </div>
          <ol className="guide-steps">
            <li>この「事業」タブで<strong>価格・仕入・生産</strong>などを決めます（まずは初期値のままでOK）。</li>
            <li>下の<strong>「この判断で1期すすめる ▶」</strong>を押すと1ヶ月が経過します。</li>
            <li>
              結果は<strong>「財務」タブ</strong>の三表（BS・PL・CF）に反映されます。
              <strong>倒産せず純資産（黒字）を増やす</strong>のが目標です。
            </li>
          </ol>
        </section>
      )}
      <section className="product">
        <h2>製品・原材料の状態</h2>
        <div className="product-grid">
          <div className="metric">
            <div className="metric-value">{yen(v.spotCost)}</div>
            <div className="metric-label">
              原材料スポット単価/個
              {(params.productLines?.length ?? 0) > 1
                ? `（${params.productLines![0].name}。他ラインは下表）`
                : `（基準 ${yen(params.unitVariableCost)}）`}
            </div>
          </div>
          <div className="metric">
            <div className="metric-value">{game.current.materialIndex.toFixed(2)}</div>
            <div className="metric-label">原材料価格指数（1.0=基準）</div>
          </div>
          <div className="metric">
            <div className="metric-value">{num(game.current.materialUnits)}個</div>
            <div className="metric-label">原材料 在庫</div>
          </div>
          <div className="metric">
            <div className="metric-value">{num(game.current.finishedUnits)}個</div>
            <div className="metric-label">製品 在庫</div>
          </div>
          <div className="metric">
            <div className="metric-value">
              {Number.isFinite(v.capacity) ? `${num(v.capacity)}/月` : '無制限'}
            </div>
            <div className="metric-label">
              {v.capacityLabel}
              {v.hasLabor && Number.isFinite(v.capacity) && (
                <>（{v.labCapacity <= v.equipCapacity ? '人手' : v.equipmentLabel}が制約）</>
              )}
            </div>
          </div>
          {v.hasLabor && (
            <div className="metric">
              <div className={`metric-value ${preview.attritionQuits > 0 ? 'ng' : ''}`}>
                {num(v.headcount)}人{preview.attritionQuits > 0 ? ` −${preview.attritionQuits}` : ''}
              </div>
              <div className="metric-label">
                従業員（労働能力 {Number.isFinite(v.labCapacity) ? `${num(v.labCapacity)}/月` : '—'}・設備{' '}
                {Number.isFinite(v.equipCapacity) ? `${num(v.equipCapacity)}/月` : '無制限'}）
                {preview.attritionQuits > 0 && (
                  <span className="ng"> ／ 待遇悪化で {preview.attritionQuits}人 離職見込</span>
                )}
              </div>
            </div>
          )}
          <div className="metric">
            <div className="metric-value">−{pct(1 - product.unitCostModifier)} / +{pct(product.demandModifier - 1)}</div>
            <div className="metric-label">R&D 原価減 / 需要増</div>
          </div>
          <div className="metric">
            <div className="metric-value">{yen(game.current.rdStock)}</div>
            <div className="metric-label">累積R&D投資</div>
          </div>
          {params.conditionDecay != null && (
            <div className="metric">
              <div className={`metric-value ${(game.current.condition ?? 1) >= 0.6 ? 'ok' : 'ng'}`}>
                {pct(game.current.condition ?? 1)}
              </div>
              <div className="metric-label">設備の整備状態（保全費で維持・故障率に直結）</div>
            </div>
          )}
        </div>
        {(params.productLines?.length ?? 0) > 1 && game.current.lines && (
          <div className="table-scroll">
            <table className="history">
              <thead>
                <tr>
                  <th>ライン</th>
                  <th className="r">仕入単価</th>
                  <th className="r">原材料 在庫</th>
                  <th className="r">製品 在庫</th>
                  <th className="r">累積R&D</th>
                </tr>
              </thead>
              <tbody>
                {params.productLines!.map((lp, i) => {
                  const l = game.current.lines![i]
                  if (!l) return null
                  return (
                    <tr key={lp.id}>
                      <td>{lp.name}</td>
                      <td className="r">{yen(preview.lineResults[i]?.effectiveUnitCost ?? lp.unitVariableCost)}</td>
                      <td className="r">{num(l.materialUnits)}個</td>
                      <td className="r">{num(l.finishedUnits)}個</td>
                      <td className="r">{yen(l.rdStock)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">
          原材料を仕入れて在庫し、生産で製品へ。原材料価格は市況で変動（安い時に仕込むと有利）。
          研究開発は実効原価を下げ需要を上げます（逓減・翌期以降に反映）。
        </p>
      </section>

      <DecisionPanel
        decision={decision}
        onChange={patch}
        onPlay={() => play(decision)}
        disabled={gameOver}
        materialUnitCost={v.spotCost}
        enabled={scenario.enabledDecisions}
        creditGrade={v.credit.grade}
        borrowLimit={v.credit.borrowLimit}
        effectiveRate={v.effectiveRate}
        capacity={preview.capacity}
        capacityLabel={v.capacityLabel}
        equipmentLabel={v.equipmentLabel}
        insuranceRefCost={params.insuranceRefCost}
        maxInsuranceCoverage={params.maxInsuranceCoverage}
        maintenanceRefCost={params.maintenanceRefCost}
        maxMaintenanceReduction={params.maxMaintenanceReduction}
        wage={params.wage}
        hireCost={params.hireCost}
        severance={params.severance}
        headcount={v.headcount}
        inflationIndex={game.macro.inflationIndex}
        attritionSlope={params.attritionSlope}
        maxAttrition={params.maxAttrition}
        equity={v.equity}
        sharesOutstanding={game.current.sharesOutstanding}
        equityIssueCap={v.equityIssueCap}
        dividendCap={v.dividendCap}
        productLines={params.productLines}
        warnings={v.warnings}
      />

      {v.ipoAllowed && !gameOver && (
        <section className="panel">
          <h2>
            🏛 上場（IPO） <InfoTip term="上場（IPO）" />
          </h2>
          <p className="muted small">
            時価総額（年間純利益×PER{params.earningsMultiple ?? '—'}）:{' '}
            <strong>{v.ipoVal > 0 ? yen(v.ipoVal) : '—（直近1年が赤字のため算定不可）'}</strong>。 公募で大型調達ができ、
            知名度で需要も伸びますが、上場維持コストと希薄化を伴います。
          </p>
          {v.ipoGate.ok ? (
            <div className="actions">
              <button onClick={v.openIpo}>上場を検討する ▶</button>
            </div>
          ) : (
            <ul className="diagnosis-points muted small">
              {v.ipoGate.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {v.maAllowed && !gameOver && (
        <section className="panel">
          <h2>
            🤝 競合の買収（M&A） <InfoTip term="のれん" />
          </h2>
          <p className="muted small">
            ライバル企業を買収すると、シェアの取り合いが消え、設備 {yen(params.acqTargetNetAssets ?? 0)}・
            従業員 {num(params.acqTargetHeadcount ?? 0)}人・顧客基盤（需要 +
            {pct(params.acqTargetDemandBoost ?? 0)}）を受け入れます。 対価が受入純資産を上回る分は
            <strong>のれん</strong>として資産計上し、毎期償却します。
          </p>
          <div className="actions">
            <button onClick={v.openMa}>買収を検討する ▶</button>
          </div>
        </section>
      )}

      {!gameOver && (
        <ForecastPanel preview={preview} decision={decision} demandNoise={params.demandNoise ?? 0} />
      )}
    </div>
  )
}
