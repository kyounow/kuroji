import { describe, it, expect } from 'vitest'
import { AVAILABLE_SCENARIOS, getScenario } from '@data/scenarios'
import { balances } from '@core/statements/identity'

describe('シナリオ契約（全シナリオが満たすべき不変条件）', () => {
  it('1つ以上のシナリオが登録されている', () => {
    expect(AVAILABLE_SCENARIOS.length).toBeGreaterThan(0)
  })

  for (const { id } of AVAILABLE_SCENARIOS) {
    describe(id, () => {
      const s = getScenario(id)

      it('初期 B/S が会計恒等式を満たす', () => {
        expect(balances(s.initialState.balanceSheet)).toBe(true)
      })

      it('初期の棚卸資産評価額 = 数量 × 基準単価', () => {
        const c = s.initialState.balanceSheet.currentAssets
        expect(c.rawMaterials).toBe(s.initialState.materialUnits * s.params.unitVariableCost)
        expect(c.finishedGoods).toBe(s.initialState.finishedUnits * s.params.unitVariableCost)
      })

      it('ゴールの withinTurns は turnLimit を超えない', () => {
        if (s.goal && 'withinTurns' in s.goal && s.turnLimit) {
          expect(s.goal.withinTurns).toBeLessThanOrEqual(s.turnLimit)
        }
      })
    })
  }
})
