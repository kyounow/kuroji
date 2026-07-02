import { calcSkill, avgSkill, avgMorale, synthesizeEmployees } from '@core/index'
import type { EmployeeRole } from '@core/index'
import { useGameView } from '../GameViewContext'
import { InfoTip } from './Glossary'
import { yen, num, pct } from '../format'

/** 人材・組織パネル: 従業員の状態（役割・等級・経験・士気）・研修投資・役割別採用・解雇。 */
export function HrPanel() {
  const v = useGameView()
  const { game, scenario, decision, patch, gameOver, preview } = v
  const hr = scenario.params.hr
  if (!hr) return null
  // 初期状態（employees 未生成）はエンジン入口と同じ合成で表示（表示＝挙動を一致させる）。
  const emps =
    game.current.employees ?? synthesizeEmployees(game.current.headcount ?? 0, 'field', hr, 0)
  const wage = scenario.params.wage ?? 0
  const roleCount = (r: EmployeeRole) => emps.filter((e) => e.role === r).length
  const skill = emps.length ? avgSkill(emps, hr) : 1
  const morale = emps.length ? avgMorale(emps, hr) : hr.moraleBase
  // 人的資本（簿外・推定）: Σ 年間給与×等級倍率×スキル。B/S には載らない＝開発資産との対比が学び。
  const humanCapital = Math.round(
    emps.reduce(
      (s, e) => s + wage * (hr.grades[Math.min(e.grade, hr.grades.length) - 1]?.wageMult ?? 1) * calcSkill(e, hr),
      0,
    ),
  )
  const setHire = (role: EmployeeRole, value: number) => {
    patch({ hireRoles: { ...decision.hireRoles, [role]: Math.max(0, value) } })
  }

  return (
    <section className="panel">
      <h2>
        👥 人材・組織 <InfoTip term="人的資本" />
      </h2>

      {preview.hrPromotions != null && preview.hrPromotions > 0 && (
        <div className="kuroji-note small">
          🎓 今期末に <strong>{preview.hrPromotions}人が昇進</strong>見込み（等級が上がり、来期から人件費も上がります）。
        </div>
      )}
      {preview.hrOverworked && (
        <div className="warnings small" aria-live="polite">
          ⚠ 希望生産が能力を超えています（過重労働）。続くと士気が下がり、生産性低下・離職につながります。
        </div>
      )}

      <div className="product-grid">
        <div className="metric">
          <div className="metric-value">{num(emps.length)}人</div>
          <div className="metric-label">
            {hr.roleLabels.field} {roleCount('field')}・{hr.roleLabels.mgmt} {roleCount('mgmt')}・
            {hr.roleLabels.rnd} {roleCount('rnd')}
          </div>
        </div>
        <div className="metric">
          <div className="metric-value">×{skill.toFixed(2)}</div>
          <div className="metric-label">平均スキル（等級×経験。生産性に直結）</div>
        </div>
        <div className="metric">
          <div className={`metric-value ${morale < hr.attritionMoraleFloor ? 'ng' : morale >= hr.moraleBase ? 'ok' : ''}`}>
            {pct(morale)}
          </div>
          <div className="metric-label">
            平均士気（{pct(hr.attritionMoraleFloor)}を下回ると離職が始まる）
          </div>
        </div>
        <div className="metric">
          <div className="metric-value">{yen(humanCapital)}</div>
          <div className="metric-label">
            人的資本（簿外・年額推定） <InfoTip term="人的資本" />
          </div>
        </div>
      </div>

      <div className="fields">
        <label className="field">
          <span className="field-label">研修費（人材投資）</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={10_000}
            value={(decision.trainingSpend ?? 0) === 0 ? '' : decision.trainingSpend}
            placeholder="0"
            disabled={gameOver}
            onChange={(e) => patch({ trainingSpend: Math.max(0, Number(e.target.value) || 0) })}
          />
          <span className="field-hint">
            費用処理（その期の販管費）。経験と士気を上げ、スキル・定着・昇進を早める{' '}
            <InfoTip term="研修費（費用処理）" />
          </span>
        </label>
        {(['field', 'mgmt', 'rnd'] as const).map((role) => (
          <label key={role} className="field">
            <span className="field-label">採用: {hr.roleLabels[role]}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={(decision.hireRoles?.[role] ?? 0) === 0 ? '' : decision.hireRoles?.[role]}
              placeholder="0"
              disabled={gameOver}
              onChange={(e) => setHire(role, Number(e.target.value) || 0)}
            />
            <span className="field-hint">
              {role === 'field' && '労働能力を供給（等級1から）'}
              {role === 'mgmt' && 'チーム全体の効率を押し上げる'}
              {role === 'rnd' && '毎期 R&D に自動で寄与する'}
            </span>
          </label>
        ))}
        <label className="field">
          <span className="field-label">解雇（人数）</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={decision.fire === 0 ? '' : decision.fire}
            placeholder="0"
            disabled={gameOver}
            onChange={(e) => patch({ fire: Math.max(0, Number(e.target.value) || 0) })}
          />
          <span className="field-hint">
            退職金 {yen(scenario.params.severance ?? 0)}/人。士気の低い順に退出
          </span>
        </label>
      </div>

      {emps.length > 0 && (
        <div className="table-scroll">
          <table className="history">
            <thead>
              <tr>
                <th>役割</th>
                <th className="r">等級</th>
                <th className="r">経験</th>
                <th className="r">士気</th>
                <th className="r">スキル</th>
              </tr>
            </thead>
            <tbody>
              {emps.map((e) => (
                <tr key={e.id}>
                  <td>{hr.roleLabels[e.role]}</td>
                  <td className="r">{e.grade}</td>
                  <td className="r">{Math.round(e.exp)}</td>
                  <td className={`r ${e.morale < hr.attritionMoraleFloor ? 'ng' : ''}`}>{pct(e.morale)}</td>
                  <td className="r">×{calcSkill(e, hr).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">
        給与・研修費はすべて費用＝<strong>人はB/Sに載らない資産（簿外）</strong>。
        開発資産（資産計上→償却）との対比が、会計の面白い非対称です。
      </p>
    </section>
  )
}
