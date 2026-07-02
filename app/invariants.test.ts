import { describe, it, expect } from 'vitest'
import type { Decision, SimParams } from '@core/index'
import { balances, totalAssets, totalLiabilities, totalEquity } from '@core/index'
import { AVAILABLE_SCENARIOS, getScenario } from '@data/scenarios'
import { makeInitial, advanceTurn, previewTurn, defaultDecision, type GameState } from './state'

// ============================================================================
// 恒久 不変条件スイート（エンジンを変更するたびの安全網。全体検証 2026-07 の
// 使い捨てハーネスを常設化）。実測 ~1万ターン/100ms 未満と安価なため常時実行する。
//   A. 会計不変条件ストレス（恒等式・CF・利益剰余金・非負・NaN）
//   B. 決定論（同seed同判断→履歴一致）・プレビュー純粋性
//   C. 倒産経路・増資エクスプロイト回帰（稼いだ純資産判定＋発行キャップ）
// ============================================================================

/** 決定論的な擬似乱数 [0,1)。 */
function u(seed: number, turn: number, k: number): number {
  let h = (seed * 374761393 + turn * 668265263 + k * 2246822519) >>> 0
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** 非有限数（NaN/Infinity）を再帰的に収集。 */
function collectNonFinite(obj: unknown, path: string, out: string[]): void {
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) out.push(`${path}=${obj}`)
    return
  }
  if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj as Record<string, unknown>)) {
      collectNonFinite((obj as Record<string, unknown>)[k], `${path}.${k}`, out)
    }
  }
}

/** 1ターン記録＋直前状態から不変条件違反を列挙（空配列＝健全）。 */
function checkRecord(rec: GameState['history'][number], prev: GameState['current'], ctx: string): string[] {
  const p: string[] = []
  const s = rec.stateAfter
  const bs = s.balanceSheet
  // 1) 会計恒等式（円単位で厳密。1円未満の浮動小数残差のみ許容）
  const drift = totalAssets(bs) - (totalLiabilities(bs) + totalEquity(bs))
  if (Math.abs(drift) > 1e-6) p.push(`${ctx}: 恒等式ズレ ${drift}`)
  // 2) CF 整合
  const cf = rec.cashFlow
  if (cf.netChange !== cf.operating + cf.investing + cf.financing) p.push(`${ctx}: CF三区分和≠netChange`)
  if (cf.cashEnd !== cf.cashBegin + cf.netChange) p.push(`${ctx}: cashEnd≠begin+net`)
  if (cf.cashEnd !== bs.currentAssets.cash) p.push(`${ctx}: cashEnd≠BS現金`)
  if (cf.cashBegin !== prev.balanceSheet.currentAssets.cash) p.push(`${ctx}: cashBegin≠前期末現金`)
  // 3) 利益剰余金の繰越（配当導入後は −配当 も考慮する）
  const expRE = prev.balanceSheet.equity.retainedEarnings + rec.incomeStatement.netIncome
  if (bs.equity.retainedEarnings !== expRE) p.push(`${ctx}: 利益剰余金繰越ズレ`)
  // 4) P/L 内部整合
  const is = rec.incomeStatement
  if (is.grossProfit !== is.revenue - is.costOfGoodsSold) p.push(`${ctx}: 粗利≠売上−原価`)
  if (is.operatingIncome !== is.grossProfit - is.operatingExpenses) p.push(`${ctx}: 営業利益≠粗利−販管費`)
  if (is.netIncome !== is.pretaxIncome - is.tax) p.push(`${ctx}: 純利益≠税引前−税`)
  // 5) NaN/Infinity なし
  collectNonFinite(is, `${ctx}.PL`, p)
  collectNonFinite(cf, `${ctx}.CF`, p)
  collectNonFinite(bs, `${ctx}.BS`, p)
  // 6) 在庫・設備の非負と数量⇔金額の整合
  if (s.materialUnits < 0) p.push(`${ctx}: 原材料数量<0`)
  if (s.finishedUnits < 0) p.push(`${ctx}: 製品数量<0`)
  if (bs.currentAssets.rawMaterials < 0) p.push(`${ctx}: 原材料評価額<0`)
  if (bs.currentAssets.finishedGoods < 0) p.push(`${ctx}: 製品評価額<0`)
  if (bs.fixedAssets.equipment < 0) p.push(`${ctx}: 設備簿価<0`)
  if (s.materialUnits === 0 && bs.currentAssets.rawMaterials !== 0) p.push(`${ctx}: 原材料 数量0だが評価額≠0`)
  if (s.finishedUnits === 0 && bs.currentAssets.finishedGoods !== 0) p.push(`${ctx}: 製品 数量0だが評価額≠0`)
  if ((s.headcount ?? 0) < 0) p.push(`${ctx}: 従業員数<0`)
  if (is.revenue < 0) p.push(`${ctx}: 売上<0`)
  if (is.costOfGoodsSold < 0) p.push(`${ctx}: 売上原価<0`)
  return p
}

