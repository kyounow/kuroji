import type { CompanyState } from '@core/types'

/**
 * 1つのシナリオ（初期条件＋市況パラメータ）。
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
  /** 市況パラメータ（Phase 2 で需要・コストモデルに利用） */
  market: MarketParams
}

/** 市況パラメータ（Phase 2 で拡充）。 */
export interface MarketParams {
  /** 基準需要（価格が basePrice のときの販売数量） */
  baseDemand: number
  /** 基準価格 */
  basePrice: number
  /** 価格弾力性（価格1%上昇あたりの需要減少率の目安） */
  priceElasticity: number
  /** 1個あたり変動費（仕入原価） */
  unitVariableCost: number
  /** 法人税の実効税率（暫定フラット。Phase 2 で出典付きテーブル化） */
  effectiveTaxRate: number
}
