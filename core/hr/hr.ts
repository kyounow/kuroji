import type { Employee, EmployeeRole, HrParams } from '@core/types'

/**
 * 人材開発モデルの純関数群（決定論・乱数なし）。
 * 設計の要点:
 *  - 開始時パリティ: 等級1（wageMult=1, skillMult=1）・exp0・morale=moraleBase で
 *    スキル=1・生産性係数=1・賃金=基準 ＝ 従来スカラーモデルと同値から始まる。
 *  - 離職・解雇の選定は「士気の低い順・同率は新しい順（id 降順）」＝乱数なしの決定論。
 */

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

/** スキル＝等級係数 × (1 + 経験の逓減効果)。exp0 かつ等級1で 1.0。 */
export function calcSkill(e: Employee, hr: HrParams): number {
  const g = hr.grades[Math.min(e.grade, hr.grades.length) - 1] ?? hr.grades[0]
  const expEffect = hr.skillFromExpMax * (e.exp / (e.exp + hr.expHalf))
  return g.skillMult * (1 + expEffect)
}

/** 士気→生産性係数（morale=moraleBase で 1.0＝開始時パリティ）。 */
export function moraleFactor(morale: number, hr: HrParams): number {
  return Math.max(0.1, 1 + hr.moraleProductivitySlope * (morale - hr.moraleBase))
}

/** 従業員を合成（従来セーブ・M&A受け入れ・採用）。等級1・経験0・中立士気。 */
export function synthesizeEmployees(count: number, role: EmployeeRole, hr: HrParams, startId: number): Employee[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => ({
    id: startId + i,
    role,
    grade: 1,
    exp: 0,
    morale: hr.moraleBase,
  }))
}

/** 次に採番する ID（既存最大+1。空なら 0）。 */
export function nextEmployeeId(employees: readonly Employee[]): number {
  return employees.length ? Math.max(...employees.map((e) => e.id)) + 1 : 0
}

/**
 * 労働による生産能力（年額→期間は呼び出し側で periodFactor を掛ける前提の年額値を返す）。
 * 現場（field）のみが供給: Σ laborPerHead × スキル × 士気係数。
 * 管理職はチーム効率で全体を押し上げる（逓減）: ×(1 + mgmtBoost × n/(n+mgmtHalf))。
 */
export function hrLaborCapacityPerYear(employees: readonly Employee[], laborPerHead: number, hr: HrParams): number {
  const field = employees.filter((e) => e.role === 'field')
  const base = field.reduce((s, e) => s + laborPerHead * calcSkill(e, hr) * moraleFactor(e.morale, hr), 0)
  const mgmtCount = employees.filter((e) => e.role === 'mgmt').length
  const mgmtFactor =
    hr.mgmtBoost && hr.mgmtHalf ? 1 + hr.mgmtBoost * (mgmtCount / (mgmtCount + hr.mgmtHalf)) : 1
  return base * mgmtFactor
}

/** 平均士気（空なら moraleBase）。 */
export function avgMorale(employees: readonly Employee[], hr: HrParams): number {
  return employees.length ? employees.reduce((s, e) => s + e.morale, 0) / employees.length : hr.moraleBase
}

/** 平均スキル（空なら 1）。 */
export function avgSkill(employees: readonly Employee[], hr: HrParams): number {
  return employees.length ? employees.reduce((s, e) => s + calcSkill(e, hr), 0) / employees.length : 1
}

/**
 * 退出者の決定論的選定: 士気の低い順・同率は新しい順（id 降順）。
 * 返り値は [残る人, 去る人]。
 */
export function selectLeavers(employees: readonly Employee[], count: number): [Employee[], Employee[]] {
  if (count <= 0) return [employees.slice(), []]
  const sorted = employees
    .slice()
    .sort((a, b) => (a.morale !== b.morale ? a.morale - b.morale : b.id - a.id))
  const leaving = sorted.slice(0, Math.min(count, sorted.length))
  const leaveIds = new Set(leaving.map((e) => e.id))
  return [employees.filter((e) => !leaveIds.has(e.id)), leaving]
}

/**
 * 期末の従業員更新（経験・士気・昇進）。
 * - 経験: 在籍 expPerTurn ＋ 研修（研修費 ÷ (trainingRefCost×人数)、上限 trainingExpMax）
 * - 士気: 回復 − 過重労働 − 相場割れ ＋ 研修（clamp 0..1）
 * - 昇進: exp が等級しきい値に到達で自動昇進（賃金・スキル係数が上がる）
 */
export function updateEmployeesEndOfTurn(
  employees: readonly Employee[],
  hr: HrParams,
  opts: { trainingSpend: number; overworked: boolean; wageShortfall: number },
): { employees: Employee[]; promotions: number } {
  const n = employees.length
  const trainingExp =
    n > 0 && opts.trainingSpend > 0
      ? Math.min(hr.trainingExpMax, opts.trainingSpend / (hr.trainingRefCost * n))
      : 0
  const penalties =
    (opts.overworked ? hr.moraleOverworkPenalty : 0) + hr.moraleWageSlope * Math.max(0, opts.wageShortfall)
  const trainingBoost = trainingExp > 0 ? hr.moraleTrainingBoost : 0
  let promotions = 0
  const updated = employees.map((e) => {
    const exp = e.exp + hr.expPerTurn + trainingExp
    let grade = e.grade
    const gp = hr.grades[grade - 1]
    if (gp?.expToNext != null && exp >= gp.expToNext && grade < hr.grades.length) {
      grade += 1
      promotions += 1
    }
    // 自然回復は中立（moraleBase）まで（放置で士気が無限に上がらない＝パリティ維持）。
    // 研修のみ中立超えを許す（人への投資が士気を押し上げる）。ペナルティはそのまま引く。
    const towardBase = e.morale < hr.moraleBase ? Math.min(hr.moraleRecover, hr.moraleBase - e.morale) : 0
    const morale = clamp01(e.morale + towardBase + trainingBoost - penalties)
    return { ...e, exp, grade, morale }
  })
  return { employees: updated, promotions }
}
