/**
 * MCP のツールの入力と出力の JSON Schema（2020-12）。
 * 出力のスキーマは src/core/types.ts の型と同じ形で、実際の出力がこれに合うことをテストで確かめている。
 */

export type JsonSchema = { readonly [key: string]: unknown };

const obj = (properties: Record<string, JsonSchema>, optional: readonly string[] = [], description?: string): JsonSchema => ({
  type: "object",
  ...(description ? { description } : {}),
  properties,
  required: Object.keys(properties).filter((key) => !optional.includes(key)),
  additionalProperties: false,
});
const yen = (description: string): JsonSchema => ({ type: "integer", minimum: 0, description: `${description} (JPY, whole yen)` });
const amount = (description?: string): JsonSchema => ({ type: "integer", ...(description ? { description } : {}) });
const count = (description: string): JsonSchema => ({ type: "integer", minimum: 0, description });
const text = (description?: string): JsonSchema => ({ type: "string", ...(description ? { description } : {}) });
const list = (items: JsonSchema, description?: string): JsonSchema => ({ type: "array", items, ...(description ? { description } : {}) });
const nullable = (schema: JsonSchema): JsonSchema => ({ anyOf: [schema, { type: "null" }] });
const BLUE = { type: "string", enum: ["none", "10", "55", "65"] } as const;

/** 入力（TaxInput）。金額はすべて年額・円・0 以上の整数。省略した項目は 0（なし）。 */
export const taxInputSchema: JsonSchema = {
  type: "object",
  description:
    "Projected full-year figures for one person, tax year 2026 (Reiwa 8). All amounts are annual, in whole Japanese yen (integers, no units). Omitted fields mean 0 / none.",
  properties: {
    year: { type: "integer", enum: [2026], description: "Tax year (calendar year). Only 2026 is supported." },
    salaryRevenue: yen("Salary revenue before any deductions (gross annual pay; 源泉徴収票の「支払金額」)"),
    businessRevenue: yen("Revenue of the freelance business or side job (売上), before expenses"),
    businessExpenses: yen("Necessary expenses of that business (必要経費)"),
    businessIncomeType: {
      type: "string",
      enum: ["business", "misc"],
      description:
        "How the business revenue is taxed: 'business' = business income (事業所得, default), 'misc' = miscellaneous income (雑所得; no blue-return deduction, losses cannot offset other income). Ask the user; do not decide for them.",
    },
    blueReturn: {
      ...BLUE,
      description:
        "Blue-return special deduction (青色申告特別控除) the user expects this year: 'none' = white return (default), '10' / '55' / '65' = 100,000 / 550,000 / 650,000 yen. Only applies to business income.",
    },
    socialInsurance: yen("Social insurance premiums paid this year (national health insurance, national pension, or the amounts withheld from salary)"),
    idecoPaid: yen("iDeCo contributions this year, already made or fixed"),
    idecoAnnualLimit: yen("Annual iDeCo contribution limit for this person. If omitted it is assumed from the employment type"),
    kyosaiPaid: yen("Small Business Mutual Aid (小規模企業共済) premiums this year, already paid or fixed"),
    furusatoPaid: yen("Furusato nozei (hometown tax donations) already made this year"),
    spouse: obj(
      {
        income: yen("Spouse's total income (合計所得金額), not gross pay. 0 if the spouse has no income"),
        age70OrOlder: { type: "boolean", description: "Spouse is 70 or older on December 31" },
      },
      ["age70OrOlder"],
      "Spouse living in the same household. Omit if there is no spouse.",
    ),
    dependents: obj(
      {
        general: count("Dependents aged 16-18 or 23-69"),
        specific: count("Dependents aged 19-22"),
        elderly: count("Dependents aged 70+ (other than cohabiting parents/grandparents)"),
        elderlyCohabiting: count("Cohabiting parents/grandparents aged 70+"),
        under16: count("Dependents under 16. No dependent deduction, but they raise the resident-tax exemption threshold"),
      },
      ["general", "specific", "elderly", "elderlyCohabiting", "under16"],
      "Number of dependents by age on December 31.",
    ),
    incomeAdjustment: {
      type: "boolean",
      description:
        "Eligible for the income adjustment deduction (所得金額調整控除): salary over 8,500,000 yen and a dependent under 23 or a person with a special disability. Set automatically when under16 or specific dependents are given.",
    },
    otherDeductions: yen("Total of other income deductions for income tax (medical expenses, life insurance premiums, etc.)"),
    otherDeductionsResident: yen("The same total for resident tax. Defaults to otherDeductions"),
    nhiIncomeRatePercent: {
      type: "number",
      minimum: 0,
      description: "Income-based rate of the municipality's national health insurance premium, in percent (e.g. 11.5). Only used to estimate how the blue-return level changes next year's premium",
    },
    idecoAdditional: yen("Extra iDeCo contribution the user has confirmed is possible within this year. Only when given is iDeCo included in the combined plan"),
    kyosaiAdditional: yen("Extra mutual-aid premium to pay this year. Defaults to the remaining room up to the annual limit"),
  },
  additionalProperties: false,
};

