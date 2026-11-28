/**
 * 医療費控除（通常とセルフメディケーション税制）、生命保険料控除、確定申告書の欄の対応（filing）。
 *
 * 期待値は、一次情報の式と表から手で計算したもの。
 * - 医療費控除: 国税庁 No.1120（10 万円か総所得金額等の 5% を引く。最高 200 万円）
 * - セルフメディケーション税制: 国税庁 No.1129（12,000 円を超える部分。最高 88,000 円）
 * - 生命保険料控除（所得税）: 国税庁 No.1140（令和 8 年分の 23 歳未満の扶養親族の特例を含む）
 * - 生命保険料控除（住民税）: 地方税法 第314条の2第1項第5号
 * - 欄の番号: 国税庁「令和８年分の所得税等の確定申告書（案）」第一表・第二表
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lifeInsuranceDeduction, lifeTier } from "../src/core/estimate.js";
import { FORM_2026 } from "../src/core/filing.js";
import { calculate, getSources, getTaxYear, type TaxInput } from "../src/index.js";

const data = getTaxYear(2026);
const it_ = data.lifeInsurance.incomeTax;
const rt = data.lifeInsurance.residentTax;

const FREELANCER: TaxInput = { businessRevenue: 8_000_000, businessExpenses: 1_500_000, blueReturn: "65", socialInsurance: 900_000 };

describe("医療費控除（国税庁 No.1120）", () => {
  it("10 万円を超えた分を引く（所得 585 万円、医療費 15 万円 → 控除 5 万円）。所得税・住民税の両方で同じ額", () => {
    const r = calculate({ ...FREELANCER, medicalExpenses: 150_000 });
    const med = r.deductionDetails.medical;
    assert.equal(med.method, "normal");
    assert.equal(med.normal.floor, 100_000);
    assert.equal(med.normal.deduction, 50_000);
    assert.equal(r.baseline.incomeTax.deductions.medical, 50_000);
    assert.equal(r.baseline.residentTax.deductions.medical, 50_000);
    // 控除がない場合より税が減る（所得税 20% 帯 × 5 万円 × 1.021 + 住民税 10% × 5 万円 の前後）
    const without = calculate(FREELANCER);
    assert.equal(med.saving.total, without.baseline.totalTax - r.baseline.totalTax);
    assert.ok(med.saving.incomeTax > 0 && med.saving.residentTax === 5_000);
  });

  it("総所得金額等が 200 万円未満なら、その 5% を引く（所得 140 万円 → 70,000 円。医療費 9 万円 − 補てん 1 万円 → 控除 1 万円）", () => {
    const r = calculate({ businessRevenue: 1_800_000, businessExpenses: 400_000, medicalExpenses: 90_000, medicalReimbursed: 10_000 });
    assert.equal(r.baseline.totalIncome, 1_400_000);
    assert.equal(r.deductionDetails.medical.normal.netExpenses, 80_000);
    assert.equal(r.deductionDetails.medical.normal.floor, 70_000);
    assert.equal(r.deductionDetails.medical.normal.deduction, 10_000);
  });

  it("最高 200 万円。補てんが医療費を超えても、控除はマイナスにならない", () => {
    assert.equal(calculate({ ...FREELANCER, medicalExpenses: 3_000_000 }).deductionDetails.medical.normal.deduction, 2_000_000);
    const over = calculate({ ...FREELANCER, medicalExpenses: 100_000, medicalReimbursed: 300_000 }).deductionDetails.medical;
    assert.equal(over.normal.netExpenses, 0);
    assert.equal(over.method, "none");
    assert.equal(over.saving.total, 0);
  });

  it("足切りに届かなければ控除なし（method: none）。入力がなければ applicable は false", () => {
    const r = calculate({ ...FREELANCER, medicalExpenses: 60_000 });
    assert.equal(r.deductionDetails.medical.applicable, true);
    assert.equal(r.deductionDetails.medical.method, "none");
    assert.equal(r.baseline.incomeTax.deductions.medical, 0);
    assert.equal(calculate(FREELANCER).deductionDetails.medical.applicable, false);
  });
});

describe("セルフメディケーション税制（国税庁 No.1129）と、通常の医療費控除との選択", () => {
  it("12,000 円を超える部分を控除。最高 88,000 円", () => {
    assert.equal(calculate({ ...FREELANCER, selfMedicationExpenses: 30_000 }).deductionDetails.medical.selfMedication.deduction, 18_000);
    assert.equal(calculate({ ...FREELANCER, selfMedicationExpenses: 12_000 }).deductionDetails.medical.selfMedication.deduction, 0);
    assert.equal(calculate({ ...FREELANCER, selfMedicationExpenses: 150_000 }).deductionDetails.medical.selfMedication.deduction, 88_000);
  });

  it("税額が少なくなるほうを使う。医療費 10.5 万円（控除 5,000 円）と対象の薬 3 万円（控除 18,000 円）なら、セルフメディケーション税制", () => {
    const r = calculate({ ...FREELANCER, medicalExpenses: 105_000, selfMedicationExpenses: 30_000 });
    const med = r.deductionDetails.medical;
    assert.equal(med.method, "selfMedication");
    assert.equal(r.baseline.incomeTax.deductions.medical, 18_000);
    assert.equal(med.advantage, med.normal.totalTax - med.selfMedication.totalTax);
    assert.ok(med.advantage > 0);
    assert.equal(med.selfMedication.totalTax, r.baseline.totalTax);
  });

  it("医療費が多ければ通常の医療費控除。併用はしない（控除は大きいほうの 1 つだけ）", () => {
    const r = calculate({ ...FREELANCER, medicalExpenses: 300_000, selfMedicationExpenses: 50_000 });
    assert.equal(r.deductionDetails.medical.method, "normal");
    assert.equal(r.baseline.incomeTax.deductions.medical, 200_000);
  });

  it("所得税がかからない人でも、控除額が大きいほうを申告書に書けるよう選ぶ（税額が同じなら控除額で比べる）", () => {
    // 所得 44 万円（住民税の所得割の非課税限度額 45 万円以下で、所得税も住民税の所得割も 0）
    const r = calculate({ businessRevenue: 440_000, medicalExpenses: 30_000, selfMedicationExpenses: 40_000 });
    const med = r.deductionDetails.medical;
    assert.equal(med.normal.totalTax, med.selfMedication.totalTax);
    // 足切り 22,000 円（5%）→ 通常 8,000 円、セルフメディケーション 28,000 円
    assert.equal(med.normal.floor, 22_000);
    assert.equal(med.normal.deduction, 8_000);
    assert.equal(med.method, "selfMedication");
  });
});

describe("生命保険料控除（国税庁 No.1140・地方税法 第314条の2）", () => {
  it("所得税の表（新契約・旧契約）。1 円未満は切り上げる", () => {
    const pairs: [number, number][] = [[20_000, 20_000], [20_001, 20_001], [40_000, 30_000], [40_001, 30_001], [80_000, 40_000], [200_000, 40_000]];
    for (const [paid, expected] of pairs) assert.equal(lifeTier(it_.newContract, paid), expected, `新 ${paid}`);
    const old: [number, number][] = [[25_000, 25_000], [50_000, 37_500], [50_001, 37_501], [100_000, 50_000], [150_000, 50_000]];
    for (const [paid, expected] of old) assert.equal(lifeTier(it_.oldContract, paid), expected, `旧 ${paid}`);
  });

  it("住民税の表（新契約 最高 28,000 円、旧契約 最高 35,000 円）", () => {
    const pairs: [number, number][] = [[12_000, 12_000], [32_000, 22_000], [56_000, 28_000], [100_000, 28_000]];
    for (const [paid, expected] of pairs) assert.equal(lifeTier(rt.newContract, paid), expected, `新 ${paid}`);
    const old: [number, number][] = [[15_000, 15_000], [40_000, 27_500], [70_000, 35_000], [90_000, 35_000]];
    for (const [paid, expected] of old) assert.equal(lifeTier(rt.oldContract, paid), expected, `旧 ${paid}`);
  });

  it("新旧の両方: 旧契約が 6 万円を超えるなら旧だけを申告するほうが大きい（新 8 万・旧 7 万 → 所得税 42,500 円、住民税 35,000 円）", () => {
    const r = lifeInsuranceDeduction(data, { lifeNew: 80_000, lifeOld: 70_000, medicalCare: 0, pensionNew: 0, pensionOld: 0 }, false);
    assert.equal(r.lifeOldOnly, true);
    assert.equal(r.incomeTax.life, 42_500);
    assert.equal(r.residentTax.life, 35_000);
  });

  it("新旧の両方: 合計が上限（所得税 4 万円・住民税 2.8 万円）で止まる（新 3 万・旧 3 万）", () => {
    const r = lifeInsuranceDeduction(data, { lifeNew: 30_000, lifeOld: 30_000, medicalCare: 0, pensionNew: 0, pensionOld: 0 }, false);
    assert.equal(r.lifeOldOnly, false);
    // 所得税: 新 25,000 + 旧 27,500 = 52,500 → 40,000。住民税: 新 21,000 + 旧 22,500 = 43,500 → 28,000
    assert.equal(r.incomeTax.life, 40_000);
    assert.equal(r.residentTax.life, 28_000);
  });

  it("3 区分の合計は所得税 12 万円・住民税 7 万円まで", () => {
    const r = lifeInsuranceDeduction(data, { lifeNew: 200_000, lifeOld: 0, medicalCare: 200_000, pensionNew: 200_000, pensionOld: 0 }, false);
    assert.deepEqual(r.incomeTax, { life: 40_000, medicalCare: 40_000, pension: 40_000, total: 120_000 });
    assert.deepEqual(r.residentTax, { life: 28_000, medicalCare: 28_000, pension: 28_000, total: 70_000 });
  });

  it("令和 8 年分: 23 歳未満の扶養親族がいれば、新生命保険料は最高 6 万円（所得税だけ。住民税は 2.8 万円のまま）", () => {
    const table: [number, number][] = [[30_000, 30_000], [60_000, 45_000], [120_000, 60_000], [200_000, 60_000]];
    for (const [paid, expected] of table) {
      const r = lifeInsuranceDeduction(data, { lifeNew: paid, lifeOld: 0, medicalCare: 0, pensionNew: 0, pensionOld: 0 }, true);
      assert.equal(r.incomeTax.life, expected, String(paid));
      assert.equal(r.under23Rule, true);
    }
    // 新旧の両方でも合計 6 万円まで（新 12 万 → 60,000 + 旧 7 万 → 42,500 → 60,000）
    const both = lifeInsuranceDeduction(data, { lifeNew: 120_000, lifeOld: 70_000, medicalCare: 0, pensionNew: 0, pensionOld: 0 }, true);
    assert.equal(both.incomeTax.life, 60_000);
    assert.equal(both.residentTax.life, 28_000);
    // 16 歳未満の子を入れると自動で特例。いなければ 4 万円
    const withChild = calculate({ ...FREELANCER, lifeInsuranceNew: 120_000, dependents: { under16: 1 } });
    assert.equal(withChild.baseline.incomeTax.deductions.lifeInsurance, 60_000);
    assert.equal(withChild.baseline.residentTax.deductions.lifeInsurance, 28_000);
    assert.equal(calculate({ ...FREELANCER, lifeInsuranceNew: 120_000 }).baseline.incomeTax.deductions.lifeInsurance, 40_000);
    assert.equal(calculate({ ...FREELANCER, lifeInsuranceNew: 120_000, dependentUnder23: true }).baseline.incomeTax.deductions.lifeInsurance, 60_000);
  });

  it("控除は税額とふるさと納税の上限に反映される（住民税の所得割が減るので上限は下がる）", () => {
    const base = calculate(FREELANCER);
    const r = calculate({ ...FREELANCER, lifeInsuranceNew: 100_000, medicalCareInsurance: 100_000 });
    assert.equal(r.baseline.residentTax.deductions.lifeInsurance, 56_000);
    assert.ok(r.baseline.totalTax < base.baseline.totalTax);
    assert.ok(r.measures.furusato.limit < base.measures.furusato.limit);
    assert.equal(r.deductionDetails.lifeInsurance.saving.total, base.baseline.totalTax - r.baseline.totalTax);
  });
});

describe("確定申告書のどの欄に書くか（令和８年分の確定申告書（案））", () => {
  const input: TaxInput = { ...FREELANCER, medicalExpenses: 150_000, lifeInsuranceNew: 80_000, furusatoPaid: 50_000, idecoPaid: 276_000 };
  const r = calculate(input);
  const at = (sheet: string, field: string): number | null | undefined => r.filing.entries.find((e) => e.sheet === sheet && e.field === field)?.amount;
  const tax = r.baseline.incomeTax;

  it("第一表: 収入・所得・控除・税額が、計算コアの値と同じ", () => {
    assert.equal(at("first", "㋐"), 8_000_000);
    assert.equal(at("first", "①"), 5_850_000);
    assert.equal(at("first", "⑫"), r.baseline.totalIncome);
    assert.equal(at("first", "⑬"), 900_000);
    assert.equal(at("first", "⑭"), 276_000);
    assert.equal(at("first", "⑮"), 40_000);
    assert.equal(at("first", "㉕"), tax.deductions.basic);
    assert.equal(at("first", "㉘"), 50_000);
    assert.equal(at("first", "㉙"), 48_000);
    assert.equal(at("first", "㉚"), tax.deductions.total);
    assert.equal((at("first", "㉖") ?? 0) + (at("first", "㉘") ?? 0) + (at("first", "㉙") ?? 0), at("first", "㉚"));
    assert.equal(at("first", "㉛"), tax.taxableIncome);
    assert.equal(at("first", "㉜"), tax.baseTax);
    assert.equal(at("first", "㊺"), tax.reconstructionTax);
    assert.equal(at("first", "㊻"), tax.baseTax + tax.reconstructionTax);
    assert.equal(at("first", "㊾"), null);
    // 源泉徴収税額がなければ、申告納税額は所得税 + 復興特別所得税（100 円未満切り捨て）
    assert.equal(at("first", "㊿"), tax.total);
  });

  it("第二表・住民税・青色申告決算書", () => {
    assert.equal(at("second", "⑬"), 900_000);
    assert.equal(r.filing.entries.find((e) => e.label.includes("新生命保険料"))?.amount, 80_000);
    assert.equal(at("second", "㉙"), 50_000);
    assert.equal(r.filing.entries.find((e) => e.sheet === "resident")?.amount, 50_000);
    assert.equal(r.filing.entries.find((e) => e.sheet === "blue")?.amount, 650_000);
  });

  it("セルフメディケーション税制を選んだときは、㉘の説明で「区分」に 1 と書くよう伝える", () => {
    const self = calculate({ ...FREELANCER, selfMedicationExpenses: 40_000 });
    const entry = self.filing.entries.find((e) => e.field === "㉘");
    assert.equal(entry?.amount, 28_000);
    assert.match(entry?.note ?? "", /「区分」の欄に 1/);
    assert.doesNotMatch(r.filing.entries.find((e) => e.field === "㉘")?.note ?? "", /に 1/);
  });

  it("旧契約だけを申告するほうが大きいときは、新契約の保険料を第二表に書かない", () => {
    const old = calculate({ ...FREELANCER, lifeInsuranceNew: 80_000, lifeInsuranceOld: 70_000 });
    assert.equal(old.filing.entries.some((e) => e.label.includes("新生命保険料")), false);
    assert.equal(old.filing.entries.find((e) => e.label.includes("旧生命保険料"))?.amount, 70_000);
  });

  it("会社員の副業（雑所得）: 給与・雑所得の欄と、住民税の徴収方法を出す", () => {
    const side = calculate({ salaryRevenue: 6_000_000, businessRevenue: 1_000_000, businessExpenses: 200_000, businessIncomeType: "misc", socialInsurance: 880_000 });
    const fields = side.filing.entries.filter((e) => e.sheet === "first").map((e) => e.field);
    for (const f of ["㋔", "㋖", "⑥", "⑧", "⑩", "⑫"]) assert.ok(fields.includes(f), f);
    assert.ok(!fields.includes("㋐") && !fields.includes("①"));
    assert.ok(side.filing.entries.some((e) => e.sheet === "resident" && e.amount === null));
  });

  it("様式は案であることと出典を持ち、出典は出典一覧にもある", () => {
    assert.equal(r.filing.draft, true);
    assert.equal(r.filing.sourceUrl, FORM_2026.sourceUrl);
    assert.ok(getSources().some((s) => s.url === FORM_2026.sourceUrl));
    assert.ok(r.filing.notes.some((n) => n.includes("案")));
  });
});
