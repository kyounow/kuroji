import { defaultEvents } from './default'
import type { EventTable } from './types'

export type { WeightedEvent, EventTable, MarketEvent } from './types'
export { defaultEvents } from './default'

/** 利用可能なイベントテーブルのレジストリ。 */
const EVENT_TABLES: Record<string, EventTable> = {
  default: defaultEvents,
}

/** ID からイベントテーブルを取得する（未知の ID は default にフォールバック）。 */
export function getEventTable(id = 'default'): EventTable {
  return EVENT_TABLES[id] ?? defaultEvents
}
