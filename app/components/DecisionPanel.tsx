import type { Decision } from '@core/index'
import { yen } from '../format'

interface Props {
  decision: Decision
  onChange: (patch: Partial<Decision>) => void
  onPlay: () => void
  onReset: () => void
  disabled: boolean
}

/** 数値入力（ラベル付き）。 */
function Field({
  label,
  value,
  onChange,
  step = 100,
  min = 0,
  hint,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  hint?: string
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

/** 経営判断の入力パネル。 */
export function DecisionPanel({ decision, onChange, onPlay, onReset, disabled }: Props) {
  return (
    <section className="panel">
      <h2>経営判断</h2>
      <div className="fields">
        <Field
          label="販売価格（単価）"
          value={decision.unitPrice}
          onChange={(v) => onChange({ unitPrice: v })}
          step={100}
          hint="上げると利益率↑だが数量↓"
        />
        <Field
          label="原材料の仕入数量"
          value={decision.purchaseMaterials}
          onChange={(v) => onChange({ purchaseMaterials: v })}
          step={50}
          hint="スポット価格で購入・在庫に"
        />
        <Field
          label="生産数量"
          value={decision.produceUnits}
          onChange={(v) => onChange({ produceUnits: v })}
          step={50}
          hint="手持ち原材料が上限"
        />
        <Field
          label="販促費"
          value={decision.marketingSpend}
          onChange={(v) => onChange({ marketingSpend: v })}
          step={50_000}
          hint="需要を押し上げる（逓減）"
        />
        <Field
          label="研究開発費（R&D）"
          value={decision.rdSpend}
          onChange={(v) => onChange({ rdSpend: v })}
          step={50_000}
          hint="累積で原価↓・需要↑（翌期以降）"
        />
        <Field
          label="設備投資"
          value={decision.capitalExpenditure}
          onChange={(v) => onChange({ capitalExpenditure: v })}
          step={100_000}
          hint="固定資産↑・現金↓"
        />
        <Field
          label="資金調達（借入＋／返済−）"
          value={decision.financing}
          onChange={(v) => onChange({ financing: v })}
          step={100_000}
          min={-100_000_000}
          hint="借入は利息が発生"
        />
      </div>
      <div className="actions">
        <button onClick={onPlay} disabled={disabled}>
          この判断で1期すすめる ▶
        </button>
        <button className="ghost" onClick={onReset}>
          最初からやり直す
        </button>
      </div>
      <p className="muted small">
        現在の販売価格 {yen(decision.unitPrice)} ／ 生産 {decision.produceUnits.toLocaleString('ja-JP')} 個
      </p>
    </section>
  )
}
