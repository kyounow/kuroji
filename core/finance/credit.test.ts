import { describe, it, expect } from 'vitest'
import type { CompanyState } from '@core/types'
import { getScenario } from '@data/scenarios'
import { assessCredit } from './credit'

const { initialState } = getScenario('default')

/** 純資産（利益剰余金）と負債を指定した状態を作る。 */
function withFinance(retainedEarnings: number, longTermDebt: number): CompanyState {
  return {
    ...initialState,
    balanceSheet: {
      ...initialState.balanceSheet,
      nonCurrentLiabilities: { longTermDebt },
      equity: { ...initialState.balanceSheet.equity, retainedEarnings },
    },
  }
}

describe('assessCredit', () => {
  it('自己資本比率が高いほど良い格付け・低スプレッド・広い借入枠', () => {
    const strong = assessCredit(withFinance(8_000_000, 0)) // 純資産大・無借金
    const weak = assessCredit(withFinance(0, 6_000_000)) // 純資産小・借入大
    expect(strong.spread).toBeLessThan(weak.spread)
    expect(strong.borrowLimit).toBeGreaterThan(weak.borrowLimit)
  })

  it('財務が著しく悪いと格付け D・コベナンツ違反で借入枠0', () => {
    // 資産1,000万に対し純資産100万（自己資本比率0.1）→ D
    const broke = assessCredit(withFinance(-4_000_000, 9_000_000))
    expect(broke.grade).toBe('D')
    expect(broke.covenantBreach).toBe(true)
    expect(broke.borrowLimit).toBe(0)
  })

  it('借入枠 = 純資産×レバレッジ − 既存債務（>=0）', () => {
    const c = assessCredit(withFinance(8_000_000, 1_000_000))
    // 純資産 = 資本金5,000,000 + 利益剰余金8,000,000 = 13,000,000、AAA(×3)=39,000,000、−既存債務1,000,000
    expect(c.grade).toBe('AAA')
    expect(c.borrowLimit).toBe(39_000_000 - 1_000_000)
  })
})
