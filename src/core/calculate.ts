import { furusatoComparison2025 } from "../data/2025-furusato.js";
import { DEFAULT_YEAR, getTaxYear } from "../data/index.js";
import type { TaxYearData } from "../data/types.js";
import {
  estimate,
  furusatoLimit,
  furusatoLimitDetail,
  lifeInsuranceDeduction,
  medicalDeduction,
  medicalFloor,
  perCapitaExemptLimitMax,
  type Scenario,
} from "./estimate.js";
import { filingGuide } from "./filing.js";
import type {
  BlueReturn,
  BlueReturnMeasure,
  BlueReturnOption,
  CombinedMeasure,
  ContributionMeasure,
  FurusatoComparison,
  FurusatoMeasure,
  FurusatoYearLimit,
  LifeInsuranceResult,
  MedicalDeductionResult,
  MedicalMethod,
  NationalHealthInsuranceMeasure,
  Saving,
  SetsuzeiResult,
  TaxEstimate,
  TaxInput,
} from "./types.js";
import { CORE_MESSAGES, m, withLocale, type CalcOptions } from "./messages.js";
import { InputError, validateInput } from "./validate.js";

/** 日本語の免責の文面（既定の言語のもの） */
export const DISCLAIMER = CORE_MESSAGES.ja.disclaimer;

const BLUE_LEVELS: readonly BlueReturn[] = ["none", "10", "55", "65"];

function blueAmount(level: BlueReturn): number {
  return level === "none" ? 0 : Number(level) * 10_000;
}

function saving(before: TaxEstimate, after: TaxEstimate): Saving {
  const incomeTax = before.incomeTax.total - after.incomeTax.total;
  const residentTax = before.residentTax.total - after.residentTax.total;
  return { incomeTax, residentTax, total: incomeTax + residentTax };
}

const NO_SAVING: Saving = { incomeTax: 0, residentTax: 0, total: 0 };



/**
 * 掛金を upTo 円まで追加したときと同じ税額になる、最小の追加額（1,000 円単位に切り上げ）。
 * 所得税と住民税の所得割が 0 円（か下限）になると、それ以上掛金を増やしても税額は減らない。
 */
function effectiveAdditional(data: TaxYearData, base: Scenario, upTo: number): number {
  const taxAt = (x: number): number => estimate(data, { ...base, mutualAid: base.mutualAid + x }).totalTax;
  const floorTax = taxAt(upTo);
  if (taxAt(0) === floorTax) return 0;
  // 税額は掛金に対して単調に減るので二分探索できる
  let lo = 0;
  let hi = upTo;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (taxAt(mid) === floorTax) hi = mid;
    else lo = mid;
  }
  return Math.min(upTo, Math.ceil(hi / 1_000) * 1_000);
}

function contribution(
  data: TaxYearData,
  base: Scenario,
  baseline: TaxEstimate,
  opts: { annualLimit: number; paid: number; requested: number | undefined; notes: string[] },
): ContributionMeasure & { wanted: number } {
  const remaining = Math.max(0, opts.annualLimit - opts.paid);
  const notes = [...opts.notes];
  let additional = opts.requested ?? remaining;
  if (additional > remaining) {
    notes.push(m().additionalOverRemaining(additional, remaining));
    additional = remaining;
  }
  if (opts.paid > opts.annualLimit) {
    notes.push(m().paidOverLimit);
  }
  // 頭打ちにする前の額（残り枠か、指定された額）。まとめて実行した場合の計算はこちらから始める
  const wanted = additional;
  // 税額が減らなくなる額を超えた掛金は提案しない
  let noEffectBeyond: number | null = null;
  const effective = effectiveAdditional(data, base, additional);
  if (effective < additional) {
    noEffectBeyond = effective;
    notes.unshift(
      effective === 0 ? m().noEffectAtAll : m().noEffectBeyond(effective, additional, opts.requested !== undefined),
    );
    additional = effective;
  }
  const after = estimate(data, { ...base, mutualAid: base.mutualAid + additional });
  return {
    applicable: true,
    annualLimit: opts.annualLimit,
    paid: opts.paid,
    remaining,
    additional,
    noEffectBeyond,
    saving: additional > 0 ? saving(baseline, after) : NO_SAVING,
    notes,
    wanted,
  };
}

