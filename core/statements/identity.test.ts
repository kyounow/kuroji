import { describe, it, expect } from 'vitest'
import { getScenario } from '@data/scenarios'
import { balances, totalAssets, totalLiabilities, totalEquity } from './identity'

describe('会計恒等式（資産 = 負債 + 純資産）', () => {
  it('初期シナリオの貸借対照表は恒等式を満たす', () => {
    const { initialState } = getScenario('default')
    expect(balances(initialState.balanceSheet)).toBe(true)
    expect(totalAssets(initialState.balanceSheet)).toBe(
      totalLiabilities(initialState.balanceSheet) + totalEquity(initialState.balanceSheet),
    )
  })

  it('貸借が崩れた B/S は検出される', () => {
    const { initialState } = getScenario('default')
    const broken = structuredClone(initialState.balanceSheet)
    broken.currentAssets.cash += 1 // 資産だけ増やして崩す
    expect(balances(broken)).toBe(false)
  })
})
