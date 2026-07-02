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
import { productionCapacity, laborCapacity, costEfficiency } from '@core/finance/capacity'
import { sharesIssued } from '@core/finance/shares'

/** 0..1 にクランプ。 */
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

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
  // 1ターンの長さ（年→期間）。流量はこの係数でスケールする。
  const ppy = params.periodsPerYear ?? 1
  const periodFactor = 1 / ppy
  // マクロ（物価指数・景気需要倍率）。未注入なら無効（1.0）。
  const inflationIndex = options.inflationIndex ?? 1
  const macroDemandMultiplier = options.macroDemandMultiplier ?? 1

  // 当期の設備投資は 0 フロア（負値は設備処分を意味しないため無効化＝簿価を負にしない）。
  const capex = Math.max(0, decision.capitalExpenditure)
  // 当期の設備投資は当期から有効（期首設備＋当期 capex）。能力・コストに即反映する。
  const opEquipment = bs.fixedAssets.equipment + capex

  // 当期の従業員数（採用・解雇を当期から反映＝即戦力）。人件費・労働能力を規定する。
  const hire = Math.max(0, decision.hire)
  // 解雇は在籍数（期首＋当期採用）まで。超過指示で存在しない人の退職金を払わないようクランプ。
  const fire = Math.min(Math.max(0, decision.fire), (state.headcount ?? 0) + hire)
  const headcountAfterDecision = (state.headcount ?? 0) + hire - fire
  // 給与水準（相場＝物価連動の市場賃金＝1.0）。低いほど人件費は下がるが離職率が上がる。
  const wageMult = Math.max(0, decision.wageLevel) / 100
  // 自主退職（離職）: 給与水準が相場(1.0)を下回るほど一定割合が離職（退職金なし）。
  const shortfall = Math.max(0, 1 - wageMult)
  const quitRate =
    params.attritionSlope != null
      ? Math.min(params.maxAttrition ?? 1, params.attritionSlope * shortfall)
      : 0
  // 浮動小数の丸め境界（例 0.5）を安定して切り上げるため微小εを加える。
  const attritionQuits = Math.round(headcountAfterDecision * quitRate + 1e-9)
  const headcount = Math.max(0, headcountAfterDecision - attritionQuits)

  // 当期の原材料スポット単価（物価 × 市況 × R&D 原価改善 × 設備の規模の経済）
  const spotCost = Math.max(
    0,
    Math.round(
      params.unitVariableCost *
        inflationIndex *
        state.materialIndex *
        product.unitCostModifier *
        costEfficiency(opEquipment, params),
    ),
  )

  // 当期の生産能力＝設備能力と労働能力の小さい方（設備か人手のボトルネック）。
  const capacity = Math.min(
    productionCapacity(opEquipment, params, periodFactor),
    laborCapacity(headcount, params, periodFactor),
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
  // 生産は「希望数量・手持ち原材料・生産能力」のうち最小まで。
  const produced = Math.min(Math.max(0, decision.produceUnits), rawUnitsAfterBuy, capacity)
  const consumedRawValue = Math.round(produced * rawAvg)
  const rawUnitsEnd = rawUnitsAfterBuy - produced
  const rawValEnd = rawValAfterBuy - consumedRawValue
  const finUnitsAfterProduce = finUnitsBegin + produced
  const finValAfterProduce = finValBegin + consumedRawValue
  const finAvg = finUnitsAfterProduce > 0 ? finValAfterProduce / finUnitsAfterProduce : 0

  // --- ③ 需要と販売（製品在庫から） ---
  const demandMultiplier = options.demandMultiplier ?? 1
  const shareMultiplier = options.demandShareMultiplier ?? 1
  // 需要ブレ（確定時のみ。プレビューは未指定＝1で中心値）。実際の販売に不確実性を持たせる。
  const demandNoise = options.demandNoise ?? 1
  // 全社レベルの需要乗数（上場の知名度・買収した顧客基盤）。単一の適用点＝製品ライン別化しても一括で掛ける。
  const companyDemandMultiplier =
    (state.listed ? 1 + (params.listingDemandBoost ?? 0) : 1) *
    (state.acquiredCompetitor ? 1 + (params.acqTargetDemandBoost ?? 0) : 1)
  // 物価上昇時に名目価格を据え置くと実質値下げ→需要増（unitPrice を物価で割る）。
  const rawDemand = demandAt(decision.unitPrice / inflationIndex, params)
  const demand = Math.max(
    0,
    Math.round(
      rawDemand *
        marketingMultiplier(decision.marketingSpend, params) *
        demandMultiplier *
        macroDemandMultiplier *
        companyDemandMultiplier *
        product.demandModifier *
        shareMultiplier *
        periodFactor *
        demandNoise,
    ),
  )
  const availableToSell = finUnitsAfterProduce
  const unitsSold = Math.min(demand, availableToSell)
  const revenue = Math.round(decision.unitPrice * unitsSold)
  const costOfGoodsSold = Math.round(unitsSold * finAvg)
  const finUnitsEnd = finUnitsAfterProduce - unitsSold
  const finValEnd = finValAfterProduce - costOfGoodsSold

  // --- 損益計算書（P/L） ---
  const grossProfit = revenue - costOfGoodsSold
  // 固定費（物価で増減）・減価償却は年額を期間でスケール。
  const fixedCosts = Math.round(params.fixedCosts * inflationIndex * periodFactor)
  const depreciation = Math.round(bs.fixedAssets.equipment * params.depreciationRate * periodFactor)
  const marketingSpend = Math.max(0, decision.marketingSpend)
  const rdSpend = Math.max(0, decision.rdSpend)
  const insuranceSpend = Math.max(0, decision.insuranceSpend)
  const maintenanceSpend = Math.max(0, decision.maintenanceSpend)
  // 人件費＝従業員数 × 市場賃金(wage×物価指数) × 給与水準。未設定の wage は労働モデル無効＝0。
  const laborCost = params.wage
    ? Math.round(headcount * params.wage * inflationIndex * wageMult * periodFactor)
    : 0
  const hiringCost = hire * (params.hireCost ?? 0)
  const severanceCost = fire * (params.severance ?? 0)
  // 上場維持コスト（監査・IR・ガバナンス）。上場中は毎期かかる固定的費用（年額を期間スケール・物価連動）。
  const listingCostNow =
    state.listed && params.listingCost
      ? Math.round(params.listingCost * inflationIndex * periodFactor)
      : 0
  // のれん償却（期首ののれん簿価×年率を期間スケール）。減価償却と同じく非現金費用＝営業CFで足し戻す。
  const goodwillBegin = bs.fixedAssets.goodwill ?? 0
  const goodwillAmort = Math.round(goodwillBegin * (params.goodwillAmortRate ?? 0) * periodFactor)
  const operatingExpenses =
    fixedCosts +
    depreciation +
    marketingSpend +
    rdSpend +
    insuranceSpend +
    maintenanceSpend +
    laborCost +
    hiringCost +
    severanceCost +
    listingCostNow +
    goodwillAmort
  const operatingIncome = grossProfit - operatingExpenses

  // 実効金利＝政策金利（マクロ）＋銀行スプレッド＋信用スプレッド（期首の財務状態で評価）。
  const credit = assessCredit(state)
  const effectiveInterestRate = (options.policyRate ?? 0) + params.interestRate + credit.spread
  const debt = bs.currentLiabilities.shortTermDebt + bs.nonCurrentLiabilities.longTermDebt
  const interestExpense = Math.round(debt * effectiveInterestRate * periodFactor)

  // 突発ショック（保険で一部ヘッジ）。損失額は会社規模に連動（比率×規模、絶対額は下限 floor）。
  // 毀損度のばらつき severity は確定時のみ注入（プレビューは未指定＝1で中心値）。
  const severity = Math.max(0, options.lossSeverity ?? 1)
  const annualRevenue = revenue * ppy // 月次フロー→年商（係数を年額基準にしてppyに不変）
  const annualOpInc = Math.max(0, operatingIncome) * ppy // 赤字は0クリップ（利益連動の上乗せ無し）

  // 一時損失（訴訟・リコール）: 年商×係数 ＋ 年間営業利益×係数。下限 floor、任意の年商比 cap。
  const oneOffFloor = Math.max(0, options.oneOffLoss ?? 0)
  const oneOffScaled =
    (options.oneOffLossRevenueRatio ?? 0) * annualRevenue +
    (options.oneOffLossProfitRatio ?? 0) * annualOpInc
  let oneOffLoss = Math.max(oneOffFloor, Math.round(oneOffScaled * severity))
  if (options.oneOffLossCapRatio != null) {
    const cap = Math.round(options.oneOffLossCapRatio * annualRevenue)
    oneOffLoss = Math.max(oneOffFloor, Math.min(oneOffLoss, cap)) // floor は cap より優先（下限保証）
  }

  // 設備毀損（故障・災害）: 期首設備簿価×係数（ストックなので ppy 非依存）。下限 floor。
  // 保全費（予防保全）で被害を最大 maxMaintenanceReduction まで軽減する（連動・floor の両方に作用）。
  const maintenanceEffect =
    params.maintenanceRefCost && params.maintenanceRefCost > 0
      ? Math.min(params.maxMaintenanceReduction ?? 0, maintenanceSpend / params.maintenanceRefCost)
      : 0
  const maintenanceKeep = 1 - maintenanceEffect
  const equipFloor = Math.max(0, options.equipmentLoss ?? 0) * maintenanceKeep
  const equipScaled = (options.equipmentLossRatio ?? 0) * bs.fixedAssets.equipment * maintenanceKeep
  const rawEquipmentLoss = Math.max(equipFloor, Math.round(equipScaled * severity))
  // 設備の毀損は減価償却後の簿価まで（同期の償却と二重控除でマイナスにしない）。
  const equipmentWritedown = Math.min(rawEquipmentLoss, Math.max(0, bs.fixedAssets.equipment - depreciation))
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

  // 増資（株式発行）: 現金↑・資本金↑（無利息・返済義務なし）。借入とは別の財務CF。
  // 簿価発行（発行価格＝期首BVPS）で新株を発行し、希薄化として株数に反映。
  // 1期の発行は「期首純資産×受け入れ枠」まで（投資家の需要には限りがある＝無制限の資本注入で目標やB/Sが壊れるのを防ぐ）。
  const equityBegin = bs.equity.capitalStock + bs.equity.retainedEarnings
  const equityIssueCap = Math.round(Math.max(0, equityBegin) * (params.equityIssueCapRatio ?? 0.25))
  const equityIssue = Math.min(Math.max(0, decision.equityIssuance), equityIssueCap)
  const newShares = sharesIssued(equityIssue, equityBegin, state.sharesOutstanding ?? 0)

  // IPO（新規上場・一度きり）: 公募価格＝時価総額（options.ipoValuation＝年間純利益×PER）÷既存株数。
  // 未上場・株式基盤あり・バリュエーション>0 のときだけ成立（UIゲートに頼らずエンジンでも自衛）。
  // 調達は時価総額×ipoMaxRaiseRatio まで（無制限の資本注入を防ぐ）。調達分は paidInSinceStart に加算。
  const ipoValuationNow = Math.max(0, options.ipoValuation ?? 0)
  const sharesBegin = state.sharesOutstanding ?? 0
  let ipoProceeds = 0
  let ipoShares = 0
  if (decision.goPublic && !state.listed && sharesBegin > 0 && ipoValuationNow > 0) {
    const maxRaise = Math.round(ipoValuationNow * (params.ipoMaxRaiseRatio ?? 0.5))
    ipoProceeds = Math.min(Math.max(0, Math.round(decision.goPublic.proceeds)), maxRaise)
    const offerPrice = ipoValuationNow / sharesBegin
    ipoShares = offerPrice > 0 ? Math.round(ipoProceeds / offerPrice) : 0
    if (ipoShares <= 0) ipoProceeds = 0 // 株が発行できない規模なら不成立（株なき資本注入を作らない）
  }
  const listedNow = state.listed === true || ipoProceeds > 0

  // 配当（株主還元）: 利益剰余金と期首現金の小さい方まで。剰余金↓・現金↓・財務CF↓＝同額減で恒等式維持。
  // 期中の資金繰りまでは守らない（設備投資と同じ思想＝判断は自由、プレビューの現金警告が知らせる）。
  const dividendPaid = Math.min(
    Math.max(0, Math.round(decision.dividend)),
    Math.max(0, Math.min(bs.equity.retainedEarnings, cashBegin)),
  )

  // M&A（競合の買収・一度きり）: 対価＝現金＋借入＋株式。取得会計＝受入純資産（設備）との差がのれん。
  //  - 借入対価は通常の financing と合算で信用枠内（素通りの抜け穴を作らない）
  //  - 株式対価は BVPS>0 のときのみ（株なき資本注入を作らない）。調達分は paidInSinceStart に加算
  //  - 対価合計が受入純資産未満は不成立（負ののれんは扱わない＝恒等式が恒等的に成立する範囲に限定）
  //  - 受け入れた設備・人員・需要ブーストは期末に反映（翌期から稼働）
  let acqCash = 0
  let acqDebt = 0
  let acqStock = 0
  let acqStockShares = 0
  let acqGoodwill = 0
  let acqEquipment = 0
  let acqHeads = 0
  const targetNetAssets = params.acqTargetNetAssets ?? 0
  if (decision.acquire && !state.acquiredCompetitor && targetNetAssets > 0) {
    acqCash = Math.max(0, Math.round(decision.acquire.cashPaid))
    const debtHeadroom = Math.max(0, credit.borrowLimit - Math.max(0, financing))
    acqDebt = Math.min(Math.max(0, Math.round(decision.acquire.debtRaised)), debtHeadroom)
    const bvpsNow = sharesBegin > 0 ? equityBegin / sharesBegin : 0
    acqStock = bvpsNow > 0 ? Math.max(0, Math.round(decision.acquire.stockValue)) : 0
    acqStockShares = bvpsNow > 0 ? Math.round(acqStock / bvpsNow) : 0
    if (acqStockShares <= 0) acqStock = 0
    const consideration = acqCash + acqDebt + acqStock
    if (consideration >= targetNetAssets) {
      acqEquipment = targetNetAssets // 受入純資産＝ターゲットの設備簿価（負債なしの簡易モデル）
      acqGoodwill = consideration - targetNetAssets
      acqHeads = Math.max(0, params.acqTargetHeadcount ?? 0)
    } else {
      // 不成立（対価不足）。何も動かさない。
      acqCash = 0
      acqDebt = 0
      acqStock = 0
      acqStockShares = 0
    }
  }
  const acquisitionConsideration = acqCash + acqDebt + acqStock
  const acquiredNow = state.acquiredCompetitor === true || acquisitionConsideration > 0

  // 非現金の設備減（減価償却＋設備毀損）とのれん償却を足し戻す。保険補償分の現金は netIncome 経由で流入。
  const nonCashEquipReduction = depreciation + equipmentWritedown
  const operating = netIncome + nonCashEquipReduction + goodwillAmort - deltaAR - deltaInventory + deltaAP
  // 買収に支払った現金（自己資金＋借入分）は投資CF、借入の調達は財務CF ＝ 現金純減は自己資金分だけ。
  const investing = -capex - (acqCash + acqDebt)
  const financingCF = financing + equityIssue + ipoProceeds + acqDebt - dividendPaid // 借入＋増資＋IPO＋買収借入−配当
  const netChange = operating + investing + financingCF
  const cashEnd = cashBegin + netChange

  const cashFlow: CashFlowStatement = {
    operating,
    investing,
    financing: financingCF,
    netChange,
    cashBegin,
    cashEnd,
  }

  // 設備の整備状態（保全費の累積で上がり、放置で逓減）。次ターンの故障発生率を左右する。
  // B/S 外のメタ変数（資産計上しない）なので恒等式に無干渉。
  const conditionNext =
    params.conditionDecay != null
      ? clamp01(
          (state.condition ?? 1) -
            params.conditionDecay +
            (params.conditionGainPerRefCost ?? 0) *
              (params.maintenanceRefCost && params.maintenanceRefCost > 0
                ? maintenanceSpend / params.maintenanceRefCost
                : 0),
        )
      : (state.condition ?? 1)

  // --- 期末の貸借対照表（B/S）と状態 ---
  const nextState: CompanyState = {
    turn: state.turn + 1,
    materialUnits: rawUnitsEnd,
    finishedUnits: finUnitsEnd,
    materialIndex: options.nextMaterialIndex ?? state.materialIndex,
    rdStock: state.rdStock + rdSpend,
    condition: conditionNext,
    // 買収で受け入れた人員は期末に合流（翌期から人件費・労働能力に反映）。
    headcount: headcount + acqHeads,
    // 株式が未設定のシナリオ（チュートリアル等）は未設定のまま保つ（後方互換）。
    sharesOutstanding:
      state.sharesOutstanding == null && newShares === 0 && ipoShares === 0 && acqStockShares === 0
        ? undefined
        : (state.sharesOutstanding ?? 0) + newShares + ipoShares + acqStockShares,
    // 調達累積（目標の「稼いだ純資産」判定に使う）。未調達なら undefined のまま（セーブ後方互換）。
    paidInSinceStart:
      state.paidInSinceStart == null && equityIssue + ipoProceeds + acqStock === 0
        ? undefined
        : (state.paidInSinceStart ?? 0) + equityIssue + ipoProceeds + acqStock,
    // 上場ステータス（IPO 成立で true。未上場は undefined のまま＝セーブ後方互換）。
    listed: listedNow ? true : undefined,
    // 競合買収ステータス（成立で true・以後シェア争い消滅＋需要ブースト）。
    acquiredCompetitor: acquiredNow ? true : undefined,
    balanceSheet: {
      currentAssets: {
        cash: cashEnd,
        accountsReceivable: arEnd,
        rawMaterials: rawValEnd,
        finishedGoods: finValEnd,
      },
      fixedAssets: {
        equipment: bs.fixedAssets.equipment - nonCashEquipReduction + capex + acqEquipment,
        // のれん＝期首−償却＋当期買収分。未保有なら undefined のまま（後方互換）。
        goodwill:
          bs.fixedAssets.goodwill == null && acqGoodwill === 0
            ? undefined
            : goodwillBegin - goodwillAmort + acqGoodwill,
      },
      currentLiabilities: {
        accountsPayable: apEnd,
        shortTermDebt: bs.currentLiabilities.shortTermDebt,
      },
      nonCurrentLiabilities: {
        longTermDebt: bs.nonCurrentLiabilities.longTermDebt + financing + acqDebt,
      },
      equity: {
        capitalStock: bs.equity.capitalStock + equityIssue + ipoProceeds + acqStock,
        retainedEarnings: bs.equity.retainedEarnings + netIncome - dividendPaid,
      },
    },
  }

  return {
    state: nextState,
    incomeStatement,
    cashFlow,
    unitsSold,
    demand,
    availableToSell,
    effectiveUnitCost: spotCost,
    product,
    deltaAR,
    deltaInventory,
    deltaAP,
    creditGrade: credit.grade,
    effectiveInterestRate,
    appliedFinancing: financing,
    insuranceCoverage,
    attritionQuits,
    dividendPaid,
    ipoProceeds,
    goodwillAmortized: goodwillAmort,
    acquisitionConsideration,
    shockOneOffLoss: oneOffLoss,
    shockEquipmentWritedown: equipmentWritedown,
    capacity,
  }
}
