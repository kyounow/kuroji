import { memo, useState, type ReactNode } from 'react'
import {
  totalAssets,
  totalLiabilities,
  totalEquity,
  type CompanyState,
} from '@core/index'
import type { TurnRecord } from '../state'
import { yen, num, periodLabel } from '../format'
import { BalanceSheetChart } from './BalanceSheetChart'
import { WaterfallChart, type WaterfallStep } from './WaterfallChart'
import { StatementsTrend } from './StatementsTrend'
import { InfoTip } from './Glossary'

interface Props {
  state: CompanyState
  last: TurnRecord | null
  periodsPerYear: number
  /** 推移グラフ用の全履歴 */
  history: TurnRecord[]
}

type Mode = 'chart' | 'table'
type Layout = 'focus' | 'grid' | 'trend'
type Tab = 'bs' | 'pl' | 'cf'

function Row({
  label,
  value,
  kind,
  term,
}: {
  label: string
  value: number
  kind?: 'sub' | 'total'
  /** 用語集の語（あれば ⓘ を付ける） */
  term?: string
}) {
  return (
    <tr className={kind}>
      <th>
        {label}
        {term && <InfoTip term={term} />}
      </th>
      <td>{yen(value)}</td>
    </tr>
  )
}

/** 財務三表。1つずつ大きく（タブ切替）／3つ並べて、グラフ／表 を切り替えられる。 */
/** 三表＋推移チャートは game/selected 依存のみ。判断入力で再renderしないよう memo 化（配下チャートも巻き込み防止）。 */
export const StatementsView = memo(StatementsViewImpl)

