import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Decision } from '@core/index'
import {
  totalEquity,
  productFromRd,
  scoreGame,
  assessCredit,
  competitorAt,
  marketShare,
  productionCapacity,
  laborCapacity,
  costEfficiency,
  canIPO,
  ipoValuation,
  composeLineDefs,
} from '@core/index'
import { useGame, previewTurn, shockRiskFor, defaultDecision } from './state'
import { EventBanner } from './components/EventBanner'
import { ScoreCard } from './components/ScoreCard'
import { SettingsModal } from './components/SettingsModal'
import { IPOModal } from './components/IPOModal'
import { AcquisitionModal } from './components/AcquisitionModal'
import { useGlossary, InfoTip } from './components/Glossary'
import { GameViewProvider, type GameView } from './GameViewContext'
import { BusinessTab } from './tabs/BusinessTab'
import { FinanceTab } from './tabs/FinanceTab'
import { MarketTab } from './tabs/MarketTab'
import { diagnoseGame } from './diagnosis'
import { earnedNow } from './badges'
import { loadBest, saveBest, wasSaveStale, loadBadges, saveBadges } from './storage'
import { yen, yenSigned, pct, num } from './format'

/** 表示タブ。事業＝経営判断、財務＝三表・指標、市況＝景気・競合。 */
type View = 'business' | 'finance' | 'market'

const VIEWS: { key: View; label: string; sub: string }[] = [
  { key: 'business', label: '🏭 事業', sub: '経営判断・予測' },
  { key: 'finance', label: '📊 財務', sub: '三表・指標・履歴' },
  { key: 'market', label: '🌐 市況', sub: '景気・競合' },
]

