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
  "other-deductions": "otherDeductions",
  "other-deductions-resident": "otherDeductionsResident",
} as const;

const DEPENDENT_FLAGS = {
  dependents: "general",
  "dependents-specific": "specific",
  "dependents-elderly": "elderly",
  "dependents-elderly-cohabiting": "elderlyCohabiting",
} as const;

/** 値を取る入力フラグの名前 */
export const INPUT_STRING_FLAGS = [
  ...(Object.keys(AMOUNT_FLAGS) as (keyof typeof AMOUNT_FLAGS)[]),
  ...(Object.keys(DEPENDENT_FLAGS) as (keyof typeof DEPENDENT_FLAGS)[]),
  "spouse-income",
  "blue",
  "year",
  "nhi-rate",
] as const;

/** 真偽値の入力フラグの名前 */
export const INPUT_BOOLEAN_FLAGS = ["misc", "spouse-70"] as const;

export type InputFlags = Partial<Record<(typeof INPUT_STRING_FLAGS)[number], string>> &
  Partial<Record<(typeof INPUT_BOOLEAN_FLAGS)[number], boolean>>;

/** フラグを TaxInput の形（検証前）にする。 */
export function flagsToInput(flags: InputFlags): Record<string, unknown> {
  const issues: string[] = [];
  const input: Record<string, unknown> = {};
  const amountOf = (flag: string, text: string): number | undefined => {
    const value = parseAmount(text);
    if (value === null) issues.push(`--${flag}: 金額として読めません（${JSON.stringify(text)}）`);
    return value ?? undefined;
  };

  for (const [flag, key] of Object.entries(AMOUNT_FLAGS)) {
    const text = flags[flag as keyof typeof AMOUNT_FLAGS];
    if (text !== undefined) input[key] = amountOf(flag, text);
  }
  const dependents: Record<string, unknown> = {};
  for (const [flag, key] of Object.entries(DEPENDENT_FLAGS)) {
    const text = flags[flag as keyof typeof DEPENDENT_FLAGS];
    if (text === undefined) continue;
    if (/^\d+$/.test(text.trim())) dependents[key] = Number(text.trim());
    else issues.push(`--${flag}: 人数を整数で指定してください（${JSON.stringify(text)}）`);
  }
  if (Object.keys(dependents).length > 0) input["dependents"] = dependents;

  if (flags["spouse-income"] !== undefined) {
    const income = amountOf("spouse-income", flags["spouse-income"]);
    input["spouse"] = { income, ...(flags["spouse-70"] ? { age70OrOlder: true } : {}) };
  } else if (flags["spouse-70"]) {
    issues.push("--spouse-70: --spouse-income と一緒に指定してください");
  }
  if (flags["nhi-rate"] !== undefined) {
    const text = flags["nhi-rate"].trim().replace(/[%％]$/, "");
    if (/^\d+(\.\d+)?$/.test(text)) input["nhiIncomeRatePercent"] = Number(text);
    else issues.push(`--nhi-rate: パーセントの数値で指定してください（例: 11.5。受け取った値: ${JSON.stringify(flags["nhi-rate"])}）`);
  }
  if (flags.misc) input["businessIncomeType"] = "misc";
  if (flags.blue !== undefined) input["blueReturn"] = flags.blue;
  if (flags.year !== undefined) input["year"] = /^\d+$/.test(flags.year) ? Number(flags.year) : flags.year;

  if (issues.length > 0) throw new InputError(issues);
  return input;
}
