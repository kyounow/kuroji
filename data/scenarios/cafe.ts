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
      currentAssets: { cash: 600_000, accountsReceivable: 0, rawMaterials: 20_000, finishedGoods: 10_000 },
      fixedAssets: { equipment: 400_000 },
      currentLiabilities: { accountsPayable: 0, shortTermDebt: 0 },
      // 開業資金の大半を借入で賄った設定（現金より大きい借入）＝「稼ぎながら返す」が完済目標の本体になる。
      nonCurrentLiabilities: { longTermDebt: 600_000 },
      equity: { capitalStock: 400_000, retainedEarnings: 30_000 },
    },
  },
  params: {
    periodsPerYear: 12,
    baseDemand: 3_000,
    basePrice: 500,
    priceElasticity: 1.5,
    competitorStrength: 0.4,
    demandNoise: 0.08, // 来客数は日々少しブレる（±8%）
    // 複数製品ライン（キッチンとスタッフは共有＝メニュー構成が経営判断に）
    productLines: [
      { id: 'drink', name: 'ドリンク', baseDemand: 3_000, basePrice: 500, priceElasticity: 1.5, unitVariableCost: 200 },
      // フード: 客単価が高く粗利も厚いが、仕込みに同じキッチン能力を使う。
      { id: 'food', name: 'フード', baseDemand: 600, basePrice: 900, priceElasticity: 1.2, unitVariableCost: 450 },
    ],
    capacityPerEquipment: 0.0075, // 店舗40万 → 年間来客3,000 → 月次250
    scaleEconomyMax: 0.1,
    scaleEconomyHalf: 2_000_000,
    equipmentLabel: '店舗・厨房',
    capacityLabel: '来客キャパ',
    unitVariableCost: 200,
    materialVolatility: 0.2,
    materialMeanReversion: 0.3,
    fixedCosts: 108_000, // 家賃・その他（人件費は wage に分離。借入増に伴い受動でも半数は生き残る水準に微調整）
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
    // 人材開発（接客と回転。研修の効果が早く出るが、若いスタッフは離職しやすい）
    hr: {
      roleLabels: { field: 'スタッフ', mgmt: '店長', rnd: 'シェフ' },
      grades: [
        { wageMult: 1, skillMult: 1, expToNext: 18 }, // 半人前→ベテランは1年半
        { wageMult: 1.2, skillMult: 1.2, expToNext: 60 },
        { wageMult: 1.45, skillMult: 1.45 },
      ],
      expPerTurn: 1,
      skillFromExpMax: 0.1,
      expHalf: 96,
      trainingRefCost: 600, // 接客研修は手頃で効きが早い
      trainingExpMax: 8,
      moraleBase: 0.6,
      moraleRecover: 0.05,
      moraleOverworkPenalty: 0.09,
      moraleWageSlope: 0.35,
      moraleTrainingBoost: 0.04,
      moraleProductivitySlope: 0.5,
      attritionMoraleSlope: 0.6,
      attritionMoraleFloor: 0.4, // 若年で離職しやすい
      skillDemandMax: 0.06, // 接客品質が客足を微押し上げ
      mgmtBoost: 0.2,
      mgmtHalf: 1, // 店長1人で効きやすい小さな組織
      rndContribPerYear: 30_000, // シェフのメニュー研究
    },
    // 商材開発（カフェ＝メニュー開発。レシピは資産にならない＝費用処理。製造/ITの資産計上との対比が学び）
    devProjects: [
      {
        id: 'signature',
        name: '定番メニューの開発',
        description: '看板フードメニュー。効果はずっと続く（開発費はその期の費用＝資産にならない）。',
        kind: 'upgrade',
        targetLineId: 'food',
        requiredInvestment: 90_000,
        minTurns: 3,
        capitalize: false,
        lifecycle: 'permanent',
        demandBoost: 0.15,
      },
      {
        id: 'seasonal',
        name: '季節限定メニュー',
        description: '旬の限定ドリンク。6ヶ月だけ需要を大きく押し上げて終了（費用処理）。',
        kind: 'upgrade',
        targetLineId: 'drink',
        requiredInvestment: 45_000,
        minTurns: 2,
        capitalize: false,
        lifecycle: 'seasonal',
        boostDuration: 6,
        demandBoost: 0.3,
      },
    ],
    // M&A（近所のライバル店を買収して常連客ごと受け入れる）
    acqTargetNetAssets: 250_000, // 受入純資産＝店舗・厨房設備
    acqTargetHeadcount: 4, // スタッフ4人を受け入れ
    acqTargetDemandBoost: 0.2, // 常連客の獲得で需要+20%
    goodwillAmortRate: 0.1, // のれんは10年で償却
    interestRate: 0.02,
    effectiveTaxRate: 0.3,
    inflationTarget: 0.02,
    policyNeutralRate: 0.01,
    macroVolatility: 0.5,
  },
  turnLimit: 96,
  // カフェは「借入を完済して無借金経営に」を目標に（純資産目標の他シナリオと差別化＝資金管理の学び）。
  goal: {
    kind: 'repayAll',
    label: '借入を完済して無借金経営にする',
    withinTurns: 96,
  },
  // M&A のみ開放（IPO は小さな店のテーマ外）。借入で買収すると完済目標と相反する＝資金調達の学び。
  enabledOneTimeActions: ['ma'],
}
