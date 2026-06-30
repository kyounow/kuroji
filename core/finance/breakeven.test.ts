import { describe, it, expect } from 'vitest'
import type { IncomeStatement } from '@core/types'
import { breakEven } from './breakeven'

// 58個を@1,000で販売、原価¥33,640（@¥580）、販管費¥12,000、利息¥900 の例。
const income: IncomeStatement = {
  revenue: 58_000,
  costOfGoodsSold: 33_640,
  grossProfit: 24_360,
  operatingExpenses: 12_000,
  operatingIncome: 12_360,
  interestExpense: 900,
  extraordinaryLoss: 0,
  pretaxIncome: 11_460,
  tax: 3_438,
  netIncome: 8_022,
}

describe('breakEven', () => {
  it('原価率・粗利率・1個あたり原価/粗利を計算する', () => {
    const b = breakEven({ unitPrice: 1_000, unitsSold: 58, income })
    expect(b.costRatio).toBeCloseTo(33_640 / 58_000) // ≈0.58
    expect(b.grossMarginRatio).toBeCloseTo(1 - 33_640 / 58_000)
    expect(b.unitCost).toBeCloseTo(580)
    expect(b.contributionPerUnit).toBeCloseTo(420) // 1000-580
  })

  it('損益分岐数量＝固定費等÷1個あたり粗利（切り上げ）', () => {
    const b = breakEven({ unitPrice: 1_000, unitsSold: 58, income })
    // fixedLike = 12,000 + 900 = 12,900 → /420 = 30.7 → 31個
    expect(b.fixedLike).toBe(12_900)
    expect(b.breakEvenUnits).toBe(31)
  })

  it('損益分岐売価＝1個あたり原価＋固定費等÷数量', () => {
    const b = breakEven({ unitPrice: 1_000, unitsSold: 58, income })
    expect(b.breakEvenPrice).toBeCloseTo(580 + 12_900 / 58) // ≈802
  })

  it('販売0なら分岐点は無限大（価格が高すぎ等）', () => {
    const noSale: IncomeStatement = { ...income, revenue: 0, costOfGoodsSold: 0, grossProfit: 0 }
    const b = breakEven({ unitPrice: 5_000, unitsSold: 0, income: noSale })
    expect(b.breakEvenUnits).toBe(Number.POSITIVE_INFINITY)
    expect(b.costRatio).toBe(0)
  })

  it('粗利が負（原価割れ）なら損益分岐数量は無限大', () => {
    const loss: IncomeStatement = { ...income, costOfGoodsSold: 70_000, grossProfit: -12_000 }
    const b = breakEven({ unitPrice: 1_000, unitsSold: 58, income: loss })
    expect(b.contributionPerUnit).toBeLessThan(0)
    expect(b.breakEvenUnits).toBe(Number.POSITIVE_INFINITY)
  })
})
