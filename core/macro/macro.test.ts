import { describe, it, expect } from 'vitest'
import type { SimParams } from '@core/types'
import { getScenario } from '@data/scenarios'
import { initialMacro, advanceMacro, cycleDemandMultiplier, type MacroState } from './macro'

const base = getScenario('default').params
const active: SimParams = { ...base, macroVolatility: 0.5, inflationTarget: 0.02, policyNeutralRate: 0.01 }

describe('advanceMacro', () => {
  it('同じ (prev, seed, turn) なら同じ結果（決定論）', () => {
    const m = initialMacro(active)
    expect(advanceMacro(m, active, 42, 3)).toEqual(advanceMacro(m, active, 42, 3))
  })

  it('景気局面は数年単位で持続する（毎月コロコロ変わらない）', () => {
    let m = initialMacro(active)
    const phases: string[] = []
    for (let t = 0; t < 120; t++) {
      m = advanceMacro(m, active, 7, t)
      phases.push(m.phase)
    }
    // 120ヶ月で局面が変わる回数は十分少ない（持続している）
    let switches = 0
    for (let i = 1; i < phases.length; i++) if (phases[i] !== phases[i - 1]) switches++
    expect(switches).toBeLessThan(12) // 平均10年以上の持続感
    expect(new Set(phases).size).toBeGreaterThan(1) // でも局面は動く
  })

  it('物価指数は上下しうる（インフレもデフレも起きる）', () => {
    let m = initialMacro(active)
    let sawDeflation = false
    for (let t = 0; t < 600; t++) {
      m = advanceMacro(m, active, 123, t)
      if (m.annualInflation < 0) sawDeflation = true
    }
    expect(sawDeflation).toBe(true) // デフレ（負のインフレ）が起こりうる
    expect(m.inflationIndex).toBeGreaterThan(0) // 指数は正
  })

  it('政策金利は下限0で、インフレ時に上がる傾向', () => {
    let m: MacroState = { ...initialMacro(active), annualInflation: 0.08, policyRate: 0.01 }
    for (let t = 0; t < 24; t++) m = advanceMacro(m, active, 5, t)
    expect(m.policyRate).toBeGreaterThanOrEqual(0)
    expect(m.policyRate).toBeGreaterThan(0.01) // 高インフレで利上げ方向
  })

  it('macroVolatility=0 なら局面=普通で固定、物価も安定', () => {
    const stat: SimParams = { ...base, macroVolatility: 0, inflationTarget: 0 }
    let m = initialMacro(stat)
    for (let t = 0; t < 50; t++) m = advanceMacro(m, stat, 1, t)
    expect(m.phase).toBe('normal')
    expect(m.inflationIndex).toBeCloseTo(1, 1)
  })
})

describe('cycleDemandMultiplier', () => {
  it('拡大>普通>後退', () => {
    const mk = (phase: MacroState['phase']): MacroState => ({ ...initialMacro(active), phase })
    expect(cycleDemandMultiplier(mk('expansion'))).toBeGreaterThan(cycleDemandMultiplier(mk('normal')))
    expect(cycleDemandMultiplier(mk('normal'))).toBeGreaterThan(cycleDemandMultiplier(mk('recession')))
  })
})
