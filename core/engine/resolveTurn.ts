import type {
  CompanyState,
  Decision,
  IncomeStatement,
  CashFlowStatement,
  SimParams,
  TurnOptions,
  TurnResult,
} from '@core/types'
import { demandAt } from '@core/market/demand'

/** 販促費から需要乗数を求める（逓減効果、上限あり）。 */
export function marketingMultiplier(spend: number, params: SimParams): number {
  if (spend <= 0) return 1
  return 1 + params.marketingEffect * (spend / (spend + params.marketingHalf))
}

/**
 * 1ターン（1会計期間）を解決する純粋関数。発生主義の簡易モデル。
 *
 * モデルの要点（学習用に簡略化）:
 *   - 在庫: 期首在庫＋当期生産のうち、需要分だけ販売。売れ残りは在庫として繰越。
 *           売上原価は「販売数量 × 単価原価」（費用収益対応）。
 *   - 売掛金: 当期売上の一部（salesOnCreditRatio）は期末に売掛金として残り、現金は翌期回収。
 *             期首の売掛金は当期に現金回収する。
 *   - 買掛金: 当期仕入（生産費）の一部（payableRatio）は期末に買掛金として残り、現金は翌期支払。
 *             期首の買掛金は当期に現金支払する。
 *   - 減価償却: 期首の固定資産簿価に対して計上（当期取得分は翌期から）。非現金。
 *   - 在庫の評価単価は params.unitVariableCost で一定とみなす。
 *
 * これにより「営業 CF = 当期純利益 ＋ 減価償却 − ΔAR − Δ在庫 ＋ ΔAP」が成立し、
 * 期末の会計恒等式（資産 = 負債 + 純資産）が常に保たれる（数値はすべて整数円）。
 */
export function resolveTurn(
  state: CompanyState,
  decision: Decision,
  params: SimParams,
  options: TurnOptions = {},
): TurnResult {
  const bs = state.balanceSheet
  const unitCost = params.unitVariableCost

  // 期首残高
  const cashBegin = bs.currentAssets.cash
  const arBegin = bs.currentAssets.accountsReceivable
  const invBegin = bs.currentAssets.inventory
  const apBegin = bs.currentLiabilities.accountsPayable
  const invUnitsBegin = unitCost > 0 ? Math.round(invBegin / unitCost) : 0

  // --- 需要と販売 ---
  const demandMultiplier = options.demandMultiplier ?? 1
  const rawDemand = demandAt(decision.unitPrice, params)
  const demand = Math.max(
    0,
    Math.round(rawDemand * marketingMultiplier(decision.marketingSpend, params) * demandMultiplier),
  )
  const unitsAvailable = invUnitsBegin + Math.max(0, decision.produceUnits)
  const unitsSold = Math.min(demand, unitsAvailable)

  // --- 損益計算書（P/L） ---
  const revenue = Math.round(decision.unitPrice * unitsSold)
  const costOfGoodsSold = unitCost * unitsSold
  const grossProfit = revenue - costOfGoodsSold

  const depreciation = Math.round(bs.fixedAssets.equipment * params.depreciationRate)
  const marketingSpend = Math.max(0, decision.marketingSpend)
  const operatingExpenses = params.fixedCosts + depreciation + marketingSpend
  const operatingIncome = grossProfit - operatingExpenses

  const interestBearingDebt =
    bs.currentLiabilities.shortTermDebt + bs.nonCurrentLiabilities.longTermDebt
  const interestExpense = Math.round(interestBearingDebt * params.interestRate)
  const pretaxIncome = operatingIncome - interestExpense

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

  // --- 期末の資産・負債（発生主義） ---
  const productionCost = unitCost * Math.max(0, decision.produceUnits) // 当期仕入（在庫に積む）
  const arEnd = Math.round(revenue * params.salesOnCreditRatio)
  const apEnd = Math.round(productionCost * params.payableRatio)
  const invEnd = invBegin + productionCost - costOfGoodsSold // 在庫の増減（生産 − 販売原価）

  const deltaAR = arEnd - arBegin
  const deltaInv = invEnd - invBegin
  const deltaAP = apEnd - apBegin

  // --- キャッシュ・フロー計算書（間接法・整合保証） ---
  const operating = netIncome + depreciation - deltaAR - deltaInv + deltaAP
  const investing = -decision.capitalExpenditure
  const financing = decision.financing
  const netChange = operating + investing + financing
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
        accountsReceivable: arEnd,
        inventory: invEnd,
      },
      fixedAssets: {
        equipment: bs.fixedAssets.equipment - depreciation + decision.capitalExpenditure,
      },
      currentLiabilities: {
        accountsPayable: apEnd,
        shortTermDebt: bs.currentLiabilities.shortTermDebt,
      },
      nonCurrentLiabilities: {
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
