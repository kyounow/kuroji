import type { Scenario } from './types'

/**
 * IT スタートアップ: 高単価・低変動費だが固定費（人件費）が重い。
 * R&D が需要を大きく押し上げる。掛け売り中心、借入も多めでハイリスク・ハイリターン。
 * 数値は学習用のサンプル（出典なし）。
 */
export const startupScenario: Scenario = {
  id: 'startup',
  name: 'IT スタートアップ — 研究開発勝負',
  description:
    '高単価・低変動費だが固定費（エンジニア）が重い。研究開発で需要を大きく伸ばせるが、資金繰りはシビア。',
  initialState: {
    turn: 0,
    materialUnits: 1_000, // 1,000 × 500 = 500,000
    finishedUnits: 0,
    materialIndex: 1.0,
    rdStock: 0,
    balanceSheet: {
      currentAssets: { cash: 6_000_000, accountsReceivable: 0, rawMaterials: 500_000, finishedGoods: 0 },
      fixedAssets: { equipment: 3_000_000 },
      currentLiabilities: { accountsPayable: 0, shortTermDebt: 0 },
      nonCurrentLiabilities: { longTermDebt: 4_000_000 },
      equity: { capitalStock: 5_000_000, retainedEarnings: 500_000 },
    },
  },
  params: {
    periodsPerYear: 12,
    baseDemand: 500,
    basePrice: 5_000,
    priceElasticity: 0.8,
    competitorStrength: 0.5,
    unitVariableCost: 500,
    materialVolatility: 0.1,
    materialMeanReversion: 0.4,
    fixedCosts: 1_500_000,
    depreciationRate: 0.2,
    salesOnCreditRatio: 0.6,
    payableRatio: 0.3,
    marketingEffect: 0.6,
    marketingHalf: 300_000,
    insuranceRefCost: 300_000,
    maxInsuranceCoverage: 0.8,
    rdCostReductionMax: 0.5,
    rdDemandBoostMax: 1.0,
    rdHalf: 800_000,
    interestRate: 0.05,
    effectiveTaxRate: 0.3,
  },
  turnLimit: 96,
  goal: {
    kind: 'equityTarget',
    label: '8年（96ヶ月）以内に純資産を 1,500万円に',
    target: 15_000_000,
    withinTurns: 96,
  },
}
