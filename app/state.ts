import { useCallback, useEffect, useMemo, useReducer } from 'react'
import {
  resolveTurn,
  drawEvent,
  computeRatios,
  materialIndexNext,
  competitorAt,
  shareMultiplier,
  productFromRd,
  composeLineDefs,
  ipoValuation,
  evaluateGoal,
  initialMacro,
  advanceMacro,
  cycleDemandMultiplier,
  hashUnit,
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
  type TurnOptions,
  type TurnResult,
} from '@core/index'
import { getScenario, AVAILABLE_SCENARIOS } from '@data/scenarios'
import { getEventTable } from '@data/events'
import { saveGame, loadGame } from './storage'

const DEFAULT_SEED = 12345
// 初見プレイヤーの既定はチュートリアル（操作を価格・仕入・生産に絞って学べる）。
// 続きから復元される既存プレイヤーには影響しない。
const DEFAULT_SCENARIO = 'tutorial'
/** 横軸の安全弁（~100年＝1200ヶ月）。 */
const MAX_TURNS = 1200

/** ゲームモード。endless=期限なし(負けは倒産のみ・目標はマイルストーン)、challenge=期限付き目標で勝敗。 */
export type GameMode = 'endless' | 'challenge'
export const GAME_MODES: { id: GameMode; name: string; description: string }[] = [
  {
    id: 'challenge',
    name: 'チャレンジ（期限付き目標）',
    description: '期限内に目標（純資産など）を達成すればクリア。期限切れ・倒産で終了。手応え重視。',
  },
  {
    id: 'endless',
    name: 'エンドレス（じっくり経営）',
    description: '期限なし。倒産しない限り続けられ、目標はマイルストーン。最大100年の長期サンドボックス。',
  },
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
  /** 当期に支払った配当（クランプ後。利益剰余金の繰越検証・診断に使う） */
  dividendPaid?: number
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
  /** エンドレスのマイルストーン段階（達成のたび +1。目標額は 2^level 倍）。未設定は 0。 */
  milestoneLevel?: number
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
  milestoneLevel = 0,
): GoalStatus | null {
  const scenario = getScenario(scenarioId)
  if (!scenario.goal) return null
  let goal = mode === 'endless' ? stripDeadline(scenario.goal) : scenario.goal
  // エンドレスの equityTarget は達成のたびに目標を倍にした「次のマイルストーン」を出す（無目標状態を作らない）。
  if (mode === 'endless' && goal.kind === 'equityTarget' && milestoneLevel > 0) {
    const target = goal.target * 2 ** milestoneLevel
    goal = {
      ...goal,
      target,
      label: `稼いだ純資産を ¥${target.toLocaleString('ja-JP')} にする（マイルストーン${milestoneLevel + 1}）`,
    }
  }
  return evaluateGoal(goal, current, scenario.initialState)
}

/**
 * シナリオに応じた判断の初期値。**唯一の定義**（App の useState 初期化とシナリオ切替リセットの両方がこれを使う。
 * 過去に2箇所のリテラル重複が編集漏れバグの温床になったため集約）。
 */
export function defaultDecision(scenarioId: string): Decision {
  const { params } = getScenario(scenarioId)
  const ppy = params.periodsPerYear ?? 1
  const perPeriod = Math.round(params.baseDemand / ppy)
  // 複数製品シナリオはライン別の既定値。主力（ライン0）は基準需要ぶん、
  // 2本目以降は既定で休止＝プレイヤーが明示的に立ち上げる（受動プレイの現金を守り、新ライン開始を経営判断にする）。
  const lines = params.productLines?.length
    ? params.productLines.map((lp, i) => ({
        unitPrice: lp.basePrice,
        purchaseMaterials: i === 0 ? Math.round(lp.baseDemand / ppy) : 0,
        produceUnits: i === 0 ? Math.round(lp.baseDemand / ppy) : 0,
        marketingSpend: 0,
        rdSpend: 0,
      }))
    : undefined
  return {
    unitPrice: params.basePrice,
    purchaseMaterials: perPeriod,
    produceUnits: perPeriod,
    marketingSpend: 0,
    rdSpend: 0,
    insuranceSpend: 0,
    maintenanceSpend: 0,
    capitalExpenditure: 0,
    hire: 0,
    fire: 0,
    wageLevel: 100,
    equityIssuance: 0,
    dividend: 0,
    financing: 0,
    lines,
  }
}

