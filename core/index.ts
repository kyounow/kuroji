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
} from './types'

export { totalAssets, totalLiabilities, totalEquity, balances } from './statements/identity'
export { demandAt } from './market/demand'
export { computeRatios } from './finance/ratios'
export { resolveTurn, marketingMultiplier } from './engine/resolveTurn'
export { drawEvent } from './engine/events'
export { createRng, hashUnit } from './util/rng'
