/**
 * ブラウザ版の計算部分（DOM に触らない純粋関数）。
 * 入力の名前は CLI のフラグ名と同じで、CLI と同じ flagsToInput → calculate を通す。
 */
import { parseAmount } from "../src/cli/amount.js";
import { flagsToInput, INPUT_BOOLEAN_FLAGS, INPUT_STRING_FLAGS, issueFlag, type InputFlags } from "../src/cli/flags.js";
import { calculate, compareFurusatoLimit } from "../src/core/calculate.js";
import type { FurusatoComparison, Saving, SetsuzeiResult, TaxEstimate, TaxInput } from "../src/core/types.js";
import { InputError } from "../src/core/validate.js";
import { estimateInsurance, type InsuranceEstimate } from "./guide.js";

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
export function compute(values: FormValues): Outcome {
  try {
    return { ok: true, result: calculate(flagsToInput(valuesToFlags(values))) };
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
export function computeComparison(values: FormValues): ComparisonOutcome {
  try {
    const input = flagsToInput(valuesToFlags(values));
    return { ok: true, result: calculate(input), comparison: compareFurusatoLimit(input) };
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
 */
export const TOP_ONLY_NAMES = ["work", "si-mode", "misc-assumed", "furusato-add"] as const;

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
  };
  /** 小規模企業共済。対象外なら null。 */
  readonly kyosai: (PlanAction & { readonly max: number; readonly paid: number; readonly custom: boolean }) | null;
  readonly ideco: PlanAction & {
    /** 年間の限度額までの残り枠 */
    readonly max: number;
    readonly paid: number;
    /** 合計に含めているか（利用者が追加額を入れたときだけ） */
    readonly included: boolean;
  };
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

const yen = (n: number): string => `${n.toLocaleString("ja-JP")} 円`;
const filled = (value: string | boolean | undefined): boolean => typeof value === "string" && value.trim() !== "";

/** トップページの値を、CLI のフラグと同じ形の値にそろえる（目安の社会保険料はまだ入れない）。 */
function normalizeTop(values: FormValues): FormValues {
  const v: FormValues = { ...values };
  // 「給料はない」を選んでいる間は、給与の欄を隠しているので値を使わない
  if (v["work"] === "freelance") v["salary"] = "";
  if (v["blue"] === "unknown") v["blue"] = "";
  if (v["si-mode"] === "estimate") v["social-insurance"] = "";
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
 */
export function computeTop(values: FormValues): TopOutcome {
  const v = normalizeTop(values);
  const issues: string[] = [];
  try {
    let insurance: InsuranceEstimate | null = null;
    if (values["si-mode"] === "estimate") {
      // 所得は社会保険料に関係なく決まるので、先に社会保険料なしで計算して、目安の計算に使う
      const first = calculate(flagsToInput(valuesToFlags(v)));
      const kind = first.input.salaryRevenue > 0 ? "employee" : "freelance";
      insurance = estimateInsurance(kind, first.input.salaryRevenue, first.baseline.totalIncome);
      v["social-insurance"] = String(insurance.amount);
    }
    const effective = valuesToFlags(v);
    const input = flagsToInput(effective) as TaxInput;
    const result = calculate(input);

    let furusatoCustom: number | null = null;
    const furusatoText = values["furusato-add"];
    if (typeof furusatoText === "string" && furusatoText.trim() !== "") {
      furusatoCustom = parseAmount(furusatoText);
      if (furusatoCustom === null) {
        issues.push(
          /^\s*[-−ー－]/.test(furusatoText)
            ? `--furusato-add: 0 以上の金額で指定してください（受け取った値: ${JSON.stringify(furusatoText)}）`
            : `--furusato-add: 金額として読めません（${JSON.stringify(furusatoText)}）`,
        );
      }
    }
    if (issues.length > 0) return { ok: false, issues };

    // --- 年内にやること ---
    const n = result.input;
    const m = result.measures;
    const c = m.combined;
    const { idecoAdditional: _i, kyosaiAdditional: _k, ...base } = input;
    const at = (kyosai: number, ideco: number, furusato: number): SetsuzeiResult =>
      calculate({
        ...base,
        kyosaiPaid: n.kyosaiPaid + kyosai,
        idecoPaid: n.idecoPaid + ideco,
        furusatoPaid: n.furusatoPaid + furusato,
      });
    const k = c.kyosaiAdditional;
    const i = c.idecoAdditional;
    const afterKyosai = k > 0 ? at(k, 0, 0) : result;
    const afterContributions = i > 0 ? at(k, i, 0) : afterKyosai;
    const limit = afterContributions.measures.furusato.limit;
    const recommended = Math.max(0, limit - n.furusatoPaid);
    const f = furusatoCustom ?? recommended;
    const afterAll = f > 0 ? at(k, i, f) : afterContributions;
    const plan: Plan = {
      furusato: {
        amount: f,
        saving: savingBetween(afterContributions.baseline, afterAll.baseline),
        limit,
        paid: n.furusatoPaid,
        recommended,
        custom: furusatoCustom !== null,
        over: Math.max(0, f - recommended),
      },
      kyosai: m.kyosai.applicable
        ? {
            amount: k,
            saving: savingBetween(result.baseline, afterKyosai.baseline),
            max: m.kyosai.remaining,
            paid: m.kyosai.paid,
            custom: filled(values["kyosai-add"]),
          }
        : null,
      ideco: {
        amount: i,
        saving: savingBetween(afterKyosai.baseline, afterContributions.baseline),
        max: m.ideco.remaining,
        paid: m.ideco.paid,
        included: c.includesIdeco,
      },
      totalPayment: k + i + f,
      saving: savingBetween(result.baseline, afterAll.baseline),
      taxBefore: result.baseline.totalTax,
      taxAfter: afterAll.baseline.totalTax,
    };

    // --- 仮に置いた値 ---
    const assumptions: Assumption[] = [];
    if (insurance) {
      assumptions.push({
        key: "insurance",
        text: `社会保険料: 目安の ${yen(insurance.amount)}（${insurance.kind === "employee" ? "給与の年収の約 14.7%" : "国民年金 + 国民健康保険の目安"}。幅は ${yen(insurance.low)}〜${yen(insurance.high)}）`,
      });
    }
    if (m.blueReturn.applicable && values["blue"] === "unknown") {
      assumptions.push({ key: "blue", text: "青色申告特別控除: なし（白色申告として計算）" });
    }
    if (values["misc-assumed"] === true && n.businessRevenue > 0 && n.businessIncomeType === "misc") {
      assumptions.push({ key: "incomeType", text: "副業の所得の種類: 雑所得（開業届を出して帳簿をつけている事業なら「事業所得」）" });
    }
    const dependents = ["dependents", "dependents-specific", "dependents-elderly", "dependents-elderly-cohabiting", "dependents-under16"];
    if (values["has-spouse"] !== true && !dependents.some((name) => filled(values[name]))) {
      assumptions.push({ key: "family", text: "配偶者・扶養している家族: なし" });
    }
    if (!["ideco-paid", "kyosai-paid", "furusato-paid", "other-deductions"].some((name) => filled(values[name]))) {
      assumptions.push({
        key: "paid",
        text: "iDeCo・小規模企業共済の掛金、ふるさと納税の寄附済みの額、医療費控除や生命保険料控除など: なし",
      });
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
