import type { SimParams } from '@core/types'
import { hashUnit } from '@core/util/rng'

export interface Competitor {
  /** 競合の販売価格 */
  price: number
  /** 競合の品質（1.0 = 基準） */
  quality: number
}

/**
 * 当期の競合の価格・品質を決定論的に生成する（seed と turn から）。
 * competitorStrength が大きいほど競合は高品質で手強い。同じ (seed, turn) なら同じ。
 */
export function competitorAt(params: SimParams, seed: number, turn: number): Competitor {
  const r1 = hashUnit(seed ^ 0x1234abcd, turn)
  const r2 = hashUnit(seed ^ 0x5678ef01, turn)
  const price = Math.round(params.basePrice * (0.85 + 0.3 * r1)) // 0.85〜1.15×
  const quality = 1 + params.competitorStrength * (0.5 + 0.5 * r2)
  return { price, quality }
}

/**
 * 自社と競合の「価格あたり品質（バリュー）」から市場シェアを求め、需要倍率に変換する。
 * シェア 0.5（互角）で倍率 1.0。competitorStrength<=0 なら競合なし（倍率 1.0）。
 * 倍率は [0.4, 1.6] にクリップして極端化を防ぐ。
 */
export function shareMultiplier(
  ourPrice: number,
  ourQuality: number,
  comp: Competitor,
  params: SimParams,
): number {
  if (params.competitorStrength <= 0) return 1
  const ourAttr = ourQuality / Math.max(1, ourPrice)
  const compAttr = comp.quality / Math.max(1, comp.price)
  const denom = ourAttr + compAttr
  const share = denom > 0 ? ourAttr / denom : 0.5
  return Math.min(1.6, Math.max(0.4, 2 * share))
}

/** 自社シェア（0..1）。表示用。 */
export function marketShare(
  ourPrice: number,
  ourQuality: number,
  comp: Competitor,
  params: SimParams,
): number {
  if (params.competitorStrength <= 0) return 0.5
  const ourAttr = ourQuality / Math.max(1, ourPrice)
  const compAttr = comp.quality / Math.max(1, comp.price)
  const denom = ourAttr + compAttr
  return denom > 0 ? ourAttr / denom : 0.5
}
