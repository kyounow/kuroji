import type { Scenario } from './types'
import { defaultScenario } from './default'

export type { Scenario, SimParams } from './types'

/** 利用可能なシナリオのレジストリ。 */
const SCENARIOS: Record<string, Scenario> = {
  [defaultScenario.id]: defaultScenario,
}

/** 選択可能なシナリオ ID の一覧。 */
export const AVAILABLE_SCENARIOS: readonly string[] = Object.keys(SCENARIOS)

/** ID からシナリオを取得する。未知の ID はエラー。 */
export function getScenario(id: string): Scenario {
  const scenario = SCENARIOS[id]
  if (!scenario) throw new Error(`未知のシナリオ: ${id}`)
  return scenario
}
