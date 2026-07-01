import { BADGES } from '../badges'

/** 達成バッジ（実績）の一覧。獲得済みは色付き、未獲得は鍵アイコン。 */
export function BadgesPanel({ earned }: { earned: Set<string> }) {
  const count = BADGES.filter((b) => earned.has(b.id)).length
  return (
    <section className="panel">
      <h2>
        🏅 実績（{count}/{BADGES.length}）
      </h2>
      <div className="badges">
        {BADGES.map((b) => {
          const got = earned.has(b.id)
          return (
            <div key={b.id} className={`badge ${got ? 'got' : 'locked'}`}>
              <div className="badge-emoji">{got ? b.emoji : '🔒'}</div>
              <div className="badge-label">{b.label}</div>
              <div className="badge-desc muted small">{b.desc}</div>
            </div>
          )
        })}
      </div>
      <p className="muted small">実績はシナリオをまたいで蓄積されます（このブラウザ内に保存）。</p>
    </section>
  )
}
