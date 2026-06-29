import { describe, it, expect } from 'vitest'
import type { EventTable } from '@data/events'
import { getEventTable } from '@data/events'
import { drawEvent } from './events'

const table = getEventTable('default')

describe('drawEvent（決定論的イベント抽選）', () => {
  it('同じ seed・turn なら必ず同じイベント', () => {
    const a = drawEvent(table, 12345, 3)
    const b = drawEvent(table, 12345, 3)
    expect(a.id).toBe(b.id)
  })

  it('テーブル内のイベントを返す', () => {
    const ids = new Set(table.map((w) => w.event.id))
    for (let turn = 0; turn < 20; turn++) {
      expect(ids.has(drawEvent(table, 7, turn).id)).toBe(true)
    }
  })

  it('複数ターンで複数種類のイベントが出る（偏りすぎない）', () => {
    const seen = new Set<string>()
    for (let turn = 0; turn < 50; turn++) seen.add(drawEvent(table, 99, turn).id)
    expect(seen.size).toBeGreaterThan(1)
  })

  it('空テーブルや重み0なら平常イベントにフォールバック', () => {
    expect(drawEvent([], 1, 1).demandMultiplier).toBe(1.0)
    const zero: EventTable = [
      { weight: 0, event: { id: 'x', label: 'x', description: '', demandMultiplier: 2 } },
    ]
    expect(drawEvent(zero, 1, 1).demandMultiplier).toBe(1.0)
  })
})
