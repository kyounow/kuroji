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
import { productFromRd } from '@core/product/research'

/** 販促費から需要乗数を求める（逓減効果、上限あり）。 */
export function marketingMultiplier(spend: number, params: SimParams): number {
  if (spend <= 0) return 1
  return 1 + params.marketingEffect * (spend / (spend + params.marketingHalf))
}

/**
 * 1ターン（1会計期間）を解決する純粋関数。発生主義の簡易モデル。
 *
 * モデルの要点（学習用に簡略化）:
 *   - 在庫: 期首在庫＋当期生産のうち需要分だけ販売。売れ残りは在庫として繰越。
 *           評価は移動平均法。売上原価 = 販売数量 × 移動平均単価（費用収益対応）。
 *   - 研究開発: 累積R&D（rdStock）に応じて製造原価が下がり需要が上がる（productFromRd）。
 *               当期のR&D費は費用計上し、その成果（rdStock 増加）は翌期以降に効く。
 *   - 売掛金: 当期売上の一部（salesOnCreditRatio）は期末に売掛金として残り、現金は翌期回収。
 *   - 買掛金: 当期仕入（生産費）の一部（payableRatio）は期末に買掛金として残り、現金は翌期支払。
 *   - 減価償却: 期首の固定資産簿価に対して計上（当期取得分は翌期から）。非現金。
 *
 * 在庫の増減は常に ΔInv = 生産費 − 売上原価 に等しいので、
 * 「営業 CF = 純利益 + 減価償却 − ΔAR − Δ在庫 + ΔAP」が成立し、
 * 期末の会計恒等式（資産 = 負債 + 純資産）が常に保たれる（数値はすべて整数円）。
 */
export function resolveTurn(
  state: CompanyState,
  decision: Decision,
  params: SimParams,
  options: TurnOptions = {},
): TurnResult {
  const bs = state.balanceSheet

  // --- 製品パラメータ（期首時点の累積R&Dで決まる） ---
  const product = productFromRd(state.rdStock, params)
  const effectiveUnitCost = Math.max(0, Math.round(params.unitVariableCost * product.unitCostModifier))

  // 期首残高
  const cashBegin = bs.currentAssets.cash
  const arBegin = bs.currentAssets.accountsReceivable
  const invValueBegin = bs.currentAssets.inventory
  const invUnitsBegin = Math.max(0, state.inventoryUnits)
  const apBegin = bs.currentLiabilities.accountsPayable

  // --- 需要と販売（在庫は移動平均で評価） ---
  const demandMultiplier = options.demandMultiplier ?? 1
  const rawDemand = demandAt(decision.unitPrice, params)
  const demand = Math.max(
    0,
    Math.round(
      rawDemand *
        marketingMultiplier(decision.marketingSpend, params) *
        demandMultiplier *
        product.demandModifier,
    ),
  )

  const produce = Math.max(0, decision.produceUnits)
  const productionCost = effectiveUnitCost * produce
  const unitsAfterProduce = invUnitsBegin + produce
  const valueAfterProduce = invValueBegin + productionCost
  const avgCost = unitsAfterProduce > 0 ? valueAfterProduce / unitsAfterProduce : 0

  const unitsSold = Math.min(demand, unitsAfterProduce)
  const costOfGoodsSold = Math.round(unitsSold * avgCost)
  const invUnitsEnd = unitsAfterProduce - unitsSold
  const invValueEnd = valueAfterProduce - costOfGoodsSold // ΔInv = 生産費 − 売上原価 を保証

  // --- 損益計算書（P/L） ---
  const revenue = Math.round(decision.unitPrice * unitsSold)
  const grossProfit = revenue - costOfGoodsSold

  const depreciation = Math.round(bs.fixedAssets.equipment * params.depreciationRate)
  const marketingSpend = Math.max(0, decision.marketingSpend)
  const rdSpend = Math.max(0, decision.rdSpend)
  const operatingExpenses = params.fixedCosts + depreciation + marketingSpend + rdSpend
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
  const arEnd = Math.round(revenue * params.salesOnCreditRatio)
  const apEnd = Math.round(productionCost * params.payableRatio)

  const deltaAR = arEnd - arBegin
  const deltaInv = invValueEnd - invValueBegin
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

  // --- 期末の貸借対照表（B/S）と状態 ---
  const nextState: CompanyState = {
    turn: state.turn + 1,
    inventoryUnits: invUnitsEnd,
    rdStock: state.rdStock + rdSpend,
    balanceSheet: {
      currentAssets: {
        cash: cashEnd,
        accountsReceivable: arEnd,
        inventory: invValueEnd,
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

  return { state: nextState, incomeStatement, cashFlow, unitsSold, effectiveUnitCost, product }
}
