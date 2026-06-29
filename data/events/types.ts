import type { MarketEvent } from '@core/types'

export type { MarketEvent } from '@core/types'

/** 抽選用に重み付けした市況イベント。 */
export interface WeightedEvent {
  event: MarketEvent
  /** 相対的な出やすさ（大きいほど出やすい） */
  weight: number
}

/** イベントテーブル（シナリオごとに差し替え可能）。 */
export type EventTable = readonly WeightedEvent[]
