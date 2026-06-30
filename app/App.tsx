import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Decision } from '@core/index'
import {
  totalEquity,
  productFromRd,
  scoreGame,
  assessCredit,
  competitorAt,
  marketShare,
  productionCapacity,
  laborCapacity,
  costEfficiency,
} from '@core/index'
import { useGame, previewTurn, shockRiskFor } from './state'
import { EventBanner } from './components/EventBanner'
import { DecisionPanel } from './components/DecisionPanel'
import { StatementsView } from './components/StatementsView'
import { RatiosView } from './components/RatiosView'
import { HistoryTable } from './components/HistoryTable'
import { HistoryChart } from './components/HistoryChart'
import { MacroPanel } from './components/MacroPanel'
import { ForecastPanel } from './components/ForecastPanel'
import { CapitalPanel } from './components/CapitalPanel'
import { ScoreCard } from './components/ScoreCard'
import { SettingsModal } from './components/SettingsModal'
import { loadBest, saveBest } from './storage'
import { yen, yenSigned, pct, num } from './format'

export function App() {
  const { game, scenario, play, reset, newGame, scenarios, modes, upcomingEvent } = useGame()
  const gameOver = game.outcome !== 'playing'

  // ゲーム設定（シナリオ・モード）のポップアップ。新規（履歴なし）の起動時は自動で開く。
  const [settingsOpen, setSettingsOpen] = useState(
    () => game.history.length === 0 && game.current.turn === 0,
  )
  const currentModeName = modes.find((m) => m.id === game.mode)?.name ?? game.mode

  const [decision, setDecision] = useState<Decision>({
    unitPrice: scenario.params.basePrice,
    purchaseMaterials: Math.round(scenario.params.baseDemand / (scenario.params.periodsPerYear ?? 1)),
    produceUnits: Math.round(scenario.params.baseDemand / (scenario.params.periodsPerYear ?? 1)),
    marketingSpend: 0,
    rdSpend: 0,
    insuranceSpend: 0,
    maintenanceSpend: 0,
    capitalExpenditure: 0,
    hire: 0,
    fire: 0,
    wageLevel: 100,
    equityIssuance: 0,
    financing: 0,
  })
  const patch = useCallback((p: Partial<Decision>) => setDecision((d) => ({ ...d, ...p })), [])

  // シナリオを切り替えたら判断の初期値もそのシナリオ向けに戻す。
  useEffect(() => {
    setDecision({
      unitPrice: scenario.params.basePrice,
      purchaseMaterials: Math.round(scenario.params.baseDemand / (scenario.params.periodsPerYear ?? 1)),
      produceUnits: Math.round(scenario.params.baseDemand / (scenario.params.periodsPerYear ?? 1)),
      marketingSpend: 0,
      rdSpend: 0,
      insuranceSpend: 0,
      maintenanceSpend: 0,
      capitalExpenditure: 0,
      hire: 0,
      fire: 0,
      wageLevel: 100,
      equityIssuance: 0,
      financing: 0,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.scenarioId])

  // 表示中の期（既定は最新。過去の期をクリックすると切り替わる）。
  const [selectedTurn, setSelectedTurn] = useState(0)
  useEffect(() => {
    setSelectedTurn(game.history.length)
  }, [game.history.length])
  const selected = useMemo(
    () => (selectedTurn > 0 ? game.history[selectedTurn - 1] : null),
    [game.history, selectedTurn],
  )

  const equity = totalEquity(game.current.balanceSheet)
  const startEquity = totalEquity(scenario.initialState.balanceSheet)

  // 期末スコア（ゲーム終了時のみ）。
  const score = useMemo(() => {
    if (!gameOver || game.history.length === 0) return null
    return scoreGame({
      startEquity,
      endEquity: equity,
      finalRatios: game.history[game.history.length - 1].ratios,
      roeHistory: game.history.map((h) => h.ratios.roe),
      won: game.outcome === 'won',
      turnsUsed: game.current.turn,
      turnLimit: scenario.turnLimit ?? game.current.turn,
    })
  }, [gameOver, game.history, game.outcome, game.current.turn, scenario.turnLimit, startEquity, equity])

  // ベストスコア（シナリオごと）。終了時に保存。
  const [best, setBest] = useState<number | null>(null)
  useEffect(() => {
    setBest(loadBest(game.scenarioId))
  }, [game.scenarioId])
  useEffect(() => {
    if (gameOver && score) setBest(saveBest(game.scenarioId, score.total))
  }, [gameOver, score, game.scenarioId])

  // 現在の累積R&Dから決まる製品パラメータ（次の期に適用される）。
  const product = productFromRd(game.current.rdStock, scenario.params)
  // 当期の原材料スポット単価（市況指数 × R&D 原価改善 × 設備の規模の経済）。
  const spotCost = Math.round(
    scenario.params.unitVariableCost *
      game.current.materialIndex *
      product.unitCostModifier *
      costEfficiency(game.current.balanceSheet.fixedAssets.equipment, scenario.params),
  )

  // 信用力（格付け・実効金利・借入枠）。実効金利＝政策金利＋スプレッド＋信用スプレッド。
  const credit = assessCredit(game.current)
  const effectiveRate = game.macro.policyRate + scenario.params.interestRate + credit.spread

  // ターンの呼称（四半期 / 月次 / 年次）。
  const ppy = scenario.params.periodsPerYear ?? 1
  const yearNo = Math.floor(game.current.turn / ppy) + 1
  const subNo = (game.current.turn % ppy) + 1
  const periodHeading =
    ppy === 4
      ? `${yearNo}年目 第${subNo}四半期`
      : ppy === 12
        ? `${yearNo}年目 ${subNo}ヶ月目`
        : `第 ${game.current.turn + 1} 期`
  const unitName = ppy === 4 ? '四半期' : ppy === 12 ? 'ヶ月' : '期'

  // 生産能力＝設備能力と労働能力の小さい方（設備か人手のボトルネック）。
  const equipCapacity = productionCapacity(
    game.current.balanceSheet.fixedAssets.equipment,
    scenario.params,
    1 / ppy,
  )
  const headcount = game.current.headcount ?? 0
  const labCapacity = laborCapacity(headcount, scenario.params, 1 / ppy)
  const capacity = Math.min(equipCapacity, labCapacity)
  const hasLabor = scenario.params.wage != null
  const equipmentLabel = scenario.params.equipmentLabel ?? '設備'
  const capacityLabel = scenario.params.capacityLabel ?? '生産能力'

  // 競合・市場シェア（現在の販売価格・自社品質でのライブ試算）。
  const hasCompetitor = scenario.params.competitorStrength > 0
  const competitor = competitorAt(scenario.params, game.seed, game.current.turn)
  const ourShare = marketShare(decision.unitPrice, product.demandModifier, competitor, scenario.params)

  // 今期の確定前プレビュー（この判断の見込み結果。原価率・損益分岐の算出に使う）。
  const preview = useMemo(() => previewTurn(game, decision), [game, decision])

  // 次の期のショック発生確率リスク（保全水準/品質で低下）。
  const shockRisk = useMemo(() => shockRiskFor(game), [game])

  return (
    <main className="app">
      <header className="topbar">
        <div className="topbar-title">
          <h1>kuroji</h1>
          <span className="muted small">会計で学ぶ経営シミュレーション</span>
        </div>
        <div className="topbar-actions">
          <button className="ghost" onClick={() => setSettingsOpen(true)}>
            ⚙ 設定
          </button>
          <button className="ghost" onClick={reset}>
            ↻ 最初からやり直す
          </button>
        </div>
      </header>
      <p className="lead">
        価格・生産・販促・投資・資金調達を決めて1期ずつ経営し、財務三表の動きを見ながら
        <strong>純資産（黒字）を増やす</strong>のが目標です。
      </p>

      <section className="status">
        <div>
          <span className="status-num">{periodHeading}</span>
          <span className="muted">の経営判断</span>
          {game.mode === 'challenge' && scenario.turnLimit ? (
            <span className="muted small">
              （全{scenario.turnLimit}{unitName}・約{Math.round(scenario.turnLimit / ppy)}年）
            </span>
          ) : game.mode === 'endless' ? (
            <span className="muted small">（エンドレス・最大100年）</span>
          ) : null}
        </div>
        <div>
          <span className="muted">純資産</span> <span className="status-num">{yen(equity)}</span>{' '}
          <span className={equity - startEquity >= 0 ? 'ok' : 'ng'}>
            （開始比 {yenSigned(equity - startEquity)}）
          </span>
        </div>
        <div>
          <span className="muted small">信用格付</span>{' '}
          <span className={`credit-grade grade-${credit.grade}`}>{credit.grade}</span>{' '}
          <span className="muted small">金利 {pct(effectiveRate)}</span>
        </div>
        <div>
          <span className="muted small">シナリオ</span> <span>{scenario.name}</span>
          <span className="muted small"> ／ {currentModeName}</span>{' '}
          <button className="link-btn" onClick={() => setSettingsOpen(true)}>
            変更
          </button>
        </div>
      </section>

      {game.mode === 'endless' && game.goalAchieved && !gameOver && (
        <div className="gameover won">
          <strong>🏆 マイルストーン達成！</strong> {game.goalStatus?.label}。このまま経営を続けられます。
        </div>
      )}

      {game.goalStatus && (
        <section className={`goal ${game.goalStatus.status}`}>
          <div className="goal-head">
            <strong>🎯 目標: {game.goalStatus.label}</strong>
            <span className="muted small">{game.goalStatus.detail}</span>
          </div>
          <div className="goal-bar">
            <div
              className="goal-fill"
              style={{ width: `${Math.round(game.goalStatus.progress * 100)}%` }}
            />
          </div>
        </section>
      )}

      {gameOver && (
        <div className={`gameover ${game.outcome}`}>
          {game.outcome === 'won' ? (
            <>
              <strong>🎉 目標達成・クリア！</strong> {game.goalStatus?.detail}。
              「最初からやり直す」で再挑戦、または別シナリオへ。
            </>
          ) : (
            <>
              <strong>💀 ゲームオーバー。</strong>{' '}
              {game.goalStatus?.detail ?? '現金がマイナス、または債務超過になりました'}。
              「最初からやり直す」で再挑戦できます。
            </>
          )}
        </div>
      )}

      {gameOver && score && <ScoreCard score={score} best={best} won={game.outcome === 'won'} />}

      <EventBanner
        event={upcomingEvent}
        insuranceCoverage={preview.insuranceCoverage}
        shockOneOffLoss={preview.shockOneOffLoss}
        shockEquipmentWritedown={preview.shockEquipmentWritedown}
        shockRisk={shockRisk}
      />

      <MacroPanel macro={game.macro} effectiveRate={effectiveRate} />

      <section className="product">
        <h2>製品・原材料の状態</h2>
        <div className="product-grid">
          <div className="metric">
            <div className="metric-value">{yen(spotCost)}</div>
            <div className="metric-label">原材料スポット単価/個（基準 {yen(scenario.params.unitVariableCost)}）</div>
          </div>
          <div className="metric">
            <div className="metric-value">{(game.current.materialIndex).toFixed(2)}</div>
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
              {Number.isFinite(capacity) ? `${num(capacity)}/月` : '無制限'}
            </div>
            <div className="metric-label">
              {capacityLabel}
              {hasLabor && Number.isFinite(capacity) && (
                <>（{labCapacity <= equipCapacity ? '人手' : equipmentLabel}が制約）</>
              )}
            </div>
          </div>
          {hasLabor && (
            <div className="metric">
              <div className={`metric-value ${preview.attritionQuits > 0 ? 'ng' : ''}`}>
                {num(headcount)}人{preview.attritionQuits > 0 ? ` −${preview.attritionQuits}` : ''}
              </div>
              <div className="metric-label">
                従業員（労働能力 {Number.isFinite(labCapacity) ? `${num(labCapacity)}/月` : '—'}・設備{' '}
                {Number.isFinite(equipCapacity) ? `${num(equipCapacity)}/月` : '無制限'}）
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
          {scenario.params.conditionDecay != null && (
            <div className="metric">
              <div className={`metric-value ${(game.current.condition ?? 1) >= 0.6 ? 'ok' : 'ng'}`}>
                {pct(game.current.condition ?? 1)}
              </div>
              <div className="metric-label">設備の整備状態（保全費で維持・故障率に直結）</div>
            </div>
          )}
        </div>
        <p className="muted small">
          原材料を仕入れて在庫し、生産で製品へ。原材料価格は市況で変動（安い時に仕込むと有利）。
          研究開発は実効原価を下げ需要を上げます（逓減・翌期以降に反映）。
        </p>
      </section>

      {hasCompetitor && (
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
              <div className={`metric-value ${ourShare >= 0.5 ? 'ok' : 'ng'}`}>{pct(ourShare)}</div>
              <div className="metric-label">自社シェア（この価格での試算）</div>
            </div>
          </div>
          <p className="muted small">
            シェアは「価格あたり品質」で競合と取り合います。値下げや研究開発（品質）でシェアが伸び、需要に反映されます。
          </p>
        </section>
      )}

      <DecisionPanel
        decision={decision}
        onChange={patch}
        onPlay={() => play(decision)}
        disabled={gameOver}
        materialUnitCost={spotCost}
        enabled={scenario.enabledDecisions}
        creditGrade={credit.grade}
        borrowLimit={credit.borrowLimit}
        effectiveRate={effectiveRate}
        capacity={preview.capacity}
        capacityLabel={capacityLabel}
        equipmentLabel={equipmentLabel}
        insuranceRefCost={scenario.params.insuranceRefCost}
        maxInsuranceCoverage={scenario.params.maxInsuranceCoverage}
        maintenanceRefCost={scenario.params.maintenanceRefCost}
        maxMaintenanceReduction={scenario.params.maxMaintenanceReduction}
        wage={scenario.params.wage}
        hireCost={scenario.params.hireCost}
        severance={scenario.params.severance}
        headcount={headcount}
        inflationIndex={game.macro.inflationIndex}
        attritionSlope={scenario.params.attritionSlope}
        maxAttrition={scenario.params.maxAttrition}
        equity={equity}
        sharesOutstanding={game.current.sharesOutstanding}
      />

      {!gameOver && (
        <ForecastPanel
          preview={preview}
          decision={decision}
          demandNoise={scenario.params.demandNoise ?? 0}
        />
      )}

      <HistoryTable
        history={game.history}
        selectedTurn={selectedTurn}
        onSelect={setSelectedTurn}
        periodsPerYear={ppy}
      />

      <RatiosView
        ratios={selected ? selected.ratios : null}
        turn={selected?.turn}
        periodsPerYear={ppy}
      />

      {game.current.sharesOutstanding != null && (
        <CapitalPanel
          sharesOutstanding={game.current.sharesOutstanding}
          equity={equity}
          lastNetIncome={
            game.history.length > 0
              ? game.history[game.history.length - 1].incomeStatement.netIncome
              : null
          }
        />
      )}

      <StatementsView
        state={selected ? selected.stateAfter : game.current}
        last={selected}
        periodsPerYear={ppy}
        history={game.history}
      />

      <HistoryChart initial={scenario.initialState} history={game.history} />

      <footer className="muted small">
        ※ 学習用の簡略モデルです。会計実務や実在企業の財務再現ではありません。
      </footer>

      {settingsOpen && (
        <SettingsModal
          scenarios={scenarios}
          modes={modes}
          currentScenarioId={game.scenarioId}
          currentMode={game.mode}
          hasProgress={game.history.length > 0}
          scenarioLocked={game.history.length > 0 && !gameOver}
          onStart={(scenarioId, mode) => {
            newGame(scenarioId, mode)
            setSettingsOpen(false)
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </main>
  )
}
