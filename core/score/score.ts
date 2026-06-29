import type { Ratios } from '@core/types'

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))
const fin = (x: number): number => (Number.isFinite(x) ? x : 0)

/** スコアの内訳（各項 0..25、合計 0..100）と星（1〜3）。 */
export interface ScoreBreakdown {
  /** 純資産の成長 */
  growth: number
  /** 安全性（自己資本比率・流動比率） */
  safety: number
  /** 資本効率（ROE の平均） */
  efficiency: number
  /** 達成速度（早くゴールするほど高い。未達成は0） */
  speed: number
  /** 合計 0..100 */
  total: number
  /** 星 1〜3 */
  stars: number
}

export interface ScoreInput {
  startEquity: number
  endEquity: number
  finalRatios: Ratios
  /** 各期の ROE 列（履歴） */
  roeHistory: number[]
  won: boolean
  turnsUsed: number
  turnLimit: number
}

/**
 * 期末スコアを計算する純関数（決定論）。
 * 純資産成長・安全性・資本効率・達成速度の4軸（各25点）を合算し星に変換する。
 */
export function scoreGame(input: ScoreInput): ScoreBreakdown {
  const { startEquity, endEquity, finalRatios, roeHistory, won, turnsUsed, turnLimit } = input

  // 成長: 純資産が2倍で満点（+100%成長）。
  const growthRatio = startEquity > 0 ? endEquity / startEquity - 1 : 0
  const growth = clamp01(growthRatio / 1) * 25

  // 安全性: 自己資本比率(目標0.6)と流動比率(目標2.0)の平均。
  const safety =
    ((clamp01(fin(finalRatios.equityRatio) / 0.6) + clamp01(fin(finalRatios.currentRatio) / 2)) / 2) * 25

  // 資本効率: ROE 平均（目標0.3で満点）。
  const finiteRoe = roeHistory.filter((r) => Number.isFinite(r))
  const avgRoe = finiteRoe.length ? finiteRoe.reduce((a, b) => a + b, 0) / finiteRoe.length : 0
  const efficiency = clamp01(avgRoe / 0.3) * 25

  // 達成速度: 勝利時のみ。早くゴールするほど高い。
  const speed = won && turnLimit > 0 ? clamp01((turnLimit - turnsUsed + 1) / turnLimit) * 25 : 0

  // 各項を丸めてから合算（表示の内訳と合計が必ず一致する）。
  const growthR = Math.round(growth)
  const safetyR = Math.round(safety)
  const efficiencyR = Math.round(efficiency)
  const speedR = Math.round(speed)
  const total = growthR + safetyR + efficiencyR + speedR
  const stars = total >= 75 ? 3 : total >= 45 ? 2 : 1

  return {
    growth: growthR,
    safety: safetyR,
    efficiency: efficiencyR,
    speed: speedR,
    total,
    stars,
  }
}
