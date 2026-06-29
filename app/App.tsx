import { useEffect, useState } from 'react'
import type { Decision } from '@core/index'
import { totalEquity } from '@core/index'
import { useGame } from './state'
import { EventBanner } from './components/EventBanner'
import { DecisionPanel } from './components/DecisionPanel'
import { StatementsView } from './components/StatementsView'
import { RatiosView } from './components/RatiosView'
import { HistoryTable } from './components/HistoryTable'
import { HistoryChart } from './components/HistoryChart'
import { yen, yenSigned } from './format'

export function App() {
  const { game, scenario, play, reset, upcomingEvent } = useGame()

  const [decision, setDecision] = useState<Decision>({
    unitPrice: scenario.params.basePrice,
    produceUnits: scenario.params.baseDemand,
    marketingSpend: 0,
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

      <DecisionPanel
        decision={decision}
        onChange={patch}
        onPlay={() => play(decision)}
        onReset={reset}
        disabled={game.gameOver}
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
