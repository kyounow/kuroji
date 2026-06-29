import type { SimParams } from '@core/types'
import { hashUnit } from '@core/util/rng'

/**
 * 原材料スポット価格指数（1.0 = 基準）を1期進める。決定論的な AR(1) 的モデル:
 *
 *   next = 1 + (1 − meanReversion) × (prev − 1) + volatility × shock
 *
 * - meanReversion: 大きいほど 1.0 に戻りやすい（0..1）。
 * - volatility: 変動の大きさ。shock は hashUnit から作る [-1,1) のノイズ。
 * 指数は下限 0.2 でクリップ（負値・極端な暴落を防ぐ）。同じ (seed, turn) なら同じ結果。
 */
export function materialIndexNext(
  prevIndex: number,
  params: SimParams,
  seed: number,
  turn: number,
): number {
  const shock = hashUnit(seed ^ 0x9e3779b9, turn) * 2 - 1 // [-1, 1)
  const persistence = 1 - clamp01(params.materialMeanReversion)
  const next = 1 + persistence * (prevIndex - 1) + params.materialVolatility * shock
  return Math.max(0.2, next)
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}
