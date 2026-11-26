import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculate, furusatoLimit, getTaxYear, type Scenario, type TaxYearData } from "../src/index.js";

/**
 * 総務省「ふるさと納税制度とは」の
 * 【全額控除されるふるさと納税額（年間上限の目安）】の表との突き合わせ。
 * https://www.soumu.go.jp/main_content/000816463.pdf （2022 年 4 月作成の資料）
 *
 *   給与収入    独身      夫婦＋子1人  夫婦＋子2人
 *   500万円     6.1万円   4.0万円      2.8万円
 *   750万円     11.8万円  8.7万円      7.6万円
 *   1,000万円   18.0万円  15.7万円     14.4万円
 *   2,000万円   56.9万円  55.2万円     53.6万円
 *
 * 表は当時の税制（所得税の基礎控除 48 万円）で作られているので、基礎控除だけ当時の額に戻した
 * データで計算エンジンを動かして比べる。給与所得控除（収入 220 万円以上）、住民税の控除額、
 * 調整控除、寄附金税額控除の式は当時と同じ。
 *
 * 資料には計算の前提が書かれていないため、次の前提を置いた:
 *   - 社会保険料は給与収入の 15%（どの行も同じ。行ごとに合わせ込まない）
 *   - 「夫婦」は配偶者に所得がなく配偶者控除を受ける
 *   - 「子1人」は高校生（一般の扶養親族）、「子2人」は大学生（特定扶養親族）と高校生
 */
const data = getTaxYear(2026);
const tableEra: TaxYearData = {
  ...data,
  incomeTax: {
    ...data.incomeTax,
    // 令和 2 年分〜令和 6 年分の基礎控除（国税庁 No.1199 の「令和6年分以前」の列）
    basicDeduction: [
      { upTo: 24_000_000, value: 480_000 },
      { upTo: 24_500_000, value: 320_000 },
      { upTo: 25_000_000, value: 160_000 },
      { upTo: null, value: 0 },
    ],
  },
};

type Family = "single" | "coupleChild1" | "coupleChild2";

function scenario(salary: number, family: Family, socialInsurance: number, incomeAdjustmentEligible = family !== "single"): Scenario {
  return {
    salaryRevenue: salary,
    businessRevenue: 0,
    businessExpenses: 0,
    businessIncomeType: "business",
    blueDeduction: 0,
    socialInsurance,
    mutualAid: 0,
    donation: 0,
    spouse: family === "single" ? null : { income: 0 },
    dependents: {
      general: family === "single" ? 0 : 1,
      specific: family === "coupleChild2" ? 1 : 0,
      elderly: 0,
      elderlyCohabiting: 0,
      under16: 0,
    },
    otherDeductions: 0,
    otherDeductionsResident: 0,
    // 子（23 歳未満の扶養親族）がいれば所得金額調整控除の対象（給与収入 850 万円超のときだけ効く）
    incomeAdjustmentEligible,
  };
}

describe("総務省の年間上限の目安の表との突き合わせ（表と同じ当時の基礎控除で計算）", () => {
  // 給与収入 500 万円・750 万円の 6 マス: 社会保険料 15% の前提で、千円単位まで一致する
  const rows: [number, Record<Family, number>][] = [
    [5_000_000, { single: 61_000, coupleChild1: 40_000, coupleChild2: 28_000 }],
    [7_500_000, { single: 118_000, coupleChild1: 87_000, coupleChild2: 76_000 }],
  ];
  for (const [salary, expected] of rows) {
    for (const family of ["single", "coupleChild1", "coupleChild2"] as const) {
      it(`給与収入 ${salary / 10_000} 万円・${family}: ${expected[family] / 10_000} 万円`, () => {
        assert.equal(furusatoLimit(tableEra, scenario(salary, family, salary * 0.15)), expected[family]);
      });
    }
  }
});

/**
 * 給与収入 1,000 万円・2,000 万円の行。
 *
 * 表の社会保険料の前提は資料に書かれていない。ここでは 500 万・750 万円の行と同じ「給与収入の 15%」の
 * ままで計算し、前提を表に合わせて動かすことはしない。残る差はそのまま期待値として固定する。
 *
 *                      公表値     所得金額調整控除なし   あり（実装後）
 *   1,000万 独身       18.0万円   17.7万円（−3,000）     17.7万円（−3,000）
 *   1,000万 夫婦+子1   15.7万円   15.8万円（+1,000）     15.3万円（−4,000）
 *   1,000万 夫婦+子2   14.4万円   14.5万円（+1,000）     14.0万円（−4,000）
 *   2,000万 独身       56.9万円   52.0万円（−49,000）    52.0万円（−49,000）
 *   2,000万 夫婦+子1   55.2万円   50.8万円（−44,000）    50.3万円（−49,000）
 *   2,000万 夫婦+子2   53.6万円   49.2万円（−44,000）    48.7万円（−49,000）
 *
 * 所得金額調整控除を入れても、公表値との差そのものは小さくならない（子ありのマスはむしろ 5,000 円下がる）。
 * 変わるのは差の出方で、独身と子ありで食い違っていた差が行ごとにほぼ同じ額にそろう。
 * つまり「独身との差」（家族構成による上限の下がり方）は表と合うようになり、
 * 残る差は家族構成によらない要因（社会保険料の前提とみられるが、資料からは確認できない）に絞られる。
 */
