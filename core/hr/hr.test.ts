import { describe, it, expect } from 'vitest'
import type { Employee, HrParams } from '@core/types'
import {
  calcSkill,
  moraleFactor,
  synthesizeEmployees,
  nextEmployeeId,
  hrLaborCapacityPerYear,
  selectLeavers,
  updateEmployeesEndOfTurn,
} from './hr'

const HR: HrParams = {
  roleLabels: { field: '職人', mgmt: '班長', rnd: '技術者' },
  grades: [
    { wageMult: 1, skillMult: 1, expToNext: 36 },
    { wageMult: 1.25, skillMult: 1.15, expToNext: 96 },
    { wageMult: 1.5, skillMult: 1.3 },
  ],
  expPerTurn: 1,
  skillFromExpMax: 0.1,
  expHalf: 96,
  trainingRefCost: 3_000,
  trainingExpMax: 6,
  moraleBase: 0.6,
  moraleRecover: 0.05,
  moraleOverworkPenalty: 0.08,
  moraleWageSlope: 0.3,
  moraleTrainingBoost: 0.03,
  moraleProductivitySlope: 0.5,
  attritionMoraleSlope: 0.5,
  attritionMoraleFloor: 0.35,
  mgmtBoost: 0.2,
  mgmtHalf: 2,
}

const emp = (over: Partial<Employee> = {}): Employee => ({
  id: 0,
  role: 'field',
  grade: 1,
  exp: 0,
  morale: HR.moraleBase,
  ...over,
})

describe('人材開発の純関数', () => {
  it('開始時パリティ: 等級1・経験0・中立士気で スキル=1・生産性係数=1', () => {
    expect(calcSkill(emp(), HR)).toBe(1)
    expect(moraleFactor(HR.moraleBase, HR)).toBe(1)
    // 5人の現場 = laborPerHead×5（従来スカラーと同値）
    expect(hrLaborCapacityPerYear(synthesizeEmployees(5, 'field', HR, 0), 120, HR)).toBe(600)
  })

  it('経験と等級でスキルが上がる（逓減）・受動成長は96ヶ月で+5%程度', () => {
    expect(calcSkill(emp({ exp: 96 }), HR)).toBeCloseTo(1 + 0.1 * 0.5, 6) // +5%
    expect(calcSkill(emp({ grade: 2 }), HR)).toBeCloseTo(1.15, 6)
    expect(calcSkill(emp({ grade: 3, exp: 96 }), HR)).toBeCloseTo(1.3 * 1.05, 6)
  })

  it('管理職はチーム効率を逓減で押し上げ、自身は労働能力を供給しない', () => {
    const team = [...synthesizeEmployees(4, 'field', HR, 0), ...synthesizeEmployees(2, 'mgmt', HR, 10)]
    // 現場4×120 × (1 + 0.2×2/(2+2)) = 480×1.1 = 528
    expect(hrLaborCapacityPerYear(team, 120, HR)).toBeCloseTo(528, 6)
  })

  it('退出者は士気の低い順・同率は新しい順（決定論）', () => {
    const team = [
      emp({ id: 1, morale: 0.7 }),
      emp({ id: 2, morale: 0.3 }),
      emp({ id: 3, morale: 0.3 }),
      emp({ id: 4, morale: 0.9 }),
    ]
    const [stay, leave] = selectLeavers(team, 2)
    expect(leave.map((e) => e.id)).toEqual([3, 2]) // 士気0.3の2人・新しい順
    expect(stay.map((e) => e.id)).toEqual([1, 4])
  })

  it('期末更新: 研修で経験↑・士気は中立超え、過重労働と相場割れで士気↓、しきい値で自動昇進', () => {
    // 研修: 3人×3,000円/exp → 27,000円で 3exp/人
    const { employees: trained } = updateEmployeesEndOfTurn(
      synthesizeEmployees(3, 'field', HR, 0),
      HR,
      { trainingSpend: 27_000, overworked: false, wageShortfall: 0 },
    )
    expect(trained[0].exp).toBe(1 + 3) // 在籍1＋研修3
    expect(trained[0].morale).toBeCloseTo(HR.moraleBase + HR.moraleTrainingBoost, 6)
    // 過重労働＋相場割れ20%: 0.6 − 0.08 − 0.3×0.2 = 0.46
    const { employees: tired } = updateEmployeesEndOfTurn(synthesizeEmployees(1, 'field', HR, 0), HR, {
      trainingSpend: 0,
      overworked: true,
      wageShortfall: 0.2,
    })
    expect(tired[0].morale).toBeCloseTo(0.46, 6)
    // 回復は中立まで（放置で上がりすぎない）
    const { employees: rested } = updateEmployeesEndOfTurn([emp({ morale: 0.5 })], HR, {
      trainingSpend: 0,
      overworked: false,
      wageShortfall: 0,
    })
    expect(rested[0].morale).toBeCloseTo(0.55, 6)
    // 昇進: exp 35 + 在籍1 = 36 ≥ しきい値36 → 等級2
    const { employees: promoted, promotions } = updateEmployeesEndOfTurn([emp({ exp: 35 })], HR, {
      trainingSpend: 0,
      overworked: false,
      wageShortfall: 0,
    })
    expect(promotions).toBe(1)
    expect(promoted[0].grade).toBe(2)
  })

  it('ID採番は既存最大+1（決定論・安定）', () => {
    expect(nextEmployeeId([])).toBe(0)
    expect(nextEmployeeId([emp({ id: 4 }), emp({ id: 9 })])).toBe(10)
  })
})
