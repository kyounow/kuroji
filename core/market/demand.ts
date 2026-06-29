import type { SimParams } from '@core/types'

/**
 * 価格から販売数量を求める（定価弾力性モデル）。
 *
 *   数量 = baseDemand × (価格 / basePrice)^(−priceElasticity)
 *
 * 価格を上げると数量が減り、弾力性が大きいほど減り方が急になる。
 * 数量は 0 以上の整数に丸める。価格が 0 以下なら数量は 0 とする。
 */
export function demandAt(unitPrice: number, params: SimParams): number {
  if (unitPrice <= 0) return 0
  const ratio = unitPrice / params.basePrice
  const qty = params.baseDemand * Math.pow(ratio, -params.priceElasticity)
  return Math.max(0, Math.round(qty))
}
