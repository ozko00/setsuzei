export { calculate, compareFurusatoLimit, DISCLAIMER } from "./core/calculate.js";
export {
  estimate,
  furusatoLimit,
  furusatoLimitDetail,
  type FurusatoLimitDetail,
  incomeAdjustment,
  incomeLevyExemptLimit,
  incomeTaxOnTaxableIncome,
  salaryIncome,
  type Scenario,
} from "./core/estimate.js";
export { InputError, validateInput } from "./core/validate.js";
export type { CalcOptions, Locale } from "./core/messages.js";
export type * from "./core/types.js";
export { DEFAULT_YEAR, getSources, getTaxYear, supportedYears } from "./data/index.js";
export type { IncomeTaxBracket, Source, TaxYearData, Tier } from "./data/index.js";