/** 計算の途中でだけ使う wanted を外す */
function publish({ wanted: _wanted, ...measure }: ContributionMeasure & { wanted: number }): ContributionMeasure {
  return measure;
}

/** 入力を検証し、既定値を埋めて、計算の土台になるシナリオを作る。 */
function prepare(rawInput: TaxInput): {
  input: ReturnType<typeof validateInput>;
  year: number;
  data: TaxYearData;
  normalized: SetsuzeiResult["input"];
  base: Scenario;
} {
  const input = validateInput(rawInput);
  const year = input.year ?? DEFAULT_YEAR;
  const data = getTaxYear(year);

  const normalized: SetsuzeiResult["input"] = {
    year,
    salaryRevenue: input.salaryRevenue ?? 0,
    businessRevenue: input.businessRevenue ?? 0,
    businessExpenses: input.businessExpenses ?? 0,
    businessIncomeType: input.businessIncomeType ?? "business",
    blueReturn: input.blueReturn ?? "none",
    socialInsurance: input.socialInsurance ?? 0,
    idecoPaid: input.idecoPaid ?? 0,
    kyosaiPaid: input.kyosaiPaid ?? 0,
    furusatoPaid: input.furusatoPaid ?? 0,
    spouse: input.spouse ?? null,
    dependents: {
      general: input.dependents?.general ?? 0,
      specific: input.dependents?.specific ?? 0,
      elderly: input.dependents?.elderly ?? 0,
      elderlyCohabiting: input.dependents?.elderlyCohabiting ?? 0,
      under16: input.dependents?.under16 ?? 0,
    },
    // 特定扶養親族（19〜22 歳）と 16 歳未満の扶養親族は必ず 23 歳未満なので、いれば対象
    incomeAdjustment:
      input.incomeAdjustment === true ||
      (input.dependents?.specific ?? 0) > 0 ||
      (input.dependents?.under16 ?? 0) > 0,
    medicalExpenses: input.medicalExpenses ?? 0,
    medicalReimbursed: input.medicalReimbursed ?? 0,
    selfMedicationExpenses: input.selfMedicationExpenses ?? 0,
    lifeInsuranceNew: input.lifeInsuranceNew ?? 0,
    lifeInsuranceOld: input.lifeInsuranceOld ?? 0,
    medicalCareInsurance: input.medicalCareInsurance ?? 0,
    pensionInsuranceNew: input.pensionInsuranceNew ?? 0,
    pensionInsuranceOld: input.pensionInsuranceOld ?? 0,
    // 特定扶養親族（19〜22 歳）と 16 歳未満の扶養親族は必ず 23 歳未満
    dependentUnder23:
      input.dependentUnder23 === true ||
      (input.dependents?.specific ?? 0) > 0 ||
      (input.dependents?.under16 ?? 0) > 0,
    otherDeductions: input.otherDeductions ?? 0,
    otherDeductionsResident: input.otherDeductionsResident ?? input.otherDeductions ?? 0,
  };
  const life = lifeInsuranceDeduction(data, lifePaid(normalized), normalized.dependentUnder23);

  const base: Scenario = {
    salaryRevenue: normalized.salaryRevenue,
    businessRevenue: normalized.businessRevenue,
    businessExpenses: normalized.businessExpenses,
    businessIncomeType: normalized.businessIncomeType,
    blueDeduction: blueAmount(normalized.blueReturn),
    socialInsurance: normalized.socialInsurance,
    mutualAid: normalized.idecoPaid + normalized.kyosaiPaid,
    donation: normalized.furusatoPaid,
    spouse: normalized.spouse,
    dependents: normalized.dependents,
    otherDeductions: normalized.otherDeductions,
    otherDeductionsResident: normalized.otherDeductionsResident,
    incomeAdjustmentEligible: normalized.incomeAdjustment,
    medical: {
      netExpenses: Math.max(0, normalized.medicalExpenses - normalized.medicalReimbursed),
      selfMedication: normalized.selfMedicationExpenses,
      method: "none",
    },
    lifeInsurance: { incomeTax: life.incomeTax.total, residentTax: life.residentTax.total },
  };
  // 医療費控除は、通常の控除とセルフメディケーション税制のうち、税額が少なくなるほうを使う（選択適用で、併用はできない）
  // （税額が同じなら控除額が大きいほう。控除額がどちらも 0 なら控除なし）
  const totalIncome = estimate(data, base).totalIncome;
  const normalDeduction = medicalDeduction(data, base.medical, totalIncome, "normal");
  const selfDeduction = medicalDeduction(data, base.medical, totalIncome, "selfMedication");
  const taxWith = (method: MedicalMethod): number => estimate(data, withMedical(base, method)).totalTax;
  const normalTax = taxWith("normal");
  const selfTax = taxWith("selfMedication");
  const method: MedicalMethod =
    normalDeduction === 0 && selfDeduction === 0
      ? "none"
      : selfTax < normalTax || (selfTax === normalTax && selfDeduction > normalDeduction)
        ? "selfMedication"
        : "normal";
  return { input, year, data, normalized, base: withMedical(base, method) };
}

