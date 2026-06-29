import { balances, totalAssets, totalLiabilities, totalEquity } from '@core/index'
import { getScenario } from '@data/scenarios'

const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`

export function App() {
  const scenario = getScenario('default')
  const bs = scenario.initialState.balanceSheet
  const ok = balances(bs)

  return (
    <main className="app">
      <header>
        <h1>kuroji — 会計で学ぶ経営シミュレーション</h1>
        <p className="lead">
          経営判断が財務諸表にどう反映されるかを体験しながら、黒字経営の戦略を学ぶゲームです。
          <br />
          <small>※ 現在は Phase 0（土台）。これから会計エンジンと UI を実装していきます。</small>
        </p>
      </header>

      <section>
        <h2>{scenario.name}</h2>
        <p>{scenario.description}</p>

        <h3>開始時の貸借対照表（B/S）</h3>
        <table className="bs">
          <tbody>
            <tr>
              <th>資産合計</th>
              <td>{yen(totalAssets(bs))}</td>
            </tr>
            <tr>
              <th>負債合計</th>
              <td>{yen(totalLiabilities(bs))}</td>
            </tr>
            <tr>
              <th>純資産合計</th>
              <td>{yen(totalEquity(bs))}</td>
            </tr>
          </tbody>
        </table>

        <p className={ok ? 'ok' : 'ng'}>
          会計恒等式（資産 = 負債 + 純資産）: {ok ? '✓ 成立' : '✗ 崩れています'}
        </p>
      </section>
    </main>
  )
}