function StatementsViewImpl({ state, last, periodsPerYear, history }: Props) {
  const plabel = (turn: number) => periodLabel(turn, periodsPerYear)
  const [mode, setMode] = useState<Mode>('chart')
  const [layout, setLayout] = useState<Layout>('focus')
  const [tab, setTab] = useState<Tab>('bs')

  const bs = state.balanceSheet
  const currentAssets =
    bs.currentAssets.cash +
    bs.currentAssets.accountsReceivable +
    bs.currentAssets.rawMaterials +
    bs.currentAssets.finishedGoods
  const currentLiabilities =
    bs.currentLiabilities.accountsPayable + bs.currentLiabilities.shortTermDebt

  const pl = last?.incomeStatement
  const cf = last?.cashFlow

  const plSteps: WaterfallStep[] = pl
    ? [
        { label: '売上高', value: pl.revenue, type: 'total' },
        { label: '売上原価', value: -pl.costOfGoodsSold, type: 'delta' },
        { label: '粗利', value: pl.grossProfit, type: 'total' },
        { label: '販管費', value: -pl.operatingExpenses, type: 'delta' },
        { label: '営業利益', value: pl.operatingIncome, type: 'total' },
        { label: '支払利息', value: -pl.interestExpense, type: 'delta' },
        ...(pl.extraordinaryLoss > 0
          ? [{ label: '特別損失', value: -pl.extraordinaryLoss, type: 'delta' as const }]
          : []),
        { label: '法人税', value: -pl.tax, type: 'delta' },
        { label: '純利益', value: pl.netIncome, type: 'total' },
      ]
    : []

  const cfSteps: WaterfallStep[] = cf
    ? [
        { label: '期首現金', value: cf.cashBegin, type: 'total' },
        { label: '営業CF', value: cf.operating, type: 'delta' },
        { label: '投資CF', value: cf.investing, type: 'delta' },
        { label: '財務CF', value: cf.financing, type: 'delta' },
        { label: '期末現金', value: cf.cashEnd, type: 'total' },
      ]
    : []

  const bsBody =
    mode === 'chart' ? (
      <BalanceSheetChart bs={bs} />
    ) : (
      <table>
        <tbody>
          <tr className="section"><th colSpan={2}>資産の部</th></tr>
          <Row label="現金" value={bs.currentAssets.cash} />
          <Row label="売掛金" value={bs.currentAssets.accountsReceivable} term="売掛金" />
          <Row label={`原材料（${num(state.materialUnits)}個）`} value={bs.currentAssets.rawMaterials} />
          <Row label={`製品（${num(state.finishedUnits)}個）`} value={bs.currentAssets.finishedGoods} />
          <Row label="流動資産 計" value={currentAssets} kind="sub" />
          <Row label="設備（簿価）" value={bs.fixedAssets.equipment} />
          {(bs.fixedAssets.goodwill ?? 0) > 0 && (
            <Row label="のれん" value={bs.fixedAssets.goodwill ?? 0} term="のれん" />
          )}
          <Row label="資産合計" value={totalAssets(bs)} kind="total" />
          <tr className="section"><th colSpan={2}>負債・純資産の部</th></tr>
          <Row label="買掛金" value={bs.currentLiabilities.accountsPayable} term="買掛金" />
          <Row label="短期借入" value={bs.currentLiabilities.shortTermDebt} />
          <Row label="流動負債 計" value={currentLiabilities} kind="sub" />
          <Row label="長期借入" value={bs.nonCurrentLiabilities.longTermDebt} />
          <Row label="負債合計" value={totalLiabilities(bs)} kind="sub" />
          <Row label="資本金" value={bs.equity.capitalStock} />
          <Row label="利益剰余金" value={bs.equity.retainedEarnings} term="利益剰余金" />
          <Row label="純資産合計" value={totalEquity(bs)} kind="sub" />
          <Row label="負債・純資産合計" value={totalLiabilities(bs) + totalEquity(bs)} kind="total" />
        </tbody>
      </table>
    )

  const plBody = !pl ? (
    <p className="muted">まだ1期も経営していません。判断を入力して進めてください。</p>
  ) : mode === 'chart' ? (
    <WaterfallChart steps={plSteps} />
  ) : (
    <table>
      <tbody>
        <Row label="売上高" value={pl.revenue} />
        <Row label="売上原価" value={pl.costOfGoodsSold} term="売上原価" />
        <Row label="売上総利益" value={pl.grossProfit} kind="sub" />
        <Row label="販管費（含 減価償却・販促・R&D・保険）" value={pl.operatingExpenses} term="減価償却" />
        <Row label="営業利益" value={pl.operatingIncome} kind="sub" />
        <Row label="支払利息" value={pl.interestExpense} />
        {pl.extraordinaryLoss > 0 && (
          <Row label="特別損失（ショック）" value={pl.extraordinaryLoss} term="特別損失" />
        )}
        <Row label="税引前利益" value={pl.pretaxIncome} kind="sub" />
        <Row label="法人税等" value={pl.tax} />
        <tr className={pl.netIncome >= 0 ? 'total ok' : 'total ng'}>
          <th>当期純利益</th>
          <td>{yen(pl.netIncome)}</td>
        </tr>
      </tbody>
    </table>
  )

  const cfBody = !cf ? (
    <p className="muted">まだ1期も経営していません。</p>
  ) : mode === 'chart' ? (
    <WaterfallChart steps={cfSteps} />
  ) : (
    <table>
      <tbody>
        <Row label="営業活動 CF" value={cf.operating} />
        <Row label="投資活動 CF" value={cf.investing} />
        <Row label="財務活動 CF" value={cf.financing} />
        <Row label="現金純増減" value={cf.netChange} kind="sub" />
        <Row label="期首現金" value={cf.cashBegin} />
        <Row label="期末現金" value={cf.cashEnd} kind="total" />
      </tbody>
    </table>
  )

  const cards: Record<Tab, { title: string; body: ReactNode }> = {
    bs: { title: `貸借対照表（B/S）${state.turn > 0 ? `${plabel(state.turn)}末` : '期首'}`, body: bsBody },
    pl: { title: `損益計算書（P/L）${last ? plabel(last.turn) : ''}`, body: plBody },
    cf: { title: `キャッシュ・フロー（C/F）${last ? plabel(last.turn) : ''}`, body: cfBody },
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'bs', label: '貸借対照表' },
    { key: 'pl', label: '損益計算書' },
    { key: 'cf', label: 'キャッシュフロー' },
  ]

  return (
    <section className="statements-bleed">
      <div className="statements-inner">
        <div className="statements-head">
          <h2>財務三表</h2>
          <div className="controls">
            <div className="seg">
              <button className={layout === 'focus' ? 'on' : ''} onClick={() => setLayout('focus')}>
                1つずつ大きく
              </button>
              <button className={layout === 'grid' ? 'on' : ''} onClick={() => setLayout('grid')}>
                3つ並べて
              </button>
              <button className={layout === 'trend' ? 'on' : ''} onClick={() => setLayout('trend')}>
                推移
              </button>
            </div>
            {layout !== 'trend' && (
              <div className="seg">
                <button className={mode === 'chart' ? 'on' : ''} onClick={() => setMode('chart')}>
                  グラフ
                </button>
                <button className={mode === 'table' ? 'on' : ''} onClick={() => setMode('table')}>
                  表
                </button>
              </div>
            )}
          </div>
        </div>

        {layout === 'trend' ? (
          <StatementsTrend history={history} periodsPerYear={periodsPerYear} />
        ) : layout === 'focus' ? (
          <>
            <div className="tabs">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  className={tab === t.key ? 'on' : ''}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="card card-big">
              <h3>{cards[tab].title}</h3>
              {cards[tab].body}
            </div>
          </>
        ) : (
          <div className="grid grid-statements">
            <div className="card"><h3>{cards.bs.title}</h3>{cards.bs.body}</div>
            <div className="card"><h3>{cards.pl.title}</h3>{cards.pl.body}</div>
            <div className="card"><h3>{cards.cf.title}</h3>{cards.cf.body}</div>
          </div>
        )}
      </div>
    </section>
  )
}
