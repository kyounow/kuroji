import type { Scenario } from './types'

/**
 * 標準シナリオ（製造小売・創業）: ごく小さく始めて、設備投資で生産能力を広げながら拡大する。
 * 設備は「生産能力（数量/月）」の上限を決め、減価償却で能力が減るため継続投資が要る。
 * 数値は学習用のサンプル（出典なし）。
 */
export const defaultScenario: Scenario = {
  id: 'default',
  name: '標準シナリオ — 町工場の創業',
  description:
    'ごく小さな製造の会社を創業する。設備投資で生産能力を広げ、価格・研究開発・資金繰りを判断して黒字経営を目指す。',
  initialState: {
    turn: 0,
    // 基準単価 520 円で評価: 原材料 100個=52,000 / 製品 50個=26,000
    materialUnits: 100,
    finishedUnits: 50,
    materialIndex: 1.0,
    rdStock: 0,
    headcount: 5, // 創業メンバー5人。労働能力 5×120/年=600/年=月50（設備能力と同じ＝両方がボトルネック）
    condition: 1,
    sharesOutstanding: 1_000, // 創業株式1,000株（純資産99万 → 1株あたり約990円）
    balanceSheet: {
      currentAssets: { cash: 1_000_000, accountsReceivable: 0, rawMaterials: 52_000, finishedGoods: 26_000 },
      fixedAssets: { equipment: 300_000 },
      currentLiabilities: { accountsPayable: 0, shortTermDebt: 0 },
      nonCurrentLiabilities: { longTermDebt: 400_000 },
      equity: { capitalStock: 800_000, retainedEarnings: 178_000 },
    },
  },
  params: {
    periodsPerYear: 12, // 月次
    // 需要（年額）
    baseDemand: 600,
    basePrice: 1_000,
    priceElasticity: 1.2,
    competitorStrength: 0.3,
    demandNoise: 0.15, // 実需は±15%ブレる（プレビューは中心値）
    // 設備・生産能力
    capacityPerEquipment: 0.002, // 設備30万 → 年間能力600 → 月次50
    scaleEconomyMax: 0.2,
    scaleEconomyHalf: 2_000_000,
    // コスト・原材料
    unitVariableCost: 520, // 粗利を確保（創業の薄利でも黒字が出る水準に調整）
    materialVolatility: 0.15,
    materialMeanReversion: 0.3,
    fixedCosts: 50_000, // 家賃・その他（人件費は wage に分離）
    depreciationRate: 0.1,
    // 人的リソース（人件費・労働能力）。初期は人件費 5×14,000=70,000 で旧固定費120,000と均衡。
    wage: 14_000, // 1人あたり年14,000
    laborPerHead: 120, // 1人あたり年120個（5人=600/年=月50＝設備能力と同じ）
    hireCost: 12_000, // 採用費/人
    severance: 10_000, // 退職金/人
    attritionSlope: 0.5, // 給与水準が相場を下回るほど離職（相場の半額で離職率0.5×0.5=25%）
    maxAttrition: 0.3, // 1ヶ月の離職率上限30%
    // 発生主義（売掛・買掛）
    salesOnCreditRatio: 0.3,
    payableRatio: 0.3,
    // 販促
    marketingEffect: 0.5,
    marketingHalf: 40_000,
    // 保険
    insuranceRefCost: 30_000,
    maxInsuranceCoverage: 0.8,
    maintenanceRefCost: 30_000, // この保全費で最大軽減に到達
    maxMaintenanceReduction: 0.7, // 予防保全で設備故障の被害を最大70%軽減
    // 故障・リコールは「発生確率リスク」。積み上げた整備状態・品質で発火率が下がる。
    conditionDecay: 0.015, // 整備状態は毎月1.5%劣化（保全費で“維持”が手頃に＝月4,500で均衡）
    conditionGainPerRefCost: 0.1, // 保全費30,000で整備状態+0.1
    conditionShield: 0.85, // 整備状態満点で故障発火率を最大85%減
    breakdownBaseRate: 1.0, // 放置（整備状態0）なら引かれた故障は必ず発火
    recallBaseRate: 0.8, // 品質0でも引かれたリコールの80%が発火
    recallQualityShield: 0.8, // 品質満点でリコール発火率を最大80%減
    // 研究開発
    rdCostReductionMax: 0.4,
    rdDemandBoostMax: 0.5,
    rdHalf: 300_000,
    // 財務・税
    interestRate: 0.02, // 政策金利への銀行スプレッド
    effectiveTaxRate: 0.3,
    // マクロ経済
    inflationTarget: 0.02,
    policyNeutralRate: 0.01,
    macroVolatility: 0.5,
  },
  turnLimit: 96, // 8年（96ヶ月）
  goal: {
    kind: 'equityTarget',
    label: '純資産を 150万円にする',
    target: 1_500_000,
    withinTurns: 96,
  },
}
