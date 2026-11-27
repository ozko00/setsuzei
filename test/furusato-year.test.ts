import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { furusatoComparison2025 } from "../src/data/2025-furusato.js";
import { compareFurusatoLimit, getTaxYear, InputError, salaryIncome } from "../src/index.js";

/**
 * ふるさと納税の上限の、令和 7 年分と令和 8 年分の比較。
 *
 * 期待値は計算エンジンの出力を写したものではなく、条文と国税庁の表から手で計算した値:
 *   - 上限 = 特例分の上限（所得割額 × 20%）÷ 特例分の割合 + 2,000 円（地方税法 第314条の7第1項・第11項）
 *   - 特例分の割合は「住民税の課税総所得金額 − 人的控除差調整額」で決まる（同項第1号の表、附則第5条の6）
 *       0 円未満 90% / 195 万円以下 84.895% / 330 万円以下 79.79% / 695 万円以下 69.58% / …
 *   - 人的控除差調整額 = 第314条の6第1号イの金額（基礎控除の分は 5 万円）+（所得税の基礎控除額 − 48 万円）
 *     （令和8年法律第2号による改正後の第314条の7第11項第1号。令和 8 年度分＝令和 7 年中の寄附から適用）
 *   - 所得税の基礎控除（国税庁 No.1199）: 令和 7 年分 95 万 / 88 万 / 68 万 / 63 万 / 58 万円、
 *     令和 8 年分 104 万 / 67 万 / 62 万円
 *   - 調整控除（第314条の6）: 課税所得 200 万円以下は min(人的控除差, 課税所得) × 5%、
 *     200 万円超は {人的控除差 −（課税所得 − 200 万円）} × 5%（最低 2,500 円）
 */
