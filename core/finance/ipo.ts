import type { CompanyState, SimParams } from '@core/types'
import { totalEquity } from '@core/statements/identity'

/**
 * IPO（新規上場）の純関数群。
 * バリュエーションは「年間純利益 × PER（earningsMultiple）」の簡易モデル＝利益が時価総額を生む、を学ぶ。
 */

/** 時価総額（バリュエーション）。赤字なら 0（上場できない）。 */
export function ipoValuation(annualNetIncome: number, earningsMultiple: number): number {
  return Math.round(Math.max(0, annualNetIncome) * Math.max(0, earningsMultiple))
}

/** 公募価格＝時価総額 ÷ 発行済株数。株式基盤がなければ 0。 */
export function ipoOfferPrice(valuation: number, sharesOutstanding: number): number {
  return sharesOutstanding > 0 ? valuation / sharesOutstanding : 0
}

export interface IpoGate {
  ok: boolean
  /** 未達の理由（日本語・UI にそのまま出せる） */
  reasons: string[]
}

/**
 * 上場基準を満たすか。
 * `recentNetIncomes` は古→新の順の直近純利益（呼び出し側が history から渡す）。
 */
export function canIPO(
  state: CompanyState,
  recentNetIncomes: readonly number[],
  params: SimParams,
): IpoGate {
  const reasons: string[] = []
  if (params.earningsMultiple == null) reasons.push('このシナリオでは上場できません')
  if (state.listed) reasons.push('すでに上場しています')
  if (!state.sharesOutstanding || state.sharesOutstanding <= 0) {
    reasons.push('株式（発行済株数）の基盤がありません')
  }
  const threshold = params.ipoEquityThreshold ?? 0
  const equity = totalEquity(state.balanceSheet)
  if (equity < threshold) {
    reasons.push(`純資産が上場基準 ¥${threshold.toLocaleString('ja-JP')} に達していません（現在 ¥${Math.round(equity).toLocaleString('ja-JP')}）`)
  }
  const need = params.ipoProfitablePeriods ?? 6
  const recent = recentNetIncomes.slice(-need)
  if (recent.length < need || recent.some((n) => n <= 0)) {
    reasons.push(`直近${need}ヶ月の連続黒字が必要です`)
  }
  return { ok: reasons.length === 0, reasons }
}
