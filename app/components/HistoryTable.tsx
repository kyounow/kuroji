import { memo, useState, Fragment } from 'react'
import { totalEquity } from '@core/index'
import type { TurnRecord } from '../state'
import { yen } from '../format'

interface Props {
  history: TurnRecord[]
  selectedTurn: number
  onSelect: (turn: number) => void
  /** 1年あたりのターン数（月次=12）。年度グループ化と月表記に使う。 */
  periodsPerYear: number
}

/** 直近で表示する年度数（古い年は折りたたみ表示）。 */
const MAX_YEARS = 12

const yearOf = (turn: number, ppy: number) => Math.floor((turn - 1) / ppy) + 1
const subOf = (turn: number, ppy: number) => ((turn - 1) % ppy) + 1
const subLabel = (turn: number, ppy: number) =>
  ppy === 12 ? `${subOf(turn, ppy)}月` : ppy === 4 ? `${subOf(turn, ppy)}Q` : ppy === 1 ? '通年' : `#${subOf(turn, ppy)}`

interface YearGroup {
  year: number
  records: TurnRecord[]
  revenue: number
  operatingIncome: number
  netIncome: number
  operatingCF: number
  endCash: number
  endEquity: number
}

/** 月次の履歴を年度ごとにまとめ、年間サマリー＋（展開時）月別行で見やすく表示する。 */
/** 履歴は game 依存のみ。判断入力では再renderしないよう memo 化（参照安定な props 前提）。 */
export const HistoryTable = memo(HistoryTableImpl)

function HistoryTableImpl({ history, selectedTurn, onSelect, periodsPerYear }: Props) {
  const ppy = periodsPerYear || 1
  const [openYears, setOpenYears] = useState<number[]>([])

  if (history.length === 0) {
    return (
      <section className="panel">
        <h2>経営の履歴</h2>
        <p className="muted">1ヶ月以上進めると、月別・年度別の数字が一覧表示されます。</p>
      </section>
    )
  }

  const latestTurn = history[history.length - 1].turn
  const latestYear = yearOf(latestTurn, ppy)
  const startYear = Math.max(1, latestYear - (MAX_YEARS - 1))

  // 直近 MAX_YEARS 年分を年度グループに集約。
  const groups: YearGroup[] = []
  for (const rec of history) {
    const y = yearOf(rec.turn, ppy)
    if (y < startYear) continue
    let g = groups.find((x) => x.year === y)
    if (!g) {
      g = { year: y, records: [], revenue: 0, operatingIncome: 0, netIncome: 0, operatingCF: 0, endCash: 0, endEquity: 0 }
      groups.push(g)
    }
    g.records.push(rec)
    g.revenue += rec.incomeStatement.revenue
    g.operatingIncome += rec.incomeStatement.operatingIncome
    g.netIncome += rec.incomeStatement.netIncome
    g.operatingCF += rec.cashFlow.operating
    g.endCash = rec.stateAfter.balanceSheet.currentAssets.cash
    g.endEquity = totalEquity(rec.stateAfter.balanceSheet)
  }

  const isOpen = (year: number) => year === latestYear || openYears.includes(year)
  const toggle = (year: number) => {
    if (year === latestYear) return // 最新年は常に展開
    setOpenYears((ys) => (ys.includes(year) ? ys.filter((y) => y !== year) : [...ys, year]))
  }
  const money = (v: number, sign = false) => (
    <span className={v >= 0 ? (sign ? 'ok' : '') : 'ng'}>{yen(v)}</span>
  )

  return (
    <section className="panel">
      <h2>経営の履歴（年度別）</h2>
      <p className="muted small">
        年度の行をクリックで月別を開閉、月の行をクリックでその月の財務三表・指標を表示します。
        {latestYear > MAX_YEARS && `（直近${MAX_YEARS}年分）`}
      </p>
      <div className="table-scroll">
        <table className="history">
          <thead>
            <tr>
              <th>期間</th>
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
            {groups.map((g) => {
              const open = isOpen(g.year)
              return (
                <Fragment key={`y${g.year}`}>
                  <tr
                    className="year-head"
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onClick={() => toggle(g.year)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggle(g.year)
                      }
                    }}
                  >
                    <td>
                      {g.year === latestYear ? '▾' : open ? '▾' : '▸'} {g.year}年目
                      {g.year === latestYear && <span className="muted small">（進行中）</span>}
                    </td>
                    <td className="muted">年間計</td>
                    <td className="r">{yen(g.revenue)}</td>
                    <td className="r">{yen(g.operatingIncome)}</td>
                    <td className="r">{money(g.netIncome)}</td>
                    <td className="r">{money(g.operatingCF, true)}</td>
                    <td className="r">{money(g.endCash, true)}</td>
                    <td className="r">{yen(g.endEquity)}</td>
                  </tr>
                  {open &&
                    g.records.map((rec) => {
                      const equity = totalEquity(rec.stateAfter.balanceSheet)
                      const cash = rec.stateAfter.balanceSheet.currentAssets.cash
                      return (
                        <tr
                          key={rec.turn}
                          className={`month-row ${rec.turn === selectedTurn ? 'selected' : ''}`}
                          role="button"
                          tabIndex={0}
                          aria-pressed={rec.turn === selectedTurn}
                          onClick={() => onSelect(rec.turn)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              onSelect(rec.turn)
                            }
                          }}
                        >
                          <td className="month-cell">{subLabel(rec.turn, ppy)}</td>
                          <td>{rec.event.label}</td>
                          <td className="r">{yen(rec.incomeStatement.revenue)}</td>
                          <td className="r">{yen(rec.incomeStatement.operatingIncome)}</td>
                          <td className="r">{money(rec.incomeStatement.netIncome)}</td>
                          <td className="r">{money(rec.cashFlow.operating, true)}</td>
                          <td className="r">{money(cash, true)}</td>
                          <td className="r">{yen(equity)}</td>
                        </tr>
                      )
                    })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
