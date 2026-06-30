import { useEffect, useState } from 'react'
import type { GameMode } from '../state'

interface Choice {
  id: string
  name: string
  description?: string
}

interface Props {
  scenarios: readonly Choice[]
  modes: readonly { id: GameMode; name: string; description: string }[]
  currentScenarioId: string
  currentMode: GameMode
  /** 進行中のデータがあるか（「始める」で最初からになる旨の注意を出す）。 */
  hasProgress: boolean
  /** プレイ中はシナリオ（業種）を固定する（誤って別業種に切り替えて進行を失わないように）。 */
  scenarioLocked: boolean
  onStart: (scenarioId: string, mode: GameMode) => void
  onClose: () => void
}

/** ゲーム設定（シナリオ・モード）のポップアップ。プレイ画面から分離した開始/設定用。 */
export function SettingsModal({
  scenarios,
  modes,
  currentScenarioId,
  currentMode,
  hasProgress,
  scenarioLocked,
  onStart,
  onClose,
}: Props) {
  const [scenarioId, setScenarioId] = useState(currentScenarioId)
  const [mode, setMode] = useState<GameMode>(currentMode)
  // プレイ中はシナリオを固定。明示的に「破棄して別業種で始める」を押した時だけ解除。
  const [overrideScenario, setOverrideScenario] = useState(false)
  const scenarioEditable = !scenarioLocked || overrideScenario

  // Escape で閉じる。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="ゲーム設定"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>ゲーム設定</h2>
          <button className="ghost icon-btn" aria-label="閉じる" onClick={onClose}>
            ✕
          </button>
        </div>

        <fieldset className="choice-group">
          <legend>
            シナリオ（業種）
            {scenarioLocked && !overrideScenario && <span className="muted small"> 🔒 プレイ中は固定</span>}
          </legend>
          <div className="choice-cards">
            {scenarios.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`choice-card ${scenarioId === s.id ? 'selected' : ''}`}
                aria-pressed={scenarioId === s.id}
                disabled={!scenarioEditable && scenarioId !== s.id}
                onClick={() => scenarioEditable && setScenarioId(s.id)}
              >
                <span className="choice-name">{s.name}</span>
                {s.description && <span className="choice-desc">{s.description}</span>}
              </button>
            ))}
          </div>
          {scenarioLocked && !overrideScenario && (
            <p className="muted small lock-note">
              ゲーム開始後はシナリオ（業種）を変更できません。{' '}
              <button type="button" className="link-btn" onClick={() => setOverrideScenario(true)}>
                別の業種で新しく始める（今の経営を破棄）
              </button>
            </p>
          )}
          {overrideScenario && (
            <p className="ng small lock-note">⚠ 業種を変えると今の経営は破棄され、最初からになります。</p>
          )}
        </fieldset>

        <fieldset className="choice-group">
          <legend>モード</legend>
          <div className="choice-cards">
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`choice-card ${mode === m.id ? 'selected' : ''}`}
                aria-pressed={mode === m.id}
                onClick={() => setMode(m.id)}
              >
                <span className="choice-name">{m.name}</span>
                <span className="choice-desc">{m.description}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {hasProgress && (
          <p className="muted small modal-warn">
            ⚠ 「この設定で始める」を押すと<strong>最初から</strong>になります。今の経営を続けるには「閉じる」。
          </p>
        )}

        <div className="modal-actions">
          <button onClick={() => onStart(scenarioId, mode)}>この設定で始める ▶</button>
          <button className="ghost" onClick={onClose}>
            {hasProgress ? '閉じる（経営を続ける）' : '閉じる'}
          </button>
        </div>
      </div>
    </div>
  )
}
