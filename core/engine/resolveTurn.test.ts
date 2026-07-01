import { describe, it, expect } from 'vitest'
import type { CompanyState, Decision, SimParams } from '@core/types'
import { balances, totalAssets, totalLiabilities, totalEquity } from '@core/statements/identity'
import { resolveTurn, marketingMultiplier } from './resolveTurn'

/** 判断を作るヘルパ（未指定は 0）。 */
const decide = (d: Partial<Decision> = {}): Decision => ({
  unitPrice: 2_000,
  purchaseMaterials: 0,
  produceUnits: 0,
  marketingSpend: 0,
  rdSpend: 0,
  insuranceSpend: 0,
  maintenanceSpend: 0,
  capitalExpenditure: 0,
  hire: 0,
  fire: 0,
  wageLevel: 100,
  equityIssuance: 0,
  financing: 0,
  ...d,
})

// テスト用の安定した基準（シナリオの再バランスに影響されない大きめの設定。
// 生産能力キャップは未設定＝無制限なので、生産数量はそのまま反映される）。
const BASE_PARAMS: SimParams = {
  periodsPerYear: 12,
  baseDemand: 1_000,
  basePrice: 2_000,
  priceElasticity: 1.2,
  competitorStrength: 0.3,
  unitVariableCost: 1_000,
  materialVolatility: 0.15,
  materialMeanReversion: 0.3,
  fixedCosts: 500_000,
  depreciationRate: 0.1,
  salesOnCreditRatio: 0.4,
  payableRatio: 0.3,
  insuranceRefCost: 200_000,
  maxInsuranceCoverage: 0.8,
  marketingEffect: 0.5,
  marketingHalf: 200_000,
  rdCostReductionMax: 0.4,
  rdDemandBoostMax: 0.5,
  rdHalf: 1_000_000,
  interestRate: 0.03,
  effectiveTaxRate: 0.3,
}
const BASE_STATE: CompanyState = {
  turn: 0,
  materialUnits: 500,
  finishedUnits: 500,
  materialIndex: 1,
  rdStock: 0,
  balanceSheet: {
    currentAssets: { cash: 5_000_000, accountsReceivable: 0, rawMaterials: 500_000, finishedGoods: 500_000 },
    fixedAssets: { equipment: 4_000_000 },
    currentLiabilities: { accountsPayable: 0, shortTermDebt: 0 },
    nonCurrentLiabilities: { longTermDebt: 3_000_000 },
    equity: { capitalStock: 5_000_000, retainedEarnings: 2_000_000 },
  },
}
const base = () => ({ initialState: BASE_STATE, params: BASE_PARAMS })

