import type { Decision } from '@core/index'
import type { DecisionField } from '@data/scenarios'
import { yen } from '../format'

interface Props {
  decision: Decision
  onChange: (patch: Partial<Decision>) => void
  onPlay: () => void
  onReset: () => void
  disabled: boolean
  /** 当期の原材料スポット単価（仕入の単価表示に使用） */
  materialUnitCost: number
  /** 操作可能な判断フィールド（未指定なら全て） */
  enabled?: readonly DecisionField[]
}

/** 数値入力（ラベル付き）。 */
function Field({
  label,
  value,
  onChange,
  step,
  min = 0,
  hint,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step: number
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

interface FieldDef {
  key: DecisionField
  label: string
  step: number
  min?: number
  hint: string
}

const FIELDS: readonly FieldDef[] = [
  { key: 'unitPrice', label: '販売価格（単価）', step: 100, hint: '上げると利益率↑だが数量↓' },
  { key: 'purchaseMaterials', label: '原材料の仕入数量', step: 50, hint: '' }, // hint は動的
  { key: 'produceUnits', label: '生産数量', step: 50, hint: '手持ち原材料が上限' },
  { key: 'marketingSpend', label: '販促費', step: 50_000, hint: '需要を押し上げる（逓減）' },
  { key: 'rdSpend', label: '研究開発費（R&D）', step: 50_000, hint: '累積で原価↓・需要↑（翌期以降）' },
  { key: 'capitalExpenditure', label: '設備投資', step: 100_000, hint: '固定資産↑・現金↓' },
  {
    key: 'financing',
    label: '資金調達（借入＋／返済−）',
    step: 100_000,
    min: -100_000_000,
    hint: '借入は利息が発生',
  },
]

/** 経営判断の入力パネル。 */
export function DecisionPanel({
  decision,
  onChange,
  onPlay,
  onReset,
  disabled,
  materialUnitCost,
  enabled,
}: Props) {
  const purchaseCost = materialUnitCost * Math.max(0, decision.purchaseMaterials)
  const visible = FIELDS.filter((f) => !enabled || enabled.includes(f.key))

  return (
    <section className="panel">
      <h2>経営判断</h2>
      {enabled && (
        <p className="muted small">このシナリオでは一部の判断のみ操作できます（段階的に解禁）。</p>
      )}
      <div className="fields">
        {visible.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            value={decision[f.key]}
            onChange={(v) => onChange({ [f.key]: v })}
            step={f.step}
            min={f.min}
            hint={
              f.key === 'purchaseMaterials'
                ? `単価 ${yen(materialUnitCost)}/個 → 仕入額 ${yen(purchaseCost)}`
                : f.hint
            }
          />
        ))}
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
