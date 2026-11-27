import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  estimate,
  furusatoLimit,
  getTaxYear,
  calculate,
  incomeAdjustment,
  incomeTaxOnTaxableIncome,
  salaryIncome,
  type Scenario,
} from "../src/index.js";

const data = getTaxYear(2026);

const scenario = (overrides: Partial<Scenario> = {}): Scenario => ({
  salaryRevenue: 0,
  businessRevenue: 0,
  businessExpenses: 0,
  businessIncomeType: "business",
  blueDeduction: 0,
  socialInsurance: 0,
  mutualAid: 0,
  donation: 0,
  spouse: null,
  dependents: { general: 0, specific: 0, elderly: 0, elderlyCohabiting: 0, under16: 0 },
  otherDeductions: 0,
  otherDeductionsResident: 0,
  incomeAdjustmentEligible: false,
  ...overrides,
});

/** 事業所得だけで合計所得金額がちょうど income になるシナリオ */
const withIncome = (income: number, overrides: Partial<Scenario> = {}): Scenario =>
  scenario({ businessRevenue: income, ...overrides });

describe("所得税の税率（国税庁 No.2260）", () => {
  // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm
  it("具体例: 課税所得 700 万円 → 所得税 974,000 円、復興特別所得税 20,454 円", () => {
    const r = incomeTaxOnTaxableIncome(data, 7_000_000);
    assert.equal(r.baseTax, 974_000);
    assert.equal(r.reconstructionTax, 20_454);
    assert.equal(r.marginalRatePercent, 23);
  });

  it("速算表の区分の境界で税率が切り替わる", () => {
    // [課税所得, 税率, 所得税額] 税額 = 課税所得 × 税率 − 控除額
    const cases: [number, number, number][] = [
      [1_000, 5, 50],
      [1_949_000, 5, 97_450],
      [1_950_000, 10, 97_500],
      [3_299_000, 10, 232_400],
      [3_300_000, 20, 232_500],
      [6_949_000, 20, 962_300],
      [6_950_000, 23, 962_500],
      [8_999_000, 23, 1_433_770],
      [9_000_000, 33, 1_434_000],
      [17_999_000, 33, 4_403_670],
      [18_000_000, 40, 4_404_000],
      [39_999_000, 40, 13_203_600],
      [40_000_000, 45, 13_204_000],
    ];
    for (const [taxable, rate, tax] of cases) {
      const r = incomeTaxOnTaxableIncome(data, taxable);
      assert.equal(r.marginalRatePercent, rate, `課税所得 ${taxable} の税率`);
      assert.equal(r.baseTax, tax, `課税所得 ${taxable} の税額`);
    }
  });

  it("課税所得は 1,000 円未満を切り捨てる。0 以下なら税額 0", () => {
    assert.equal(incomeTaxOnTaxableIncome(data, 1_950_999).taxableIncome, 1_950_000);
    assert.equal(incomeTaxOnTaxableIncome(data, 999).total, 0);
    assert.equal(incomeTaxOnTaxableIncome(data, -500_000).total, 0);
  });
});

describe("掛金の全額所得控除による節税額一覧表（中小機構）", () => {
  // https://kyosai-web.smrj.go.jp/customer/skyosai/installment/index.html
  // 「課税される所得金額」から計算した表。所得税は復興特別所得税込み、住民税は 10% + 均等割等 5,000 円。
  // 税率は令和 6 年 10 月現在のものだが、速算表・復興特別所得税率・住民税率は令和 8 年分も同じ。
  const residentTax = (taxable: number): number =>
    (taxable * data.residentTax.ratePercent) / 100 + data.residentTax.perCapita + data.residentTax.forestTax;
  // [課税所得, 加入前の所得税, 加入前の住民税, 掛金月額 1 万 / 3 万 / 5 万 / 7 万円の節税額]
  const table: [number, number, number, [number, number, number, number]][] = [
    [2_000_000, 104_600, 205_000, [20_700, 56_900, 93_200, 129_400]],
    [4_000_000, 380_300, 405_000, [36_500, 109_500, 182_500, 241_300]],
    [6_000_000, 788_700, 605_000, [36_500, 109_500, 182_500, 255_600]],
    [8_000_000, 1_229_200, 805_000, [40_100, 120_500, 200_900, 281_200]],
    [10_000_000, 1_801_000, 1_005_000, [52_400, 157_300, 262_200, 367_000]],
  ];
  for (const [taxable, incomeTax, resident, savings] of table) {
    it(`課税所得 ${taxable / 10_000} 万円`, () => {
      assert.equal(incomeTaxOnTaxableIncome(data, taxable).total, incomeTax);
      assert.equal(residentTax(taxable), resident);
      const monthly = [10_000, 30_000, 50_000, 70_000];
      monthly.forEach((m, i) => {
        const after = taxable - m * 12;
        const saving =
          incomeTax - incomeTaxOnTaxableIncome(data, after).total + (resident - residentTax(after));
        assert.equal(saving, savings[i], `掛金月額 ${m} 円`);
      });
    });
  }
});

