import { describe, it, expect } from 'vitest'
import type { CompanyState, Decision, SimParams, HrParams } from '@core/types'
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
  dividend: 0,
  financing: 0,
  ...d,
})

// 人材開発テスト用の中立パラメータ（等級1= wageMult1/skillMult1・中立士気＝開始時パリティが前提）。
const HR_NEUTRAL: HrParams = {
  roleLabels: { field: '職人', mgmt: '班長', rnd: '技術者' },
  grades: [
    { wageMult: 1, skillMult: 1, expToNext: 36 },
    { wageMult: 1.25, skillMult: 1.15, expToNext: 96 },
    { wageMult: 1.5, skillMult: 1.3 },
  ],
  expPerTurn: 1,
  skillFromExpMax: 0.1,
  expHalf: 96,
  trainingRefCost: 3_000,
  trainingExpMax: 6,
  moraleBase: 0.6,
  moraleRecover: 0.05,
  moraleOverworkPenalty: 0.08,
  moraleWageSlope: 0.3,
  moraleTrainingBoost: 0.03,
  moraleProductivitySlope: 0.5,
  attritionMoraleSlope: 0.5,
  attritionMoraleFloor: 0.35,
  mgmtBoost: 0.2,
  mgmtHalf: 2,
  rndContribPerYear: 60_000,
}

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
    // 純資産7,000,000・1,000株 → BVPS 7,000。175万円増資（受け入れ枠25%以内） → 250株発行 → 1,250株。
    const state: CompanyState = { ...initialState, sharesOutstanding: 1_000 }
    const equityBegin = totalEquity(state.balanceSheet) // 7,000,000
    const r = resolveTurn(state, decide({ produceUnits: 0, equityIssuance: equityBegin / 4 }), params)
    expect(r.state.sharesOutstanding).toBe(1_250) // +250株（1/4額分）
    expect(balances(r.state.balanceSheet)).toBe(true)
  })

  it('増資は1期あたり期首純資産×25%（受け入れ枠）でキャップされる', () => {
    const { initialState, params } = base()
    const state: CompanyState = { ...initialState, sharesOutstanding: 1_000 }
    const equityBegin = totalEquity(state.balanceSheet) // 7,000,000 → キャップ 1,750,000
    // 枠の2倍（350万円）を指示しても、資本金の増加はキャップまで。
    const r = resolveTurn(state, decide({ produceUnits: 0, equityIssuance: equityBegin / 2 }), params)
    const cap = Math.round(equityBegin * 0.25)
    expect(r.state.balanceSheet.equity.capitalStock).toBe(state.balanceSheet.equity.capitalStock + cap)
    expect(r.state.paidInSinceStart).toBe(cap)
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

  it('配当は剰余金↓・現金↓・財務CF↓（同額減で恒等式維持）', () => {
    const { initialState, params } = base()
    const r = resolveTurn(initialState, decide({ produceUnits: 0, dividend: 500_000 }), params)
    expect(r.dividendPaid).toBe(500_000)
    expect(r.state.balanceSheet.equity.retainedEarnings).toBe(
      initialState.balanceSheet.equity.retainedEarnings + r.incomeStatement.netIncome - 500_000,
    )
    expect(balances(r.state.balanceSheet)).toBe(true)
  })

  it('配当は利益剰余金と期首現金の小さい方まで', () => {
    const { initialState, params } = base()
    // BASE_STATE: 剰余金 2,000,000・現金 5,000,000 → 上限は剰余金 2,000,000。
    const r = resolveTurn(initialState, decide({ produceUnits: 0, dividend: 99_999_999 }), params)
    expect(r.dividendPaid).toBe(initialState.balanceSheet.equity.retainedEarnings)
    expect(balances(r.state.balanceSheet)).toBe(true)
  })

  it('IPO: 上場成立で現金・資本金が同額増・株数増・調達は paidIn に加算・恒等式維持', () => {
    const { initialState, params } = base()
    const state: CompanyState = { ...initialState, sharesOutstanding: 1_000 }
    // 時価総額 10,000,000 → 公募価格 10,000/株・調達上限 5,000,000（比率0.5）。
    const r = resolveTurn(state, decide({ produceUnits: 0, goPublic: { proceeds: 2_000_000 } }), params, {
      ipoValuation: 10_000_000,
    })
    expect(r.ipoProceeds).toBe(2_000_000)
    expect(r.state.listed).toBe(true)
    expect(r.state.sharesOutstanding).toBe(1_200) // +200株（2,000,000÷10,000）
    expect(r.state.balanceSheet.equity.capitalStock).toBe(state.balanceSheet.equity.capitalStock + 2_000_000)
    expect(r.state.paidInSinceStart).toBe(2_000_000)
    expect(balances(r.state.balanceSheet)).toBe(true)
  })

  it('IPO: 調達は時価総額×比率でクランプ・不成立条件（株なし/評価0/上場済み）は無視', () => {
    const { initialState, params } = base()
    const state: CompanyState = { ...initialState, sharesOutstanding: 1_000 }
    // クランプ: 9,999,999 希望 → 上限 5,000,000。
    const clamped = resolveTurn(state, decide({ produceUnits: 0, goPublic: { proceeds: 9_999_999 } }), params, {
      ipoValuation: 10_000_000,
    })
    expect(clamped.ipoProceeds).toBe(5_000_000)
    // 株式基盤なし → 無視。
    const noShares = resolveTurn(initialState, decide({ produceUnits: 0, goPublic: { proceeds: 1_000_000 } }), params, {
      ipoValuation: 10_000_000,
    })
    expect(noShares.ipoProceeds).toBe(0)
    expect(noShares.state.listed).toBeUndefined()
    // バリュエーション0（赤字）→ 無視。
    const noVal = resolveTurn(state, decide({ produceUnits: 0, goPublic: { proceeds: 1_000_000 } }), params, {
      ipoValuation: 0,
    })
    expect(noVal.ipoProceeds).toBe(0)
    // 上場済み → 無視（二重上場しない）。
    const already = resolveTurn(
      { ...state, listed: true },
      decide({ produceUnits: 0, goPublic: { proceeds: 1_000_000 } }),
      params,
      { ipoValuation: 10_000_000 },
    )
    expect(already.ipoProceeds).toBe(0)
    expect(already.state.listed).toBe(true)
  })

  it('上場中は上場維持コストが販管費に乗る（年額を期間スケール）', () => {
    const { initialState, params } = base()
    const p = { ...params, listingCost: 120_000 } // 年12万 → 月1万
    const listedState: CompanyState = { ...initialState, listed: true }
    const withCost = resolveTurn(listedState, decide({ produceUnits: 0 }), p)
    const withoutCost = resolveTurn(initialState, decide({ produceUnits: 0 }), p)
    expect(
      withCost.incomeStatement.operatingExpenses - withoutCost.incomeStatement.operatingExpenses,
    ).toBe(10_000)
    expect(balances(withCost.state.balanceSheet)).toBe(true)
  })

  it('M&A: 対価ミックス（現金のみ/借入のみ/株式のみ/混合）すべてで恒等式が成立し、のれん＝対価−受入純資産', () => {
    const { initialState, params } = base()
    const p = { ...params, acqTargetNetAssets: 500_000, acqTargetHeadcount: 3 }
    const state: CompanyState = { ...initialState, sharesOutstanding: 1_000 }
    const mixes = [
      { cashPaid: 800_000, debtRaised: 0, stockValue: 0 },
      { cashPaid: 0, debtRaised: 800_000, stockValue: 0 },
      { cashPaid: 0, debtRaised: 0, stockValue: 800_000 },
      { cashPaid: 300_000, debtRaised: 300_000, stockValue: 200_000 },
    ]
    for (const acquire of mixes) {
      const r = resolveTurn(state, decide({ produceUnits: 0, acquire }), p)
      expect(r.acquisitionConsideration).toBe(800_000)
      expect(r.state.balanceSheet.fixedAssets.goodwill).toBe(300_000) // 800,000 − 500,000
      expect(r.state.balanceSheet.fixedAssets.equipment).toBeGreaterThanOrEqual(
        state.balanceSheet.fixedAssets.equipment + 500_000 - 100_000, // 設備受入（減価償却分は差し引き）
      )
      expect(r.state.acquiredCompetitor).toBe(true)
      expect(balances(r.state.balanceSheet)).toBe(true)
      // CF三区分和＝Δcash は構成上保証されるが明示確認
      expect(r.cashFlow.netChange).toBe(r.cashFlow.operating + r.cashFlow.investing + r.cashFlow.financing)
    }
  })

  it('M&A: 借入対価は通常借入と合算で信用枠内・株式対価はBVPS>0のみ・対価不足は不成立', () => {
    const { initialState, params } = base()
    const p = { ...params, acqTargetNetAssets: 500_000 }
    const state: CompanyState = { ...initialState, sharesOutstanding: 1_000 }
    // 借入枠: equity 7M × AAA(3.0) − debt 3M = 18M。通常借入 17.5M を先に使うと買収借入の残枠は 0.5M。
    const r1 = resolveTurn(
      state,
      decide({ produceUnits: 0, financing: 17_500_000, acquire: { cashPaid: 0, debtRaised: 9_999_999, stockValue: 0 } }),
      p,
    )
    const debtAdded =
      r1.state.balanceSheet.nonCurrentLiabilities.longTermDebt - state.balanceSheet.nonCurrentLiabilities.longTermDebt
    expect(debtAdded).toBeLessThanOrEqual(18_000_000) // 合算で枠内
    expect(balances(r1.state.balanceSheet)).toBe(true)
    // 株式基盤なし → 株式対価は無効＝現金0・借入0なら不成立
    const r2 = resolveTurn(
      initialState,
      decide({ produceUnits: 0, acquire: { cashPaid: 0, debtRaised: 0, stockValue: 800_000 } }),
      p,
    )
    expect(r2.acquisitionConsideration).toBe(0)
    expect(r2.state.acquiredCompetitor).toBeUndefined()
    // 対価不足（受入純資産未満）→ 不成立（負ののれんは作らない）
    const r3 = resolveTurn(
      state,
      decide({ produceUnits: 0, acquire: { cashPaid: 300_000, debtRaised: 0, stockValue: 0 } }),
      p,
    )
    expect(r3.acquisitionConsideration).toBe(0)
    expect(r3.state.balanceSheet.fixedAssets.goodwill).toBeUndefined()
  })

  it('M&A: 一度きり（買収済みなら acquire は無視）・のれんは毎期償却され営業CFに足し戻る', () => {
    const { initialState, params } = base()
    const p = { ...params, acqTargetNetAssets: 500_000, goodwillAmortRate: 0.12 } // 年12% → 月1%
    const acquired: CompanyState = {
      ...initialState,
      sharesOutstanding: 1_000,
      acquiredCompetitor: true,
      balanceSheet: {
        ...initialState.balanceSheet,
        fixedAssets: { equipment: initialState.balanceSheet.fixedAssets.equipment, goodwill: 300_000 },
        // 恒等式を保つため現金を同額減らした初期状態にする
        currentAssets: {
          ...initialState.balanceSheet.currentAssets,
          cash: initialState.balanceSheet.currentAssets.cash - 300_000,
        },
      },
    }
    expect(balances(acquired.balanceSheet)).toBe(true)
    const r = resolveTurn(
      acquired,
      decide({ produceUnits: 0, acquire: { cashPaid: 900_000, debtRaised: 0, stockValue: 0 } }),
      p,
    )
    // 二重買収は無視
    expect(r.acquisitionConsideration).toBe(0)
    // のれん償却: 300,000 × 12% ÷ 12 = 3,000 が販管費に乗り、のれんが減る
    expect(r.goodwillAmortized).toBe(3_000)
    expect(r.state.balanceSheet.fixedAssets.goodwill).toBe(297_000)
    const noGw = resolveTurn(initialState, decide({ produceUnits: 0 }), p)
    expect(r.incomeStatement.operatingExpenses - noGw.incomeStatement.operatingExpenses).toBe(3_000)
    expect(balances(r.state.balanceSheet)).toBe(true)
  })

  it('M&A: 買収済みは需要ブーストが掛かる（companyDemandMultiplier）', () => {
    const { initialState, params } = base()
    const p = { ...params, acqTargetNetAssets: 500_000, acqTargetDemandBoost: 0.2 }
    const acquired: CompanyState = { ...initialState, acquiredCompetitor: true }
    const withBoost = resolveTurn(acquired, decide({}), p)
    const without = resolveTurn(initialState, decide({}), p)
    expect(withBoost.demand).toBeGreaterThan(without.demand)
  })

  it('複数製品: 2ラインで恒等式・B/S在庫＝Σ(lines)・ライン別の価値保存が成立', () => {
    const { initialState, params } = base()
    const p: SimParams = {
      ...params,
      productLines: [
        { id: 'std', name: '標準品', baseDemand: 1_000, basePrice: 2_000, priceElasticity: 1.2, unitVariableCost: 1_000 },
        { id: 'prm', name: '高級品', baseDemand: 300, basePrice: 5_000, priceElasticity: 1.0, unitVariableCost: 2_000 },
      ],
    }
    const r = resolveTurn(
      initialState,
      decide({
        lines: [
          { unitPrice: 2_000, purchaseMaterials: 100, produceUnits: 100, marketingSpend: 0, rdSpend: 50_000 },
          { unitPrice: 5_000, purchaseMaterials: 50, produceUnits: 50, marketingSpend: 20_000, rdSpend: 0 },
        ],
      }),
      p,
    )
    const lines = r.state.lines ?? []
    expect(lines).toHaveLength(2)
    // B/S の在庫＝ライン合算（スカラーも同値＝導出値）
    expect(r.state.balanceSheet.currentAssets.rawMaterials).toBe(lines.reduce((s, l) => s + l.materialValue, 0))
    expect(r.state.balanceSheet.currentAssets.finishedGoods).toBe(lines.reduce((s, l) => s + l.finishedValue, 0))
    expect(r.state.materialUnits).toBe(lines.reduce((s, l) => s + l.materialUnits, 0))
    expect(r.state.finishedUnits).toBe(lines.reduce((s, l) => s + l.finishedUnits, 0))
    expect(r.state.rdStock).toBe(lines.reduce((s, l) => s + l.rdStock, 0))
    // 全社 P/L はライン合算
    expect(r.incomeStatement.revenue).toBe(r.lineResults.reduce((s, l) => s + l.revenue, 0))
    expect(r.incomeStatement.costOfGoodsSold).toBe(r.lineResults.reduce((s, l) => s + l.costOfGoodsSold, 0))
    // 恒等式（tolerance 0）
    expect(balances(r.state.balanceSheet)).toBe(true)
  })

  it('複数製品: 共有能力は希望比で按分され Σ生産 ≤ 能力（floor＋剰余ライン順＝決定論）', () => {
    const { initialState, params } = base()
    const p: SimParams = {
      ...params,
      capacityPerEquipment: 0.000453, // 設備4,000,000 → 月次能力 floor(1812/12)=151
      productLines: [
        { id: 'a', name: 'A', baseDemand: 1_000, basePrice: 2_000, priceElasticity: 1.2, unitVariableCost: 1_000 },
        { id: 'b', name: 'B', baseDemand: 1_000, basePrice: 2_000, priceElasticity: 1.2, unitVariableCost: 1_000 },
      ],
    }
    const mk = () =>
      resolveTurn(
        initialState,
        decide({
          lines: [
            { unitPrice: 2_000, purchaseMaterials: 100, produceUnits: 100, marketingSpend: 0, rdSpend: 0 },
            { unitPrice: 2_000, purchaseMaterials: 100, produceUnits: 100, marketingSpend: 0, rdSpend: 0 },
          ],
        }),
        p,
      )
    const r = mk()
    // 希望 100+100 > 能力151 → floor(75.5)=75ずつ、剰余1はライン0へ → 76+75=151
    const produced0 = (r.state.lines?.[0]?.finishedUnits ?? 0) + r.lineResults[0].unitsSold - initialStateLineFin(initialState)
    const producedTotal =
      r.lineResults.reduce((s, l) => s + l.availableToSell, 0) -
      Math.max(0, initialState.finishedUnits) // 期首製品を除いた当期生産分
    expect(producedTotal).toBe(151)
    expect(balances(r.state.balanceSheet)).toBe(true)
    // 決定論（同入力→同結果）
    expect(JSON.stringify(mk())).toBe(JSON.stringify(r))
    // ヘルパ（ライン0の期首製品数）
    function initialStateLineFin(s: CompanyState): number {
      return Math.max(0, s.finishedUnits)
    }
    void produced0
  })

  it('複数製品: Decision.lines 未指定なら従来スカラーがライン0に適用され、他ラインは休止', () => {
    const { initialState, params } = base()
    const p: SimParams = {
      ...params,
      productLines: [
        { id: 'std', name: '標準品', baseDemand: 1_000, basePrice: 2_000, priceElasticity: 1.2, unitVariableCost: 1_000 },
        { id: 'prm', name: '高級品', baseDemand: 300, basePrice: 5_000, priceElasticity: 1.0, unitVariableCost: 2_000 },
      ],
    }
    const r = resolveTurn(initialState, decide({ unitPrice: 2_500, purchaseMaterials: 80, produceUnits: 60 }), p)
    expect(r.lineResults[1].unitsSold).toBe(0)
    expect(r.lineResults[1].revenue).toBe(0)
    expect(r.incomeStatement.revenue).toBe(r.lineResults[0].revenue)
    expect(balances(r.state.balanceSheet)).toBe(true)
  })

  it('商材開発: 資産計上は 現金↓＝開発資産↑（投資CF・P/L無傷）で恒等式維持', () => {
    const { initialState, params } = base()
    const p: SimParams = {
      ...params,
      devProjects: [
        { id: 'd1', name: '新製品', kind: 'new', requiredInvestment: 300_000, minTurns: 6, capitalize: true, amortRate: 0.2, lifecycle: 'permanent', newLine: { id: 'nl', name: '新製品', baseDemand: 600, basePrice: 3000, priceElasticity: 1, unitVariableCost: 1200 } },
      ],
    }
    const withDev = resolveTurn(initialState, decide({ produceUnits: 0, devSpend: { d1: 120_000 } }), p)
    const without = resolveTurn(initialState, decide({ produceUnits: 0 }), p)
    expect(withDev.devCapitalized).toBe(120_000)
    expect(withDev.state.devInProgress).toEqual([{ projectId: 'd1', invested: 120_000, startedTurn: 0 }])
    expect(withDev.state.balanceSheet.fixedAssets.developmentAsset).toBe(120_000)
    // P/L 無傷（費用にならない）・投資CFに出る・現金は同額減
    expect(withDev.incomeStatement.operatingExpenses).toBe(without.incomeStatement.operatingExpenses)
    expect(withDev.cashFlow.investing - without.cashFlow.investing).toBe(-120_000)
    expect(withDev.cashFlow.cashEnd - without.cashFlow.cashEnd).toBe(-120_000)
    expect(balances(withDev.state.balanceSheet)).toBe(true)
    // クランプ: 必要額を超える投資は積めない
    const over = resolveTurn(initialState, decide({ produceUnits: 0, devSpend: { d1: 9_999_999 } }), p)
    expect(over.devCapitalized).toBe(300_000)
    expect(balances(over.state.balanceSheet)).toBe(true)
  })

  it('商材開発: 費用処理（capitalize=false）は販管費に計上され資産は増えない', () => {
    const { initialState, params } = base()
    const p: SimParams = {
      ...params,
      devProjects: [
        { id: 'menu', name: '定番メニュー', kind: 'upgrade', targetLineId: 'main', demandBoost: 0.15, requiredInvestment: 100_000, minTurns: 2, capitalize: false, lifecycle: 'permanent' },
      ],
    }
    const withDev = resolveTurn(initialState, decide({ produceUnits: 0, devSpend: { menu: 40_000 } }), p)
    const without = resolveTurn(initialState, decide({ produceUnits: 0 }), p)
    expect(withDev.devExpensed).toBe(40_000)
    expect(withDev.incomeStatement.operatingExpenses - without.incomeStatement.operatingExpenses).toBe(40_000)
    expect(withDev.cashFlow.investing).toBe(without.cashFlow.investing) // 投資CFには出ない
    expect(withDev.state.balanceSheet.fixedAssets.developmentAsset ?? 0).toBe(0)
    expect(balances(withDev.state.balanceSheet)).toBe(true)
  })

  it('商材開発: 必要額＋最短期間の到達で自動ローンチ（効果は翌期から・新ラインが増える）', () => {
    const { initialState, params } = base()
    const p: SimParams = {
      ...params,
      devProjects: [
        { id: 'd1', name: '新製品', kind: 'new', requiredInvestment: 200_000, minTurns: 1, capitalize: true, amortRate: 0.24, lifecycle: 'permanent', newLine: { id: 'nl', name: '新製品', baseDemand: 1200, basePrice: 3000, priceElasticity: 1, unitVariableCost: 1200 } },
      ],
    }
    // 1期で必要額到達 → 期末に完成（launchedTurn=翌期）・当期のライン構成は変わらない
    const t0 = resolveTurn(initialState, decide({ produceUnits: 0, devSpend: { d1: 200_000 } }), p)
    expect(t0.launchedProjectIds).toEqual(['d1'])
    expect(t0.lineResults).toHaveLength(1)
    expect(t0.state.devInProgress).toBeUndefined()
    expect(t0.state.devLaunched).toEqual([{ projectId: 'd1', launchedTurn: 1, bookValue: 200_000 }])
    expect(t0.state.balanceSheet.fixedAssets.developmentAsset).toBe(200_000) // 仕掛→無形の振替＝B/S不動
    expect(balances(t0.state.balanceSheet)).toBe(true)
    // 翌期: 新ラインが構成に現れ、販売できる
    const t1 = resolveTurn(
      t0.state,
      decide({
        lines: [
          { unitPrice: 2_000, purchaseMaterials: 0, produceUnits: 0, marketingSpend: 0, rdSpend: 0 },
          { unitPrice: 3000, purchaseMaterials: 50, produceUnits: 50, marketingSpend: 0, rdSpend: 0 },
        ],
      }),
      p,
    )
    expect(t1.lineResults).toHaveLength(2)
    expect(t1.lineResults[1].unitsSold).toBeGreaterThan(0)
    expect(balances(t1.state.balanceSheet)).toBe(true)
    // minTurns 未達なら完成しない
    const slow: SimParams = { ...p, devProjects: [{ ...p.devProjects![0], minTurns: 3 }] }
    const s0 = resolveTurn(initialState, decide({ produceUnits: 0, devSpend: { d1: 200_000 } }), slow)
    expect(s0.launchedProjectIds).toEqual([])
    expect(s0.state.devInProgress).toHaveLength(1)
  })

  it('商材開発: 無形資産は毎期償却（販管費↑・非現金）され、恒等式を保つ', () => {
    const { initialState, params } = base()
    const p: SimParams = {
      ...params,
      devProjects: [
        { id: 'd1', name: 'ソフト', kind: 'new', requiredInvestment: 240_000, minTurns: 1, capitalize: true, amortRate: 0.5, lifecycle: 'permanent', newLine: { id: 'nl', name: 'ソフト', baseDemand: 0, basePrice: 3000, priceElasticity: 1, unitVariableCost: 1200 } },
      ],
    }
    const launched: CompanyState = {
      ...initialState,
      devLaunched: [{ projectId: 'd1', launchedTurn: 0, bookValue: 240_000 }],
      balanceSheet: {
        ...initialState.balanceSheet,
        fixedAssets: { ...initialState.balanceSheet.fixedAssets, developmentAsset: 240_000 },
        currentAssets: { ...initialState.balanceSheet.currentAssets, cash: initialState.balanceSheet.currentAssets.cash - 240_000 },
      },
    }
    expect(balances(launched.balanceSheet)).toBe(true)
    const r = resolveTurn(launched, decide({ produceUnits: 0 }), p)
    const noDev = resolveTurn(initialState, decide({ produceUnits: 0 }), p)
    // 月次償却 = round(240,000 × 0.5 / 12) = 10,000
    expect(r.devAmortized).toBe(10_000)
    expect(r.state.devLaunched?.[0].bookValue).toBe(230_000)
    expect(r.state.balanceSheet.fixedAssets.developmentAsset).toBe(230_000)
    expect(r.incomeStatement.operatingExpenses - noDev.incomeStatement.operatingExpenses).toBe(10_000)
    expect(balances(r.state.balanceSheet)).toBe(true)
  })

  it('人材開発: 開始時パリティ（等級1・経験0・中立士気で従来スカラーと同一の人件費・能力・結果）', () => {
    const { initialState, params } = base()
    const hrParams: SimParams = { ...params, laborPerHead: 120, wage: 14_000, hr: HR_NEUTRAL }
    const scalarParams: SimParams = { ...params, laborPerHead: 120, wage: 14_000 }
    const state: CompanyState = { ...initialState, headcount: 5 }
    const a = resolveTurn(state, decide({ produceUnits: 50, purchaseMaterials: 50 }), hrParams)
    const b = resolveTurn(state, decide({ produceUnits: 50, purchaseMaterials: 50 }), scalarParams)
    expect(a.incomeStatement.operatingExpenses).toBe(b.incomeStatement.operatingExpenses)
    expect(a.incomeStatement.netIncome).toBe(b.incomeStatement.netIncome)
    expect(a.capacity).toBe(b.capacity)
    expect(a.state.headcount).toBe(5)
    expect(a.state.employees).toHaveLength(5) // スカラー→従業員へ合成
    expect(a.state.employees?.every((e) => e.grade === 1 && e.role === 'field')).toBe(true)
    expect(balances(a.state.balanceSheet)).toBe(true)
  })

  it('人材開発: 研修は費用処理で経験・士気を上げ、翌期以降の能力が伸びる', () => {
    const { initialState, params } = base()
    const p: SimParams = { ...params, laborPerHead: 120, wage: 14_000, hr: HR_NEUTRAL }
    const state: CompanyState = { ...initialState, headcount: 5 }
    const trained = resolveTurn(state, decide({ produceUnits: 0, trainingSpend: 45_000 }), p)
    const idle = resolveTurn(state, decide({ produceUnits: 0 }), p)
    // 費用処理: 販管費に研修費が乗る
    expect(trained.incomeStatement.operatingExpenses - idle.incomeStatement.operatingExpenses).toBe(45_000)
    // 経験: 在籍1 + 研修 45,000/(3,000×5)=3 → 4
    expect(trained.state.employees?.[0].exp).toBe(4)
    expect(trained.state.employees?.[0].morale).toBeCloseTo(HR_NEUTRAL.moraleBase + HR_NEUTRAL.moraleTrainingBoost, 6)
    // 翌期の労働能力はスキル分伸びる（研修あり > なし）
    const nextTrained = resolveTurn(trained.state, decide({ produceUnits: 0 }), p)
    const nextIdle = resolveTurn(idle.state, decide({ produceUnits: 0 }), p)
    expect(nextTrained.hrAvgSkill ?? 0).toBeGreaterThan(nextIdle.hrAvgSkill ?? 0)
    expect(balances(trained.state.balanceSheet)).toBe(true)
  })

  it('人材開発: 昇進で等級と人件費が上がる（昇給）', () => {
    const { initialState, params } = base()
    const p: SimParams = { ...params, laborPerHead: 120, wage: 14_000, hr: HR_NEUTRAL }
    const nearPromo: CompanyState = {
      ...initialState,
      headcount: 1,
      employees: [{ id: 0, role: 'field', grade: 1, exp: 35, morale: HR_NEUTRAL.moraleBase }],
    }
    const r = resolveTurn(nearPromo, decide({ produceUnits: 0 }), p)
    expect(r.hrPromotions).toBe(1)
    expect(r.state.employees?.[0].grade).toBe(2)
    // 翌期の人件費は wageMult 1.25 倍
    const next = resolveTurn(r.state, decide({ produceUnits: 0 }), p)
    const base1 = resolveTurn(
      { ...nearPromo, employees: [{ id: 0, role: 'field', grade: 1, exp: 0, morale: HR_NEUTRAL.moraleBase }] },
      decide({ produceUnits: 0 }),
      p,
    )
    expect(next.incomeStatement.operatingExpenses).toBeGreaterThan(base1.incomeStatement.operatingExpenses)
  })

  it('人材開発: 過重労働（希望生産＞能力）で士気が下がり、低士気は離職を生む（決定論）', () => {
    const { initialState, params } = base()
    const p: SimParams = { ...params, laborPerHead: 120, capacityPerEquipment: undefined, wage: 14_000, hr: HR_NEUTRAL }
    const state: CompanyState = { ...initialState, headcount: 5, materialUnits: 2_000 }
    // 能力 5×120/12=50 に対し 200 を要求 → 過重労働
    const over = resolveTurn(state, decide({ produceUnits: 200, purchaseMaterials: 0 }), p)
    expect(over.hrOverworked).toBe(true)
    expect(over.hrAvgMorale ?? 1).toBeLessThan(HR_NEUTRAL.moraleBase)
    // 低士気チームは離職が出る（士気の低い順・同率は新しい順に退出＝決定論）
    // 平均士気 0.1 → 離職率 = 0.5×(0.35−0.1) = 0.125 → 4人×0.125 = 0.5 → 1人
    const lowMorale: CompanyState = {
      ...initialState,
      headcount: 4,
      employees: [
        { id: 0, role: 'field', grade: 1, exp: 0, morale: 0.05 },
        { id: 1, role: 'field', grade: 1, exp: 0, morale: 0.05 },
        { id: 2, role: 'field', grade: 1, exp: 0, morale: 0.1 },
        { id: 3, role: 'field', grade: 1, exp: 0, morale: 0.2 },
      ],
    }
    const quit = resolveTurn(lowMorale, decide({ produceUnits: 0 }), p)
    expect(quit.attritionQuits).toBe(1)
    // 去るのは最低士気・同率なら新しい方（id 1）
    expect(quit.state.employees?.map((e) => e.id)).toEqual([0, 2, 3])
    expect(quit.state.headcount).toBe(quit.state.employees?.length)
  })

  it('人材開発: 役割 — 管理職は能力を押し上げ、研究職は毎期 R&D に寄与する', () => {
    const { initialState, params } = base()
    const p: SimParams = { ...params, laborPerHead: 120, capacityPerEquipment: undefined, wage: 14_000, hr: HR_NEUTRAL }
    const mixed: CompanyState = {
      ...initialState,
      headcount: 6,
      employees: [
        ...[0, 1, 2, 3].map((id) => ({ id, role: 'field' as const, grade: 1, exp: 0, morale: 0.6 })),
        { id: 10, role: 'mgmt' as const, grade: 1, exp: 0, morale: 0.6 },
        { id: 11, role: 'rnd' as const, grade: 1, exp: 0, morale: 0.6 },
      ],
    }
    const r = resolveTurn(mixed, decide({ produceUnits: 0 }), p)
    // 現場4×120/12=40 × 管理職ブースト(1+0.2×1/3)=1.0667 → floor(42.67)=42
    expect(r.capacity).toBe(42)
    // 研究職の寄与: rdStock 60,000/年 → 5,000/月
    expect(r.state.rdStock - initialState.rdStock).toBe(5_000)
    expect(r.state.lines?.reduce((s, l) => s + l.rdStock, 0)).toBe(r.state.rdStock)
  })

  it('人材開発: M&A の受け入れ人員は従業員として合流し、headcount=Σemployees を保つ', () => {
    const { initialState, params } = base()
    const p: SimParams = {
      ...params,
      laborPerHead: 120,
      wage: 14_000,
      hr: HR_NEUTRAL,
      acqTargetNetAssets: 500_000,
      acqTargetHeadcount: 3,
    }
    const state: CompanyState = { ...initialState, headcount: 5, sharesOutstanding: 1_000 }
    const r = resolveTurn(
      state,
      decide({ produceUnits: 0, acquire: { cashPaid: 800_000, debtRaised: 0, stockValue: 0 } }),
      p,
    )
    expect(r.state.employees).toHaveLength(8)
    expect(r.state.headcount).toBe(8)
    expect(balances(r.state.balanceSheet)).toBe(true)
  })

  it('商材開発: devProjects の無いシナリオでは dev フィールドを一切書かない（後方互換）', () => {
    const { initialState, params } = base()
    const r = resolveTurn(initialState, decide({ produceUnits: 0, devSpend: { ghost: 100_000 } }), params)
    expect(r.devCapitalized).toBe(0)
    expect(r.state.devInProgress).toBeUndefined()
    expect(r.state.devLaunched).toBeUndefined()
    expect(r.state.balanceSheet.fixedAssets.developmentAsset).toBeUndefined()
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
