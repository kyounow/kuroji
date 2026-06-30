import { describe, it, expect } from 'vitest'
import type { SimParams } from '@core/types'
import { getScenario } from '@data/scenarios'
import { productionCapacity, costEfficiency } from './capacity'

const base = getScenario('default').params

describe('productionCapacity', () => {
  const params: SimParams = { ...base, capacityPerEquipment: 0.004 }

  it('設備が多いほど能力が高い', () => {
    expect(productionCapacity(600_000, params, 1)).toBeGreaterThan(
      productionCapacity(300_000, params, 1),
    )
  })

  it('期間係数でスケールする（月次は年次の約1/12）', () => {
    const annual = productionCapacity(300_000, params, 1)
    const monthly = productionCapacity(300_000, params, 1 / 12)
    expect(monthly).toBeLessThan(annual)
  })

  it('capacityPerEquipment 未設定なら能力無制限', () => {
    const noCap: SimParams = { ...base, capacityPerEquipment: undefined }
    expect(productionCapacity(300_000, noCap, 1 / 12)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('costEfficiency', () => {
  const params: SimParams = { ...base, scaleEconomyMax: 0.2, scaleEconomyHalf: 1_000_000 }

  it('設備が大きいほど原価が下がる（1.0未満）', () => {
    const small = costEfficiency(200_000, params)
    const big = costEfficiency(5_000_000, params)
    expect(small).toBeLessThan(1)
    expect(big).toBeLessThan(small)
    expect(big).toBeGreaterThan(1 - params.scaleEconomyMax!) // 上限を超えない
  })

  it('パラメータ未設定なら 1.0（効果なし）', () => {
    const noScale: SimParams = { ...base, scaleEconomyMax: undefined, scaleEconomyHalf: undefined }
    expect(costEfficiency(5_000_000, noScale)).toBe(1)
  })
})