/** 妥当な範囲のランダム判断。sink=true で毎ターン全レバーを使う。 */
function randomDecision(game: GameState, params: SimParams, seed: number, turn: number, sink: boolean): Decision {
  const ppy = params.periodsPerYear ?? 1
  const perMonth = Math.max(1, Math.round(params.baseDemand / ppy))
  const cash = game.current.balanceSheet.currentAssets.cash
  const affordable = Math.max(0, cash)
  return {
    unitPrice: Math.round(params.basePrice * (0.7 + 0.8 * u(seed, turn, 1))),
    purchaseMaterials: Math.round(perMonth * (0.4 + 1.4 * u(seed, turn, 2))),
    produceUnits: Math.round(perMonth * (0.4 + 1.4 * u(seed, turn, 3))),
    marketingSpend: sink || u(seed, turn, 4) < 0.3 ? Math.round((params.marketingHalf ?? 30000) * u(seed, turn, 14)) : 0,
    rdSpend: sink || u(seed, turn, 5) < 0.3 ? Math.round((params.rdHalf ?? 300000) * 0.05 * u(seed, turn, 15)) : 0,
    insuranceSpend: sink || u(seed, turn, 6) < 0.3 ? Math.round((params.insuranceRefCost ?? 0) * u(seed, turn, 16)) : 0,
    maintenanceSpend: sink || u(seed, turn, 7) < 0.3 ? Math.round((params.maintenanceRefCost ?? 0) * u(seed, turn, 17)) : 0,
    capitalExpenditure:
      sink || u(seed, turn, 8) < 0.2 ? Math.min(affordable * 0.2, Math.round(50000 * u(seed, turn, 18))) : 0,
    hire: sink ? Math.floor(3 * u(seed, turn, 9)) : u(seed, turn, 9) < 0.15 ? 1 + Math.floor(2 * u(seed, turn, 19)) : 0,
    fire: sink ? Math.floor(2 * u(seed, turn, 10)) : u(seed, turn, 10) < 0.1 ? 1 : 0,
    wageLevel: sink ? Math.round(60 + 80 * u(seed, turn, 11)) : 100,
    equityIssuance: sink || u(seed, turn, 12) < 0.15 ? Math.round(200000 * u(seed, turn, 20)) : 0,
    financing: sink
      ? Math.round((u(seed, turn, 13) - 0.5) * 100000)
      : u(seed, turn, 13) < 0.2
        ? Math.round((u(seed, turn, 21) - 0.4) * 80000)
        : 0,
  }
}

