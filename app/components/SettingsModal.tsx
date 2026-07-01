import { useEffect, useState } from 'react'
import type { GameMode } from '../state'
import { useModalA11y } from '../useModalA11y'

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
  /** 現在のゲームの展開シード（表示・共有用）。 */
  currentSeed: number
  onStart: (scenarioId: string, mode: GameMode, seed: number) => void
  onClose: () => void
}

/** 展開シードを1つ選ぶ（決定論RNGの入力＝会計計算ではないので Math.random 可）。 */
function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000)
}

/** ゲーム設定（シナリオ・モード）のポップアップ。プレイ画面から分離した開始/設定用。 */
export function SettingsModal({
  scenarios,
  modes,
  currentScenarioId,
  currentMode,
  hasProgress,
  scenarioLocked,
  currentSeed,
  onStart,
  onClose,
}: Props) {
  const modalRef = useModalA11y<HTMLDivElement>()
  const [scenarioId, setScenarioId] = useState(currentScenarioId)
  const [mode, setMode] = useState<GameMode>(currentMode)
  // 展開シード。空欄でランダム（毎回違う市況・イベント）、数字を入れると同じ展開を再現。
  const [seedInput, setSeedInput] = useState('')
  const start = () => {
    const parsed = seedInput.trim() === '' ? NaN : Number(seedInput)
    onStart(scenarioId, mode, Number.isFinite(parsed) ? Math.floor(parsed) : randomSeed())
  }
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
        tabIndex={-1}
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>ゲーム設定</h2>
          <button className="ghost icon-btn" aria-label="閉じる" onClick={onClose}>
            ✕
          </button>
        </div>

        {!hasProgress && (
          <div className="modal-intro">
            <p className="intro-lead">会社を1期ずつ経営して、会計（BS・PL・CF）を学ぶゲームです。</p>
            <p className="muted small">
              毎期「価格・仕入・生産…」などを決めて <strong>「1期すすめる」</strong> を押すと、その判断が
              財務三表に反映されます。<strong>倒産せず純資産（黒字）を増やす</strong>のが目標。
              初めての方は下の <strong>チュートリアル</strong> から。
            </p>
          </div>
        )}

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
                <span className="choice-name">
                  {s.name}
                  {s.id === 'tutorial' && <span className="badge-rec">初めての方に</span>}
                </span>
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

        <fieldset className="choice-group">
          <legend>展開のシード（任意）</legend>
          <div className="seed-row">
            <input
              type="text"
              inputMode="numeric"
              className="seed-input"
              placeholder="空欄でランダム"
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value.replace(/[^0-9]/g, ''))}
              aria-label="展開のシード（数字。空欄でランダム）"
            />
            <button type="button" className="ghost" onClick={() => setSeedInput(String(randomSeed()))}>
              🎲 ランダム
            </button>
          </div>
          <p className="muted small">
            同じ数字＝同じ市況・イベントの展開（再現・共有できます）。空欄なら毎回ランダム。 現在の展開:{' '}
            <strong>#{currentSeed.toLocaleString('ja-JP')}</strong>
          </p>
        </fieldset>

        <p className="muted small modal-note">
          ※ 会計を学ぶための<strong>簡略化した学習用シミュレーション</strong>です（会計実務・実在企業の再現ではありません）。
          データはこのブラウザ内にのみ保存され、<strong>外部送信・追跡はありません</strong>。
        </p>

        {hasProgress && (
          <p className="muted small modal-warn">
            ⚠ 「この設定で始める」を押すと<strong>最初から</strong>になります。今の経営を続けるには「閉じる」。
          </p>
        )}

        <div className="modal-actions">
          <button onClick={start}>この設定で始める ▶</button>
          <button className="ghost" onClick={onClose}>
            {hasProgress ? '閉じる（経営を続ける）' : '閉じる'}
          </button>
        </div>
      </div>
    </div>
  )
}
