import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculate, InputError, validateInput } from "../src/index.js";

const freelancer = {
  businessRevenue: 8_000_000,
  businessExpenses: 1_500_000,
  blueReturn: "65",
  socialInsurance: 900_000,
} as const;

describe("calculate: 節税策ごとの軽減額", () => {
  it("iDeCo: 残り枠（月額 68,000 円 × 12）まで拠出した場合", () => {
    const r = calculate(freelancer);
    const ideco = r.measures.ideco;
    assert.equal(ideco.annualLimit, 816_000);
    assert.equal(ideco.additional, 816_000);
    // 課税所得 428 万 → 346.4 万円（税率 20% のまま）: 所得税 816,000 × 20% × 1.021 ≒ 166,600 円
    // 住民税 816,000 × 10% = 81,600 円
    assert.deepEqual(ideco.saving, { incomeTax: 166_600, residentTax: 81_600, total: 248_200 });
  });

  it("iDeCo: 拠出済みの分は残り枠から引き、追加額の指定が枠を超えたら枠で止める", () => {
    const r = calculate({ ...freelancer, idecoPaid: 600_000, idecoAdditional: 500_000 });
    assert.equal(r.measures.ideco.remaining, 216_000);
    assert.equal(r.measures.ideco.additional, 216_000);
    assert.ok(r.measures.ideco.notes.some((n) => n.includes("残り枠を超える")));
  });

  it("iDeCo: 給与がある人は企業年金なしの会社員（月額 23,000 円）を既定にし、上限は指定で上書きできる", () => {
    assert.equal(calculate({ salaryRevenue: 6_000_000 }).measures.ideco.annualLimit, 276_000);
    assert.equal(calculate({ salaryRevenue: 6_000_000, idecoAnnualLimit: 240_000 }).measures.ideco.annualLimit, 240_000);
  });

  it("小規模企業共済: 月額 70,000 円 × 12 が上限。給与所得者・雑所得は対象外", () => {
    const r = calculate(freelancer);
    assert.equal(r.measures.kyosai.annualLimit, 840_000);
    // 所得税 840,000 × 20% × 1.021 ≒ 171,500 円、住民税 84,000 円
    assert.deepEqual(r.measures.kyosai.saving, { incomeTax: 171_500, residentTax: 84_000, total: 255_500 });
    assert.equal(calculate({ ...freelancer, salaryRevenue: 3_000_000 }).measures.kyosai.applicable, false);
    assert.equal(
      calculate({ businessRevenue: 3_000_000, businessIncomeType: "misc" }).measures.kyosai.applicable,
      false,
    );
  });

  it("ふるさと納税: 上限・残り・自己負担", () => {
    const r = calculate({ ...freelancer, furusatoPaid: 30_000 });
    const f = r.measures.furusato;
    assert.equal(f.limit, 131_000);
    assert.equal(f.remaining, 101_000);
    assert.ok(Math.abs(f.outOfPocket - 2_000) <= 200, `自己負担 ${f.outOfPocket} 円`);
    // 追加の 101,000 円はほぼ全額が税から引かれる
    assert.ok(Math.abs(f.saving.total - 101_000) <= 200);
    // iDeCo・共済を満額追加すると所得割額が減り、上限も下がる
    assert.ok(f.limitAfterOtherMeasures < f.limit);
  });

  it("ふるさと納税: 寄附済みが上限を超えていたら残り 0・追加の軽減 0", () => {
    const f = calculate({ ...freelancer, furusatoPaid: 200_000 }).measures.furusato;
    assert.equal(f.remaining, 0);
    assert.equal(f.saving.total, 0);
    assert.ok(f.outOfPocket > 2_000);
  });

  it("全部やった場合: まとめて再計算した軽減額（単純な足し算ではない）", () => {
    const r = calculate({ ...freelancer, idecoPaid: 276_000, furusatoPaid: 30_000 });
    const { combined, furusato, ideco, kyosai } = r.measures;
    // 掛金 540,000 + 840,000 円を追加すると、ふるさと納税の上限は 123,000 → 73,000 円に下がる
    assert.equal(furusato.limit, 123_000);
    assert.equal(furusato.limitAfterOtherMeasures, 73_000);
    assert.equal(combined.idecoAdditional, 540_000);
    assert.equal(combined.kyosaiAdditional, 840_000);
    assert.equal(combined.furusatoAdditional, 43_000);
    assert.equal(combined.totalPayment, 1_423_000);
    // 所得税: 課税所得 5,850,000 − 670,000 − 900,000 − 276,000 − 1,380,000 − 71,000 = 2,553,000 円
    //   → 2,553,000 × 10% − 97,500 = 157,800 円、復興特別所得税 3,313 円 → 161,100 円（現状 375,400 円）
    assert.equal(combined.saving.incomeTax, 375_400 - 161_100);
    // 住民税: 課税所得 5,850,000 − 430,000 − 900,000 − 276,000 − 1,380,000 = 2,864,000 円
    //   → 286,400 − 調整控除 2,500 = 283,900 円。寄附 73,000 円の控除: 基本分 7,100 円、
    //   特例分 71,000 × 79.79% = 56,650 円（上限 283,900 × 20% = 56,780 円以内）
    //   → 283,900 − 63,750 = 220,150 → 220,100 円 + 5,000 円 = 225,100 円（現状 404,600 円）
    assert.equal(combined.saving.residentTax, 404_600 - 225_100);
    assert.equal(combined.saving.total, 393_800);
    assert.equal(combined.totalTax, r.baseline.totalTax - combined.saving.total);
    // 各策を単独で実行した場合の軽減額の合計（93,000 + 164,300 + 241,700 = 499,000 円）より小さい
    const naive = furusato.saving.total + ideco.saving.total + kyosai.saving.total;
    assert.equal(naive, 499_000);
    assert.ok(combined.saving.total < naive);
  });

  it("全部やった場合: 税額がなければ軽減額 0。策が 1 つだけならその策の軽減額と一致", () => {
    assert.equal(calculate({}).measures.combined.saving.total, 0);
    // 掛金の追加を 0 にすると、ふるさと納税だけを上限まで行う場合と同じ
    const r = calculate({ ...freelancer, idecoAdditional: 0, kyosaiAdditional: 0 });
    assert.deepEqual(r.measures.combined.saving, r.measures.furusato.saving);
    assert.equal(r.measures.combined.furusatoAdditional, r.measures.furusato.remaining);
  });

  it("青色申告特別控除: 10 万 / 55 万 / 65 万の差", () => {
    const r = calculate({ ...freelancer, blueReturn: "10" });
    const byLevel = Object.fromEntries(r.measures.blueReturn.options.map((o) => [o.level, o]));
    assert.equal(byLevel["10"]?.current, true);
    assert.equal(byLevel["10"]?.savingVsCurrent.total, 0);
    // 10 万 → 65 万: 所得が 55 万円減る。所得税 55 万 × 20% × 1.021 ≒ 112,400 円、住民税 55,000 円
    assert.deepEqual(byLevel["65"]?.savingVsCurrent, { incomeTax: 112_400, residentTax: 55_000, total: 167_400 });
    // 白色にすると増税（マイナスの軽減額）
    assert.ok((byLevel["none"]?.savingVsCurrent.total ?? 0) < 0);
    // 65 万は 55 万より 10 万円多く引ける
    assert.equal((byLevel["65"]?.totalTax ?? 0) < (byLevel["55"]?.totalTax ?? 0), true);
  });

  it("青色申告特別控除: 雑所得・事業収入なしでは計算しない", () => {
    assert.equal(calculate({ salaryRevenue: 5_000_000 }).measures.blueReturn.applicable, false);
    assert.equal(
      calculate({ businessRevenue: 1_000_000, businessIncomeType: "misc" }).measures.blueReturn.applicable,
      false,
    );
  });

  it("軽減額は現状の税額を超えない。所得 0 でも壊れない", () => {
    const r = calculate({});
    assert.equal(r.baseline.totalTax, 5_000); // 均等割 + 森林環境税のみ（非課税判定はしない）
    assert.equal(r.measures.furusato.limit, 0);
    assert.equal(r.measures.ideco.saving.total, 0);
    assert.ok(r.warnings.length > 0);
    const small = calculate({ businessRevenue: 1_500_000 });
    for (const s of [small.measures.ideco.saving, small.measures.kyosai.saving, small.measures.furusato.saving]) {
      assert.ok(s.total >= 0 && s.total <= small.baseline.totalTax);
    }
  });

  it("結果に免責と年分を含む", () => {
    const r = calculate(freelancer);
    assert.equal(r.year, 2026);
    assert.equal(r.label, "令和8年分");
    assert.equal(r.residentTaxLabel, "令和9年度");
    assert.match(r.disclaimer, /概算/);
    assert.match(r.disclaimer, /税理士や税務署/);
  });
});

