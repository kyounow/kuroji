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
]