describe("給与所得（国税庁 No.1410、令和 8 年分）", () => {
  // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm
  it("収入 220 万円未満の区分（注2 の表）", () => {
    assert.equal(salaryIncome(data, 0), 0);
    assert.equal(salaryIncome(data, 740_999), 0);
    assert.equal(salaryIncome(data, 741_000), 1_000);
    assert.equal(salaryIncome(data, 2_190_999), 1_450_999);
    assert.equal(salaryIncome(data, 2_191_000), 1_451_000);
    assert.equal(salaryIncome(data, 2_192_999), 1_451_000);
    assert.equal(salaryIncome(data, 2_193_000), 1_453_000);
    assert.equal(salaryIncome(data, 2_196_000), 1_456_000);
    assert.equal(salaryIncome(data, 2_199_999), 1_456_000);
  });

  it("220 万円以上は 4,000 円単位に切り下げて計算する", () => {
    assert.equal(salaryIncome(data, 2_200_000), 1_460_000); // ×70% − 8 万
    assert.equal(salaryIncome(data, 3_599_999), 2_437_200); // 3,596,000 × 70% − 8 万
    assert.equal(salaryIncome(data, 3_600_000), 2_440_000); // ×80% − 44 万
    assert.equal(salaryIncome(data, 5_003_999), 3_560_000); // 5,000,000 × 80% − 44 万
    assert.equal(salaryIncome(data, 6_599_999), 4_836_800); // 6,596,000 × 80% − 44 万
  });

  it("660 万円以上", () => {
    assert.equal(salaryIncome(data, 6_600_000), 4_840_000); // ×90% − 110 万
    assert.equal(salaryIncome(data, 8_499_999), 6_549_999);
    assert.equal(salaryIncome(data, 8_500_000), 6_550_000); // 収入 − 195 万
    assert.equal(salaryIncome(data, 10_000_000), 8_050_000);
  });

  it("基礎控除の区分と給与収入の対応（国税庁「令和8年4月 源泉所得税の改正のあらまし」1(1)イの表）", () => {
    // https://www.nta.go.jp/publication/pamph/gensen/2026kaisei.pdf
    // 合計所得 132 万円 = 給与収入 206 万円、336 万円 = 475 万 1,999 円、
    // 489 万円 = 665 万 5,556 円、655 万円 = 850 万円、2,350 万円 = 2,545 万円
    assert.equal(salaryIncome(data, 2_060_000), 1_320_000);
    assert.ok(salaryIncome(data, 4_751_999) <= 3_360_000);
    assert.ok(salaryIncome(data, 4_752_000) > 3_360_000);
    assert.equal(salaryIncome(data, 6_655_556), 4_890_000);
    assert.ok(salaryIncome(data, 6_655_557) > 4_890_000);
    assert.equal(salaryIncome(data, 8_500_000), 6_550_000);
    assert.equal(salaryIncome(data, 25_450_000), 23_500_000);
  });

  it("年収の壁（江戸川区「令和9年度 税制改正の住民税における主な改正点」）", () => {
    // https://www.city.edogawa.tokyo.jp/e013/kurashi/zeikin/juminzei/r9kaisei.html
    // 給与収入 136 万円 = 合計所得 62 万円（扶養の所得要件）、178 万円 = 104 万円（所得税が発生する境目）
    assert.equal(salaryIncome(data, 1_360_000), 620_000);
    assert.equal(salaryIncome(data, 1_780_000), 1_040_000);
    assert.equal(estimate(data, scenario({ salaryRevenue: 1_780_000 })).incomeTax.total, 0);
    assert.equal(estimate(data, scenario({ salaryRevenue: 1_781_000 })).incomeTax.taxableIncome, 1_000);
    assert.ok(estimate(data, scenario({ salaryRevenue: 1_790_000 })).incomeTax.total > 0);
  });
});

