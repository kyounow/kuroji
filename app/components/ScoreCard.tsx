import type { ScoreBreakdown } from '@core/index'

interface Props {
  score: ScoreBreakdown
  best: number | null
  won: boolean
}

function Stars({ n }: { n: number }) {
  return (
    <span className="stars" aria-label={`星${n}`}>
      {'★'.repeat(n)}
      <span className="stars-dim">{'★'.repeat(3 - n)}</span>
    </span>
  )
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-row">
      <span className="score-label">{label}</span>
      <span className="score-bar">
        <span className="score-fill" style={{ width: `${(value / 25) * 100}%` }} />
      </span>
      <span className="score-num">{value}/25</span>
    </div>
  )
}

/** 期末スコアの内訳と星、ベストスコア。 */
export function ScoreCard({ score, best, won }: Props) {
  const isNewBest = best !== null && score.total >= best
  return (
    <section className="panel scorecard">
      <div className="score-head">
        <h2>{won ? 'クリア成績' : '今回の成績'}</h2>
        <div className="score-total">
          <Stars n={score.stars} />
          <span className="status-num">{score.total}点</span>
        </div>
      </div>
      <div className="score-bars">
        <Bar label="純資産の成長" value={score.growth} />
        <Bar label="安全性" value={score.safety} />
        <Bar label="資本効率（ROE）" value={score.efficiency} />
        <Bar label="達成速度" value={score.speed} />
      </div>
      <p className="muted small">
        ベスト{best !== null ? ` ${best}点` : ' —'}
        {isNewBest && <span className="ok"> 🎉 自己ベスト更新！</span>}
      </p>
    </section>
  )
}
