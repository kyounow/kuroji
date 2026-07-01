// ローカル保存（ベストスコア＋ゲームの続き）。完全クライアントサイド・localStorage のみ。

// ---- ベストスコア ----
const BEST_KEY = (scenarioId: string) => `kuroji.best.${scenarioId}`

/** シナリオのベストスコアを読む（無ければ null）。 */
export function loadBest(scenarioId: string): number | null {
  try {
    const v = localStorage.getItem(BEST_KEY(scenarioId))
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
    localStorage.setItem(BEST_KEY(scenarioId), String(best))
  } catch {
    /* localStorage 不可でも無視 */
  }
  return best
}

// ---- ゲームの続き（全状態セーブ） ----
// version はゲーム状態のスキーマ版。破壊的変更時に上げると古いセーブは無効化される。
const SAVE_KEY = 'kuroji.save'
const SAVE_VERSION = 5 // Phase2（発行済株数 sharesOutstanding を CompanyState に追加）

/** 現在のゲーム状態を保存する（自動保存）。型は呼び出し側が保証する。 */
export function saveGame(state: unknown): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, data: state }))
  } catch {
    /* 容量超過などは無視 */
  }
}

/** 保存済みゲーム状態を読む（無効/バージョン不一致は null）。 */
export function loadGame(): unknown | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { version?: number; data?: unknown }
    if (parsed.version !== SAVE_VERSION) return null
    return parsed.data ?? null
  } catch {
    return null
  }
}

/**
 * アップデートでスキーマ版が変わり、前回のセーブが読めなくなった（＝今回リセットされる）か。
 * 起動時に一度だけ判定して「進捗がリセットされた」告知を出すために使う（無言全消しを防ぐ）。
 */
export function wasSaveStale(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as { version?: number }
    return parsed.version !== SAVE_VERSION
  } catch {
    return false
  }
}

/** 保存済みゲームがあるか。 */
export function hasSave(): boolean {
  return loadGame() !== null
}

/** 保存済みゲームを消す。 */
export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    /* 無視 */
  }
}
