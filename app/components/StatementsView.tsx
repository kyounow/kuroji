import {
  totalAssets,
  totalLiabilities,
  totalEquity,
  type CompanyState,
} from '@core/index'
import type { TurnRecord } from '../state'
import { yen } from '../format'

interface Props {
  state: CompanyState
  last: TurnRecord | null
}

function Row({ label, value, kind }: { label: string; value: number; kind?: 'sub' | 'total' }) {
  return (
    <tr className={kind}>
      <th>{label}</th>
      <td>{yen(value)}</td>
    </tr>
  )
}

/** 財務三表（B/S は現在の期末、P/L・C/F は直近に確定した期）。 */
export function StatementsView({ state, last }: Props) {
  const bs = state.balanceSheet
  const currentAssets =
    bs.currentAssets.cash + bs.currentAssets.accountsReceivable + bs.currentAssets.inventory
  const currentLiabilities =
    bs.currentLiabilities.accountsPayable + bs.currentLiabilities.shortTermDebt

  return (
    <div className="grid">
      {/* 貸借対照表 */}
      <div className="card">
        <h3>貸借対照表（B/S）{state.turn > 0 ? `第${state.turn}期末` : '期首'}</h3>
        <table>
          <tbody>
            <tr className="section"><th colSpan={2}>資産の部</th></tr>
            <Row label="現金" value={bs.currentAssets.cash} />
            <Row label="売掛金" value={bs.currentAssets.accountsReceivable} />
            <Row label="在庫" value={bs.currentAssets.inventory} />
            <Row label="流動資産 計" value={currentAssets} kind="sub" />
            <Row label="設備（簿価）" value={bs.fixedAssets.equipment} />
            <Row label="資産合計" value={totalAssets(bs)} kind="total" />
            <tr className="section"><th colSpan={2}>負債・純資産の部</th></tr>
            <Row label="買掛金" value={bs.currentLiabilities.accountsPayable} />
            <Row label="短期借入" value={bs.currentLiabilities.shortTermDebt} />
            <Row label="流動負債 計" value={currentLiabilities} kind="sub" />
            <Row label="長期借入" value={bs.nonCurrentLiabilities.longTermDebt} />
            <Row label="負債合計" value={totalLiabilities(bs)} kind="sub" />
            <Row label="資本金" value={bs.equity.capitalStock} />
            <Row label="利益剰余金" value={bs.equity.retainedEarnings} />
            <Row label="純資産合計" value={totalEquity(bs)} kind="sub" />
            <Row label="負債・純資産合計" value={totalLiabilities(bs) + totalEquity(bs)} kind="total" />
          </tbody>
        </table>
      </div>

      {/* 損益計算書 */}
      <div className="card">
        <h3>損益計算書（P/L）{last ? `第${last.turn}期` : ''}</h3>
        {last ? (
          <table>
            <tbody>
              <Row label="売上高" value={last.incomeStatement.revenue} />
              <Row label="売上原価" value={last.incomeStatement.costOfGoodsSold} />
              <Row label="売上総利益" value={last.incomeStatement.grossProfit} kind="sub" />
              <Row label="販管費（含 減価償却・販促）" value={last.incomeStatement.operatingExpenses} />
              <Row label="営業利益" value={last.incomeStatement.operatingIncome} kind="sub" />
              <Row label="支払利息" value={last.incomeStatement.interestExpense} />
              <Row label="税引前利益" value={last.incomeStatement.pretaxIncome} kind="sub" />
              <Row label="法人税等" value={last.incomeStatement.tax} />
              <tr className={last.incomeStatement.netIncome >= 0 ? 'total ok' : 'total ng'}>
                <th>当期純利益</th>
                <td>{yen(last.incomeStatement.netIncome)}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="muted">まだ1期も経営していません。判断を入力して進めてください。</p>
        )}
      </div>

      {/* キャッシュ・フロー */}
      <div className="card">
        <h3>キャッシュ・フロー（C/F）{last ? `第${last.turn}期` : ''}</h3>
        {last ? (
          <table>
            <tbody>
              <Row label="営業活動 CF" value={last.cashFlow.operating} />
              <Row label="投資活動 CF" value={last.cashFlow.investing} />
              <Row label="財務活動 CF" value={last.cashFlow.financing} />
              <Row label="現金純増減" value={last.cashFlow.netChange} kind="sub" />
              <Row label="期首現金" value={last.cashFlow.cashBegin} />
              <Row label="期末現金" value={last.cashFlow.cashEnd} kind="total" />
            </tbody>
          </table>
        ) : (
          <p className="muted">まだ1期も経営していません。</p>
        )}
      </div>
    </div>
  )
}
