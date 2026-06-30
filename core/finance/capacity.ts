import type { SimParams } from '@core/types'

/**
 * 当期の生産能力（数量上限）。設備の簿価に比例する。
 *   年間能力 = equipment × capacityPerEquipment、当期能力 = floor(年間能力 × periodFactor)
 * `capacityPerEquipment` が未設定/0 のときは能力無制限（＝旧挙動・テスト保持）。
 * 設備投資で能力が増え、減価償却で能力が減るため、維持・拡張には継続投資が要る。
 */
export function productionCapacity(
  equipment: number,
  params: SimParams,
  periodFactor: number,
): number {
  const per = params.capacityPerEquipment
  if (!per || per <= 0) return Number.POSITIVE_INFINITY
  return Math.floor(Math.max(0, equipment) * per * periodFactor)
}

/**
 * 設備の規模による製造コストの低減率（規模の経済）。1.0 = 低減なし。
 *   1 − scaleEconomyMax × equipment/(equipment + scaleEconomyHalf)
 * `scaleEconomyMax` が未設定/0 なら 1.0（効果なし）。設備が大きいほど少しずつ原価が下がる。
 */
export function costEfficiency(equipment: number, params: SimParams): number {
  const max = params.scaleEconomyMax
  const half = params.scaleEconomyHalf
  if (!max || max <= 0 || !half || half <= 0) return 1
  const e = Math.max(0, equipment)
  return 1 - max * (e / (e + half))
}