describe("calculate: 国民健康保険料（所得割）への影響の目安", () => {
  // 所得割の算定基礎 = 総所得金額等 − 住民税の基礎控除 43 万円
  // 出典: 地方税法 第703条の4第6項、国民健康保険法施行令 第29条の7第2項第4号
  it("料率を入れなければ出さない", () => {
    assert.equal(calculate(freelancer).measures.nationalHealthInsurance, null);
  });

  it("所得割額と、青色申告の区分による差", () => {
    const nhi = calculate({ ...freelancer, blueReturn: "55", nhiIncomeRatePercent: 11.5 }).measures.nationalHealthInsurance;
    assert.ok(nhi);
    // 事業所得 800 万 − 150 万 − 55 万 = 595 万円 → 算定基礎 552 万円 × 11.5% = 634,800 円
    assert.equal(nhi.baseIncome, 5_520_000);
    assert.equal(nhi.incomeLevy, 634_800);
    const byLevel = Object.fromEntries(nhi.blueReturnOptions.map((o) => [o.level, o]));
    // 65 万円にすると所得が 10 万円減る → 10 万 × 11.5% = 11,500 円減
    assert.equal(byLevel["65"]?.reductionVsCurrent, 11_500);
    assert.equal(byLevel["55"]?.current, true);
    assert.equal(byLevel["55"]?.reductionVsCurrent, 0);
    // 白色にすると所得が 55 万円増える → 63,250 円増
    assert.equal(byLevel["none"]?.reductionVsCurrent, -63_250);
    assert.equal(byLevel["none"]?.incomeLevy, 698_050);
  });

  it("iDeCo・小規模企業共済・ふるさと納税の額は算定基礎に影響しない", () => {
    const a = calculate({ ...freelancer, nhiIncomeRatePercent: 10.123 }).measures.nationalHealthInsurance;
    const b = calculate({
      ...freelancer,
      nhiIncomeRatePercent: 10.123,
      idecoPaid: 816_000,
      kyosaiPaid: 840_000,
      furusatoPaid: 100_000,
      socialInsurance: 0,
      otherDeductions: 500_000,
    }).measures.nationalHealthInsurance;
    assert.ok(a && b);
    assert.equal(a.incomeLevy, b.incomeLevy);
    // 585 万 − 43 万 = 542 万円 × 10.123% = 548,666.6 → 548,666 円
    assert.equal(a.incomeLevy, 548_666);
  });

  it("所得が基礎控除以下なら 0。青色申告の対象外なら区分の比較は出さない", () => {
    const low = calculate({ businessRevenue: 400_000, nhiIncomeRatePercent: 11.5 }).measures.nationalHealthInsurance;
    assert.equal(low?.incomeLevy, 0);
    const salaried = calculate({ salaryRevenue: 5_000_000, nhiIncomeRatePercent: 11.5 }).measures.nationalHealthInsurance;
    assert.deepEqual(salaried?.blueReturnOptions, []);
    assert.ok(salaried?.notes.some((n) => n.includes("勤務先の健康保険")));
  });

  it("料率は 0 より大きく 100 以下・小数第 3 位まで", () => {
    for (const rate of [0, -1, 100.5, 11.2345, "11.5"]) {
      assert.throws(() => calculate({ nhiIncomeRatePercent: rate } as never), InputError, String(rate));
    }
    assert.ok(calculate({ nhiIncomeRatePercent: 0.001 }).measures.nationalHealthInsurance);
  });
});

