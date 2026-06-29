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
import { assessCredit } from '@core/finance/credit'

/** 販促費から需要乗数を求める（逓減効果、上限あり）。 */
export function marketingMultiplier(spend: number, params: SimParams): number {
  if (spend <= 0) return 1
  return 1 + params.marketingEffect * (spend / (spend + params.marketingHalf))
}

/**
 * 1ターン（1会計期間）を解決する純粋関数。発生主義＋原材料インベントリの簡易モデル。
 *
 * 物理フロー（数量と金額の両方を移動平均で管理）:
 *   ①原材料の仕入（当期スポット単価 × 数量）→ 原材料在庫へ（数量↑・金額↑）
 *   ②生産：手持ち原材料を上限に produce 個。原材料を移動平均単価で消費し、
 *     その金額を製品在庫へ「価値保存の振替」（資産の再分類＝恒等式不変）
 *   ③販売：需要分を製品在庫から販売。売上原価は製品の移動平均単価
 *
 * スポット単価 = unitVariableCost × materialIndex × product.unitCostModifier
 *   （市況 materialIndex と R&D の原価改善 unitCostModifier を反映）
 *
 * 売掛/買掛（買掛は当期の原材料仕入に対して）、減価償却、支払利息、法人税は従来どおり。
 * 棚卸資産の増減は常に「仕入＋振替−売上原価」で閉じ、
 * 「営業 CF = 純利益 + 減価償却 − ΔAR − Δ棚卸 + ΔAP」が成立、会計恒等式を常に維持。
 */
