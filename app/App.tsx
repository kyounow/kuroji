import { useEffect, useState } from 'react'
import type { Decision } from '@core/index'
import { totalEquity, productFromRd } from '@core/index'
import { useGame } from './state'
import { EventBanner } from './components/EventBanner'
import { DecisionPanel } from './components/DecisionPanel'
import { StatementsView } from './components/StatementsView'
import { RatiosView } from './components/RatiosView'
import { HistoryTable } from './components/HistoryTable'
import { HistoryChart } from './components/HistoryChart'
import { yen, yenSigned, pct, num } from './format'

export function App() {
  const { game, scenario, play, reset, upcomingEvent } = useGame()

  const [decision, setDecision] = useState<Decision>({
    unitPrice: scenario.params.basePrice,
    purchaseMaterials: scenario.params.baseDemand,
    produceUnits: scenario.params.baseDemand,
    marketingSpend: 0,
    rdSpend: 0,
    capitalExpenditure: 0,
    financing: 0,
  })
  const patch = (p: Partial<Decision>) => setDecision((d) => ({ ...d, ...p }))

  // 表示中の期（既定は最新。過去の期をクリックすると切り替わる）。
  const [selectedTurn, setSelectedTurn] = useState(0)
  useEffect(() => {
    setSelectedTurn(game.history.length)
  }, [game.history.length])
  const selected = selectedTurn > 0 ? game.history[selectedTurn - 1] : null

  const equity = totalEquity(game.current.balanceSheet)
  const startEquity = totalEquity(scenario.initialState.balanceSheet)

  // 現在の累積R&Dから決まる製品パラメータ（次の期に適用される）。
  const product = productFromRd(game.current.rdStock, scenario.params)
  // 当期の原材料スポット単価（市況指数 × R&D 原価改善）。
  const spotCost = Math.round(
    scenario.params.unitVariableCost * game.current.materialIndex * product.unitCostModifier,
  )

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
          <span className="status-num">第 {game.current.turn + 1} 期</span>
          <span className="muted">の経営判断</span>
        </div>
        <div>
          <span className="muted">純資産</span> <span className="status-num">{yen(equity)}</span>{' '}
          <span className={equity - startEquity >= 0 ? 'ok' : 'ng'}>
            （開始比 {yenSigned(equity - startEquity)}）
          </span>
        </div>
      </section>

      {game.gameOver && (
        <div className="gameover">
          <strong>倒産しました。</strong> 現金がマイナス、または債務超過になりました。
          「最初からやり直す」で再挑戦できます。
        </div>
      )}

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

      <DecisionPanel
        decision={decision}
        onChange={patch}
        onPlay={() => play(decision)}
        onReset={reset}
        disabled={game.gameOver}
        materialUnitCost={spotCost}
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
