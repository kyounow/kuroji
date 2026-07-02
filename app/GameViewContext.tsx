import { createContext, useContext } from 'react'
import type { Decision, TurnResult, CreditInfo, Competitor, ProductState, IpoGate } from '@core/index'
import type { Scenario } from '@data/scenarios'
import type { GameState } from './state'

type TurnRecord = GameState['history'][number]

/**
 * 3タブ（事業/財務/市況）が必要とする派生状態を1つに束ねた「ビューモデル」。
 * App が計算して Context で配布し、各タブは useGameView() で必要な分だけ取り出す
 * （props のバケツリレーを避け、タブ内に子パネルを増やしても配線が増えない）。
 */
export interface GameView {
  // --- 基本状態 ---
  game: GameState
  scenario: Scenario
  gameOver: boolean
  ppy: number

  // --- 経営判断 ---
  decision: Decision
  patch: (p: Partial<Decision>) => void
  play: (d: Decision) => void

  // --- 派生した経済量 ---
  equity: number
  product: ProductState
  spotCost: number
  credit: CreditInfo
  effectiveRate: number
  capacity: number
  equipCapacity: number
  labCapacity: number
  headcount: number
  hasLabor: boolean
  equipmentLabel: string
  capacityLabel: string
  preview: TurnResult
  warnings: string[]
  equityIssueCap: number
  dividendCap: number

  // --- 競合・市場 ---
  hasCompetitor: boolean
  competitor: Competitor
  ourShare: number

  // --- IPO / M&A（一度きりアクション） ---
  ipoVal: number
  ipoGate: IpoGate
  ipoAllowed: boolean
  openIpo: () => void
  maAllowed: boolean
  openMa: () => void

  // --- 財務タブ ---
  selectedTurn: number
  setSelectedTurn: (n: number) => void
  selected: TurnRecord | null
  earnedBadges: Set<string>

  // --- はじめかたガイド ---
  guideDismissed: boolean
  dismissGuide: () => void
}

const GameViewContext = createContext<GameView | null>(null)

export const GameViewProvider = GameViewContext.Provider

/** タブ配下から派生ビューモデルを取り出す。 */
export function useGameView(): GameView {
  const v = useContext(GameViewContext)
  if (!v) throw new Error('useGameView は GameViewProvider の内側で使ってください')
  return v
}
