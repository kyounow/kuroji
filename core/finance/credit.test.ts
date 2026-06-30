import { describe, it, expect } from 'vitest'
import type { CompanyState } from '@core/types'
import { assessCredit } from './credit'

/** 総資産・純資産・有利子負債を独立に指定した状態を作る（シナリオ非依存）。 */
function mkState(totalAssets: number, equity: number, debt: number): CompanyState {
  return {
    turn: 0,
    materialUnits: 0,
    finishedUnits: 0,
    materialIndex: 1,
    rdStock: 0,
    balanceSheet: {
      currentAssets: { cash: totalAssets, accountsReceivable: 0, rawMaterials: 0, finishedGoods: 0 },
      fixedAssets: { equipment: 0 },
      currentLiabilities: { accountsPayable: 0, shortTermDebt: 0 },
      nonCurrentLiabilities: { longTermDebt: debt },
      equity: { capitalStock: equity, retainedEarnings: 0 },
    },
  }
}

describe('assessCredit', () => {
  it('自己資本比率が高いほど良い格付け・低スプレッド・広い借入枠', () => {
    const strong = assessCredit(mkState(10_000_000, 8_000_000, 0)) // 比率0.8
    const weak = assessCredit(mkState(10_000_000, 2_000_000, 6_000_000)) // 比率0.2
    expect(strong.spread).toBeLessThan(weak.spread)
    expect(strong.borrowLimit).toBeGreaterThan(weak.borrowLimit)
  })

  it('財務が著しく悪いと格付け D・コベナンツ違反で借入枠0', () => {
    const broke = assessCredit(mkState(10_000_000, 1_000_000, 9_000_000)) // 比率0.1 → D
    expect(broke.grade).toBe('D')
    expect(broke.covenantBreach).toBe(true)
    expect(broke.borrowLimit).toBe(0)
  })

  it('借入枠 = 純資産×レバレッジ − 既存債務（>=0）', () => {
    const c = assessCredit(mkState(13_000_000, 13_000_000, 1_000_000))
    // 純資産13,000,000、AAA(×3)=39,000,000、−既存債務1,000,000
    expect(c.grade).toBe('AAA')
    expect(c.borrowLimit).toBe(39_000_000 - 1_000_000)
  })
})
