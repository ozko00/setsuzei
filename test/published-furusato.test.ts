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
 *   - 社会保険料は給与収入の 15%
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

function scenario(salary: number, family: Family, socialInsurance: number, incomeAdjustment = 0): Scenario {
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
    },
    // 所得金額調整控除は未実装なので、突き合わせでは同額を所得控除として入れて代用する
    otherDeductions: incomeAdjustment,
    otherDeductionsResident: incomeAdjustment,
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

  // 給与収入 1,000 万円・2,000 万円の行は、社会保険料 15% では一致しない（独身で 17.7 万円 / 52.0 万円）。
  // 表は高収入で社会保険料を 15% より低く置いているとみられ、独身の値から逆算すると
  // 1,000 万円で 137〜140 万円、2,000 万円で 161〜163 万円になる。
  // その社会保険料と、子がいる場合の所得金額調整控除（15 万円。未実装）を入れると、
  // 残りの「夫婦＋子」の 4 マスも一致する。前提を逆算しているので、独立した検証は子ありの 4 マスだけ。
  const highRows: [number, number, Record<Family, number>][] = [
    [10_000_000, 1_390_000, { single: 180_000, coupleChild1: 157_000, coupleChild2: 144_000 }],
    [20_000_000, 1_620_000, { single: 569_000, coupleChild1: 552_000, coupleChild2: 536_000 }],
  ];
  for (const [salary, socialInsurance, expected] of highRows) {
    it(`給与収入 ${salary / 10_000} 万円: 社会保険料を逆算し、所得金額調整控除を代用すると 3 マスとも一致`, () => {
      assert.equal(furusatoLimit(tableEra, scenario(salary, "single", socialInsurance)), expected.single);
      for (const family of ["coupleChild1", "coupleChild2"] as const) {
        assert.equal(furusatoLimit(tableEra, scenario(salary, family, socialInsurance, 150_000)), expected[family]);
        // 所得金額調整控除を入れないと 4,000〜6,000 円高く出る（未実装による既知のずれ）
        const without = furusatoLimit(tableEra, scenario(salary, family, socialInsurance));
        assert.ok(without > expected[family] && without - expected[family] <= 6_000, `${family}: ${without}`);
      }
    });
  }
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
