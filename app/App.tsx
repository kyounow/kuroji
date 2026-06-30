import { useEffect, useMemo, useState } from 'react'
import type { Decision } from '@core/index'
import { totalEquity, productFromRd, scoreGame, assessCredit, competitorAt, marketShare } from '@core/index'
import { useGame } from './state'
import { EventBanner } from './components/EventBanner'
import { DecisionPanel } from './components/DecisionPanel'
import { StatementsView } from './components/StatementsView'
import { RatiosView } from './components/RatiosView'
import { HistoryTable } from './components/HistoryTable'
import { HistoryChart } from './components/HistoryChart'
import { ScoreCard } from './components/ScoreCard'
import { loadBest, saveBest } from './storage'
import { yen, yenSigned, pct, num } from './format'

export function App() {
  const { game, scenario, play, reset, selectScenario, scenarios, upcomingEvent } = useGame()
  const gameOver = game.outcome !== 'playing'

  const [decision, setDecision] = useState<Decision>({
    unitPrice: scenario.params.basePrice,
    purchaseMaterials: Math.round(scenario.params.baseDemand / (scenario.params.periodsPerYear ?? 1)),
    produceUnits: Math.round(scenario.params.baseDemand / (scenario.params.periodsPerYear ?? 1)),
    marketingSpend: 0,
    rdSpend: 0,
    insuranceSpend: 0,
    capitalExpenditure: 0,
    financing: 0,
  })
  const patch = (p: Partial<Decision>) => setDecision((d) => ({ ...d, ...p }))

  // シナリオを切り替えたら判断の初期値もそのシナリオ向けに戻す。
  useEffect(() => {
    setDecision({
      unitPrice: scenario.params.basePrice,
      purchaseMaterials: Math.round(scenario.params.baseDemand / (scenario.params.periodsPerYear ?? 1)),
      produceUnits: Math.round(scenario.params.baseDemand / (scenario.params.periodsPerYear ?? 1)),
      marketingSpend: 0,
      rdSpend: 0,
      insuranceSpend: 0,
      capitalExpenditure: 0,
      financing: 0,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.scenarioId])

  // 表示中の期（既定は最新。過去の期をクリックすると切り替わる）。
  const [selectedTurn, setSelectedTurn] = useState(0)
  useEffect(() => {
    setSelectedTurn(game.history.length)
  }, [game.history.length])
  const selected = selectedTurn > 0 ? game.history[selectedTurn - 1] : null

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
  // 当期の原材料スポット単価（市況指数 × R&D 原価改善）。
  const spotCost = Math.round(
    scenario.params.unitVariableCost * game.current.materialIndex * product.unitCostModifier,
  )

  // 信用力（格付け・実効金利・借入枠）。期首の財務状態で評価。
  const credit = assessCredit(game.current)
  const effectiveRate = scenario.params.interestRate + credit.spread

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

  // 競合・市場シェア（現在の販売価格・自社品質でのライブ試算）。
  const hasCompetitor = scenario.params.competitorStrength > 0
  const competitor = competitorAt(scenario.params, game.seed, game.current.turn)
  const ourShare = marketShare(decision.unitPrice, product.demandModifier, competitor, scenario.params)

  return (
    <main className="app">
      <header>
        <h1>kuroji — 会計で学ぶ経営シミュレーション</h1>
        <p className="lead">
          価格・生産・販促・投資・資金調達を決めて1期ずつ経営し、財務三表の動きを見ながら
          <strong>純資産（黒字）を増やす</strong>のが目標です。
        </p>
      </header>

      <section className="status">
        <div>
          <span className="status-num">{periodHeading}</span>
          <span className="muted">の経営判断</span>
          {scenario.turnLimit && (
            <span className="muted small">
              （全{scenario.turnLimit}{unitName}・約{Math.round(scenario.turnLimit / ppy)}年）
            </span>
          )}
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
        <label className="scenario-select">
          <span className="muted small">シナリオ</span>
          <select
            value={game.scenarioId}
            onChange={(e) => selectScenario(e.target.value)}
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </section>

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

      <EventBanner event={upcomingEvent} />

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
            <div className="metric-value">−{pct(1 - product.unitCostModifier)} / +{pct(product.demandModifier - 1)}</div>
            <div className="metric-label">R&D 原価減 / 需要増</div>
          </div>
          <div className="metric">
            <div className="metric-value">{yen(game.current.rdStock)}</div>
            <div className="metric-label">累積R&D投資</div>
          </div>
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
        onReset={reset}
        disabled={gameOver}
        materialUnitCost={spotCost}
        enabled={scenario.enabledDecisions}
        creditGrade={credit.grade}
        borrowLimit={credit.borrowLimit}
        effectiveRate={effectiveRate}
      />

      <HistoryTable
        history={game.history}
        selectedTurn={selectedTurn}
        onSelect={setSelectedTurn}
      />

      <RatiosView ratios={selected ? selected.ratios : null} turn={selected?.turn} />

      <StatementsView state={selected ? selected.stateAfter : game.current} last={selected} />

      <HistoryChart initial={scenario.initialState} history={game.history} />

      <footer className="muted small">
        ※ 学習用の簡略モデルです。会計実務や実在企業の財務再現ではありません。
      </footer>
    </main>
  )
}
