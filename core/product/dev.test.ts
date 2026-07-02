import { describe, it, expect } from 'vitest'
import type { CompanyState, DevProject, SimParams } from '@core/types'
import { composeLineDefs, devLifecycleFactor, developmentAssetOf } from './dev'

const PP: DevProject = {
  id: 'perm',
  name: '恒久',
  kind: 'upgrade',
  targetLineId: 'main',
  demandBoost: 0.2,
  requiredInvestment: 100_000,
  minTurns: 1,
  capitalize: false,
  lifecycle: 'permanent',
}

const params = (over: Partial<SimParams> = {}): SimParams =>
  ({
    periodsPerYear: 12,
    baseDemand: 1200,
    basePrice: 1000,
    priceElasticity: 1.2,
    competitorStrength: 0,
    unitVariableCost: 500,
    materialVolatility: 0,
    materialMeanReversion: 0,
    fixedCosts: 0,
    depreciationRate: 0.1,
    salesOnCreditRatio: 0,
    payableRatio: 0,
    marketingEffect: 0.5,
    marketingHalf: 30_000,
    insuranceRefCost: 0,
    maxInsuranceCoverage: 0,
    rdCostReductionMax: 0.4,
    rdDemandBoostMax: 0.5,
    rdHalf: 300_000,
    interestRate: 0.02,
    effectiveTaxRate: 0.3,
    ...over,
  }) as SimParams

const stateWith = (launched: CompanyState['devLaunched']): CompanyState =>
  ({ devLaunched: launched }) as CompanyState

describe('devLifecycleFactor', () => {
  it('permanent は常に1・seasonal は期間内1/期間後0・decay は複利で逓減', () => {
    expect(devLifecycleFactor(PP, 0, 12)).toBe(1)
    expect(devLifecycleFactor(PP, 100, 12)).toBe(1)
    const seasonal: DevProject = { ...PP, lifecycle: 'seasonal', boostDuration: 6 }
    expect(devLifecycleFactor(seasonal, 5, 12)).toBe(1)
    expect(devLifecycleFactor(seasonal, 6, 12)).toBe(0)
    const decay: DevProject = { ...PP, lifecycle: 'decay', obsolescenceRate: 0.12 } // 月1%
    expect(devLifecycleFactor(decay, 0, 12)).toBe(1)
    expect(devLifecycleFactor(decay, 12, 12)).toBeCloseTo(Math.pow(0.99, 12), 10)
  })
})

describe('composeLineDefs', () => {
  it('未ローンチなら基本構成のまま。new のローンチで新ラインが末尾に増える', () => {
    const p = params({
      devProjects: [
        {
          id: 'np',
          name: '新製品',
          kind: 'new',
          requiredInvestment: 200_000,
          minTurns: 1,
          capitalize: true,
          amortRate: 0.2,
          lifecycle: 'permanent',
          newLine: { id: 'nl', name: '新製品', baseDemand: 600, basePrice: 3000, priceElasticity: 1, unitVariableCost: 1200 },
        },
      ],
    })
    expect(composeLineDefs(p, {} as CompanyState, 5)).toHaveLength(1) // main のみ
    const defs = composeLineDefs(p, stateWith([{ projectId: 'np', launchedTurn: 3, bookValue: 200_000 }]), 5)
    expect(defs).toHaveLength(2)
    expect(defs[1].id).toBe('nl')
    expect(defs[1].baseDemand).toBe(600) // permanent は減らない
    // 未来のローンチ（launchedTurn > turn）はまだ出ない
    expect(composeLineDefs(p, stateWith([{ projectId: 'np', launchedTurn: 9, bookValue: 0 }]), 5)).toHaveLength(1)
  })

  it('upgrade は対象ラインの需要ブースト（×lifecycle）と R&D 上限デルタを合成する', () => {
    const p = params({
      devProjects: [
        { ...PP, id: 'up', rdCostReductionMaxDelta: 0.1 },
        { ...PP, id: 'season', lifecycle: 'seasonal', boostDuration: 4, demandBoost: 0.5 },
      ],
    })
    const both = composeLineDefs(
      p,
      stateWith([
        { projectId: 'up', launchedTurn: 0, bookValue: 0 },
        { projectId: 'season', launchedTurn: 0, bookValue: 0 },
      ]),
      2, // 季節はまだ有効（経過2 < 4）
    )
    expect(both[0].baseDemand).toBeCloseTo(1200 * 1.2 * 1.5, 6)
    expect(both[0].rdCostReductionMax).toBeCloseTo(0.5, 6) // 0.4 + 0.1
    const after = composeLineDefs(p, stateWith([{ projectId: 'season', launchedTurn: 0, bookValue: 0 }]), 4)
    expect(after[0].baseDemand).toBe(1200) // 季節終了で効果消滅
  })
})

describe('developmentAssetOf', () => {
  it('Σ(資産計上WIP)＋Σ(残存簿価)。費用処理案件のWIPは資産に含めない', () => {
    const p = params({
      devProjects: [
        { ...PP, id: 'cap', capitalize: true, amortRate: 0.2 },
        { ...PP, id: 'exp', capitalize: false },
      ],
    })
    expect(developmentAssetOf(p, {})).toBe(0)
    expect(
      developmentAssetOf(p, {
        devInProgress: [
          { projectId: 'cap', invested: 120_000 },
          { projectId: 'exp', invested: 30_000 }, // 費用処理＝資産に入らない
        ],
        devLaunched: [{ projectId: 'cap', launchedTurn: 1, bookValue: 90_000 }],
      }),
    ).toBe(210_000)
  })
})
