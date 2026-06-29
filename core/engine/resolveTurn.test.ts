import { describe, it, expect } from 'vitest'
import type { CompanyState, Decision, SimParams } from '@core/types'
import { getScenario } from '@data/scenarios'
import { balances, totalAssets, totalLiabilities, totalEquity } from '@core/statements/identity'
import { resolveTurn } from './resolveTurn'

const noop: Decision = { capitalExpenditure: 0, unitPrice: 2_000, financing: 0 }

describe('resolveTurn（ターン解決）', () => {
  it('解決後も会計恒等式（資産 = 負債 + 純資産）が成立する', () => {
    const { initialState, params } = getScenario('default')
    const { state } = resolveTurn(initialState, noop, params)
    expect(balances(state.balanceSheet)).toBe(true)
  })

  it('利益剰余金は期首＋当期純利益で繰り越される', () => {
    const { initialState, params } = getScenario('default')
    const before = initialState.balanceSheet.equity.retainedEarnings
    const { state, incomeStatement } = resolveTurn(initialState, noop, params)
    expect(state.balanceSheet.equity.retainedEarnings).toBe(before + incomeStatement.netIncome)
  })

  it('CF の期末現金が B/S の現金と一致し、純増減と整合する', () => {
    const { initialState, params } = getScenario('default')
    const { state, cashFlow } = resolveTurn(initialState, noop, params)
    expect(cashFlow.cashEnd).toBe(state.balanceSheet.currentAssets.cash)
    expect(cashFlow.cashEnd).toBe(cashFlow.cashBegin + cashFlow.netChange)
    expect(cashFlow.netChange).toBe(cashFlow.operating + cashFlow.investing + cashFlow.financing)
  })

  it('営業 CF = 当期純利益 ＋ 減価償却（間接法の整合）', () => {
    const { initialState, params } = getScenario('default')
    const depreciation = Math.round(
      initialState.balanceSheet.fixedAssets.equipment * params.depreciationRate,
    )
    const { incomeStatement, cashFlow } = resolveTurn(initialState, noop, params)
    expect(cashFlow.operating).toBe(incomeStatement.netIncome + depreciation)
  })

  it('ターン番号が進む', () => {
    const { initialState, params } = getScenario('default')
    const { state } = resolveTurn(initialState, noop, params)
    expect(state.turn).toBe(initialState.turn + 1)
  })

  it('設備投資・借入をしても恒等式は崩れない', () => {
    const { initialState, params } = getScenario('default')
    const decision: Decision = { capitalExpenditure: 1_000_000, unitPrice: 2_500, financing: 800_000 }
    const { state } = resolveTurn(initialState, decision, params)
    expect(totalAssets(state.balanceSheet)).toBe(
      totalLiabilities(state.balanceSheet) + totalEquity(state.balanceSheet),
    )
  })

  it('明示パラメータで損益が手計算と一致する', () => {
    // 期首: 現金 1,000,000 / 設備 1,000,000、長期借入 500,000、資本金 1,000,000、利益剰余金 500,000
    // 恒等式: 資産 2,000,000 = 負債 500,000 + 純資産 1,500,000
    const state: CompanyState = {
      turn: 0,
      balanceSheet: {
        currentAssets: { cash: 1_000_000, accountsReceivable: 0, inventory: 0 },
        fixedAssets: { equipment: 1_000_000 },
        currentLiabilities: { accountsPayable: 0, shortTermDebt: 0 },
        nonCurrentLiabilities: { longTermDebt: 500_000 },
        equity: { capitalStock: 1_000_000, retainedEarnings: 500_000 },
      },
    }
    const params: SimParams = {
      baseDemand: 1_000,
      basePrice: 2_000,
      priceElasticity: 1.2,
      unitVariableCost: 1_000,
      fixedCosts: 200_000,
      depreciationRate: 0.1,
      interestRate: 0.04,
      effectiveTaxRate: 0.3,
    }
    // 価格=基準価格 → 数量 1,000、売上 2,000,000、原価 1,000,000、粗利 1,000,000
    // 減価償却 1,000,000×0.1 = 100,000 / 販管費 200,000+100,000 = 300,000 / 営業利益 700,000
    // 支払利息 500,000×0.04 = 20,000 / 税引前 680,000 / 税 680,000×0.3 = 204,000 / 純利益 476,000
    const { incomeStatement: pl } = resolveTurn(state, noop, params)
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