describe("基礎控除（国税庁 No.1199、令和 8 年分）", () => {
  // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm
  it("所得税: 合計所得金額の区分ごとの控除額と逓減の境界", () => {
    const cases: [number, number][] = [
      [1_320_000, 1_040_000],
      [3_360_000, 1_040_000],
      [4_890_000, 1_040_000],
      [4_890_001, 670_000],
      [6_550_000, 670_000],
      [6_550_001, 620_000],
      [23_500_000, 620_000],
      [23_500_001, 480_000],
      [24_000_000, 480_000],
      [24_000_001, 320_000],
      [24_500_000, 320_000],
      [24_500_001, 160_000],
      [25_000_000, 160_000],
      [25_000_001, 0],
    ];
    for (const [income, expected] of cases) {
      assert.equal(estimate(data, withIncome(income)).incomeTax.deductions.basic, expected, `合計所得 ${income}`);
    }
  });

  it("住民税: 43 万円 / 29 万円 / 15 万円 / 0（地方税法 第314条の2第2項）", () => {
    const cases: [number, number][] = [
      [5_000_000, 430_000],
      [24_000_000, 430_000],
      [24_000_001, 290_000],
      [24_500_001, 150_000],
      [25_000_001, 0],
    ];
    for (const [income, expected] of cases) {
      assert.equal(estimate(data, withIncome(income)).residentTax.deductions.basic, expected, `合計所得 ${income}`);
    }
  });
});

describe("配偶者控除・配偶者特別控除", () => {
  const spouseDeduction = (income: number, spouseIncome: number, age70OrOlder = false) => {
    const e = estimate(data, withIncome(income, { spouse: { income: spouseIncome, age70OrOlder } }));
    return [e.incomeTax.deductions.spouse, e.residentTax.deductions.spouse];
  };

  it("配偶者控除（国税庁 No.1191 / 地方税法 第314条の2第1項第10号）", () => {
    assert.deepEqual(spouseDeduction(9_000_000, 0), [380_000, 330_000]);
    assert.deepEqual(spouseDeduction(9_000_001, 0), [260_000, 220_000]);
    assert.deepEqual(spouseDeduction(9_500_001, 0), [130_000, 110_000]);
    assert.deepEqual(spouseDeduction(10_000_001, 0), [0, 0]);
    // 所得要件 62 万円以下（所得税: No.1191、住民税: 地方税法 第292条第1項第7号 令和9年度分から）
    assert.deepEqual(spouseDeduction(5_000_000, 620_000), [380_000, 330_000]);
    assert.deepEqual(spouseDeduction(5_000_000, 0, true), [480_000, 380_000]);
    assert.deepEqual(spouseDeduction(9_200_000, 0, true), [320_000, 260_000]);
    assert.deepEqual(spouseDeduction(9_800_000, 0, true), [160_000, 130_000]);
  });

  it("配偶者特別控除（国税庁 No.1195 / 地方税法 第314条の2第1項第10号の2）", () => {
    // [配偶者の合計所得, 所得税, 住民税]（本人の合計所得 900 万円以下）
    const cases: [number, number, number][] = [
      [620_001, 380_000, 330_000],
      [950_000, 380_000, 330_000],
      [950_001, 360_000, 330_000],
      [1_000_000, 360_000, 330_000],
      [1_000_001, 310_000, 310_000],
      [1_050_000, 310_000, 310_000],
      [1_050_001, 260_000, 260_000],
      [1_100_001, 210_000, 210_000],
      [1_150_001, 160_000, 160_000],
      [1_200_001, 110_000, 110_000],
      [1_250_001, 60_000, 60_000],
      [1_300_000, 60_000, 60_000],
      [1_300_001, 30_000, 30_000],
      [1_330_000, 30_000, 30_000],
      [1_330_001, 0, 0],
    ];
    for (const [spouseIncome, it_, rt] of cases) {
      assert.deepEqual(spouseDeduction(5_000_000, spouseIncome), [it_, rt], `配偶者の所得 ${spouseIncome}`);
    }
  });

  it("本人の合計所得が 900 万円を超えると逓減する", () => {
    assert.deepEqual(spouseDeduction(9_200_000, 1_020_000), [210_000, 210_000]); // 31 万 × 2/3 → 21 万
    assert.deepEqual(spouseDeduction(9_800_000, 1_020_000), [110_000, 110_000]); // 31 万 × 1/3 → 11 万
    assert.deepEqual(spouseDeduction(9_200_000, 1_170_000), [110_000, 110_000]); // 16 万 × 2/3 → 11 万
    assert.deepEqual(spouseDeduction(9_800_000, 1_320_000), [10_000, 10_000]);
  });
});

