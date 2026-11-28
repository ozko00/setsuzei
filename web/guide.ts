/**
 * 社会保険料が分からない人のための「目安」。税額の計算には関わらない（計算コアは、ここで出た額を
 * 入力された社会保険料として受け取るだけ）。数値と出典は src/data/2026-insurance-guide.ts にある。
 */
import { insuranceGuide2026 as guide } from "../src/data/2026-insurance-guide.js";
import { webMessages, type Locale } from "./messages.js";

export interface InsuranceEstimate {
  /** employee = 給与から引かれる社会保険料、freelance = 国民年金 + 国民健康保険 */
  readonly kind: "employee" | "freelance";
  /** 仮に置く額（1,000 円未満切り捨て） */
  readonly amount: number;
  /** 幅の下と上（1,000 円単位） */
  readonly low: number;
  readonly high: number;
  /** 内訳 */
  readonly parts: readonly { readonly label: string; readonly amount: number }[];
  /** どう出したかの説明（画面にそのまま出す） */
  readonly basis: readonly string[];
}

const floorTo = (n: number, unit: number): number => Math.floor(n / unit) * unit;
const ceilTo = (n: number, unit: number): number => Math.ceil(n / unit) * unit;
const percent = (per100k: number): string => `${per100k / 1_000}%`;

type Municipality = (typeof guide.nationalHealthInsurance.municipalities)[number];

/** ある市区の料率で、1 人で加入している場合の国民健康保険料（年額）を計算する。 */
export function nationalHealthInsuranceOf(m: Municipality, totalIncome: number, withCare: boolean): number {
  const base = Math.max(0, totalIncome - guide.nationalHealthInsurance.basicDeduction);
  const part = (p: { rate: number; perPerson: number; perHousehold: number; cap: number }): number =>
    Math.min(p.cap, Math.floor((base * p.rate) / 100_000) + p.perPerson + p.perHousehold);
  return part(m.medical) + part(m.support) + part(m.child) + (withCare ? part(m.care) : 0);
}

/**
 * 社会保険料の目安。
 * @param kind 給与から引かれている（employee）か、国民年金と国民健康保険を自分で払っている（freelance）か
 * @param salary 給与収入（年額）
 * @param totalIncome 合計所得金額（国民健康保険料の所得割の計算に使う。去年も同じ所得だったと仮定する）
 * @param locale 説明の言語（額は言語で変わらない）
 */
export function estimateInsurance(kind: "employee" | "freelance", salary: number, totalIncome: number, locale: Locale = "ja"): InsuranceEstimate {
  const t = webMessages(locale);
  if (kind === "employee") {
    const e = guide.employee;
    const middle = e.pension + e.healthMiddle + e.child + e.employment;
    const low = e.pension + e.healthLow + e.child + e.employment;
    const high = e.pension + e.healthHigh + e.child + e.care + e.employment;
    const of = (rate: number): number => Math.floor((salary * rate) / 100_000);
    return {
      kind,
      amount: floorTo(of(middle), 1_000),
      low: floorTo(of(low), 1_000),
      high: ceilTo(of(high), 1_000),
      parts: [
        { label: t.partPension(percent(e.pension)), amount: of(e.pension) },
        { label: t.partHealth(percent(e.healthMiddle)), amount: of(e.healthMiddle) },
        { label: t.partChild(percent(e.child)), amount: of(e.child) },
        { label: t.partEmployment(percent(e.employment)), amount: of(e.employment) },
      ],
      basis: [
        t.basisEmployeeRate(percent(middle), percent(e.pension), percent(e.healthMiddle), percent(e.child), percent(e.employment)),
        t.basisEmployeeRange(percent(e.care), percent(low), percent(high)),
        t.basisEmployeeExact,
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
      { label: t.partNationalPension(guide.nationalPensionMonthly), amount: pension },
      { label: t.partNhi(nhiLow, nhiHigh), amount: nhi },
    ],
    basis: [
      t.basisPension(guide.nationalPensionMonthly),
      t.basisNhi(cities.map((m) => t.city(m.name)), nhi, nhiLow, nhiHigh),
      t.basisNhiCaveat,
      t.basisFreelanceExact,
    ],
  };
}
