import type { MarketEvent } from '@core/types'
import type { EventTable } from '@data/events'
import { hashUnit } from '@core/util/rng'

/**
 * シードとターン番号から、その期に発生する市況イベントを決定論的に1つ引く。
 * 重み付き抽選。同じ (table, seed, turn) なら必ず同じイベントになる。
 * テーブルが空、または重みが正でない場合は平常イベントにフォールバックする。
 */
export function drawEvent(table: EventTable, seed: number, turn: number): MarketEvent {
  const NEUTRAL: MarketEvent = {
    id: 'normal',
    label: '平常運転',
    description: '特段の変化なし。',
    demandMultiplier: 1.0,
  }
  if (table.length === 0) return NEUTRAL

  const totalWeight = table.reduce((sum, w) => sum + Math.max(0, w.weight), 0)
  if (totalWeight <= 0) return NEUTRAL

  let r = hashUnit(seed, turn) * totalWeight
  for (const w of table) {
    r -= Math.max(0, w.weight)
    if (r < 0) return w.event
  }
  // 丸め誤差対策で最後の要素を返す。
  return table[table.length - 1].event
}