describe('resolveTurn（原材料インベントリ・発生主義モデル）', () => {
  it('解決後も会計恒等式（資産 = 負債 + 純資産）が成立する', () => {
    const { initialState, params } = base()
    const { state } = resolveTurn(initialState, decide({ purchaseMaterials: 600, produceUnits: 700 }), params)
    expect(balances(state.balanceSheet)).toBe(true)
  })

  it('利益剰余金は期首＋当期純利益で繰り越される', () => {
    const { initialState, params } = base()
    const before = initialState.balanceSheet.equity.retainedEarnings
    const { state, incomeStatement } = resolveTurn(initialState, decide({ produceUnits: 300 }), params)
    expect(state.balanceSheet.equity.retainedEarnings).toBe(before + incomeStatement.netIncome)
  })

  it('CF の期末現金が B/S の現金と一致し、純増減と整合する', () => {
    const { initialState, params } = base()
    const { state, cashFlow } = resolveTurn(
      initialState,
      decide({ purchaseMaterials: 400, produceUnits: 400 }),
      params,
    )
    expect(cashFlow.cashEnd).toBe(state.balanceSheet.currentAssets.cash)
    expect(cashFlow.cashEnd).toBe(cashFlow.cashBegin + cashFlow.netChange)
    expect(cashFlow.netChange).toBe(cashFlow.operating + cashFlow.investing + cashFlow.financing)
  })

  it('営業 CF = 純利益 + 減価償却 − ΔAR − Δ棚卸 + ΔAP（間接法の整合）', () => {
    const { initialState, params } = base()
    const ppy = params.periodsPerYear ?? 1
    const dep = Math.round((initialState.balanceSheet.fixedAssets.equipment * params.depreciationRate) / ppy)
    const r = resolveTurn(initialState, decide({ purchaseMaterials: 800, produceUnits: 500 }), params)
    expect(r.cashFlow.operating).toBe(
      r.incomeStatement.netIncome + dep - r.deltaAR - r.deltaInventory + r.deltaAP,
    )
  })

  it('原材料を仕入れると原材料の数量と評価額が増える', () => {
    const { initialState, params } = base()
    const u0 = initialState.materialUnits
    const v0 = initialState.balanceSheet.currentAssets.rawMaterials
    const { state } = resolveTurn(initialState, decide({ purchaseMaterials: 300 }), params)
    expect(state.materialUnits).toBe(u0 + 300)
    expect(state.balanceSheet.currentAssets.rawMaterials).toBeGreaterThan(v0)
  })

  it('生産は原材料を製品へ価値保存で振替する（恒等式維持）', () => {
    const { initialState, params } = base()
    const before = initialState.balanceSheet.currentAssets
    const totalInvBefore = before.rawMaterials + before.finishedGoods
    // 仕入なし・需要0（価格を十分高く）にして、原材料→製品の振替だけを見る
    const { state } = resolveTurn(initialState, decide({ unitPrice: 2_000_000, produceUnits: 200 }), params)
    const after = state.balanceSheet.currentAssets
    // 製造原価以外の現金変動がなければ、原材料↓＝製品↑で棚卸合計は不変
    expect(after.rawMaterials).toBeLessThan(before.rawMaterials)
    expect(after.finishedGoods).toBeGreaterThan(before.finishedGoods)
    expect(after.rawMaterials + after.finishedGoods).toBe(totalInvBefore)
    expect(state.materialUnits).toBe(initialState.materialUnits - 200)
    expect(state.finishedUnits).toBe(initialState.finishedUnits + 200)
    expect(balances(state.balanceSheet)).toBe(true)
  })

  it('生産は手持ち原材料が上限（在庫切れ時）', () => {
    const { initialState, params } = base()
    // 期首原材料 500個、仕入なし、生産1000要求 → 500 までしか作れない（需要0で販売なし）
    const { state } = resolveTurn(initialState, decide({ unitPrice: 2_000_000, produceUnits: 1_000 }), params)
    expect(state.materialUnits).toBe(0)
    expect(state.finishedUnits).toBe(initialState.finishedUnits + 500)
  })

  it('販売は製品在庫が上限', () => {
    const { initialState, params } = base()
    // 期首製品 500個、生産なし、十分な低価格で需要を在庫超に → 500 までしか売れない
    const { unitsSold } = resolveTurn(initialState, decide({ unitPrice: 300, produceUnits: 0 }), params)
    expect(unitsSold).toBe(500)
  })

  it('periodsPerYear で流量（需要・固定費・減価償却・利息）がスケールする', () => {
    const { initialState, params } = base() // ppy=4
    const annual = { ...params, periodsPerYear: 1 }
    const dAnnual = resolveTurn(initialState, decide({ purchaseMaterials: 2_000, produceUnits: 2_000 }), annual)
    const dQuarter = resolveTurn(initialState, decide({ purchaseMaterials: 2_000, produceUnits: 2_000 }), params)
    // 四半期の販売数量・固定費は年次の約 1/4
    expect(dQuarter.unitsSold).toBeLessThan(dAnnual.unitsSold)
    expect(dQuarter.incomeStatement.operatingExpenses).toBeLessThan(dAnnual.incomeStatement.operatingExpenses)
    expect(balances(dQuarter.state.balanceSheet)).toBe(true)
  })

  it('掛け売り比率に応じて売掛金、原材料仕入の掛けに応じて買掛金が立つ', () => {
    const { initialState, params } = base()
    const { state, incomeStatement, effectiveUnitCost } = resolveTurn(
      initialState,
      decide({ purchaseMaterials: 200, produceUnits: 200 }),
      params,
    )
    expect(state.balanceSheet.currentAssets.accountsReceivable).toBe(
      Math.round(incomeStatement.revenue * params.salesOnCreditRatio),
    )
    expect(state.balanceSheet.currentLiabilities.accountsPayable).toBe(
      Math.round(effectiveUnitCost * 200 * params.payableRatio),
    )
  })

  it('スポット単価は materialIndex と R&D を反映する', () => {
    const { initialState, params } = base()
    const baseCost = resolveTurn(initialState, decide(), params).effectiveUnitCost
    const pricey = resolveTurn({ ...initialState, materialIndex: 1.5 }, decide(), params).effectiveUnitCost
    const researched = resolveTurn({ ...initialState, rdStock: 3_000_000 }, decide(), params).effectiveUnitCost
    expect(pricey).toBeGreaterThan(baseCost)
    expect(researched).toBeLessThan(baseCost)
  })

  it('R&Dは同じ価格でも需要（販売数量）を増やす', () => {
    const { initialState, params } = base()
    // 製品を十分用意（生産1000 + 原材料1000仕入）
    const setup = decide({ purchaseMaterials: 1_000, produceUnits: 1_000 })
    const baseSold = resolveTurn(initialState, setup, params).unitsSold
    const researched = resolveTurn({ ...initialState, rdStock: 3_000_000 }, setup, params).unitsSold
    expect(researched).toBeGreaterThan(baseSold)
  })

  it('R&D費は当期費用として計上され rdStock に累積する', () => {
    const { initialState, params } = base()
    const a = resolveTurn(initialState, decide({ rdSpend: 0 }), params)
    const b = resolveTurn(initialState, decide({ rdSpend: 300_000 }), params)
    expect(b.incomeStatement.operatingExpenses).toBe(a.incomeStatement.operatingExpenses + 300_000)
    expect(b.state.rdStock).toBe(initialState.rdStock + 300_000)
  })

  it('原材料スポット価格が変動しても恒等式は崩れない（複数ターン）', () => {
    const { initialState, params } = base()
    let s: CompanyState = initialState
    for (let t = 0; t < 10; t++) {
      const r = resolveTurn(s, decide({ purchaseMaterials: 600, produceUnits: 550, unitPrice: 2_100 }), params, {
        demandMultiplier: 0.9 + (t % 3) * 0.2,
        nextMaterialIndex: 1 + ((t % 5) - 2) * 0.1, // 0.8〜1.2 を巡回
      })
      s = r.state
      expect(balances(s.balanceSheet)).toBe(true)
      // 数量×金額の整合（数量0なら評価額0）
      if (s.materialUnits === 0) expect(s.balanceSheet.currentAssets.rawMaterials).toBe(0)
      if (s.finishedUnits === 0) expect(s.balanceSheet.currentAssets.finishedGoods).toBe(0)
    }
    expect(s.turn).toBe(10)
  })

  it('増資は現金と資本金を同額増やし、財務CFに乗り、恒等式を保つ', () => {
    const { initialState, params } = base()
    const state: CompanyState = { ...initialState, sharesOutstanding: 1_000 }
    const r = resolveTurn(state, decide({ produceUnits: 0, equityIssuance: 500_000 }), params)
    // 資本金 +500,000、現金は財務CFに +500,000 反映
    expect(r.state.balanceSheet.equity.capitalStock).toBe(state.balanceSheet.equity.capitalStock + 500_000)
    expect(r.cashFlow.financing).toBe(500_000)
    expect(r.cashFlow.cashEnd).toBe(r.state.balanceSheet.currentAssets.cash)
    expect(balances(r.state.balanceSheet)).toBe(true)
  })

  it('増資で発行済株数が増える（簿価発行・希薄化）', () => {
    const { initialState, params } = base()
    // 純資産7,000,000・1,000株 → BVPS 7,000。350万円増資 → 500株発行 → 1,500株。
    const state: CompanyState = { ...initialState, sharesOutstanding: 1_000 }
    const equityBegin = totalEquity(state.balanceSheet) // 7,000,000
    const r = resolveTurn(state, decide({ produceUnits: 0, equityIssuance: equityBegin / 2 }), params)
    expect(r.state.sharesOutstanding).toBe(1_500) // +500株（半額分）
    expect(balances(r.state.balanceSheet)).toBe(true)
  })

  it('増資と借入は別の財務調達だが、合算で財務CF＝Δcash 整合', () => {
    const { initialState, params } = base()
    const state: CompanyState = { ...initialState, sharesOutstanding: 1_000 }
    const r = resolveTurn(state, decide({ produceUnits: 0, equityIssuance: 200_000, financing: 300_000 }), params)
    expect(r.cashFlow.financing).toBe(500_000) // 借入300,000＋増資200,000
    expect(r.state.balanceSheet.equity.capitalStock).toBe(state.balanceSheet.equity.capitalStock + 200_000)
    expect(balances(r.state.balanceSheet)).toBe(true)
  })

  it('株式未設定のシナリオは増資0で sharesOutstanding を未設定のまま保つ（後方互換）', () => {
    const { initialState, params } = base()
    // initialState は sharesOutstanding を持たない（undefined）
    const r = resolveTurn(initialState, decide({ produceUnits: 0 }), params)
    expect(initialState.sharesOutstanding).toBeUndefined()
    expect(r.state.sharesOutstanding).toBeUndefined() // 0 に変わらない
  })

  it('設備投資・借入をしても恒等式は崩れない', () => {
    const { initialState, params } = base()
    const { state } = resolveTurn(
      initialState,
      decide({
        unitPrice: 2_500,
        purchaseMaterials: 800,
        produceUnits: 700,
        marketingSpend: 100_000,
        rdSpend: 300_000,
        capitalExpenditure: 1_000_000,
        financing: 800_000,
      }),
      params,
    )
    expect(totalAssets(state.balanceSheet)).toBe(
      totalLiabilities(state.balanceSheet) + totalEquity(state.balanceSheet),
    )
  })

  it('マイナスの設備投資は 0 に丸められ、設備簿価を負にしない', () => {
    const { initialState, params } = base()
    const eq0 = initialState.balanceSheet.fixedAssets.equipment
    const { state, cashFlow } = resolveTurn(
      initialState,
      decide({ capitalExpenditure: -(eq0 + 10_000_000) }),
      params,
    )
    // 負の capex は無効化（減価償却のみ設備が減り、負にはならない・投資CFに架空の流入なし）。
    expect(state.balanceSheet.fixedAssets.equipment).toBeGreaterThanOrEqual(0)
    expect(state.balanceSheet.fixedAssets.equipment).toBeLessThanOrEqual(eq0)
    expect(cashFlow.investing === 0).toBe(true) // -0 でも 0（架空の現金流入なし）
    expect(balances(state.balanceSheet)).toBe(true)
  })

  it('信用枠を超える借入はキャップされる（D格付けは借入凍結）', () => {
    const { initialState, params } = base()
    // 資産1,000万 = 負債900万 + 純資産100万（自己資本比率0.1→D）。恒等式を満たす弱い状態。
    const weak: CompanyState = {
      ...initialState,
      balanceSheet: {
        ...initialState.balanceSheet,
        nonCurrentLiabilities: { longTermDebt: 9_000_000 },
        equity: { capitalStock: 5_000_000, retainedEarnings: -4_000_000 },
      },
    }
    expect(balances(weak.balanceSheet)).toBe(true)
    const r = resolveTurn(weak, decide({ financing: 5_000_000 }), params)
    expect(r.creditGrade).toBe('D')
    expect(r.appliedFinancing).toBe(0)
    expect(balances(r.state.balanceSheet)).toBe(true)
  })

  it('信用力が低いほど実効金利が高い', () => {
    const { initialState, params } = base()
    const strong = resolveTurn(initialState, decide(), params).effectiveInterestRate
    const weakState: CompanyState = {
      ...initialState,
      balanceSheet: {
        ...initialState.balanceSheet,
        nonCurrentLiabilities: { longTermDebt: 9_000_000 },
        equity: { capitalStock: 5_000_000, retainedEarnings: -4_000_000 },
      },
    }
    const weak = resolveTurn(weakState, decide(), params).effectiveInterestRate
    expect(weak).toBeGreaterThan(strong)
  })

  it('競合シェア倍率は需要（販売数量）に作用する', () => {
    const { initialState, params } = base()
    const setup = decide({ purchaseMaterials: 2_000, produceUnits: 2_000 })
    const baseSold = resolveTurn(initialState, setup, params, { demandShareMultiplier: 1 }).unitsSold
    const low = resolveTurn(initialState, setup, params, { demandShareMultiplier: 0.6 }).unitsSold
    expect(low).toBeLessThan(baseSold)
  })

  it('突発ショック（一時損失）は特別損失となり、恒等式・CF整合を保つ', () => {
    const { initialState, params } = base()
    const r = resolveTurn(initialState, decide({ produceUnits: 0 }), params, { oneOffLoss: 700_000 })
    expect(r.incomeStatement.extraordinaryLoss).toBe(700_000) // 保険なし→全額
    expect(balances(r.state.balanceSheet)).toBe(true)
    expect(r.cashFlow.cashEnd).toBe(r.state.balanceSheet.currentAssets.cash)
  })

  it('保険は特別損失を補償率ぶん軽減する', () => {
    const { initialState, params } = base()
    // insuranceRefCost 200,000・maxCoverage 0.8。保険料200,000で補償0.8
    const insured = resolveTurn(initialState, decide({ insuranceSpend: 200_000 }), params, {
      oneOffLoss: 1_000_000,
    })
    expect(insured.insuranceCoverage).toBeCloseTo(0.8)
    expect(insured.incomeStatement.extraordinaryLoss).toBe(200_000) // (1-0.8)*1,000,000
    expect(balances(insured.state.balanceSheet)).toBe(true)
  })

  it('設備毀損は設備簿価を減らし、恒等式を保つ', () => {
    const { initialState, params } = base()
    const before = initialState.balanceSheet.fixedAssets.equipment
    const dep = Math.round((before * params.depreciationRate) / (params.periodsPerYear ?? 1))
    const r = resolveTurn(initialState, decide({ produceUnits: 0 }), params, { equipmentLoss: 1_000_000 })
    expect(r.state.balanceSheet.fixedAssets.equipment).toBe(before - dep - 1_000_000)
    expect(balances(r.state.balanceSheet)).toBe(true)
    // 営業CFは純利益＋(減価償却＋設備毀損)−ΔAR−Δ棚卸＋ΔAP で整合
    expect(r.cashFlow.operating).toBe(
      r.incomeStatement.netIncome + dep + 1_000_000 - r.deltaAR - r.deltaInventory + r.deltaAP,
    )
  })

  // --- 規模連動ショック（設備故障＝設備簿価、訴訟＝売上＋利益、毀損度ばらつき severity） ---
  /** equipment を変えても恒等式を保つ残高（差額を現金で調整。資産=負債+純資産=10,000,000）。 */
  const withEquipment = (equipment: number): CompanyState => ({
    ...BASE_STATE,
    balanceSheet: {
      ...BASE_STATE.balanceSheet,
      currentAssets: { ...BASE_STATE.balanceSheet.currentAssets, cash: 9_000_000 - equipment },
      fixedAssets: { equipment },
    },
  })

  it('設備故障は設備簿価に比例する（規模連動）', () => {
    const { params } = base()
    const opts = { equipmentLossRatio: 0.13, equipmentLoss: 40_000 }
    const big = resolveTurn(withEquipment(4_000_000), decide({ produceUnits: 0 }), params, opts)
    const mid = resolveTurn(withEquipment(1_000_000), decide({ produceUnits: 0 }), params, opts)
    expect(big.shockEquipmentWritedown).toBe(Math.round(4_000_000 * 0.13)) // 520,000
    expect(mid.shockEquipmentWritedown).toBe(Math.round(1_000_000 * 0.13)) // 130,000
    expect(big.shockEquipmentWritedown).toBeGreaterThan(mid.shockEquipmentWritedown)
    expect(balances(big.state.balanceSheet)).toBe(true)
  })

  it('小規模では設備故障の下限(floor)が効く', () => {
    const { params } = base()
    const r = resolveTurn(withEquipment(100_000), decide({ produceUnits: 0 }), params, {
      equipmentLossRatio: 0.13, // 0.13×100,000=13,000 < floor 40,000
      equipmentLoss: 40_000,
    })
    expect(r.shockEquipmentWritedown).toBe(40_000)
    expect(balances(r.state.balanceSheet)).toBe(true)
  })

  it('設備毀損は規模連動でも簿価を超えず、設備をマイナスにしない（クリップ）', () => {
    const { params } = base()
    const r = resolveTurn(withEquipment(50_000), decide({ produceUnits: 0 }), params, {
      equipmentLoss: 100_000, // floor が簿価超
      equipmentLossRatio: 0.13,
    })
    expect(r.shockEquipmentWritedown).toBeLessThan(100_000) // 簿価クリップが優先
    expect(r.state.balanceSheet.fixedAssets.equipment).toBeGreaterThanOrEqual(0)
    expect(balances(r.state.balanceSheet)).toBe(true)
  })

  it('訴訟は売上規模に連動する（年換算売上×係数）', () => {
    const { initialState, params } = base()
    const r = resolveTurn(initialState, decide({ unitPrice: 2_000 }), params, {
      oneOffLossRevenueRatio: 0.5,
    })
    const annualRev = r.incomeStatement.revenue * (params.periodsPerYear ?? 1)
    expect(r.shockOneOffLoss).toBe(Math.round(0.5 * annualRev))
    expect(r.shockOneOffLoss).toBeGreaterThan(0)
    expect(balances(r.state.balanceSheet)).toBe(true)
  })

  it('訴訟は利益にも連動し、赤字なら利益項は0（売上項のみ）', () => {
    const { initialState } = base()
    // 黒字: 固定費・減価償却を消して必ず営業黒字に
    const profitParams: SimParams = { ...BASE_PARAMS, fixedCosts: 0, depreciationRate: 0 }
    const revOnly = resolveTurn(initialState, decide({ unitPrice: 2_000 }), profitParams, {
      oneOffLossRevenueRatio: 0.09,
    })
    const withProfit = resolveTurn(initialState, decide({ unitPrice: 2_000 }), profitParams, {
      oneOffLossRevenueRatio: 0.09,
      oneOffLossProfitRatio: 0.2,
    })
    expect(revOnly.incomeStatement.operatingIncome).toBeGreaterThan(0)
    expect(withProfit.shockOneOffLoss).toBeGreaterThan(revOnly.shockOneOffLoss)

    // 赤字: 需要0（高すぎる価格）で売上0・営業赤字 → 利益項0、floorのみ
    const lossParams: SimParams = { ...BASE_PARAMS, fixedCosts: 5_000_000 }
    const red = resolveTurn(initialState, decide({ unitPrice: 9_999_999, produceUnits: 0 }), lossParams, {
      oneOffLoss: 50_000,
      oneOffLossRevenueRatio: 0.09,
      oneOffLossProfitRatio: 0.2,
    })
    expect(red.incomeStatement.operatingIncome).toBeLessThan(0)
    expect(red.shockOneOffLoss).toBe(50_000) // 売上0＋利益項0 → floor
    expect(balances(red.state.balanceSheet)).toBe(true)
  })

  it('訴訟の上限(cap)で一時損失が年商比に抑えられる（floor優先）', () => {
    const { initialState, params } = base()
    const r = resolveTurn(initialState, decide({ unitPrice: 2_000 }), params, {
      oneOffLossRevenueRatio: 5.0, // 過大
      oneOffLossCapRatio: 0.6,
    })
    const annualRev = r.incomeStatement.revenue * (params.periodsPerYear ?? 1)
    expect(r.shockOneOffLoss).toBe(Math.round(0.6 * annualRev)) // cap でクリップ
    expect(r.shockOneOffLoss).toBeLessThan(Math.round(5.0 * annualRev))
    expect(balances(r.state.balanceSheet)).toBe(true)
  })

  it('毀損度 severity は連動損失に乗る（未指定=中心値1）', () => {
    const { initialState, params } = base()
    const opts = { equipmentLossRatio: 0.1 } // floor 0
    const mid = resolveTurn(initialState, decide({ produceUnits: 0 }), params, opts)
    const heavy = resolveTurn(initialState, decide({ produceUnits: 0 }), params, {
      ...opts,
      lossSeverity: 1.5,
    })
    expect(mid.shockEquipmentWritedown).toBe(Math.round(4_000_000 * 0.1)) // severity未指定=1
    expect(heavy.shockEquipmentWritedown).toBe(Math.round(4_000_000 * 0.1 * 1.5))
  })

  it('保全費は設備故障の被害を軽減し、費用として計上される（恒等式維持）', () => {
    const params: SimParams = { ...BASE_PARAMS, maintenanceRefCost: 30_000, maxMaintenanceReduction: 0.7 }
    const opts = { equipmentLossRatio: 0.13, equipmentLoss: 40_000 }
    const none = resolveTurn(BASE_STATE, decide({ produceUnits: 0 }), params, opts)
    // 保全費 21,000 = 30,000×0.7 で最大軽減(70%)。設備故障の被害が 30% に。
    const maint = resolveTurn(BASE_STATE, decide({ produceUnits: 0, maintenanceSpend: 21_000 }), params, opts)
    expect(maint.shockEquipmentWritedown).toBe(Math.round(none.shockEquipmentWritedown * 0.3))
    // 保全費は販管費に乗る（営業利益が保全費分だけ下がる）
    expect(maint.incomeStatement.operatingExpenses - none.incomeStatement.operatingExpenses).toBe(21_000)
    expect(balances(maint.state.balanceSheet)).toBe(true)
  })

  it('保全費の軽減率は上限（maxMaintenanceReduction）で頭打ち', () => {
    const params: SimParams = { ...BASE_PARAMS, maintenanceRefCost: 30_000, maxMaintenanceReduction: 0.7 }
    const opts = { equipmentLossRatio: 0.13 }
    const none = resolveTurn(BASE_STATE, decide({ produceUnits: 0 }), params, opts)
    // 大金を投じても削減は70%まで（被害は最低でも30%残る）
    const huge = resolveTurn(BASE_STATE, decide({ produceUnits: 0, maintenanceSpend: 9_999_999 }), params, opts)
    expect(huge.shockEquipmentWritedown).toBe(Math.round(none.shockEquipmentWritedown * 0.3))
  })

  it('整備状態 condition は保全費で上がり放置で下がる（clamp01・恒等式不変）', () => {
    const params: SimParams = {
      ...BASE_PARAMS,
      maintenanceRefCost: 30_000,
      conditionDecay: 0.03,
      conditionGainPerRefCost: 0.1,
    }
    const start: CompanyState = { ...BASE_STATE, condition: 0.5 }
    // 保全費 30,000 → gain 0.1、decay 0.03 → +0.07
    const up = resolveTurn(start, decide({ maintenanceSpend: 30_000 }), params)
    expect(up.state.condition).toBeCloseTo(0.57)
    // 保全費0 → decay のみ
    const down = resolveTurn(start, decide({ maintenanceSpend: 0 }), params)
    expect(down.state.condition).toBeCloseTo(0.47)
    // clamp 上限（1 を超えない）
    const high = resolveTurn({ ...BASE_STATE, condition: 0.98 }, decide({ maintenanceSpend: 60_000 }), params)
    expect(high.state.condition).toBe(1)
    expect(balances(up.state.balanceSheet)).toBe(true)
  })

  it('conditionDecay 未設定なら condition は据置（後方互換）', () => {
    const r = resolveTurn({ ...BASE_STATE, condition: 0.4 }, decide({}), BASE_PARAMS)
    expect(r.state.condition).toBe(0.4)
  })

  it('後方互換: 比率未指定なら floor(絶対額)がそのまま損失になる', () => {
    const { initialState, params } = base()
    const r = resolveTurn(initialState, decide({ produceUnits: 0 }), params, {
      oneOffLoss: 700_000,
      equipmentLoss: 300_000,
    })
    expect(r.shockOneOffLoss).toBe(700_000)
    expect(r.shockEquipmentWritedown).toBe(300_000)
  })

  it('生産能力が生産数量の上限になる（設備に比例）', () => {
    const { initialState, params } = base()
    // 年間能力 = 設備4,000,000 × 0.0006 = 2,400 → 月次 = floor(2400/12) = 200
    const capped: SimParams = { ...params, capacityPerEquipment: 0.0006 }
    const r = resolveTurn(initialState, decide({ unitPrice: 2_000_000, produceUnits: 1_000 }), capped)
    expect(r.capacity).toBe(200)
    expect(r.state.finishedUnits).toBe(initialState.finishedUnits + 200) // 1000要求でも200まで
    expect(balances(r.state.balanceSheet)).toBe(true)
  })

  // --- 人的リソース（雇用・人件費・労働能力） ---
  const laborParams: SimParams = {
    ...BASE_PARAMS,
    wage: 12_000,
    laborPerHead: 120,
    hireCost: 10_000,
    severance: 8_000,
  }

  it('生産能力は設備能力と労働能力の小さい方（設備か人手のボトルネック）', () => {
    // 設備 4,000,000×0.0006/12 = 200/月、労働 5人×120/12 = 50/月 → min=50（人手律速）
    const params: SimParams = { ...laborParams, capacityPerEquipment: 0.0006 }
    const r1 = resolveTurn({ ...BASE_STATE, headcount: 5 }, decide({}), params)
    expect(r1.capacity).toBe(50)
    // 20人に増やすと労働 20×120/12 = 200/月 → min(200,200)=200（設備律速に切替）
    const r2 = resolveTurn({ ...BASE_STATE, headcount: 20 }, decide({}), params)
    expect(r2.capacity).toBe(200)
  })

  it('労働能力が生産数量の上限になる（手持ち原材料は十分でも人手で頭打ち）', () => {
    const state: CompanyState = { ...BASE_STATE, headcount: 5 }
    const r = resolveTurn(state, decide({ purchaseMaterials: 1_000, produceUnits: 1_000 }), laborParams)
    expect(r.capacity).toBe(50) // 5人×120/12
    expect(r.state.finishedUnits).toBeLessThanOrEqual(state.finishedUnits + 50)
    expect(balances(r.state.balanceSheet)).toBe(true)
  })

  it('人件費・採用費・退職金が販管費に乗り、従業員数が更新される（恒等式維持）', () => {
    const state: CompanyState = { ...BASE_STATE, headcount: 5 }
    const baseR = resolveTurn(state, decide({}), laborParams) // 人件費 5×12,000/12 = 5,000/月
    const hired = resolveTurn(state, decide({ hire: 2 }), laborParams)
    expect(hired.state.headcount).toBe(7)
    // 人件費増 +2,000（7×12,000/12=7,000）＋ 採用費 2×10,000=20,000 → opEx +22,000
    expect(
      hired.incomeStatement.operatingExpenses - baseR.incomeStatement.operatingExpenses,
    ).toBe(22_000)
    expect(balances(hired.state.balanceSheet)).toBe(true)

    const fired = resolveTurn(state, decide({ fire: 1 }), laborParams)
    expect(fired.state.headcount).toBe(4)
    // 人件費減 −1,000（4×12,000/12=4,000）＋ 退職金 8,000 → opEx +7,000
    expect(
      fired.incomeStatement.operatingExpenses - baseR.incomeStatement.operatingExpenses,
    ).toBe(7_000)
    expect(balances(fired.state.balanceSheet)).toBe(true)
  })

  it('在籍数を超える退職は実退職数までで退職金も頭打ち（幽霊費用を出さない）', () => {
    const state: CompanyState = { ...BASE_STATE, headcount: 3 }
    const baseR = resolveTurn(state, decide({}), laborParams) // 人件費 3×12,000/12 = 3,000
    const r = resolveTurn(state, decide({ fire: 10 }), laborParams) // 在籍3 → 実退職3
    expect(r.state.headcount).toBe(0)
    // 退職金 3×8,000=24,000 − 人件費減3,000 → opEx +21,000（10人分ではない）
    expect(r.incomeStatement.operatingExpenses - baseR.incomeStatement.operatingExpenses).toBe(24_000 - 3_000)
    expect(balances(r.state.balanceSheet)).toBe(true)
  })

  it('給与水準（待遇）で人件費が変わり、相場割れで自主退職が起きる（インフレ連動）', () => {
    const params: SimParams = { ...laborParams, attritionSlope: 0.5, maxAttrition: 0.3 }
    const state: CompanyState = { ...BASE_STATE, headcount: 10 }
    // 相場100%: 人件費 10×12,000/12=10,000、離職0
    const market = resolveTurn(state, decide({ wageLevel: 100 }), params)
    expect(market.attritionQuits).toBe(0)
    expect(market.state.headcount).toBe(10)
    // 待遇80%: 人件費 10×12,000×0.8/12=8,000（−2,000）、離職率 0.5×0.2=0.10 → 10人×0.10=1人離職
    const low = resolveTurn(state, decide({ wageLevel: 80 }), params)
    expect(low.attritionQuits).toBe(1)
    expect(low.state.headcount).toBe(9)
    // 人件費は離職後の人数で計算: 9×12,000×0.8/12 = 7,200
    expect(low.incomeStatement.operatingExpenses).toBeLessThan(market.incomeStatement.operatingExpenses)
    expect(balances(low.state.balanceSheet)).toBe(true)
  })

  it('物価上昇で市場賃金が上がる（同じ給与水準100%でも人件費が増える＝インフレ連動）', () => {
    // 固定費0で人件費だけ物価連動を見る（fixedCosts も物価連動するため）。
    const params: SimParams = { ...laborParams, fixedCosts: 0 }
    const state: CompanyState = { ...BASE_STATE, headcount: 10 }
    const normal = resolveTurn(state, decide({ wageLevel: 100 }), params) // 物価1.0
    const inflated = resolveTurn(state, decide({ wageLevel: 100 }), params, { inflationIndex: 1.2 })
    // 人件費 normal=10×12,000/12=10,000、inflated=10×12,000×1.2/12=12,000 → opEx差 2,000
    expect(inflated.incomeStatement.operatingExpenses - normal.incomeStatement.operatingExpenses).toBe(2_000)
  })

  it('労働モデル未設定なら人件費・労働制約なし（後方互換）', () => {
    const r = resolveTurn(
      { ...BASE_STATE, headcount: 5 },
      decide({ produceUnits: 100, purchaseMaterials: 100, hire: 3 }),
      BASE_PARAMS,
    )
    expect(r.capacity).toBe(Number.POSITIVE_INFINITY) // capacityPerEquipment も laborPerHead も未設定
    expect(r.state.headcount).toBe(8) // 数は更新されるが費用は発生しない
  })

  it('設備が大きいほど実効原価が下がる（規模の経済）', () => {
    const { initialState, params } = base()
    const withScale: SimParams = { ...params, scaleEconomyMax: 0.2, scaleEconomyHalf: 1_000_000 }
    const small = resolveTurn(
      { ...initialState, balanceSheet: { ...initialState.balanceSheet, fixedAssets: { equipment: 500_000 } } },
      decide(),
      withScale,
    ).effectiveUnitCost
    const big = resolveTurn(
      { ...initialState, balanceSheet: { ...initialState.balanceSheet, fixedAssets: { equipment: 8_000_000 } } },
      decide(),
      withScale,
    ).effectiveUnitCost
    expect(big).toBeLessThan(small)
  })

  it('インフレ（物価指数>1）でスポット単価が上がる／デフレ(<1)で下がる', () => {
    const { initialState, params } = base()
    const at = (idx: number) =>
      resolveTurn(initialState, decide(), params, { inflationIndex: idx }).effectiveUnitCost
    expect(at(1.2)).toBeGreaterThan(at(1.0))
    expect(at(0.8)).toBeLessThan(at(1.0))
  })

  it('政策金利が実効金利に上乗せされる', () => {
    const { initialState, params } = base()
    const r0 = resolveTurn(initialState, decide(), params).effectiveInterestRate
    const r1 = resolveTurn(initialState, decide(), params, { policyRate: 0.03 }).effectiveInterestRate
    expect(r1).toBeCloseTo(r0 + 0.03)
    expect(balances(resolveTurn(initialState, decide(), params, { policyRate: 0.03 }).state.balanceSheet)).toBe(true)
  })

  it('需要ブレ(demandNoise)は需要に作用し、未指定なら中心値（恒等式は維持）', () => {
    const { initialState, params } = base()
    const setup = decide({ purchaseMaterials: 2_000, produceUnits: 2_000 })
    const central = resolveTurn(initialState, setup, params).demand
    const high = resolveTurn(initialState, setup, params, { demandNoise: 1.2 }).demand
    const low = resolveTurn(initialState, setup, params, { demandNoise: 0.8 }).demand
    expect(high).toBeGreaterThan(central)
    expect(low).toBeLessThan(central)
    expect(resolveTurn(initialState, setup, params).demand).toBe(central) // 未指定=中心値
    expect(balances(resolveTurn(initialState, setup, params, { demandNoise: 1.2 }).state.balanceSheet)).toBe(true)
  })

  it('景気の需要倍率が需要に作用する', () => {
    const { initialState, params } = base()
    const setup = decide({ purchaseMaterials: 1_000, produceUnits: 1_000 })
    const boom = resolveTurn(initialState, setup, params, { macroDemandMultiplier: 1.15 }).unitsSold
    const bust = resolveTurn(initialState, setup, params, { macroDemandMultiplier: 0.85 }).unitsSold
    expect(boom).toBeGreaterThan(bust)
  })

  it('明示パラメータで損益が手計算と一致する', () => {
    // 期首: 現金 1,000,000 / 原材料 0 / 製品 1,000個=1,000,000 / 設備 1,000,000
    //       長期借入 500,000 / 資本金 1,000,000 / 利益剰余金 1,500,000
    // 恒等式: 資産 3,000,000 = 負債 500,000 + 純資産 2,500,000
    const state: CompanyState = {
      turn: 0,
      materialUnits: 0,
      finishedUnits: 1_000,
      materialIndex: 1.0,
      rdStock: 0,
      balanceSheet: {
        currentAssets: { cash: 1_000_000, accountsReceivable: 0, rawMaterials: 0, finishedGoods: 1_000_000 },
        fixedAssets: { equipment: 1_000_000 },
        currentLiabilities: { accountsPayable: 0, shortTermDebt: 0 },
        nonCurrentLiabilities: { longTermDebt: 500_000 },
        equity: { capitalStock: 1_000_000, retainedEarnings: 1_500_000 },
      },
    }
    const params: SimParams = {
      baseDemand: 1_000,
      basePrice: 2_000,
      priceElasticity: 1.2,
      competitorStrength: 0.3,
      unitVariableCost: 1_000,
      materialVolatility: 0,
      materialMeanReversion: 0,
      fixedCosts: 200_000,
      depreciationRate: 0.1,
      salesOnCreditRatio: 0.4,
      payableRatio: 0.3,
      marketingEffect: 0.5,
      marketingHalf: 200_000,
      insuranceRefCost: 200_000,
      maxInsuranceCoverage: 0.8,
      rdCostReductionMax: 0.4,
      rdDemandBoostMax: 0.5,
      rdHalf: 1_000_000,
      interestRate: 0.04,
      effectiveTaxRate: 0.3,
    }
    // 製品1,000個（@1,000）・仕入0・生産0、価格=基準 → 需要1,000、販売1,000
    // 売上 2,000,000 / 原価 1,000,000 / 粗利 1,000,000
    // 減価償却 100,000 / 販管費 200,000+100,000 = 300,000 / 営業利益 700,000
    // 利息 500,000×0.04 = 20,000 / 税引前 680,000 / 税 204,000 / 純利益 476,000
    const { incomeStatement: pl } = resolveTurn(state, decide({ unitPrice: 2_000 }), params)
    expect(pl.revenue).toBe(2_000_000)
    expect(pl.costOfGoodsSold).toBe(1_000_000)
    expect(pl.grossProfit).toBe(1_000_000)
    expect(pl.operatingExpenses).toBe(300_000)
    expect(pl.operatingIncome).toBe(700_000)
    expect(pl.interestExpense).toBe(20_000)
    expect(pl.pretaxIncome).toBe(680_000)
    expect(pl.tax).toBe(204_000)
    expect(pl.netIncome).toBe(476_000)
  })
})

describe('marketingMultiplier', () => {
  it('販促0で1、投じるほど逓増し上限に近づく', () => {
    const { params } = base()
    expect(marketingMultiplier(0, params)).toBe(1)
    expect(marketingMultiplier(200_000, params)).toBeCloseTo(1 + params.marketingEffect * 0.5)
    expect(marketingMultiplier(1_000_000, params)).toBeGreaterThan(marketingMultiplier(200_000, params))
  })
})
