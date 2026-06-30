/**
 * 株式（発行済株数・希薄化・1株あたり指標）の純関数。
 * 増資は「簿価発行」（発行価格＝1株あたり純資産 BVPS）で簡略化する。学習用。
 */

/** 1株あたり純資産（簿価, BVPS）。発行価格の基準に使う。株数0なら0。 */
export function bookValuePerShare(equity: number, shares: number): number {
  return shares > 0 ? equity / shares : 0
}

/**
 * 増資額と期首の純資産・発行済株数から、簿価発行で発行される新株数。
 * 発行価格＝BVPS(期首)。BVPS が0以下（株数0・純資産0以下）なら発行不能で0。
 */
export function sharesIssued(equityRaised: number, equityBegin: number, sharesBegin: number): number {
  const price = bookValuePerShare(equityBegin, sharesBegin)
  return price > 0 ? Math.round(Math.max(0, equityRaised) / price) : 0
}

/** 1株あたり当期純利益（EPS）。株数0なら0。 */
export function earningsPerShare(netIncome: number, shares: number): number {
  return shares > 0 ? netIncome / shares : 0
}
