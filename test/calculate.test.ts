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

  it("まとめて実行した場合: 既定では iDeCo の追加を含めず、まとめて再計算する", () => {
    const r = calculate({ ...freelancer, idecoPaid: 276_000, furusatoPaid: 30_000 });
    const { combined, furusato, ideco, kyosai } = r.measures;
    // 小規模企業共済 840,000 円を追加すると、ふるさと納税の上限は 123,000 → 86,000 円に下がる
    //   住民税の課税所得 5,850,000 − 430,000 − 900,000 − 276,000 − 840,000 = 3,404,000 円
    //   → 340,400 − 調整控除 2,500 = 337,900 円。特例分の上限 337,900 × 20% = 67,580 円
    //   → 67,580 ÷ 79.79% = 84,697 円 + 2,000 円 = 86,697 → 86,000 円
    assert.equal(furusato.limit, 123_000);
    assert.equal(furusato.limitAfterOtherMeasures, 86_000);
    assert.equal(combined.includesIdeco, false);
    assert.equal(combined.idecoAdditional, 0);
    assert.equal(combined.kyosaiAdditional, 840_000);
    assert.equal(combined.furusatoAdditional, 56_000);
    assert.equal(combined.totalPayment, 896_000);
    // 所得税: 課税所得 3,976,000 − 840,000 − 56,000 = 3,080,000 円
    //   → 3,080,000 × 10% − 97,500 = 210,500 円、復興特別所得税 4,420 円 → 214,900 円（現状 375,400 円）
    assert.equal(combined.saving.incomeTax, 375_400 - 214_900);
    // 住民税: 所得割 337,900 円。寄附 86,000 円の控除: 基本分 8,400 円、
    //   特例分 84,000 × 79.79% = 67,023 円（上限 67,580 円以内）
    //   → 337,900 − 75,423 = 262,477 → 262,400 円 + 5,000 円 = 267,400 円（現状 404,600 円）
    assert.equal(combined.saving.residentTax, 404_600 - 267_400);
    assert.equal(combined.saving.total, 297_700);
    assert.equal(combined.totalTax, r.baseline.totalTax - combined.saving.total);
    // 内訳: 掛金による分は共済を単独で追加した場合と同じ。残りがふるさと納税による分（寄附 56,000 円とほぼ同額）
    assert.deepEqual(combined.savingFromContributions, kyosai.saving);
    assert.equal(combined.savingFromContributions.total, 241_700);
    assert.equal(combined.savingFromFurusato.total, 56_000);
    assert.equal(combined.savingFromContributions.total + combined.savingFromFurusato.total, combined.saving.total);
    // 各策を単独で実行した場合の軽減額の合計（93,000 + 241,700 = 334,700 円）より小さい
    assert.equal(furusato.saving.total + kyosai.saving.total, 334_700);
    assert.ok(combined.notes.some((n) => n.includes("iDeCo の追加は、この合計に含めていません")));
    assert.equal(ideco.additional, 540_000);
  });

  it("まとめて実行した場合: iDeCo も間に合う場合の合計を別に出す", () => {
    const r = calculate({ ...freelancer, idecoPaid: 276_000, furusatoPaid: 30_000 });
    const all = r.measures.combinedWithIdeco;
    assert.ok(all);
    // 掛金 540,000 + 840,000 円を追加すると、ふるさと納税の上限は 123,000 → 73,000 円に下がる
    assert.equal(all.includesIdeco, true);
    assert.equal(all.idecoAdditional, 540_000);
    assert.equal(all.kyosaiAdditional, 840_000);
    assert.equal(all.furusatoAdditional, 43_000);
    assert.equal(all.totalPayment, 1_423_000);
    // 所得税: 課税所得 5,850,000 − 670,000 − 900,000 − 276,000 − 1,380,000 − 71,000 = 2,553,000 円
    //   → 2,553,000 × 10% − 97,500 = 157,800 円、復興特別所得税 3,313 円 → 161,100 円（現状 375,400 円）
    assert.equal(all.saving.incomeTax, 375_400 - 161_100);
    // 住民税: 課税所得 5,850,000 − 430,000 − 900,000 − 276,000 − 1,380,000 = 2,864,000 円
    //   → 286,400 − 調整控除 2,500 = 283,900 円。寄附 73,000 円の控除: 基本分 7,100 円、
    //   特例分 71,000 × 79.79% = 56,650 円（上限 283,900 × 20% = 56,780 円以内）
    //   → 283,900 − 63,750 = 220,150 → 220,100 円 + 5,000 円 = 225,100 円（現状 404,600 円）
    assert.equal(all.saving.residentTax, 404_600 - 225_100);
    assert.equal(all.saving.total, 393_800);
    assert.ok(all.notes[0]?.includes("年内に間に合う場合"));
  });

  it("まとめて実行した場合: iDeCo の追加額を指定したときは合計に含める", () => {
    const r = calculate({ ...freelancer, idecoPaid: 276_000, furusatoPaid: 30_000, idecoAdditional: 540_000 });
    assert.equal(r.measures.combined.includesIdeco, true);
    assert.equal(r.measures.combined.idecoAdditional, 540_000);
    assert.equal(r.measures.combined.saving.total, 393_800);
    assert.equal(r.measures.furusato.limitAfterOtherMeasures, 73_000);
    assert.equal(r.measures.combinedWithIdeco, null);
    // 給与所得者は共済の対象外。iDeCo を指定しなければ、まとめはふるさと納税だけ
    const employee = calculate({ salaryRevenue: 6_000_000, socialInsurance: 880_000 });
    assert.equal(employee.measures.combined.kyosaiAdditional, 0);
    assert.equal(employee.measures.combined.idecoAdditional, 0);
    assert.deepEqual(employee.measures.combined.saving, employee.measures.furusato.saving);
    assert.ok((employee.measures.combinedWithIdeco?.idecoAdditional ?? 0) > 0);
  });

  it("掛金: 税額が減らなくなる額を超える分は提案しない", () => {
    // 所得 150 万円、社会保険料 30 万円
    //   所得税の課税所得 160,000 円（所得税 8,100 円）。
    //   住民税の課税所得 1,500,000 − 430,000 − 300,000 = 770,000 円 → 所得割 77,000 − 2,500 = 74,500 円。
    //   掛金 768,001 円以上で住民税の課税所得が 1,000 円（所得割 50 円 → 100 円未満切捨てで 0 円）になり、
    //   それ以上は減らない。1,000 円単位に切り上げて 769,000 円。
    const input = { businessRevenue: 2_000_000, businessExpenses: 500_000, socialInsurance: 300_000 } as const;
    const r = calculate(input);
    assert.equal(r.baseline.totalTax, 87_600);
    for (const m of [r.measures.kyosai, r.measures.ideco]) {
      assert.equal(m.additional, 769_000);
      assert.equal(m.noEffectBeyond, 769_000);
      assert.deepEqual(m.saving, { incomeTax: 8_100, residentTax: 74_500, total: 82_600 });
      assert.ok(m.notes[0]?.includes("769,000 円より多く追加しても"));
    }
    // 1,000 円少ないと、まだ税額が残る
    assert.equal(calculate({ ...input, kyosaiAdditional: 768_000 }).measures.kyosai.saving.total, 82_500);
    // 枠いっぱいまで効くときは null
    assert.equal(calculate(freelancer).measures.kyosai.noEffectBeyond, null);
    // 指定された追加額も同じ扱い
    const requested = calculate({ ...input, kyosaiAdditional: 840_000 }).measures.kyosai;
    assert.equal(requested.additional, 769_000);
    assert.ok(requested.notes[0]?.includes("指定された額は 840,000 円"));
    // まとめても、共済と iDeCo の両方で二重に数えない（監査の指摘: 1,656,000 円を提案していた）
    assert.equal(r.measures.combined.totalPayment, 769_000);
    assert.equal(r.measures.combined.saving.total, 82_600);
    assert.equal(r.measures.combinedWithIdeco, null);
    // 単独では税額が減らなくなる額でも、合わせると減る場合がある。まとめは、頭打ちにする前の額から計算する。
    //   所得 220 万円・配偶者と 16 歳未満の子 3 人（非課税限度額 217 万円）: 所得割は減額後 30,000 円で、
    //   調整控除後の所得割 104,000 円が 30,000 円を下回るまで（掛金 74 万円超）住民税は横ばいになる。
    //   50 万円ずつでは所得税の分（課税所得 430,000 円）しか減らないが、合わせて 100 万円なら住民税も減る。
    //   住民税の課税所得 1,090,000 − 1,000,000 = 90,000 円 → 9,000 − 4,500 = 4,500 円（+ 均等割等 5,000 円）
    const band = calculate({
      businessRevenue: 2_200_000,
      socialInsurance: 350_000,
      spouse: { income: 0 },
      dependents: { under16: 3 },
      idecoAdditional: 500_000,
      kyosaiAdditional: 500_000,
    });
    assert.equal(band.baseline.totalTax, 56_900);
    assert.equal(band.measures.ideco.additional, 429_000);
    assert.equal(band.measures.kyosai.additional, 429_000);
    // 999,000 円でも課税所得 91,000 円 → 9,100 − 4,550 = 4,550 → 4,500 円で同じ税額なので、そこで止まる
    assert.equal(band.measures.combined.idecoAdditional + band.measures.combined.kyosaiAdditional, 999_000);
    assert.equal(band.measures.combined.savingFromContributions.total, 56_900 - 9_500);
    // 収入がなければ、追加の提案は 0 円
    const none = calculate({ businessRevenue: 0 });
    assert.equal(none.measures.ideco.additional, 0);
    assert.equal(none.measures.ideco.noEffectBeyond, 0);
    assert.equal(none.measures.ideco.saving.total, 0);
    assert.ok(none.measures.ideco.notes[0]?.includes("掛金を追加しても税額は減りません"));
    assert.equal(none.measures.combined.totalPayment, 0);
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
    assert.equal(r.baseline.totalTax, 5_000); // 均等割 + 森林環境税のみ（均等割の非課税判定はしない）
    assert.equal(r.measures.furusato.limit, 0);
    assert.equal(r.measures.ideco.saving.total, 0);
    assert.ok(r.warnings.length > 0);
    const small = calculate({ businessRevenue: 1_500_000 });
    for (const s of [small.measures.ideco.saving, small.measures.kyosai.saving, small.measures.furusato.saving]) {
      assert.ok(s.total >= 0 && s.total <= small.baseline.totalTax);
    }
  });

  it("注意事項: 受取時の課税・資金の拘束・年内に増やせるかを策ごとに出す", () => {
    const m = calculate(freelancer).measures;
    const ideco = m.ideco.notes.join("\n");
    assert.match(ideco, /原則 60 歳まで引き出せません/);
    assert.match(ideco, /退職所得/);
    assert.match(ideco, /手数料/);
    assert.match(ideco, /1 年（12 月分〜翌年 11 月分）に 1 回/);
    const kyosai = m.kyosai.notes.join("\n");
    assert.match(kyosai, /受け取るときに課税/);
    assert.match(kyosai, /240 か月（20 年）未満/);
    assert.match(m.furusato.notes.join("\n"), /手元のお金は増えません/);
    assert.match(m.blueReturn.notes.join("\n"), /令和9年分からは見直されます/);
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
