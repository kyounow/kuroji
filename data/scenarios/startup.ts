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
    headcount: 3, // エンジニア3人（精鋭・軽量）。労働＝処理能力。3×80/年=240/年=月20（サーバー処理能力と同じ）
    condition: 1,
    sharesOutstanding: 1_000, // 創業株式1,000株
    balanceSheet: {
      currentAssets: { cash: 1_100_000, accountsReceivable: 0, rawMaterials: 50_000, finishedGoods: 0 },
      fixedAssets: { equipment: 200_000 },
      currentLiabilities: { accountsPayable: 0, shortTermDebt: 0 },
      nonCurrentLiabilities: { longTermDebt: 500_000 },
      equity: { capitalStock: 1_000_000, retainedEarnings: -150_000 }, // 創業赤字（緩め＝受動でも即倒産しない buffer）
    },
  },
  params: {
    periodsPerYear: 12,
    baseDemand: 240,
    basePrice: 5_000,
    priceElasticity: 0.8,
    competitorStrength: 0.25, // 研究開発で差別化する想定。競合は控えめ（受動でも薄利で生き延びられる程度）
    demandNoise: 0.08, // 受注は月々少しブレる（±8%）
    capacityPerEquipment: 0.0012, // サーバー20万 → 年間240 → 月次20
    scaleEconomyMax: 0.4, // 自動化で限界費用が下がる
    scaleEconomyHalf: 1_500_000,
    equipmentLabel: 'サーバー・開発環境',
    capacityLabel: '処理能力',
    unitVariableCost: 500,
    materialVolatility: 0.1,
    materialMeanReversion: 0.4,
    fixedCosts: 30_000, // オフィス・その他（人件費は wage に分離。受動でも期限まで生存できるよう軽め）
    depreciationRate: 0.2, // 陳腐化が速い
    // 人的リソース（エンジニアが価値の源泉＝労働集約）。受動でも即倒産せず「R&Dしないと勝てない」を学べる水準に。
    wage: 125_000, // エンジニア年俸（初期人件費 4×125,000=500,000/年）
    laborPerHead: 80, // 1人あたり年80件（3人=240/年=月20＝処理能力と同じ）
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
    // IPO・上場（スタートアップの本懐。テック水準の高PER・知名度効果も大きい）
    earningsMultiple: 15, // 時価総額＝年間純利益×15
    ipoMaxRaiseRatio: 0.35, // 高PER×大量調達→過剰投資の罠になりやすいため控えめに
    listingCost: 36_000, // 上場維持コスト（年額。IT の月次利益規模に見合う水準＝月3,000円）
    listingDemandBoost: 0.15, // 上場の知名度で需要+15%
    ipoEquityThreshold: 1_000_000,
    ipoProfitablePeriods: 6,
    // M&A（競合スタートアップの吸収＝アクハイヤー含む）
    acqTargetNetAssets: 200_000, // 受入純資産＝サーバー・開発環境
    acqTargetHeadcount: 2, // エンジニア2人を受け入れ
    acqTargetDemandBoost: 0.15,
    goodwillAmortRate: 0.15, // 技術ののれんは陳腐化が速い（約7年償却）
    inflationTarget: 0.02,
    policyNeutralRate: 0.01,
    macroVolatility: 0.45, // 景気変動は大きめだが、薄利のITが受動でも即倒産しない程度に緩和
  },
  turnLimit: 96,
  goal: {
    kind: 'equityTarget',
    label: '純資産を 150万円にする',
    target: 1_500_000,
    withinTurns: 96,
  },
  enabledOneTimeActions: ['ipo', 'ma'],
}
