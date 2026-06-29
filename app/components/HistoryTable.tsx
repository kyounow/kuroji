import { totalEquity } from '@core/index'
import type { TurnRecord } from '../state'
import { yen } from '../format'

interface Props {
  history: TurnRecord[]
  selectedTurn: number
  onSelect: (turn: number) => void
}

/** 各期の主要数字を一覧表示。行をクリックするとその期の詳細（三表・指標）を表示する。 */
export function HistoryTable({ history, selectedTurn, onSelect }: Props) {
  if (history.length === 0) {
    return (
      <section className="panel">
        <h2>各期の履歴</h2>
        <p className="muted">1期以上進めると、各期の数字が一覧表示されます。</p>
      </section>
    )
  }

  return (
    <section className="panel">
      <h2>各期の履歴</h2>
      <p className="muted small">行をクリックすると、その期の財務三表・指標を下に表示します。</p>
      <div className="table-scroll">
        <table className="history">
          <thead>
            <tr>
              <th>期</th>
              <th>市況</th>
              <th className="r">売上高</th>
              <th className="r">営業利益</th>
              <th className="r">当期純利益</th>
              <th className="r">営業CF</th>
              <th className="r">期末現金</th>
              <th className="r">純資産</th>
            </tr>
          </thead>
          <tbody>
            {history.map((rec) => {
              const equity = totalEquity(rec.stateAfter.balanceSheet)
              const cash = rec.stateAfter.balanceSheet.currentAssets.cash
              return (
                <tr
                  key={rec.turn}
                  className={rec.turn === selectedTurn ? 'selected' : ''}
                  onClick={() => onSelect(rec.turn)}
                >
                  <td>第{rec.turn}期</td>
                  <td>{rec.event.label}</td>
                  <td className="r">{yen(rec.incomeStatement.revenue)}</td>
                  <td className="r">{yen(rec.incomeStatement.operatingIncome)}</td>
                  <td className={`r ${rec.incomeStatement.netIncome >= 0 ? 'ok' : 'ng'}`}>
                    {yen(rec.incomeStatement.netIncome)}
                  </td>
                  <td className={`r ${rec.cashFlow.operating >= 0 ? '' : 'ng'}`}>
                    {yen(rec.cashFlow.operating)}
                  </td>
                  <td className={`r ${cash >= 0 ? '' : 'ng'}`}>{yen(cash)}</td>
                  <td className="r">{yen(equity)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
