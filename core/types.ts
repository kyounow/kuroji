// kuroji ドメイン型のたたき台（Phase 1 で確定していく）。
// 金額は円（整数）を基本とする。比率は小数（例: 0.25 = 25%）。

/** 貸借対照表（B/S）。資産 = 負債 + 純資産 が常に成立すること。 */
export interface BalanceSheet {
  /** 流動資産（現金・売掛金・棚卸資産 など） */
  currentAssets: {
    cash: number
    accountsReceivable: number
    /** 原材料の評価額（移動平均法。数量は CompanyState.materialUnits） */
    rawMaterials: number
    /** 製品の評価額（移動平均法。数量は CompanyState.finishedUnits） */
    finishedGoods: number
  }
  /** 固定資産（設備など、減価償却後の簿価） */
  fixedAssets: {
    equipment: number
    /** のれん（M&A の取得価額−受入純資産）。毎期償却。未設定は 0。 */
    goodwill?: number
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
  extraordinaryLoss: number // 特別損失（突発ショック、保険適用後の純額）
  pretaxIncome: number // 税引前当期純利益
  tax: number // 法人税等
  netIncome: number // 当期純利益
}

/** 会社の状態（ターン間で持ち越す）。 */
export interface CompanyState {
  /** 経過ターン数（会計期間の通し番号、0 始まり） */
  turn: number
  balanceSheet: BalanceSheet
  /** 原材料の数量。評価額は balanceSheet.currentAssets.rawMaterials（移動平均法）。 */
  materialUnits: number
  /** 製品の数量。評価額は balanceSheet.currentAssets.finishedGoods（移動平均法）。 */
  finishedUnits: number
  /** 原材料スポット価格の指数（1.0 = 基準）。次ターンへ持ち越す。 */
  materialIndex: number
  /** 累積の研究開発投資。製品パラメータ（製造原価・需要）を規定する。 */
  rdStock: number
  /** 設備の整備状態（0..1、1=新品同様）。保全費の累積で上がり、放置で逓減。高いほど故障の発生率が下がる。未設定は 1。 */
  condition?: number
  /** 従業員数。人件費（給与）と労働による生産能力を規定する。未設定は 0。 */
  headcount?: number
  /** 発行済株式数。増資・M&A・上場で増える。EPS・1株あたり純資産・希薄化の基準。未設定は 0。 */
  sharesOutstanding?: number
  /**
   * ゲーム開始後に増資・IPO・株式対価で調達した累積額。
   * 目標（equityTarget）は「稼いだ純資産」＝純資産−これ で判定する（資本注入で目標を買えないように）。未設定は 0。
   */
  paidInSinceStart?: number
  /** 上場済みか（IPO後 true）。上場維持コストと知名度ブーストが掛かる。未設定＝未上場。 */
  listed?: boolean
  /** 競合を買収済みか（M&A後 true）。シェア争いが消え、買収ブーストが掛かる。未設定＝未買収。 */
  acquiredCompetitor?: boolean
}

/** 研究開発の成果として変化する製品パラメータ。 */
export interface ProductState {
  /** 製造原価の倍率（1.0 = 基準。R&D で低下し、原価が下がる） */
  unitCostModifier: number
  /** 需要の倍率（1.0 = 基準。R&D で上昇し、売れやすくなる） */
  demandModifier: number
}

/** 1ターンの経営判断。 */
export interface Decision {
  /** 販売価格（単価） */
  unitPrice: number
  /** 当期の原材料の仕入数量（当期スポット価格で購入し、原材料在庫に積む）。 */
  purchaseMaterials: number
  /** 当期の生産数量。手持ち原材料が上限。製品在庫に積む。 */
  produceUnits: number
  /** 販促費（需要を押し上げるが費用になる） */
  marketingSpend: number
  /** 研究開発費（累積して製品を改良：原価↓・需要↑。費用計上） */
  rdSpend: number
  /** 保険料（毎期支払う費用。突発ショックの損失を一部ヘッジする） */
  insuranceSpend: number
  /** 保全・点検費（毎期支払う費用。予防保全で設備故障の被害を抑える） */
  maintenanceSpend: number
  /** 設備投資額 */
  capitalExpenditure: number
  /** 当期の採用人数（採用コストが一括費用。当期から労働力に算入） */
  hire: number
  /** 当期の解雇人数（退職金が一括費用。当期から労働力から除外） */
  fire: number
  /** 給与水準（％。相場＝物価連動の市場賃金＝100）。低いと人件費は下がるが離職率が上がる。 */
  wageLevel: number
  /** 増資額（株式発行。現金↑・資本金↑。無利息だが株数が増え1株価値が薄まる＝希薄化） */
  equityIssuance: number
  /** 配当（税引後利益の株主還元。利益剰余金↓・現金↓。剰余金と現金の小さい方まで） */
  dividend: number
  /** 新規借入額（マイナスは返済） */
  financing: number
  /**
   * IPO（新規上場・一度きり）。proceeds は公募での調達希望額。
   * バリュエーション（年間純利益×PER）は呼び出し側が TurnOptions.ipoValuation で注入し、
   * エンジンは 未上場・株式あり・バリュエーション>0 のときだけ実行する（不可なら無視）。
   */
  goPublic?: { proceeds: number }
  /**
   * M&A（競合の買収・一度きり）。対価は 現金＋借入＋株式 のミックス。
   * 借入は信用枠（通常の financing と合算）内、株式は BVPS>0 のときのみ有効。
   * 対価合計が受入純資産（acqTargetNetAssets）未満なら不成立（負ののれんは扱わない）。
   */
  acquire?: { cashPaid: number; debtRaised: number; stockValue: number }
}

/** 市況イベント（需要乗数のほか、突発ショックの損失を持てる）。 */
export interface MarketEvent {
  id: string
  /** 表示名（日本語） */
  label: string
  /** 説明 */
  description: string
  /** 需要に掛ける乗数（1.0 で平常） */
  demandMultiplier: number
  /** 一時的な現金損失の固定額（訴訟・リコール等。保険でヘッジ可能。規模連動時は下限 floor として作用） */
  oneOffLoss?: number
  /** 設備の毀損額の固定額（故障・災害等。簿価から控除。規模連動時は下限 floor として作用） */
  equipmentLoss?: number
  // --- 規模連動（任意。未指定なら従来の固定額のみで動作＝後方互換） ---
  /** 年換算売上（revenue×ppy）に掛ける一時損失係数（訴訟・リコール） */
  oneOffLossRevenueRatio?: number
  /** 年換算営業利益 max(0,operatingIncome)×ppy に掛ける一時損失係数（訴訟。黒字ほど賠償増） */
  oneOffLossProfitRatio?: number
  /** 一時損失の上限を年換算売上比で（暴走・一撃倒産ガード。任意） */
  oneOffLossCapRatio?: number
  /** 期首設備簿価に掛ける設備毀損係数（故障・災害） */
  equipmentLossRatio?: number
  /** 毀損度のばらつき（軽微〜大破）の決定論レンジ。未指定で [1,1]＝ばらつき無し */
  lossSeverityRange?: [number, number]
}

/** resolveTurn に渡す追加オプション（イベントなど）。 */
export interface TurnOptions {
  /** 当期の需要乗数（イベント由来。既定 1.0） */
  demandMultiplier?: number
  /** 次ターンへ持ち越す原材料スポット価格指数（既定は当期の materialIndex を維持＝変動なし）。 */
  nextMaterialIndex?: number
  /** 当期の突発ショックによる一時的現金損失（保険適用前。規模連動時は下限 floor） */
  oneOffLoss?: number
  /** 当期の突発ショックによる設備毀損額（保険適用前。規模連動時は下限 floor） */
  equipmentLoss?: number
  /** 年換算売上に掛ける一時損失係数（訴訟・リコール） */
  oneOffLossRevenueRatio?: number
  /** 年換算営業利益に掛ける一時損失係数（訴訟） */
  oneOffLossProfitRatio?: number
  /** 一時損失の年商比上限（任意の暴走ガード） */
  oneOffLossCapRatio?: number
  /** 期首設備簿価に掛ける設備毀損係数（故障・災害） */
  equipmentLossRatio?: number
  /** 当期の毀損度倍率（確定時のみ state が注入。未指定＝1で中心値＝プレビュー。demandNoise と同流儀） */
  lossSeverity?: number
  /** 競合との市場シェアに由来する需要倍率（既定 1.0） */
  demandShareMultiplier?: number
  /** 当期の政策金利（マクロ由来。実効金利＝政策金利＋スプレッド＋信用スプレッド。既定 0） */
  policyRate?: number
  /** 当期の物価指数（マクロ由来。価格・原価・固定費に作用。既定 1.0） */
  inflationIndex?: number
  /** 当期の景気局面に由来する需要倍率（既定 1.0） */
  macroDemandMultiplier?: number
  /** 当期の需要ブレ乗数（確定時のみ。プレビューは未指定＝1で中心値） */
  demandNoise?: number
  /**
   * IPO のバリュエーション（時価総額。年間純利益×PER）。履歴の集計が要るため呼び出し側が注入する。
   * 未指定/0 なら goPublic は実行されない。
   */
  ipoValuation?: number
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
  /** 当期の潜在需要（各乗数反映後・在庫上限前）。プレビューの見込み幅に使う。 */
  demand: number
  /** 当期に販売可能だった製品数量（期首在庫＋当期生産） */
  availableToSell: number
  /** 当期の原材料スポット単価（R&D・市況反映後の1個あたり仕入原価） */
  effectiveUnitCost: number
  /** 当期に適用された製品パラメータ */
  product: ProductState
  /** 当期の運転資本・棚卸の増減（間接法CFの内訳・診断に使用） */
  deltaAR: number
  deltaInventory: number
  deltaAP: number
  /** 当期に適用された信用格付け */
  creditGrade: string
  /** 当期に適用された実効金利（基準金利＋スプレッド） */
  effectiveInterestRate: number
  /** 当期に実際に適用された資金調達額（借入枠でキャップ後） */
  appliedFinancing: number
  /** 当期の保険補償率（0..1） */
  insuranceCoverage: number
  /** 当期に自主退職（待遇悪化による離職）した人数 */
  attritionQuits: number
  /** 当期に実際に支払った配当（剰余金・現金でクランプ後） */
  dividendPaid: number
  /** 当期の IPO 調達額（実行されなければ 0） */
  ipoProceeds: number
  /** 当期ののれん償却額 */
  goodwillAmortized: number
  /** 当期の買収対価合計（不成立なら 0） */
  acquisitionConsideration: number
  /** 当期に算出された一時損失（保険前 gross。floor/cap/severity 適用後。バナーの見込み額に使う） */
  shockOneOffLoss: number
  /** 当期に算出された設備毀損（保険前 gross。簿価クリップ後。バナーの見込み額に使う） */
  shockEquipmentWritedown: number
  /** 当期の生産能力（数量上限。無制限なら Infinity） */
  capacity: number
}

/**
 * ターン解決に使うシミュレーションのパラメータ一式（需要・コスト・財務・税）。
 * ドメイン（core）が計算に使う入力で、具体値は data 側のシナリオが供給する。
 */
export interface SimParams {
  // --- 期間 ---
  /** 1年あたりのターン数（4=四半期、12=月次、1=年次）。流量（需要・固定費・償却・利息）を 1/この値 にスケールする。未指定は 1。 */
  periodsPerYear?: number

