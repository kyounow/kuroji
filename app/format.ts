/** 金額を「¥1,234,567」形式に（負のゼロは 0 に正規化）。 */
export const yen = (n: number): string => {
  const v = Math.round(n)
  return `¥${(v === 0 ? 0 : v).toLocaleString('ja-JP')}`
}

/** 符号付き金額（増減表示用）。 */
export const yenSigned = (n: number): string => `${n >= 0 ? '+' : '−'}${yen(Math.abs(n))}`

/** 割合を「12.3%」形式に（非有限は「—」）。 */
export const pct = (n: number): string => (Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—')

/** 倍率を「2.00」形式に（無限は「∞」）。 */
export const ratio = (n: number): string => (Number.isFinite(n) ? n.toFixed(2) : '∞')

/** 整数（個数など）。 */
export const num = (n: number): string => Math.round(n).toLocaleString('ja-JP')

/** ターン番号(1始まり)を期間表記に。月次=「N年目M月」、四半期=「N年目QM」、年次=「第N期」。 */
export const periodLabel = (turn: number, ppy: number): string => {
  if (!ppy || ppy <= 1) return `第${turn}期`
  const year = Math.floor((turn - 1) / ppy) + 1
  const sub = ((turn - 1) % ppy) + 1
  return ppy === 12 ? `${year}年目${sub}月` : ppy === 4 ? `${year}年目Q${sub}` : `${year}年目#${sub}`
}