describe("扶養控除（国税庁 No.1180 / 地方税法 第314条の2第1項第11号）", () => {
  it("区分ごとの控除額", () => {
    const e = estimate(
      data,
      withIncome(8_000_000, { dependents: { general: 1, specific: 1, elderly: 1, elderlyCohabiting: 1, under16: 0 } }),
    );
    assert.equal(e.incomeTax.deductions.dependents, 380_000 + 630_000 + 480_000 + 580_000);
    assert.equal(e.residentTax.deductions.dependents, 330_000 + 450_000 + 380_000 + 450_000);
  });
});

describe("住民税の調整控除（地方税法 第314条の6）", () => {
  it("合計課税所得 200 万円以下: 人的控除額の差と課税所得の小さい方 × 5%", () => {
    // 課税所得 157 万円、人的控除額の差 5 万円 → 2,500 円
    const e = estimate(data, withIncome(2_000_000));
    assert.equal(e.residentTax.taxableIncome, 1_570_000);
    assert.equal(e.residentTax.adjustmentCredit, 2_500);
    // 課税所得 3 万円 < 差 5 万円 → 3 万円 × 5% = 1,500 円
    const low = estimate(data, withIncome(460_000));
    assert.equal(low.residentTax.taxableIncome, 30_000);
    assert.equal(low.residentTax.adjustmentCredit, 1_500);
  });

  it("合計課税所得 200 万円超:（差 −（課税所得 − 200 万円））× 5%、最低 2,500 円", () => {
    // 合計所得 300 万円、配偶者控除（差 5 万）+ 特定扶養 1 人（差 18 万）→ 差の合計 28 万円
    // 課税所得 = 300 − 43 − 33 − 45 = 179 万円 → 200 万円以下 → min(28 万, 179 万) × 5% = 14,000 円
    const a = estimate(
      data,
      withIncome(3_000_000, { spouse: { income: 0 }, dependents: { general: 0, specific: 1, elderly: 0, elderlyCohabiting: 0, under16: 0 } }),
    );
    assert.equal(a.residentTax.taxableIncome, 1_790_000);
    assert.equal(a.residentTax.adjustmentCredit, 14_000);
    // 合計所得 340 万円 → 課税所得 219 万円 → (28 万 − 19 万) × 5% = 4,500 円
    const b = estimate(
      data,
      withIncome(3_400_000, { spouse: { income: 0 }, dependents: { general: 0, specific: 1, elderly: 0, elderlyCohabiting: 0, under16: 0 } }),
    );
    assert.equal(b.residentTax.taxableIncome, 2_190_000);
    assert.equal(b.residentTax.adjustmentCredit, 4_500);
    // 課税所得が十分大きければ最低額 5 万円 × 5% = 2,500 円
    assert.equal(estimate(data, withIncome(8_000_000)).residentTax.adjustmentCredit, 2_500);
  });

  it("合計所得金額 2,500 万円超は調整控除なし", () => {
    assert.equal(estimate(data, withIncome(25_000_000)).residentTax.adjustmentCredit, 2_500);
    assert.equal(estimate(data, withIncome(25_000_001)).residentTax.adjustmentCredit, 0);
  });
});