describe("総務省の目安の表: 給与収入 1,000 万・2,000 万円の行（社会保険料 15% のまま、前提は合わせ込まない）", () => {
  const families = ["single", "coupleChild1", "coupleChild2"] as const;
  const highRows: {
    salary: number;
    published: Record<Family, number>;
    /** 所得金額調整控除を入れない場合の「計算値 − 公表値」 */
    gapWithout: Record<Family, number>;
    /** 入れた場合（実装後）の「計算値 − 公表値」 */
    gapWith: Record<Family, number>;
  }[] = [
    {
      salary: 10_000_000,
      published: { single: 180_000, coupleChild1: 157_000, coupleChild2: 144_000 },
      gapWithout: { single: -3_000, coupleChild1: 1_000, coupleChild2: 1_000 },
      gapWith: { single: -3_000, coupleChild1: -4_000, coupleChild2: -4_000 },
    },
    {
      salary: 20_000_000,
      published: { single: 569_000, coupleChild1: 552_000, coupleChild2: 536_000 },
      gapWithout: { single: -49_000, coupleChild1: -44_000, coupleChild2: -44_000 },
      gapWith: { single: -49_000, coupleChild1: -49_000, coupleChild2: -49_000 },
    },
  ];

  for (const row of highRows) {
    const man = row.salary / 10_000;
    const limit = (family: Family, eligible: boolean): number =>
      furusatoLimit(tableEra, scenario(row.salary, family, row.salary * 0.15, eligible));

    it(`給与収入 ${man} 万円: 公表値との差（実装後）は 3 マスとも固定した値どおり`, () => {
      for (const family of families) {
        assert.equal(limit(family, family !== "single") - row.published[family], row.gapWith[family], family);
      }
    });

    it(`給与収入 ${man} 万円: 所得金額調整控除がないと、独身と子ありで差の出方が食い違う`, () => {
      for (const family of families) {
        assert.equal(limit(family, false) - row.published[family], row.gapWithout[family], family);
      }
    });

    it(`給与収入 ${man} 万円: 「独身との差」は実装後に表と 1,000 円以内で合う（実装前は 4,000〜5,000 円ずれる）`, () => {
      for (const family of ["coupleChild1", "coupleChild2"] as const) {
        const publishedDrop = row.published.single - row.published[family];
        const withDrop = limit("single", false) - limit(family, true);
        const withoutDrop = limit("single", false) - limit(family, false);
        assert.ok(Math.abs(withDrop - publishedDrop) <= 1_000, `${family}: ${withDrop} vs ${publishedDrop}`);
        const before = Math.abs(withoutDrop - publishedDrop);
        assert.ok(before >= 4_000 && before <= 5_000, `${family}: ${withoutDrop} vs ${publishedDrop}`);
      }
    });
  }

  it("給与収入 850 万円以下の行では所得金額調整控除は効かない（500 万・750 万円の 6 マスは対象にしても同じ）", () => {
    for (const salary of [5_000_000, 7_500_000]) {
      for (const family of families) {
        assert.equal(
          furusatoLimit(tableEra, scenario(salary, family, salary * 0.15, true)),
          furusatoLimit(tableEra, scenario(salary, family, salary * 0.15, false)),
        );
      }
    }
  });
});

describe("令和 8 年分では、同じ前提でも上限が表と変わる場合がある", () => {
  it("給与収入 500 万円・独身: 6.1 万円 → 5.7 万円（基礎控除の引上げで所得税率が 10% → 5% になるため）", () => {
    // 令和 8 年分: 所得税の課税所得 = 356 万 − 基礎控除 104 万 − 社保 75 万 = 177 万円 → 税率 5%
    // 特例分の割合が 79.79% → 84.895% に上がり、同じ所得割額 × 20% に達する寄附額が小さくなる。
    // （減るのは上限の目安で、所得税は基礎控除の分だけ下がっている）
    const r = calculate({ salaryRevenue: 5_000_000, socialInsurance: 750_000 });
    assert.equal(r.baseline.incomeTax.marginalRatePercent, 5);
    assert.equal(r.measures.furusato.limit, 57_000);
    assert.equal(furusatoLimit(tableEra, scenario(5_000_000, "single", 750_000)), 61_000);
  });

  it("所得税率の区分が変わらない場合は表と同じ（給与収入 750 万円の 3 マス）", () => {
    for (const [family, expected] of [["single", 118_000], ["coupleChild1", 87_000], ["coupleChild2", 76_000]] as const) {
      assert.equal(furusatoLimit(data, scenario(7_500_000, family, 1_125_000)), expected);
    }
  });
});