describe("validateInput", () => {
  const issuesOf = (raw: unknown): readonly string[] => {
    try {
      validateInput(raw);
    } catch (error) {
      assert.ok(error instanceof InputError);
      return error.issues;
    }
    return [];
  };

  it("正しい入力はそのまま通す", () => {
    const input = { salaryRevenue: 1, spouse: { income: 0, age70OrOlder: true }, dependents: { general: 2 }, blueReturn: "55" };
    assert.deepEqual(validateInput(input), input);
    assert.deepEqual(validateInput({ blueReturn: 65 }), { blueReturn: "65" });
  });

  it("負数・小数・文字列・知らないキーを弾き、問題をまとめて返す", () => {
    const issues = issuesOf({ salaryRevenue: -1, businessRevenue: 1.5, socialInsurance: "90万", salary: 100 });
    assert.equal(issues.length, 4);
  });

  it("未対応の年分・不正な区分・雑所得と青色の併用を弾く", () => {
    assert.equal(issuesOf({ year: 2025 }).length, 1);
    assert.equal(issuesOf({ blueReturn: "30" }).length, 1);
    assert.equal(issuesOf({ businessIncomeType: "misc", blueReturn: "65" }).length, 1);
    assert.equal(issuesOf({ spouse: {} }).length, 1);
    assert.equal(issuesOf({ dependents: { child: 1 } }).length, 1);
    assert.equal(issuesOf([]).length, 1);
  });

  it("calculate は検証を通すので JSON をそのまま渡せる", () => {
    assert.throws(() => calculate({ salaryRevenue: -5 } as never), InputError);
  });
});

