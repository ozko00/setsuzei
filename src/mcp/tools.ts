/**
 * MCP のツール。どれも計算コア（calculate / compareFurusatoLimit / validateInput）をそのまま呼ぶだけで、
 * ここで税の計算はしない。外部とは通信しない。
 */
import { calculate, compareFurusatoLimit, DISCLAIMER } from "../core/calculate.js";
import { InputError, validateInput } from "../core/validate.js";
import { DEFAULT_YEAR, getSources } from "../data/index.js";
import { VERSION } from "../version.js";
import { outputSchemas, taxInputSchema, type JsonSchema } from "./schema.js";

/** 計算の前提（どの結果にも付ける） */
export const ASSUMPTIONS: readonly string[] = [
  "入力はすべて、年末までの年間の見込み額として扱う。社会保険料は入力された額をそのまま控除する。",
  "令和8年分（2026年分）の所得税・復興特別所得税と、令和9年度の住民税を計算する。",
  "住民税は標準税率（所得割 10%、均等割と森林環境税で 5,000 円）で計算する。",
  "ふるさと納税の上限の目安は、確定申告をする前提で、自己負担がおおむね 2,000 円で済む寄附額（1,000 円未満切り捨て）。",
  "iDeCo の年間の限度額は、指定がなければ、給与収入がなければ月額 68,000 円、あれば企業年金のない会社員の月額 23,000 円とする。",
  "各策の軽減額は、その策だけを実行した場合の額。まとめて実行した場合（combined）は、足し算ではなく計算し直した額。",
];

/** 計算していないもの */
export const NOT_CALCULATED: readonly string[] = [
  "国民健康保険料の全体額",
  "個人事業税",
  "消費税",
  "住民税の均等割の非課税判定（基準が自治体によって異なる）",
  "分離課税の所得（株式・不動産の譲渡など）",
  "住宅ローン控除などの税額控除",
  "加入資格や要件の判定（小規模企業共済に加入できるか、青色申告の要件を満たすか、扶養親族に当たるか）",
];

export function meta(year: number = DEFAULT_YEAR): Record<string, unknown> {
  return {
    engine: { name: "setsuzei", version: VERSION },
    taxYear: year,
    estimate: true,
    disclaimer: DISCLAIMER,
    assumptions: ASSUMPTIONS,
    notCalculated: NOT_CALCULATED,
    sources: getSources(year),
  };
}

export interface Tool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly outputSchema: JsonSchema;
  /** 入力の誤り（InputError）は、呼び出し側がツールの実行エラーにする */
  readonly run: (args: Record<string, unknown>) => Record<string, unknown>;
}

const COMMON =
  " Amounts are annual, in whole Japanese yen. Pass the user's own projected figures; do not invent missing ones (omitted fields count as 0). " +
  "The numbers come from a tested calculation engine whose rates and thresholds are cited from primary sources; do not recompute or adjust them yourself. " +
  "Results are estimates: always pass on `meta.disclaimer`. Notes and warnings in the result are in Japanese. Runs locally and sends nothing over the network.";

