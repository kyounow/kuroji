import type { SimParams, ProductState } from '@core/types'

/**
 * 累積の研究開発投資（rdStock）から、製品パラメータを求める。
 * 投資を続けるほど製造原価が下がり需要が上がるが、逓減する（青天井ではない）。
 *
 *   進捗 s = rdStock / (rdStock + rdHalf)   （0〜1、rdHalf で半分）
 *   原価倍率 = 1 − rdCostReductionMax × s   （下がる）
 *   需要倍率 = 1 + rdDemandBoostMax × s      （上がる）
 */
export function productFromRd(rdStock: number, params: SimParams): ProductState {
  const stock = Math.max(0, rdStock)
  const s = stock > 0 ? stock / (stock + params.rdHalf) : 0
  return {
    unitCostModifier: 1 - params.rdCostReductionMax * s,
    demandModifier: 1 + params.rdDemandBoostMax * s,
  }
}
