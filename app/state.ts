import { useCallback, useMemo, useReducer } from 'react'
import {
  resolveTurn,
  drawEvent,
  computeRatios,
  materialIndexNext,
  competitorAt,
  shareMultiplier,
  productFromRd,
  evaluateGoal,
  totalEquity,
  type CompanyState,
  type Decision,
  type IncomeStatement,
  type CashFlowStatement,
  type Ratios,
  type MarketEvent,
  type GoalStatus,
} from '@core/index'
import { getScenario, AVAILABLE_SCENARIOS } from '@data/scenarios'
import { getEventTable } from '@data/events'

const DEFAULT_SEED = 12345
const DEFAULT_SCENARIO = 'default'

/** 1ターンの記録（履歴・グラフ用）。 */
export interface TurnRecord {
  /** 何期目か（1 始まり） */
  turn: number
  event: MarketEvent
  decision: Decision
  unitsSold: number
  /** 当期の原材料スポット単価（実効仕入原価） */
  effectiveUnitCost: number
  incomeStatement: IncomeStatement
  cashFlow: CashFlowStatement
  ratios: Ratios
  stateAfter: CompanyState
}

export type Outcome = 'playing' | 'won' | 'lost'

export interface GameState {
  scenarioId: string
  seed: number
  current: CompanyState
  history: TurnRecord[]
  outcome: Outcome
  /** ゴール（勝利条件）の状況。フリープレイなら null。 */
  goalStatus: GoalStatus | null
}

function makeInitial(scenarioId: string, seed: number): GameState {
  const scenario = getScenario(scenarioId)
  return {
    scenarioId,
    seed,
    current: scenario.initialState,
    history: [],
    outcome: 'playing',
    goalStatus: scenario.goal
      ? evaluateGoal(scenario.goal, scenario.initialState, scenario.initialState)
      : null,
  }
}

type Action =
  | { type: 'play'; decision: Decision }
  | { type: 'reset' }
  | { type: 'select'; scenarioId: string }

/** 倒産判定: 現金がマイナス、または債務超過（純資産マイナス）。 */
function isBankrupt(state: CompanyState): boolean {
  return state.balanceSheet.currentAssets.cash < 0 || totalEquity(state.balanceSheet) < 0
}

function reducer(game: GameState, action: Action): GameState {
  switch (action.type) {
    case 'select':
      return makeInitial(action.scenarioId, game.seed)
    case 'reset':
      return makeInitial(game.scenarioId, game.seed)
    case 'play': {
      if (game.outcome !== 'playing') return game
      const scenario = getScenario(game.scenarioId)
      const eventTable = getEventTable(scenario.eventTableId)
      const event = drawEvent(eventTable, game.seed, game.current.turn)
      const nextMaterialIndex = materialIndexNext(
        game.current.materialIndex,
        scenario.params,
        game.seed,
        game.current.turn,
      )
      // 競合との市場シェアから需要倍率を求める（自社品質は累積R&D由来）。
      const comp = competitorAt(scenario.params, game.seed, game.current.turn)
      const ourQuality = productFromRd(game.current.rdStock, scenario.params).demandModifier
      const demandShareMultiplier = shareMultiplier(
        action.decision.unitPrice,
        ourQuality,
        comp,
        scenario.params,
      )
      const result = resolveTurn(game.current, action.decision, scenario.params, {
        demandMultiplier: event.demandMultiplier,
        nextMaterialIndex,
        oneOffLoss: event.oneOffLoss,
        equipmentLoss: event.equipmentLoss,
        demandShareMultiplier,
      })
      const record: TurnRecord = {
        turn: result.state.turn,
        event,
        decision: action.decision,
        unitsSold: result.unitsSold,
        effectiveUnitCost: result.effectiveUnitCost,
        incomeStatement: result.incomeStatement,
        cashFlow: result.cashFlow,
        ratios: computeRatios(result.state.balanceSheet, result.incomeStatement),
        stateAfter: result.state,
      }

      const bankrupt = isBankrupt(result.state)
      let goalStatus: GoalStatus | null = scenario.goal
        ? evaluateGoal(scenario.goal, result.state, scenario.initialState)
        : null

      let outcome: Outcome = 'playing'
      if (bankrupt) {
        outcome = 'lost'
        if (goalStatus) goalStatus = { ...goalStatus, status: 'lost', detail: '倒産' }
      } else if (goalStatus) {
        outcome = goalStatus.status === 'progress' ? 'playing' : goalStatus.status
      } else if (scenario.turnLimit && result.state.turn >= scenario.turnLimit) {
        // フリープレイ: 固定期数に到達したら完走（won）扱い
        outcome = 'won'
      }

      return {
        ...game,
        current: result.state,
        history: [...game.history, record],
        outcome,
        goalStatus,
      }
    }
  }
}

export function useGame() {
  const [game, dispatch] = useReducer(reducer, undefined, () =>
    makeInitial(DEFAULT_SCENARIO, DEFAULT_SEED),
  )

  const play = useCallback((decision: Decision) => dispatch({ type: 'play', decision }), [])
  const reset = useCallback(() => dispatch({ type: 'reset' }), [])
  const selectScenario = useCallback(
    (scenarioId: string) => dispatch({ type: 'select', scenarioId }),
    [],
  )

  const scenario = getScenario(game.scenarioId)
  const eventTable = getEventTable(scenario.eventTableId)

  /** 次に来る（まだプレイしていない）期の市況イベント。 */
  const upcomingEvent = useMemo(
    () => drawEvent(eventTable, game.seed, game.current.turn),
    [eventTable, game.seed, game.current.turn],
  )

  return { game, scenario, play, reset, selectScenario, scenarios: AVAILABLE_SCENARIOS, upcomingEvent }
}
