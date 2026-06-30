import { describe, it, expect } from 'vitest'
import type { TurnRecord } from './state'
import { aggregateTrend } from './trend'

/** テスト用に必要なフィールドだけ持つ TurnRecord を作る。 */
function mkRec(turn: number, v: { rev: number; ni: number; oi: number; cfo: number; cash: number; equity: number }): TurnRecord {
  return {
    turn,
    incomeStatement: { revenue: v.rev, operatingIncome: v.oi, netIncome: v.ni },
    cashFlow: { operating: v.cfo, investing: 0, financing: 0 },
    stateAfter: {
      balanceSheet: {
        currentAssets: { cash: v.cash, accountsReceivable: 0, rawMaterials: 0, finishedGoods: 0 },
        fixedAssets: { equipment: 0 },
        currentLiabilities: { accountsPayable: 0, shortTermDebt: 0 },
        nonCurrentLiabilities: { longTermDebt: v.cash - v.equity },
        equity: { capitalStock: v.equity, retainedEarnings: 0 },
      },
    },
  } as unknown as TurnRecord
}

const ppy = 12
// 14ヶ月分（年1=12ヶ月、年2=2ヶ月）
const history: TurnRecord[] = Array.from({ length: 14 }, (_, i) =>
  mkRec(i + 1, { rev: 100, ni: 10, oi: 20, cfo: 5, cash: 1000 + (i + 1) * 10, equity: 500 + (i + 1) * 10 }),
)

describe('aggregateTrend', () => {
  it('月単位: 各ターンが1バケット、フローはその月の値', () => {
    const b = aggregateTrend(history, ppy, 'month', 100)
    expect(b.length).toBe(14)
    expect(b[0].revenue).toBe(100)
    expect(b[0].label).toBe('1-1')
    expect(b[12].label).toBe('2-1') // 13ヶ月目 = 2年目1月
  })

  it('年単位: 年でまとめ、フローは合算・B/Sは年末スナップショット', () => {
    const b = aggregateTrend(history, ppy, 'year', 100)
    expect(b.length).toBe(2) // 1年目・2年目
    expect(b[0].label).toBe('1年')
    expect(b[0].revenue).toBe(100 * 12) // 12ヶ月合算
    // 1年目の年末（12ヶ月目）の現金スナップショット
    expect(b[0].assets.cash).toBe(1000 + 12 * 10)
    expect(b[0].turn).toBe(12)
    expect(b[1].revenue).toBe(100 * 2) // 2年目は2ヶ月分
  })

  it('maxBuckets を超えると直近のみ', () => {
    const b = aggregateTrend(history, ppy, 'month', 5)
    expect(b.length).toBe(5)
    expect(b[b.length - 1].turn).toBe(14) // 最新を含む
  })

  it('純資産・総資産・負債合計を集約できる', () => {
    const b = aggregateTrend(history, ppy, 'month', 100)
    expect(b[0].totalEquity).toBe(510) // capitalStock 510 + RE 0
    expect(b[0].totalAssets).toBe(1010) // cash 1010
  })
})
