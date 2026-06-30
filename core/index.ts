// core/ の公開 API 集約。app/ からはここ経由で参照する。
export type {
  BalanceSheet,
  IncomeStatement,
  CashFlowStatement,
  CompanyState,
  Decision,
  SimParams,
  Ratios,
  TurnResult,
  TurnOptions,
  MarketEvent,
  ProductState,
  Goal,
  GoalStatus,
} from './types'

export { totalAssets, totalLiabilities, totalEquity, balances } from './statements/identity'
export { demandAt } from './market/demand'
export { computeRatios } from './finance/ratios'
export { assessCredit, type CreditInfo, type CreditGrade } from './finance/credit'
export { productionCapacity, costEfficiency } from './finance/capacity'
export { productFromRd } from './product/research'
export { materialIndexNext } from './market/material'
export { competitorAt, shareMultiplier, marketShare, type Competitor } from './market/competitor'
export { evaluateGoal } from './goals/evaluateGoal'
export { scoreGame, type ScoreBreakdown, type ScoreInput } from './score/score'
export { resolveTurn, marketingMultiplier } from './engine/resolveTurn'
export { drawEvent } from './engine/events'
export { createRng, hashUnit } from './util/rng'
