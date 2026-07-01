import { totalEquity } from '@core/index'
import type { GameState } from './state'

export interface Diagnosis {
  headline: string
  points: string[]
  /** 用語集で開くと学べる関連語（あれば） */
  term?: string
}

/** ゲーム終了時に「なぜ勝った/負けたか＋次への改善点」を状態から生成する（純関数）。 */
export function diagnoseGame(game: GameState): Diagnosis {
  const hist = game.history
  const last = hist[hist.length - 1]
  const bs = game.current.balanceSheet
  const equity = totalEquity(bs)
  const cash = bs.currentAssets.cash
  const recent = hist.slice(-6)
  const recentAvgNI = recent.length
    ? recent.reduce((s, h) => s + h.incomeStatement.netIncome, 0) / recent.length
    : 0

  if (game.outcome === 'won') {
    const points = ['目標を達成しました。純資産（黒字）を着実に積み上げられました。']
    const r = last?.ratios
    if (r) {
      if (r.equityRatio >= 0.5) points.push(`自己資本比率 ${Math.round(r.equityRatio * 100)}% と財務も健全です。`)
      if (r.roe >= 0.15) points.push(`ROE ${Math.round(r.roe * 100)}% と資本効率も良好でした。`)
    }
    points.push('別のシナリオや、より高い目標・短い期限にも挑戦してみましょう。')
    return { headline: '🎉 クリア！目標達成おめでとうございます。', points }
  }

  if (game.outcome === 'lost') {
    // 倒産していない（生存したが期限内に目標未達）
    if (cash >= 0 && equity >= 0) {
      return {
        headline: '期限内に目標を達成できませんでした（倒産はしていません）。',
        points: [
          'あと少し、純資産を伸ばすペースが必要でした。',
          '販促・研究開発で需要を伸ばす、設備投資・雇用で生産能力を広げるなど、成長への投資を。',
          'エンドレスモードなら期限なしでじっくり経営できます。',
        ],
      }
    }
    // 現金が尽きた（純資産はプラス＝黒字倒産の可能性）
    if (cash < 0 && equity >= 0) {
      if (recentAvgNI >= 0) {
        return {
          headline: '黒字倒産です。利益は出ていた（純資産はプラス）のに、手元の現金が尽きました。',
          term: '黒字倒産',
          points: [
            '売掛金の回収前に、仕入・設備投資・返済・給与の支払いが重なると現金が先に尽きます（利益≠現金）。',
            '在庫や設備を買いすぎると現金が寝ます。売れる分だけ仕入・生産しましょう。',
            '資金が細るときは借入枠を使う／増資で自己資本を厚くするのも手です。',
          ],
        }
      }
      return {
        headline: '資金が尽きて倒産しました（現金がマイナス）。',
        points: [
          '毎月の支出（原価・固定費・人件費・利息）に対して、売上が足りていませんでした。',
          '価格が1個あたり原価を下回っていないか、損益分岐点の販売数に届いているか確認を。',
          '固定費が重いなら、それに見合う売上まで伸ばすか、コストを見直しましょう。',
        ],
      }
    }
    // 債務超過（純資産マイナス）
    return {
      headline: '債務超過（純資産がマイナス）で倒産しました。損失が積み重なりました。',
      points: [
        '毎期の赤字が利益剰余金を削り、純資産がマイナスになりました。',
        'まずは単月の黒字を目指しましょう（損益分岐点の販売数・価格）。',
        '突発ショックが痛手だったなら、保険・保全で備えるのも有効です。',
      ],
    }
  }

  return { headline: 'ゲーム終了。', points: ['お疲れさまでした。'] }
}
