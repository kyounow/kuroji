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
    headcount: 8, // スタッフ8人。労働＝接客（来客キャパ）。8×375/年=3,000/年=月250（店舗キャパと同じ）
    condition: 1,
    sharesOutstanding: 1_000, // 創業株式1,000株
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
    fixedCosts: 120_000, // 家賃・その他（人件費は wage に分離）
    depreciationRate: 0.1,
    // 人的リソース（接客が中心の労働集約）。初期人件費 8×30,000=240,000 で旧360,000と均衡。
    wage: 30_000,
    laborPerHead: 375, // 1人あたり年375人（8人=3,000/年=月250＝来客キャパと同じ）
    hireCost: 15_000,
    severance: 12_000,
    attritionSlope: 0.6, // 接客業は離職しやすい
    maxAttrition: 0.35,
    salesOnCreditRatio: 0.05,
    payableRatio: 0.4,
    marketingEffect: 0.4,
    marketingHalf: 30_000,
    insuranceRefCost: 20_000,
    maxInsuranceCoverage: 0.8,
    maintenanceRefCost: 20_000,
    maxMaintenanceReduction: 0.7,
    conditionDecay: 0.015,
    conditionGainPerRefCost: 0.1,
    conditionShield: 0.85,
    breakdownBaseRate: 1.0,
    recallBaseRate: 0.8,
    recallQualityShield: 0.8,
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
