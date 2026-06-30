import type { IncomeStatement } from '@core/types'

/** 損益分岐・原価率の分析結果（利益維持ラインの把握に使う）。 */
export interface BreakEven {
  /** 売上原価率（売上原価 ÷ 売上高、0..） */
  costRatio: number
  /** 売上総利益率（1 − 原価率） */
  grossMarginRatio: number
  /** 1個あたり売上原価（売上原価 ÷ 販売数量） */
  unitCost: number
  /** 1個あたり粗利（限界利益）＝ 売価 − 1個あたり原価 */
  contributionPerUnit: number
  /** 数量に依らない当期費用（販管費＋支払利息＋特別損失） */
  fixedLike: number
  /** 損益分岐の販売数量（fixedLike を粗利で賄う点）。粗利<=0 なら Infinity */
  breakEvenUnits: number
  /** 見込み数量での損益分岐売価（この数量で赤字を避ける最低単価） */
  breakEvenPrice: number
}

export interface BreakEvenInput {
  unitPrice: number
  unitsSold: number
  income: IncomeStatement
}

/**
 * 見込みの損益から、原価率・限界利益・損益分岐点を求める純関数。
 * 販売数量が 0 のときは単価ベースの分析ができないため、原価率0・分岐点 Infinity を返す。
 */
export function breakEven({ unitPrice, unitsSold, income }: BreakEvenInput): BreakEven {
  const fixedLike = income.operatingExpenses + income.interestExpense + income.extraordinaryLoss
  if (unitsSold <= 0 || income.revenue <= 0) {
    return {
      costRatio: 0,
      grossMarginRatio: 0,
      unitCost: 0,
      contributionPerUnit: 0,
      fixedLike,
      breakEvenUnits: Number.POSITIVE_INFINITY,
      breakEvenPrice: Number.POSITIVE_INFINITY,
    }
  }
  const costRatio = income.costOfGoodsSold / income.revenue
  const unitCost = income.costOfGoodsSold / unitsSold
  const contributionPerUnit = unitPrice - unitCost
  const breakEvenUnits =
    contributionPerUnit > 0 ? Math.ceil(fixedLike / contributionPerUnit) : Number.POSITIVE_INFINITY
  // この数量で利益0にする単価 = 1個あたり原価 + 固定費等/数量
  const breakEvenPrice = unitCost + fixedLike / unitsSold
  return {
    costRatio,
    grossMarginRatio: 1 - costRatio,
    unitCost,
    contributionPerUnit,
    fixedLike,
    breakEvenUnits,
    breakEvenPrice,
  }
}
