import type { Scenario } from './types'
import { defaultScenario } from './default'

export type { Scenario, SimParams, DecisionField } from './types'

/** 利用可能なシナリオのレジストリ。 */
const SCENARIOS: Record<string, Scenario> = {
  [defaultScenario.id]: defaultScenario,
}

/** 選択可能なシナリオの一覧（id と表示名）。 */
export const AVAILABLE_SCENARIOS: ReadonlyArray<{ id: string; name: string }> = Object.values(
  SCENARIOS,
).map((s) => ({ id: s.id, name: s.name }))

/** ID からシナリオを取得する。未知の ID はエラー。 */
export function getScenario(id: string): Scenario {
  const scenario = SCENARIOS[id]
  if (!scenario) throw new Error(`未知のシナリオ: ${id}`)
  return scenario
}
