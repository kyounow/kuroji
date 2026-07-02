import type { CompanyState, SimParams, Goal } from '@core/types'

// SimParams/Goal はドメイン（core）が定義する。シナリオはその具体値を供給する。
export type { SimParams } from '@core/types'

/**
 * 1つのシナリオ（初期条件＋シミュレーションのパラメータ）。
 * 難易度や舞台設定の違いはシナリオの差し替えで表現する。
 */
export interface Scenario {
  id: string
  /** 表示名（日本語） */
  name: string
  /** 概要説明 */
  description: string
  /** ゲーム開始時の会社状態 */
  initialState: CompanyState
  /** シミュレーションのパラメータ（需要・コスト・財務・税） */
  params: SimParams
  /** 使用する市況イベントテーブル ID（未指定は 'default'） */
  eventTableId?: string
  /** 勝利条件（未指定はフリープレイ） */
  goal?: Goal
  /** 固定期数（この期で終了しスコア確定。未指定は無制限） */
  turnLimit?: number
  /** 操作可能にする判断フィールド（チュートリアル用。未指定は全て可） */
  enabledDecisions?: DecisionField[]
  /** 開放する一度きりのアクション（IPO・M&A）。未指定はどちらも不可。 */
  enabledOneTimeActions?: OneTimeAction[]
}

/** 一度きりのアクション（モーダル＋確認で実行するもの）。 */
export type OneTimeAction = 'ipo' | 'ma'

/** 判断フィールドの識別子（チュートリアルの段階開放に使用）。 */
export type DecisionField =
  | 'unitPrice'
  | 'purchaseMaterials'
  | 'produceUnits'
  | 'marketingSpend'
  | 'rdSpend'
  | 'insuranceSpend'
  | 'maintenanceSpend'
  | 'capitalExpenditure'
  | 'hire'
  | 'fire'
  | 'wageLevel'
  | 'equityIssuance'
  | 'dividend'
  | 'financing'
