import { useEffect, useState } from 'react'
import type { TurnResult, IpoGate } from '@core/index'
import { yen, pct, num } from '../format'
import { useModalA11y } from '../useModalA11y'
import { InfoTip } from './Glossary'

interface Props {
  /** 時価総額（年間純利益×PER）。 */
  valuation: number
  sharesOutstanding: number
  /** 調達上限の比率（時価総額×これ） */
  maxRaiseRatio: number
  /** 上場維持コスト（年額） */
  listingCostAnnual?: number
  /** 上場の知名度需要ブースト */
  listingDemandBoost?: number
  gate: IpoGate
  /** この調達額で上場した場合のプレビュー（previewTurn 再利用＝独自計算なし） */
  preview: (proceeds: number) => TurnResult
  /** 確定（拡張済み decision で直接 play される） */
  onConfirm: (proceeds: number) => void
  onClose: () => void
}

/** IPO（新規上場）の確認モーダル。時価総額・公募価格・希薄化・上場後の効果をプレビューして実行する。 */
export function IPOModal({
  valuation,
  sharesOutstanding,
  maxRaiseRatio,
  listingCostAnnual,
  listingDemandBoost,
  gate,
  preview,
  onConfirm,
  onClose,
}: Props) {
  const modalRef = useModalA11y<HTMLDivElement>()
  const maxRaise = Math.round(valuation * maxRaiseRatio)
  const [proceedsInput, setProceedsInput] = useState(() => String(Math.round(maxRaise / 2)))
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const raw = Number(proceedsInput)
  const proceeds = Math.min(Math.max(0, Number.isFinite(raw) ? Math.round(raw) : 0), maxRaise)
  const offerPrice = sharesOutstanding > 0 ? valuation / sharesOutstanding : 0
  const newShares = offerPrice > 0 ? Math.round(proceeds / offerPrice) : 0
  const sharesAfter = sharesOutstanding + newShares
  const ownershipKept = sharesAfter > 0 ? sharesOutstanding / sharesAfter : 1
  const p = gate.ok && proceeds > 0 ? preview(proceeds) : null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="新規上場（IPO）"
        tabIndex={-1}
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>
            🏛 新規上場（IPO） <InfoTip term="上場（IPO）" />
          </h2>
          <button className="ghost icon-btn" aria-label="閉じる" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="product-grid">
          <div className="metric">
            <div className="metric-value">{yen(valuation)}</div>
            <div className="metric-label">
              時価総額（年間純利益×PER） <InfoTip term="時価総額" />
            </div>
          </div>
          <div className="metric">
            <div className="metric-value">{yen(Math.round(offerPrice))}</div>
            <div className="metric-label">公募価格（時価総額÷{num(sharesOutstanding)}株）</div>
          </div>
          <div className="metric">
            <div className="metric-value">{yen(maxRaise)}</div>
            <div className="metric-label">調達上限（時価総額の{pct(maxRaiseRatio)}）</div>
          </div>
        </div>

        {!gate.ok ? (
          <div className="modal-note">
            <p className="ng small">上場基準を満たしていません:</p>
            <ul className="diagnosis-points small">
              {gate.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <fieldset className="choice-group">
              <legend>公募での調達額</legend>
              <div className="seed-row">
                <input
                  type="text"
                  inputMode="numeric"
                  className="seed-input"
                  value={proceedsInput}
                  onChange={(e) => setProceedsInput(e.target.value.replace(/[^0-9]/g, ''))}
                  aria-label="調達額（円）"
                />
                <button type="button" className="ghost" onClick={() => setProceedsInput(String(maxRaise))}>
                  上限まで
                </button>
              </div>
              <p className="muted small">
                新株 約{num(newShares)}株を発行 → 発行済 {num(sharesAfter)}株・既存持分 {pct(ownershipKept)}（希薄化{' '}
                <InfoTip term="希薄化" />）
              </p>
            </fieldset>

            {p && (
              <div className="modal-note">
                <p className="small">
                  <strong>上場後の見込み:</strong> 現金 {yen(p.cashFlow.cashEnd)}（調達 {yen(proceeds)} を含む）・
                  資本金へ同額組入れ（恒等式維持）。
                  {listingDemandBoost ? <> 知名度で需要 +{pct(listingDemandBoost)}。</> : null}
                  {listingCostAnnual ? <> 以後、上場維持コスト 年{yen(listingCostAnnual)}（監査・IR）が販管費に。</> : null}
                </p>
                <p className="muted small">
                  ※ 上場は一度きりで取り消せません。調達で純資産は増えますが、目標の「稼いだ純資産」には
                  調達分は含まれません（調達→成長→利益で効かせる）。
                </p>
              </div>
            )}

            <div className="modal-actions">
              <button onClick={() => onConfirm(proceeds)} disabled={proceeds <= 0}>
                この条件で上場する ▶
              </button>
              <button className="ghost" onClick={onClose}>
                やめておく
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