  // --- 需要（年額ベース。エンジンが期間に応じてスケール） ---
  /** 基準需要（年額。価格が basePrice のときの年間販売数量） */
  baseDemand: number
  /** 基準価格 */
  basePrice: number
  /** 価格弾力性（価格1%上昇あたりの需要減少率の目安） */
  priceElasticity: number
  /** 競合の強さ（0 = 競合なし。大きいほど競合が高品質で手強い） */
  competitorStrength: number
  /** 実際の需要のブレ幅（0..。例 0.15 = ±15%）。プレビューには出さず、確定時に隠れた乱数で適用。 */
  demandNoise?: number

  // --- 設備・生産能力（設備投資の効果） ---
  /** 設備1円あたりの年間生産能力（数量）。未設定/0 は能力無制限。 */
  capacityPerEquipment?: number
  /** 設備規模による製造コストの最大低減率（規模の経済。未設定/0 で効果なし） */
  scaleEconomyMax?: number
  /** コスト低減が最大の半分になる設備規模 */
  scaleEconomyHalf?: number
  /** 表示用ラベル（業種別。既定「設備」） */
  equipmentLabel?: string
  /** 表示用ラベル（業種別。既定「生産能力」） */
  capacityLabel?: string

  // --- 人的リソース（雇用・人件費・労働による生産能力） ---
  /** 1人あたりの年間給与（人件費＝従業員数×wage）。未設定で人件費・労働制約なし（後方互換）。 */
  wage?: number
  /** 1人あたりの年間労働生産能力（数量）。これと設備能力の小さい方が当期の生産上限。未設定で労働制約なし。 */
  laborPerHead?: number
  /** 1人採用あたりの一括コスト（採用費）。未設定で 0。 */
  hireCost?: number
  /** 1人解雇あたりの一括コスト（退職金）。未設定で 0。 */
  severance?: number
  /** 自主退職: 給与水準が相場を1.0下回るごとの離職率の傾き（例 0.5＝相場の半額で離職率0.5×0.5＝25%）。未設定で離職なし。 */
  attritionSlope?: number
  /** 自主退職: 1期あたりの離職率の上限（0..1。例 0.3）。 */
  maxAttrition?: number

