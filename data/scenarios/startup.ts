import type { Scenario } from './types'

/**
 * IT スタートアップ（創業）: 設備＝「サーバー・開発環境」が「処理能力（件/月）」を決める。
 * 高単価・低変動費だが固定費（人件費）が重い。研究開発で需要を大きく伸ばせるが資金繰りはシビア。
 */
export const startupScenario: Scenario = {
  id: 'startup',
  name: 'IT スタートアップ — 研究開発勝負',
  description:
    'サーバー・開発環境に投資して処理能力を広げる。高単価・低変動費だが固定費が重い。研究開発で需要を大きく伸ばす。',
  initialState: {
    turn: 0,
    materialUnits: 100, // 100 × 500 = 50,000
    finishedUnits: 0,
    materialIndex: 1.0,
    rdStock: 0,
    headcount: 4, // エンジニア4人。労働＝処理能力。4×60/年=240/年=月20（サーバー処理能力と同じ）
    condition: 1,
    sharesOutstanding: 1_000, // 創業株式1,000株
    balanceSheet: {
      currentAssets: { cash: 1_000_000, accountsReceivable: 0, rawMaterials: 50_000, finishedGoods: 0 },
      fixedAssets: { equipment: 200_000 },
      currentLiabilities: { accountsPayable: 0, shortTermDebt: 0 },
      nonCurrentLiabilities: { longTermDebt: 500_000 },
      equity: { capitalStock: 1_000_000, retainedEarnings: -250_000 },
    },
  },
  params: {
    periodsPerYear: 12,
    baseDemand: 240,
    basePrice: 5_000,
    priceElasticity: 0.8,
    competitorStrength: 0.35, // 研究開発で差別化する想定。競合は中程度に
    demandNoise: 0.25, // 受注は読みにくい
    capacityPerEquipment: 0.0012, // サーバー20万 → 年間240 → 月次20
    scaleEconomyMax: 0.4, // 自動化で限界費用が下がる
    scaleEconomyHalf: 1_500_000,
    equipmentLabel: 'サーバー・開発環境',
    capacityLabel: '処理能力',
    unitVariableCost: 500,
    materialVolatility: 0.1,
    materialMeanReversion: 0.4,
    fixedCosts: 40_000, // オフィス・その他（人件費は wage に分離）
    depreciationRate: 0.2, // 陳腐化が速い
    // 人的リソース（エンジニアが価値の源泉＝労働集約）。初期人件費 4×140,000=560,000 で旧600,000と均衡。
    wage: 140_000, // エンジニア年俸
    laborPerHead: 60, // 1人あたり年60件（4人=240/年=月20＝処理能力と同じ）
    hireCost: 30_000, // 採用が高い
    severance: 25_000,
    attritionSlope: 0.7, // エンジニアは待遇に敏感で流動性が高い
    maxAttrition: 0.4,
    salesOnCreditRatio: 0.6,
    payableRatio: 0.3,
    marketingEffect: 0.6,
    marketingHalf: 80_000,
    insuranceRefCost: 50_000,
    maxInsuranceCoverage: 0.8,
    maintenanceRefCost: 40_000,
    maxMaintenanceReduction: 0.7,
    conditionDecay: 0.015,
    conditionGainPerRefCost: 0.1,
    conditionShield: 0.85,
    breakdownBaseRate: 1.0,
    recallBaseRate: 0.8,
    recallQualityShield: 0.8,
    rdCostReductionMax: 0.5,
    rdDemandBoostMax: 1.0,
    rdHalf: 500_000,
    interestRate: 0.03,
    effectiveTaxRate: 0.3,
    inflationTarget: 0.02,
    policyNeutralRate: 0.01,
    macroVolatility: 0.6,
  },
  turnLimit: 96,
  goal: {
    kind: 'equityTarget',
    label: '純資産を 150万円にする',
    target: 1_500_000,
    withinTurns: 96,
  },
}