export function resolveTurn(
  state: CompanyState,
  decision: Decision,
  params: SimParams,
  options: TurnOptions = {},
): TurnResult {
  const bs = state.balanceSheet
  const product = productFromRd(state.rdStock, params)

  // 当期の原材料スポット単価（市況 × R&D 原価改善）
  const spotCost = Math.max(
    0,
    Math.round(params.unitVariableCost * state.materialIndex * product.unitCostModifier),
  )

  // 期首残高
  const cashBegin = bs.currentAssets.cash
  const arBegin = bs.currentAssets.accountsReceivable
  const rawValBegin = bs.currentAssets.rawMaterials
  const finValBegin = bs.currentAssets.finishedGoods
  const rawUnitsBegin = Math.max(0, state.materialUnits)
  const finUnitsBegin = Math.max(0, state.finishedUnits)
  const apBegin = bs.currentLiabilities.accountsPayable

  // --- ① 原材料の仕入（スポット単価で原材料在庫へ、移動平均） ---
  const purchaseUnits = Math.max(0, decision.purchaseMaterials)
  const purchaseCost = spotCost * purchaseUnits
  const rawUnitsAfterBuy = rawUnitsBegin + purchaseUnits
  const rawValAfterBuy = rawValBegin + purchaseCost
  const rawAvg = rawUnitsAfterBuy > 0 ? rawValAfterBuy / rawUnitsAfterBuy : 0

  // --- ② 生産（手持ち原材料が上限。原材料→製品へ価値保存の振替） ---
  const produced = Math.min(Math.max(0, decision.produceUnits), rawUnitsAfterBuy)
  const consumedRawValue = Math.round(produced * rawAvg)
  const rawUnitsEnd = rawUnitsAfterBuy - produced
  const rawValEnd = rawValAfterBuy - consumedRawValue
  const finUnitsAfterProduce = finUnitsBegin + produced
  const finValAfterProduce = finValBegin + consumedRawValue
  const finAvg = finUnitsAfterProduce > 0 ? finValAfterProduce / finUnitsAfterProduce : 0

  // --- ③ 需要と販売（製品在庫から） ---
  const demandMultiplier = options.demandMultiplier ?? 1
  const shareMultiplier = options.demandShareMultiplier ?? 1
  const rawDemand = demandAt(decision.unitPrice, params)
  const demand = Math.max(
    0,
    Math.round(
      rawDemand *
        marketingMultiplier(decision.marketingSpend, params) *
        demandMultiplier *
        product.demandModifier *
        shareMultiplier,
    ),
  )
  const unitsSold = Math.min(demand, finUnitsAfterProduce)
  const revenue = Math.round(decision.unitPrice * unitsSold)
  const costOfGoodsSold = Math.round(unitsSold * finAvg)
  const finUnitsEnd = finUnitsAfterProduce - unitsSold
  const finValEnd = finValAfterProduce - costOfGoodsSold

  // --- 損益計算書（P/L） ---
  const grossProfit = revenue - costOfGoodsSold
  const depreciation = Math.round(bs.fixedAssets.equipment * params.depreciationRate)
  const marketingSpend = Math.max(0, decision.marketingSpend)
  const rdSpend = Math.max(0, decision.rdSpend)
  const insuranceSpend = Math.max(0, decision.insuranceSpend)
  const operatingExpenses = params.fixedCosts + depreciation + marketingSpend + rdSpend + insuranceSpend
  const operatingIncome = grossProfit - operatingExpenses

  // 信用力に応じて金利スプレッドが乗る（期首の財務状態で評価）。
  const credit = assessCredit(state)
  const effectiveInterestRate = params.interestRate + credit.spread
  const debt = bs.currentLiabilities.shortTermDebt + bs.nonCurrentLiabilities.longTermDebt
  const interestExpense = Math.round(debt * effectiveInterestRate)

  // 突発ショック（保険で一部ヘッジ）。設備毀損は簿価から控除（非現金）。
  const oneOffLoss = Math.max(0, options.oneOffLoss ?? 0)
  const rawEquipmentLoss = Math.max(0, options.equipmentLoss ?? 0)
  // 設備の毀損は手持ち簿価まで（マイナスにしない）。
  const equipmentWritedown = Math.min(rawEquipmentLoss, bs.fixedAssets.equipment)
  const insuranceCoverage =
    params.insuranceRefCost > 0
      ? Math.min(params.maxInsuranceCoverage, insuranceSpend / params.insuranceRefCost)
      : 0
  // 特別損失（P/L）は保険適用後の純額。設備の簿価減は全額だが、保険補償分は現金で戻る。
  const extraordinaryLoss = Math.round((1 - insuranceCoverage) * (oneOffLoss + equipmentWritedown))

  const pretaxIncome = operatingIncome - interestExpense - extraordinaryLoss
  const tax = pretaxIncome > 0 ? Math.round(pretaxIncome * params.effectiveTaxRate) : 0
  const netIncome = pretaxIncome - tax

  const incomeStatement: IncomeStatement = {
    revenue,
    costOfGoodsSold,
    grossProfit,
    operatingExpenses,
    operatingIncome,
    interestExpense,
    extraordinaryLoss,
    pretaxIncome,
    tax,
    netIncome,
  }

  // --- 期末の発生主義（売掛は売上、買掛は原材料仕入に対して） ---
  const arEnd = Math.round(revenue * params.salesOnCreditRatio)
  const apEnd = Math.round(purchaseCost * params.payableRatio)

  const deltaAR = arEnd - arBegin
  const deltaInventory = rawValEnd + finValEnd - (rawValBegin + finValBegin)
  const deltaAP = apEnd - apBegin

  // --- キャッシュ・フロー計算書（間接法・整合保証） ---
  // 資金調達は信用枠でキャップ（借入は borrowLimit まで、返済は残債まで）。
  const financing =
    decision.financing > 0
      ? Math.min(decision.financing, credit.borrowLimit)
      : Math.max(decision.financing, -bs.nonCurrentLiabilities.longTermDebt)

  // 非現金の設備減（減価償却＋設備毀損）を足し戻す。保険補償分の現金は netIncome 経由で流入。
  const nonCashEquipReduction = depreciation + equipmentWritedown
  const operating = netIncome + nonCashEquipReduction - deltaAR - deltaInventory + deltaAP
  const investing = -decision.capitalExpenditure
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
    materialUnits: rawUnitsEnd,
    finishedUnits: finUnitsEnd,
    materialIndex: options.nextMaterialIndex ?? state.materialIndex,
    rdStock: state.rdStock + rdSpend,
    balanceSheet: {
      currentAssets: {
        cash: cashEnd,
        accountsReceivable: arEnd,
        rawMaterials: rawValEnd,
        finishedGoods: finValEnd,
      },
      fixedAssets: {
        equipment: bs.fixedAssets.equipment - nonCashEquipReduction + decision.capitalExpenditure,
      },
      currentLiabilities: {
        accountsPayable: apEnd,
        shortTermDebt: bs.currentLiabilities.shortTermDebt,
      },
      nonCurrentLiabilities: {
        longTermDebt: bs.nonCurrentLiabilities.longTermDebt + financing,
      },
      equity: {
        capitalStock: bs.equity.capitalStock,
        retainedEarnings: bs.equity.retainedEarnings + netIncome,
      },
    },
  }

  return {
    state: nextState,
    incomeStatement,
    cashFlow,
    unitsSold,
    effectiveUnitCost: spotCost,
    product,
    deltaAR,
    deltaInventory,
    deltaAP,
    creditGrade: credit.grade,
    effectiveInterestRate,
    appliedFinancing: financing,
    insuranceCoverage,
  }
}