function withMedical(base: Scenario, method: MedicalMethod): Scenario {
  return { ...base, medical: { ...base.medical, method } };
}

function lifePaid(n: SetsuzeiResult["input"]): Parameters<typeof lifeInsuranceDeduction>[1] {
  return {
    lifeNew: n.lifeInsuranceNew,
    lifeOld: n.lifeInsuranceOld,
    medicalCare: n.medicalCareInsurance,
    pensionNew: n.pensionInsuranceNew,
    pensionOld: n.pensionInsuranceOld,
  };
}

/**
 * 現状の所得税・住民税の概算と、節税策ごとの軽減額を計算する。
 *
 * 入力は validateInput を通してから使うので、JSON などの外部入力をそのまま渡してよい。
 */
export function calculate(rawInput: TaxInput, options: CalcOptions = {}): SetsuzeiResult {
  return withLocale(options.locale, () => calculateIn(rawInput));
}

function calculateIn(rawInput: TaxInput): SetsuzeiResult {
  const { input, year, data, normalized, base } = prepare(rawInput);
  const baseline = estimate(data, base);
  const hasSalary = normalized.salaryRevenue > 0;
  const hasBusiness = normalized.businessRevenue > 0;
  const isBusinessIncome = normalized.businessIncomeType === "business";

  // --- iDeCo ---
  const idecoNotes: string[] = [];
  let idecoLimit: number;
  if (input.idecoAnnualLimit !== undefined) {
    idecoLimit = input.idecoAnnualLimit;
  } else if (hasSalary) {
    idecoLimit = data.ideco.employeeWithoutPensionMonthlyLimit * 12;
    idecoNotes.push(m().idecoLimitEmployee(data.ideco.employeeWithoutPensionMonthlyLimit));
  } else {
    idecoLimit = data.ideco.selfEmployedMonthlyLimit * 12;
    idecoNotes.push(m().idecoLimitSelfEmployed(data.ideco.selfEmployedMonthlyLimit));
  }
  idecoNotes.push(m().idecoTiming, m().idecoLockup);
  const idecoPlan = contribution(data, base, baseline, {
    annualLimit: idecoLimit,
    paid: normalized.idecoPaid,
    requested: input.idecoAdditional,
    notes: idecoNotes,
  });
  const ideco = publish(idecoPlan);

  // --- 小規模企業共済 ---
  const kyosaiLimit = data.kyosai.monthlyLimit * 12;
  let kyosai: ContributionMeasure;
  let kyosaiWanted = 0;
  const kyosaiBlocked = hasSalary ? m().kyosaiBlockedSalary : !hasBusiness ? m().kyosaiBlockedNoBusiness : !isBusinessIncome ? m().kyosaiBlockedMisc : null;
  if (kyosaiBlocked !== null && normalized.kyosaiPaid === 0) {
    kyosai = {
      applicable: false,
      annualLimit: kyosaiLimit,
      paid: 0,
      remaining: 0,
      additional: 0,
      noEffectBeyond: null,
      saving: NO_SAVING,
      notes: [kyosaiBlocked],
    };
  } else {
    const kyosaiPlan = contribution(data, base, baseline, {
      annualLimit: kyosaiLimit,
      paid: normalized.kyosaiPaid,
      requested: input.kyosaiAdditional,
      notes: [m().kyosaiLimit(data.kyosai.monthlyLimit), m().kyosaiDeductible, m().kyosaiPayout],
    });
    kyosai = publish(kyosaiPlan);
    kyosaiWanted = kyosaiPlan.wanted;
  }

  // --- まとめて実行した場合の掛金 ---
  // 掛金を増やすと住民税の所得割額が減り、ふるさと納税の上限も下がるので、
  // 「掛金を追加した後の上限」まで寄附する前提でまとめて再計算する。
  // iDeCo の追加は、年内に増やせるかどうかが加入先と時期しだいなので、額を指定されたときだけ合計に含める。
  const limit = furusatoLimit(data, base);
  const paid = normalized.furusatoPaid;
  const idecoRequested = input.idecoAdditional !== undefined;
  const combine = (includesIdeco: boolean): CombinedMeasure & { limitAfter: number } => {
    // 単独では税額が減らなくなる額でも、合わせると減ることがある（所得割の非課税限度額による減額で
    // 税額が横ばいになる範囲を越える場合）。単独で頭打ちにした額ではなく、残り枠・指定された額から始める。
    const idecoWanted = includesIdeco ? idecoPlan.wanted : 0;
    const wanted = kyosaiWanted + idecoWanted;
    // 合わせた掛金でも、税額が減らなくなる額を超える分は含めない
    const total = effectiveAdditional(data, base, wanted);
    // 額を指定された iDeCo を先に、そうでなければ小規模企業共済を先に割り当てる
    const idecoFirst = includesIdeco && idecoRequested;
    const idecoAdditional = !includesIdeco
      ? 0
      : idecoFirst
        ? Math.min(idecoWanted, total)
        : total - Math.min(kyosaiWanted, total);
    const kyosaiAdditional = total - idecoAdditional;
    const limitAfter = total > 0 ? furusatoLimit(data, { ...base, mutualAid: base.mutualAid + total }) : limit;
    const donation = Math.max(limitAfter, paid);
    const contributionsOnly = estimate(data, { ...base, mutualAid: base.mutualAid + total });
    const all = estimate(data, { ...base, mutualAid: base.mutualAid + total, donation });
    const furusatoAdditional = donation - paid;
    const notes: string[] = [];
    if ([idecoAdditional, kyosaiAdditional, furusatoAdditional].filter((n) => n > 0).length > 1) {
      notes.push(m().combinedRecomputed);
    }
    if (total < wanted) {
      notes.push(m().combinedCapped(total));
    }
    if (furusatoAdditional > 0) {
      notes.push(m().combinedFurusato);
    }
    if (limitAfter < limit) {
      notes.push(limitAfter === 0 ? m().combinedFurusatoZero : m().combinedFurusatoUpTo(limitAfter));
    }
    if (paid > limitAfter && total > 0 && limit > 0) {
      notes.push(m().combinedPaidOver);
    }
    if (!includesIdeco && ideco.additional > 0) {
      notes.push(m().combinedIdecoExcluded);
    }
    return {
      includesIdeco,
      idecoAdditional,
      kyosaiAdditional,
      furusatoAdditional,
      totalPayment: total + furusatoAdditional,
      totalTax: all.totalTax,
      saving: saving(baseline, all),
      savingFromContributions: saving(baseline, contributionsOnly),
      savingFromFurusato: saving(contributionsOnly, all),
      notes,
      limitAfter,
    };
  };
  const strip = ({ limitAfter: _limitAfter, ...measure }: CombinedMeasure & { limitAfter: number }): CombinedMeasure =>
    measure;
  const combinedPlan = combine(idecoRequested);
  const combined = strip(combinedPlan);
  let combinedWithIdeco: CombinedMeasure | null = null;
  if (!idecoRequested && idecoPlan.wanted > 0) {
    const withIdeco = combine(true);
    if (withIdeco.idecoAdditional > 0 && withIdeco.saving.total > combined.saving.total) {
      combinedWithIdeco = {
        ...strip(withIdeco),
        notes: [
          m().combinedWithIdeco,
          ...withIdeco.notes,
        ],
      };
    }
  }

  // --- ふるさと納税 ---
  const limitAfterOtherMeasures = combinedPlan.limitAfter;
  const target = Math.max(limit, paid);
  const atTarget = estimate(data, { ...base, donation: target });
  const noDonation = estimate(data, { ...base, donation: 0 });
  const reliefAtTarget = noDonation.totalTax - atTarget.totalTax;
  const furusatoNotes: string[] = [m().furusatoRelief, m().furusatoFinalReturn, m().furusatoMargin];
  if (limit === 0) {
    furusatoNotes.splice(
      0,
      1,
      noDonation.residentTax.incomeLevyExempt ? m().furusatoExempt : noDonation.residentTax.exemptionReduction > 0 ? m().furusatoReduced : m().furusatoTiny,
    );
  }
  if (paid > limit && limit > 0) {
    furusatoNotes.unshift(m().furusatoPaidOver);
  }
  if (limitAfterOtherMeasures !== limit || ideco.additional + kyosai.additional > 0) {
    furusatoNotes.push(m().furusatoContributionsLower);
  }
  const furusato: FurusatoMeasure = {
    limit,
    paid,
    remaining: Math.max(0, limit - paid),
    saving: target > paid ? saving(baseline, atTarget) : NO_SAVING,
    outOfPocket: target > 0 ? target - reliefAtTarget : 0,
    limitAfterOtherMeasures,
    notes: furusatoNotes,
  };

  // --- 青色申告特別控除 ---
  let blueReturn: BlueReturnMeasure;
  if (!hasBusiness || !isBusinessIncome) {
    blueReturn = {
      applicable: false,
      current: normalized.blueReturn,
      options: [],
      notes: [hasBusiness ? m().blueMisc : m().blueNoBusiness],
    };
  } else {
    const options: BlueReturnOption[] = BLUE_LEVELS.map((level) => {
      const e = estimate(data, { ...base, blueDeduction: blueAmount(level) });
      return {
        level,
        deduction: blueAmount(level),
        deductionApplied: e.blueDeductionApplied,
        totalTax: e.totalTax,
        savingVsCurrent: saving(baseline, e),
        current: level === normalized.blueReturn,
      };
    });
    const notes = [m().blueRequirements, m().blueFrom2027];
    if (normalized.blueReturn === "none") {
      notes.push(m().blueApplication);
    }
    blueReturn = { applicable: true, current: normalized.blueReturn, options, notes };
  }

  // --- 国民健康保険料（税）の所得割への影響（料率が入力されたときだけ） ---
  // 所得割は「総所得金額等 − 住民税の基礎控除」（基礎控除後の総所得金額等）に料率を掛ける。
  // 出典: 地方税法 第703条の4第6項（国民健康保険税）、国民健康保険法施行令 第29条の7第2項第4号（保険料）
  // 所得控除（iDeCo・小規模企業共済・社会保険料など）や税額控除（ふるさと納税）は算定基礎に影響しない。
  let nationalHealthInsurance: NationalHealthInsuranceMeasure | null = null;
  if (input.nhiIncomeRatePercent !== undefined) {
    const ratePer100k = Math.round(input.nhiIncomeRatePercent * 1_000);
    const levyOf = (e: TaxEstimate): { baseIncome: number; incomeLevy: number } => {
      const baseIncome = Math.max(0, e.totalIncome - e.residentTax.deductions.basic);
      return { baseIncome, incomeLevy: Math.floor((baseIncome * ratePer100k) / 100_000) };
    };
    const current = levyOf(baseline);
    const nhiNotes = [m().nhiScope, m().nhiCap, m().nhiNotReduced];
    if (hasSalary) {
      nhiNotes.push(m().nhiEmployee);
    }
    nationalHealthInsurance = {
      ratePercent: input.nhiIncomeRatePercent,
      ...current,
      blueReturnOptions: blueReturn.applicable
        ? BLUE_LEVELS.map((level) => {
            const option = levyOf(estimate(data, { ...base, blueDeduction: blueAmount(level) }));
            return {
              level,
              ...option,
              reductionVsCurrent: current.incomeLevy - option.incomeLevy,
              current: level === normalized.blueReturn,
            };
          })
        : [],
      notes: nhiNotes,
    };
  }

  // --- 注意 ---
  const warnings: string[] = [];
  if (baseline.totalIncome === 0) {
    warnings.push(m().warnZeroIncome);
  } else if (baseline.incomeTax.taxableIncome === 0) {
    warnings.push(m().warnNoTaxable);
  }
  if (normalized.spouse) {
    const [, , top] = data.family.taxpayerTiers;
    if (baseline.totalIncome > top) {
      warnings.push(m().warnSpouseOwnIncome);
    } else if (normalized.spouse.income > data.family.spouseSpecialIncomeLimit) {
      warnings.push(m().warnSpouseIncome);
    }
  }
  if (normalized.salaryRevenue > data.salary.incomeAdjustment.revenueAbove && !normalized.incomeAdjustment) {
    // 適用していないときだけ案内する（16〜18 歳の子と特別障害者は入力から判別できないため）
    warnings.push(m().warnIncomeAdjustment);
  }
  if (normalized.blueReturn !== "none" && baseline.blueDeductionApplied < blueAmount(normalized.blueReturn)) {
    warnings.push(m().warnBlueCapped);
  }

  // 住民税の非課税
  const rt = baseline.residentTax;

  if (baseline.totalIncome > 0 && rt.incomeLevyExempt) {
    warnings.push(m().warnLevyExempt(rt.incomeLevyExemptLimit));
  } else if (rt.exemptionReduction > 0) {
    warnings.push(m().warnLevyReduced(rt.incomeLevyExemptLimit, rt.exemptionReduction));
  }
  if (baseline.totalIncome > 0) {
    const perCapitaMax = perCapitaExemptLimitMax(data, base);
    if (baseline.totalIncome <= perCapitaMax) {
      warnings.push(m().warnPerCapita(perCapitaMax, rt.perCapita));
    }
    if (baseline.totalIncome <= data.residentTax.specialExemptIncomeLimit) {
      warnings.push(m().warnSpecialExempt(data.residentTax.specialExemptIncomeLimit));
    }
    // 16 歳未満の子が 3 人増えたら所得割が非課税になる範囲なら、入力を促す
    const d = normalized.dependents;
    if (
      !rt.incomeLevyExempt &&
      d.under16 === 0 &&
      baseline.totalIncome <=
        estimate(data, { ...base, dependents: { ...d, under16: 3 } }).residentTax.incomeLevyExemptLimit
    ) {
      warnings.push(m().warnUnder16);
    }
  }

  const medical = medicalResult(data, base, baseline);
  const lifeInsurance = lifeResult(data, base, baseline, normalized);
  if (normalized.otherDeductions > 0 && (medical.applicable || lifeInsurance.applicable)) {
    warnings.push(m().warnOtherDeductionsOverlap);
  }

  const result: Omit<SetsuzeiResult, "filing"> = {
    year,
    label: m().label(year, data.label),
    residentTaxLabel: m().residentTaxLabel(year, data.residentTaxLabel),
    input: normalized,
    baseline,
    measures: { furusato, ideco, kyosai, blueReturn, combined, combinedWithIdeco, nationalHealthInsurance },
    deductionDetails: { medical, lifeInsurance },
    warnings,
    disclaimer: m().disclaimer,
  };
  return { ...result, filing: filingGuide(result) };
}