describe("所得金額調整控除の入力", () => {
  it("incomeAdjustment: true で適用。特定扶養親族（19〜22 歳）がいれば指定なしでも適用", () => {
    const plain = calculate({ salaryRevenue: 10_000_000 });
    assert.equal(plain.input.incomeAdjustment, false);
    assert.equal(plain.baseline.incomeAdjustment, 0);

    const flagged = calculate({ salaryRevenue: 10_000_000, incomeAdjustment: true });
    assert.equal(flagged.baseline.incomeAdjustment, 150_000);
    assert.equal(flagged.baseline.totalIncome, plain.baseline.totalIncome - 150_000);

    const student = calculate({ salaryRevenue: 10_000_000, dependents: { specific: 1 } });
    assert.equal(student.input.incomeAdjustment, true);
    assert.equal(student.baseline.incomeAdjustment, 150_000);

    // 一般の扶養親族（16〜18 歳か 23〜69 歳か区別できない）だけでは自動では適用しない
    assert.equal(calculate({ salaryRevenue: 10_000_000, dependents: { general: 1 } }).baseline.incomeAdjustment, 0);
  });

  it("注意は、適用していないときだけ出す（適用済みなのに「含めていません」と出さない）", () => {
    const mentions = (input: Parameters<typeof calculate>[0]): boolean =>
      calculate(input).warnings.some((w) => w.includes("所得金額調整控除"));
    assert.equal(mentions({ salaryRevenue: 10_000_000 }), true);
    assert.equal(mentions({ salaryRevenue: 10_000_000, dependents: { general: 1 } }), true);
    assert.equal(mentions({ salaryRevenue: 10_000_000, incomeAdjustment: true }), false);
    assert.equal(mentions({ salaryRevenue: 10_000_000, dependents: { specific: 1 } }), false);
    // 850 万円以下は対象外なので出さない
    assert.equal(mentions({ salaryRevenue: 8_500_000 }), false);
    assert.equal(mentions({ salaryRevenue: 8_500_001 }), true);
  });

  it("真偽値以外は入力エラー", () => {
    assert.throws(() => calculate({ incomeAdjustment: "yes" } as never), /incomeAdjustment/);
  });
});
