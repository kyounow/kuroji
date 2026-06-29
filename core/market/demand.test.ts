import { describe, it, expect } from 'vitest'
import type { SimParams } from '@core/types'
import { demandAt } from './demand'

const params: SimParams = {
  baseDemand: 1_000,
  basePrice: 2_000,
  priceElasticity: 1.2,
  unitVariableCost: 1_000,
  fixedCosts: 500_000,
  depreciationRate: 0.1,
  interestRate: 0.03,
  effectiveTaxRate: 0.3,
}

describe('demandAt（価格→数量）', () => {
  it('基準価格では基準需要になる', () => {
    expect(demandAt(params.basePrice, params)).toBe(params.baseDemand)
  })

  it('値上げすると数量が減る', () => {
    expect(demandAt(3_000, params)).toBeLessThan(params.baseDemand)
  })

  it('値下げすると数量が増える', () => {
    expect(demandAt(1_000, params)).toBeGreaterThan(params.baseDemand)
  })

  it('価格が0以下なら数量は0', () => {
    expect(demandAt(0, params)).toBe(0)
    expect(demandAt(-100, params)).toBe(0)
  })

  it('整数を返す', () => {
    expect(Number.isInteger(demandAt(2_345, params))).toBe(true)
  })
})
