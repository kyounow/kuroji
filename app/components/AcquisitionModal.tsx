import { useEffect, useState } from 'react'
import type { TurnResult } from '@core/index'
import { yen, num, pct } from '../format'
import { useModalA11y } from '../useModalA11y'
import { InfoTip } from './Glossary'

interface Props {
  /** ターゲットの受入純資産（＝設備簿価。最低対価） */
  targetNetAssets: number
  targetHeadcount: number
  demandBoost: number
  goodwillAmortRate: number
  /** 買収借入に使える枠（通常借入の入力分を除いた残り） */
  debtHeadroom: number
  /** 株式対価が使えるか（BVPS>0） */
  stockAvailable: boolean
  bvps: number
  cash: number
  /** この対価での買収プレビュー（previewTurn 再利用） */
  preview: (mix: { cashPaid: number; debtRaised: number; stockValue: number }) => TurnResult
  onConfirm: (mix: { cashPaid: number; debtRaised: number; stockValue: number }) => void
  onClose: () => void
}

const toInt = (s: string): number => {
  const n = Number(s)
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
}

/** M&A（競合の買収）の確認モーダル。対価ミックスとのれんをプレビューして実行する。 */
export function AcquisitionModal({
  targetNetAssets,
  targetHeadcount,
  demandBoost,
  goodwillAmortRate,
  debtHeadroom,
  stockAvailable,
  bvps,
  cash,
  preview,
  onConfirm,
  onClose,
}: Props) {
  const modalRef = useModalA11y<HTMLDivElement>()
  // 既定は「受入純資産の1.2倍を現金で」（のれん2割）。手元現金が薄ければ借入に寄せる。
  const defaultTotal = Math.round(targetNetAssets * 1.2)
  const defaultCash = Math.min(defaultTotal, Math.max(0, Math.floor(cash * 0.5)))
  const [cashPaid, setCashPaid] = useState(String(defaultCash))
  const [debtRaised, setDebtRaised] = useState(String(Math.min(Math.max(0, defaultTotal - defaultCash), debtHeadroom)))
  const [stockValue, setStockValue] = useState('0')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const mix = {
    cashPaid: toInt(cashPaid),
    debtRaised: Math.min(toInt(debtRaised), debtHeadroom),
    stockValue: stockAvailable ? toInt(stockValue) : 0,
  }
  const consideration = mix.cashPaid + mix.debtRaised + mix.stockValue
  const goodwill = Math.max(0, consideration - targetNetAssets)
  const enough = consideration >= targetNetAssets
  const p = enough ? preview(mix) : null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="競合の買収（M&A）"
        tabIndex={-1}
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>
            🤝 競合の買収（M&A） <InfoTip term="のれん" />
          </h2>
          <button className="ghost icon-btn" aria-label="閉じる" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="product-grid">
          <div className="metric">
            <div className="metric-value">{yen(targetNetAssets)}</div>
            <div className="metric-label">受入純資産（設備。最低対価）</div>
          </div>
          <div className="metric">
            <div className="metric-value">{num(targetHeadcount)}人</div>
            <div className="metric-label">受け入れる従業員</div>
          </div>
          <div className="metric">
            <div className="metric-value">+{pct(demandBoost)}</div>
            <div className="metric-label">買収後の需要ブースト（競合消滅＋顧客基盤）</div>
          </div>
        </div>

        <fieldset className="choice-group">
          <legend>対価の内訳（現金・借入・株式のミックス）</legend>
          <div className="fields">
            <label className="field">
              <span className="field-label">現金</span>
              <input
                type="text"
                inputMode="numeric"
                className="seed-input"
                value={cashPaid}
                onChange={(e) => setCashPaid(e.target.value.replace(/[^0-9]/g, ''))}
                aria-label="現金対価"
              />
              <span className="field-hint">手元現金 {yen(cash)}</span>
            </label>
            <label className="field">
              <span className="field-label">借入</span>
              <input
                type="text"
                inputMode="numeric"
                className="seed-input"
                value={debtRaised}
                onChange={(e) => setDebtRaised(e.target.value.replace(/[^0-9]/g, ''))}
                aria-label="借入対価"
              />
              <span className="field-hint">枠の残り {yen(debtHeadroom)}（通常の借入と合算で信用枠内）</span>
            </label>
            <label className="field">
              <span className="field-label">株式（新株発行）</span>
              <input
                type="text"
                inputMode="numeric"
                className="seed-input"
                value={stockValue}
                onChange={(e) => setStockValue(e.target.value.replace(/[^0-9]/g, ''))}
                disabled={!stockAvailable}
                aria-label="株式対価"
              />
              <span className="field-hint">
                {stockAvailable
                  ? `発行価格 ${yen(Math.round(bvps))}/株（BVPS）・約${num(bvps > 0 ? Math.round(mix.stockValue / bvps) : 0)}株＝希薄化`
                  : '株式対価は使えません（BVPS≦0 または株式基盤なし）'}
              </span>
            </label>
          </div>
        </fieldset>

        <div className="modal-note">
          <p className="small">
            <strong>取得会計:</strong> 対価 {yen(consideration)} − 受入純資産 {yen(targetNetAssets)} ={' '}
            <strong>のれん {yen(goodwill)}</strong>（B/S の固定資産に計上し、年{pct(goodwillAmortRate)}で償却→毎期の販管費に）。
          </p>
          {!enough && (
            <p className="ng small">対価が受入純資産 {yen(targetNetAssets)} に足りません（この条件では売り手が応じません）。</p>
          )}
          {p && (
            <p className="muted small">
              買収後の見込み: 現金 {yen(p.cashFlow.cashEnd)}・純資産{' '}
              {yen(
                p.state.balanceSheet.equity.capitalStock + p.state.balanceSheet.equity.retainedEarnings,
              )}
              。買収は一度きりで取り消せません。株式対価分は目標の「稼いだ純資産」に含まれません。
            </p>
          )}
        </div>

        <div className="modal-actions">
          <button onClick={() => onConfirm(mix)} disabled={!enough}>
            この条件で買収する ▶
          </button>
          <button className="ghost" onClick={onClose}>
            やめておく
          </button>
        </div>
      </div>
    </div>
  )
}