describe("ふるさと納税の上限: 令和7年分と令和8年分（条文から手計算した値）", () => {
  it("給与収入 500 万円・独身・社会保険料 75 万円: 61,000 円 → 57,000 円（割合の区分が 10% → 5% に下がる）", () => {
    const r = compareFurusatoLimit({ salaryRevenue: 5_000_000, socialInsurance: 750_000 });
    // 給与所得 = 500 万 −（500 万 × 20% + 44 万）= 356 万円（どちらの年分も同じ）
    // 住民税の課税総所得 = 356 万 − 75 万 − 43 万 = 238 万円
    // 所得割額 = 238 万 × 10% − 調整控除 2,500 円 = 235,500 円。特例分の上限 = 47,100 円
    for (const side of [r.previous, r.current]) {
      assert.equal(side.salaryIncome, 3_560_000);
      assert.equal(side.residentTaxableIncome, 2_380_000);
      assert.equal(side.incomeLevy, 235_500);
      assert.equal(side.specialCap, 47_100);
    }
    // 令和 7 年分: 合計所得 356 万円 → 基礎控除 68 万円。調整額 = 5 万 +（68 万 − 48 万）= 25 万円
    //   238 万 − 25 万 = 213 万円（195 万円超）→ 79.79%。47,100 ÷ 0.7979 = 59,029 → + 2,000 = 61,029 → 61,000 円
    assert.equal(r.previous.incomeTaxBasicDeduction, 680_000);
    assert.equal(r.previous.adjustmentAmount, 250_000);
    assert.equal(r.previous.rateBase, 2_130_000);
    assert.equal(r.previous.specialRatePer100k, 79_790);
    assert.equal(r.previous.limit, 61_000);
    // 令和 8 年分: 基礎控除 104 万円。調整額 = 5 万 +（104 万 − 48 万）= 61 万円
    //   238 万 − 61 万 = 177 万円（195 万円以下）→ 84.895%。47,100 ÷ 0.84895 = 55,480 → + 2,000 = 57,480 → 57,000 円
    assert.equal(r.current.incomeTaxBasicDeduction, 1_040_000);
    assert.equal(r.current.adjustmentAmount, 610_000);
    assert.equal(r.current.rateBase, 1_770_000);
    assert.equal(r.current.specialRatePer100k, 84_895);
    assert.equal(r.current.limit, 57_000);
    assert.equal(r.difference, -4_000);
    assert.deepEqual(r.reasons, ["specialRate"]);
    assert.deepEqual([r.previous.label, r.previous.residentTaxLabel], ["令和7年分", "令和8年度"]);
    assert.deepEqual([r.current.label, r.current.residentTaxLabel], ["令和8年分", "令和9年度"]);
  });

  it("給与収入 600 万円・独身・社会保険料 90 万円: どちらも 77,000 円（区分が変わらない）", () => {
    const r = compareFurusatoLimit({ salaryRevenue: 6_000_000, socialInsurance: 900_000 });
    // 給与所得 = 600 万 −（600 万 × 20% + 44 万）= 436 万円。課税総所得 = 436 万 − 90 万 − 43 万 = 303 万円
    // 所得割額 = 303,000 − 2,500 = 300,500 円。特例分の上限 = 60,100 円
    // 令和 7 年分: 303 万 − 25 万 = 278 万円、令和 8 年分: 303 万 − 61 万 = 242 万円。どちらも 195 万円超 330 万円以下 → 79.79%
    // 60,100 ÷ 0.7979 = 75,322 → + 2,000 = 77,322 → 77,000 円
    assert.equal(r.previous.rateBase, 2_780_000);
    assert.equal(r.current.rateBase, 2_420_000);
    assert.equal(r.previous.specialRatePer100k, 79_790);
    assert.equal(r.current.specialRatePer100k, 79_790);
    assert.deepEqual([r.previous.limit, r.current.limit, r.difference], [77_000, 77_000, 0]);
    assert.deepEqual(r.reasons, []);
  });

  it("給与収入 200 万円・独身・社会保険料 30 万円: 15,000 円 → 13,000 円（給与所得控除の最低額 65 万 → 74 万円）", () => {
    const r = compareFurusatoLimit({ salaryRevenue: 2_000_000, socialInsurance: 300_000 });
    // 令和 7 年分: 給与所得 = 200 万 × 70% − 8 万 = 132 万円。課税総所得 = 132 万 − 30 万 − 43 万 = 59 万円
    //   所得割額 = 59,000 − 2,500 = 56,500 円。特例分の上限 = 11,300 円
    //   基礎控除 95 万円（合計所得 132 万円以下）。調整額 = 5 万 + 47 万 = 52 万円。59 万 − 52 万 = 7 万円 → 84.895%
    //   11,300 ÷ 0.84895 = 13,310 → + 2,000 = 15,310 → 15,000 円
    assert.equal(r.previous.salaryIncome, 1_320_000);
    assert.equal(r.previous.incomeLevy, 56_500);
    assert.equal(r.previous.incomeTaxBasicDeduction, 950_000);
    assert.equal(r.previous.rateBase, 70_000);
    assert.equal(r.previous.specialRatePer100k, 84_895);
    assert.equal(r.previous.limit, 15_000);
    // 令和 8 年分: 給与所得 = 200 万 − 74 万 = 126 万円。課税総所得 = 126 万 − 30 万 − 43 万 = 53 万円
    //   所得割額 = 53,000 − 2,500 = 50,500 円。特例分の上限 = 10,100 円
    //   調整額 = 61 万円。53 万 − 61 万 = −8 万円（0 円未満）→ 90%（第314条の7第11項第2号）
    //   10,100 ÷ 0.9 = 11,222 → + 2,000 = 13,222 → 13,000 円
    assert.equal(r.current.salaryIncome, 1_260_000);
    assert.equal(r.current.incomeLevy, 50_500);
    assert.equal(r.current.rateBase, -80_000);
    assert.equal(r.current.specialRatePer100k, 90_000);
    assert.equal(r.current.limit, 13_000);
    assert.deepEqual(r.reasons, ["specialRate", "incomeLevy"]);
  });

  it("フリーランス・売上 − 経費 545 万円・青色 65 万円・社会保険料 81 万 7,500 円: 103,000 円 → 90,000 円", () => {
    const r = compareFurusatoLimit({ businessRevenue: 5_450_000, blueReturn: "65", socialInsurance: 817_500 });
    // 事業所得 = 545 万 − 65 万 = 480 万円。課税総所得 = 480 万 − 81.75 万 − 43 万 = 355.25 万 → 355 万 2,000 円（千円未満切捨て）
    // 調整控除: {5 万 −（355.2 万 − 200 万）} × 5% は 2,500 円未満なので 2,500 円。所得割額 = 355,200 − 2,500 = 352,700 円
    // 特例分の上限 = 70,540 円
    for (const side of [r.previous, r.current]) {
      assert.equal(side.residentTaxableIncome, 3_552_000);
      assert.equal(side.incomeLevy, 352_700);
      assert.equal(side.specialCap, 70_540);
    }
    // 令和 7 年分: 基礎控除 68 万円（合計所得 480 万円）。355.2 万 − 25 万 = 330.2 万円（330 万円超）→ 69.58%
    //   70,540 ÷ 0.6958 = 101,379 → + 2,000 = 103,379 → 103,000 円
    assert.equal(r.previous.rateBase, 3_302_000);
    assert.equal(r.previous.specialRatePer100k, 69_580);
    assert.equal(r.previous.limit, 103_000);
    // 令和 8 年分: 355.2 万 − 61 万 = 294.2 万円（330 万円以下）→ 79.79%
    //   70,540 ÷ 0.7979 = 88,407 → + 2,000 = 90,407 → 90,000 円
    assert.equal(r.current.rateBase, 2_942_000);
    assert.equal(r.current.specialRatePer100k, 79_790);
    assert.equal(r.current.limit, 90_000);
  });

  it("所得割が非課税の見込みなら、どちらの年分も目安を出さない", () => {
    const r = compareFurusatoLimit({ salaryRevenue: 1_000_000 });
    assert.deepEqual([r.previous.limit, r.current.limit, r.previous.exempt, r.current.exempt], [0, 0, true, true]);
    assert.ok(r.notes.some((n) => n.includes("非課税")));
  });
});

