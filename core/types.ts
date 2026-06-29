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

/** 1ターンの経営判断。 */
export interface Decision {
  /** 販売価格（単価） */
  unitPrice: number
  /** 当期の生産（仕入）数量。売れ残りは在庫になる。 */
  produceUnits: number
  /** 販促費（需要を押し上げるが費用になる） */
  marketingSpend: number
  /** 設備投資額 */
  capitalExpenditure: number
  /** 新規借入額（マイナスは返済） */
  financing: number
}

/** 市況イベント（需要に乗数で作用する）。 */
export interface MarketEvent {
  id: string
  /** 表示名（日本語） */
  label: string
  /** 説明 */
  description: string
  /** 需要に掛ける乗数（1.0 で平常） */
  demandMultiplier: number
}

/** resolveTurn に渡す追加オプション（イベントなど）。 */
export interface TurnOptions {
  /** 当期の需要乗数（イベント由来。既定 1.0） */
  demandMultiplier?: number
}

/**
 * キャッシュ・フロー計算書（間接法）。1期間の現金増減の内訳。
 * cashEnd === cashBegin + operating + investing + financing が常に成立すること。
 */
export interface CashFlowStatement {
  /** 営業活動 CF（当期純利益＋減価償却 ほか非現金項目の調整） */
  operating: number
  /** 投資活動 CF（設備投資など。通常マイナス） */
  investing: number
  /** 財務活動 CF（借入＋／返済−） */
  financing: number
  /** 現金の純増減 */
  netChange: number
  /** 期首現金 */
  cashBegin: number
  /** 期末現金 */
  cashEnd: number
}

/** 1ターンを解決した結果（次の状態＋三表＋補助情報）。 */
export interface TurnResult {
  /** 期末の会社状態（次ターンの入力になる） */
  state: CompanyState
  /** 当期の損益計算書 */
  incomeStatement: IncomeStatement
  /** 当期のキャッシュ・フロー計算書 */
  cashFlow: CashFlowStatement
  /** 販売数量 */
  unitsSold: number
}

/**
 * ターン解決に使うシミュレーションのパラメータ一式（需要・コスト・財務・税）。
 * ドメイン（core）が計算に使う入力で、具体値は data 側のシナリオが供給する。
 */
export interface SimParams {
  // --- 需要 ---
  /** 基準需要（価格が basePrice のときの販売数量） */
  baseDemand: number
  /** 基準価格 */
  basePrice: number
  /** 価格弾力性（価格1%上昇あたりの需要減少率の目安） */
  priceElasticity: number

  // --- コスト ---
  /** 1個あたり変動費（仕入原価） */
  unitVariableCost: number
  /** 期間固定費（販管費の現金支出分） */
  fixedCosts: number
  /** 減価償却率（期首の固定資産簿価に対する割合） */
  depreciationRate: number

  // --- 発生主義（売掛・買掛） ---
  /** 当期売上のうち掛け売り（期末に売掛金として残る）割合 0..1 */
  salesOnCreditRatio: number
  /** 当期仕入のうち掛け仕入（期末に買掛金として残る）割合 0..1 */
  payableRatio: number

  // --- 販促 ---
  /** 販促による需要押し上げの最大率（例 0.5 = 最大+50%） */
  marketingEffect: number
  /** 効果が最大の半分になる販促費（逓減のスケール） */
  marketingHalf: number

  // --- 財務・税 ---
  /** 有利子負債（期首）に対する利率 */
  interestRate: number
  /** 法人税の実効税率（暫定フラット。のち出典付きテーブル化） */
  effectiveTaxRate: number
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
