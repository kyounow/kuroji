// kuroji ドメイン型のたたき台（Phase 1 で確定していく）。
// 金額は円（整数）を基本とする。比率は小数（例: 0.25 = 25%）。

/** 貸借対照表（B/S）。資産 = 負債 + 純資産 が常に成立すること。 */
export interface BalanceSheet {
  /** 流動資産（現金・売掛金・在庫 など） */
  currentAssets: {
    cash: number
    accountsReceivable: number
    inventory: number
  }
  /** 固定資産（設備など、減価償却後の簿価） */
  fixedAssets: {
    equipment: number
  }
  /** 流動負債（買掛金・短期借入 など） */
  currentLiabilities: {
    accountsPayable: number
    shortTermDebt: number
  }
  /** 固定負債（長期借入 など） */
  nonCurrentLiabilities: {
    longTermDebt: number
  }
  /** 純資産（資本金・利益剰余金） */
  equity: {
    capitalStock: number
    retainedEarnings: number
  }
}

/** 損益計算書（P/L）。1期間（1ターン）の経営成績。 */
export interface IncomeStatement {
  revenue: number // 売上高
  costOfGoodsSold: number // 売上原価
  grossProfit: number // 売上総利益（粗利）
  operatingExpenses: number // 販売費及び一般管理費
  operatingIncome: number // 営業利益
  interestExpense: number // 支払利息
  pretaxIncome: number // 税引前当期純利益
  tax: number // 法人税等
  netIncome: number // 当期純利益
}

/** 会社の状態（ターン間で持ち越す）。 */
export interface CompanyState {
  /** 経過ターン数（会計期間の通し番号、0 始まり） */
  turn: number
  balanceSheet: BalanceSheet
}

/** 1ターンの経営判断（Phase 2 で拡充）。 */
export interface Decision {
  /** 設備投資額 */
  capitalExpenditure: number
  /** 販売価格（単価） */
  unitPrice: number
  /** 新規借入額（マイナスは返済） */
  financing: number
}

/** 主要な経営指標（Phase 1 で計算関数を実装）。 */
export interface Ratios {
  currentRatio: number // 流動比率
  equityRatio: number // 自己資本比率
  roe: number // 自己資本利益率
  roa: number // 総資産利益率
  grossMargin: number // 売上総利益率
  operatingMargin: number // 営業利益率
}
