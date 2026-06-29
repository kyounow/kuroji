import type { Scenario } from './types'

/**
 * チュートリアル: 操作できる判断を「価格・原材料の仕入・生産」に絞り、
 * 基本の流れ（仕入→生産→販売→財務三表）と倒産回避だけを学ぶ。資金にも余裕を持たせる。
 */
export const tutorialScenario: Scenario = {
  id: 'tutorial',
  name: 'チュートリアル — まず基本の流れ',
  description:
    '価格・原材料の仕入・生産だけを操作。仕入→生産→販売がBS/PL/CFにどう流れるかを、6期かけて体験する。',
  initialState: {
    turn: 0,
    materialUnits: 500,
    finishedUnits: 500,
    materialIndex: 1.0,
    rdStock: 0,
    balanceSheet: {
      currentAssets: { cash: 6_000_000, accountsReceivable: 0, rawMaterials: 500_000, finishedGoods: 500_000 },
      fixedAssets: { equipment: 3_000_000 },
      currentLiabilities: { accountsPayable: 0, shortTermDebt: 0 },
      nonCurrentLiabilities: { longTermDebt: 1_000_000 },
      equity: { capitalStock: 6_000_000, retainedEarnings: 3_000_000 },
    },
  },
  params: {
    baseDemand: 1_000,
    basePrice: 2_000,
    priceElasticity: 1.2,
    competitorStrength: 0, // チュートリアルは競合なし
    unitVariableCost: 1_000,
    materialVolatility: 0.1,
    materialMeanReversion: 0.4,
    fixedCosts: 400_000,
    depreciationRate: 0.1,
    salesOnCreditRatio: 0.3,
    payableRatio: 0.3,
    marketingEffect: 0.5,
    marketingHalf: 200_000,
    insuranceRefCost: 200_000,
    maxInsuranceCoverage: 0.8,
    rdCostReductionMax: 0.4,
    rdDemandBoostMax: 0.5,
    rdHalf: 1_000_000,
    interestRate: 0.03,
    effectiveTaxRate: 0.3,
  },
  enabledDecisions: ['unitPrice', 'purchaseMaterials', 'produceUnits'],
  turnLimit: 6,
  goal: {
    kind: 'survive',
    label: '6期を倒産せず経営する',
    turns: 6,
  },
}
