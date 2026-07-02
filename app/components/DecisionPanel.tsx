import type { Decision, LineDecision, ProductLineParams } from '@core/index'
import type { DecisionField } from '@data/scenarios'
import { yen, pct } from '../format'

interface Props {
  decision: Decision
  onChange: (patch: Partial<Decision>) => void
  onPlay: () => void
  disabled: boolean
  /** この判断の実現性警告（倒産・能力/借入枠オーバー）。空なら非表示。 */
  warnings?: string[]
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
  /** 増資: 1期の発行上限（期首純資産×受け入れ枠。超過分は自動制限） */
  equityIssueCap?: number
  /** 配当: 支払える上限（利益剰余金と現金の小さい方） */
  dividendCap?: number
  /** 複数製品: ライン定義（2本以上でライン別入力に切替） */
  productLines?: readonly ProductLineParams[]
  /** 人材開発シナリオでは 採用/解雇 を人材・組織パネルに移す（このパネルからは隠す） */
  hrEnabled?: boolean
}

/** 数値入力（ラベル付き）。 */
function Field({
  id,
  label,
  value,
  onChange,
  step,
  min = 0,
  hint,
}: {
  id: string
  label: string
  value: number
  onChange: (v: number) => void
  step: number
  min?: number
  hint?: string
}) {
  const hintId = hint ? `${id}-hint` : undefined
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
        inputMode="numeric"
        aria-describedby={hintId}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      />
      {hint && (
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
      )}
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
  { key: 'dividend', label: '配当（株主還元）', step: 10_000, hint: '' }, // hint は動的
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
  warnings = [],
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
  equityIssueCap,
  dividendCap,
  productLines,
  hrEnabled = false,
}: Props) {
  // 複数製品モード: 製品系5フィールドはライン別に入力し、共通フィールド（保険・設備・雇用・資金…）は従来どおり。
  const isMultiLine = (productLines?.length ?? 0) > 1
  const PRODUCT_FIELD_KEYS = new Set<DecisionField>([
    'unitPrice',
    'purchaseMaterials',
    'produceUnits',
    'marketingSpend',
    'rdSpend',
  ])
  // エンジン（resolveTurn の lineDecs）と同一のフォールバック式＝表示と実際の挙動を常に一致させる。
  // decision.lines が無い/短い（新商材ローンチ直後等）とき: ライン0=スカラー判断・他ライン=休止。
  const lineFallback = (lp: ProductLineParams, i: number): LineDecision =>
    i === 0
      ? {
          unitPrice: decision.unitPrice,
          purchaseMaterials: decision.purchaseMaterials,
          produceUnits: decision.produceUnits,
          marketingSpend: decision.marketingSpend,
          rdSpend: decision.rdSpend,
        }
      : { unitPrice: lp.basePrice, purchaseMaterials: 0, produceUnits: 0, marketingSpend: 0, rdSpend: 0 }
  const patchLine = (i: number, p: Partial<LineDecision>) => {
    const defs = productLines ?? []
    const base: LineDecision[] = defs.map((lp, j) => decision.lines?.[j] ?? lineFallback(lp, j))
    const next = base.map((l, j) => (j === i ? { ...l, ...p } : l))
    onChange({ lines: next })
  }
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
  // 人材開発シナリオでは 採用/解雇 を人材・組織パネルへ移す（役割別採用・士気と一緒に判断するため）。
  const HR_MOVED_KEYS = new Set<DecisionField>(['hire', 'fire'])
  const visible = FIELDS.filter(
    (f) =>
      (!enabled || enabled.includes(f.key)) &&
      !(isMultiLine && PRODUCT_FIELD_KEYS.has(f.key)) &&
      !(hrEnabled && HR_MOVED_KEYS.has(f.key)),
  )
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
    if (f.key === 'equityIssuance') {
      const capText = equityIssueCap != null ? `。今期の発行上限 ${yen(equityIssueCap)}（投資家の受け入れ枠）` : ''
      return decision.equityIssuance > 0
        ? `発行価格 ${yen(bvps)}/株 → 約${newShares.toLocaleString('ja-JP')}株発行（無利息）。希薄化後の持分 ${pct(ownershipKept)}${capText}`
        : `発行価格 ${yen(bvps)}/株（純資産÷株数）。発行で現金↑・無利息だが株数↑＝希薄化${capText}`
    }
    if (f.key === 'dividend') {
      const capText = dividendCap != null ? `上限 ${yen(Math.max(0, dividendCap))}（利益剰余金と現金の小さい方）。` : ''
      return `${capText}現金↓・利益剰余金↓＝純資産が減ります（目標との兼ね合いに注意）`
    }
    if (f.key === 'financing') return `格付${creditGrade}・借入上限 ${yen(borrowLimit)}・金利 ${pct(effectiveRate)}`
    return f.hint
  }

  return (
    <section className="panel">
      <h2>経営判断</h2>
      {enabled && (
        <p className="muted small">このシナリオでは基本操作（価格・仕入・生産）に絞っています。慣れたら別シナリオで全機能を。</p>
      )}
      {isMultiLine &&
        (productLines ?? []).map((lp, i) => {
          const line = decision.lines?.[i] ?? lineFallback(lp, i)
          return (
            <fieldset key={lp.id} className="choice-group line-group">
              <legend>🏷 {lp.name}</legend>
              <div className="fields">
                <Field
                  id={`line-${lp.id}-price`}
                  label="販売価格（単価）"
                  value={line.unitPrice}
                  step={100}
                  onChange={(v) => patchLine(i, { unitPrice: v })}
                  hint={`基準 ${yen(lp.basePrice)}`}
                />
                <Field
                  id={`line-${lp.id}-buy`}
                  label="原材料の仕入数量"
                  value={line.purchaseMaterials}
                  step={10}
                  onChange={(v) => patchLine(i, { purchaseMaterials: v })}
                  hint={`基準原価 ${yen(lp.unitVariableCost)}/個`}
                />
                <Field
                  id={`line-${lp.id}-produce`}
                  label="生産数量"
                  value={line.produceUnits}
                  step={10}
                  onChange={(v) => patchLine(i, { produceUnits: v })}
                  hint="能力は全ライン共有（超過分は希望比で按分）"
                />
                <Field
                  id={`line-${lp.id}-mkt`}
                  label="販促費"
                  value={line.marketingSpend}
                  step={10_000}
                  onChange={(v) => patchLine(i, { marketingSpend: v })}
                  hint="このラインの需要を押し上げ（逓減）"
                />
                <Field
                  id={`line-${lp.id}-rd`}
                  label="研究開発費（R&D）"
                  value={line.rdSpend}
                  step={10_000}
                  onChange={(v) => patchLine(i, { rdSpend: v })}
                  hint="このラインの原価↓・需要↑（翌期以降）。品質は最弱ライン基準"
                />
              </div>
            </fieldset>
          )
        })}
      <div className="fields">
        {visible.map((f) => (
          <Field
            key={f.key}
            id={f.key}
            label={labelFor(f)}
            value={decision[f.key]}
            onChange={(v) => onChange({ [f.key]: v })}
            step={f.step}
            min={f.min}
            hint={hintFor(f)}
          />
        ))}
      </div>
      {warnings.length > 0 && (
        <ul className="warnings" aria-live="polite">
          {warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      )}
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