const saving = obj(
  { incomeTax: amount("Reduction in national income tax"), residentTax: amount("Reduction in local resident tax"), total: amount() },
  [],
  "Tax reduction in yen (positive = less tax).",
);

const deductions = obj({
  basic: amount(),
  spouse: amount(),
  dependents: amount(),
  socialInsurance: amount(),
  smallBusinessMutualAid: amount("iDeCo + Small Business Mutual Aid"),
  donation: amount(),
  other: amount(),
  total: amount(),
});

const taxEstimate = obj(
  {
    salaryIncome: amount("Employment income after the salary income deduction"),
    incomeAdjustment: amount(),
    businessIncome: amount("Business or miscellaneous income after the blue-return deduction"),
    blueDeductionApplied: amount(),
    totalIncome: amount("Total income (合計所得金額)"),
    incomeTax: obj({
      deductions,
      taxableIncome: amount("Taxable income, rounded down to 1,000 yen"),
      marginalRatePercent: { type: "number", description: "Marginal income tax rate in percent (0 when taxable income is 0)" },
      baseTax: amount(),
      reconstructionTax: amount(),
      total: amount("Income tax + special reconstruction income tax"),
    }),
    residentTax: obj({
      deductions,
      taxableIncome: amount(),
      adjustmentCredit: amount(),
      incomeLevyBeforeDonation: amount(),
      incomeLevyExemptLimit: amount("Total-income threshold at or below which the income-based part of resident tax is not charged"),
      incomeLevyExempt: { type: "boolean" },
      exemptionReduction: amount(),
      donationCreditBasic: amount(),
      donationCreditSpecial: amount(),
      incomeLevy: amount("Income-based part (所得割)"),
      perCapita: amount("Per-capita part + forest environment tax"),
      total: amount(),
    }),
    totalTax: amount("Income tax (incl. reconstruction tax) + resident tax"),
  },
  [],
  "Estimated tax for one scenario.",
);

const notes = list(text(), "Explanations and caveats, in Japanese");

const furusatoMeasure = obj({
  limit: amount("Annual donation limit at which the out-of-pocket cost stays at about 2,000 yen (includes donations already made). 0 when no limit can be given"),
  paid: amount(),
  remaining: amount("limit - paid, not below 0"),
  saving,
  outOfPocket: amount("Out-of-pocket cost when donating up to the limit"),
  limitAfterOtherMeasures: amount("Limit after the contributions in the combined plan"),
  notes,
});

const contributionMeasure = obj({
  applicable: { type: "boolean", description: "false when this measure was not calculated; the reason is in notes" },
  annualLimit: amount(),
  paid: amount(),
  remaining: amount(),
  additional: amount("Extra contribution used for the saving figure"),
  noEffectBeyond: nullable(amount("Extra contribution beyond which tax no longer decreases")),
  saving,
  notes,
});

const combinedMeasure = obj({
  includesIdeco: { type: "boolean" },
  idecoAdditional: amount(),
  kyosaiAdditional: amount(),
  furusatoAdditional: amount(),
  totalPayment: amount("Total extra amount to pay"),
  totalTax: amount("Tax after doing everything, recomputed together"),
  saving,
  savingFromContributions: saving,
  savingFromFurusato: saving,
  notes,
});

const blueOption = obj({
  level: BLUE,
  deduction: amount(),
  deductionApplied: amount(),
  totalTax: amount(),
  savingVsCurrent: saving,
  current: { type: "boolean" },
});

const nhiMeasure = obj({
  ratePercent: { type: "number" },
  baseIncome: amount(),
  incomeLevy: amount(),
  blueReturnOptions: list(obj({ level: BLUE, baseIncome: amount(), incomeLevy: amount(), reductionVsCurrent: amount(), current: { type: "boolean" } })),
  notes,
});

