import type { CompanyState } from '@core/types'
import { totalEquity, totalAssets } from '@core/statements/identity'

export type CreditGrade = 'AAA' | 'A' | 'B' | 'C' | 'D'

export interface CreditInfo {
  grade: CreditGrade
  /** 基準金利への上乗せスプレッド */
  spread: number
  /** 当期に新規借入できる上限（>=0） */
  borrowLimit: number
  /** コベナンツ違反（財務悪化で借入凍結） */
  covenantBreach: boolean
  /** 評価に使った自己資本比率 */
  equityRatio: number
}

/** 信用格付けの区分（自己資本比率の閾値・スプレッド・許容レバレッジ）。 */
const TIERS: { min: number; grade: CreditGrade; spread: number; leverage: number }[] = [
  { min: 0.6, grade: 'AAA', spread: 0, leverage: 3 },
  { min: 0.45, grade: 'A', spread: 0.01, leverage: 2.5 },
  { min: 0.3, grade: 'B', spread: 0.025, leverage: 2 },
  { min: 0.15, grade: 'C', spread: 0.05, leverage: 1.2 },
  { min: -Infinity, grade: 'D', spread: 0.1, leverage: 0 },
]

/** 有利子負債（短期＋長期借入）。 */
export function interestBearingDebt(state: CompanyState): number {
  return (
    state.balanceSheet.currentLiabilities.shortTermDebt +
    state.balanceSheet.nonCurrentLiabilities.longTermDebt
  )
}

/**
 * 信用力を評価する純関数。自己資本比率（純資産/総資産）が高いほど好条件:
 * 金利スプレッドが下がり、借入枠（純資産×許容レバレッジ−既存債務）が広がる。
 * 最低格付け D はコベナンツ違反として借入を凍結する。
 */
export function assessCredit(state: CompanyState): CreditInfo {
  const equity = totalEquity(state.balanceSheet)
  const assets = totalAssets(state.balanceSheet)
  const equityRatio = assets > 0 ? equity / assets : 0
  const debt = interestBearingDebt(state)

  const tier = TIERS.find((t) => equityRatio >= t.min) ?? TIERS[TIERS.length - 1]
  const maxDebt = Math.max(0, Math.round(Math.max(0, equity) * tier.leverage))
  const borrowLimit = Math.max(0, maxDebt - debt)

  return {
    grade: tier.grade,
    spread: tier.spread,
    borrowLimit,
    covenantBreach: tier.grade === 'D',
    equityRatio,
  }
}
