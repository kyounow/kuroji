import { describe, it, expect } from 'vitest'
import type { SimParams } from '@core/types'
import { getScenario } from '@data/scenarios'
import { competitorAt, shareMultiplier, marketShare } from './competitor'

const { params } = getScenario('default')

describe('competitorAt', () => {
  it('同じ (seed, turn) なら同じ競合（決定論）', () => {
    expect(competitorAt(params, 42, 3)).toEqual(competitorAt(params, 42, 3))
  })

  it('ターンが違えば競合も変わりうる', () => {
    const prices = new Set<number>()
    for (let t = 0; t < 20; t++) prices.add(competitorAt(params, 7, t).price)
    expect(prices.size).toBeGreaterThan(1)
  })
})

describe('shareMultiplier / marketShare', () => {
  const comp = { price: 2_000, quality: 1 }

  it('競合と互角なら倍率1.0・シェア0.5', () => {
    expect(shareMultiplier(2_000, 1, comp, params)).toBeCloseTo(1)
    expect(marketShare(2_000, 1, comp, params)).toBeCloseTo(0.5)
  })

  it('値下げ・高品質ならシェアと倍率が上がる', () => {
    expect(shareMultiplier(1_500, 1, comp, params)).toBeGreaterThan(1)
    expect(shareMultiplier(2_000, 1.3, comp, params)).toBeGreaterThan(1)
  })

  it('値上げ・低品質ならシェアと倍率が下がる', () => {
    expect(shareMultiplier(3_000, 1, comp, params)).toBeLessThan(1)
  })

  it('competitorStrength=0 なら競合なし（倍率1.0）', () => {
    const noComp: SimParams = { ...params, competitorStrength: 0 }
    expect(shareMultiplier(1_000, 2, comp, noComp)).toBe(1)
    expect(marketShare(1_000, 2, comp, noComp)).toBe(0.5)
  })

  it('倍率は [0.4, 1.6] にクリップされる', () => {
    expect(shareMultiplier(100, 5, comp, params)).toBeLessThanOrEqual(1.6)
    expect(shareMultiplier(100_000, 0.1, comp, params)).toBeGreaterThanOrEqual(0.4)
  })
})
