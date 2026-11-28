/**
 * ブラウザ版の計算部分（DOM に触らない純粋関数）。
 * 入力の名前は CLI のフラグ名と同じで、CLI と同じ flagsToInput → calculate を通す。
 */
import { parseAmount } from "../src/cli/amount.js";
import { flagsToInput, INPUT_BOOLEAN_FLAGS, INPUT_STRING_FLAGS, issueFlag, type InputFlags } from "../src/cli/flags.js";
import { calculate, compareFurusatoLimit } from "../src/core/calculate.js";
import type { FurusatoComparison, Saving, SetsuzeiResult, TaxEstimate, TaxInput } from "../src/core/types.js";
import { m, withLocale } from "../src/core/messages.js";
import { InputError } from "../src/core/validate.js";
import { estimateInsurance, type InsuranceEstimate } from "./guide.js";
import { webMessages, type Locale } from "./messages.js";

/** フォームの値。キーは CLI のフラグ名（+ has-spouse）。 */
export type FormValues = Record<string, string | boolean | undefined>;

export type Outcome =
  | { readonly ok: true; readonly result: SetsuzeiResult }
  | { readonly ok: false; readonly issues: readonly string[] };

/** フォームの値を CLI のフラグと同じ形にする。空欄は「指定なし」。 */
export function valuesToFlags(values: FormValues): InputFlags {
  const flags: Record<string, string | boolean> = {};
  for (const name of INPUT_STRING_FLAGS) {
    const value = values[name];
    if (typeof value === "string" && value.trim() !== "") flags[name] = value.trim();
  }
  for (const name of INPUT_BOOLEAN_FLAGS) {
    if (values[name] === true) flags[name] = true;
  }
  // 雑所得のときは青色申告特別控除の選択欄を隠しているので、残っている値は使わない
  if (flags["misc"] === true) delete flags["blue"];
  // 「配偶者がいる」にチェックがなければ配偶者の入力は使わない。チェックありで所得が空欄なら 0 円。
  if (values["has-spouse"] === true) {
    if (flags["spouse-income"] === undefined) flags["spouse-income"] = "0";
  } else if (values["has-spouse"] === false) {
    delete flags["spouse-income"];
    delete flags["spouse-70"];
  }
  return flags as InputFlags;
}

/** フォームの値から計算する。入力の誤りは issues で返す。 */
export function compute(values: FormValues, locale: Locale = "ja"): Outcome {
  try {
    return withLocale(locale, () => ({ ok: true, result: calculate(flagsToInput(valuesToFlags(values))) }));
  } catch (error) {
    if (error instanceof InputError) return { ok: false, issues: error.issues };
    if (error instanceof RangeError) return { ok: false, issues: [error.message] };
    throw error;
  }
}

export type ComparisonOutcome =
  | { readonly ok: true; readonly result: SetsuzeiResult; readonly comparison: FurusatoComparison }
  | { readonly ok: false; readonly issues: readonly string[] };

/** フォームの値から、令和 8 年分の結果と、ふるさと納税の上限の令和 7 年分との比較を計算する。 */
export function computeComparison(values: FormValues, locale: Locale = "ja"): ComparisonOutcome {
  try {
    return withLocale(locale, () => {
      const input = flagsToInput(valuesToFlags(values));
      return { ok: true, result: calculate(input), comparison: compareFurusatoLimit(input) };
    });
  } catch (error) {
    if (error instanceof InputError) return { ok: false, issues: error.issues };
    if (error instanceof RangeError) return { ok: false, issues: [error.message] };
    throw error;
  }
}

/**
 * 入力エラーのメッセージを、入力欄の名前（CLI のフラグ名）と本文に分ける。
 * どの欄のものかわからないメッセージは field が null。
 */
export function splitIssue(issue: string): { readonly field: string | null; readonly message: string } {
  const parsed = issueFlag(issue);
  return parsed ? { field: parsed.flag, message: parsed.message } : { field: null, message: issue };
}