  // --- コスト・原材料 ---
  /** 原材料の基準単価（1製品あたり原材料1単位を消費。スポット価格の基準） */
  unitVariableCost: number
  /** 原材料スポット価格のボラティリティ（変動の大きさ 0..1 程度） */
  materialVolatility: number
  /** 原材料スポット価格の平均回帰の強さ（0..1。大きいほど1.0へ戻りやすい） */
  materialMeanReversion: number
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

  // --- 保険（突発ショックのヘッジ） ---
  /** 最大補償を得るのに必要な保険料（この額で maxInsuranceCoverage に到達） */
  insuranceRefCost: number
  /** 保険の最大補償率（0..1。例 0.8 = 損失の最大80%をヘッジ） */
  maxInsuranceCoverage: number

  // --- 保全（設備故障の予防保全） ---
  /** 最大の保全効果を得るのに必要な保全費（この額で maxMaintenanceReduction に到達。未設定で保全無効） */
  maintenanceRefCost?: number
  /** 保全による設備故障の被害の最大削減率（0..1。例 0.7 = 故障被害を最大70%軽減） */
  maxMaintenanceReduction?: number

  // --- 突発ショックの発生率（積み上げた水準で下げられる確率リスク） ---
  /** 整備状態の毎期の自然劣化（例 0.03/月）。未設定で condition 機構無効（＝従来どおり常に発火）。 */
  conditionDecay?: number
  /** 保全費が maintenanceRefCost のとき得られる整備状態の上昇（例 0.1）。 */
  conditionGainPerRefCost?: number
  /** 整備状態が満点(1)のときの設備故障発生率の削減（0..1。例 0.85 = 故障発火率を最大85%減）。 */
  conditionShield?: number
  /** 設備故障が「引かれた」ときの基準発火率（整備状態0で適用。例 1.0 = 放置なら必ず発火）。 */
  breakdownBaseRate?: number
  /** リコールが「引かれた」ときの基準発火率（品質0で適用。例 0.8）。未設定で常に発火（従来）。 */
  recallBaseRate?: number
  /** 製品品質（R&D由来）が満点のときのリコール発火率の削減（0..1。例 0.8）。 */
  recallQualityShield?: number