export function App() {
  const { game, scenario, play, reset, newGame, scenarios, modes, upcomingEvent } = useGame()
  const glossary = useGlossary()
  const gameOver = game.outcome !== 'playing'

  // ゲーム設定（シナリオ・モード）のポップアップ。新規（履歴なし）の起動時は自動で開く。
  const [settingsOpen, setSettingsOpen] = useState(
    () => game.history.length === 0 && game.current.turn === 0,
  )
  // アップデートで前回セーブが無効化された場合の告知（無言リセットを防ぐ）。
  // useGame の自動保存が上書きする前（初回レンダー）に一度だけ判定する。
  const [staleNotice, setStaleNotice] = useState(() => wasSaveStale())

  // 初回の「はじめかた」ガイド（一度閉じたら以後は出さない）。
  const [guideDismissed, setGuideDismissed] = useState(() => {
    try {
      return localStorage.getItem('kuroji.guideSeen') === '1'
    } catch {
      return false
    }
  })
  const dismissGuide = useCallback(() => {
    setGuideDismissed(true)
    try {
      localStorage.setItem('kuroji.guideSeen', '1')
    } catch {
      /* 保存不可でも続行 */
    }
  }, [])
  const currentModeName = modes.find((m) => m.id === game.mode)?.name ?? game.mode

  // 表示タブ（事業 / 財務 / 市況）。最後に見たタブを localStorage で記憶（セーブ本体とは別キー）。
  const [view, setView] = useState<View>(() => {
    try {
      const saved = localStorage.getItem('kuroji.view')
      if (saved === 'finance' || saved === 'market' || saved === 'business') return saved
    } catch {
      /* localStorage 不可なら既定 */
    }
    return 'business'
  })
  useEffect(() => {
    try {
      localStorage.setItem('kuroji.view', view)
    } catch {
      /* 保存失敗は無視 */
    }
  }, [view])

  const [decision, setDecision] = useState<Decision>(() => defaultDecision(game.scenarioId))
  const patch = useCallback((p: Partial<Decision>) => setDecision((d) => ({ ...d, ...p })), [])

  // シナリオを切り替えたら判断の初期値もそのシナリオ向けに戻す（定義は defaultDecision に一元化）。
  useEffect(() => {
    setDecision(defaultDecision(game.scenarioId))
  }, [game.scenarioId])

  // 表示中の期（既定は最新。過去の期をクリックすると切り替わる）。
  const [selectedTurn, setSelectedTurn] = useState(0)
  useEffect(() => {
    setSelectedTurn(game.history.length)
  }, [game.history.length])
  const selected = useMemo(
    () => (selectedTurn > 0 ? game.history[selectedTurn - 1] : null),
    [game.history, selectedTurn],
  )

  const equity = totalEquity(game.current.balanceSheet)
  const startEquity = totalEquity(scenario.initialState.balanceSheet)

  // 期末スコア（ゲーム終了時のみ）。
  const score = useMemo(() => {
    if (!gameOver || game.history.length === 0) return null
    return scoreGame({
      startEquity,
      endEquity: equity,
      finalRatios: game.history[game.history.length - 1].ratios,
      roeHistory: game.history.map((h) => h.ratios.roe),
      won: game.outcome === 'won',
      turnsUsed: game.current.turn,
      turnLimit: scenario.turnLimit ?? game.current.turn,
    })
  }, [gameOver, game.history, game.outcome, game.current.turn, scenario.turnLimit, startEquity, equity])

  // ベストスコア（シナリオごと）。終了時に保存。
  const [best, setBest] = useState<number | null>(null)
  useEffect(() => {
    setBest(loadBest(game.scenarioId))
  }, [game.scenarioId])
  useEffect(() => {
    if (gameOver && score) setBest(saveBest(game.scenarioId, score.total))
  }, [gameOver, score, game.scenarioId])

  // 達成バッジ（シナリオ横断で蓄積）。満たした実績を localStorage に足していく。
  const [earnedBadges, setEarnedBadges] = useState<Set<string>>(() => new Set(loadBadges()))
  useEffect(() => {
    const now = earnedNow(game)
    if (gameOver && score?.stars === 3) now.push('three-star')
    setEarnedBadges((prev) => {
      const next = new Set(prev)
      let changed = false
      for (const id of now)
        if (!next.has(id)) {
          next.add(id)
          changed = true
        }
      if (changed) saveBadges([...next])
      return changed ? next : prev
    })
  }, [game, gameOver, score])

  // 実効ライン構成（シナリオ定義＋商材開発でローンチ済みの新ライン）。UIとエンジンの唯一のソース。
  const lineDefs = useMemo(
    () => composeLineDefs(scenario.params, game.current, game.current.turn),
    [scenario.params, game],
  )

  // 現在の累積R&Dから決まる製品パラメータ（次の期に適用される）。
  const product = productFromRd(game.current.rdStock, scenario.params)
  // 当期の原材料スポット単価（市況指数 × R&D 原価改善 × 設備の規模の経済）。
  const spotCost = Math.round(
    scenario.params.unitVariableCost *
      game.current.materialIndex *
      product.unitCostModifier *
      costEfficiency(game.current.balanceSheet.fixedAssets.equipment, scenario.params),
  )

  // 信用力（格付け・実効金利・借入枠）。実効金利＝政策金利＋スプレッド＋信用スプレッド。
  const credit = assessCredit(game.current)
  const effectiveRate = game.macro.policyRate + scenario.params.interestRate + credit.spread

  // ターンの呼称（四半期 / 月次 / 年次）。
  const ppy = scenario.params.periodsPerYear ?? 1
  const yearNo = Math.floor(game.current.turn / ppy) + 1
  const subNo = (game.current.turn % ppy) + 1
  const periodHeading =
    ppy === 4
      ? `${yearNo}年目 第${subNo}四半期`
      : ppy === 12
        ? `${yearNo}年目 ${subNo}ヶ月目`
        : `第 ${game.current.turn + 1} 期`
  const unitName = ppy === 4 ? '四半期' : ppy === 12 ? 'ヶ月' : '期'

  // 生産能力＝設備能力と労働能力の小さい方（設備か人手のボトルネック）。
  const equipCapacity = productionCapacity(
    game.current.balanceSheet.fixedAssets.equipment,
    scenario.params,
    1 / ppy,
  )
  const headcount = game.current.headcount ?? 0
  const labCapacity = laborCapacity(headcount, scenario.params, 1 / ppy)
  const capacity = Math.min(equipCapacity, labCapacity)
  const hasLabor = scenario.params.wage != null
  const equipmentLabel = scenario.params.equipmentLabel ?? '設備'
  const capacityLabel = scenario.params.capacityLabel ?? '生産能力'

  // 競合・市場シェア（現在の販売価格・自社品質でのライブ試算）。
  const hasCompetitor = scenario.params.competitorStrength > 0
  const competitor = competitorAt(scenario.params, game.seed, game.current.turn)
  const ourShare = marketShare(decision.unitPrice, product.demandModifier, competitor, scenario.params)

  // 今期の確定前プレビュー（この判断の見込み結果。原価率・損益分岐の算出に使う）。
  const preview = useMemo(() => previewTurn(game, decision), [game, decision])

  // 次の期のショック発生確率リスク（保全水準/品質で低下）。
  const shockRisk = useMemo(() => shockRiskFor(game), [game])

  // 増資の1期あたり上限（投資家の受け入れ枠＝期首純資産×比率）。
  const equityIssueCap = Math.round(Math.max(0, equity) * (scenario.params.equityIssueCapRatio ?? 0.25))
  // 配当の上限（利益剰余金と現金の小さい方）。
  const dividendCap = Math.max(
    0,
    Math.min(game.current.balanceSheet.equity.retainedEarnings, game.current.balanceSheet.currentAssets.cash),
  )

  // IPO: 時価総額（直近1年の純利益×PER）・上場基準・シナリオ開放。
  const ipoVal = useMemo(() => {
    const annualNI = game.history.slice(-ppy).reduce((s, h) => s + h.incomeStatement.netIncome, 0)
    return ipoValuation(annualNI, scenario.params.earningsMultiple ?? 0)
  }, [game.history, ppy, scenario.params.earningsMultiple])
  const ipoGate = useMemo(
    () => canIPO(game.current, game.history.map((h) => h.incomeStatement.netIncome), scenario.params),
    [game, scenario.params],
  )
  const ipoAllowed = (scenario.enabledOneTimeActions ?? []).includes('ipo') && !game.current.listed
  const [ipoOpen, setIpoOpen] = useState(false)

  // M&A: シナリオ開放・未買収・ターゲット定義あり。借入対価の残枠は通常借入の入力分を除く。
  const maAllowed =
    (scenario.enabledOneTimeActions ?? []).includes('ma') &&
    !game.current.acquiredCompetitor &&
    scenario.params.acqTargetNetAssets != null
  const [maOpen, setMaOpen] = useState(false)
  const maDebtHeadroom = Math.max(0, credit.borrowLimit - Math.max(0, decision.financing))
  const maBvps =
    (game.current.sharesOutstanding ?? 0) > 0 ? equity / (game.current.sharesOutstanding ?? 1) : 0

  const warnings = useMemo(() => {
    const w: string[] = []
    // 生産希望の合計（複数製品はライン合算）と共有能力の比較。
    const totalProduce = decision.lines?.length
      ? decision.lines.reduce((s, l) => s + Math.max(0, l.produceUnits), 0)
      : decision.produceUnits
    if (Number.isFinite(preview.capacity) && totalProduce > preview.capacity) {
      w.push(`生産数量の合計 ${num(totalProduce)} が今月の生産能力 ${num(preview.capacity)} を超えています（超過分は希望比で按分されます）`)
    }
    if (decision.financing > credit.borrowLimit) {
      w.push(`借入 ${yen(decision.financing)} が借入上限 ${yen(credit.borrowLimit)} を超えています（上限まで自動で制限されます）`)
    }
    if (decision.equityIssuance > equityIssueCap) {
      w.push(`増資 ${yen(decision.equityIssuance)} は今期の発行上限 ${yen(equityIssueCap)}（投資家の受け入れ枠）を超えています（上限まで自動で制限されます）`)
    }
    if (preview.cashFlow.cashEnd < 0) {
      w.push(`この判断だと期末の現金が ${yen(preview.cashFlow.cashEnd)}（マイナス）になり、倒産の恐れがあります`)
    }
    return w
  }, [preview, decision.produceUnits, decision.lines, decision.financing, decision.equityIssuance, credit.borrowLimit, equityIssueCap])

  // 終了時の診断（なぜ勝った/負けたか＋改善点）。
  const diagnosis = useMemo(() => (gameOver ? diagnoseGame(game) : null), [gameOver, game])

  // 3タブ共通のビューモデル（Context 配布）。
  const gameView: GameView = {
    game,
    scenario,
    gameOver,
    ppy,
    decision,
    patch,
    play,
    lineDefs,
    equity,
    product,
    spotCost,
    credit,
    effectiveRate,
    capacity,
    equipCapacity,
    labCapacity,
    headcount,
    hasLabor,
    equipmentLabel,
    capacityLabel,
    preview,
    warnings,
    equityIssueCap,
    dividendCap,
    hasCompetitor,
    competitor,
    ourShare,
    ipoVal,
    ipoGate,
    ipoAllowed,
    openIpo: () => setIpoOpen(true),
    maAllowed,
    openMa: () => setMaOpen(true),
    selectedTurn,
    setSelectedTurn,
    selected,
    earnedBadges,
    guideDismissed,
    dismissGuide,
  }

  return (
    <main className="app">
      <header className="topbar">
        <div className="topbar-title">
          <h1>kuroji</h1>
          <span className="muted small">会計で学ぶ経営シミュレーション</span>
        </div>
        <div className="topbar-actions">
          <button className="ghost" onClick={() => glossary.open()}>
            📖 用語集
          </button>
          <button className="ghost" onClick={() => setSettingsOpen(true)}>
            ⚙ 設定
          </button>
          <button className="ghost" onClick={reset}>
            ↻ 最初からやり直す
          </button>
        </div>
      </header>
      <p className="lead">
        1期ずつ経営し、財務三表を見ながら<strong>純資産（黒字）を増やす</strong>のが目標。
      </p>

      {staleNotice && (
        <div className="notice">
          <span>
            ℹ️ アップデートにより、前回の途中セーブは新しい仕様に対応していないためリセットされました。
            新しいゲームとして最初から始めてください（ベストスコアは保持されています）。
          </span>
          <button className="ghost icon-btn" aria-label="この知らせを閉じる" onClick={() => setStaleNotice(false)}>
            ✕
          </button>
        </div>
      )}

      <section className="status">
        <div>
          <span className="status-num">{periodHeading}</span>
          <span className="muted">の経営判断</span>
          {game.mode === 'challenge' && scenario.turnLimit ? (
            <span className="muted small">
              （全{scenario.turnLimit}{unitName}・約{Math.round(scenario.turnLimit / ppy)}年）
            </span>
          ) : game.mode === 'endless' ? (
            <span className="muted small">（エンドレス・最大100年）</span>
          ) : null}
        </div>
        <div>
          <span className="muted">純資産</span> <span className="status-num">{yen(equity)}</span>{' '}
          <span className={equity - startEquity >= 0 ? 'ok' : 'ng'}>
            （開始比 {yenSigned(equity - startEquity)}）
          </span>
        </div>
        <div>
          <span className="muted small">信用格付</span>{' '}
          <span className={`credit-grade grade-${credit.grade}`}>{credit.grade}</span>{' '}
          <span className="muted small">金利 {pct(effectiveRate)}</span>
        </div>
        <div>
          <span className="muted small">シナリオ</span> <span>{scenario.name}</span>
          <span className="muted small"> ／ {currentModeName}</span>{' '}
          <button className="link-btn" onClick={() => setSettingsOpen(true)}>
            変更
          </button>
        </div>
      </section>

      {game.mode === 'endless' && game.goalAchieved && !gameOver && (
        <div className="gameover won">
          <strong>🏆 マイルストーン達成！</strong>{' '}
          {game.goalStatus && game.goalStatus.status !== 'won'
            ? `次の目標: ${game.goalStatus.label}。`
            : `${game.goalStatus?.label ?? ''}。`}
          このまま経営を続けられます。
        </div>
      )}

      {game.goalStatus && (
        <section className={`goal ${game.goalStatus.status}`}>
          <div className="goal-head">
            <strong>🎯 目標: {game.goalStatus.label}</strong>
            <span className="muted small">{game.goalStatus.detail}</span>
          </div>
          <div className="goal-bar">
            <div className="goal-fill" style={{ width: `${Math.round(game.goalStatus.progress * 100)}%` }} />
          </div>
        </section>
      )}

      {gameOver && (
        <div className={`gameover ${game.outcome}`}>
          {game.outcome === 'won' ? (
            <>
              <strong>🎉 目標達成・クリア！</strong> {game.goalStatus?.detail}。
              「最初からやり直す」で再挑戦、または別シナリオへ。
            </>
          ) : (
            <>
              <strong>💀 ゲームオーバー。</strong>{' '}
              {game.goalStatus?.detail ?? '現金がマイナス、または債務超過になりました'}。
              「最初からやり直す」で再挑戦できます。
            </>
          )}
        </div>
      )}

      {gameOver && diagnosis && (
        <section className="diagnosis">
          <strong className="diagnosis-head">
            📋 ふりかえり {diagnosis.term && <InfoTip term={diagnosis.term} />}
          </strong>
          <p className="diagnosis-headline">{diagnosis.headline}</p>
          <ul className="diagnosis-points">
            {diagnosis.points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>
      )}

      {gameOver && score && <ScoreCard score={score} best={best} won={game.outcome === 'won'} />}

      <EventBanner
        event={upcomingEvent}
        insuranceCoverage={preview.insuranceCoverage}
        shockOneOffLoss={preview.shockOneOffLoss}
        shockEquipmentWritedown={preview.shockEquipmentWritedown}
        shockRisk={shockRisk}
      />

      <nav
        className="viewtabs"
        role="tablist"
        aria-label="表示を切り替え"
        onKeyDown={(e) => {
          const i = VIEWS.findIndex((vw) => vw.key === view)
          let next = -1
          if (e.key === 'ArrowRight') next = (i + 1) % VIEWS.length
          else if (e.key === 'ArrowLeft') next = (i - 1 + VIEWS.length) % VIEWS.length
          else if (e.key === 'Home') next = 0
          else if (e.key === 'End') next = VIEWS.length - 1
          if (next >= 0) {
            e.preventDefault()
            setView(VIEWS[next].key)
            document.getElementById(`tab-${VIEWS[next].key}`)?.focus()
          }
        }}
      >
        {VIEWS.map((vw) => (
          <button
            key={vw.key}
            id={`tab-${vw.key}`}
            type="button"
            role="tab"
            aria-selected={view === vw.key}
            aria-controls={`panel-${vw.key}`}
            tabIndex={view === vw.key ? 0 : -1}
            className={view === vw.key ? 'on' : ''}
            onClick={() => setView(vw.key)}
          >
            {vw.label}
            <span className="viewtabs-sub">{vw.sub}</span>
          </button>
        ))}
      </nav>

      <GameViewProvider value={gameView}>
        {view === 'business' && <BusinessTab />}
        {view === 'finance' && <FinanceTab />}
        {view === 'market' && <MarketTab />}
      </GameViewProvider>

      <footer className="muted small">
        ※ 学習用の簡略モデルです。会計実務や実在企業の財務再現ではありません。 データはこのブラウザ内にのみ保存され、外部送信・追跡はありません。
        <br />
        <a
          className="foot-link"
          href="https://github.com/kyounow/kuroji/issues"
          target="_blank"
          rel="noopener noreferrer"
        >
          ご意見・不具合の報告
        </a>
        {' ・ '}© 2026 kyounow
      </footer>

      {ipoOpen && (
        <IPOModal
          valuation={ipoVal}
          sharesOutstanding={game.current.sharesOutstanding ?? 0}
          maxRaiseRatio={scenario.params.ipoMaxRaiseRatio ?? 0.5}
          listingCostAnnual={scenario.params.listingCost}
          listingDemandBoost={scenario.params.listingDemandBoost}
          gate={ipoGate}
          preview={(proceeds) => previewTurn(game, { ...decision, goPublic: { proceeds } })}
          onConfirm={(proceeds) => {
            // 拡張済みの判断を直接 play（setState 経由にしない＝stale state を踏まない）。
            play({ ...decision, goPublic: { proceeds } })
            setIpoOpen(false)
          }}
          onClose={() => setIpoOpen(false)}
        />
      )}

      {maOpen && (
        <AcquisitionModal
          targetNetAssets={scenario.params.acqTargetNetAssets ?? 0}
          targetHeadcount={scenario.params.acqTargetHeadcount ?? 0}
          demandBoost={scenario.params.acqTargetDemandBoost ?? 0}
          goodwillAmortRate={scenario.params.goodwillAmortRate ?? 0}
          debtHeadroom={maDebtHeadroom}
          stockAvailable={maBvps > 0}
          bvps={maBvps}
          cash={game.current.balanceSheet.currentAssets.cash}
          preview={(mix) => previewTurn(game, { ...decision, acquire: mix })}
          onConfirm={(mix) => {
            // 拡張済みの判断を直接 play（stale state を踏まない）。
            play({ ...decision, acquire: mix })
            setMaOpen(false)
          }}
          onClose={() => setMaOpen(false)}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          scenarios={scenarios}
          modes={modes}
          currentScenarioId={game.scenarioId}
          currentMode={game.mode}
          hasProgress={game.history.length > 0}
          scenarioLocked={game.history.length > 0 && !gameOver}
          currentSeed={game.seed}
          onStart={(scenarioId, mode, seed) => {
            newGame(scenarioId, mode, seed)
            setSettingsOpen(false)
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </main>
  )
}
