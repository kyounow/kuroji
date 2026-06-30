import type { Decision } from '@core/index'
import type { DecisionField } from '@data/scenarios'
import { yen, pct } from '../format'

interface Props {
  decision: Decision
  onChange: (patch: Partial<Decision>) => void
  onPlay: () => void
  disabled: boolean
  /** 当期の原材料スポット単価（仕入の単価表示に使用） */
  materialUnitCost: number
  /** 操作可能な判断フィールド（未指定なら全て） */
  enabled?: readonly DecisionField[]
  /** 信用格付け（借入欄の表示用） */
  creditGrade: string
  /** 当期の借入上限 */
  borrowLimit: number
  /** 実効金利 */
  effectiveRate: number
  /** 当期の生産能力（数量上限。Infinity なら無制限） */
  capacity: number
  /** 業種別ラベル */
  capacityLabel: string
  equipmentLabel: string
  /** 保険: 満額補償に必要な保険料 */
  insuranceRefCost: number
  /** 保険: 補償率の上限（例 0.8） */
  maxInsuranceCoverage: number
  /** 保全: 最大軽減に必要な保全費（未設定なら保全無効） */
  maintenanceRefCost?: number
  /** 保全: 設備故障の被害の最大削減率（例 0.7） */
  maxMaintenanceReduction?: number
  /** 雇用: 1人あたり年給与（未設定で雇用なし） */
  wage?: number
  /** 雇用: 1人あたり採用費 */
  hireCost?: number
  /** 雇用: 1人あたり退職金 */
  severance?: number
  /** 雇用: 現在の従業員数 */
  headcount?: number
  /** 雇用: 当期の物価指数（市場賃金＝wage×物価指数） */
  inflationIndex?: number
  /** 雇用: 給与水準が相場を下回るときの離職率の傾き */
  attritionSlope?: number
  /** 雇用: 1期の離職率上限 */
  maxAttrition?: number
  /** 増資: 現在の純資産（発行価格 BVPS の算定に使う） */
  equity?: number
  /** 増資: 現在の発行済株数 */
  sharesOutstanding?: number
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
        // 0 のときは空表示（placeholder 0）にして、先頭に 0 が残らないようにする。
        value={value === 0 ? '' : value}
        placeholder="0"
        min={min}
        step={step}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
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
  { key: 'rdSpend', label: '研究開発費（R&D）', step: 50_000, hint: '累積で原価↓・需要↑・リコール率↓（翌期以降）' },
  { key: 'insuranceSpend', label: '保険料', step: 50_000, hint: '突発ショックの損失をヘッジ' },
  { key: 'maintenanceSpend', label: '保全・点検費', step: 10_000, hint: '' }, // hint は動的
  { key: 'capitalExpenditure', label: '設備投資', step: 100_000, hint: '固定資産↑・現金↓' },
  { key: 'hire', label: '採用（人数）', step: 1, hint: '' }, // hint は動的
  { key: 'fire', label: '解雇（人数）', step: 1, hint: '' }, // hint は動的
  { key: 'wageLevel', label: '給与水準（％・相場=100）', step: 5, hint: '' }, // hint は動的
  { key: 'equityIssuance', label: '増資（株式発行）', step: 100_000, hint: '' }, // hint は動的
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
  disabled,
  materialUnitCost,
  enabled,
  creditGrade,
  borrowLimit,
  effectiveRate,
  capacity,
  capacityLabel,
  equipmentLabel,
  insuranceRefCost,
  maxInsuranceCoverage,
  maintenanceRefCost,
  maxMaintenanceReduction,
  wage = 0,
  hireCost = 0,
  severance = 0,
  headcount = 0,
  inflationIndex = 1,
  attritionSlope,
  maxAttrition = 1,
  equity = 0,
  sharesOutstanding = 0,
}: Props) {
  // 給与水準（相場=100）と離職率。市場賃金は物価指数で連動。
  const marketWage = Math.round(wage * inflationIndex)
  const offeredWage = Math.round(marketWage * (decision.wageLevel / 100))
  const wageShortfall = Math.max(0, 1 - decision.wageLevel / 100)
  const attritionRate = attritionSlope != null ? Math.min(maxAttrition, attritionSlope * wageShortfall) : 0
  // 増資（簿価発行）: 発行価格＝1株あたり純資産(BVPS)、発行株数・希薄化後の持分。
  const bvps = sharesOutstanding > 0 ? equity / sharesOutstanding : 0
  const newShares = bvps > 0 ? Math.round(Math.max(0, decision.equityIssuance) / bvps) : 0
  const sharesAfter = sharesOutstanding + newShares
  const ownershipKept = sharesAfter > 0 ? sharesOutstanding / sharesAfter : 1
  const purchaseCost = materialUnitCost * Math.max(0, decision.purchaseMaterials)
  const insuranceCoverage =
    insuranceRefCost > 0 ? Math.min(maxInsuranceCoverage, decision.insuranceSpend / insuranceRefCost) : 0
  const fullPremium = Math.ceil(insuranceRefCost * maxInsuranceCoverage)
  // 保全効果（設備故障の被害の削減率）と満額に必要な保全費。
  const maintRef = maintenanceRefCost ?? 0
  const maxMaintRed = maxMaintenanceReduction ?? 0
  const maintenanceReduction = maintRef > 0 ? Math.min(maxMaintRed, decision.maintenanceSpend / maintRef) : 0
  const fullMaintenance = Math.ceil(maintRef * maxMaintRed)
  const visible = FIELDS.filter((f) => !enabled || enabled.includes(f.key))
  const capText = Number.isFinite(capacity) ? `${Math.round(capacity).toLocaleString('ja-JP')}個/月` : '無制限'

  const labelFor = (f: FieldDef): string => {
    if (f.key === 'capitalExpenditure') return `${equipmentLabel}投資`
    return f.label
  }
  const hintFor = (f: FieldDef): string => {
    if (f.key === 'purchaseMaterials') return `単価 ${yen(materialUnitCost)}/個 → 仕入額 ${yen(purchaseCost)}`
    if (f.key === 'produceUnits') return `${capacityLabel}の上限 ${capText}まで`
    if (f.key === 'insuranceSpend')
      return `補償率 ${pct(insuranceCoverage)}（満額 ${yen(fullPremium)} で最大 ${pct(maxInsuranceCoverage)}。ショック損失をこの率だけ肩代わり）`
    if (f.key === 'maintenanceSpend')
      return `発生時の被害 −${pct(maintenanceReduction)}（満額 ${yen(fullMaintenance)} で最大 −${pct(maxMaintRed)}）。継続で整備状態↑→故障の発生率↓`
    if (f.key === 'capitalExpenditure') return `${equipmentLabel}↑→${capacityLabel}↑・製造原価↓`
    if (f.key === 'hire')
      return `現在 ${headcount}人。採用費 ${yen(hireCost)}/人・給与 年${yen(wage)}/人 → 労働能力↑`
    if (f.key === 'fire') return `退職金 ${yen(severance)}/人 → 人件費・労働能力↓`
    if (f.key === 'wageLevel')
      return `相場 ${yen(marketWage)}/年・支給 ${yen(offeredWage)}/年。${decision.wageLevel < 100 ? `市場割れ→離職率 ${pct(attritionRate)}/月` : '相場以上＝離職なし'}`
    if (f.key === 'equityIssuance')
      return decision.equityIssuance > 0
        ? `発行価格 ${yen(bvps)}/株 → 約${newShares.toLocaleString('ja-JP')}株発行（無利息）。希薄化後の持分 ${pct(ownershipKept)}`
        : `発行価格 ${yen(bvps)}/株（純資産÷株数）。発行で現金↑・無利息だが株数↑＝希薄化`
    if (f.key === 'financing') return `格付${creditGrade}・借入上限 ${yen(borrowLimit)}・金利 ${pct(effectiveRate)}`
    return f.hint
  }

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
            label={labelFor(f)}
            value={decision[f.key]}
            onChange={(v) => onChange({ [f.key]: v })}
            step={f.step}
            min={f.min}
            hint={hintFor(f)}
          />
        ))}
      </div>
      <div className="actions">
        <button onClick={onPlay} disabled={disabled}>
          この判断で1期すすめる ▶
        </button>
      </div>
      <p className="muted small">
        現在の販売価格 {yen(decision.unitPrice)} ／ 生産 {decision.produceUnits.toLocaleString('ja-JP')} 個
      </p>
    </section>
  )
}
