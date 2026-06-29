import { describe, it, expect } from 'vitest'
import { createRng, hashUnit } from './rng'

describe('createRng', () => {
  it('同じシードなら同じ系列を返す（決定論）', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = [a(), a(), a()]
    const seqB = [b(), b(), b()]
    expect(seqA).toEqual(seqB)
  })

  it('異なるシードでは系列が変わる', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(a()).not.toBe(b())
  })

  it('値は [0,1) に収まる', () => {
    const r = createRng(7)
    for (let i = 0; i < 100; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('hashUnit', () => {
  it('同じ入力なら同じ値（決定論）', () => {
    expect(hashUnit(123, 5)).toBe(hashUnit(123, 5))
  })

  it('ターンが違えば値が変わる', () => {
    expect(hashUnit(123, 5)).not.toBe(hashUnit(123, 6))
  })

  it('値は [0,1) に収まる', () => {
    for (let n = 0; n < 50; n++) {
      const v = hashUnit(999, n)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})
