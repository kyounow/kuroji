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

function Bar({ label, value, comment }: { label: string; value: number; comment: string }) {
  return (
    <div className="score-row">
      <span className="score-label">{label}</span>
      <span className="score-bar">
        <span className="score-fill" style={{ width: `${(value / 25) * 100}%` }} />
      </span>
      <span className="score-num">{value}/25</span>
      <span className="score-comment muted small">{comment}</span>
    </div>
  )
}

/** 軸の点数(0-25)に応じた短評。 */
function tip(kind: 'growth' | 'safety' | 'efficiency' | 'speed', v: number): string {
  const tier = v >= 20 ? 'hi' : v >= 10 ? 'mid' : 'lo'
  const table = {
    growth: {
      hi: '純資産をしっかり伸ばせました。',
      mid: '成長は及第点。販促・R&D・設備投資でさらに伸ばせます。',
      lo: '純資産の伸びが小さめ。需要と生産能力を広げる投資を。',
    },
    safety: {
      hi: '財務はとても健全です。',
      mid: '安全性はまずまず。自己資本比率・流動比率を意識して。',
      lo: '財務が薄め。借入を抑え内部留保を厚くしましょう。',
    },
    efficiency: {
      hi: '資本効率（ROE）が高い経営でした。',
      mid: 'ROEは平均的。利益率を高める余地があります。',
      lo: 'ROEが低め。利益率を上げるか、資本を寝かせない工夫を。',
    },
    speed: {
      hi: '短期間で達成できました。',
      mid: 'ペースは標準的です。',
      lo: '達成に時間がかかりました。早期の投資で加速を。',
    },
  } as const
  return table[kind][tier]
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
        <Bar label="純資産の成長" value={score.growth} comment={tip('growth', score.growth)} />
        <Bar label="安全性" value={score.safety} comment={tip('safety', score.safety)} />
        <Bar label="資本効率（ROE）" value={score.efficiency} comment={tip('efficiency', score.efficiency)} />
        <Bar label="達成速度" value={score.speed} comment={tip('speed', score.speed)} />
      </div>
      <p className="muted small">
        ベスト{best !== null ? ` ${best}点` : ' —'}
        {isNewBest && <span className="ok"> 🎉 自己ベスト更新！</span>}
      </p>
    </section>
  )
}
