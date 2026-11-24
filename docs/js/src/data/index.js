import { sources2026, taxYear2026 } from "./2026.js";
const years = new Map([
    [2026, { data: taxYear2026, sources: sources2026 }],
]);
/** 既定の年分 */
export const DEFAULT_YEAR = 2026;
/** 対応している年分（西暦）の一覧 */
export function supportedYears() {
    return [...years.keys()].sort((a, b) => a - b);
}
/** 年分の税制データを返す。未対応の年分は例外。 */
export function getTaxYear(year = DEFAULT_YEAR) {
    const entry = years.get(year);
    if (!entry) {
        throw new RangeError(`${year} 年分には対応していません（対応している年分: ${supportedYears().join(", ")}）`);
    }
    return entry.data;
}
/** 年分の税制データの出典一覧を返す。 */
export function getSources(year = DEFAULT_YEAR) {
    getTaxYear(year);
    return years.get(year)?.sources ?? [];
}
