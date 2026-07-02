import type {
  CompanyState,
  Decision,
  IncomeStatement,
  CashFlowStatement,
  SimParams,
  TurnOptions,
  TurnResult,
  ProductLineParams,
  ProductLineState,
  LineDecision,
  LineResult,
  DevInProgress,
  DevLaunched,
  Employee,
  EmployeeRole,
} from '@core/types'
import { demandAt } from '@core/market/demand'
import { productFromRd } from '@core/product/research'
import { assessCredit } from '@core/finance/credit'
import { productionCapacity, laborCapacity, costEfficiency } from '@core/finance/capacity'
import { sharesIssued } from '@core/finance/shares'
import { composeLineDefs, findDevProject, developmentAssetOf } from '@core/product/dev'
import {
  synthesizeEmployees,
  nextEmployeeId,
  selectLeavers,
  hrLaborCapacityPerYear,
  avgMorale,
  avgSkill,
  updateEmployeesEndOfTurn,
} from '@core/hr/hr'

/** 0..1 にクランプ。 */
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

/** 販促費から需要乗数を求める（逓減効果、上限あり）。 */
export function marketingMultiplier(spend: number, params: SimParams): number {
  if (spend <= 0) return 1
  return 1 + params.marketingEffect * (spend / (spend + params.marketingHalf))
}

/**
 * 1ターン（1会計期間）を解決する純粋関数。発生主義＋原材料インベントリの簡易モデル。
 *
 * 物理フロー（数量と金額の両方を移動平均で管理）:
 *   ①原材料の仕入（当期スポット単価 × 数量）→ 原材料在庫へ（数量↑・金額↑）
 *   ②生産：手持ち原材料を上限に produce 個。原材料を移動平均単価で消費し、
 *     その金額を製品在庫へ「価値保存の振替」（資産の再分類＝恒等式不変）
 *   ③販売：需要分を製品在庫から販売。売上原価は製品の移動平均単価
 *
 * スポット単価 = unitVariableCost × materialIndex × product.unitCostModifier
 *   （市況 materialIndex と R&D の原価改善 unitCostModifier を反映）
 *
 * 売掛/買掛（買掛は当期の原材料仕入に対して）、減価償却、支払利息、法人税は従来どおり。
 * 棚卸資産の増減は常に「仕入＋振替−売上原価」で閉じ、
 * 「営業 CF = 純利益 + 減価償却 − ΔAR − Δ棚卸 + ΔAP」が成立、会計恒等式を常に維持。
 */
