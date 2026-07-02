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
  ProductLineParams,
  ProductLineState,
  LineDecision,
  LineResult,
  DevProject,
  DevInProgress,
  DevLaunched,
  Employee,
  EmployeeRole,
  GradeParams,
  HrParams,
  Goal,
  GoalStatus,
} from './types'

export { totalAssets, totalLiabilities, totalEquity, balances } from './statements/identity'
export { demandAt } from './market/demand'
export { computeRatios } from './finance/ratios'
export { assessCredit, type CreditInfo, type CreditGrade } from './finance/credit'
export { productionCapacity, laborCapacity, costEfficiency } from './finance/capacity'
export { breakEven, type BreakEven } from './finance/breakeven'
export { bookValuePerShare, sharesIssued, earningsPerShare } from './finance/shares'
export { ipoValuation, ipoOfferPrice, canIPO, type IpoGate } from './finance/ipo'
export { productFromRd } from './product/research'
export { composeLineDefs, devLifecycleFactor, findDevProject, developmentAssetOf } from './product/dev'
export {
  calcSkill,
  moraleFactor,
  synthesizeEmployees,
  nextEmployeeId,
  hrLaborCapacityPerYear,
  avgMorale,
  avgSkill,
  selectLeavers,
  updateEmployeesEndOfTurn,
} from './hr/hr'
export { materialIndexNext } from './market/material'
export { competitorAt, shareMultiplier, marketShare, type Competitor } from './market/competitor'
export {
  initialMacro,
  advanceMacro,
  cycleDemandMultiplier,
  type MacroState,
  type MacroPhase,
} from './macro/macro'
export { evaluateGoal } from './goals/evaluateGoal'
export { scoreGame, type ScoreBreakdown, type ScoreInput } from './score/score'
export { resolveTurn, marketingMultiplier } from './engine/resolveTurn'
export { drawEvent } from './engine/events'
export { createRng, hashUnit } from './util/rng'
