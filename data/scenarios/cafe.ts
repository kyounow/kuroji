import type { Scenario } from './types'

/**
 * カフェ（創業・薄利多売）: 設備＝「店舗・厨房」が「来客キャパ（人/月）」の上限を決める。
 * 安い食材で数を売る。価格に敏感な客層、新メニュー（R&D）で集客を伸ばせる。
 */
export const cafeScenario: Scenario = {
  id: 'cafe',
  name: 'カフェ — 小さな店の創業',
  description:
    '小さなカフェを創業。店舗・厨房に投資して来客キャパを広げ、安い食材の薄利多売で数を売る。新メニューで集客。',
  initialState: {
    turn: 0,
    materialUnits: 100, // 食材 100 × 200 = 20,000
    finishedUnits: 50, // 仕込み 50 × 200 = 10,000
    materialIndex: 1.0,
    rdStock: 0,
    balanceSheet: {
      currentAssets: { cash: 500_000, accountsReceivable: 0, rawMaterials: 20_000, finishedGoods: 10_000 },
      fixedAssets: { equipment: 400_000 },
      currentLiabilities: { accountsPayable: 0, shortTermDebt: 0 },
      nonCurrentLiabilities: { longTermDebt: 300_000 },
      equity: { capitalStock: 500_000, retainedEarnings: 130_000 },
    },
  },
  params: {
    periodsPerYear: 12,
    baseDemand: 3_000,
    basePrice: 500,
    priceElasticity: 1.5,
    competitorStrength: 0.4,
    demandNoise: 0.2, // 来客数は日々ブレる
    capacityPerEquipment: 0.0075, // 店舗40万 → 年間来客3,000 → 月次250
    scaleEconomyMax: 0.1,
    scaleEconomyHalf: 2_000_000,
    equipmentLabel: '店舗・厨房',
    capacityLabel: '来客キャパ',
    unitVariableCost: 200,
    materialVolatility: 0.2,
    materialMeanReversion: 0.3,
    fixedCosts: 360_000, // 家賃・人件費（年）
    depreciationRate: 0.1,
    salesOnCreditRatio: 0.05,
    payableRatio: 0.4,
    marketingEffect: 0.4,
    marketingHalf: 30_000,
    insuranceRefCost: 20_000,
    maxInsuranceCoverage: 0.8,
    maintenanceRefCost: 20_000,
    maxMaintenanceReduction: 0.7,
    rdCostReductionMax: 0.2,
    rdDemandBoostMax: 0.6,
    rdHalf: 200_000,
    interestRate: 0.02,
    effectiveTaxRate: 0.3,
    inflationTarget: 0.02,
    policyNeutralRate: 0.01,
    macroVolatility: 0.5,
  },
  turnLimit: 96,
  goal: {
    kind: 'equityTarget',
    label: '純資産を 150万円にする',
    target: 1_500_000,
    withinTurns: 96,
  },
}
