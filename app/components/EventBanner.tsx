import type { MarketEvent } from '@core/index'
import { pct, yen } from '../format'

/** 次の期に発生する市況イベントの告知（需要乗数・突発ショック）。 */
export function EventBanner({
  event,
  insuranceCoverage = 0,
  shockOneOffLoss,
  shockEquipmentWritedown,
  shockRisk,
}: {
  event: MarketEvent
  /** 現在の保険料での補償率（0..1）。ショック時の自己負担表示に使う。 */
  insuranceCoverage?: number
  /** 当期の見込み一時損失（preview 由来・規模連動）。未指定ならイベントの固定額にフォールバック。 */
  shockOneOffLoss?: number
  /** 当期の見込み設備毀損（preview 由来・規模連動）。未指定ならイベントの固定額にフォールバック。 */
  shockEquipmentWritedown?: number
  /** ショックの発生確率リスク（保全/品質で低下）。null なら確定告知（従来）。 */
  shockRisk?: { kind: 'breakdown' | 'recall'; ratePct: number } | null
}) {
  const delta = event.demandMultiplier - 1
  // 規模連動の見込み額（preview）優先。無ければイベント定義の固定額にフォールバック（後方互換）。
  const oneOff = shockOneOffLoss ?? event.oneOffLoss ?? 0
  const equip = shockEquipmentWritedown ?? event.equipmentLoss ?? 0
  const shockLoss = oneOff + equip
  const hasShock = shockLoss > 0
  const scaled = shockOneOffLoss != null || shockEquipmentWritedown != null
  const approx = scaled ? '約 ' : ''
  const tone = hasShock || delta < 0 ? 'bad' : delta > 0 ? 'good' : 'neutral'

  const effects: string[] = []
  if (delta > 0) effects.push('需要 +' + pct(delta))
  else if (delta < 0) effects.push('需要 −' + pct(-delta))
  if (oneOff > 0) effects.push('一時損失 ' + approx + yen(oneOff))
  if (equip > 0) effects.push('設備毀損 ' + approx + yen(equip))
  if (effects.length === 0) effects.push('影響なし')

  // ショック損失のうち、現在の保険料で肩代わりされる額と自己負担。
  const selfBurden = Math.round((1 - insuranceCoverage) * shockLoss)
  const covered = shockLoss - selfBurden

  const riskLever = shockRisk?.kind === 'breakdown' ? '保全水準' : '製品品質'

  return (
    <div className={`event ${tone}`}>
      <span className="event-label">
        今期の市況: {event.label}
        {shockRisk && (
          <span className="risk-badge">
            発生確率 約{shockRisk.ratePct}%（{riskLever}で低下）
          </span>
        )}
      </span>
      <span className="event-desc">
        {event.description}（{effects.join('・')}）
        {hasShock && (
          <>
            {shockRisk && (
              <span className="muted small"> ※発火した場合の見込み損失です。{riskLever}を高めると発生しにくくなります。</span>
            )}
            {insuranceCoverage > 0 ? (
              <span className="muted small">
                {' '}
                ※保険補償率 {pct(insuranceCoverage)} → 自己負担 {approx}
                {yen(selfBurden)}（保険が {approx}
                {yen(covered)} 肩代わり）
              </span>
            ) : (
              <span className="muted small"> ※保険未加入＝全額自己負担。保険料を払うと損失を肩代わり</span>
            )}
            {scaled && (
              <span className="muted small"> ／ 規模・損傷度に応じた見込み額。確定時に前後します</span>
            )}
          </>
        )}
      </span>
    </div>
  )
}