describe("所得税・住民税の通し計算（手計算との照合）", () => {
  it("フリーランス: 売上 800 万円、経費 150 万円、青色 65 万円、社会保険料 90 万円", () => {
    const e = estimate(
      data,
      scenario({ businessRevenue: 8_000_000, businessExpenses: 1_500_000, blueDeduction: 650_000, socialInsurance: 900_000 }),
    );
    // 事業所得 585 万円。所得税: 585 − 基礎 67 − 社保 90 = 428 万円 → 428 万 × 20% − 427,500 = 428,500 円
    assert.equal(e.totalIncome, 5_850_000);
    assert.equal(e.incomeTax.taxableIncome, 4_280_000);
    assert.equal(e.incomeTax.baseTax, 428_500);
    assert.equal(e.incomeTax.reconstructionTax, 8_998);
    assert.equal(e.incomeTax.total, 437_400); // 437,498 → 100 円未満切捨て
    // 住民税: 585 − 基礎 43 − 社保 90 = 452 万円 → 452,000 − 調整控除 2,500 = 449,500 円 + 5,000 円
    assert.equal(e.residentTax.taxableIncome, 4_520_000);
    assert.equal(e.residentTax.incomeLevy, 449_500);
    assert.equal(e.residentTax.total, 454_500);
  });

  it("副業: 給与 600 万円、雑所得 100 万円、社会保険料 88 万円、配偶者控除、扶養 1 人", () => {
    const e = estimate(
      data,
      scenario({
        salaryRevenue: 6_000_000,
        businessRevenue: 1_200_000,
        businessExpenses: 200_000,
        businessIncomeType: "misc",
        socialInsurance: 880_000,
        spouse: { income: 0 },
        dependents: { general: 1, specific: 0, elderly: 0, elderlyCohabiting: 0, under16: 0 },
      }),
    );
    // 給与所得 436 万円 + 雑所得 100 万円 = 536 万円
    assert.equal(e.salaryIncome, 4_360_000);
    assert.equal(e.totalIncome, 5_360_000);
    // 所得税: 536 − 基礎 67 − 配偶者 38 − 扶養 38 − 社保 88 = 305 万円 → 207,500 円
    assert.equal(e.incomeTax.taxableIncome, 3_050_000);
    assert.equal(e.incomeTax.baseTax, 207_500);
    assert.equal(e.incomeTax.total, 211_800); // 207,500 + 4,357 = 211,857
    // 住民税: 536 − 43 − 33 − 33 − 88 = 339 万円 → 339,000 − 2,500 + 5,000
    assert.equal(e.residentTax.taxableIncome, 3_390_000);
    assert.equal(e.residentTax.adjustmentCredit, 2_500);
    assert.equal(e.residentTax.total, 341_500);
  });

  it("雑所得の赤字は給与所得と通算しない。事業所得の赤字は通算する", () => {
    const base = { salaryRevenue: 5_000_000, businessRevenue: 500_000, businessExpenses: 1_500_000 };
    assert.equal(estimate(data, scenario({ ...base, businessIncomeType: "misc" })).totalIncome, 3_560_000);
    assert.equal(estimate(data, scenario({ ...base, businessIncomeType: "business" })).totalIncome, 2_560_000);
  });

  it("青色申告特別控除は事業所得の黒字が限度", () => {
    const e = estimate(data, scenario({ businessRevenue: 1_000_000, businessExpenses: 700_000, blueDeduction: 650_000 }));
    assert.equal(e.blueDeductionApplied, 300_000);
    assert.equal(e.businessIncome, 0);
    const loss = estimate(data, scenario({ businessRevenue: 100_000, businessExpenses: 300_000, blueDeduction: 650_000 }));
    assert.equal(loss.blueDeductionApplied, 0);
  });
});

