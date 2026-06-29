import { describe, it, expect } from 'vitest'
import type { CompanyState, Decision, SimParams } from '@core/types'
import { getScenario } from '@data/scenarios'
import { balances, totalAssets, totalLiabilities, totalEquity } from '@core/statements/identity'
import { resolveTurn, marketingMultiplier } from './resolveTurn'

// 在庫を一定に保つ「定常運転」の判断を作る（生産＝販売見込み数量に近い）。
const steady = (unitPrice: number, produceUnits: number): Decision => ({
  unitPrice,
  produceUnits,
  marketingSpend: 0,
  capitalExpenditure: 0,
  financing: 0,
})

describe('resolveTurn（発生主義モデル）', () => {
  it('解決後も会計恒等式（資産 = 負債 + 純資産）が成立する', () => {
    const { initialState, params } = getScenario('default')
    const { state } = resolveTurn(initialState, steady(2_000, 1_000), params)
    expect(balances(state.balanceSheet)).toBe(true)
  })

  it('利益剰余金は期首＋当期純利益で繰り越される', () => {
    const { initialState, params } = getScenario('default')
    const before = initialState.balanceSheet.equity.retainedEarnings
    const { state, incomeStatement } = resolveTurn(initialState, steady(2_000, 1_000), params)
    expect(state.balanceSheet.equity.retainedEarnings).toBe(before + incomeStatement.netIncome)
  })

  it('CF の期末現金が B/S の現金と一致し、純増減と整合する', () => {
    const { initialState, params } = getScenario('default')
    const { state, cashFlow } = resolveTurn(initialState, steady(2_000, 1_000), params)
    expect(cashFlow.cashEnd).toBe(state.balanceSheet.currentAssets.cash)
    expect(cashFlow.cashEnd).toBe(cashFlow.cashBegin + cashFlow.netChange)
    expect(cashFlow.netChange).toBe(cashFlow.operating + cashFlow.investing + cashFlow.financing)
  })

  it('営業 CF = 純利益 + 減価償却 − ΔAR − Δ在庫 + ΔAP（間接法の整合）', () => {
    const { initialState, params } = getScenario('default')
    const bs0 = initialState.balanceSheet
    const dep = Math.round(bs0.fixedAssets.equipment * params.depreciationRate)
    const { state, incomeStatement, cashFlow } = resolveTurn(
      initialState,
      steady(2_000, 1_200),
      params,
    )
    const bs1 = state.balanceSheet
    const dAR = bs1.currentAssets.accountsReceivable - bs0.currentAssets.accountsReceivable
    const dInv = bs1.currentAssets.inventory - bs0.currentAssets.inventory
    const dAP = bs1.currentLiabilities.accountsPayable - bs0.currentLiabilities.accountsPayable
    expect(cashFlow.operating).toBe(incomeStatement.netIncome + dep - dAR - dInv + dAP)
  })

  it('生産が販売を上回ると在庫が増える', () => {
    const { initialState, params } = getScenario('default')
    const before = initialState.balanceSheet.currentAssets.inventory
    const { state } = resolveTurn(initialState, steady(2_000, 2_000), params)
    expect(state.balanceSheet.currentAssets.inventory).toBeGreaterThan(before)
  })

  it('掛け売り比率に応じて売掛金が立つ', () => {
    const { initialState, params } = getScenario('default')
    const { state, incomeStatement } = resolveTurn(initialState, steady(2_000, 1_000), params)
    expect(state.balanceSheet.currentAssets.accountsReceivable).toBe(
      Math.round(incomeStatement.revenue * params.salesOnCreditRatio),
    )
  })

  it('在庫切れ時は在庫＋生産までしか売れない', () => {
    const { initialState, params } = getScenario('default')
    // 期首在庫 1,000 個、生産 0、需要は基準価格で 1,000 → 販売は在庫の 1,000 が上限
    const { unitsSold } = resolveTurn(initialState, steady(2_000, 0), params)
    expect(unitsSold).toBe(1_000)
  })

  it('販促は需要を押し上げる（逓減）', () => {
    const { params } = getScenario('default')
    expect(marketingMultiplier(0, params)).toBe(1)
    expect(marketingMultiplier(200_000, params)).toBeCloseTo(1 + params.marketingEffect * 0.5)
    expect(marketingMultiplier(1_000_000, params)).toBeGreaterThan(marketingMultiplier(200_000, params))
  })

  it('イベント乗数は需要に作用する', () => {
    const { initialState, params } = getScenario('default')
    const big = { ...initialState, balanceSheet: { ...initialState.balanceSheet } }
    const boom = resolveTurn(big, steady(2_000, 5_000), params, { demandMultiplier: 1.5 })
    const normal = resolveTurn(big, steady(2_000, 5_000), params, { demandMultiplier: 1.0 })
    expect(boom.unitsSold).toBeGreaterThan(normal.unitsSold)
  })

  it('設備投資・借入をしても恒等式は崩れない', () => {
    const { initialState, params } = getScenario('default')
    const decision: Decision = {
      unitPrice: 2_500,
      produceUnits: 1_500,
      marketingSpend: 100_000,
      capitalExpenditure: 1_000_000,
      financing: 800_000,
    }
    const { state } = resolveTurn(initialState, decision, params)
    expect(totalAssets(state.balanceSheet)).toBe(
      totalLiabilities(state.balanceSheet) + totalEquity(state.balanceSheet),
    )
  })

  it('複数ターン連続でも恒等式は崩れない', () => {
    const { initialState, params } = getScenario('default')
    let s: CompanyState = initialState
    for (let t = 0; t < 10; t++) {
      const r = resolveTurn(s, steady(2_100, 1_050), params, { demandMultiplier: 0.9 + (t % 3) * 0.2 })
      s = r.state
      expect(balances(s.balanceSheet)).toBe(true)
    }
    expect(s.turn).toBe(10)
  })

  it('明示パラメータで損益が手計算と一致する', () => {
    const state: CompanyState = {
      turn: 0,
      balanceSheet: {
        currentAssets: { cash: 1_000_000, accountsReceivable: 0, inventory: 1_000_000 },
        fixedAssets: { equipment: 1_000_000 },
        currentLiabilities: { accountsPayable: 0, shortTermDebt: 0 },
        nonCurrentLiabilities: { longTermDebt: 500_000 },
        equity: { capitalStock: 1_500_000, retainedEarnings: 1_000_000 },
      },
    }
    const params: SimParams = {
      baseDemand: 1_000,
      basePrice: 2_000,
      priceElasticity: 1.2,
      unitVariableCost: 1_000,
      fixedCosts: 200_000,
      depreciationRate: 0.1,
      salesOnCreditRatio: 0.4,
      payableRatio: 0.3,
      marketingEffect: 0.5,
      marketingHalf: 200_000,
      interestRate: 0.04,
      effectiveTaxRate: 0.3,
    }
    // 在庫1,000個＋生産0、価格=基準 → 需要1,000、販売1,000
    // 売上 2,000,000 / 原価 1,000,000 / 粗利 1,000,000
    // 減価償却 100,000 / 販管費 200,000+100,000+0 = 300,000 / 営業利益 700,000
    // 利息 500,000×0.04 = 20,000 / 税引前 680,000 / 税 204,000 / 純利益 476,000
    const { incomeStatement: pl } = resolveTurn(state, steady(2_000, 0), params)
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
