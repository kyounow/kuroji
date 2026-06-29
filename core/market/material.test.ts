import { describe, it, expect } from 'vitest'
import type { SimParams } from '@core/types'
import { getScenario } from '@data/scenarios'
import { materialIndexNext } from './material'

const { params } = getScenario('default')

describe('materialIndexNext（原材料スポット価格）', () => {
  it('同じ (seed, turn) なら同じ値（決定論）', () => {
    expect(materialIndexNext(1, params, 42, 3)).toBe(materialIndexNext(1, params, 42, 3))
  })

  it('ボラティリティ0なら平均回帰のみで動く', () => {
    const calm: SimParams = { ...params, materialVolatility: 0, materialMeanReversion: 0.5 }
    // prev=2.0 から、1.0 方向へ半分戻る → 1.5
    expect(materialIndexNext(2, calm, 1, 1)).toBeCloseTo(1.5)
  })

  it('平均回帰1.0なら基準1.0へ戻る（ノイズ無し時）', () => {
    const revert: SimParams = { ...params, materialVolatility: 0, materialMeanReversion: 1 }
    expect(materialIndexNext(3, revert, 1, 1)).toBeCloseTo(1)
  })

  it('下限0.2でクリップされる', () => {
    const crash: SimParams = { ...params, materialVolatility: 5, materialMeanReversion: 0 }
    for (let t = 0; t < 50; t++) {
      expect(materialIndexNext(0.3, crash, 7, t)).toBeGreaterThanOrEqual(0.2)
    }
  })

  it('ターンが違えばノイズが変わりうる', () => {
    const vals = new Set<number>()
    for (let t = 0; t < 20; t++) vals.add(materialIndexNext(1, params, 99, t))
    expect(vals.size).toBeGreaterThan(1)
  })
})