const normalizedFields: Record<string, JsonSchema> = {
  year: amount(),
  salaryRevenue: amount(),
  businessRevenue: amount(),
  businessExpenses: amount(),
  businessIncomeType: { type: "string", enum: ["business", "misc"] },
  blueReturn: BLUE,
  socialInsurance: amount(),
  idecoPaid: amount(),
  kyosaiPaid: amount(),
  furusatoPaid: amount(),
  spouse: nullable(obj({ income: amount(), age70OrOlder: { type: "boolean" } }, ["age70OrOlder"])),
  dependents: obj({ general: amount(), specific: amount(), elderly: amount(), elderlyCohabiting: amount(), under16: amount() }),
  incomeAdjustment: { type: "boolean" },
  otherDeductions: amount(),
  otherDeductionsResident: amount(),
};
const normalizedInput = obj(normalizedFields);
/** validate_tax_input が返す入力: 既定値を埋めたものに、指定された試算の条件を残したもの。そのまま計算のツールに渡せる */
const validatedInput = obj(
  { ...normalizedFields, spouse: obj({ income: amount(), age70OrOlder: { type: "boolean" } }, ["age70OrOlder"]), idecoAnnualLimit: amount(), idecoAdditional: amount(), kyosaiAdditional: amount(), nhiIncomeRatePercent: { type: "number" } },
  ["spouse", "idecoAnnualLimit", "idecoAdditional", "kyosaiAdditional", "nhiIncomeRatePercent"],
);

/** calculate() の結果（SetsuzeiResult）と同じ形 */
export const resultSchema: JsonSchema = obj({
  year: amount(),
  label: text("Tax year label, e.g. 令和8年分"),
  residentTaxLabel: text("Fiscal year of the resident tax, e.g. 令和9年度"),
  input: normalizedInput,
  baseline: taxEstimate,
  measures: obj({
    furusato: furusatoMeasure,
    ideco: contributionMeasure,
    kyosai: contributionMeasure,
    blueReturn: obj({ applicable: { type: "boolean" }, current: BLUE, options: list(blueOption), notes }),
    combined: combinedMeasure,
    combinedWithIdeco: nullable(combinedMeasure),
    nationalHealthInsurance: nullable(nhiMeasure),
  }),
  warnings: list(text(), "Warnings that depend on the input, in Japanese"),
  disclaimer: text(),
});

const yearLimit = obj({
  label: text(),
  residentTaxLabel: text(),
  limit: amount(),
  salaryIncome: amount(),
  incomeTaxBasicDeduction: amount(),
  residentTaxableIncome: amount(),
  incomeLevy: amount(),
  specialCap: amount(),
  adjustmentAmount: amount(),
  rateBase: amount(),
  specialRatePer100k: amount("Special-credit rate in 1/100,000 (84895 = 84.895%)"),
  exempt: { type: "boolean" },
});

/** compareFurusatoLimit() の結果と同じ形 */
export const comparisonSchema: JsonSchema = obj({
  current: yearLimit,
  previous: yearLimit,
  difference: amount("current.limit - previous.limit (negative = the limit went down)"),
  reasons: list({ type: "string", enum: ["specialRate", "incomeLevy"] }),
  notes,
});

const source = obj({ title: text(), url: text() });

/** どの結果にも付ける: 概算である旨・前提・計算していないもの・出典 */
export const metaSchema: JsonSchema = obj(
  {
    engine: obj({ name: text(), version: text() }),
    taxYear: amount(),
    estimate: { type: "boolean", const: true, description: "Always true: the figures are estimates, not a tax determination" },
    disclaimer: text("Must be passed on to the user"),
    assumptions: list(text(), "Simplifying assumptions behind the figures, in Japanese"),
    notCalculated: list(text(), "What the engine does not calculate, in Japanese"),
    sources: list(source, "Primary sources (National Tax Agency, ministries, statutes) the rates and thresholds were checked against"),
  },
  [],
  "Estimate notice, assumptions and primary sources. Always present.",
);

export const outputSchemas = {
  estimate: obj({ result: resultSchema, meta: metaSchema }),
  furusato: obj({
    year: amount(),
    label: text(),
    residentTaxLabel: text(),
    furusato: furusatoMeasure,
    baseline: obj({ totalIncome: amount(), incomeTax: amount(), residentTax: amount(), totalTax: amount(), residentIncomeLevyExempt: { type: "boolean" } }),
    warnings: list(text()),
    meta: metaSchema,
  }),
  comparison: obj({ comparison: comparisonSchema, meta: metaSchema }),
  validation: obj({
    valid: { type: "boolean" },
    issues: list(text(), "One message per problem, in Japanese, prefixed with the field name"),
    normalized: nullable(validatedInput),
    meta: metaSchema,
  }),
  sources: obj({ year: amount(), sources: list(source), meta: metaSchema }),
} as const;
