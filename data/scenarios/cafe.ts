import type { Scenario } from './types'

/**
 * カフェ: 低単価・薄利多売。原材料（食材）は安いが価格弾力性が高く、現金商売中心。
 * 数値は学習用のサンプル（出典なし）。
 */
export const cafeScenario: Scenario = {
  id: 'cafe',
  name: 'カフェ — 薄利多売',
  description:
    '小さなカフェ。安い食材で数を売る薄利多売。価格に敏感な客層、新メニュー（R&D）で集客を伸ばせる。',
  initialState: {
    turn: 0,
    materialUnits: 1_000, // 食材 1,000個 × 200円 = 200,000
    finishedUnits: 500, // 仕込み 500個 × 200円 = 100,000
    materialIndex: 1.0,
    rdStock: 0,
    balanceSheet: {
      currentAssets: { cash: 2_000_000, accountsReceivable: 0, rawMaterials: 200_000, finishedGoods: 100_000 },
      fixedAssets: { equipment: 1_500_000 },
      currentLiabilities: { accountsPayable: 0, shortTermDebt: 0 },
      nonCurrentLiabilities: { longTermDebt: 800_000 },
      equity: { capitalStock: 2_000_000, retainedEarnings: 1_000_000 },
    },
  },
  params: {
    periodsPerYear: 4,
    baseDemand: 2_000,
    basePrice: 600,
    priceElasticity: 1.5,
    competitorStrength: 0.4,
    unitVariableCost: 200,
    materialVolatility: 0.2,
    materialMeanReversion: 0.3,
    fixedCosts: 300_000,
    depreciationRate: 0.1,
    salesOnCreditRatio: 0.05,
    payableRatio: 0.4,
    marketingEffect: 0.4,
    marketingHalf: 100_000,
    insuranceRefCost: 100_000,
    maxInsuranceCoverage: 0.8,
    rdCostReductionMax: 0.2,
    rdDemandBoostMax: 0.6,
    rdHalf: 500_000,
    interestRate: 0.03,
    effectiveTaxRate: 0.3,
  },
  turnLimit: 32,
  goal: {
    kind: 'equityTarget',
    label: '8年（32四半期）以内に純資産を 500万円に',
    target: 5_000_000,
    withinTurns: 32,
  },
}
