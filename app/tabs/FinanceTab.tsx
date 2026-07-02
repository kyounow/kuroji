import { useGameView } from '../GameViewContext'
import { HistoryTable } from '../components/HistoryTable'
import { RatiosView } from '../components/RatiosView'
import { LinkageExplainer } from '../components/LinkageExplainer'
import { CapitalPanel } from '../components/CapitalPanel'
import { StatementsView } from '../components/StatementsView'
import { HistoryChart } from '../components/HistoryChart'
import { BadgesPanel } from '../components/BadgesPanel'

/** 財務タブ: 履歴・指標・三表のつながり・資本・三表・推移グラフ・実績バッジ。 */
export function FinanceTab() {
  const v = useGameView()
  const { game, scenario, ppy, selected } = v
  const shares = game.current.sharesOutstanding

  return (
    <div role="tabpanel" id="panel-finance" aria-labelledby="tab-finance">
      <HistoryTable
        history={game.history}
        selectedTurn={v.selectedTurn}
        onSelect={v.setSelectedTurn}
        periodsPerYear={ppy}
      />

      <RatiosView ratios={selected ? selected.ratios : null} turn={selected?.turn} periodsPerYear={ppy} />

      {selected && <LinkageExplainer record={selected} />}

      {shares != null && shares > 0 && (
        <CapitalPanel
          sharesOutstanding={shares}
          equity={v.equity}
          lastNetIncome={
            game.history.length > 0 ? game.history[game.history.length - 1].incomeStatement.netIncome : null
          }
          listed={game.current.listed === true}
          marketCap={v.ipoVal}
          lastDividendPaid={
            game.history.length > 0 ? game.history[game.history.length - 1].dividendPaid : undefined
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

      <BadgesPanel earned={v.earnedBadges} />
    </div>
  )
}
