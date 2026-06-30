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
  capitalExpenditure: 0,
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

  it('生産能力が生産数量の上限になる（設備に比例）', () => {
    const { initialState, params } = base()
    // 年間能力 = 設備4,000,000 × 0.0006 = 2,400 → 月次 = floor(2400/12) = 200
    const capped: SimParams = { ...params, capacityPerEquipment: 0.0006 }
    const r = resolveTurn(initialState, decide({ unitPrice: 2_000_000, produceUnits: 1_000 }), capped)
    expect(r.capacity).toBe(200)
    expect(r.state.finishedUnits).toBe(initialState.finishedUnits + 200) // 1000要求でも200まで
    expect(balances(r.state.balanceSheet)).toBe(true)
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