// ---------------------------------------------------------------------------
// A. 会計不変条件ストレス
// ---------------------------------------------------------------------------
describe('不変条件A: 会計恒等式・CF・利益剰余金（全シナリオ×多seed×長期）', () => {
  it('ランダム判断で毎ターン成立', () => {
    const problems: string[] = []
    for (const sc of AVAILABLE_SCENARIOS) {
      const scenario = getScenario(sc.id)
      for (let seed = 1; seed <= 8; seed++) {
        let game = makeInitial(sc.id, seed * 100 + 7, 'endless')
        for (let t = 0; t < 120 && game.outcome === 'playing'; t++) {
          const prev = game.current
          game = advanceTurn(game, randomDecision(game, scenario.params, seed, t, false))
          const rec = game.history[game.history.length - 1]
          if (rec) problems.push(...checkRecord(rec, prev, `${sc.id}/seed${seed}/t${t}`))
          if (problems.length > 20) break
        }
        if (problems.length > 20) break
      }
      if (problems.length > 20) break
    }
    expect(problems).toEqual([])
  })

  it('全レバー同時でも毎ターン成立', () => {
    const problems: string[] = []
    for (const sc of AVAILABLE_SCENARIOS) {
      const scenario = getScenario(sc.id)
      for (let seed = 1; seed <= 4; seed++) {
        let game = makeInitial(sc.id, seed * 31 + 3, 'endless')
        for (let t = 0; t < 120 && game.outcome === 'playing'; t++) {
          const prev = game.current
          game = advanceTurn(game, randomDecision(game, scenario.params, seed + 500, t, true))
          const rec = game.history[game.history.length - 1]
          if (rec) problems.push(...checkRecord(rec, prev, `sink:${sc.id}/seed${seed}/t${t}`))
          if (problems.length > 20) break
        }
        if (problems.length > 20) break
      }
      if (problems.length > 20) break
    }
    expect(problems).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// B. 決定論・プレビュー純粋性
// ---------------------------------------------------------------------------
describe('不変条件B: 決定論', () => {
  it('同seed・同判断列で履歴が完全一致（リプレイ可能）', () => {
    const scenario = getScenario('default')
    const run = (): GameState => {
      let g = makeInitial('default', 4242, 'challenge')
      for (let t = 0; t < 96 && g.outcome === 'playing'; t++) {
        g = advanceTurn(g, randomDecision(g, scenario.params, 999, t, false))
      }
      return g
    }
    const a = run()
    const b = run()
    expect(JSON.stringify(a.history)).toBe(JSON.stringify(b.history))
    expect(a.outcome).toBe(b.outcome)
  })

  it('previewTurn は純粋（副作用なし・同一入力で同一結果）', () => {
    const scenario = getScenario('default')
    const g = makeInitial('default', 7, 'endless')
    const d = randomDecision(g, scenario.params, 1, 0, true)
    const before = JSON.stringify(g)
    const p1 = previewTurn(g, d)
    const p2 = previewTurn(g, d)
    expect(JSON.stringify(p1)).toBe(JSON.stringify(p2))
    expect(JSON.stringify(g)).toBe(before)
  })
})

// ---------------------------------------------------------------------------
// C. 倒産経路・増資エクスプロイト回帰
// ---------------------------------------------------------------------------
describe('不変条件C: 倒産経路と資本注入エクスプロイト回帰', () => {
  it('悪手を続ければ倒産に到達し、最終状態も恒等式維持', () => {
    let g = makeInitial('cafe', 8, 'challenge')
    let reached = false
    for (let t = 0; t < 200; t++) {
      const prev = g.current
      g = advanceTurn(g, {
        ...defaultDecision('cafe'),
        unitPrice: 1,
        purchaseMaterials: 300,
        produceUnits: 300,
        marketingSpend: 100000,
      })
      const rec = g.history[g.history.length - 1]
      if (rec) expect(checkRecord(rec, prev, `bankrupt/t${t}`)).toEqual([])
      if (g.outcome === 'lost') {
        reached = true
        break
      }
    }
    expect(reached).toBe(true)
  })

  it('増資では純資産目標を買えない（稼いだ純資産判定＋発行キャップ）', () => {
    // かつての穴: 標準シナリオ（開始純資産 ~¥978k・目標 ¥1.5M）で増資 ¥600k → 1ターン即クリアできた。
    let g = makeInitial('default', 1, 'challenge')
    const equityBefore = totalEquity(g.current.balanceSheet)
    g = advanceTurn(g, { ...defaultDecision('default'), equityIssuance: 600_000 })
    // 1) 勝利にならない（目標は「稼いだ純資産」で判定）
    expect(g.outcome).toBe('playing')
    expect(g.goalStatus?.status).not.toBe('won')
    // 2) 発行は期首純資産×25% でキャップされる
    const paidIn = g.current.paidInSinceStart ?? 0
    expect(paidIn).toBeGreaterThan(0)
    expect(paidIn).toBeLessThanOrEqual(Math.round(equityBefore * 0.25))
    // 3) 資本金の増加はキャップ後の調達額と一致し、恒等式は維持
    expect(g.current.balanceSheet.equity.capitalStock).toBe(
      getScenario('default').initialState.balanceSheet.equity.capitalStock + paidIn,
    )
    expect(balances(g.current.balanceSheet)).toBe(true)
  })

  it('paidInSinceStart は増資のたび累積し、未調達なら undefined のまま', () => {
    let g = makeInitial('default', 2, 'endless')
    g = advanceTurn(g, defaultDecision('default'))
    expect(g.current.paidInSinceStart).toBeUndefined() // 未調達＝セーブ後方互換
    g = advanceTurn(g, { ...defaultDecision('default'), equityIssuance: 100_000 })
    const first = g.current.paidInSinceStart ?? 0
    expect(first).toBeGreaterThan(0)
    g = advanceTurn(g, { ...defaultDecision('default'), equityIssuance: 100_000 })
    expect(g.current.paidInSinceStart ?? 0).toBeGreaterThan(first)
  })
})
