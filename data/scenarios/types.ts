import type { CompanyState, SimParams } from '@core/types'

// SimParams はドメイン（core）が定義する計算入力。シナリオはその具体値を供給する。
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
}
