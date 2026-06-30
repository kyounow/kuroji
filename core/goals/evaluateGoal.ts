import type { CompanyState, Goal, GoalStatus } from '@core/types'
import { totalEquity } from '@core/statements/identity'

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))
const yen = (n: number): string => `¥${Math.round(n).toLocaleString('ja-JP')}`

/** 有利子負債（短期＋長期借入）。 */
function interestBearingDebt(state: CompanyState): number {
  return (
    state.balanceSheet.currentLiabilities.shortTermDebt +
    state.balanceSheet.nonCurrentLiabilities.longTermDebt
  )
}

/**
 * ゴールの達成状況を評価する純関数（決定論）。
 * `current` は現在（期末）の状態、`initial` は開始時の状態（進捗の基準に使う）。
 * 倒産は呼び出し側で別途 'lost' に上書きする（ここでは倒産を知らない）。
 */
export function evaluateGoal(goal: Goal, current: CompanyState, initial: CompanyState): GoalStatus {
  const turn = current.turn

  switch (goal.kind) {
    case 'equityTarget': {
      const equity = totalEquity(current.balanceSheet)
      const start = totalEquity(initial.balanceSheet)
      const denom = goal.target - start
      const progress = denom > 0 ? clamp01((equity - start) / denom) : equity >= goal.target ? 1 : 0
      const within = goal.withinTurns
      if (equity >= goal.target) {
        return { status: 'won', progress: 1, label: goal.label, detail: `純資産 ${yen(equity)} 到達` }
      }
      if (within !== undefined && turn >= within) {
        return { status: 'lost', progress, label: goal.label, detail: `期限切れ（純資産 ${yen(equity)}）` }
      }
      const tail = within !== undefined ? `・残り${within - turn}ヶ月` : ''
      return {
        status: 'progress',
        progress,
        label: goal.label,
        detail: `純資産 ${yen(equity)} / 目標 ${yen(goal.target)}${tail}`,
      }
    }
    case 'repayAll': {
      const debt = interestBearingDebt(current)
      const startDebt = interestBearingDebt(initial)
      const progress = startDebt > 0 ? clamp01(1 - debt / startDebt) : 1
      const within = goal.withinTurns
      if (debt <= 0) {
        return { status: 'won', progress: 1, label: goal.label, detail: '有利子負債を完済' }
      }
      if (within !== undefined && turn >= within) {
        return { status: 'lost', progress, label: goal.label, detail: `期限切れ（残債 ${yen(debt)}）` }
      }
      const tail = within !== undefined ? `・残り${within - turn}ヶ月` : ''
      return {
        status: 'progress',
        progress,
        label: goal.label,
        detail: `残債 ${yen(debt)}${tail}`,
      }
    }
    case 'survive': {
      const progress = clamp01(turn / goal.turns)
      if (turn >= goal.turns) {
        return { status: 'won', progress: 1, label: goal.label, detail: `${goal.turns}期を生き延びた` }
      }
      return {
        status: 'progress',
        progress,
        label: goal.label,
        detail: `${turn} / ${goal.turns}期`,
      }
    }
  }
}