/** 医療費控除: 通常の控除とセルフメディケーション税制の比較 */
function medicalResult(data: TaxYearData, base: Scenario, baseline: TaxEstimate): MedicalDeductionResult {
  const med = base.medical;
  const applicable = med.netExpenses > 0 || med.selfMedication > 0;
  const at = (method: MedicalMethod): TaxEstimate => estimate(data, { ...base, medical: { ...med, method } });
  const normal = at("normal");
  const self = at("selfMedication");
  const none = at("none");
  const floor = medicalFloor(data, baseline.totalIncome);
  const normalDeduction = medicalDeduction(data, med, baseline.totalIncome, "normal");
  const selfDeduction = medicalDeduction(data, med, baseline.totalIncome, "selfMedication");
  const notes: string[] = [];
  if (applicable) {
    if (med.netExpenses > 0) notes.push(m().medNormal(floor, data.medical.floorMax));
    if (med.selfMedication > 0) notes.push(m().medSelf(data.medical.selfMedication.floor, data.medical.selfMedication.cap));
    if (med.method === "none") notes.push(m().medNone);
    else if (med.netExpenses > 0 && med.selfMedication > 0) {
      const diff = Math.abs(normal.totalTax - self.totalTax);
      notes.push(med.method === "normal" ? m().medChoseNormal(diff) : m().medChoseSelf(diff));
    }
    notes.push(m().medChoice);
  }
  return {
    applicable,
    method: med.method,
    normal: { netExpenses: med.netExpenses, floor, deduction: normalDeduction, totalTax: normal.totalTax },
    selfMedication: { expenses: med.selfMedication, deduction: selfDeduction, totalTax: self.totalTax },
    saving: saving(none, baseline),
    advantage:
      med.method === "normal" ? Math.max(0, self.totalTax - normal.totalTax) : med.method === "selfMedication" ? Math.max(0, normal.totalTax - self.totalTax) : 0,
    notes,
  };
}