export function resolveTurn(
  state: CompanyState,
  decision: Decision,
  params: SimParams,
  options: TurnOptions = {},
): TurnResult {
  const bs = state.balanceSheet
  // 1ターンの長さ（年→期間）。流量はこの係数でスケールする。
  const ppy = params.periodsPerYear ?? 1
  const periodFactor = 1 / ppy
  // マクロ（物価指数・景気需要倍率）。未注入なら無効（1.0）。
  const inflationIndex = options.inflationIndex ?? 1
  const macroDemandMultiplier = options.macroDemandMultiplier ?? 1

  // 当期の設備投資は 0 フロア（負値は設備処分を意味しないため無効化＝簿価を負にしない）。
  const capex = Math.max(0, decision.capitalExpenditure)
  // 当期の設備投資は当期から有効（期首設備＋当期 capex）。能力・コストに即反映する。
  const opEquipment = bs.fixedAssets.equipment + capex

  // === 労働（人材開発 hr のあるシナリオは従業員個人モデル・無ければ従来のスカラー） ===
  // hr モード: employees が真実源（headcount は Σ の導出値）。未保持の従来セーブは
  // 等級1の現場社員に合成（開始時パリティ＝スキル1・士気中立で従来と同値。移行不要）。
  const hr = params.hr
  let employeesWorking: Employee[] | undefined = hr
    ? (state.employees ?? synthesizeEmployees(state.headcount ?? 0, 'field', hr, 0))
    : undefined

  // 採用（当期から即戦力）。hr では役割別採用（スカラー hire は現場採用として併用可）。
  const hire = Math.max(0, decision.hire)
  let hiresTotal = hire
  if (hr && employeesWorking) {
    let list = employeesWorking.slice()
    let nid = nextEmployeeId(list)
    const roleHires: [EmployeeRole, number][] = [
      ['field', hire + Math.max(0, Math.round(decision.hireRoles?.field ?? 0))],
      ['mgmt', Math.max(0, Math.round(decision.hireRoles?.mgmt ?? 0))],
      ['rnd', Math.max(0, Math.round(decision.hireRoles?.rnd ?? 0))],
    ]
    hiresTotal = 0
    for (const [role, n] of roleHires) {
      list = list.concat(synthesizeEmployees(n, role, hr, nid))
      nid += n
      hiresTotal += n
    }
    employeesWorking = list
  }
  // 解雇は在籍数（期首＋当期採用）まで。hr では士気の低い順・新しい順に退出（決定論）。
  const fire = Math.min(
    Math.max(0, decision.fire),
    hr && employeesWorking ? employeesWorking.length : (state.headcount ?? 0) + hire,
  )
  if (hr && employeesWorking) {
    employeesWorking = selectLeavers(employeesWorking, fire)[0]
  }
  const headcountAfterDecision =
    hr && employeesWorking ? employeesWorking.length : (state.headcount ?? 0) + hire - fire
  // 給与水準（相場＝物価連動の市場賃金＝1.0）。低いほど人件費は下がるが離職率が上がる。
  const wageMult = Math.max(0, decision.wageLevel) / 100
  // 自主退職（離職）: 相場割れ ＋（hr）低士気。士気が中立なら hr 項は 0＝開始時パリティ。
  const shortfall = Math.max(0, 1 - wageMult)
  let quitRate =
    params.attritionSlope != null
      ? Math.min(params.maxAttrition ?? 1, params.attritionSlope * shortfall)
      : 0
  if (hr && employeesWorking) {
    const am = avgMorale(employeesWorking, hr)
    quitRate = Math.min(
      params.maxAttrition ?? 1,
      quitRate + hr.attritionMoraleSlope * Math.max(0, hr.attritionMoraleFloor - am),
    )
  }
  // 浮動小数の丸め境界（例 0.5）を安定して切り上げるため微小εを加える。
  const attritionQuits = Math.round(headcountAfterDecision * quitRate + 1e-9)
  if (hr && employeesWorking) {
    employeesWorking = selectLeavers(employeesWorking, attritionQuits)[0]
  }
  const headcount =
    hr && employeesWorking ? employeesWorking.length : Math.max(0, headcountAfterDecision - attritionQuits)

  // 当期の生産能力＝設備能力と労働能力の小さい方（設備か人手のボトルネック）。全ライン共有。
  // hr は現場のスキル×士気×管理職のチーム効率で個人単位に積み上げ（中立で従来と同値）。
  const laborCap =
    hr && employeesWorking && params.laborPerHead
      ? Math.floor(hrLaborCapacityPerYear(employeesWorking, params.laborPerHead, hr) * periodFactor)
      : laborCapacity(headcount, params, periodFactor)
  const capacity = Math.min(productionCapacity(opEquipment, params, periodFactor), laborCap)

  // 期首残高
  const cashBegin = bs.currentAssets.cash
  const arBegin = bs.currentAssets.accountsReceivable
  const rawValBegin = bs.currentAssets.rawMaterials
  const finValBegin = bs.currentAssets.finishedGoods
  const apBegin = bs.currentLiabilities.accountsPayable

  // === 製品ライン（複数製品）。lines が真実源＝単一製品も「1ラインのループ」として同じ経路を通る ===
  // ライン定義: composeLineDefs が唯一のソース（シナリオ定義＋商材開発でローンチ済みの新ライン、
  // upgrade の需要ブースト×lifecycle を合成）。期首状態から決定論的に導出＝プレビューと確定が一致。
  const lineDefs: ProductLineParams[] = composeLineDefs(params, state, state.turn)
  // ライン状態: 未保持（従来セーブ・初期状態）はライン0にスカラー在庫/累積R&Dを包む（移行不要の後方互換）。
  const linesBegin: ProductLineState[] = lineDefs.map((_, i) => {
    const held = state.lines?.[i]
    if (held) return held
    if (i === 0) {
      return {
        materialUnits: Math.max(0, state.materialUnits),
        materialValue: bs.currentAssets.rawMaterials,
        finishedUnits: Math.max(0, state.finishedUnits),
        finishedValue: bs.currentAssets.finishedGoods,
        rdStock: state.rdStock,
      }
    }
    return { materialUnits: 0, materialValue: 0, finishedUnits: 0, finishedValue: 0, rdStock: 0 }
  })
  // ライン判断: 未指定なら従来のスカラー判断をライン0に適用（他ラインは休止）。
  const lineDecs: LineDecision[] = lineDefs.map((lp, i) => {
    const given = decision.lines?.[i]
    if (given) return given
    if (i === 0) {
      return {
        unitPrice: decision.unitPrice,
        purchaseMaterials: decision.purchaseMaterials,
        produceUnits: decision.produceUnits,
        marketingSpend: decision.marketingSpend,
        rdSpend: decision.rdSpend,
      }
    }
    return { unitPrice: lp.basePrice, purchaseMaterials: 0, produceUnits: 0, marketingSpend: 0, rdSpend: 0 }
  })

  // --- ① ライン別の仕入（移動平均）と生産希望（能力按分の入力） ---
  const works = lineDefs.map((lp, i) => {
    const st = linesBegin[i]
    const dec = lineDecs[i]
    // ライン別 R&D → 製品パラメータ（rd 係数はライン上書き可・未指定は全社値）。
    const lineProduct = productFromRd(st.rdStock, {
      ...params,
      rdCostReductionMax: lp.rdCostReductionMax ?? params.rdCostReductionMax,
      rdDemandBoostMax: lp.rdDemandBoostMax ?? params.rdDemandBoostMax,
      rdHalf: lp.rdHalf ?? params.rdHalf,
    })
    // ライン別スポット単価（物価 × 市況 × ラインR&D原価改善 × 設備の規模の経済）。市況指数は全社1本。
    const spotCost = Math.max(
      0,
      Math.round(
        lp.unitVariableCost *
          inflationIndex *
          state.materialIndex *
          lineProduct.unitCostModifier *
          costEfficiency(opEquipment, params),
      ),
    )
    const purchaseUnits = Math.max(0, dec.purchaseMaterials)
    const purchaseCost = spotCost * purchaseUnits
    const rawUnitsAfterBuy = st.materialUnits + purchaseUnits
    const rawValAfterBuy = st.materialValue + purchaseCost
    const rawAvg = rawUnitsAfterBuy > 0 ? rawValAfterBuy / rawUnitsAfterBuy : 0
    // 生産希望＝希望数量と手持ち原材料の小さい方（能力は次段で按分）。
    const want = Math.min(Math.max(0, dec.produceUnits), rawUnitsAfterBuy)
    return { lp, st, dec, lineProduct, spotCost, purchaseUnits, purchaseCost, rawUnitsAfterBuy, rawValAfterBuy, rawAvg, want }
  })

  // --- 共有能力の按分（希望比で floor → 剰余はライン順に+1 ＝ 決定論・Σ≤capacity） ---
  const totalWant = works.reduce((s, w) => s + w.want, 0)
  const alloc = works.map((w) =>
    !Number.isFinite(capacity) || totalWant <= capacity ? w.want : Math.floor((capacity * w.want) / totalWant),
  )
  if (Number.isFinite(capacity) && totalWant > capacity) {
    let rest = capacity - alloc.reduce((s, a) => s + a, 0)
    for (let i = 0; i < alloc.length && rest > 0; i++) {
      if (alloc[i] < works[i].want) {
        alloc[i]++
        rest--
      }
    }
  }

  // --- ②③ ライン別の生産（価値保存の振替）と販売。全社集計を積み上げる ---
  const demandMultiplier = options.demandMultiplier ?? 1
  const shareMultiplier = options.demandShareMultiplier ?? 1
  // 需要ブレ（確定時のみ。プレビューは未指定＝1で中心値）。実際の販売に不確実性を持たせる。
  const demandNoise = options.demandNoise ?? 1
  // 全社レベルの需要乗数（上場の知名度・買収した顧客基盤・（hr）熟練による品質）。単一の適用点で全ラインに掛ける。
  const hrSkillExcess =
    hr && employeesWorking && hr.skillFromExpMax > 0
      ? Math.min(1, Math.max(0, (avgSkill(employeesWorking, hr) - 1) / hr.skillFromExpMax))
      : 0
  const companyDemandMultiplier =
    (state.listed ? 1 + (params.listingDemandBoost ?? 0) : 1) *
    (state.acquiredCompetitor ? 1 + (params.acqTargetDemandBoost ?? 0) : 1) *
    (1 + (hr?.skillDemandMax ?? 0) * hrSkillExcess)

  const linesEnd: ProductLineState[] = []
  const lineResults: LineResult[] = []
  let purchaseCost = 0
  let revenue = 0
  let costOfGoodsSold = 0
  let unitsSold = 0
  let demand = 0
  let availableToSell = 0
  let marketingSpendTotal = 0
  let rdSpendTotal = 0
  works.forEach((w, i) => {
    const produced = Math.min(w.want, alloc[i])
    const consumedRawValue = Math.round(produced * w.rawAvg)
    const finUnitsAfterProduce = w.st.finishedUnits + produced
    const finValAfterProduce = w.st.finishedValue + consumedRawValue // 価値保存の振替（恒等式の要）
    const finAvg = finUnitsAfterProduce > 0 ? finValAfterProduce / finUnitsAfterProduce : 0
    // 物価上昇時に名目価格を据え置くと実質値下げ→需要増（unitPrice を物価で割る）。
    const rawDemand = demandAt(w.dec.unitPrice / inflationIndex, {
      ...params,
      baseDemand: w.lp.baseDemand,
      basePrice: w.lp.basePrice,
      priceElasticity: w.lp.priceElasticity,
    })
    const lineDemand = Math.max(
      0,
      Math.round(
        rawDemand *
          marketingMultiplier(w.dec.marketingSpend, params) *
          demandMultiplier *
          macroDemandMultiplier *
          companyDemandMultiplier *
          w.lineProduct.demandModifier *
          shareMultiplier *
          periodFactor *
          demandNoise,
      ),
    )
    const sold = Math.min(lineDemand, finUnitsAfterProduce)
    const lineRevenue = Math.round(w.dec.unitPrice * sold)
    const lineCOGS = Math.round(sold * finAvg)
    linesEnd.push({
      materialUnits: w.rawUnitsAfterBuy - produced,
      materialValue: w.rawValAfterBuy - consumedRawValue,
      finishedUnits: finUnitsAfterProduce - sold,
      finishedValue: finValAfterProduce - lineCOGS,
      rdStock: w.st.rdStock + Math.max(0, w.dec.rdSpend),
    })
    lineResults.push({
      id: w.lp.id,
      name: w.lp.name,
      demand: lineDemand,
      unitsSold: sold,
      revenue: lineRevenue,
      costOfGoodsSold: lineCOGS,
      availableToSell: finUnitsAfterProduce,
      effectiveUnitCost: w.spotCost,
    })
    purchaseCost += w.purchaseCost
    revenue += lineRevenue
    costOfGoodsSold += lineCOGS
    unitsSold += sold
    demand += lineDemand
    availableToSell += finUnitsAfterProduce
    marketingSpendTotal += Math.max(0, w.dec.marketingSpend)
    rdSpendTotal += Math.max(0, w.dec.rdSpend)
  })
  // （hr）研究職の R&D 寄与: 毎期ライン0の rdStock に加算（Σ(lines)=rdStock の不変条件を保ったまま）。
  if (hr && employeesWorking && hr.rndContribPerYear && linesEnd.length > 0) {
    const rndCount = employeesWorking.filter((e) => e.role === 'rnd').length
    if (rndCount > 0) {
      const contrib = Math.round(hr.rndContribPerYear * rndCount * periodFactor)
      linesEnd[0] = { ...linesEnd[0], rdStock: linesEnd[0].rdStock + contrib }
    }
  }
  // 全社集計（B/S・在庫Δに使う。スカラーの materialUnits 等は以後 Σ(lines) の導出値として書く）
  const rawUnitsEnd = linesEnd.reduce((s, l) => s + l.materialUnits, 0)
  const rawValEnd = linesEnd.reduce((s, l) => s + l.materialValue, 0)
  const finUnitsEnd = linesEnd.reduce((s, l) => s + l.finishedUnits, 0)
  const finValEnd = linesEnd.reduce((s, l) => s + l.finishedValue, 0)
  const rdStockEnd = linesEnd.reduce((s, l) => s + l.rdStock, 0)
  const spotCost = lineResults[0]?.effectiveUnitCost ?? 0
  const product = works[0]?.lineProduct ?? productFromRd(state.rdStock, params)

  // === 商材開発（開発費の資産計上/費用処理・無形資産の償却・自動ローンチ） ===
  // 会計: capitalize=true は 現金↓＝開発資産↑（投資CF・P/L無傷）→ 完成後に毎期償却（のれん同型）。
  //       capitalize=false（カフェのメニュー等）は即・販管費＝費用処理（資産化との対比が学び）。
  const devFeature = (params.devProjects?.length ?? 0) > 0
  // ① 償却（期首のローンチ済み資産。簿価が小さくなっても最低1円/期で必ず償却し切る）。
  let devAmortized = 0
  const devLaunchedAfterAmort: DevLaunched[] = (state.devLaunched ?? []).map((d) => {
    const proj = findDevProject(params, d.projectId)
    if (!proj?.capitalize || d.bookValue <= 0 || !proj.amortRate) return { ...d }
    const amort = Math.min(d.bookValue, Math.max(1, Math.round(d.bookValue * proj.amortRate * periodFactor)))
    devAmortized += amort
    return { ...d, bookValue: d.bookValue - amort }
  })
  // ② 当期の開発投資（プロジェクトごとに「残り必要額」でクランプ＝現金の無限パーキングを防ぐ）。
  let devCapitalized = 0
  let devExpensed = 0
  const devWipAfterSpend: DevInProgress[] = (state.devInProgress ?? []).map((w) => ({ ...w }))
  if (devFeature && decision.devSpend) {
    for (const [pid, raw] of Object.entries(decision.devSpend)) {
      const proj = findDevProject(params, pid)
      if (!proj) continue
      if (devLaunchedAfterAmort.some((d) => d.projectId === pid)) continue // 完成済みは再開発しない
      const cur = devWipAfterSpend.find((w) => w.projectId === pid)
      const invested = cur?.invested ?? 0
      const spend = Math.min(Math.max(0, Math.round(raw)), Math.max(0, proj.requiredInvestment - invested))
      if (spend <= 0) continue
      if (proj.capitalize) devCapitalized += spend
      else devExpensed += spend
      if (cur) cur.invested += spend
      else devWipAfterSpend.push({ projectId: pid, invested: spend, startedTurn: state.turn })
    }
  }
  // ③ 完成判定（期末）: 必要額＋最短期間の到達で自動ローンチ。効果は翌期から（M&A と同じ期末反映）。
  //    振替は同一 B/S 科目（開発資産）内＝B/S は動かない。費用処理案件の簿価は 0（資産が無いので償却も無い）。
  const launchedProjectIds: string[] = []
  const devWipEnd: DevInProgress[] = []
  const devLaunchedEnd: DevLaunched[] = [...devLaunchedAfterAmort]
  for (const w of devWipAfterSpend) {
    const proj = findDevProject(params, w.projectId)
    const elapsed = state.turn - w.startedTurn + 1
    if (proj && w.invested >= proj.requiredInvestment && elapsed >= proj.minTurns) {
      launchedProjectIds.push(w.projectId)
      devLaunchedEnd.push({
        projectId: w.projectId,
        launchedTurn: state.turn + 1,
        bookValue: proj.capitalize ? w.invested : 0,
      })
    } else {
      devWipEnd.push(w)
    }
  }
  const devAssetEnd = developmentAssetOf(params, { devInProgress: devWipEnd, devLaunched: devLaunchedEnd })

  // --- 損益計算書（P/L） ---
  const grossProfit = revenue - costOfGoodsSold
  // 固定費（物価で増減）・減価償却は年額を期間でスケール。
  const fixedCosts = Math.round(params.fixedCosts * inflationIndex * periodFactor)
  const depreciation = Math.round(bs.fixedAssets.equipment * params.depreciationRate * periodFactor)
  // 販促・R&D はライン別支出の合計（単一製品はライン0＝従来スカラーと同値）。
  const marketingSpend = marketingSpendTotal
  const rdSpend = rdSpendTotal
  const insuranceSpend = Math.max(0, decision.insuranceSpend)
  const maintenanceSpend = Math.max(0, decision.maintenanceSpend)
  // 人件費＝従業員数 × 市場賃金(wage×物価指数) × 給与水準。未設定の wage は労働モデル無効＝0。
  // hr は等級別の賃金倍率で個人単位に積み上げ（全員等級1なら従来と同値＝昇進で自然に人件費が上がる）。
  const laborCost = params.wage
    ? hr && employeesWorking
      ? Math.round(
          employeesWorking.reduce(
            (s, e) => s + params.wage! * (hr.grades[Math.min(e.grade, hr.grades.length) - 1]?.wageMult ?? 1),
            0,
          ) *
            inflationIndex *
            wageMult *
            periodFactor,
        )
      : Math.round(headcount * params.wage * inflationIndex * wageMult * periodFactor)
    : 0
  const hiringCost = hiresTotal * (params.hireCost ?? 0)
  // 研修費（hr のみ。費用処理＝販管費。人的資本は B/S に載らない＝開発資産との対比が学び）。
  const trainingSpend = hr ? Math.max(0, Math.round(decision.trainingSpend ?? 0)) : 0
  const severanceCost = fire * (params.severance ?? 0)
  // 上場維持コスト（監査・IR・ガバナンス）。上場中は毎期かかる固定的費用（年額を期間スケール・物価連動）。
  const listingCostNow =
    state.listed && params.listingCost
      ? Math.round(params.listingCost * inflationIndex * periodFactor)
      : 0
  // のれん償却（期首ののれん簿価×年率を期間スケール）。減価償却と同じく非現金費用＝営業CFで足し戻す。
  const goodwillBegin = bs.fixedAssets.goodwill ?? 0
  const goodwillAmort = Math.round(goodwillBegin * (params.goodwillAmortRate ?? 0) * periodFactor)
  const operatingExpenses =
    fixedCosts +
    depreciation +
    marketingSpend +
    rdSpend +
    insuranceSpend +
    maintenanceSpend +
    laborCost +
    hiringCost +
    severanceCost +
    listingCostNow +
    goodwillAmort +
    devExpensed + // 費用処理の開発費（カフェのメニュー等）
    devAmortized + // 開発資産の償却（非現金・営業CFで足し戻す）
    trainingSpend // 研修費（hr・費用処理）
  const operatingIncome = grossProfit - operatingExpenses

  // 実効金利＝政策金利（マクロ）＋銀行スプレッド＋信用スプレッド（期首の財務状態で評価）。
  const credit = assessCredit(state)
  const effectiveInterestRate = (options.policyRate ?? 0) + params.interestRate + credit.spread
  const debt = bs.currentLiabilities.shortTermDebt + bs.nonCurrentLiabilities.longTermDebt
  const interestExpense = Math.round(debt * effectiveInterestRate * periodFactor)

  // 突発ショック（保険で一部ヘッジ）。損失額は会社規模に連動（比率×規模、絶対額は下限 floor）。
  // 毀損度のばらつき severity は確定時のみ注入（プレビューは未指定＝1で中心値）。
  const severity = Math.max(0, options.lossSeverity ?? 1)
  const annualRevenue = revenue * ppy // 月次フロー→年商（係数を年額基準にしてppyに不変）
  const annualOpInc = Math.max(0, operatingIncome) * ppy // 赤字は0クリップ（利益連動の上乗せ無し）

  // 一時損失（訴訟・リコール）: 年商×係数 ＋ 年間営業利益×係数。下限 floor、任意の年商比 cap。
  const oneOffFloor = Math.max(0, options.oneOffLoss ?? 0)
  const oneOffScaled =
    (options.oneOffLossRevenueRatio ?? 0) * annualRevenue +
    (options.oneOffLossProfitRatio ?? 0) * annualOpInc
  let oneOffLoss = Math.max(oneOffFloor, Math.round(oneOffScaled * severity))
  if (options.oneOffLossCapRatio != null) {
    const cap = Math.round(options.oneOffLossCapRatio * annualRevenue)
    oneOffLoss = Math.max(oneOffFloor, Math.min(oneOffLoss, cap)) // floor は cap より優先（下限保証）
  }

  // 設備毀損（故障・災害）: 期首設備簿価×係数（ストックなので ppy 非依存）。下限 floor。
  // 保全費（予防保全）で被害を最大 maxMaintenanceReduction まで軽減する（連動・floor の両方に作用）。
  const maintenanceEffect =
    params.maintenanceRefCost && params.maintenanceRefCost > 0
      ? Math.min(params.maxMaintenanceReduction ?? 0, maintenanceSpend / params.maintenanceRefCost)
      : 0
  const maintenanceKeep = 1 - maintenanceEffect
  const equipFloor = Math.max(0, options.equipmentLoss ?? 0) * maintenanceKeep
  const equipScaled = (options.equipmentLossRatio ?? 0) * bs.fixedAssets.equipment * maintenanceKeep
  const rawEquipmentLoss = Math.max(equipFloor, Math.round(equipScaled * severity))
  // 設備の毀損は減価償却後の簿価まで（同期の償却と二重控除でマイナスにしない）。
  const equipmentWritedown = Math.min(rawEquipmentLoss, Math.max(0, bs.fixedAssets.equipment - depreciation))
  const insuranceCoverage =
    params.insuranceRefCost > 0
      ? Math.min(params.maxInsuranceCoverage, insuranceSpend / params.insuranceRefCost)
      : 0
  // 特別損失（P/L）は保険適用後の純額。設備の簿価減は全額だが、保険補償分は現金で戻る。
  const extraordinaryLoss = Math.round((1 - insuranceCoverage) * (oneOffLoss + equipmentWritedown))

  const pretaxIncome = operatingIncome - interestExpense - extraordinaryLoss
  const tax = pretaxIncome > 0 ? Math.round(pretaxIncome * params.effectiveTaxRate) : 0
  const netIncome = pretaxIncome - tax

  const incomeStatement: IncomeStatement = {
    revenue,
    costOfGoodsSold,
    grossProfit,
    operatingExpenses,
    operatingIncome,
    interestExpense,
    extraordinaryLoss,
    pretaxIncome,
    tax,
    netIncome,
  }

  // --- 期末の発生主義（売掛は売上、買掛は原材料仕入に対して） ---
  const arEnd = Math.round(revenue * params.salesOnCreditRatio)
  const apEnd = Math.round(purchaseCost * params.payableRatio)

  const deltaAR = arEnd - arBegin
  const deltaInventory = rawValEnd + finValEnd - (rawValBegin + finValBegin)
  const deltaAP = apEnd - apBegin

  // --- キャッシュ・フロー計算書（間接法・整合保証） ---
  // 資金調達は信用枠でキャップ（借入は borrowLimit まで、返済は残債まで）。
  const financing =
    decision.financing > 0
      ? Math.min(decision.financing, credit.borrowLimit)
      : Math.max(decision.financing, -bs.nonCurrentLiabilities.longTermDebt)

  // 増資（株式発行）: 現金↑・資本金↑（無利息・返済義務なし）。借入とは別の財務CF。
  // 簿価発行（発行価格＝期首BVPS）で新株を発行し、希薄化として株数に反映。
  // 1期の発行は「期首純資産×受け入れ枠」まで（投資家の需要には限りがある＝無制限の資本注入で目標やB/Sが壊れるのを防ぐ）。
  const equityBegin = bs.equity.capitalStock + bs.equity.retainedEarnings
  const equityIssueCap = Math.round(Math.max(0, equityBegin) * (params.equityIssueCapRatio ?? 0.25))
  const equityIssue = Math.min(Math.max(0, decision.equityIssuance), equityIssueCap)
  const newShares = sharesIssued(equityIssue, equityBegin, state.sharesOutstanding ?? 0)

  // IPO（新規上場・一度きり）: 公募価格＝時価総額（options.ipoValuation＝年間純利益×PER）÷既存株数。
  // 未上場・株式基盤あり・バリュエーション>0 のときだけ成立（UIゲートに頼らずエンジンでも自衛）。
  // 調達は時価総額×ipoMaxRaiseRatio まで（無制限の資本注入を防ぐ）。調達分は paidInSinceStart に加算。
  const ipoValuationNow = Math.max(0, options.ipoValuation ?? 0)
  const sharesBegin = state.sharesOutstanding ?? 0
  let ipoProceeds = 0
  let ipoShares = 0
  if (decision.goPublic && !state.listed && sharesBegin > 0 && ipoValuationNow > 0) {
    const maxRaise = Math.round(ipoValuationNow * (params.ipoMaxRaiseRatio ?? 0.5))
    ipoProceeds = Math.min(Math.max(0, Math.round(decision.goPublic.proceeds)), maxRaise)
    const offerPrice = ipoValuationNow / sharesBegin
    ipoShares = offerPrice > 0 ? Math.round(ipoProceeds / offerPrice) : 0
    if (ipoShares <= 0) ipoProceeds = 0 // 株が発行できない規模なら不成立（株なき資本注入を作らない）
  }
  const listedNow = state.listed === true || ipoProceeds > 0

  // 配当（株主還元）: 利益剰余金と期首現金の小さい方まで。剰余金↓・現金↓・財務CF↓＝同額減で恒等式維持。
  // 期中の資金繰りまでは守らない（設備投資と同じ思想＝判断は自由、プレビューの現金警告が知らせる）。
  const dividendPaid = Math.min(
    Math.max(0, Math.round(decision.dividend)),
    Math.max(0, Math.min(bs.equity.retainedEarnings, cashBegin)),
  )

  // M&A（競合の買収・一度きり）: 対価＝現金＋借入＋株式。取得会計＝受入純資産（設備）との差がのれん。
  //  - 借入対価は通常の financing と合算で信用枠内（素通りの抜け穴を作らない）
  //  - 株式対価は BVPS>0 のときのみ（株なき資本注入を作らない）。調達分は paidInSinceStart に加算
  //  - 対価合計が受入純資産未満は不成立（負ののれんは扱わない＝恒等式が恒等的に成立する範囲に限定）
  //  - 受け入れた設備・人員・需要ブーストは期末に反映（翌期から稼働）
  let acqCash = 0
  let acqDebt = 0
  let acqStock = 0
  let acqStockShares = 0
  let acqGoodwill = 0
  let acqEquipment = 0
  let acqHeads = 0
  const targetNetAssets = params.acqTargetNetAssets ?? 0
  if (decision.acquire && !state.acquiredCompetitor && targetNetAssets > 0) {
    acqCash = Math.max(0, Math.round(decision.acquire.cashPaid))
    const debtHeadroom = Math.max(0, credit.borrowLimit - Math.max(0, financing))
    acqDebt = Math.min(Math.max(0, Math.round(decision.acquire.debtRaised)), debtHeadroom)
    const bvpsNow = sharesBegin > 0 ? equityBegin / sharesBegin : 0
    acqStock = bvpsNow > 0 ? Math.max(0, Math.round(decision.acquire.stockValue)) : 0
    acqStockShares = bvpsNow > 0 ? Math.round(acqStock / bvpsNow) : 0
    if (acqStockShares <= 0) acqStock = 0
    const consideration = acqCash + acqDebt + acqStock
    if (consideration >= targetNetAssets) {
      acqEquipment = targetNetAssets // 受入純資産＝ターゲットの設備簿価（負債なしの簡易モデル）
      acqGoodwill = consideration - targetNetAssets
      acqHeads = Math.max(0, params.acqTargetHeadcount ?? 0)
    } else {
      // 不成立（対価不足）。何も動かさない。
      acqCash = 0
      acqDebt = 0
      acqStock = 0
      acqStockShares = 0
    }
  }
  const acquisitionConsideration = acqCash + acqDebt + acqStock
  const acquiredNow = state.acquiredCompetitor === true || acquisitionConsideration > 0

  // 非現金の設備減（減価償却＋設備毀損）・のれん償却・開発資産の償却を足し戻す
  // （devAmortized は nonCashEquipReduction と分離＝設備簿価の減額と混ぜない。二重控除の回避）。
  const nonCashEquipReduction = depreciation + equipmentWritedown
  const operating =
    netIncome + nonCashEquipReduction + goodwillAmort + devAmortized - deltaAR - deltaInventory + deltaAP
  // 買収に支払った現金（自己資金＋借入分）と資産計上した開発投資は投資CF。
  const investing = -capex - devCapitalized - (acqCash + acqDebt)
  const financingCF = financing + equityIssue + ipoProceeds + acqDebt - dividendPaid // 借入＋増資＋IPO＋買収借入−配当
  const netChange = operating + investing + financingCF
  const cashEnd = cashBegin + netChange

  const cashFlow: CashFlowStatement = {
    operating,
    investing,
    financing: financingCF,
    netChange,
    cashBegin,
    cashEnd,
  }

  // 設備の整備状態（保全費の累積で上がり、放置で逓減）。次ターンの故障発生率を左右する。
  // B/S 外のメタ変数（資産計上しない）なので恒等式に無干渉。
  const conditionNext =
    params.conditionDecay != null
      ? clamp01(
          (state.condition ?? 1) -
            params.conditionDecay +
            (params.conditionGainPerRefCost ?? 0) *
              (params.maintenanceRefCost && params.maintenanceRefCost > 0
                ? maintenanceSpend / params.maintenanceRefCost
                : 0),
        )
      : (state.condition ?? 1)

  // === （hr）期末の従業員更新: 経験・士気・昇進。過重労働＝「希望生産＞能力」（能力以上を求め続けると疲弊）。
  // 士気は state 経由で翌期の生産性・離職に効く（整備状態 condition と同じ翌期反映パターン＝循環なし）。
  const hrOverworked =
    hr != null && Number.isFinite(capacity) && totalWant > capacity * (hr.overworkThreshold ?? 1.15)
  let employeesEnd: Employee[] | undefined
  let hrPromotions = 0
  if (hr && employeesWorking) {
    const upd = updateEmployeesEndOfTurn(employeesWorking, hr, {
      trainingSpend,
      overworked: hrOverworked,
      wageShortfall: shortfall,
    })
    employeesEnd = upd.employees
    hrPromotions = upd.promotions
    // M&A で受け入れた人員は期末に合流（等級1・中立士気の現場として）。
    if (acqHeads > 0) {
      employeesEnd = employeesEnd.concat(
        synthesizeEmployees(acqHeads, 'field', hr, nextEmployeeId(employeesEnd)),
      )
    }
  }

  // --- 期末の貸借対照表（B/S）と状態 ---
  const nextState: CompanyState = {
    turn: state.turn + 1,
    // スカラーは Σ(lines) の導出値（lines が真実源。ドリフト不可能＝毎期ここで上書き）。
    materialUnits: rawUnitsEnd,
    finishedUnits: finUnitsEnd,
    materialIndex: options.nextMaterialIndex ?? state.materialIndex,
    rdStock: rdStockEnd,
    lines: linesEnd,
    condition: conditionNext,
    // 買収で受け入れた人員は期末に合流（翌期から人件費・労働能力に反映）。
    // hr では employees が真実源で headcount は Σ の導出値。
    headcount: hr && employeesEnd ? employeesEnd.length : headcount + acqHeads,
    employees: hr ? employeesEnd : undefined,
    // 株式が未設定のシナリオ（チュートリアル等）は未設定のまま保つ（後方互換）。
    sharesOutstanding:
      state.sharesOutstanding == null && newShares === 0 && ipoShares === 0 && acqStockShares === 0
        ? undefined
        : (state.sharesOutstanding ?? 0) + newShares + ipoShares + acqStockShares,
    // 調達累積（目標の「稼いだ純資産」判定に使う）。未調達なら undefined のまま（セーブ後方互換）。
    paidInSinceStart:
      state.paidInSinceStart == null && equityIssue + ipoProceeds + acqStock === 0
        ? undefined
        : (state.paidInSinceStart ?? 0) + equityIssue + ipoProceeds + acqStock,
    // 上場ステータス（IPO 成立で true。未上場は undefined のまま＝セーブ後方互換）。
    listed: listedNow ? true : undefined,
    // 競合買収ステータス（成立で true・以後シェア争い消滅＋需要ブースト）。
    acquiredCompetitor: acquiredNow ? true : undefined,
    // 商材開発の状態（devProjects のあるシナリオでのみ書く。空なら undefined＝セーブ後方互換）。
    devInProgress: devFeature && devWipEnd.length > 0 ? devWipEnd : undefined,
    devLaunched: devFeature && devLaunchedEnd.length > 0 ? devLaunchedEnd : undefined,
    balanceSheet: {
      currentAssets: {
        cash: cashEnd,
        accountsReceivable: arEnd,
        rawMaterials: rawValEnd,
        finishedGoods: finValEnd,
      },
      fixedAssets: {
        equipment: bs.fixedAssets.equipment - nonCashEquipReduction + capex + acqEquipment,
        // のれん＝期首−償却＋当期買収分。未保有なら undefined のまま（後方互換）。
        goodwill:
          bs.fixedAssets.goodwill == null && acqGoodwill === 0
            ? undefined
            : goodwillBegin - goodwillAmort + acqGoodwill,
        // 開発資産＝Σ(仕掛の累計投資)＋Σ(無形資産の残存簿価) の導出値。未保有なら undefined のまま。
        developmentAsset:
          bs.fixedAssets.developmentAsset == null && devAssetEnd === 0 ? undefined : devAssetEnd,
      },
      currentLiabilities: {
        accountsPayable: apEnd,
        shortTermDebt: bs.currentLiabilities.shortTermDebt,
      },
      nonCurrentLiabilities: {
        longTermDebt: bs.nonCurrentLiabilities.longTermDebt + financing + acqDebt,
      },
      equity: {
        capitalStock: bs.equity.capitalStock + equityIssue + ipoProceeds + acqStock,
        retainedEarnings: bs.equity.retainedEarnings + netIncome - dividendPaid,
      },
    },
  }

  return {
    state: nextState,
    incomeStatement,
    cashFlow,
    unitsSold,
    demand,
    availableToSell,
    effectiveUnitCost: spotCost,
    product,
    deltaAR,
    deltaInventory,
    deltaAP,
    creditGrade: credit.grade,
    effectiveInterestRate,
    appliedFinancing: financing,
    insuranceCoverage,
    attritionQuits,
    dividendPaid,
    ipoProceeds,
    goodwillAmortized: goodwillAmort,
    acquisitionConsideration,
    devCapitalized,
    devExpensed,
    devAmortized,
    launchedProjectIds,
    hrAvgSkill: hr && employeesEnd ? avgSkill(employeesEnd, hr) : undefined,
    hrAvgMorale: hr && employeesEnd ? avgMorale(employeesEnd, hr) : undefined,
    hrPromotions: hr ? hrPromotions : undefined,
    hrOverworked: hr ? hrOverworked : undefined,
    lineResults,
    shockOneOffLoss: oneOffLoss,
    shockEquipmentWritedown: equipmentWritedown,
    capacity,
  }
}
