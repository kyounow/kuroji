import type { BalanceSheet, IncomeStatement, Ratios } from '@core/types'
import { totalAssets, totalEquity } from '@core/statements/identity'

/**
 * 0 除算を安全に扱う。分母が 0 のとき、分子も 0 なら 0、それ以外は +∞ を返す。
 * （例: 流動負債 0 の会社の流動比率は「無限に潤沢」と解釈できる）
 */
function safeDiv(numerator: number, denominator: number): number {
  if (denominator === 0) return numerator === 0 ? 0 : Number.POSITIVE_INFINITY
  return numerator / denominator
}

/**
 * 期末の貸借対照表と当期の損益計算書から主要な経営指標を計算する。
 * ROE / ROA は期末の純資産・総資産を分母にする簡易版。
 */
export function computeRatios(bs: BalanceSheet, pl: IncomeStatement): Ratios {
  const currentAssets =
    bs.currentAssets.cash + bs.currentAssets.accountsReceivable + bs.currentAssets.inventory
  const currentLiabilities =
    bs.currentLiabilities.accountsPayable + bs.currentLiabilities.shortTermDebt

  const assets = totalAssets(bs)
  const equity = totalEquity(bs)

  return {
    currentRatio: safeDiv(currentAssets, currentLiabilities),
    equityRatio: safeDiv(equity, assets),
    roe: safeDiv(pl.netIncome, equity),
    roa: safeDiv(pl.netIncome, assets),
    grossMargin: safeDiv(pl.grossProfit, pl.revenue),
    operatingMargin: safeDiv(pl.operatingIncome, pl.revenue),
  }
}
