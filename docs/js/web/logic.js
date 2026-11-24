/**
 * ブラウザ版の計算部分（DOM に触らない純粋関数）。
 * 入力の名前は CLI のフラグ名と同じで、CLI と同じ flagsToInput → calculate を通す。
 */
import { flagsToInput, INPUT_BOOLEAN_FLAGS, INPUT_STRING_FLAGS } from "../src/cli/flags.js";
import { calculate } from "../src/core/calculate.js";
import { InputError } from "../src/core/validate.js";
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
