// ローカル保存（ベストスコア）。完全クライアントサイド・localStorage のみ。
const KEY = (scenarioId: string) => `kuroji.best.${scenarioId}`

/** シナリオのベストスコアを読む（無ければ null）。 */
export function loadBest(scenarioId: string): number | null {
  try {
    const v = localStorage.getItem(KEY(scenarioId))
    return v === null ? null : Number(v)
  } catch {
    return null
  }
}

/** 今回のスコアでベストを更新し、更新後のベストを返す。 */
export function saveBest(scenarioId: string, total: number): number {
  const prev = loadBest(scenarioId)
  const best = prev === null ? total : Math.max(prev, total)
  try {
    localStorage.setItem(KEY(scenarioId), String(best))
  } catch {
    /* localStorage 不可でも無視 */
  }
  return best
}
