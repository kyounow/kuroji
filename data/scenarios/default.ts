import type { Scenario } from './types'

/**
 * 標準シナリオ: 小さな製造小売の会社を引き継ぐ。
 * 初期の貸借対照表は会計恒等式（資産 10,000,000 = 負債 3,000,000 + 純資産 7,000,000）を満たす。
 * 数値は学習用のサンプル（出典なし）。実データを入れる場合は出典コメントを付ける。
 */
export const defaultScenario: Scenario = {
  id: 'default',
  name: '標準シナリオ — 小さな会社',
  description:
    '現金と最低限の設備を持つ小さな会社を経営する。価格と投資、資金繰りを判断しながら黒字経営を目指す。',
  initialState: {
    turn: 0,
    // 棚卸資産は基準単価 1,000 円で評価: 原材料 500個=500,000 円 / 製品 500個=500,000 円
    materialUnits: 500,
    finishedUnits: 500,
    materialIndex: 1.0,
    rdStock: 0,
    balanceSheet: {
      currentAssets: {
        cash: 5_000_000,
        accountsReceivable: 0,
        rawMaterials: 500_000,
        finishedGoods: 500_000,
      },
      fixedAssets: {
        equipment: 4_000_000,
      },
      currentLiabilities: {
        accountsPayable: 0,
        shortTermDebt: 0,
      },
      nonCurrentLiabilities: {
        longTermDebt: 3_000_000,
      },
      equity: {
        capitalStock: 5_000_000,
        retainedEarnings: 2_000_000,
      },
    },
  },
  params: {
    // 需要
    baseDemand: 1_000,
    basePrice: 2_000,
    priceElasticity: 1.2,
    // コスト・原材料
    unitVariableCost: 1_000,
    materialVolatility: 0.15,
    materialMeanReversion: 0.3,
    fixedCosts: 500_000,
    depreciationRate: 0.1,
    // 発生主義（売掛・買掛）
    salesOnCreditRatio: 0.4,
    payableRatio: 0.3,
    // 販促
    marketingEffect: 0.5,
    marketingHalf: 200_000,
    // 研究開発（製品パラメータ）
    rdCostReductionMax: 0.4,
    rdDemandBoostMax: 0.5,
    rdHalf: 1_000_000,
    // 財務・税
    interestRate: 0.03,
    effectiveTaxRate: 0.3,
  },
}
