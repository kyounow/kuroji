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
} from '@core/index'
import { useGame, previewTurn, shockRiskFor } from './state'
import { EventBanner } from './components/EventBanner'
import { DecisionPanel } from './components/DecisionPanel'
import { StatementsView } from './components/StatementsView'
import { RatiosView } from './components/RatiosView'
import { HistoryTable } from './components/HistoryTable'
import { HistoryChart } from './components/HistoryChart'
import { MacroPanel } from './components/MacroPanel'
import { ForecastPanel } from './components/ForecastPanel'
import { CapitalPanel } from './components/CapitalPanel'
import { ScoreCard } from './components/ScoreCard'
import { SettingsModal } from './components/SettingsModal'
import { useGlossary, InfoTip } from './components/Glossary'
import { LinkageExplainer } from './components/LinkageExplainer'
import { diagnoseGame } from './diagnosis'
import { loadBest, saveBest, wasSaveStale } from './storage'
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

  const [decision, setDecision] = useState<Decision>({
    unitPrice: scenario.params.basePrice,
    purchaseMaterials: Math.round(scenario.params.baseDemand / (scenario.params.periodsPerYear ?? 1)),
    produceUnits: Math.round(scenario.params.baseDemand / (scenario.params.periodsPerYear ?? 1)),
    marketingSpend: 0,
    rdSpend: 0,
    insuranceSpend: 0,
    maintenanceSpend: 0,
    capitalExpenditure: 0,
    hire: 0,
    fire: 0,
    wageLevel: 100,
    equityIssuance: 0,
    financing: 0,
  })
  const patch = useCallback((p: Partial<Decision>) => setDecision((d) => ({ ...d, ...p })), [])

  // シナリオを切り替えたら判断の初期値もそのシナリオ向けに戻す。
  useEffect(() => {
    setDecision({
      unitPrice: scenario.params.basePrice,
      purchaseMaterials: Math.round(scenario.params.baseDemand / (scenario.params.periodsPerYear ?? 1)),
      produceUnits: Math.round(scenario.params.baseDemand / (scenario.params.periodsPerYear ?? 1)),
      marketingSpend: 0,
      rdSpend: 0,
      insuranceSpend: 0,
      maintenanceSpend: 0,
      capitalExpenditure: 0,
      hire: 0,
      fire: 0,
      wageLevel: 100,
      equityIssuance: 0,
      financing: 0,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // この判断の実現性チェック（確定前の警告。倒産・能力/借入枠オーバーを未然に知らせる）。
  const warnings = useMemo(() => {
    const w: string[] = []
    if (Number.isFinite(preview.capacity) && decision.produceUnits > preview.capacity) {
      w.push(`生産数量 ${num(decision.produceUnits)} が今月の生産能力 ${num(preview.capacity)} を超えています（超過分は作れません）`)
    }
    if (decision.financing > credit.borrowLimit) {
      w.push(`借入 ${yen(decision.financing)} が借入上限 ${yen(credit.borrowLimit)} を超えています（上限まで自動で制限されます）`)
    }
    if (preview.cashFlow.cashEnd < 0) {
      w.push(`この判断だと期末の現金が ${yen(preview.cashFlow.cashEnd)}（マイナス）になり、倒産の恐れがあります`)
    }
    return w
  }, [preview, decision.produceUnits, decision.financing, credit.borrowLimit])

  // 終了時の診断（なぜ勝った/負けたか＋改善点）。
  const diagnosis = useMemo(() => (gameOver ? diagnoseGame(game) : null), [gameOver, game])

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
          <strong>🏆 マイルストーン達成！</strong> {game.goalStatus?.label}。このまま経営を続けられます。
        </div>
      )}

      {game.goalStatus && (
        <section className={`goal ${game.goalStatus.status}`}>
          <div className="goal-head">
            <strong>🎯 目標: {game.goalStatus.label}</strong>
            <span className="muted small">{game.goalStatus.detail}</span>
          </div>
          <div className="goal-bar">
            <div
              className="goal-fill"
              style={{ width: `${Math.round(game.goalStatus.progress * 100)}%` }}
            />
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
          const i = VIEWS.findIndex((v) => v.key === view)
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
        {VIEWS.map((v) => (
          <button
            key={v.key}
            id={`tab-${v.key}`}
            type="button"
            role="tab"
            aria-selected={view === v.key}
            aria-controls={`panel-${v.key}`}
            tabIndex={view === v.key ? 0 : -1}
            className={view === v.key ? 'on' : ''}
            onClick={() => setView(v.key)}
          >
            {v.label}
            <span className="viewtabs-sub">{v.sub}</span>
          </button>
        ))}
      </nav>

      {view === 'business' && (
        <div role="tabpanel" id="panel-business" aria-labelledby="tab-business">
      {!gameOver && game.history.length === 0 && !guideDismissed && (
        <section className="guide">
          <div className="guide-head">
            <strong>👋 はじめかた（1分でわかる遊び方）</strong>
            <button className="ghost icon-btn" aria-label="ガイドを閉じる" onClick={dismissGuide}>
              ✕
            </button>
          </div>
          <ol className="guide-steps">
            <li>この「事業」タブで<strong>価格・仕入・生産</strong>などを決めます（まずは初期値のままでOK）。</li>
            <li>下の<strong>「この判断で1期すすめる ▶」</strong>を押すと1ヶ月が経過します。</li>
            <li>
              結果は<strong>「財務」タブ</strong>の三表（BS・PL・CF）に反映されます。
              <strong>倒産せず純資産（黒字）を増やす</strong>のが目標です。
            </li>
          </ol>
        </section>
      )}
      <section className="product">
        <h2>製品・原材料の状態</h2>
        <div className="product-grid">
          <div className="metric">
            <div className="metric-value">{yen(spotCost)}</div>
            <div className="metric-label">原材料スポット単価/個（基準 {yen(scenario.params.unitVariableCost)}）</div>
          </div>
          <div className="metric">
            <div className="metric-value">{(game.current.materialIndex).toFixed(2)}</div>
            <div className="metric-label">原材料価格指数（1.0=基準）</div>
          </div>
          <div className="metric">
            <div className="metric-value">{num(game.current.materialUnits)}個</div>
            <div className="metric-label">原材料 在庫</div>
          </div>
          <div className="metric">
            <div className="metric-value">{num(game.current.finishedUnits)}個</div>
            <div className="metric-label">製品 在庫</div>
          </div>
          <div className="metric">
            <div className="metric-value">
              {Number.isFinite(capacity) ? `${num(capacity)}/月` : '無制限'}
            </div>
            <div className="metric-label">
              {capacityLabel}
              {hasLabor && Number.isFinite(capacity) && (
                <>（{labCapacity <= equipCapacity ? '人手' : equipmentLabel}が制約）</>
              )}
            </div>
          </div>
          {hasLabor && (
            <div className="metric">
              <div className={`metric-value ${preview.attritionQuits > 0 ? 'ng' : ''}`}>
                {num(headcount)}人{preview.attritionQuits > 0 ? ` −${preview.attritionQuits}` : ''}
              </div>
              <div className="metric-label">
                従業員（労働能力 {Number.isFinite(labCapacity) ? `${num(labCapacity)}/月` : '—'}・設備{' '}
                {Number.isFinite(equipCapacity) ? `${num(equipCapacity)}/月` : '無制限'}）
                {preview.attritionQuits > 0 && (
                  <span className="ng"> ／ 待遇悪化で {preview.attritionQuits}人 離職見込</span>
                )}
              </div>
            </div>
          )}
          <div className="metric">
            <div className="metric-value">−{pct(1 - product.unitCostModifier)} / +{pct(product.demandModifier - 1)}</div>
            <div className="metric-label">R&D 原価減 / 需要増</div>
          </div>
          <div className="metric">
            <div className="metric-value">{yen(game.current.rdStock)}</div>
            <div className="metric-label">累積R&D投資</div>
          </div>
          {scenario.params.conditionDecay != null && (
            <div className="metric">
              <div className={`metric-value ${(game.current.condition ?? 1) >= 0.6 ? 'ok' : 'ng'}`}>
                {pct(game.current.condition ?? 1)}
              </div>
              <div className="metric-label">設備の整備状態（保全費で維持・故障率に直結）</div>
            </div>
          )}
        </div>
        <p className="muted small">
          原材料を仕入れて在庫し、生産で製品へ。原材料価格は市況で変動（安い時に仕込むと有利）。
          研究開発は実効原価を下げ需要を上げます（逓減・翌期以降に反映）。
        </p>
      </section>

      <DecisionPanel
        decision={decision}
        onChange={patch}
        onPlay={() => play(decision)}
        disabled={gameOver}
        materialUnitCost={spotCost}
        enabled={scenario.enabledDecisions}
        creditGrade={credit.grade}
        borrowLimit={credit.borrowLimit}
        effectiveRate={effectiveRate}
        capacity={preview.capacity}
        capacityLabel={capacityLabel}
        equipmentLabel={equipmentLabel}
        insuranceRefCost={scenario.params.insuranceRefCost}
        maxInsuranceCoverage={scenario.params.maxInsuranceCoverage}
        maintenanceRefCost={scenario.params.maintenanceRefCost}
        maxMaintenanceReduction={scenario.params.maxMaintenanceReduction}
        wage={scenario.params.wage}
        hireCost={scenario.params.hireCost}
        severance={scenario.params.severance}
        headcount={headcount}
        inflationIndex={game.macro.inflationIndex}
        attritionSlope={scenario.params.attritionSlope}
        maxAttrition={scenario.params.maxAttrition}
        equity={equity}
        sharesOutstanding={game.current.sharesOutstanding}
        warnings={warnings}
      />

      {!gameOver && (
        <ForecastPanel
          preview={preview}
          decision={decision}
          demandNoise={scenario.params.demandNoise ?? 0}
        />
      )}
        </div>
      )}

      {view === 'finance' && (
        <div role="tabpanel" id="panel-finance" aria-labelledby="tab-finance">
      <HistoryTable
        history={game.history}
        selectedTurn={selectedTurn}
        onSelect={setSelectedTurn}
        periodsPerYear={ppy}
      />

      <RatiosView
        ratios={selected ? selected.ratios : null}
        turn={selected?.turn}
        periodsPerYear={ppy}
      />

      {selected && <LinkageExplainer record={selected} />}

      {game.current.sharesOutstanding != null && game.current.sharesOutstanding > 0 && (
        <CapitalPanel
          sharesOutstanding={game.current.sharesOutstanding}
          equity={equity}
          lastNetIncome={
            game.history.length > 0
              ? game.history[game.history.length - 1].incomeStatement.netIncome
              : null
          }
        />
      )}

      <StatementsView
        state={selected ? selected.stateAfter : game.current}
        last={selected}
        periodsPerYear={ppy}
        history={game.history}
      />

      <HistoryChart initial={scenario.initialState} history={game.history} />
        </div>
      )}

      {view === 'market' && (
        <div role="tabpanel" id="panel-market" aria-labelledby="tab-market">
          <MacroPanel macro={game.macro} effectiveRate={effectiveRate} />

          {hasCompetitor ? (
            <section className="product">
              <h2>競合・市場シェア</h2>
              <div className="product-grid">
                <div className="metric">
                  <div className="metric-value">{yen(competitor.price)}</div>
                  <div className="metric-label">競合の価格</div>
                </div>
                <div className="metric">
                  <div className="metric-value">{competitor.quality.toFixed(2)}</div>
                  <div className="metric-label">競合の品質（自社 {product.demandModifier.toFixed(2)}）</div>
                </div>
                <div className="metric">
                  <div className={`metric-value ${ourShare >= 0.5 ? 'ok' : 'ng'}`}>{pct(ourShare)}</div>
                  <div className="metric-label">自社シェア（この価格での試算）</div>
                </div>
              </div>
              <p className="muted small">
                シェアは「価格あたり品質」で競合と取り合います。値下げや研究開発（品質）でシェアが伸び、需要に反映されます。
              </p>
            </section>
          ) : (
            <p className="muted small">このシナリオには直接の競合はいません（市場を独占的に供給）。</p>
          )}
        </div>
      )}

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
