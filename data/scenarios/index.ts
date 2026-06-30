import type { Scenario } from './types'
import { tutorialScenario } from './tutorial'
import { defaultScenario } from './default'
import { cafeScenario } from './cafe'
import { startupScenario } from './startup'

export type { Scenario, SimParams, DecisionField } from './types'

/** 利用可能なシナリオのレジストリ（表示順）。 */
const SCENARIO_LIST: readonly Scenario[] = [
  tutorialScenario,
  defaultScenario,
  cafeScenario,
  startupScenario,
]
const SCENARIOS: Record<string, Scenario> = Object.fromEntries(
  SCENARIO_LIST.map((s) => [s.id, s]),
)

/** 選択可能なシナリオの一覧（id・表示名・説明、表示順）。 */
export const AVAILABLE_SCENARIOS: ReadonlyArray<{ id: string; name: string; description: string }> =
  SCENARIO_LIST.map((s) => ({ id: s.id, name: s.name, description: s.description }))

/** ID からシナリオを取得する。未知の ID はエラー。 */
export function getScenario(id: string): Scenario {
  const scenario = SCENARIOS[id]
  if (!scenario) throw new Error(`未知のシナリオ: ${id}`)
  return scenario
}