describe("ふるさと納税（総務省 ふるさと納税ポータルサイト / 地方税法 第314条の7）", () => {
  // https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/furusato/mechanism/deduction.html
  const freelancer = scenario({
    businessRevenue: 8_000_000,
    businessExpenses: 1_500_000,
    blueDeduction: 650_000,
    socialInsurance: 900_000,
  });

  it("上限の目安 = 所得割額 × 20% ÷（90% − 所得税率 × 1.021）+ 2,000 円", () => {
    // 所得割額 449,500 円 × 20% = 89,900 円
    // 人的控除差調整額 = 5 万円 +（所得税の基礎控除 67 万円 − 48 万円）= 24 万円
    // 452 万円 − 24 万円 = 428 万円 → 所得税率 20% → 特例分の割合 69.58%
    // 89,900 ÷ 0.6958 = 129,203 円 → + 2,000 円 = 131,203 円 → 1,000 円未満切捨て
    assert.equal(furusatoLimit(data, freelancer), 131_000);
  });

  it("上限以内なら（寄附額 − 2,000 円）がほぼ全額控除される", () => {
    const none = estimate(data, freelancer);
    const donated = estimate(data, { ...freelancer, donation: 100_000 });
    // 所得税: 98,000 円の所得控除。住民税 基本分: 98,000 × 10% = 9,800 円、特例分: 98,000 × 69.58% = 68,188 円
    assert.equal(donated.incomeTax.deductions.donation, 98_000);
    assert.equal(donated.residentTax.donationCreditBasic, 9_800);
    assert.equal(donated.residentTax.donationCreditSpecial, 68_188);
    const relief = none.totalTax - donated.totalTax;
    assert.ok(Math.abs(100_000 - relief - 2_000) <= 200, `自己負担 ${100_000 - relief} 円`);
  });

  it("上限を超えた分は特例分が頭打ちになり自己負担が増える", () => {
    const none = estimate(data, freelancer);
    const over = estimate(data, { ...freelancer, donation: 300_000 });
    assert.equal(over.residentTax.donationCreditSpecial, 89_900); // 所得割額の 20%
    assert.ok(300_000 - (none.totalTax - over.totalTax) > 50_000);
  });

  it("特例分の割合は所得税率の区分で変わる（84.895% / 79.79% / 66.517% / 56.307%）", () => {
    // 寄附額 12,000 円（対象 10,000 円）での特例分を見る（20% の上限にはかからない額）
    const special = (income: number): number =>
      estimate(data, withIncome(income, { donation: 12_000 })).residentTax.donationCreditSpecial;
    // 合計所得 299 万円: 課税所得 256 万 −（5 万 + 56 万）= 195 万円 → 所得税率 5% → 84.895%
    assert.equal(special(2_990_000), 8_489);
    // 合計所得 300 万円: 257 万 − 61 万 = 196 万円 → 10% → 79.79%
    assert.equal(special(3_000_000), 7_979);
    // 合計所得 800 万円: 757 万 −（5 万 + 14 万）= 738 万円 → 23% → 66.517%
    assert.equal(special(8_000_000), 6_651);
    // 合計所得 1,000 万円: 957 万 − 19 万 = 938 万円 → 33% → 56.307%
    assert.equal(special(10_000_000), 5_630);
  });

  it("特例分の割合は地方税法 附則第5条の6 の読替え後の割合と一致する", () => {
    // 附則第5条の6: 85% → 84.895%、80% → 79.79%、70% → 69.58%、67% → 66.517%、
    // 57% → 56.307%、50% → 49.16%、45% → 44.055%
    const statutory = [84_895, 79_790, 69_580, 66_517, 56_307, 49_160, 44_055];
    const rule = data.residentTax.donation;
    const computed = rule.specialRateBrackets.map(
      (b) => (100 - rule.basicRatePercent) * 1_000 - b.value * (1_000 + data.incomeTax.reconstructionPermille),
    );
    assert.deepEqual(computed, statutory);
  });

  it("所得割額が 0 なら上限も 0", () => {
    assert.equal(furusatoLimit(data, withIncome(400_000)), 0);
  });

  it("手計算した別のケースの上限", () => {
    // 副業のケース: 所得割額 336,500 円 × 20% = 67,300 円、調整額 15 万 + 19 万 = 34 万円
    // 339 万 − 34 万 = 305 万円 → 10% → 79.79% → 84,346 + 2,000 = 86,346 → 86,000 円
    const side = scenario({
      salaryRevenue: 6_000_000,
      businessRevenue: 1_200_000,
      businessExpenses: 200_000,
      businessIncomeType: "misc",
      socialInsurance: 880_000,
      spouse: { income: 0 },
      dependents: { general: 1, specific: 0, elderly: 0, elderlyCohabiting: 0, under16: 0 },
    });
    assert.equal(furusatoLimit(data, side), 86_000);
    // 低所得のケース: 事業所得 240 万円、社保 40 万円 → 所得割額 154,500 円 × 20% = 30,900 円
    // 157 万 −（5 万 + 56 万）= 96 万円 → 5% → 84.895% → 36,397 + 2,000 = 38,397 → 38,000 円
    const low = scenario({ businessRevenue: 3_000_000, businessExpenses: 500_000, blueDeduction: 100_000, socialInsurance: 400_000 });
    assert.equal(furusatoLimit(data, low), 38_000);
  });
});

