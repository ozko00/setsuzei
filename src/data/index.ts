import { sources2026, taxYear2026 } from "./2026.js";
import type { Source, TaxYearData } from "./types.js";

export type { IncomeTaxBracket, Source, TaxYearData, Tier } from "./types.js";

const years: ReadonlyMap<number, { data: TaxYearData; sources: readonly Source[] }> = new Map([
  [2026, { data: taxYear2026, sources: sources2026 }],
]);

/** 既定の年分 */
export const DEFAULT_YEAR = 2026;

/** 対応している年分（西暦）の一覧 */
export function supportedYears(): number[] {
  return [...years.keys()].sort((a, b) => a - b);
}

/** 年分の税制データを返す。未対応の年分は例外。 */
export function getTaxYear(year: number = DEFAULT_YEAR): TaxYearData {
  const entry = years.get(year);
  if (!entry) {
    throw new RangeError(
      `${year} 年分には対応していません（対応している年分: ${supportedYears().join(", ")}）`,
    );
  }
  return entry.data;
}

/** 年分の税制データの出典一覧を返す。 */
export function getSources(year: number = DEFAULT_YEAR): readonly Source[] {
  getTaxYear(year);
  return years.get(year)?.sources ?? [];
}