/**
 * URL のクエリ文字列（?revenue=800万&blue=65 など、CLI のフラグ名）をフォームの値にする。
 * 知らない名前は無視する。
 */
export function queryToValues(query: string): FormValues {
  const params = new URLSearchParams(query);
  const values: FormValues = {};
  for (const name of INPUT_STRING_FLAGS) {
    const value = params.get(name);
    if (value !== null) values[name] = value;
  }
  for (const name of INPUT_BOOLEAN_FLAGS) {
    if (params.has(name) && params.get(name) !== "0" && params.get(name) !== "false") values[name] = true;
  }
  if (values["spouse-income"] !== undefined || values["spouse-70"] === true) values["has-spouse"] = true;
  return values;
}

/** 収入が何も入力されていないか（結果の代わりに案内を出す判断に使う）。 */
export function isBlank(values: FormValues): boolean {
  return !["salary", "revenue"].some((name) => {
    const value = values[name];
    return typeof value === "string" && value.trim() !== "";
  });
}

// ---------------------------------------------------------------------------
// トップページ（3 つの質問から始める画面）
// ---------------------------------------------------------------------------

/**
 * トップページのフォームにだけある値（CLI のフラグではないもの）:
 * - work: "freelance"（給料はない）/ "employee"（給料がある + 副業）
 * - si-mode: "estimate"（社会保険料は分からないので目安を使う）/ "enter"（入力した額を使う）
 * - blue: "unknown"（分からない = 控除なしで計算）も取る
 * - misc-assumed: 所得の種類（雑所得）を利用者が選んでおらず、既定のままか
 * - furusato-add: ふるさと納税で追加して寄附する額（空なら上限の目安まで）
 * - budget: 年内に出せるお金（任意。入れたら、その範囲で減る税額が大きくなる配分にする）
 */
export const TOP_ONLY_NAMES = ["work", "si-mode", "misc-assumed", "furusato-add", "budget", "spouse-salary"] as const;

/** 結果に添える「仮に置いた値」 */
export interface Assumption {
  readonly key: "insurance" | "blue" | "incomeType" | "family" | "paid";
  readonly text: string;
}

/** 年内にやることの 1 項目。saving は、上から順に実行したときに、その項目で減る税額。 */
export interface PlanAction {
  /** 追加で払う額 */
  readonly amount: number;
  readonly saving: Saving;
}

/** 年内にやること（追加額を利用者が動かせる） */
export interface Plan {
  readonly furusato: PlanAction & {
    /** 掛金の追加を反映した、上限の目安（年間） */
    readonly limit: number;
    readonly paid: number;
    /** 上限の目安までの残り（おすすめの追加額） */
    readonly recommended: number;
    /** 利用者が額を指定したか */
    readonly custom: boolean;
    /** 指定した額が、上限の目安を超えている分 */
    readonly over: number;
    /**
     * 上限の目安まで寄附しても、減る税額が自己負担（寄附した額 − 減る税額）より小さいため、
     * 「やること」に入れなかった場合の、その額と減る税額。入れている・対象外なら null。
     */
    readonly skipped: PlanAction | null;
  };
  /** 小規模企業共済。対象外なら null。 */
  readonly kyosai:
    | (PlanAction & {
        readonly max: number;
        readonly paid: number;
        readonly custom: boolean;
        /**
         * いま加入していない人が、新しく加入して払える上限まで払った場合の額と減る税額。
         * 加入していない人には、額を自分で入れるまで合計に入れず、「さらに減らしたい場合」として示す。加入済みなら null。
         */
        readonly ifJoined: PlanAction | null;
      })
    | null;
  readonly ideco: PlanAction & {
    /** 年間の限度額までの残り枠 */
    readonly max: number;
    readonly paid: number;
    /** 合計に含めているか（利用者が追加額を入れたときだけ） */
    readonly included: boolean;
  };
  /** 「年内に出せるお金」を入れたときの配分。入れていなければ null。 */
  readonly budget: {
    readonly amount: number;
    /** 出せるお金を超えている額（払う額を自分で決めた結果、超えた場合） */
    readonly over: number;
    /** 配分の理由（画面にそのまま出す） */
    readonly reason: string;
  } | null;
  readonly totalPayment: number;
  readonly saving: Saving;
  readonly taxBefore: number;
  readonly taxAfter: number;
}