/** 生命保険料控除の内訳 */
function lifeResult(data: TaxYearData, base: Scenario, baseline: TaxEstimate, n: SetsuzeiResult["input"]): LifeInsuranceResult {
  const life = lifeInsuranceDeduction(data, lifePaid(n), n.dependentUnder23);
  const paid = lifePaid(n);
  const applicable = Object.values(paid).some((v) => v > 0);
  const without = estimate(data, { ...base, lifeInsurance: { incomeTax: 0, residentTax: 0 } });
  const notes: string[] = [];
  if (applicable) {
    if (life.under23Rule) notes.push(m().lifeUnder23);
    if (life.lifeOldOnly) notes.push(m().lifeOldOnly(m().lifeLabel));
    if (life.pensionOldOnly) notes.push(m().lifeOldOnly(m().pensionLabel));
    notes.push(m().lifeCertificate);
  }
  return {
    applicable,
    under23Rule: life.under23Rule,
    lifeOldOnly: life.lifeOldOnly,
    pensionOldOnly: life.pensionOldOnly,
    incomeTax: life.incomeTax,
    residentTax: life.residentTax,
    saving: saving(without, baseline),
    notes,
  };
}


/** 10 万分率を「84.895%」の形にする */
const rateText = (per100k: number): string => `${per100k / 1_000}%`;

