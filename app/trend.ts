import { totalAssets, totalLiabilities, totalEquity } from '@core/index'
import type { TurnRecord } from './state'

export type Granularity = 'month' | 'year'

/** 時系列の1期間ぶんの集約値（B/Sは期末スナップショット、P/L・C/Fは合算）。 */
export interface TrendBucket {
  /** 軸ラベル（年: "N年"、月: "N-M"） */
  label: string
  /** その期間の最終ターン（ドリルダウン用） */
  turn: number
  // 貸借対照表（期末）
  assets: { cash: number; receivable: number; rawMaterials: number; finishedGoods: number; equipment: number }
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  // 損益（期間合算）
  revenue: number
  operatingIncome: number
  netIncome: number
  // キャッシュフロー（期間合算）
  cfOperating: number
  cfInvesting: number
  cfFinancing: number
}

const yearOf = (turn: number, ppy: number) => Math.floor((turn - 1) / ppy) + 1
const subOf = (turn: number, ppy: number) => ((turn - 1) % ppy) + 1

function emptyBucket(label: string): TrendBucket {
  return {
    label,
    turn: 0,
    assets: { cash: 0, receivable: 0, rawMaterials: 0, finishedGoods: 0, equipment: 0 },
    totalAssets: 0,
    totalLiabilities: 0,
    totalEquity: 0,
    revenue: 0,
    operatingIncome: 0,
    netIncome: 0,
    cfOperating: 0,
    cfInvesting: 0,
    cfFinancing: 0,
  }
}

/** その記録の B/S スナップショットをバケットへ反映（最後の記録で上書き）。 */
function applySnapshot(b: TrendBucket, rec: TurnRecord) {
  const bs = rec.stateAfter.balanceSheet
  b.turn = rec.turn
  b.assets = {
    cash: bs.currentAssets.cash,
    receivable: bs.currentAssets.accountsReceivable,
    rawMaterials: bs.currentAssets.rawMaterials,
    finishedGoods: bs.currentAssets.finishedGoods,
    equipment: bs.fixedAssets.equipment,
  }
  b.totalAssets = totalAssets(bs)
  b.totalLiabilities = totalLiabilities(bs)
  b.totalEquity = totalEquity(bs)
}

/** その記録のフロー（P/L・C/F）をバケットへ加算。 */
function addFlows(b: TrendBucket, rec: TurnRecord) {
  b.revenue += rec.incomeStatement.revenue
  b.operatingIncome += rec.incomeStatement.operatingIncome
  b.netIncome += rec.incomeStatement.netIncome
  b.cfOperating += rec.cashFlow.operating
  b.cfInvesting += rec.cashFlow.investing
  b.cfFinancing += rec.cashFlow.financing
}

/**
 * 履歴を年単位／月単位の時系列バケットに集約する。
 * フロー（売上・利益・各CF）は期間で合算、ストック（B/S）は期間末のスナップショット。
 * `maxBuckets` を超える場合は直近のみを返す（推移は直近重視）。
 */
export function aggregateTrend(
  history: TurnRecord[],
  ppy: number,
  granularity: Granularity,
  maxBuckets = granularity === 'year' ? 50 : 36,
): TrendBucket[] {
  const buckets: TrendBucket[] = []
  const byKey = new Map<number, TrendBucket>()

  for (const rec of history) {
    const key = granularity === 'year' ? yearOf(rec.turn, ppy) : rec.turn
    let b = byKey.get(key)
    if (!b) {
      const label =
        granularity === 'year'
          ? `${yearOf(rec.turn, ppy)}年`
          : ppy === 12
            ? `${yearOf(rec.turn, ppy)}-${subOf(rec.turn, ppy)}`
            : `${rec.turn}`
      b = emptyBucket(label)
      byKey.set(key, b)
      buckets.push(b)
    }
    addFlows(b, rec)
    applySnapshot(b, rec) // 最後の記録で B/S を確定（年末スナップショット）
  }

  return buckets.length > maxBuckets ? buckets.slice(-maxBuckets) : buckets
}