export function makeInitial(scenarioId: string, seed: number, mode: GameMode): GameState {
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
  | { type: 'newGame'; scenarioId: string; mode: GameMode; seed: number }

/** 倒産判定: 現金がマイナス、または債務超過（純資産マイナス）。 */
function isBankrupt(state: CompanyState): boolean {
  return state.balanceSheet.currentAssets.cash < 0 || totalEquity(state.balanceSheet) < 0
}

/**
 * この判断・現在状態でのターン解決オプション（イベント・市況・競合・マクロ）を組み立てる。
 * eventOverride を渡すと抽選イベントの代わりにそれを使う（確定時の発火判定後の実効イベント注入用）。
 */
function turnOptionsFor(game: GameState, decision: Decision, eventOverride?: MarketEvent): TurnOptions {
  const scenario = getScenario(game.scenarioId)
  const eventTable = getEventTable(scenario.eventTableId)
  const event = eventOverride ?? drawEvent(eventTable, game.seed, game.current.turn)
  const nextMaterialIndex = materialIndexNext(
    game.current.materialIndex,
    scenario.params,
    game.seed,
    game.current.turn,
  )
  const comp = competitorAt(scenario.params, game.seed, game.current.turn)
  const ourQuality = companyQuality(game)
  // 競合を買収済みならシェアの取り合いは消滅（乗数1）。ブースト分はエンジン側 companyDemandMultiplier が担う。
  const demandShareMultiplier = game.current.acquiredCompetitor
    ? 1
    : shareMultiplier(decision.unitPrice, ourQuality, comp, scenario.params)
  // IPO のバリュエーション（直近1年の純利益×PER）。履歴の集計が要るためここで注入する（決定論・プレビューも同値）。
  const ppy = scenario.params.periodsPerYear ?? 1
  const annualNetIncome = game.history.slice(-ppy).reduce((s, h) => s + h.incomeStatement.netIncome, 0)
  return {
    demandMultiplier: event.demandMultiplier,
    nextMaterialIndex,
    oneOffLoss: event.oneOffLoss,
    equipmentLoss: event.equipmentLoss,
    oneOffLossRevenueRatio: event.oneOffLossRevenueRatio,
    oneOffLossProfitRatio: event.oneOffLossProfitRatio,
    oneOffLossCapRatio: event.oneOffLossCapRatio,
    equipmentLossRatio: event.equipmentLossRatio,
    demandShareMultiplier,
    policyRate: game.macro.policyRate,
    inflationIndex: game.macro.inflationIndex,
    macroDemandMultiplier: cycleDemandMultiplier(game.macro),
    ipoValuation: ipoValuation(annualNetIncome, scenario.params.earningsMultiple ?? 0),
  }
}

/** 確定前のゴースト計算（コミットせず、この判断の見込み結果を返す）。需要ブレ無し＝中心値。 */
export function previewTurn(game: GameState, decision: Decision): TurnResult {
  const scenario = getScenario(game.scenarioId)
  return resolveTurn(game.current, decision, scenario.params, turnOptionsFor(game, decision))
}

/** 確定時のみ適用する隠れた需要ブレ乗数（決定論だがプレビューには出さない）。 */
function demandNoiseFor(game: GameState): number {
  const sigma = getScenario(game.scenarioId).params.demandNoise ?? 0
  if (sigma <= 0) return 1
  return 1 + (hashUnit(game.seed ^ 0x2b3c4d, game.current.turn) * 2 - 1) * sigma
}

/** 確定時のみ適用するショック毀損度（軽微〜大破）。決定論だがプレビューは中心値（=1）。 */
function lossSeverityFor(game: GameState): number {
  const scenario = getScenario(game.scenarioId)
  const event = drawEvent(getEventTable(scenario.eventTableId), game.seed, game.current.turn)
  const range = event.lossSeverityRange
  if (!range) return 1
  const [lo, hi] = range
  // demandNoise(0x2b3c4d) とは別ソルトで相関を避ける。
  return lo + (hi - lo) * hashUnit(game.seed ^ 0x5e7a17, game.current.turn)
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

/** 設備故障が「引かれた」期の発火率（整備状態 condition が高いほど低い）。未設定で 1＝常に発火。 */
function breakdownFireRate(game: GameState): number {
  const p = getScenario(game.scenarioId).params
  if (p.breakdownBaseRate == null) return 1
  const condition = game.current.condition ?? 1
  return clamp01(p.breakdownBaseRate * (1 - (p.conditionShield ?? 0) * condition))
}

/**
 * 全社の製品品質＝**最弱ラインの品質**（複数製品時）。
 * 弱い製品が1つでもあるとリコールリスクとブランドはそこに引きずられる、という学び。単一製品は従来どおり。
 */
function companyQuality(game: GameState): number {
  const p = getScenario(game.scenarioId).params
  // ライン構成は composeLineDefs が唯一のソース（商材開発でローンチした新ラインも含めて品質を見る）。
  const defs = composeLineDefs(p, game.current, game.current.turn)
  if (defs.length > 1 && game.current.lines?.length) {
    return Math.min(
      ...defs.map((lp, i) =>
        productFromRd(game.current.lines?.[i]?.rdStock ?? 0, {
          ...p,
          rdCostReductionMax: lp.rdCostReductionMax ?? p.rdCostReductionMax,
          rdDemandBoostMax: lp.rdDemandBoostMax ?? p.rdDemandBoostMax,
          rdHalf: lp.rdHalf ?? p.rdHalf,
        }).demandModifier,
      ),
    )
  }
  return productFromRd(game.current.rdStock, p).demandModifier
}

/** リコールが「引かれた」期の発火率（製品品質が高いほど低い。複数製品は最弱ライン基準）。未設定で 1＝常に発火。 */
function recallFireRate(game: GameState): number {
  const p = getScenario(game.scenarioId).params
  if (p.recallBaseRate == null) return 1
  const quality = companyQuality(game)
  const qExcess = p.rdDemandBoostMax > 0 ? clamp01((quality - 1) / p.rdDemandBoostMax) : 0
  return clamp01(p.recallBaseRate * (1 - (p.recallQualityShield ?? 0) * qExcess))
}

/** 確定時の隠れ発火ロール（発生率しだいで発火/回避）。非ショックは常に発火（影響そのまま）。 */
function shockFired(game: GameState, event: MarketEvent): boolean {
  if (event.id === 'breakdown')
    return hashUnit(game.seed ^ 0xb1d00d, game.current.turn) < breakdownFireRate(game)
  if (event.id === 'recall')
    return hashUnit(game.seed ^ 0x4eca11, game.current.turn) < recallFireRate(game)
  return true
}

/** 回避された（発火しなかった）ショックの実効イベント＝影響なしの平常扱い（履歴ラベルは「回避」）。 */
function avertedEvent(event: MarketEvent): MarketEvent {
  return {
    id: event.id,
    label: `${event.label}（回避）`,
    description: `${event.description.replace(/。$/, '')}が、保全・品質により回避できた。`,
    demandMultiplier: 1,
  }
}

/**
 * 次の期のショックリスク（UI 表示用）。breakdown/品質連動の recall のとき発生確率%を返す。
 * リスク機構が無効（base rate 未設定）なら null（＝確定告知の従来挙動）。
 */
export function shockRiskFor(game: GameState): { kind: 'breakdown' | 'recall'; ratePct: number } | null {
  const scenario = getScenario(game.scenarioId)
  const event = drawEvent(getEventTable(scenario.eventTableId), game.seed, game.current.turn)
  if (event.id === 'breakdown' && scenario.params.breakdownBaseRate != null)
    return { kind: 'breakdown', ratePct: Math.round(breakdownFireRate(game) * 100) }
  if (event.id === 'recall' && scenario.params.recallBaseRate != null)
    return { kind: 'recall', ratePct: Math.round(recallFireRate(game) * 100) }
  return null
}

/**
 * 1ターン進める純粋関数（reducer の 'play' 本体）。React 非依存なのでヘッドレスのシミュレーション
 * （バランス診断）からも再利用できる。終了済みならそのまま返す。
 */
export function advanceTurn(game: GameState, decision: Decision): GameState {
  if (game.outcome !== 'playing') return game
  const scenario = getScenario(game.scenarioId)
  const eventTable = getEventTable(scenario.eventTableId)
  const drawn = drawEvent(eventTable, game.seed, game.current.turn)
  // ショックの発火判定（保全/品質で発生率↓）。回避なら影響なしの実効イベントに差し替え。
  const event = shockFired(game, drawn) ? drawn : avertedEvent(drawn)
  const result = resolveTurn(game.current, decision, scenario.params, {
    ...turnOptionsFor(game, decision, event),
    demandNoise: demandNoiseFor(game), // 確定時のみ需要ブレを適用（プレビューには出さない）
    lossSeverity: lossSeverityFor(game), // 確定時のみショック毀損度を適用（プレビューは中心値）
  })
  const nextMacro = advanceMacro(game.macro, scenario.params, game.seed, game.current.turn)
  const record: TurnRecord = {
    turn: result.state.turn,
    event,
    decision,
    unitsSold: result.unitsSold,
    effectiveUnitCost: result.effectiveUnitCost,
    dividendPaid: result.dividendPaid > 0 ? result.dividendPaid : undefined,
    incomeStatement: result.incomeStatement,
    cashFlow: result.cashFlow,
    ratios: computeRatios(result.state.balanceSheet, result.incomeStatement),
    stateAfter: result.state,
  }

  const bankrupt = isBankrupt(result.state)
  let milestoneLevel = game.milestoneLevel ?? 0
  let goalStatus = evalGoal(game.scenarioId, result.state, game.mode, milestoneLevel)
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
    // エンドレス: 目標達成はマイルストーン（継続）。equityTarget は達成のたび目標を倍にして次を出す。
    if (goalStatus && goalStatus.status === 'won') {
      goalAchieved = true
      milestoneLevel += 1
      goalStatus = evalGoal(game.scenarioId, result.state, game.mode, milestoneLevel) ?? goalStatus
    }
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
    milestoneLevel: milestoneLevel > 0 ? milestoneLevel : game.milestoneLevel,
  }
}

function reducer(game: GameState, action: Action): GameState {
  switch (action.type) {
    case 'select':
      return makeInitial(action.scenarioId, game.seed, game.mode)
    case 'setMode':
      return makeInitial(game.scenarioId, game.seed, action.mode)
    case 'newGame':
      return makeInitial(action.scenarioId, action.seed, action.mode)
    case 'reset':
      return makeInitial(game.scenarioId, game.seed, game.mode)
    case 'play':
      return advanceTurn(game, action.decision)
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
  const newGame = useCallback(
    (scenarioId: string, mode: GameMode, seed: number) =>
      dispatch({ type: 'newGame', scenarioId, mode, seed }),
    [],
  )

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
    newGame,
    scenarios: AVAILABLE_SCENARIOS,
    modes: GAME_MODES,
    upcomingEvent,
  }
}
