/**
 * 社会保険料が分からない人のための「目安」。税額の計算には関わらない（計算コアは、ここで出た額を
 * 入力された社会保険料として受け取るだけ）。数値と出典は src/data/2026-insurance-guide.ts にある。
 */
import { insuranceGuide2026 as guide } from "../src/data/2026-insurance-guide.js";
const floorTo = (n, unit) => Math.floor(n / unit) * unit;
const ceilTo = (n, unit) => Math.ceil(n / unit) * unit;
const yen = (n) => `${n.toLocaleString("ja-JP")} 円`;
const percent = (per100k) => `${per100k / 1_000}%`;
/** ある市区の料率で、1 人で加入している場合の国民健康保険料（年額）を計算する。 */
export function nationalHealthInsuranceOf(m, totalIncome, withCare) {
    const base = Math.max(0, totalIncome - guide.nationalHealthInsurance.basicDeduction);
    const part = (p) => Math.min(p.cap, Math.floor((base * p.rate) / 100_000) + p.perPerson + p.perHousehold);
    return part(m.medical) + part(m.support) + part(m.child) + (withCare ? part(m.care) : 0);
}
/**
 * 社会保険料の目安。
 * @param kind 給与から引かれている（employee）か、国民年金と国民健康保険を自分で払っている（freelance）か
 * @param salary 給与収入（年額）
 * @param totalIncome 合計所得金額（国民健康保険料の所得割の計算に使う。去年も同じ所得だったと仮定する）
 */
export function estimateInsurance(kind, salary, totalIncome) {
    if (kind === "employee") {
        const e = guide.employee;
        const middle = e.pension + e.healthMiddle + e.child + e.employment;
        const low = e.pension + e.healthLow + e.child + e.employment;
        const high = e.pension + e.healthHigh + e.child + e.care + e.employment;
        const of = (rate) => Math.floor((salary * rate) / 100_000);
        return {
            kind,
            amount: floorTo(of(middle), 1_000),
            low: floorTo(of(low), 1_000),
            high: ceilTo(of(high), 1_000),
            parts: [
                { label: `厚生年金（${percent(e.pension)}）`, amount: of(e.pension) },
                { label: `健康保険（協会けんぽの中央の県の料率で ${percent(e.healthMiddle)}）`, amount: of(e.healthMiddle) },
                { label: `子ども・子育て支援金（${percent(e.child)}）`, amount: of(e.child) },
                { label: `雇用保険（${percent(e.employment)}）`, amount: of(e.employment) },
            ],
            basis: [
                `給与の年収に、本人が負担する料率の合計 ${percent(middle)}を掛けた額です（厚生年金 ${percent(e.pension)}、協会けんぽの健康保険 ${percent(e.healthMiddle)}、子ども・子育て支援金 ${percent(e.child)}、雇用保険 ${percent(e.employment)}。令和8年度）。`,
                `健康保険の料率は都道府県で違い、40〜64 歳は介護保険（${percent(e.care)}）が加わるので、幅は年収の ${percent(low)}〜${percent(high)}です。健康保険組合・共済組合は料率が別です。年収がおおむね 800 万円を超える方や賞与が多い方は、保険料に上限があるため、実際はこれより少なくなります。`,
                "正確な額は、源泉徴収票の「社会保険料等の金額」か、給与明細の健康保険・厚生年金・雇用保険の合計（12 か月分と賞与分）です。",
            ],
        };
    }
    const pension = guide.nationalPensionMonthly * 12;
    const cities = guide.nationalHealthInsurance.municipalities;
    const without = cities.map((m) => nationalHealthInsuranceOf(m, totalIncome, false));
    const withCare = cities.map((m) => nationalHealthInsuranceOf(m, totalIncome, true));
    const average = Math.floor(without.reduce((sum, n) => sum + n, 0) / without.length);
    const nhi = floorTo(average, 1_000);
    const nhiLow = floorTo(Math.min(...without), 1_000);
    const nhiHigh = ceilTo(Math.max(...withCare), 1_000);
    return {
        kind,
        amount: floorTo(pension + nhi, 1_000),
        low: floorTo(pension + nhiLow, 1_000),
        high: ceilTo(pension + nhiHigh, 1_000),
        parts: [
            { label: "国民年金（1 人分。月 17,920 円 × 12 か月）", amount: pension },
            { label: `国民健康保険（目安。${yen(nhiLow)}〜${yen(nhiHigh)}）`, amount: nhi },
        ],
        basis: [
            `国民年金は定額で、1 人分が月 ${yen(guide.nationalPensionMonthly)}（令和8年度）です。免除や猶予を受けている方、家族の分も払っている方は額が変わります。`,
            `国民健康保険は自治体ごとに料率が違います。ここでは ${cities.map((m) => m.name).join("・")}の令和8年度の料率で、1 人で加入・40 歳未満・去年もことしと同じ所得として計算し、3 つの平均（${yen(nhi)}）を置いています。3 つの幅は、40〜64 歳の介護分を含めて ${yen(nhiLow)}〜${yen(nhiHigh)}です。`,
            "家族も加入している場合、お住まいの自治体、去年の所得によって、実際の額はこの幅の外になることもあります。所得が少ない世帯の軽減は入れていません。",
            "正確な額は、自治体から届く国民健康保険の納付通知書と、国民年金の納付書・控除証明書の、ことし 1〜12 月に払う分の合計です。",
        ],
    };
}