describe("ふるさと納税の上限の比較: 令和7年分のデータと入力の制限", () => {
  it("令和7年分の所得税の基礎控除は、国税庁 No.1199 の「令和7年分」の列と同じ", () => {
    assert.deepEqual(furusatoComparison2025.incomeTax.basicDeduction, [
      { upTo: 1_320_000, value: 950_000 },
      { upTo: 3_360_000, value: 880_000 },
      { upTo: 4_890_000, value: 680_000 },
      { upTo: 6_550_000, value: 630_000 },
      { upTo: 23_500_000, value: 580_000 },
      { upTo: 24_000_000, value: 480_000 },
      { upTo: 24_500_000, value: 320_000 },
      { upTo: 25_000_000, value: 160_000 },
      { upTo: null, value: 0 },
    ]);
  });

  it("令和7年分の給与所得は、所得税法 別表第五（令和7年分）と同じ", () => {
    const d = furusatoComparison2025;
    assert.equal(salaryIncome(d, 650_999), 0);
    assert.equal(salaryIncome(d, 651_000), 1_000);
    assert.equal(salaryIncome(d, 1_899_999), 1_249_999);
    assert.equal(salaryIncome(d, 1_900_000), 1_250_000);
    // 別表第五: 2,060,000 円以上 2,064,000 円未満 → 1,362,000 円、2,280,000 円以上 2,284,000 円未満 → 1,516,000 円
    assert.equal(salaryIncome(d, 2_060_000), 1_362_000);
    assert.equal(salaryIncome(d, 2_063_999), 1_362_000);
    assert.equal(salaryIncome(d, 2_280_000), 1_516_000);
    // 220 万円以上は令和 8 年分と同じ
    for (const revenue of [2_200_000, 3_599_999, 3_600_000, 5_000_000, 6_600_000, 8_500_000, 12_000_000]) {
      assert.equal(salaryIncome(d, revenue), salaryIncome(getTaxYear(2026), revenue), String(revenue));
    }
  });

  it("差し替えたのは給与所得と所得税の基礎控除だけ（住民税側のデータは令和8年分と同じもの）", () => {
    const now = getTaxYear(2026);
    assert.equal(furusatoComparison2025.residentTax, now.residentTax);
    assert.equal(furusatoComparison2025.incomeTax.brackets, now.incomeTax.brackets);
    assert.equal(furusatoComparison2025.salary.bands, now.salary.bands);
    // 年分としては対応していない
    assert.throws(() => getTaxYear(2025), RangeError);
  });

  it("配偶者に所得がある入力は受け付けない（配偶者の所得要件が年分で違い、差し替えていないため）", () => {
    assert.throws(
      () => compareFurusatoLimit({ salaryRevenue: 5_000_000, spouse: { income: 600_000 } }),
      (error: unknown) => error instanceof InputError && /spouse\.income: 令和7年分との比較は/.test(error.issues[0] ?? ""),
    );
    assert.equal(compareFurusatoLimit({ salaryRevenue: 5_000_000, spouse: { income: 0 } }).current.limit > 0, true);
    // ほかの入力の誤りは calculate と同じ指摘になる
    assert.throws(() => compareFurusatoLimit({ salaryRevenue: -1 }), InputError);
  });

  it("同じ入力で、令和8年分の上限が令和7年分より上がることはない（収入・家族・掛金を変えて確かめる）", () => {
    let lower = 0;
    let same = 0;
    for (let amount = 1_000_000; amount <= 30_000_000; amount += 70_000) {
      for (const extra of [
        {},
        { spouse: { income: 0 } },
        { dependents: { general: 1, specific: 1 } },
        { idecoPaid: 276_000, kyosaiPaid: 840_000 },
        { otherDeductions: 120_000, dependents: { under16: 2 } },
      ]) {
        for (const base of [
          { salaryRevenue: amount, socialInsurance: Math.floor(amount * 0.15) },
          { businessRevenue: amount, blueReturn: "65" as const, socialInsurance: Math.floor(amount * 0.12) },
          { salaryRevenue: amount, businessRevenue: 1_200_000, businessExpenses: 200_000, businessIncomeType: "misc" as const, socialInsurance: Math.floor(amount * 0.15) },
        ]) {
          const r = compareFurusatoLimit({ ...base, ...extra });
          assert.ok(r.difference <= 0, `${JSON.stringify({ ...base, ...extra })}: ${r.previous.limit} → ${r.current.limit}`);
          if (r.difference < 0) lower++;
          else same++;
        }
      }
    }
    // 下がるのは一部で、変わらない入力のほうがずっと多い
    assert.ok(lower > 0 && same > lower * 5, `下がる ${lower} / 変わらない ${same}`);
  });
});
