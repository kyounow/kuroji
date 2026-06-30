import { useCallback, useEffect, useMemo, useReducer } from 'react'
import {
  resolveTurn,
  drawEvent,
  computeRatios,
  materialIndexNext,
  competitorAt,
  shareMultiplier,
  productFromRd,
  evaluateGoal,
  initialMacro,
  advanceMacro,
  cycleDemandMultiplier,
  totalEquity,
  type MacroState,
  type CompanyState,
  type Decision,
  type IncomeStatement,
  type CashFlowStatement,
  type Ratios,
  type MarketEvent,
  type GoalStatus,
  type Goal,
} from '@core/index'
import { getScenario, AVAILABLE_SCENARIOS } from '@data/scenarios'
import { getEventTable } from '@data/events'
import { saveGame, loadGame } from './storage'

const DEFAULT_SEED = 12345
const DEFAULT_SCENARIO = 'default'
/** 横軸の安全弁（~100年＝1200ヶ月）。 */
const MAX_TURNS = 1200

/** ゲームモード。endless=期限なし(負けは倒産のみ・目標はマイルストーン)、challenge=期限付き目標で勝敗。 */
export type GameMode = 'endless' | 'challenge'
export const GAME_MODES: { id: GameMode; name: string }[] = [
  { id: 'challenge', name: 'チャレンジ（期限付き目標）' },
  { id: 'endless', name: 'エンドレス（じっくり経営）' },
]

/** 1ターンの記録（履歴・グラフ用）。 */
export interface TurnRecord {
  /** 何ヶ月目か（1 始まり） */
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
  mode: GameMode
  seed: number
  current: CompanyState
  /** マクロ経済の状態（景気・物価・政策金利） */
  macro: MacroState
  history: TurnRecord[]
  outcome: Outcome
  /** ゴール（勝利条件）の状況。フリープレイなら null。 */
  goalStatus: GoalStatus | null
  /** エンドレスで目標を達成済みか（マイルストーン。ゲームは継続）。 */
  goalAchieved: boolean
}

/** endless では期限（withinTurns）を外し、目標を「マイルストーン」として扱う。 */
function stripDeadline(goal: Goal): Goal {
  if (goal.kind === 'equityTarget' || goal.kind === 'repayAll') {
    return { ...goal, withinTurns: undefined }
  }
  return goal
}

function evalGoal(
  scenarioId: string,
  current: CompanyState,
  mode: GameMode,
): GoalStatus | null {
  const scenario = getScenario(scenarioId)
  if (!scenario.goal) return null
  const goal = mode === 'endless' ? stripDeadline(scenario.goal) : scenario.goal
  return evaluateGoal(goal, current, scenario.initialState)
}

function makeInitial(scenarioId: string, seed: number, mode: GameMode): GameState {
  const scenario = getScenario(scenarioId)
  return {
    scenarioId,
    mode,
    seed,
    current: scenario.initialState,
    macro: initialMacro(scenario.params),
    history: [],
    outcome: 'playing',
    goalStatus: evalGoal(scenarioId, scenario.initialState, mode),
    goalAchieved: false,
  }
}

type Action =
  | { type: 'play'; decision: Decision }
  | { type: 'reset' }
  | { type: 'select'; scenarioId: string }
  | { type: 'setMode'; mode: GameMode }

/** 倒産判定: 現金がマイナス、または債務超過（純資産マイナス）。 */
function isBankrupt(state: CompanyState): boolean {
  return state.balanceSheet.currentAssets.cash < 0 || totalEquity(state.balanceSheet) < 0
}

function reducer(game: GameState, action: Action): GameState {
  switch (action.type) {
    case 'select':
      return makeInitial(action.scenarioId, game.seed, game.mode)
    case 'setMode':
      return makeInitial(game.scenarioId, game.seed, action.mode)
    case 'reset':
      return makeInitial(game.scenarioId, game.seed, game.mode)
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
        policyRate: game.macro.policyRate,
        inflationIndex: game.macro.inflationIndex,
        macroDemandMultiplier: cycleDemandMultiplier(game.macro),
      })
      const nextMacro = advanceMacro(game.macro, scenario.params, game.seed, game.current.turn)
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
      let goalStatus = evalGoal(game.scenarioId, result.state, game.mode)
      let goalAchieved = game.goalAchieved

      let outcome: Outcome = 'playing'
      if (bankrupt) {
        outcome = 'lost'
        if (goalStatus) goalStatus = { ...goalStatus, status: 'lost', detail: '倒産' }
      } else if (game.mode === 'challenge') {
        // チャレンジ: 目標達成/期限切れでゲーム終了。
        if (goalStatus) outcome = goalStatus.status === 'progress' ? 'playing' : goalStatus.status
        else if (scenario.turnLimit && result.state.turn >= scenario.turnLimit) outcome = 'won'
      } else {
        // エンドレス: 目標達成はマイルストーン（継続）。期限切れは無し（deadline 除去済み）。
        if (goalStatus && goalStatus.status === 'won') goalAchieved = true
        if (result.state.turn >= MAX_TURNS) outcome = 'won' // 100年完走
      }

      return {
        ...game,
        current: result.state,
        macro: nextMacro,
        history: [...game.history, record].slice(-MAX_TURNS),
        outcome,
        goalStatus,
        goalAchieved,
      }
    }
  }
}

/** 起動時: 保存済みゲームがあれば復元、なければ新規。 */
function initGame(): GameState {
  const saved = loadGame() as GameState | null
  if (saved && saved.scenarioId && saved.current && saved.macro && Array.isArray(saved.history)) {
    return saved
  }
  return makeInitial(DEFAULT_SCENARIO, DEFAULT_SEED, 'challenge')
}

export function useGame() {
  const [game, dispatch] = useReducer(reducer, undefined, initGame)

  // 変化のたびに自動保存（続きから再開できる）。
  useEffect(() => {
    saveGame(game)
  }, [game])

  const play = useCallback((decision: Decision) => dispatch({ type: 'play', decision }), [])
  const reset = useCallback(() => dispatch({ type: 'reset' }), [])
  const selectScenario = useCallback(
    (scenarioId: string) => dispatch({ type: 'select', scenarioId }),
    [],
  )
  const setMode = useCallback((mode: GameMode) => dispatch({ type: 'setMode', mode }), [])

  const scenario = getScenario(game.scenarioId)
  const eventTable = getEventTable(scenario.eventTableId)

  /** 次に来る（まだプレイしていない）期の市況イベント。 */
  const upcomingEvent = useMemo(
    () => drawEvent(eventTable, game.seed, game.current.turn),
    [eventTable, game.seed, game.current.turn],
  )

  return {
    game,
    scenario,
    play,
    reset,
    selectScenario,
    setMode,
    scenarios: AVAILABLE_SCENARIOS,
    modes: GAME_MODES,
    upcomingEvent,
  }
}
