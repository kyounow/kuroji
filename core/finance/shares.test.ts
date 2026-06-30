import { describe, it, expect } from 'vitest'
import { bookValuePerShare, sharesIssued, earningsPerShare } from './shares'

describe('shares', () => {
  it('BVPS = 純資産 ÷ 発行済株数（株数0なら0）', () => {
    expect(bookValuePerShare(1_000_000, 1_000)).toBe(1_000)
    expect(bookValuePerShare(990_000, 1_000)).toBe(990)
    expect(bookValuePerShare(500_000, 0)).toBe(0)
  })

  it('増資は簿価発行（発行価格=BVPS）で新株数が決まる', () => {
    // 純資産1,000,000・1,000株 → BVPS 1,000。50万円増資 → 500株。
    expect(sharesIssued(500_000, 1_000_000, 1_000)).toBe(500)
    // BVPS 990 で 99万円増資 → 1,000株
    expect(sharesIssued(990_000, 990_000, 1_000)).toBe(1_000)
    // 純資産0以下・株数0は発行不能
    expect(sharesIssued(100_000, 0, 1_000)).toBe(0)
    expect(sharesIssued(100_000, 500_000, 0)).toBe(0)
  })

  it('EPS = 当期純利益 ÷ 発行済株数（希薄化で低下）', () => {
    expect(earningsPerShare(100_000, 1_000)).toBe(100)
    // 株数が増える（希薄化）と EPS は下がる
    expect(earningsPerShare(100_000, 2_000)).toBe(50)
    expect(earningsPerShare(100_000, 0)).toBe(0)
  })
})
