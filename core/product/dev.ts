import type { CompanyState, DevProject, DevLaunched, ProductLineParams, SimParams } from '@core/types'

/**
 * 商材開発（Dev Project）の純関数群。
 * ライン構成の合成はここが**唯一のソース**：エンジン（resolveTurn）・UI（判断パネル/品質計算）・
 * テストが同じ関数を使い、実行時にローンチされた新ラインのインデックス整合を保証する。
 */

/** プロジェクト定義を引く（未定義IDは undefined）。 */
export function findDevProject(params: SimParams, projectId: string): DevProject | undefined {
  return params.devProjects?.find((p) => p.id === projectId)
}

/**
 * ライフサイクル係数（需要ブースト/新ライン需要に掛かる 0..1+）。
 * decay: (1 - 年率/ppy)^経過ターン のじわ減り／permanent: 常に1／seasonal: 期間内1・期間後0。
 */
export function devLifecycleFactor(project: DevProject, turnsSinceLaunch: number, ppy: number): number {
  if (turnsSinceLaunch < 0) return 0
  switch (project.lifecycle) {
    case 'permanent':
      return 1
    case 'seasonal':
      return turnsSinceLaunch < (project.boostDuration ?? 0) ? 1 : 0
    case 'decay': {
      const perTurn = Math.max(0, Math.min(1, (project.obsolescenceRate ?? 0) / ppy))
      return Math.pow(1 - perTurn, turnsSinceLaunch)
    }
  }
}

/**
 * その時点の実効ライン構成＝シナリオ定義（or 単一既定）＋ローンチ済み新ライン（launchedTurn 昇順）。
 * upgrade 型のローンチは対象ラインの baseDemand（ブースト×ライフサイクル）と R&D 上限（恒久）を合成して返す。
 * `turn` は評価時点（陳腐化・季節の経過計算に使う）。決定論＝params と state.devLaunched のみから導出。
 */
export function composeLineDefs(params: SimParams, state: CompanyState, turn: number): ProductLineParams[] {
  const base: ProductLineParams[] = params.productLines?.length
    ? params.productLines
    : [
        {
          id: 'main',
          name: '主力製品',
          baseDemand: params.baseDemand,
          basePrice: params.basePrice,
          priceElasticity: params.priceElasticity,
          unitVariableCost: params.unitVariableCost,
        },
      ]
  const launched = (state.devLaunched ?? [])
    .filter((d) => d.launchedTurn <= turn)
    .slice()
    .sort((a, b) => a.launchedTurn - b.launchedTurn)

  // upgrade: 対象ラインへ需要ブースト（×ライフサイクル）と R&D 上限デルタ（恒久）を合成。
  const upgraded = base.map((lp) => {
    let baseDemand = lp.baseDemand
    let rdCost = lp.rdCostReductionMax
    let rdBoost = lp.rdDemandBoostMax
    for (const d of launched) {
      const p = findDevProject(params, d.projectId)
      if (!p || p.kind !== 'upgrade' || p.targetLineId !== lp.id) continue
      const factor = devLifecycleFactor(p, turn - d.launchedTurn, params.periodsPerYear ?? 1)
      baseDemand = baseDemand * (1 + (p.demandBoost ?? 0) * factor)
      if (p.rdCostReductionMaxDelta) rdCost = (rdCost ?? params.rdCostReductionMax) + p.rdCostReductionMaxDelta
      if (p.rdDemandBoostMaxDelta) rdBoost = (rdBoost ?? params.rdDemandBoostMax) + p.rdDemandBoostMaxDelta
    }
    return baseDemand === lp.baseDemand && rdCost === lp.rdCostReductionMax && rdBoost === lp.rdDemandBoostMax
      ? lp
      : { ...lp, baseDemand, rdCostReductionMax: rdCost, rdDemandBoostMax: rdBoost }
  })

  // new: ローンチ順に新ラインを追加（needs launchedTurn からの陳腐化を baseDemand に合成）。
  const newLines: ProductLineParams[] = []
  for (const d of launched) {
    const p = findDevProject(params, d.projectId)
    if (!p || p.kind !== 'new' || !p.newLine) continue
    const factor = devLifecycleFactor(p, turn - d.launchedTurn, params.periodsPerYear ?? 1)
    newLines.push({ ...p.newLine, baseDemand: p.newLine.baseDemand * factor })
  }
  return [...upgraded, ...newLines]
}

/**
 * 開発資産（B/S）の導出値＝Σ(資産計上案件のWIP累計投資)＋Σ(ローンチ済みの残存簿価)。
 * 費用処理案件（capitalize=false）の invested は進捗管理用で、費用化済みのため資産には含めない。
 */
export function developmentAssetOf(
  params: SimParams,
  state: {
    devInProgress?: { projectId: string; invested: number }[]
    devLaunched?: DevLaunched[]
  },
): number {
  const wip = (state.devInProgress ?? []).reduce(
    (s, d) => s + (findDevProject(params, d.projectId)?.capitalize ? d.invested : 0),
    0,
  )
  const book = (state.devLaunched ?? []).reduce((s, d) => s + d.bookValue, 0)
  return wip + book
}
