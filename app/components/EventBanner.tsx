import type { MarketEvent } from '@core/index'
import { pct, yen } from '../format'

/** 次の期に発生する市況イベントの告知（需要乗数・突発ショック）。 */
export function EventBanner({ event }: { event: MarketEvent }) {
  const delta = event.demandMultiplier - 1
  const hasShock = (event.oneOffLoss ?? 0) > 0 || (event.equipmentLoss ?? 0) > 0
  const tone = hasShock || delta < 0 ? 'bad' : delta > 0 ? 'good' : 'neutral'

  const effects: string[] = []
  if (delta > 0) effects.push('需要 +' + pct(delta))
  else if (delta < 0) effects.push('需要 −' + pct(-delta))
  if (event.oneOffLoss) effects.push('一時損失 ' + yen(event.oneOffLoss))
  if (event.equipmentLoss) effects.push('設備毀損 ' + yen(event.equipmentLoss))
  if (effects.length === 0) effects.push('影響なし')

  return (
    <div className={`event ${tone}`}>
      <span className="event-label">今期の市況: {event.label}</span>
      <span className="event-desc">
        {event.description}（{effects.join('・')}）
        {hasShock && <span className="muted small"> ※保険でヘッジ可</span>}
      </span>
    </div>
  )
}