export const TOOLS: readonly Tool[] = [
  {
    name: "estimate_tax_savings",
    title: "Estimate Japanese income/resident tax and year-end savings",
    description:
      "Estimate a freelancer's or side-job worker's Japanese income tax (tax year 2026 / Reiwa 8) and resident tax, and how much each year-end measure would still reduce them: " +
      "furusato nozei (hometown tax donation) limit, iDeCo, Small Business Mutual Aid (小規模企業共済), and the blue-return special deduction (青色申告特別控除). " +
      "Returns the current tax, each measure's limit / remaining room / tax reduction, and a combined plan with the extra payment and the reduction recomputed together." +
      COMMON,
    inputSchema: taxInputSchema,
    outputSchema: outputSchemas.estimate,
    run: (args) => {
      const result = calculate(validateInput(args));
      return { result, meta: meta(result.year) };
    },
  },
  {
    name: "furusato_nozei_limit",
    title: "Furusato nozei (hometown tax donation) limit",
    description:
      "Compute only the furusato nozei limit for tax year 2026: the annual donation amount at which the out-of-pocket cost stays at about 2,000 yen, " +
      "the remaining room after donations already made, and the tax reduction for donating up to the limit. " +
      "Use `estimate_tax_savings` instead when the user also asks about iDeCo, mutual aid or the blue-return deduction (contributions lower the limit)." +
      COMMON,
    inputSchema: taxInputSchema,
    outputSchema: outputSchemas.furusato,
    run: (args) => {
      const r = calculate(validateInput(args));
      const b = r.baseline;
      return {
        year: r.year,
        label: r.label,
        residentTaxLabel: r.residentTaxLabel,
        furusato: r.measures.furusato,
        baseline: {
          totalIncome: b.totalIncome,
          incomeTax: b.incomeTax.total,
          residentTax: b.residentTax.total,
          totalTax: b.totalTax,
          residentIncomeLevyExempt: b.residentTax.incomeLevyExempt,
        },
        warnings: r.warnings,
        meta: meta(r.year),
      };
    },
  },
  {
    name: "compare_furusato_limit_with_2025",
    title: "Compare the furusato nozei limit: tax year 2025 vs 2026",
    description:
      "Compare the furusato nozei limit for the same input between tax year 2025 (Reiwa 7) and 2026 (Reiwa 8), with the intermediate values and the reason for any change. " +
      "The 2026 increase of the income-tax basic deduction lowers the limit for some income bands and leaves most unchanged. " +
      "Only supports a spouse with zero income (the spouse income requirement differs between the two years)." +
      COMMON,
    inputSchema: taxInputSchema,
    outputSchema: outputSchemas.comparison,
    run: (args) => {
      const input = validateInput(args);
      return { comparison: compareFurusatoLimit(input), meta: meta(input.year ?? DEFAULT_YEAR) };
    },
  },
  {
    name: "validate_tax_input",
    title: "Validate an input without calculating",
    description:
      "Check an input object for `estimate_tax_savings` without returning tax figures: unknown fields, non-integer or negative amounts, unsupported values. " +
      "Returns `valid`, the list of problems (in Japanese, prefixed with the field name), and the normalized input with defaults filled in (it can be passed to the other tools as is)." +
      COMMON,
    inputSchema: { type: "object", description: "The input object to check. Any shape is accepted; problems are reported in the result.", additionalProperties: true },
    outputSchema: outputSchemas.validation,
    run: (args) => {
      try {
        const input = validateInput(args);
        // 既定値を埋めた入力。試算の条件（限度額・追加額・国保の料率）は、指定されたものをそのまま残す
        // （落とすと、この値を計算のツールに渡したときに、利用者の条件が変わってしまう）
        // 配偶者がいないときは、項目ごと省く（入力のスキーマでは、配偶者は「省くか、オブジェクト」）
        const { spouse, ...filled } = calculate(input).input;
        const normalized = {
          ...filled,
          ...(spouse ? { spouse } : {}),
          ...(input.idecoAnnualLimit !== undefined ? { idecoAnnualLimit: input.idecoAnnualLimit } : {}),
          ...(input.idecoAdditional !== undefined ? { idecoAdditional: input.idecoAdditional } : {}),
          ...(input.kyosaiAdditional !== undefined ? { kyosaiAdditional: input.kyosaiAdditional } : {}),
          ...(input.nhiIncomeRatePercent !== undefined ? { nhiIncomeRatePercent: input.nhiIncomeRatePercent } : {}),
        };
        return { valid: true, issues: [], normalized, meta: meta(input.year ?? DEFAULT_YEAR) };
      } catch (error) {
        if (error instanceof InputError) return { valid: false, issues: [...error.issues], normalized: null, meta: meta() };
        if (error instanceof RangeError) return { valid: false, issues: [error.message], normalized: null, meta: meta() };
        throw error;
      }
    },
  },
  {
    name: "list_tax_sources",
    title: "List the primary sources behind the numbers",
    description:
      "List the primary sources (National Tax Agency tax answers, ministry pages, statutes on e-Gov, scheme operators) that every rate, deduction and threshold in the engine was checked against, for tax year 2026. " +
      "Use it to cite where a figure comes from. Runs locally and sends nothing over the network.",
    inputSchema: {
      type: "object",
      properties: { year: { type: "integer", enum: [2026], description: "Tax year. Only 2026 is supported." } },
      additionalProperties: false,
    },
    outputSchema: outputSchemas.sources,
    run: (args) => {
      const year = args["year"] === undefined ? DEFAULT_YEAR : args["year"];
      if (typeof year !== "number") throw new InputError(["year: 年分を西暦の整数で指定してください"]);
      return { year, sources: getSources(year), meta: meta(year) };
    },
  },
];
