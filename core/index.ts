// core/ の公開 API 集約。app/ からはここ経由で参照する。
export type {
  BalanceSheet,
  IncomeStatement,
  CompanyState,
  Decision,
  Ratios,
} from './types'

export { totalAssets, totalLiabilities, totalEquity, balances } from './statements/identity'
