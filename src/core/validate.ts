import { DEFAULT_YEAR, supportedYears } from "../data/index.js";
import type { BlueReturn, DependentsInput, SpouseInput, TaxInput } from "./types.js";

/** 入力の誤り。issues に項目ごとのメッセージが入る。 */
export class InputError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`入力に誤りがあります:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "InputError";
    this.issues = issues;
  }
}

const AMOUNT_KEYS = [
  "salaryRevenue",
  "businessRevenue",
  "businessExpenses",
  "socialInsurance",
  "idecoPaid",
  "idecoAnnualLimit",
  "kyosaiPaid",
  "furusatoPaid",
  "otherDeductions",
  "otherDeductionsResident",
  "idecoAdditional",
  "kyosaiAdditional",
] as const satisfies readonly (keyof TaxInput)[];

const DEPENDENT_KEYS = ["general", "specific", "elderly", "elderlyCohabiting", "under16"] as const satisfies readonly (keyof DependentsInput)[];

const BLUE_VALUES: readonly BlueReturn[] = ["none", "10", "55", "65"];

const KNOWN_KEYS = new Set<string>([
  ...AMOUNT_KEYS,
  "year",
  "businessIncomeType",
  "blueReturn",
  "spouse",
  "dependents",
  "nhiIncomeRatePercent",
  "incomeAdjustment",
]);

/** 金額として扱える上限（1 兆円）。桁の打ち間違いを弾く。 */
const MAX_AMOUNT = 1_000_000_000_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkAmount(value: unknown, name: string, issues: string[], max = MAX_AMOUNT): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number" && Number.isInteger(value) && value > max) {
    issues.push(`${name}: 大きすぎます。${max.toLocaleString("ja-JP")} 以下で指定してください（受け取った値: ${value.toLocaleString("ja-JP")}）`);
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    issues.push(`${name}: 0 以上の整数（円）で指定してください（受け取った値: ${JSON.stringify(value)}）`);
    return undefined;
  }
  return value;
}

/**
 * 外部から来た値（JSON など）を検証して TaxInput にする。
 * 知らないキーや不正な値があれば InputError を投げる。
 */
export function validateInput(raw: unknown): TaxInput {
  if (!isPlainObject(raw)) {
    throw new InputError(["入力は JSON オブジェクトで指定してください"]);
  }
  const issues: string[] = [];
  for (const key of Object.keys(raw)) {
    if (!KNOWN_KEYS.has(key)) issues.push(`${key}: 知らない項目です`);
  }

  const out: { -readonly [K in keyof TaxInput]: TaxInput[K] } = {};

  if (raw["year"] !== undefined && raw["year"] !== null) {
    const year = raw["year"];
    if (typeof year !== "number" || !supportedYears().includes(year)) {
      issues.push(`year: 対応している年分は ${supportedYears().join(", ")} です（省略時は ${DEFAULT_YEAR}）`);
    } else {
      out.year = year;
    }
  }

  for (const key of AMOUNT_KEYS) {
    const value = checkAmount(raw[key], key, issues);
    if (value !== undefined) out[key] = value;
  }

  const nhiRate = raw["nhiIncomeRatePercent"];
  if (nhiRate !== undefined && nhiRate !== null) {
    // 小数第 3 位まで（0.001% 単位）。計算は整数で行う。
    const ok =
      typeof nhiRate === "number" &&
      Number.isFinite(nhiRate) &&
      nhiRate > 0 &&
      nhiRate <= 100 &&
      Math.abs(nhiRate * 1_000 - Math.round(nhiRate * 1_000)) < 1e-6;
    if (ok) out.nhiIncomeRatePercent = nhiRate;
    else {
      issues.push(
        `nhiIncomeRatePercent: 0 より大きく 100 以下のパーセント（小数第3位まで。例: 11.5）で指定してください（受け取った値: ${JSON.stringify(nhiRate)}）`,
      );
    }
  }

  const adjustment = raw["incomeAdjustment"];
  if (adjustment !== undefined && adjustment !== null) {
    if (typeof adjustment === "boolean") out.incomeAdjustment = adjustment;
    else issues.push("incomeAdjustment: true / false で指定してください");
  }

  const type = raw["businessIncomeType"];
  if (type !== undefined && type !== null) {
    if (type === "business" || type === "misc") out.businessIncomeType = type;
    else issues.push(`businessIncomeType: "business"（事業所得）か "misc"（雑所得）で指定してください`);
  }

  const blue = raw["blueReturn"];
  if (blue !== undefined && blue !== null) {
    const normalized = typeof blue === "number" ? String(blue) : blue;
    if (typeof normalized === "string" && (BLUE_VALUES as readonly string[]).includes(normalized)) {
      out.blueReturn = normalized as BlueReturn;
    } else {
      issues.push(`blueReturn: "none" / "10" / "55" / "65" のいずれかで指定してください`);
    }
  }

  const spouse = raw["spouse"];
  if (spouse !== undefined && spouse !== null) {
    if (!isPlainObject(spouse)) {
      issues.push("spouse: { income, age70OrOlder } の形で指定してください");
    } else {
      for (const key of Object.keys(spouse)) {
        if (key !== "income" && key !== "age70OrOlder") issues.push(`spouse.${key}: 知らない項目です`);
      }
      const income = checkAmount(spouse["income"], "spouse.income", issues);
      if (spouse["income"] === undefined || spouse["income"] === null) {
        issues.push("spouse.income: 配偶者の合計所得金額（円）を指定してください");
      }
      const age = spouse["age70OrOlder"];
      if (age !== undefined && age !== null && typeof age !== "boolean") {
        issues.push("spouse.age70OrOlder: true / false で指定してください");
      }
      if (income !== undefined) {
        const s: { -readonly [K in keyof SpouseInput]: SpouseInput[K] } = { income };
        if (typeof age === "boolean") s.age70OrOlder = age;
        out.spouse = s;
      }
    }
  }

  const dependents = raw["dependents"];
  if (dependents !== undefined && dependents !== null) {
    if (!isPlainObject(dependents)) {
      issues.push("dependents: { general, specific, elderly, elderlyCohabiting, under16 } の形で人数を指定してください");
    } else {
      const d: { -readonly [K in keyof DependentsInput]: DependentsInput[K] } = {};
      for (const key of Object.keys(dependents)) {
        if (!(DEPENDENT_KEYS as readonly string[]).includes(key)) issues.push(`dependents.${key}: 知らない項目です`);
      }
      for (const key of DEPENDENT_KEYS) {
        const value = checkAmount(dependents[key], `dependents.${key}`, issues, 99);
        if (value !== undefined) d[key] = value;
      }
      out.dependents = d;
    }
  }

  if (out.blueReturn && out.blueReturn !== "none" && out.businessIncomeType === "misc") {
    issues.push("blueReturn: 雑所得には青色申告特別控除を適用できません");
  }

  if (issues.length > 0) throw new InputError(issues);
  return out;
}
