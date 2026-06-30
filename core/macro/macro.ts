import type { SimParams } from '@core/types'
import { hashUnit } from '@core/util/rng'

export type MacroPhase = 'expansion' | 'normal' | 'recession'

/** マクロ経済の状態（ターン間で持ち越す）。 */
export interface MacroState {
  /** 景気局面 */
  phase: MacroPhase
  /** 現局面の残り月数 */
  phaseMonthsLeft: number
  /** 物価指数（1.0 = 基準。インフレで上昇、デフレで下落） */
  inflationIndex: number
  /** 現在の年率インフレ（負ならデフレ） */
  annualInflation: number
  /** 政策金利（年率、下限0） */
  policyRate: number
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** 景気局面ごとの需要倍率。 */
export function cycleDemandMultiplier(macro: MacroState): number {
  return macro.phase === 'expansion' ? 1.15 : macro.phase === 'recession' ? 0.85 : 1.0
}

/** ゲーム開始時のマクロ状態。 */
export function initialMacro(params: SimParams): MacroState {
  return {
    phase: 'normal',
    phaseMonthsLeft: 24,
    inflationIndex: 1,
    annualInflation: params.inflationTarget ?? 0.02,
    policyRate: params.policyNeutralRate ?? 0.01,
  }
}

/**
 * マクロ状態を1ヶ月進める純関数（決定論）。
 * - 景気局面は数年単位で持続し、尽きると次局面を重み付き抽選（拡大/普通/後退）。
 * - インフレは局面別の目標へ持続的にドリフト（後退局面は負＝デフレにもなる）。物価指数は月次複利。
 * - 政策金利はテイラー則的にインフレ・景気に反応して緩やかに動く（下限0）。
 * macroVolatility=0 のときは局面=普通で固定し、インフレは目標一定（物価が安定）。
 */
export function advanceMacro(
  prev: MacroState,
  params: SimParams,
  seed: number,
  turn: number,
): MacroState {
  const vol = params.macroVolatility ?? 0
  const baseTarget = params.inflationTarget ?? 0.02
  const neutral = params.policyNeutralRate ?? 0.01

  // --- 景気局面 ---
  let phase = prev.phase
  let phaseMonthsLeft = prev.phaseMonthsLeft - 1
  if (vol <= 0) {
    phase = 'normal'
    phaseMonthsLeft = 9999
  } else if (phaseMonthsLeft <= 0) {
    const r = hashUnit(seed ^ 0x9e37, turn)
    phase = r < 0.4 ? 'expansion' : r < 0.75 ? 'normal' : 'recession'
    const dr = hashUnit(seed ^ 0x85eb, turn)
    const [min, max] =
      phase === 'expansion' ? [24, 72] : phase === 'recession' ? [12, 36] : [24, 60]
    phaseMonthsLeft = Math.round(min + dr * (max - min))
  }

  // --- インフレ／デフレ ---
  const phaseTarget =
    phase === 'expansion' ? baseTarget + 0.02 : phase === 'recession' ? baseTarget - 0.04 : baseTarget
  const noise = vol > 0 ? (hashUnit(seed ^ 0xc2b2, turn) * 2 - 1) * vol * 0.02 : 0
  const annualInflation = clamp(
    prev.annualInflation + 0.2 * (phaseTarget - prev.annualInflation) + noise,
    -0.05,
    0.1,
  )
  const inflationIndex = Math.max(0.3, prev.inflationIndex * (1 + annualInflation / 12))

  // --- 政策金利（テイラー則的） ---
  const outputGap = phase === 'expansion' ? 0.01 : phase === 'recession' ? -0.01 : 0
  const policyTarget = Math.max(0, neutral + 1.5 * (annualInflation - baseTarget) + outputGap)
  const policyRate = Math.max(0, prev.policyRate + 0.25 * (policyTarget - prev.policyRate))

  return { phase, phaseMonthsLeft, inflationIndex, annualInflation, policyRate }
}
