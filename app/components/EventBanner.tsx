import type { MarketEvent } from '@core/index'
import { pct, yen } from '../format'

/** 次の期に発生する市況イベントの告知（需要乗数・突発ショック）。 */
export function EventBanner({
  event,
  insuranceCoverage = 0,
}: {
  event: MarketEvent
  /** 現在の保険料での補償率（0..1）。ショック時の自己負担表示に使う。 */
  insuranceCoverage?: number
}) {
  const delta = event.demandMultiplier - 1
  const shockLoss = (event.oneOffLoss ?? 0) + (event.equipmentLoss ?? 0)
  const hasShock = shockLoss > 0
  const tone = hasShock || delta < 0 ? 'bad' : delta > 0 ? 'good' : 'neutral'

  const effects: string[] = []
  if (delta > 0) effects.push('需要 +' + pct(delta))
  else if (delta < 0) effects.push('需要 −' + pct(-delta))
  if (event.oneOffLoss) effects.push('一時損失 ' + yen(event.oneOffLoss))
  if (event.equipmentLoss) effects.push('設備毀損 ' + yen(event.equipmentLoss))
  if (effects.length === 0) effects.push('影響なし')

  // ショック損失のうち、現在の保険料で肩代わりされる額と自己負担。
  const selfBurden = Math.round((1 - insuranceCoverage) * shockLoss)
  const covered = shockLoss - selfBurden

  return (
    <div className={`event ${tone}`}>
      <span className="event-label">今期の市況: {event.label}</span>
      <span className="event-desc">
        {event.description}（{effects.join('・')}）
        {hasShock &&
          (insuranceCoverage > 0 ? (
            <span className="muted small">
              {' '}
              ※保険補償率 {pct(insuranceCoverage)} → 自己負担 {yen(selfBurden)}（保険が {yen(covered)} 肩代わり）
            </span>
          ) : (
            <span className="muted small"> ※保険未加入＝全額自己負担。保険料を払うと損失を肩代わり</span>
          ))}
      </span>
    </div>
  )
}