  // --- 研究開発（製品パラメータ） ---
  /** 累積R&Dによる製造原価の最大削減率（例 0.4 = 最大−40%） */
  rdCostReductionMax: number
  /** 累積R&Dによる需要の最大押し上げ率（例 0.5 = 最大+50%） */
  rdDemandBoostMax: number
  /** 効果が最大の半分になる累積R&D（逓減のスケール） */
  rdHalf: number

  // --- 財務・税 ---
  /** 1期に発行できる増資の上限（期首純資産に対する比率＝投資家の受け入れ枠）。未設定は 0.25。 */
  equityIssueCapRatio?: number

  // --- IPO・上場（未設定のシナリオでは上場不可） ---
  /** バリュエーションの PER（時価総額＝年間純利益×これ）。未設定で IPO 無効。 */
  earningsMultiple?: number
  /** IPO で調達できる上限（時価総額に対する比率）。未設定は 0.5。 */
  ipoMaxRaiseRatio?: number
  /** 上場維持コスト（年額。監査・IR 等。上場中は毎期 opEx に計上・物価連動） */
  listingCost?: number
  /** 上場による知名度の需要ブースト（例 0.1 = +10%。上場中ずっと） */
  listingDemandBoost?: number
  /** 上場基準: 必要純資産 */
  ipoEquityThreshold?: number
  /** 上場基準: 直近の連続黒字月数。未設定は 6。 */
  ipoProfitablePeriods?: number

