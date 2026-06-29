import type { MarketEvent } from '@core/index'
import { pct } from '../format'

/** 次の期に発生する市況イベントの告知。 */
export function EventBanner({ event }: { event: MarketEvent }) {
  const delta = event.demandMultiplier - 1
  const tone = delta > 0 ? 'good' : delta < 0 ? 'bad' : 'neutral'
  const sign = delta > 0 ? '需要 +' + pct(delta) : delta < 0 ? '需要 −' + pct(-delta) : '影響なし'

  return (
    <div className={`event ${tone}`}>
      <span className="event-label">今期の市況: {event.label}</span>
      <span className="event-desc">
        {event.description}（{sign}）
      </span>
    </div>
  )
}
