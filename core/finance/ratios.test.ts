import { describe, it, expect } from 'vitest'
import type { BalanceSheet, IncomeStatement } from '@core/types'
import { computeRatios } from './ratios'

// 資産合計 = 負債合計 + 純資産合計 = 1,000 になる例。
const bs: BalanceSheet = {
  currentAssets: { cash: 300, accountsReceivable: 100, rawMaterials: 120, finishedGoods: 80 }, // 流動資産 600
  fixedAssets: { equipment: 400 }, // 総資産 1,000
  currentLiabilities: { accountsPayable: 100, shortTermDebt: 200 }, // 流動負債 300
  nonCurrentLiabilities: { longTermDebt: 100 }, // 負債合計 400
  equity: { capitalStock: 400, retainedEarnings: 200 }, // 純資産 600
}

const pl: IncomeStatement = {
  revenue: 1_000,
  costOfGoodsSold: 600,
  grossProfit: 400,
  operatingExpenses: 250,
  operatingIncome: 150,
  interestExpense: 30,
  pretaxIncome: 120,
  tax: 60,
  netIncome: 60,
}

describe('computeRatios（経営指標）', () => {
  it('各指標を正しく計算する', () => {
    const r = computeRatios(bs, pl)
    expect(r.currentRatio).toBeCloseTo(600 / 300) // 流動比率 2.0
    expect(r.equityRatio).toBeCloseTo(600 / 1_000) // 自己資本比率 0.6
    expect(r.roe).toBeCloseTo(60 / 600) // ROE 0.1
    expect(r.roa).toBeCloseTo(60 / 1_000) // ROA 0.06
    expect(r.grossMargin).toBeCloseTo(400 / 1_000) // 粗利率 0.4
    expect(r.operatingMargin).toBeCloseTo(150 / 1_000) // 営業利益率 0.15
  })

  it('流動負債が0なら流動比率は+∞', () => {
    const noDebt: BalanceSheet = {
      ...bs,
      currentLiabilities: { accountsPayable: 0, shortTermDebt: 0 },
    }
    expect(computeRatios(noDebt, pl).currentRatio).toBe(Number.POSITIVE_INFINITY)
  })
})