export type TopOutcome =
  | {
      readonly ok: true;
      /** 計算に使った値での結果。同じ値を CLI に渡したときと同じ。 */
      readonly result: SetsuzeiResult;
      /** 計算に使った値（CLI のフラグ名 → 値）。目安で置いた社会保険料を含む。 */
      readonly effective: InputFlags;
      /** 社会保険料を目安で置いた場合の、目安の中身 */
      readonly insurance: InsuranceEstimate | null;
      readonly assumptions: readonly Assumption[];
      readonly plan: Plan;
    }
  | { readonly ok: false; readonly issues: readonly string[] };

const filled = (value: string | boolean | undefined): boolean => typeof value === "string" && value.trim() !== "";

/**
 * 社会保険料を目安で置くか。「分からない」を選んでいる間と、「金額を入れる」を選んだがまだ額を入れていない間
 * （選んだとたんに 0 円として計算して、結果が大きく動くことがないようにする）。
 */
function usesEstimate(values: FormValues): boolean {
  return values["si-mode"] === "estimate" || (values["si-mode"] === "enter" && !filled(values["social-insurance"]));
}

/** トップページの値を、CLI のフラグと同じ形の値にそろえる（目安の社会保険料はまだ入れない）。 */
function normalizeTop(values: FormValues): FormValues {
  const v: FormValues = { ...values };
  // 「給料はない」を選んでいる間は、給与の欄を隠しているので値を使わない
  if (v["work"] === "freelance") v["salary"] = "";
  if (v["blue"] === "unknown") v["blue"] = "";
  if (usesEstimate(values)) v["social-insurance"] = "";
  return v;
}

/** トップページで、収入がまだ何も入っていないか。 */
export function isBlankTop(values: FormValues): boolean {
  return isBlank(normalizeTop(values));
}

function savingBetween(before: TaxEstimate, after: TaxEstimate): Saving {
  return {
    incomeTax: before.incomeTax.total - after.incomeTax.total,
    residentTax: before.residentTax.total - after.residentTax.total,
    total: before.totalTax - after.totalTax,
  };
}

/**
 * トップページの値から計算する。
 *
 * 結果（result）は、計算に使った値（effective）を CLI に渡したときと同じ。
 * 年内にやること（plan）は、掛金や寄附を「支払済み」に足した入力を同じ計算コアに通して、
 * 税額の差を取ったもの（= その入力で CLI を実行したときの税額の差）。計算の中身は足していない。
 *
 * locale は文面（注記・理由・仮に置いた値の説明）の言語。数字は言語で変わらない。
 */
export function computeTop(values: FormValues, locale: Locale = "ja"): TopOutcome {
  return withLocale(locale, () => computeTopIn(values, webMessages(locale)));
}

