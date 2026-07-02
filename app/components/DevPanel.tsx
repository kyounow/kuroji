import type { DevProject } from '@core/index'
import { useGameView } from '../GameViewContext'
import { InfoTip } from './Glossary'
import { yen, pct } from '../format'

/** プロジェクトの種別・会計処理・寿命の説明ラベル。 */
function projectMeta(p: DevProject, targetName?: string): string[] {
  const meta: string[] = []
  meta.push(p.kind === 'new' ? `新商材（新しいラインが増える）` : `改良（対象: ${targetName ?? p.targetLineId}）`)
  meta.push(
    p.capitalize
      ? `資産計上→年${pct(p.amortRate ?? 0)}で償却`
      : '費用処理（その期の販管費）',
  )
  if (p.lifecycle === 'decay') meta.push(`陳腐化 年${pct(p.obsolescenceRate ?? 0)}`)
  if (p.lifecycle === 'permanent') meta.push('効果は恒久')
  if (p.lifecycle === 'seasonal') meta.push(`効果は${p.boostDuration ?? 0}ヶ月限定`)
  return meta
}

/** 商材開発パネル: 開発可能／進行中／稼働中のプロジェクトと当期投資の入力。 */
export function DevPanel() {
  const v = useGameView()
  const { game, scenario, decision, patch, gameOver, preview } = v
  const projects = scenario.params.devProjects ?? []
  if (projects.length === 0) return null
  const wip = game.current.devInProgress ?? []
  const launched = game.current.devLaunched ?? []
  const lineName = (id?: string) => v.lineDefs.find((l) => l.id === id)?.name

  const setSpend = (pid: string, value: number) => {
    patch({ devSpend: { ...decision.devSpend, [pid]: Math.max(0, value) } })
  }

  return (
    <section className="panel">
      <h2>
        🧪 商材開発 <InfoTip term="開発費の資産計上" />
      </h2>
      {launched
        .filter((d) => d.launchedTurn === game.current.turn)
        .map((d) => {
          const p = projects.find((x) => x.id === d.projectId)
          return (
            <div key={d.projectId} className="kuroji-note small">
              🎉 <strong>{p?.name ?? d.projectId} が完成！</strong>{' '}
              {p?.kind === 'new' ? '今月から新しいラインとして販売できます。' : '今月から効果が発動しています。'}
            </div>
          )
        })}
      <div className="dev-projects">
        {projects.map((p) => {
          const w = wip.find((x) => x.projectId === p.id)
          const done = launched.find((x) => x.projectId === p.id)
          const invested = w?.invested ?? (done ? p.requiredInvestment : 0)
          const progress = Math.min(1, invested / p.requiredInvestment)
          const spend = decision.devSpend?.[p.id] ?? 0
          const meta = projectMeta(p, lineName(p.targetLineId))
          const elapsed = w ? game.current.turn - w.startedTurn : 0
          const sinceLaunch = done ? game.current.turn - done.launchedTurn : 0
          const seasonalLeft =
            done && p.lifecycle === 'seasonal' ? Math.max(0, (p.boostDuration ?? 0) - sinceLaunch) : null
          return (
            <div key={p.id} className={`dev-card ${done ? 'done' : w ? 'wip' : ''}`}>
              <div className="dev-head">
                <strong>{p.name}</strong>
                <span className="muted small">{meta.join('・')}</span>
              </div>
              {p.description && <p className="muted small">{p.description}</p>}
              {done ? (
                <p className="small">
                  ✅ 稼働中
                  {p.capitalize && done.bookValue > 0 && <>（無形資産の残存簿価 {yen(done.bookValue)}・毎期償却中）</>}
                  {p.capitalize && done.bookValue === 0 && <>（償却完了）</>}
                  {seasonalLeft != null && (seasonalLeft > 0 ? <>（効果 残り{seasonalLeft}ヶ月）</> : <>（期間終了）</>)}
                </p>
              ) : (
                <>
                  <div className="goal-bar dev-bar">
                    <div className="goal-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                  <p className="muted small">
                    投資 {yen(invested)} / {yen(p.requiredInvestment)}
                    {w && <>・開発 {elapsed + 1}ヶ月目（最短{p.minTurns}ヶ月）</>}
                    {!w && <>・最短{p.minTurns}ヶ月</>}
                  </p>
                  <label className="field">
                    <span className="field-label">今期の開発投資</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={10_000}
                      value={spend === 0 ? '' : spend}
                      placeholder="0"
                      disabled={gameOver}
                      onChange={(e) => setSpend(p.id, Number(e.target.value) || 0)}
                    />
                    <span className="field-hint">
                      {p.capitalize
                        ? '資産計上＝現金は減るが費用にならない（完成後に償却）'
                        : '費用処理＝その期の販管費になる'}
                    </span>
                  </label>
                </>
              )}
            </div>
          )
        })}
      </div>
      {(preview.devCapitalized > 0 || preview.devExpensed > 0) && (
        <p className="muted small">
          今期の見込み: 資産計上 {yen(preview.devCapitalized)}・費用処理 {yen(preview.devExpensed)}
          {preview.launchedProjectIds.length > 0 && <>・🎉 今期末に完成予定！</>}
        </p>
      )}
    </section>
  )
}
