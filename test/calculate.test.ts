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