/**
 * ふるさと納税の上限の目安を、令和 8 年分と令和 7 年分で比べる。
 *
 * 令和 7 年分は、上限の計算に関わる項目のうち当時と違うもの（所得税の基礎控除、給与所得控除）だけを
 * 当時の額に差し替えたデータ（src/data/2025-furusato.ts）で、同じ入力を計算する。
 * 配偶者・扶養親族の所得要件は差し替えていないので、配偶者に所得がある入力は受け付けない。
 */
export function compareFurusatoLimit(rawInput: TaxInput, options: CalcOptions = {}): FurusatoComparison {
  return withLocale(options.locale, () => compareIn(rawInput));
}

function compareIn(rawInput: TaxInput): FurusatoComparison {
  const { year, data, base } = prepare(rawInput);
  if (year !== furusatoComparison2025.year + 1) {
    throw new InputError([m().cmpYearOnly(furusatoComparison2025.year + 1)]);
  }
  if (base.spouse && base.spouse.income > 0) {
    throw new InputError([m().cmpSpouse]);
  }
  const side = (d: TaxYearData): FurusatoYearLimit => ({
    label: m().label(d.year, d.label),
    residentTaxLabel: m().residentTaxLabel(d.year, d.residentTaxLabel),
    ...furusatoLimitDetail(d, base),
  });
  const current = side(data);
  const previous = side(furusatoComparison2025);
  const difference = current.limit - previous.limit;
  const reasons: ("specialRate" | "incomeLevy")[] = [];
  const notes: string[] = [];

  if (current.exempt || previous.exempt) {
    for (const s of [previous, current]) {
      if (s.exempt) notes.push(m().cmpExempt(s.label));
    }
  }
  if (difference === 0) {
    if (!current.exempt && current.limit > 0) {
      notes.push(m().cmpSame);
    }
  } else if (!current.exempt && !previous.exempt) {
    if (current.specialRatePer100k !== previous.specialRatePer100k) {
      reasons.push("specialRate");
      notes.push(
        m().cmpRate(
          rateText(previous.specialRatePer100k),
          rateText(current.specialRatePer100k),
          previous.incomeTaxBasicDeduction,
          current.incomeTaxBasicDeduction,
          previous.rateBase,
          current.rateBase,
        ),
      );
    }
    if (current.incomeLevy !== previous.incomeLevy) {
      reasons.push("incomeLevy");
      notes.push(m().cmpLevy(previous.incomeLevy, current.incomeLevy, previous.salaryIncome, current.salaryIncome));
    }
  }
  if (difference < 0 && reasons.includes("specialRate")) {
    notes.push(m().cmpWhyLower);
  }
  notes.push(m().cmpBasis);
  return { current, previous, difference, reasons, notes };
}
