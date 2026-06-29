import { useCallback, useMemo, useReducer } from 'react'
import {
  resolveTurn,
  drawEvent,
  computeRatios,
  totalEquity,
  type CompanyState,
  type Decision,
  type IncomeStatement,
  type CashFlowStatement,
  type Ratios,
  type MarketEvent,
} from '@core/index'
import { getScenario } from '@data/scenarios'
import { getEventTable } from '@data/events'

const scenario = getScenario('default')
const eventTable = getEventTable('default')
const DEFAULT_SEED = 12345

/** 1ターンの記録（履歴・グラフ用）。 */
export interface TurnRecord {
  /** 何期目か（1 始まり） */
  turn: number
  event: MarketEvent
  decision: Decision
  unitsSold: number
  incomeStatement: IncomeStatement
  cashFlow: CashFlowStatement
  ratios: Ratios
  stateAfter: CompanyState
}

export interface GameState {
  seed: number
  current: CompanyState
  history: TurnRecord[]
  gameOver: boolean
}

const initialGame = (seed: number): GameState => ({
  seed,
  current: scenario.initialState,
  history: [],
  gameOver: false,
})

type Action = { type: 'play'; decision: Decision } | { type: 'reset' }

/** 倒産判定: 現金がマイナス、または債務超過（純資産マイナス）。 */
function isBankrupt(state: CompanyState): boolean {
  return state.balanceSheet.currentAssets.cash < 0 || totalEquity(state.balanceSheet) < 0
}

function reducer(game: GameState, action: Action): GameState {
  switch (action.type) {
    case 'reset':
      return initialGame(game.seed)
    case 'play': {
      if (game.gameOver) return game
      const event = drawEvent(eventTable, game.seed, game.current.turn)
      const result = resolveTurn(game.current, action.decision, scenario.params, {
        demandMultiplier: event.demandMultiplier,
      })
      const record: TurnRecord = {
        turn: result.state.turn,
        event,
        decision: action.decision,
        unitsSold: result.unitsSold,
        incomeStatement: result.incomeStatement,
        cashFlow: result.cashFlow,
        ratios: computeRatios(result.state.balanceSheet, result.incomeStatement),
        stateAfter: result.state,
      }
      return {
        ...game,
        current: result.state,
        history: [...game.history, record],
        gameOver: isBankrupt(result.state),
      }
    }
  }
}

export function useGame() {
  const [game, dispatch] = useReducer(reducer, DEFAULT_SEED, initialGame)

  const play = useCallback((decision: Decision) => dispatch({ type: 'play', decision }), [])
  const reset = useCallback(() => dispatch({ type: 'reset' }), [])

  /** 次に来る（まだプレイしていない）期の市況イベント。 */
  const upcomingEvent = useMemo(
    () => drawEvent(eventTable, game.seed, game.current.turn),
    [game.seed, game.current.turn],
  )

  return { game, scenario, play, reset, upcomingEvent }
}
