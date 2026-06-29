import { useMemo, useState } from 'react'
import {
  resolveTurn,
  computeRatios,
  balances,
  totalAssets,
  totalLiabilities,
  totalEquity,
  type CompanyState,
} from '@core/index'
import { getScenario } from '@data/scenarios'

const yen = (n: number) => `¥${Math.round(n).toLocaleString('ja-JP')}`
const pct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—')
const ratio = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '∞')

const scenario = getScenario('default')

export function App() {
  const [state, setState] = useState<CompanyState>(scenario.initialState)
  const [unitPrice, setUnitPrice] = useState(scenario.params.basePrice)

  // 直近ターンの結果プレビュー（この価格で1期回したらどうなるか）。
  const preview = useMemo(
    () => resolveTurn(state, { capitalExpenditure: 0, unitPrice, financing: 0 }, scenario.params),
    [state, unitPrice],
  )
  const pl = preview.incomeStatement
  const ratios = computeRatios(preview.state.balanceSheet, pl)
  const bs = state.balanceSheet

  const advance = () => setState(preview.state)
  const reset = () => {
    setState(scenario.initialState)
    setUnitPrice(scenario.params.basePrice)
  }

  return (
    <main className="app">
      <header>
        <h1>kuroji — 会計で学ぶ経営シミュレーション</h1>
        <p className="lead">
          価格を決めて1期を回すと、損益計算書・貸借対照表・キャッシュフローがどう動くかが分かります。
          <br />
          <small>※ Phase 1（会計エンジン）実装中。経営判断は価格のみ（投資・資金調達は今後追加）。</small>
        </p>
      </header>

      <section className="panel">
        <div className="row">
          <strong>第 {state.turn + 1} 期</strong>
          <label>
            販売価格: {yen(unitPrice)}
            <input
              type="range"
              min={500}
              max={5000}
              step={100}
              value={unitPrice}
              onChange={(e) => setUnitPrice(Number(e.target.value))}
            />
          </label>
          <span>想定販売数量: {preview.unitsSold.toLocaleString('ja-JP')} 個</span>
        </div>
        <div className="row">
          <button onClick={advance}>この価格で1期すすめる ▶</button>
          <button className="ghost" onClick={reset}>
            最初からやり直す
          </button>
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <h3>損益計算書（P/L）今期見込み</h3>
          <table>
            <tbody>
              <tr><th>売上高</th><td>{yen(pl.revenue)}</td></tr>
              <tr><th>売上原価</th><td>{yen(pl.costOfGoodsSold)}</td></tr>
              <tr className="sub"><th>売上総利益</th><td>{yen(pl.grossProfit)}</td></tr>
              <tr><th>販管費（含 減価償却）</th><td>{yen(pl.operatingExpenses)}</td></tr>
              <tr className="sub"><th>営業利益</th><td>{yen(pl.operatingIncome)}</td></tr>
              <tr><th>支払利息</th><td>{yen(pl.interestExpense)}</td></tr>
              <tr><th>法人税等</th><td>{yen(pl.tax)}</td></tr>
              <tr className={pl.netIncome >= 0 ? 'total ok' : 'total ng'}>
                <th>当期純利益</th><td>{yen(pl.netIncome)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>貸借対照表（B/S）期首</h3>
          <table>
            <tbody>
              <tr><th>資産合計</th><td>{yen(totalAssets(bs))}</td></tr>
              <tr><th>　うち現金</th><td>{yen(bs.currentAssets.cash)}</td></tr>
              <tr><th>負債合計</th><td>{yen(totalLiabilities(bs))}</td></tr>
              <tr><th>純資産合計</th><td>{yen(totalEquity(bs))}</td></tr>
            </tbody>
          </table>
          <p className={balances(bs) ? 'ok' : 'ng'}>
            会計恒等式: {balances(bs) ? '✓ 成立' : '✗ 崩れ'}
          </p>
        </div>

        <div className="card">
          <h3>経営指標（今期末見込み）</h3>
          <table>
            <tbody>
              <tr><th>流動比率</th><td>{ratio(ratios.currentRatio)}</td></tr>
              <tr><th>自己資本比率</th><td>{pct(ratios.equityRatio)}</td></tr>
              <tr><th>ROE</th><td>{pct(ratios.roe)}</td></tr>
              <tr><th>ROA</th><td>{pct(ratios.roa)}</td></tr>
              <tr><th>売上総利益率</th><td>{pct(ratios.grossMargin)}</td></tr>
              <tr><th>営業利益率</th><td>{pct(ratios.operatingMargin)}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
