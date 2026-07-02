import { describe, it, expect } from 'vitest'
import { migrateGameData } from './storage'

// セーブの前方マイグレーション（純関数部分）。
// 現在 MIGRATIONS は空＝現行版のみ受理。構造変更で MIGRATIONS を登録したら、
// 旧版セーブのフィクスチャを足して「移行後に恒等式が成立する」ことをここで固定する。
describe('セーブ移行 migrateGameData', () => {
  const dummy = { current: { balanceSheet: null }, history: [] }

  it('現行版はそのまま通す', () => {
    expect(migrateGameData(5, dummy)).toBe(dummy)
  })

  it('移行経路のない旧版・未知版・未来版は null（リセット＋告知の経路へ）', () => {
    expect(migrateGameData(4, dummy)).toBeNull()
    expect(migrateGameData(undefined, dummy)).toBeNull()
    expect(migrateGameData(999, dummy)).toBeNull()
  })
})
