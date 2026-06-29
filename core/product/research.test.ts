import { describe, it, expect } from 'vitest'
import { getScenario } from '@data/scenarios'
import { productFromRd } from './research'

const { params } = getScenario('default')

describe('productFromRd（R&D→製品パラメータ）', () => {
  it('R&Dが0なら基準（原価1.0・需要1.0）', () => {
    const p = productFromRd(0, params)
    expect(p.unitCostModifier).toBe(1)
    expect(p.demandModifier).toBe(1)
  })

  it('R&Dを積むほど原価が下がり需要が上がる', () => {
    const low = productFromRd(500_000, params)
    const high = productFromRd(5_000_000, params)
    expect(high.unitCostModifier).toBeLessThan(low.unitCostModifier)
    expect(high.demandModifier).toBeGreaterThan(low.demandModifier)
  })

  it('効果は逓減し、上限を超えない', () => {
    const huge = productFromRd(1_000_000_000, params)
    expect(huge.unitCostModifier).toBeGreaterThan(1 - params.rdCostReductionMax)
    expect(huge.demandModifier).toBeLessThan(1 + params.rdDemandBoostMax)
  })

  it('rdHalf で効果はちょうど最大の半分', () => {
    const p = productFromRd(params.rdHalf, params)
    expect(p.unitCostModifier).toBeCloseTo(1 - params.rdCostReductionMax * 0.5)
    expect(p.demandModifier).toBeCloseTo(1 + params.rdDemandBoostMax * 0.5)
  })
})