function computeTopIn(values: FormValues, t: ReturnType<typeof webMessages>): TopOutcome {
  const v = normalizeTop(values);
  const issues: string[] = [];
  try {
    // 配偶者: 所得が空で、給料の年収が入っていれば、年収から給与所得を計算して使う（計算コアの給与所得と同じ）
    if (v["has-spouse"] === true && !filled(v["spouse-income"]) && filled(v["spouse-salary"])) {
      const text = String(v["spouse-salary"]);
      const salary = parseAmount(text);
      if (salary === null) {
        issues.push(/^\s*[-−ー－]/.test(text) ? m().flagNegative("spouse-salary", text) : m().flagNotAmount("spouse-salary", text));
      } else {
        try {
          v["spouse-income"] = String(calculate({ salaryRevenue: salary }).baseline.salaryIncome);
        } catch (error) {
          if (!(error instanceof InputError)) throw error;
          issues.push(...error.issues.map((issue) => `--spouse-salary: ${issue.replace(/^[A-Za-z.]+: /, "")}`));
        }
      }
    }
    // 「配偶者がいる」にチェックしただけで、所得も年収も入っていない間は、配偶者なしで計算する
    // （所得 0 円の配偶者として計算すると、共働きの人の税額が実際より低く出るため）
    if (v["has-spouse"] === true && !filled(v["spouse-income"])) v["has-spouse"] = false;
    let insurance: InsuranceEstimate | null = null;
    if (usesEstimate(values)) {
      // 所得は社会保険料に関係なく決まるので、先に社会保険料なしで計算して、目安の計算に使う
      const first = calculate(flagsToInput(valuesToFlags(v)));
      const kind = first.input.salaryRevenue > 0 ? "employee" : "freelance";
      insurance = estimateInsurance(kind, first.input.salaryRevenue, first.baseline.totalIncome, t.locale);
      v["social-insurance"] = String(insurance.amount);
    }
    const amountOf = (name: string): number | null => {
      const text = values[name];
      if (typeof text !== "string" || text.trim() === "") return null;
      const amount = parseAmount(text);
      if (amount === null) {
        issues.push(/^\s*[-−ー－]/.test(text) ? m().flagNegative(name, text) : m().flagNotAmount(name, text));
      }
      return amount;
    };
    const furusatoCustom = amountOf("furusato-add");
    const budgetAmount = amountOf("budget");

    // まず、払う額を自分で決めたもの以外は計算コアに任せて計算する
    const first = calculate(flagsToInput(valuesToFlags(v)) as TaxInput);
    if (issues.length > 0) return { ok: false, issues };
    const kyosaiCustom = filled(values["kyosai-add"]);
    const idecoCustom = filled(values["ideco-add"]);
    // 小規模企業共済にいま加入していない人には、額を自分で入れるまで合計に入れない
    // （年内に新しく加入して払うのは、手続きも金額も重いので、「さらに減らしたい場合」として別に示す）
    const joining = first.measures.kyosai.applicable && first.input.kyosaiPaid === 0;
    // 加入した場合の上限は、いま入れてある払う額に関係なく出す（スライダーの右端と説明に使うので、入れた額で縮まないように）
    const upToLimit = joining && kyosaiCustom ? calculate(flagsToInput(valuesToFlags({ ...v, "kyosai-add": "" })) as TaxInput) : first;
    const ifJoined: PlanAction | null =
      joining && upToLimit.measures.kyosai.additional > 0
        ? { amount: upToLimit.measures.kyosai.additional, saving: upToLimit.measures.kyosai.saving }
        : null;
    if (joining && !kyosaiCustom) v["kyosai-add"] = "0";

    // 計算コアに通す部品: 掛金・寄附を「支払済み」に足した入力で、税額を計算する
    const n = first.input;
    const { idecoAdditional: _i, kyosaiAdditional: _k, ...base } = flagsToInput(valuesToFlags(v)) as TaxInput;
    const at = (kyosai: number, ideco: number, furusato: number): SetsuzeiResult =>
      calculate({
        ...base,
        kyosaiPaid: n.kyosaiPaid + kyosai,
        idecoPaid: n.idecoPaid + ideco,
        furusatoPaid: n.furusatoPaid + furusato,
      });

    // --- 年内に出せるお金を入れたとき: その範囲で、減る税額がいちばん大きくなる配分を探す ---
    let budget: Plan["budget"] = null;
    let furusatoPlanned = furusatoCustom;
    if (budgetAmount !== null) {
      const fixedIdeco = idecoCustom ? calculate(flagsToInput(valuesToFlags(v)) as TaxInput).measures.combined.idecoAdditional : 0;
      const kyosaiFree = first.measures.kyosai.applicable && !joining && !kyosaiCustom;
      const fixedKyosai = kyosaiFree ? 0 : kyosaiCustom ? calculate(flagsToInput(valuesToFlags(v)) as TaxInput).measures.combined.kyosaiAdditional : 0;
      const room = Math.max(0, budgetAmount - fixedIdeco - fixedKyosai - (furusatoCustom ?? 0));
      const kyosaiMax = kyosaiFree ? Math.min(room, first.measures.kyosai.noEffectBeyond ?? first.measures.kyosai.remaining) : 0;
      const tryAt = (k: number): { k: number; f: number; saved: number; paid: number } => {
        const kk = fixedKyosai + k;
        const contributions = kk + fixedIdeco > 0 ? at(kk, fixedIdeco, 0) : first;
        let f = furusatoCustom ?? Math.min(room - k, Math.max(0, contributions.measures.furusato.limit - n.furusatoPaid));
        let after = f > 0 ? at(kk, fixedIdeco, f) : contributions;
        // 割に合わない寄附（減る税額が自己負担より小さい）は、配分の候補でも入れない
        const byDonation = contributions.baseline.totalTax - after.baseline.totalTax;
        if (furusatoCustom === null && f > 0 && byDonation < f - byDonation) {
          f = 0;
          after = contributions;
        }
        return { k, f, saved: first.baseline.totalTax - after.baseline.totalTax, paid: k + f };
      };
      const better = (a: ReturnType<typeof tryAt>, b: ReturnType<typeof tryAt>): boolean =>
        a.saved > b.saved || (a.saved === b.saved && a.paid < b.paid);
      let best = tryAt(0);
      if (kyosaiMax > 0) {
        // 粗く探してから、いちばん良かった額のまわりを 1,000 円きざみで探す
        const step = Math.max(10_000, Math.ceil(kyosaiMax / 40 / 1_000) * 1_000);
        const candidates = new Set<number>([kyosaiMax]);
        for (let k = step; k < kyosaiMax; k += step) candidates.add(k);
        for (const k of candidates) {
          const t = tryAt(k);
          if (better(t, best)) best = t;
        }
        const center = best.k;
        for (let k = Math.max(0, center - step); k <= Math.min(kyosaiMax, center + step); k += 1_000) {
          const t = tryAt(k);
          if (better(t, best)) best = t;
        }
      }
      if (kyosaiFree) v["kyosai-add"] = String(best.k);
      furusatoPlanned = best.f;
      budget = {
        amount: budgetAmount,
        over: Math.max(0, fixedIdeco + fixedKyosai + (furusatoCustom ?? 0) - budgetAmount),
        reason: best.f === 0 && best.k === 0 ? t.budgetNothing : t.budgetBest(best.f > 0, best.k > 0),
      };
    }

    const effective = valuesToFlags(v);
    const input = flagsToInput(effective) as TaxInput;
    const result = calculate(input);

    // --- 年内にやること ---
    const m_ = result.measures;
    const c = m_.combined;
    const k = c.kyosaiAdditional;
    const i = c.idecoAdditional;
    const afterKyosai = k > 0 ? at(k, 0, 0) : result;
    const afterContributions = i > 0 ? at(k, i, 0) : afterKyosai;
    const limit = afterContributions.measures.furusato.limit;
    const recommended = Math.max(0, limit - n.furusatoPaid);
    let f = furusatoPlanned ?? recommended;
    let afterAll = f > 0 ? at(k, i, f) : afterContributions;
    // 自分で額を決めていない寄附は、減る税額が自己負担より小さいなら、やることに入れない（割に合わないため）
    let skipped: PlanAction | null = null;
    if (furusatoCustom === null && f > 0) {
      const s = savingBetween(afterContributions.baseline, afterAll.baseline);
      if (s.total < f - s.total) {
        skipped = { amount: f, saving: s };
        f = 0;
        afterAll = afterContributions;
      }
    }
    // 出せるお金に合わせて掛金を減らすと、ふるさと納税の上限の目安は上がる。配分の理由として添える
    // （いま加入していない人の小規模企業共済は、額を入れるまで計算に入れていないので、この説明は当てはまらない）
    if (budget && limit > first.measures.furusato.limitAfterOtherMeasures && !(joining && !kyosaiCustom)) {
      budget = {
        ...budget,
        reason: `${budget.reason}${t.budgetLimitUp(first.measures.furusato.limitAfterOtherMeasures, limit)}`,
      };
    }
    // 出せるお金が余っていて、加入すれば使える策（小規模企業共済）があるときは、自分で額を入れると入ることを伝える
    if (budget && ifJoined !== null && !kyosaiCustom) {
      const left = budget.amount - (k + i + f);
      if (left >= 1_000) budget = { ...budget, reason: `${budget.reason}${t.budgetLeftover(left)}` };
    }
    const plan: Plan = {
      furusato: {
        amount: f,
        saving: savingBetween(afterContributions.baseline, afterAll.baseline),
        limit,
        paid: n.furusatoPaid,
        recommended,
        custom: furusatoCustom !== null,
        over: Math.max(0, f - recommended),
        skipped,
      },
      kyosai: m_.kyosai.applicable
        ? {
            amount: k,
            saving: savingBetween(result.baseline, afterKyosai.baseline),
            max: m_.kyosai.remaining,
            paid: m_.kyosai.paid,
            custom: kyosaiCustom,
            ifJoined,
          }
        : null,
      ideco: {
        amount: i,
        saving: savingBetween(afterKyosai.baseline, afterContributions.baseline),
        max: m_.ideco.remaining,
        paid: m_.ideco.paid,
        included: c.includesIdeco,
      },
      budget,
      totalPayment: k + i + f,
      saving: savingBetween(result.baseline, afterAll.baseline),
      taxBefore: result.baseline.totalTax,
      taxAfter: afterAll.baseline.totalTax,
    };

    // --- 仮に置いた値 ---
    const assumptions: Assumption[] = [];
    if (insurance) {
      assumptions.push({ key: "insurance", text: t.assumeInsurance(insurance.amount, insurance.kind === "employee", insurance.low, insurance.high) });
    }
    if (m_.blueReturn.applicable && values["blue"] === "unknown") assumptions.push({ key: "blue", text: t.assumeBlue });
    if (values["misc-assumed"] === true && n.businessRevenue > 0 && n.businessIncomeType === "misc") {
      assumptions.push({ key: "incomeType", text: t.assumeIncomeType });
    }
    const dependents = ["dependents", "dependents-specific", "dependents-elderly", "dependents-elderly-cohabiting", "dependents-under16"];
    if (values["has-spouse"] === true && v["has-spouse"] === false) {
      assumptions.push({ key: "family", text: t.assumeSpousePending });
    } else if (values["has-spouse"] !== true && !dependents.some((name) => filled(values[name]))) {
      assumptions.push({ key: "family", text: t.assumeNoFamily });
    }
    if (!["ideco-paid", "kyosai-paid", "furusato-paid", "other-deductions"].some((name) => filled(values[name]))) {
      assumptions.push({ key: "paid", text: t.assumeNoPaid });
    }
    return { ok: true, result, effective, insurance, assumptions, plan };
  } catch (error) {
    if (error instanceof InputError) return { ok: false, issues: [...error.issues, ...issues] };
    if (error instanceof RangeError) return { ok: false, issues: [error.message] };
    throw error;
  }
}

/**
 * 計算コアの注意書きのうち、CLI や JSON の指定方法を書いた括弧（「（CLI は --ideco-add、JSON は …）」）を、
 * ブラウザ版の画面では出さない。画面の利用者に関係のない文面のため。
 */
export function browserNote(text: string): string {
  return text.replace(/（CLI は[^）]*）/g, "");
}
