import { describe, it, expect } from 'vitest'
import type { CompanyState, Goal } from '@core/types'
import { getScenario } from '@data/scenarios'
import { evaluateGoal } from './evaluateGoal'

const { initialState } = getScenario('default')

/** 純資産だけ変えた状態を作る（利益剰余金で調整、turn も指定）。 */
function withEquity(equity: number, turn: number): CompanyState {
  const capital = initialState.balanceSheet.equity.capitalStock
  return {
    ...initialState,
    turn,
    balanceSheet: {
      ...initialState.balanceSheet,
      equity: { capitalStock: capital, retainedEarnings: equity - capital },
    },
  }
}

describe('evaluateGoal — equityTarget', () => {
  const goal: Goal = { kind: 'equityTarget', label: 'x', target: 15_000_000, withinTurns: 12 }

  it('目標到達で won', () => {
    const r = evaluateGoal(goal, withEquity(15_000_000, 5), initialState)
    expect(r.status).toBe('won')
    expect(r.progress).toBe(1)
  })

  it('期限内・未達は progress', () => {
    const r = evaluateGoal(goal, withEquity(10_000_000, 5), initialState)
    expect(r.status).toBe('progress')
    expect(r.progress).toBeGreaterThan(0)
    expect(r.progress).toBeLessThan(1)
  })

  it('期限超過・未達は lost', () => {
    const r = evaluateGoal(goal, withEquity(10_000_000, 12), initialState)
    expect(r.status).toBe('lost')
  })
})

describe('evaluateGoal — repayAll', () => {
  const goal: Goal = { kind: 'repayAll', label: 'x', withinTurns: 10 }

  it('完済で won', () => {
    const s: CompanyState = {
      ...initialState,
      turn: 4,
      balanceSheet: {
        ...initialState.balanceSheet,
        currentLiabilities: { accountsPayable: 0, shortTermDebt: 0 },
        nonCurrentLiabilities: { longTermDebt: 0 },
      },
    }
    expect(evaluateGoal(goal, s, initialState).status).toBe('won')
  })

  it('残債ありで期限超過は lost', () => {
    const s: CompanyState = { ...initialState, turn: 10 }
    expect(evaluateGoal(goal, s, initialState).status).toBe('lost')
  })
})

describe('evaluateGoal — survive', () => {
  const goal: Goal = { kind: 'survive', label: 'x', turns: 8 }

  it('規定期数で won', () => {
    expect(evaluateGoal(goal, { ...initialState, turn: 8 }, initialState).status).toBe('won')
  })

  it('途中は progress', () => {
    const r = evaluateGoal(goal, { ...initialState, turn: 4 }, initialState)
    expect(r.status).toBe('progress')
    expect(r.progress).toBeCloseTo(0.5)
  })
})
