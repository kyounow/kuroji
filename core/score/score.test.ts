import { describe, it, expect } from 'vitest'
import type { Ratios } from '@core/types'
import { scoreGame } from './score'

const ratios = (over: Partial<Ratios> = {}): Ratios => ({
  currentRatio: 2,
  equityRatio: 0.6,
  roe: 0.3,
  roa: 0.2,
  grossMargin: 0.5,
  operatingMargin: 0.2,
  ...over,
})

describe('scoreGame', () => {
  it('優秀な経営（成長・安全・効率・早期達成）は高スコア・星3', () => {
    const s = scoreGame({
      startEquity: 7_000_000,
      endEquity: 15_000_000,
      finalRatios: ratios(),
      roeHistory: [0.3, 0.3, 0.3],
      won: true,
      turnsUsed: 6,
      turnLimit: 12,
    })
    expect(s.total).toBeGreaterThanOrEqual(75)
    expect(s.stars).toBe(3)
  })

  it('低調な経営は低スコア・星1', () => {
    const s = scoreGame({
      startEquity: 7_000_000,
      endEquity: 7_100_000,
      finalRatios: ratios({ equityRatio: 0.2, currentRatio: 0.5 }),
      roeHistory: [0.01, 0.0, -0.02],
      won: false,
      turnsUsed: 12,
      turnLimit: 12,
    })
    expect(s.total).toBeLessThan(45)
    expect(s.stars).toBe(1)
  })

  it('未勝利は達成速度点が0', () => {
    const s = scoreGame({
      startEquity: 7_000_000,
      endEquity: 8_000_000,
      finalRatios: ratios(),
      roeHistory: [0.1],
      won: false,
      turnsUsed: 12,
      turnLimit: 12,
    })
    expect(s.speed).toBe(0)
  })

  it('合計は各項の和、0..100 に収まる', () => {
    const s = scoreGame({
      startEquity: 5_000_000,
      endEquity: 20_000_000,
      finalRatios: ratios({ currentRatio: Number.POSITIVE_INFINITY }),
      roeHistory: [0.5, 0.5],
      won: true,
      turnsUsed: 1,
      turnLimit: 12,
    })
    expect(s.total).toBe(s.growth + s.safety + s.efficiency + s.speed)
    expect(s.total).toBeLessThanOrEqual(100)
    expect(s.total).toBeGreaterThanOrEqual(0)
  })
})
