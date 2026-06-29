import type {
  CompanyState,
  Decision,
  IncomeStatement,
  CashFlowStatement,
  SimParams,
  TurnResult,
} from '@core/types'
import { demandAt } from '@core/market/demand'

/**
 * 1ターン（1会計期間）を解決する純粋関数。
 * 入力（期首状態・経営判断・パラメータ）から損益計算書・貸借対照表・
 * キャッシュ・フロー計算書を計算し、次の状態を返す。
 *
 * Phase 1 の簡略前提:
 *   - 売掛金・買掛金は使わず、売上・仕入・販管費・税はすべて当期現金決済。
 *   - 在庫は需要分を当期生産・販売し、在庫残高は不変（仕入＝売上原価）。
 * これにより「営業 CF = 当期純利益 ＋ 減価償却」が成立し、
 * 期末の会計恒等式（資産 = 負債 + 純資産）が常に保たれる。
 */
export function resolveTurn(
  state: CompanyState,
  decision: Decision,
  params: SimParams,
): TurnResult {
  const bs = state.balanceSheet

  // --- 損益計算書（P/L） ---
  const unitsSold = demandAt(decision.unitPrice, params)
  const revenue = Math.round(decision.unitPrice * unitsSold)
  const costOfGoodsSold = Math.round(params.unitVariableCost * unitsSold)
  const grossProfit = revenue - costOfGoodsSold

  // 減価償却は期首の固定資産簿価に対して計上（当期取得分は翌期から）。
  const depreciation = Math.round(bs.fixedAssets.equipment * params.depreciationRate)
  const operatingExpenses = params.fixedCosts + depreciation
  const operatingIncome = grossProfit - operatingExpenses

  // 支払利息は期首の有利子負債に対して計上。
  const interestBearingDebt =
    bs.currentLiabilities.shortTermDebt + bs.nonCurrentLiabilities.longTermDebt
  const interestExpense = Math.round(interestBearingDebt * params.interestRate)
  const pretaxIncome = operatingIncome - interestExpense

  // 法人税は黒字のときのみ（欠損金の繰越は Phase 2 以降）。
  const tax = pretaxIncome > 0 ? Math.round(pretaxIncome * params.effectiveTaxRate) : 0
  const netIncome = pretaxIncome - tax

  const incomeStatement: IncomeStatement = {
    revenue,
    costOfGoodsSold,
    grossProfit,
    operatingExpenses,
    operatingIncome,
    interestExpense,
    pretaxIncome,
    tax,
    netIncome,
  }

  // --- キャッシュ・フロー計算書（間接法） ---
  // 営業: 当期純利益に非現金項目（減価償却）を足し戻す。
  const operating = netIncome + depreciation
  // 投資: 設備投資の支出。
  const investing = -decision.capitalExpenditure
  // 財務: 借入(+)／返済(−)。
  const financing = decision.financing
  const netChange = operating + investing + financing

  const cashBegin = bs.currentAssets.cash
  const cashEnd = cashBegin + netChange

  const cashFlow: CashFlowStatement = {
    operating,
    investing,
    financing,
    netChange,
    cashBegin,
    cashEnd,
  }

  // --- 期末の貸借対照表（B/S） ---
  const nextState: CompanyState = {
    turn: state.turn + 1,
    balanceSheet: {
      currentAssets: {
        cash: cashEnd,
        accountsReceivable: bs.currentAssets.accountsReceivable, // Phase 1 は不変
        inventory: bs.currentAssets.inventory, // Phase 1 は不変
      },
      fixedAssets: {
        // 期首簿価 − 減価償却 ＋ 当期設備投資
        equipment: bs.fixedAssets.equipment - depreciation + decision.capitalExpenditure,
      },
      currentLiabilities: {
        accountsPayable: bs.currentLiabilities.accountsPayable, // Phase 1 は不変
        shortTermDebt: bs.currentLiabilities.shortTermDebt, // Phase 1 は不変
      },
      nonCurrentLiabilities: {
        // 借入(+)／返済(−)は長期借入に反映
        longTermDebt: bs.nonCurrentLiabilities.longTermDebt + decision.financing,
      },
      equity: {
        capitalStock: bs.equity.capitalStock,
        retainedEarnings: bs.equity.retainedEarnings + netIncome,
      },
    },
  }

  return { state: nextState, incomeStatement, cashFlow, unitsSold }
}
