import type { Scenario } from './types'

/**
 * チュートリアル（創業・やさしい）: 操作を「価格・原材料の仕入・生産」に絞り、
 * 仕入→生産→販売→財務三表の流れと倒産回避を学ぶ。生産能力の制約は無し（設備投資は未開放）。
 */
export const tutorialScenario: Scenario = {
  id: 'tutorial',
  name: 'チュートリアル — まず基本の流れ',
  description:
    '価格・原材料の仕入・生産だけを操作。仕入→生産→販売がBS/PL/CFにどう流れるかを、2年かけて体験する。',
  initialState: {
    turn: 0,
    materialUnits: 100, // 100 × 600 = 60,000
    finishedUnits: 100, // 100 × 600 = 60,000
    materialIndex: 1.0,
    rdStock: 0,
    balanceSheet: {
      currentAssets: { cash: 800_000, accountsReceivable: 0, rawMaterials: 60_000, finishedGoods: 60_000 },
      fixedAssets: { equipment: 200_000 },
      currentLiabilities: { accountsPayable: 0, shortTermDebt: 0 },
      nonCurrentLiabilities: { longTermDebt: 100_000 },
      equity: { capitalStock: 800_000, retainedEarnings: 220_000 },
    },
  },
  params: {
    periodsPerYear: 12,
    baseDemand: 600,
    basePrice: 1_000,
    priceElasticity: 1.2,
    competitorStrength: 0, // 競合なし
    // 生産能力の制約なし（capacityPerEquipment 未設定）。設備投資が未開放のため。
    unitVariableCost: 600,
    materialVolatility: 0.1,
    materialMeanReversion: 0.4,
    fixedCosts: 120_000, // やさしめ
    depreciationRate: 0.1,
    salesOnCreditRatio: 0.3,
    payableRatio: 0.3,
    marketingEffect: 0.5,
    marketingHalf: 40_000,
    insuranceRefCost: 30_000,
    maxInsuranceCoverage: 0.8,
    rdCostReductionMax: 0.4,
    rdDemandBoostMax: 0.5,
    rdHalf: 300_000,
    interestRate: 0.02,
    effectiveTaxRate: 0.3,
  },
  enabledDecisions: ['unitPrice', 'purchaseMaterials', 'produceUnits'],
  turnLimit: 24,
  goal: {
    kind: 'survive',
    label: '2年（24ヶ月）を倒産せず経営する',
    turns: 24,
  },
}
