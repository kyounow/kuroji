import type { EventTable } from './types'

/**
 * 標準の市況イベントテーブル。need 需要に乗数で作用する。
 * weight は相対的な出やすさ（合計で割って確率になる）。数値は学習用のサンプル。
 */
export const defaultEvents: EventTable = [
  {
    weight: 5,
    event: { id: 'normal', label: '平常運転', description: '特段の変化なし。', demandMultiplier: 1.0 },
  },
  {
    weight: 2,
    event: { id: 'boom', label: '好景気', description: '市場が活気づき需要が増加。', demandMultiplier: 1.25 },
  },
  {
    weight: 2,
    event: { id: 'recession', label: '不況', description: '景気後退で需要が減少。', demandMultiplier: 0.8 },
  },
  {
    weight: 1,
    event: {
      id: 'competitor',
      label: '競合参入',
      description: 'ライバルが参入し需要を奪われた。',
      demandMultiplier: 0.7,
    },
  },
  {
    weight: 1,
    event: { id: 'viral', label: '話題沸騰', description: 'SNSで話題になり需要が急増。', demandMultiplier: 1.5 },
  },
  // --- 突発ショック（保険でヘッジ可能。損失は会社規模に連動。数値は学習用サンプル・出典なし） ---
  // weight は控えめ（各月 約3%）。月次プレイで頻発しすぎないよう市況イベントより低く設定。
  {
    weight: 0.4,
    event: {
      id: 'breakdown',
      label: '設備故障',
      description: '設備が故障し、簿価の一部が毀損した。',
      demandMultiplier: 1.0,
      // 設備規模に連動: 期首設備簿価の13%が毀損（創業300k→約39k≒下限40k、設備4,000k→約520k）。
      equipmentLoss: 40_000, // floor（極小創業期の最低毀損額）
      equipmentLossRatio: 0.13,
      lossSeverityRange: [0.6, 1.8], // 軽微〜大破
    },
  },
  {
    weight: 0.4,
    event: {
      id: 'lawsuit',
      label: '訴訟・賠償',
      description: '思わぬ訴訟で賠償金が発生した。',
      demandMultiplier: 1.0,
      // 賠償は支払能力（売上・利益）に概ね比例する想定（学習用・実務とは異なる）。
      oneOffLoss: 50_000, // floor
      oneOffLossRevenueRatio: 0.09, // 年商の9%（創業 年商≈564k→約51k≒下限50k）
      oneOffLossProfitRatio: 0.2, // 年間営業利益の20%（黒字時のみ上乗せ）
      oneOffLossCapRatio: 0.6, // 年商60%上限（現金即死ガード）
      lossSeverityRange: [0.7, 1.6],
    },
  },
  {
    weight: 0.2,
    event: {
      id: 'recall',
      label: 'リコール',
      description: '不具合でリコール。費用がかかり評判も落ちた。',
      demandMultiplier: 0.85, // 評判低下（需要減）は据置
      // 回収費用は出荷規模（売上）に比例。利益には連動させない。
      oneOffLoss: 25_000, // floor
      oneOffLossRevenueRatio: 0.045, // 年商の4.5%（創業 年商≈564k→約25k）
      lossSeverityRange: [0.8, 1.4],
    },
  },
]