describe("所得金額調整控除（子ども・特別障害者等）", () => {
  // 国税庁 No.1411: {給与等の収入金額（1,000 万円超は 1,000 万円）− 850 万円} × 10%、1 円未満切上げ
  it("850 万円以下は 0、超えた分の 10%、1,000 万円で頭打ち（上限 15 万円）", () => {
    assert.equal(incomeAdjustment(data, 8_500_000), 0);
    assert.equal(incomeAdjustment(data, 8_500_001), 1); // 0.1 円 → 切上げ
    assert.equal(incomeAdjustment(data, 8_500_010), 1);
    assert.equal(incomeAdjustment(data, 8_500_011), 2); // 1.1 円 → 切上げ
    assert.equal(incomeAdjustment(data, 9_000_000), 50_000);
    assert.equal(incomeAdjustment(data, 10_000_000), 150_000);
    assert.equal(incomeAdjustment(data, 20_000_000), 150_000);
  });

  it("対象者だけ、給与所得・合計所得金額から引かれる（所得税・住民税の両方に効く）", () => {
    const off = estimate(data, scenario({ salaryRevenue: 9_000_000 }));
    const on = estimate(data, scenario({ salaryRevenue: 9_000_000, incomeAdjustmentEligible: true }));
    assert.equal(off.incomeAdjustment, 0);
    assert.equal(off.salaryIncome, 7_050_000); // 900 万 − 195 万
    assert.equal(on.incomeAdjustment, 50_000);
    assert.equal(on.salaryIncome, 7_000_000);
    assert.equal(on.totalIncome, 7_000_000);
    assert.equal(off.incomeTax.taxableIncome - on.incomeTax.taxableIncome, 50_000);
    assert.equal(off.residentTax.taxableIncome - on.residentTax.taxableIncome, 50_000);
  });

  it("対象者でも給与収入 850 万円以下なら変わらない。事業の売上は対象外", () => {
    const base = scenario({ salaryRevenue: 8_500_000, businessRevenue: 5_000_000 });
    assert.deepEqual(estimate(data, { ...base, incomeAdjustmentEligible: true }), estimate(data, base));
  });
});

