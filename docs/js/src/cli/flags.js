import { m } from "../core/messages.js";
import { InputError } from "../core/validate.js";
import { parseAmount } from "./amount.js";
/**
 * 入力に関するフラグ（--revenue など）を TaxInput の形にする。
 * CLI とブラウザ版の両方がこの関数を通すので、同じ入力は同じ値になる。
 */
const AMOUNT_FLAGS = {
    salary: "salaryRevenue",
    revenue: "businessRevenue",
    expenses: "businessExpenses",
    "social-insurance": "socialInsurance",
    "ideco-paid": "idecoPaid",
    "ideco-limit": "idecoAnnualLimit",
    "ideco-add": "idecoAdditional",
    "kyosai-paid": "kyosaiPaid",
    "kyosai-add": "kyosaiAdditional",
    "furusato-paid": "furusatoPaid",
    medical: "medicalExpenses",
    "medical-reimbursed": "medicalReimbursed",
    "self-medication": "selfMedicationExpenses",
    "life-new": "lifeInsuranceNew",
    "life-old": "lifeInsuranceOld",
    "care-medical": "medicalCareInsurance",
    "pension-new": "pensionInsuranceNew",
    "pension-old": "pensionInsuranceOld",
    "other-deductions": "otherDeductions",
    "other-deductions-resident": "otherDeductionsResident",
};
const DEPENDENT_FLAGS = {
    dependents: "general",
    "dependents-specific": "specific",
    "dependents-elderly": "elderly",
    "dependents-elderly-cohabiting": "elderlyCohabiting",
    "dependents-under16": "under16",
};
/** 値を取る入力フラグの名前 */
export const INPUT_STRING_FLAGS = [
    ...Object.keys(AMOUNT_FLAGS),
    ...Object.keys(DEPENDENT_FLAGS),
    "spouse-income",
    "blue",
    "year",
    "nhi-rate",
];
/** 真偽値の入力フラグの名前 */
export const INPUT_BOOLEAN_FLAGS = ["misc", "spouse-70", "income-adjustment", "dependent-under23"];
function toHalfWidthDigits(text) {
    return text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}
const KEY_TO_FLAG = {
    ...Object.fromEntries(Object.entries(AMOUNT_FLAGS).map(([flag, key]) => [key, flag])),
    ...Object.fromEntries(Object.entries(DEPENDENT_FLAGS).map(([flag, key]) => [`dependents.${key}`, flag])),
    "spouse.income": "spouse-income",
    "spouse.age70OrOlder": "spouse-70",
    blueReturn: "blue",
    businessIncomeType: "misc",
    nhiIncomeRatePercent: "nhi-rate",
    incomeAdjustment: "income-adjustment",
    dependentUnder23: "dependent-under23",
    year: "year",
};
/**
 * 入力エラーのメッセージの項目名を CLI のフラグ名にそろえる（「blueReturn: …」→「--blue: …」）。
 * フラグで入力した人には、JSON の項目名ではなくフラグ名で伝える。対応するフラグがなければそのまま。
 */
export function issueWithFlagName(issue) {
    const parsed = issueFlag(issue);
    return parsed ? `--${parsed.flag}: ${parsed.message}` : issue;
}
/**
 * 入力エラーのメッセージ（「--revenue: …」「businessRevenue: …」）が、どのフラグについてのものかを返す。
 * ブラウザ版が、該当する入力欄を示すのに使う。わからなければ null。
 */
export function issueFlag(issue) {
    const match = /^(--)?([A-Za-z0-9.-]+): (.*)$/s.exec(issue);
    if (!match || match[2] === undefined || match[3] === undefined)
        return null;
    const flag = match[1] ? match[2] : KEY_TO_FLAG[match[2]];
    return flag === undefined ? null : { flag, message: match[3] };
}
/** フラグを TaxInput の形（検証前）にする。 */
export function flagsToInput(flags) {
    const issues = [];
    const input = {};
    const amountOf = (flag, text) => {
        const value = parseAmount(text);
        if (value === null) {
            issues.push(/^\s*[-−ー－]/.test(text)
                ? m().flagNegative(flag, text)
                : m().flagNotAmount(flag, text));
        }
        return value ?? undefined;
    };
    for (const [flag, key] of Object.entries(AMOUNT_FLAGS)) {
        const text = flags[flag];
        if (text !== undefined)
            input[key] = amountOf(flag, text);
    }
    const dependents = {};
    for (const [flag, key] of Object.entries(DEPENDENT_FLAGS)) {
        const text = flags[flag];
        if (text === undefined)
            continue;
        const count = toHalfWidthDigits(text.trim());
        if (/^\d+$/.test(count))
            dependents[key] = Number(count);
        else
            issues.push(m().flagCount(flag, text));
    }
    if (Object.keys(dependents).length > 0)
        input["dependents"] = dependents;
    if (flags["spouse-income"] !== undefined) {
        const income = amountOf("spouse-income", flags["spouse-income"]);
        input["spouse"] = { income, ...(flags["spouse-70"] ? { age70OrOlder: true } : {}) };
    }
    else if (flags["spouse-70"]) {
        issues.push(m().flagSpouse70);
    }
    if (flags["nhi-rate"] !== undefined) {
        const text = flags["nhi-rate"].trim().replace(/[%％]$/, "");
        if (/^\d+(\.\d+)?$/.test(text))
            input["nhiIncomeRatePercent"] = Number(text);
        else
            issues.push(m().flagNhiRate(flags["nhi-rate"]));
    }
    if (flags["income-adjustment"])
        input["incomeAdjustment"] = true;
    if (flags["dependent-under23"])
        input["dependentUnder23"] = true;
    if (flags.misc)
        input["businessIncomeType"] = "misc";
    if (flags.blue !== undefined)
        input["blueReturn"] = flags.blue;
    if (flags.year !== undefined)
        input["year"] = /^\d+$/.test(flags.year) ? Number(flags.year) : flags.year;
    if (issues.length > 0)
        throw new InputError(issues);
    return input;
}
