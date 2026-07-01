import type { TurnRecord } from '../state'
import { yen } from '../format'
import { InfoTip } from './Glossary'

/** 当期の実数で「三表のつながり」を示す（PL→BS の利益剰余金、PL→CF の間接法）。 */
export function LinkageExplainer({ record }: { record: TurnRecord }) {
  const ni = record.incomeStatement.netIncome
  const opCF = record.cashFlow.operating
  const reAfter = record.stateAfter.balanceSheet.equity.retainedEarnings
  const rePrior = reAfter - ni
  const diff = opCF - ni
  return (
    <section className="panel linkage">
      <h2>
        三表のつながり <InfoTip term="三表のつながり" />
      </h2>
      <div className="linkage-row">
        <span className="linkage-tag pl">PL</span>
        <strong>当期純利益 {yen(ni)}</strong>
        <span className="linkage-arrow">→</span>
        <span className="linkage-tag bs">BS</span>
        <span>
          純資産の<strong>利益剰余金</strong>が {yen(rePrior)} → {yen(reAfter)}（{ni >= 0 ? '+' : ''}
          {yen(ni)}）に積み上がる
        </span>
      </div>
      <div className="linkage-row">
        <span className="linkage-tag pl">PL</span>
        <strong>当期純利益 {yen(ni)}</strong>
        <span className="linkage-arrow">→</span>
        <span className="linkage-tag cf">CF</span>
        <span>
          減価償却などの非現金項目と運転資本の増減を調整して <strong>営業CF {yen(opCF)}</strong>（差{' '}
          {yen(diff)}） <InfoTip term="間接法CF" />
        </span>
      </div>
      <p className="muted small">
        {diff < 0
          ? '利益より営業CFが小さい＝利益ほど現金が残っていません（売掛金・在庫の増加など）。黒字でも油断は禁物。'
          : '利益より営業CFが大きい＝減価償却など現金の出ない費用が利益を押し下げていた分、現金は多く残ります。'}
      </p>
    </section>
  )
}
