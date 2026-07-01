import { totalEquity } from '@core/index'
import type { BalanceSheet } from '@core/index'
import type { GameState } from './state'

/** 達成バッジ（実績）。プレイヤーの目標づくりと再訪の動機に。 */
export interface Badge {
  id: string
  emoji: string
  label: string
  desc: string
}

export const BADGES: Badge[] = [
  { id: 'first-profit', emoji: '🌱', label: '初めての黒字', desc: '1ヶ月でも当期純利益をプラスにした' },
  { id: 'debt-free', emoji: '🕊️', label: '無借金経営', desc: '借入をすべて返済し、有利子負債を0にした' },
  { id: 'shock-survivor', emoji: '🛡️', label: 'ショック生還', desc: '突発損失（訴訟・故障・リコール）を受けても倒産しなかった' },
  { id: 'millionaire', emoji: '💰', label: '純資産ミリオン', desc: '純資産が150万円を超えた' },
  { id: 'three-star', emoji: '⭐', label: '3つ星クリア', desc: '3つ星でクリアした' },
  { id: 'decade', emoji: '📅', label: '10年経営', desc: '120ヶ月（10年）以上、倒産せず経営を続けた' },
]

const debtOf = (bs: BalanceSheet): number =>
  bs.currentLiabilities.shortTermDebt + bs.nonCurrentLiabilities.longTermDebt

/** 現在のゲーム状態で満たしている実績ID（状態ベース）。three-star はスコア依存のため App 側で追加。 */
export function earnedNow(game: GameState): string[] {
  const hist = game.history
  const out: string[] = []
  if (hist.some((h) => h.incomeStatement.netIncome > 0)) out.push('first-profit')
  const nowDebt = debtOf(game.current.balanceSheet)
  const everHadDebt = hist.some((h) => debtOf(h.stateAfter.balanceSheet) > 0)
  if (nowDebt === 0 && everHadDebt) out.push('debt-free')
  if (hist.some((h) => h.incomeStatement.extraordinaryLoss > 0) && game.outcome !== 'lost') {
    out.push('shock-survivor')
  }
  if (totalEquity(game.current.balanceSheet) >= 1_500_000) out.push('millionaire')
  if (game.current.turn >= 120) out.push('decade')
  return out
}