describe("住民税の所得割の非課税限度額（地方税法 附則第3条の3）", () => {
  // https://laws.e-gov.go.jp/law/325AC0000000226/20270101_508AC0000000002
  // 総所得金額等が「35 万円 ×（同一生計配偶者 + 扶養親族の数 + 1）+ 10 万円
  // （同一生計配偶者か扶養親族がいれば + 32 万円）」以下なら、所得割を課さない。
  // 扶養親族は 16 歳未満の者と控除対象扶養親族。期待値は条文の式からの手計算。
  const family = (under16: number, spouseIncome: number | null = 0): Partial<Scenario> => ({
    spouse: spouseIncome === null ? null : { income: spouseIncome },
    dependents: { general: 0, specific: 0, elderly: 0, elderlyCohabiting: 0, under16 },
  });

  it("限度額: 独身 45 万円、配偶者と 16 歳未満の子 3 人で 217 万円", () => {
    const limit = (s: Partial<Scenario>): number => estimate(data, withIncome(3_000_000, s)).residentTax.incomeLevyExemptLimit;
    assert.equal(limit({}), 450_000); // 35 万 × 1 + 10 万
    assert.equal(limit(family(0)), 1_120_000); // 35 万 × 2 + 10 万 + 32 万
    assert.equal(limit(family(3)), 2_170_000); // 35 万 × 5 + 10 万 + 32 万
    assert.equal(limit(family(1, null)), 1_120_000); // 配偶者なし・子 1 人
    // 控除対象扶養親族も 1 人ずつ数える
    assert.equal(
      limit({ dependents: { general: 1, specific: 1, elderly: 1, elderlyCohabiting: 1, under16: 1 } }),
      350_000 * 6 + 100_000 + 320_000,
    );
    // 同一生計配偶者は合計所得金額 62 万円以下（第292条第1項第7号）。超えると人数に入らない
    assert.equal(limit(family(0, 620_000)), 1_120_000);
    assert.equal(limit(family(0, 620_001)), 450_000);
  });

  it("限度額以下なら所得割 0 円（均等割と森林環境税は残す）。ふるさと納税の上限も 0 円", () => {
    // 監査の指摘の例: 売上 215 万円・社会保険料 35 万円・配偶者（所得なし）・16 歳未満の子 3 人
    const s = withIncome(2_150_000, { socialInsurance: 350_000, ...family(3) });
    const e = estimate(data, s);
    assert.equal(e.residentTax.incomeLevyExempt, true);
    assert.equal(e.residentTax.incomeLevy, 0);
    assert.equal(e.residentTax.incomeLevyBeforeDonation, 0);
    assert.equal(e.residentTax.total, 5_000);
    assert.equal(furusatoLimit(data, s), 0);
    // 子を入力しなければ限度額は 112 万円で、所得割がかかる（修正前はこちらしか出せなかった）
    const without = estimate(data, withIncome(2_150_000, { socialInsurance: 350_000, ...family(0) }));
    assert.equal(without.residentTax.incomeLevyExempt, false);
    assert.equal(without.residentTax.total, 104_000);
    // 独身: 45 万円ちょうどは非課税
    const single = estimate(data, withIncome(450_000));
    assert.equal(single.residentTax.incomeLevyExempt, true);
    assert.equal(single.residentTax.total, 5_000);
    // 所得税には影響しない
    assert.equal(e.incomeTax.total, without.incomeTax.total);
  });

  it("限度額を少し超えるときは、税引後の所得が限度額を下回らないよう所得割を減額する（同条第2項・第5項）", () => {
    // 所得 220 万円（限度額 217 万円を 3 万円超える）:
    //   課税所得 2,200,000 − 430,000 − 330,000（配偶者控除）− 350,000 = 1,090,000 円 → 109,000 円
    //   調整控除（5 万 + 5 万）× 5% = 5,000 円 → 所得割 104,000 円
    //   2,200,000 − 104,000 = 2,096,000 円が限度額を 74,000 円下回るので、74,000 円を減額 → 30,000 円
    const s = withIncome(2_200_000, { socialInsurance: 350_000, ...family(3) });
    const e = estimate(data, s);
    assert.equal(e.residentTax.incomeLevyExempt, false);
    assert.equal(e.residentTax.incomeLevyBeforeDonation, 104_000);
    assert.equal(e.residentTax.exemptionReduction, 74_000);
    assert.equal(e.residentTax.incomeLevy, 30_000);
    // 寄附をしても、控除後の所得割が 30,000 円を下回るまで住民税は減らない。上限の目安は出さない
    assert.equal(estimate(data, { ...s, donation: 30_000 }).residentTax.incomeLevy, 30_000);
    assert.equal(furusatoLimit(data, s), 0);
    // 独身: 所得 450,500 円 → 課税所得 20,000 円、所得割 2,000 − 1,000 = 1,000 円 → 500 円に減額
    const single = estimate(data, withIncome(450_500));
    assert.equal(single.residentTax.incomeLevyBeforeDonation, 1_000);
    assert.equal(single.residentTax.incomeLevy, 500);
    // 十分に超えていれば減額なし
    assert.equal(estimate(data, withIncome(3_000_000, family(3))).residentTax.exemptionReduction, 0);
  });

  it("calculate: 16 歳未満の人数を受け取り、注意を出す。均等割は判定せず注意だけ", () => {
    const base = { businessRevenue: 2_150_000, socialInsurance: 350_000, spouse: { income: 0 } } as const;
    const r = calculate({ ...base, dependents: { under16: 3 } });
    assert.equal(r.baseline.residentTax.total, 5_000);
    assert.equal(r.measures.furusato.limit, 0);
    assert.ok(r.measures.furusato.notes[0]?.includes("所得割（所得に応じてかかる部分）がかからない見込み"));
    assert.ok(r.warnings.some((w) => w.includes("非課税限度額。2,170,000 円")));
    // 掛金で減るのは所得税の分だけ（課税所得 380,000 円 → 379,000 円の追加で 1,000 円未満になる）
    assert.equal(r.measures.kyosai.additional, 379_000);
    assert.deepEqual(r.measures.kyosai.saving, { incomeTax: 19_300, residentTax: 0, total: 19_300 });
    // 子を入力していないと所得割がかかる。入力を促す注意を出す
    const without = calculate(base);
    assert.equal(without.baseline.residentTax.total, 104_000);
    assert.ok(without.warnings.some((w) => w.includes("--dependents-under16")));
    // 均等割の非課税は級地で変わるので計算しない。最も高い基準（35 万 × 人数 + 10 万 + 21 万）以下なら注意を出す
    const low = calculate({ businessRevenue: 1_000_000, spouse: { income: 0 } });
    assert.equal(low.baseline.residentTax.perCapita, 5_000);
    assert.ok(low.warnings.some((w) => w.includes("もかからない可能性") && w.includes("1,010,000 円")));
    assert.ok(low.warnings.some((w) => w.includes("ひとり親") && w.includes("1,350,000 円")));
    assert.ok(!calculate({ businessRevenue: 8_000_000 }).warnings.some((w) => /均等割|ひとり親|16 歳未満/.test(w)));
  });

  it("16 歳未満の扶養親族がいれば、所得金額調整控除の対象として扱う", () => {
    const r = calculate({ salaryRevenue: 9_000_000, dependents: { under16: 1 } });
    assert.equal(r.input.incomeAdjustment, true);
    assert.equal(r.baseline.incomeAdjustment, 50_000);
    // 扶養控除は増えない
    assert.equal(r.baseline.incomeTax.deductions.dependents, 0);
    assert.equal(r.baseline.residentTax.deductions.dependents, 0);
  });
});
