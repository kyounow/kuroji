import type { BalanceSheet } from '@core/types'

/** 資産合計（流動資産＋固定資産。のれん・開発資産を含む）。 */
export function totalAssets(bs: BalanceSheet): number {
  const { cash, accountsReceivable, rawMaterials, finishedGoods } = bs.currentAssets
  return (
    cash +
    accountsReceivable +
    rawMaterials +
    finishedGoods +
    bs.fixedAssets.equipment +
    (bs.fixedAssets.goodwill ?? 0) +
    (bs.fixedAssets.developmentAsset ?? 0)
  )
}

/** 負債合計（流動負債＋固定負債）。 */
export function totalLiabilities(bs: BalanceSheet): number {
  return (
    bs.currentLiabilities.accountsPayable +
    bs.currentLiabilities.shortTermDebt +
    bs.nonCurrentLiabilities.longTermDebt
  )
}

/** 純資産合計（資本金＋利益剰余金）。 */
export function totalEquity(bs: BalanceSheet): number {
  return bs.equity.capitalStock + bs.equity.retainedEarnings
}

/**
 * 会計恒等式（資産 = 負債 + 純資産）が成立するか検証する。
 * 整数円の丸め誤差を許容するため tolerance を持つ。
 * これがゲーム全体で守られるべき最重要の不変条件。
 */
export function balances(bs: BalanceSheet, tolerance = 0): boolean {
  return Math.abs(totalAssets(bs) - (totalLiabilities(bs) + totalEquity(bs))) <= tolerance
}