  // --- M&A（競合の買収。未設定のシナリオでは買収不可） ---
  /** 買収ターゲットの受入純資産（＝受け入れる設備の簿価。対価との差がのれんになる） */
  acqTargetNetAssets?: number
  /** 買収で加わる従業員数 */
  acqTargetHeadcount?: number
  /** 買収後の需要ブースト（顧客基盤の獲得。例 0.15 = +15%。以後ずっと） */
  acqTargetDemandBoost?: number
  /** のれんの年間償却率（例 0.1 = 10年で償却） */
  goodwillAmortRate?: number

  /** 有利子負債（期首）に対する銀行スプレッド（政策金利に上乗せ） */
  interestRate: number
  /** 法人税の実効税率（暫定フラット。のち出典付きテーブル化） */
  effectiveTaxRate: number

  // --- マクロ経済（景気・インフレ・政策金利） ---
  /** 年率インフレ目標（既定 0.02）。0 で物価安定。 */
  inflationTarget?: number
  /** 中立政策金利（年率、既定 0.01） */
  policyNeutralRate?: number
  /** 景気・インフレの変動の大きさ（0 = マクロ静的） */
  macroVolatility?: number
}

/**
 * シナリオの勝利条件（ゴール）。未設定ならフリープレイ（倒産だけが負け）。
 * - equityTarget: 期限内に純資産を target 以上にする
 * - repayAll: 期限内に有利子負債を完済する
 * - survive: turns 期を倒産せず生き延びる
 */
export type Goal =
  | { kind: 'equityTarget'; label: string; target: number; withinTurns?: number }
  | { kind: 'repayAll'; label: string; withinTurns?: number }
  | { kind: 'survive'; label: string; turns: number }

/** ゴールの達成状況。 */
export interface GoalStatus {
  status: 'progress' | 'won' | 'lost'
  /** 進捗 0..1（表示用） */
  progress: number
  /** ゴールの表示名 */
  label: string
  /** 現状の補足（例: 純資産 ¥X / 目標 ¥Y、残りN期） */
  detail: string
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
