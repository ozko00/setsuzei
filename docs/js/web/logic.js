/**
 * ブラウザ版の計算部分（DOM に触らない純粋関数）。
 * 入力の名前は CLI のフラグ名と同じで、CLI と同じ flagsToInput → calculate を通す。
 */
import { parseAmount } from "../src/cli/amount.js";
import { flagsToInput, INPUT_BOOLEAN_FLAGS, INPUT_STRING_FLAGS, issueFlag } from "../src/cli/flags.js";
import { calculate, compareFurusatoLimit } from "../src/core/calculate.js";
import { InputError } from "../src/core/validate.js";
import { estimateInsurance } from "./guide.js";
/** フォームの値を CLI のフラグと同じ形にする。空欄は「指定なし」。 */
export function valuesToFlags(values) {
    const flags = {};
    for (const name of INPUT_STRING_FLAGS) {
        const value = values[name];
        if (typeof value === "string" && value.trim() !== "")
            flags[name] = value.trim();
    }
    for (const name of INPUT_BOOLEAN_FLAGS) {
        if (values[name] === true)
            flags[name] = true;
    }
    // 雑所得のときは青色申告特別控除の選択欄を隠しているので、残っている値は使わない
    if (flags["misc"] === true)
        delete flags["blue"];
    // 「配偶者がいる」にチェックがなければ配偶者の入力は使わない。チェックありで所得が空欄なら 0 円。
    if (values["has-spouse"] === true) {
        if (flags["spouse-income"] === undefined)
            flags["spouse-income"] = "0";
    }
    else if (values["has-spouse"] === false) {
        delete flags["spouse-income"];
        delete flags["spouse-70"];
    }
    return flags;
}
/** フォームの値から計算する。入力の誤りは issues で返す。 */
export function compute(values) {
    try {
        return { ok: true, result: calculate(flagsToInput(valuesToFlags(values))) };
    }
    catch (error) {
        if (error instanceof InputError)
            return { ok: false, issues: error.issues };
        if (error instanceof RangeError)
            return { ok: false, issues: [error.message] };
        throw error;
    }
}
/** フォームの値から、令和 8 年分の結果と、ふるさと納税の上限の令和 7 年分との比較を計算する。 */
export function computeComparison(values) {
    try {
        const input = flagsToInput(valuesToFlags(values));
        return { ok: true, result: calculate(input), comparison: compareFurusatoLimit(input) };
    }
    catch (error) {
        if (error instanceof InputError)
            return { ok: false, issues: error.issues };
        if (error instanceof RangeError)
            return { ok: false, issues: [error.message] };
        throw error;
    }
}
/**
 * 入力エラーのメッセージを、入力欄の名前（CLI のフラグ名）と本文に分ける。
 * どの欄のものかわからないメッセージは field が null。
 */
export function splitIssue(issue) {
    const parsed = issueFlag(issue);
    return parsed ? { field: parsed.flag, message: parsed.message } : { field: null, message: issue };
}
/**
 * URL のクエリ文字列（?revenue=800万&blue=65 など、CLI のフラグ名）をフォームの値にする。
 * 知らない名前は無視する。
 */
export function queryToValues(query) {
    const params = new URLSearchParams(query);
    const values = {};
    for (const name of INPUT_STRING_FLAGS) {
        const value = params.get(name);
        if (value !== null)
            values[name] = value;
    }
    for (const name of INPUT_BOOLEAN_FLAGS) {
        if (params.has(name) && params.get(name) !== "0" && params.get(name) !== "false")
            values[name] = true;
    }
    if (values["spouse-income"] !== undefined || values["spouse-70"] === true)
        values["has-spouse"] = true;
    return values;
}
/** 収入が何も入力されていないか（結果の代わりに案内を出す判断に使う）。 */
export function isBlank(values) {
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
export const TOP_ONLY_NAMES = ["work", "si-mode", "misc-assumed", "furusato-add"];
const yen = (n) => `${n.toLocaleString("ja-JP")} 円`;
const filled = (value) => typeof value === "string" && value.trim() !== "";
/** トップページの値を、CLI のフラグと同じ形の値にそろえる（目安の社会保険料はまだ入れない）。 */
function normalizeTop(values) {
    const v = { ...values };
    // 「給料はない」を選んでいる間は、給与の欄を隠しているので値を使わない
    if (v["work"] === "freelance")
        v["salary"] = "";
    if (v["blue"] === "unknown")
        v["blue"] = "";
    if (v["si-mode"] === "estimate")
        v["social-insurance"] = "";
    return v;
}
/** トップページで、収入がまだ何も入っていないか。 */
export function isBlankTop(values) {
    return isBlank(normalizeTop(values));
}
function savingBetween(before, after) {
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
export function computeTop(values) {
    const v = normalizeTop(values);
    const issues = [];
    try {
        let insurance = null;
        if (values["si-mode"] === "estimate") {
            // 所得は社会保険料に関係なく決まるので、先に社会保険料なしで計算して、目安の計算に使う
            const first = calculate(flagsToInput(valuesToFlags(v)));
            const kind = first.input.salaryRevenue > 0 ? "employee" : "freelance";
            insurance = estimateInsurance(kind, first.input.salaryRevenue, first.baseline.totalIncome);
            v["social-insurance"] = String(insurance.amount);
        }
        const effective = valuesToFlags(v);
        const input = flagsToInput(effective);
        const result = calculate(input);
        let furusatoCustom = null;
        const furusatoText = values["furusato-add"];
        if (typeof furusatoText === "string" && furusatoText.trim() !== "") {
            furusatoCustom = parseAmount(furusatoText);
            if (furusatoCustom === null) {
                issues.push(/^\s*[-−ー－]/.test(furusatoText)
                    ? `--furusato-add: 0 以上の金額で指定してください（受け取った値: ${JSON.stringify(furusatoText)}）`
                    : `--furusato-add: 金額として読めません（${JSON.stringify(furusatoText)}）`);
            }
        }
        if (issues.length > 0)
            return { ok: false, issues };
        // --- 年内にやること ---
        const n = result.input;
        const m = result.measures;
        const c = m.combined;
        const { idecoAdditional: _i, kyosaiAdditional: _k, ...base } = input;
        const at = (kyosai, ideco, furusato) => calculate({
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
        const plan = {
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
        const assumptions = [];
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
    }
    catch (error) {
        if (error instanceof InputError)
            return { ok: false, issues: [...error.issues, ...issues] };
        if (error instanceof RangeError)
            return { ok: false, issues: [error.message] };
        throw error;
    }
}
/**
 * 計算コアの注意書きのうち、CLI や JSON の指定方法を書いた括弧（「（CLI は --ideco-add、JSON は …）」）を、
 * ブラウザ版の画面では出さない。画面の利用者に関係のない文面のため。
 */
export function browserNote(text) {
    return text.replace(/（CLI は[^）]*）/g, "");
}
