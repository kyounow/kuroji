/**
 * 決定論的な乱数ユーティリティ。
 * ゲームのランダム要素は必ずシードから導出し、同じシードなら同じ展開になるようにする
 * （リプレイ・テスト・セーブの再現性のため）。Math.random() は使わない。
 */

/** mulberry32: シードから [0,1) の乱数を返す関数を作る（状態を内部に持つ）。 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 2つの整数（シードとターン等）から決定論的に [0,1) を返すハッシュ。
 * 状態を持たずに「このシード・このターンの値」を引けるので、ターン単位の抽選に使う。
 */
export function hashUnit(seed: number, n: number): number {
  let h = 2166136261 >>> 0
  h = Math.imul(h ^ (seed >>> 0), 16777619)
  h = Math.imul(h ^ (n >>> 0), 16777619)
  h ^= h >>> 15
  h = Math.imul(h, 2246822507)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}
