import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { INPUT_BOOLEAN_FLAGS } from "../src/cli/flags.js";
import { insuranceGuide2026, sourcesInsuranceGuide } from "../src/data/2026-insurance-guide.js";
import { estimateInsurance, nationalHealthInsuranceOf } from "../web/guide.js";
import { browserNote, computeTop, isBlankTop, type FormValues, type TopOutcome } from "../web/logic.js";
import { summaryText, usedInputs } from "../web/summary.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
type Done = Extract<TopOutcome, { ok: true }>;

function done(values: FormValues): Done {
  const top = computeTop(values);
  assert.ok(top.ok, top.ok ? "" : top.issues.join("\n"));
  return top;
}

/** 計算に使った値を CLI に渡して実行する */
function runCli(flags: Record<string, string | boolean | undefined>): Record<string, any> {
  const args: string[] = [];
  for (const [name, value] of Object.entries(flags)) {
    if (value === true && (INPUT_BOOLEAN_FLAGS as readonly string[]).includes(name)) args.push(`--${name}`);
    else if (typeof value === "string") args.push(`--${name}=${value}`);
  }
  const r = spawnSync(process.execPath, [cli, ...args, "--json"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout) as Record<string, any>;
}

/** はじめの 3 つだけ答えた状態（フリーランス） */
const QUICK: FormValues = { work: "freelance", revenue: "380万", expenses: "55万", "si-mode": "estimate", blue: "unknown", misc: false };

const CASES: readonly FormValues[] = [
  QUICK,
  { work: "employee", salary: "620万", revenue: "90万", expenses: "12万", "si-mode": "estimate", blue: "unknown", misc: true, "misc-assumed": true },
  { work: "employee", salary: "620万", revenue: "90万", expenses: "12万", "si-mode": "enter", "social-insurance": "91.2万", misc: true, "ideco-paid": "14.4万", "furusato-paid": "3万" },
  { work: "freelance", revenue: "950万", expenses: "430万", blue: "65", "si-mode": "enter", "social-insurance": "120.8万", "kyosai-paid": "36万", "has-spouse": true, "spouse-income": "0", "dependents-under16": "1", dependents: "1", "other-deductions": "8万" },
  { work: "freelance", revenue: "105万", expenses: "45万", "si-mode": "enter", "social-insurance": "6万", blue: "none" },
  { work: "freelance", revenue: "800万", expenses: "150万", blue: "65", "si-mode": "enter", "social-insurance": "90万", "ideco-paid": "27.6万", "ideco-add": "10万", "kyosai-add": "30万" },
  { work: "freelance", revenue: "480万", expenses: "75万", blue: "65", "si-mode": "enter", "social-insurance": "59万", "furusato-paid": "1万", "furusato-add": "2万", "kyosai-add": "12万" },
  // 「給料はない」を選んでいる間は、残っている給与の値を使わない
  { work: "freelance", salary: "500万", revenue: "300万", "si-mode": "estimate", blue: "unknown" },
  // 年内に出せるお金を入れた場合
  { work: "freelance", revenue: "950万", expenses: "430万", blue: "65", "si-mode": "enter", "social-insurance": "120.8万", "kyosai-paid": "36万", budget: "15万" },
  { ...QUICK, budget: "1万" },
];

describe("トップページ: 計算に使った値を CLI に渡すと、同じ結果になる", () => {
  for (const values of CASES) {
    it(JSON.stringify(values), () => {
      const top = done(values);
      const { version: _version, ...fromCli } = runCli(top.effective);
      assert.deepEqual(JSON.parse(JSON.stringify(top.result)), fromCli);
    });
  }

  it("年内にやることの金額は、掛金・寄附を「支払済み」に足して CLI を実行したときの税額の差と同じ", () => {
    for (const values of CASES) {
      const top = done(values);
      const { plan, result } = top;
      const n = result.input;
      const { "ideco-add": _i, "kyosai-add": _k, ...flags } = top.effective as Record<string, string | boolean | undefined>;
      const after = runCli({
        ...flags,
        "kyosai-paid": String(n.kyosaiPaid + (plan.kyosai?.amount ?? 0)),
        "ideco-paid": String(n.idecoPaid + plan.ideco.amount),
        "furusato-paid": String(n.furusatoPaid + plan.furusato.amount),
      });
      assert.equal(plan.taxBefore, result.baseline.totalTax);
      assert.equal(plan.taxAfter, after["baseline"].totalTax);
      assert.equal(plan.saving.total, result.baseline.totalTax - after["baseline"].totalTax);
      assert.equal(plan.totalPayment, (plan.kyosai?.amount ?? 0) + plan.ideco.amount + plan.furusato.amount);
      // 項目ごとの減る税額を足すと、合計になる
      assert.equal((plan.kyosai?.saving.total ?? 0) + plan.ideco.saving.total + plan.furusato.saving.total, plan.saving.total);
    }
  });

  it("払う額を自分で決めていなければ、計算コアの「まとめて実行した場合」と同じ", () => {
    for (const values of CASES) {
      if (typeof values["furusato-add"] === "string" || typeof values["budget"] === "string") continue;
      const { plan, result } = done(values);
      if (plan.furusato.skipped) continue; // 割に合わない寄附は、やることに入れない（下のテスト）
      const c = result.measures.combined;
      assert.equal(plan.furusato.amount, c.furusatoAdditional);
      assert.equal(plan.kyosai?.amount ?? 0, c.kyosaiAdditional);
      assert.equal(plan.ideco.amount, c.idecoAdditional);
      assert.equal(plan.totalPayment, c.totalPayment);
      assert.deepEqual(plan.saving, c.saving);
      assert.equal(plan.taxAfter, c.totalTax);
      assert.equal(plan.furusato.saving.total, c.savingFromFurusato.total);
      assert.equal((plan.kyosai?.saving.total ?? 0) + plan.ideco.saving.total, c.savingFromContributions.total);
      assert.equal(plan.furusato.limit, result.measures.furusato.limitAfterOtherMeasures);
    }
  });

  it("ふるさと納税の額を上限の目安より多くすると、超えた額を示す", () => {
    const base = done({ ...QUICK, "kyosai-add": "0" });
    const limit = base.plan.furusato.limit;
    assert.ok(limit > 0);
    const over = done({ ...QUICK, "kyosai-add": "0", "furusato-add": String(limit + 20_000) });
    assert.equal(over.plan.furusato.over, 20_000);
    assert.equal(over.plan.furusato.custom, true);
    // 超えた分は、ほとんど税が減らない（所得税の寄附金控除の分だけ）
    assert.ok(over.plan.furusato.saving.total - base.plan.furusato.saving.total < 20_000 * 0.5);
    const outcome = computeTop({ ...QUICK, "furusato-add": "たくさん" });
    assert.equal(outcome.ok, false);
    assert.match(outcome.ok ? "" : (outcome.issues[0] ?? ""), /^--furusato-add: 金額として読めません/);
  });
});

describe("トップページ: 小規模企業共済と、年内に出せるお金", () => {
  const MEMBER: FormValues = { work: "freelance", revenue: "950万", expenses: "430万", blue: "65", "si-mode": "enter", "social-insurance": "120.8万", "kyosai-paid": "36万" };
  const tax = (flags: Record<string, string | boolean | undefined>): number => runCli(flags)["baseline"].totalTax as number;

  it("いま加入していない人には、額を入れるまで合計に入れず、加入した場合の額を別に示す", () => {
    const top = done(QUICK);
    assert.equal((top.effective as Record<string, string>)["kyosai-add"], "0");
    assert.equal(top.plan.kyosai?.amount, 0);
    assert.equal(top.plan.totalPayment, top.plan.furusato.amount);
    // 加入した場合の額は、CLI の既定（残り枠まで）と同じ
    const { "kyosai-add": _k, ...flags } = top.effective as Record<string, string>;
    const byDefault = runCli(flags)["measures"].kyosai;
    assert.deepEqual(top.plan.kyosai?.ifJoined, { amount: byDefault.additional, saving: byDefault.saving });
    assert.ok((top.plan.kyosai?.ifJoined?.amount ?? 0) > 0);
    // 額を入れると合計に入る。加入した場合の上限（スライダーの右端）は、入れた額で縮まない
    const joined = done({ ...QUICK, "kyosai-add": "12万" });
    assert.equal(joined.plan.kyosai?.amount, 120_000);
    assert.deepEqual(joined.plan.kyosai?.ifJoined, top.plan.kyosai?.ifJoined);
    assert.equal(joined.plan.totalPayment, 120_000 + joined.plan.furusato.amount);
  });

  it("加入済みで掛金を入れている人には、残り枠を合計に入れる", () => {
    const top = done(MEMBER);
    assert.equal((top.effective as Record<string, string>)["kyosai-add"], undefined);
    assert.equal(top.plan.kyosai?.ifJoined, null);
    assert.equal(top.plan.kyosai?.amount, 480_000);
  });

  it("年内に出せるお金を入れると、その範囲に収め、減る税額はふるさと納税だけ・共済だけの配分より小さくならない", () => {
    for (const budget of [30_000, 100_000, 300_000]) {
      const top = done({ ...MEMBER, budget: String(budget) });
      const { plan } = top;
      assert.ok(plan.totalPayment <= budget, `${budget}: ${plan.totalPayment}`);
      assert.equal(plan.budget?.amount, budget);
      assert.equal(plan.budget?.over, 0);
      const flags = top.effective as Record<string, string>;
      const { "kyosai-add": _k, ...base } = flags;
      const before = tax(base);
      // 画面の「減る税額」は、掛金・寄附を支払済みに足して CLI を実行した税額の差
      assert.equal(plan.saving.total, before - tax({ ...base, "kyosai-paid": String(360_000 + (plan.kyosai?.amount ?? 0)), "furusato-paid": String(plan.furusato.amount) }));
      const onlyKyosai = before - tax({ ...base, "kyosai-paid": String(360_000 + budget) });
      const limit = runCli(base)["measures"].furusato.limit as number;
      const onlyFurusato = before - tax({ ...base, "furusato-paid": String(Math.min(budget, limit)) });
      assert.ok(plan.saving.total >= onlyKyosai && plan.saving.total >= onlyFurusato, `${budget}: ${plan.saving.total} / ${onlyKyosai} / ${onlyFurusato}`);
      assert.match(plan.budget?.reason ?? "", /手元のお金は増えません/);
    }
  });

  it("加入していない人の「出せるお金」は、ふるさと納税だけに配分する。払う額を自分で決めて超えたら、超えた額を示す", () => {
    const top = done({ ...QUICK, budget: "2万" });
    assert.equal(top.plan.furusato.amount, 20_000);
    assert.equal(top.plan.kyosai?.amount, 0);
    assert.equal(top.plan.totalPayment, 20_000);
    const over = done({ ...QUICK, budget: "2万", "kyosai-add": "5万" });
    assert.equal(over.plan.budget?.over, 30_000);
    const wrong = computeTop({ ...QUICK, budget: "いっぱい" });
    assert.match(wrong.ok ? "" : (wrong.issues[0] ?? ""), /^--budget: 金額として読めません/);
  });
});

describe("トップページ: 割に合わないものは、やることに入れない", () => {
  it("上限の目安まで寄附しても、減る税額が自己負担より小さいなら、ふるさと納税を合計に入れず、額と減る税額を別に示す", () => {
    // 所得 60 万円・社会保険料 6 万円: 上限の目安 3,000 円、減る税額 1,000 円、自己負担 2,000 円
    const top = done({ work: "freelance", revenue: "105万", expenses: "45万", "si-mode": "enter", "social-insurance": "6万", blue: "none" });
    assert.equal(top.plan.furusato.limit, 3_000);
    assert.equal(top.plan.furusato.amount, 0);
    assert.deepEqual(top.plan.furusato.skipped, { amount: 3_000, saving: { incomeTax: 0, residentTax: 1_000, total: 1_000 } });
    assert.equal(top.plan.totalPayment, 0);
    assert.equal(top.plan.taxAfter, top.plan.taxBefore);
    assert.match(summaryText(top, "2026-11-27"), /ふるさと納税は、やることに入れていません/);
    // 自分で額を入れれば、計算に入る
    const chosen = done({ work: "freelance", revenue: "105万", expenses: "45万", "si-mode": "enter", "social-insurance": "6万", blue: "none", "furusato-add": "3000" });
    assert.equal(chosen.plan.furusato.amount, 3_000);
    assert.equal(chosen.plan.furusato.skipped, null);
  });

  it("減る税額が自己負担以上なら、今までどおり入れる", () => {
    const top = done(QUICK);
    assert.equal(top.plan.furusato.skipped, null);
    assert.ok(top.plan.furusato.amount > 0);
  });

  it("出せるお金が小さくて寄附が割に合わないときは、その分を掛金に回す", () => {
    // 3,000 円を寄附しても 1,000 円しか減らない。小規模企業共済に回せば、その分だけ税金が減る
    const top = done({ work: "freelance", revenue: "800万", expenses: "150万", blue: "none", "si-mode": "enter", "social-insurance": "90万", "kyosai-paid": "12万", budget: "3000" });
    assert.equal(top.plan.furusato.amount, 0);
    assert.equal(top.plan.kyosai?.amount, 3_000);
    assert.ok(top.plan.saving.total > 0);
    assert.doesNotMatch(top.plan.budget?.reason ?? "", /ふるさと納税は払った額とほぼ同じだけ/);
  });

  it("配偶者の給料の年収が読めない・大きすぎるときは、欄の名前つきの入力エラーにする", () => {
    const base: FormValues = { work: "employee", salary: "620万", "si-mode": "enter", "social-insurance": "91.2万", "has-spouse": true };
    for (const text of ["abc", "-1", "1000000000001"]) {
      const top = computeTop({ ...base, "spouse-salary": text });
      assert.equal(top.ok, false, text);
      assert.match(top.ok ? "" : (top.issues[0] ?? ""), /^--spouse-salary: /, text);
    }
    assert.equal(isBlankTop({ ...base, "spouse-salary": "1000000000001" }), false);
  });

  it("出せるお金に合わせて掛金を減らしたとき、ふるさと納税の上限の目安が上がる理由を添える", () => {
    const top = done({ work: "freelance", revenue: "950万", expenses: "430万", blue: "65", "si-mode": "enter", "social-insurance": "120.8万", "kyosai-paid": "36万", "has-spouse": true, "spouse-income": "0", "dependents-under16": "1", dependents: "1", "other-deductions": "8万", budget: "20万" });
    assert.equal(top.plan.furusato.amount, 39_000);
    assert.equal(top.plan.kyosai?.amount, 161_000);
    assert.match(top.plan.budget?.reason ?? "", /ふるさと納税の上限の目安は 31,000 円から 39,000 円に上がっています。$/);
  });
});

describe("トップページ: 仮に置いた値を結果に示す", () => {
  it("はじめの 3 つだけなら、社会保険料の目安・青色申告なし・家族なし・掛金なしを示す", () => {
    const top = done(QUICK);
    assert.deepEqual(top.assumptions.map((a) => a.key), ["insurance", "blue", "family", "paid"]);
    assert.equal(top.insurance?.amount, 573_000);
    assert.equal(top.result.input.socialInsurance, 573_000);
    assert.equal(top.result.input.blueReturn, "none");
    assert.match(top.assumptions[0]?.text ?? "", /573,000 円.*529,000 円〜690,000 円/);
  });

  it("「金額を入れる」を選んでも、額を入れるまでは目安で計算する（0 円として計算しない）", () => {
    const chosen = done({ ...QUICK, "si-mode": "enter", "social-insurance": "" });
    assert.equal(chosen.result.input.socialInsurance, 573_000);
    assert.equal(chosen.assumptions[0]?.key, "insurance");
    assert.equal(done({ ...QUICK, "si-mode": "enter", "social-insurance": "0" }).result.input.socialInsurance, 0);
  });

  it("「配偶者がいる」にチェックしただけでは、所得 0 円の配偶者として計算しない。給料の年収を入れると、給与所得を計算して使う", () => {
    const base: FormValues = { work: "employee", salary: "620万", "si-mode": "enter", "social-insurance": "91.2万" };
    const single = done(base);
    const checked = done({ ...base, "has-spouse": true });
    assert.equal(checked.result.input.spouse, null);
    assert.equal(checked.result.baseline.totalTax, single.result.baseline.totalTax);
    assert.match(checked.assumptions.find((a) => a.key === "family")?.text ?? "", /入れるまでは、配偶者なしで計算しています/);
    // 年収 400 万円の配偶者: 給与所得は 276 万円（133 万円を超えるので控除なし。税額は配偶者なしと同じ）
    const working = done({ ...base, "has-spouse": true, "spouse-salary": "400万" });
    assert.equal(working.result.input.spouse?.income, 2_760_000);
    assert.equal(working.result.baseline.totalTax, single.result.baseline.totalTax);
    assert.equal((working.effective as Record<string, string>)["spouse-income"], "2760000");
    // 収入のない配偶者は 0 と入れる。配偶者控除が入って税額が下がる
    const none = done({ ...base, "has-spouse": true, "spouse-salary": "0" });
    assert.equal(none.result.input.spouse?.income, 0);
    assert.ok(none.result.baseline.totalTax < single.result.baseline.totalTax);
    // 合計所得金額を入れたときは、そちらを使う
    assert.equal(done({ ...base, "has-spouse": true, "spouse-salary": "400万", "spouse-income": "50万" }).result.input.spouse?.income, 500_000);
  });

  it("入力した項目は、仮に置いた値から消える", () => {
    const top = done({ ...QUICK, "si-mode": "enter", "social-insurance": "50万", blue: "65", "has-spouse": true, "spouse-income": "0", "ideco-paid": "0" });
    assert.deepEqual(top.assumptions, []);
    assert.equal(top.insurance, null);
    assert.equal(top.result.input.socialInsurance, 500_000);
  });

  it("会社員 + 副業は、選んでいなければ雑所得として計算し、そのことを示す", () => {
    const top = done(CASES[1] ?? {});
    assert.equal(top.result.input.businessIncomeType, "misc");
    assert.ok(top.assumptions.some((a) => a.key === "incomeType"));
    assert.equal(top.insurance?.kind, "employee");
    assert.equal(top.insurance?.amount, 911_000);
  });

  it("収入が空なら案内を出す（給料はないを選んでいる間は、給与の値を数えない）", () => {
    assert.equal(isBlankTop({ work: "freelance", salary: "500万", revenue: "" }), true);
    assert.equal(isBlankTop({ work: "employee", salary: "500万", revenue: "" }), false);
    assert.equal(isBlankTop({ work: "freelance", revenue: "100万" }), false);
  });
});

describe("社会保険料の目安（手で計算した値と一致する）", () => {
  it("フリーランス: 国民年金の定額 + 3 つの市区の国民健康保険の平均", () => {
    // 所得 325 万円 → 所得割の基礎 282 万円
    const [shinjuku, sapporo, fukuoka] = insuranceGuide2026.nationalHealthInsurance.municipalities;
    assert.ok(shinjuku && sapporo && fukuoka);
    // 新宿区: 211,782 + 47,600 / 78,960 + 17,600 / 7,614 + 1,873
    assert.equal(nationalHealthInsuranceOf(shinjuku, 3_250_000, false), 365_429);
    // 札幌市: 242,802 + 20,550 + 32,540 / 72,192 + 6,330 + 10,010 / 8,178 + 1,100 + 1,000、介護分 65,706 + 6,020 + 7,550
    assert.equal(nationalHealthInsuranceOf(sapporo, 3_250_000, false), 394_702);
    assert.equal(nationalHealthInsuranceOf(sapporo, 3_250_000, true), 473_978);
    // 福岡市: 157,356 + 19,807 + 18,664 / 88,548 + 10,441 + 9,838 / 7,896 + 1,039 + 911
    assert.equal(nationalHealthInsuranceOf(fukuoka, 3_250_000, false), 314_500);
    const e = estimateInsurance("freelance", 0, 3_250_000);
    // 国民年金 17,920 × 12 = 215,040。国保の平均 358,210 → 358,000
    assert.equal(e.amount, 573_000);
    assert.equal(e.low, 529_000);
    assert.equal(e.high, 690_000);
    assert.deepEqual(e.parts.map((p) => p.amount), [215_040, 358_000]);
  });

  it("所得が大きいと賦課限度額で頭打ちになり、所得が 43 万円以下なら均等割・平等割だけになる", () => {
    const [shinjuku] = insuranceGuide2026.nationalHealthInsurance.municipalities;
    assert.ok(shinjuku);
    assert.equal(nationalHealthInsuranceOf(shinjuku, 30_000_000, true), 670_000 + 260_000 + 30_000 + 170_000);
    assert.equal(nationalHealthInsuranceOf(shinjuku, 400_000, false), 47_600 + 17_600 + 1_873);
  });

  it("会社員: 給与の年収 × 本人負担の料率（厚生年金 9.15% + 健康保険 4.94% + 子ども・子育て支援金 0.115% + 雇用保険 0.5%）", () => {
    const e = estimateInsurance("employee", 6_200_000, 0);
    assert.equal(e.amount, 911_000); // 6,200,000 × 14.705% = 911,710
    assert.equal(e.low, 890_000); // 14.37% = 890,940
    assert.equal(e.high, 983_000); // 15.85% = 982,700
  });

  it("出典は、公的機関と自治体の公式ページだけ", () => {
    for (const s of sourcesInsuranceGuide) {
      assert.match(s.url, /^https:\/\/www\.(nenkin\.go\.jp|mhlw\.go\.jp|kyoukaikenpo\.or\.jp|city\.(shinjuku\.lg|sapporo|fukuoka\.lg)\.jp)\//, s.url);
    }
  });
});

describe("結果を文章にする", () => {
  it("やること・合計・いまの税額・計算に使った値・仮に置いた値・概算である旨が入る", () => {
    const top = done(QUICK);
    const text = summaryText(top, "2026-11-27");
    const yen = (n: number): string => `${n.toLocaleString("ja-JP")} 円`;
    assert.match(text, /■ 年内にやること\n1\. ふるさと納税: /);
    assert.ok(text.includes(`合計: 年内に ${yen(top.plan.totalPayment)}払うと、税金が ${yen(top.plan.saving.total)}減る見込み`));
    assert.ok(text.includes(`合計: ${yen(top.result.baseline.totalTax)}`));
    assert.ok(text.includes("売上: 3,800,000 円"));
    assert.ok(text.includes("社会保険料: 573,000 円（目安"));
    assert.ok(text.includes("■ 入力していないので、仮に置いた値"));
    assert.match(text, /概算です。.*税理士や税務署・市区町村の判断に代わるものではありません。/);
    assert.match(text, /2026-11-27/);
    assert.doesNotMatch(text, /CLI|JSON|undefined|NaN/);
    assert.equal(usedInputs(top).find(([label]) => label === "配偶者")?.[1], "なし");
  });

  it("画面と文章には、CLI や JSON の指定方法を出さない", () => {
    assert.equal(browserNote("指定してください（CLI は --ideco-add、JSON は idecoAdditional、ブラウザ版は「x」）。"), "指定してください。");
    const top = done({ work: "employee", salary: "1200万", "si-mode": "estimate" });
    assert.ok(top.result.warnings.some((w) => w.includes("CLI")));
    assert.doesNotMatch(summaryText(top, "2026-11-27"), /CLI|JSON/);
  });
});

describe("トップページの HTML と見た目", () => {
  const html = readFileSync(join(root, "docs/index.html"), "utf8");
  const css = readFileSync(join(root, "docs/style.css"), "utf8");

  it("はじめに見える入力は、働き方・収入・経費だけ。ほかは「もっと正確にする」の中", () => {
    const quick = html.slice(html.indexOf('class="panel quick"'), html.indexOf('<details class="panel more"'));
    const names = [...new Set([...quick.matchAll(/<input[^>]*\bname="([^"]+)"/g)].map((m) => m[1]))];
    assert.deepEqual(names, ["work", "salary", "revenue", "expenses"]);
    assert.match(html, /<summary><span class="summary-title">もっと正確にする<\/span>/);
  });

  it("結果の先頭は「年内にやること」。免責と、計算していないものは、その後ろ", () => {
    const plan = html.indexOf('id="plan"');
    const disclaimer = html.indexOf('class="card disclaimer"');
    assert.ok(html.indexOf('id="results"') < plan && plan < html.indexOf('id="result"') && html.indexOf('id="result"') < disclaimer);
    const inPlan = html.slice(plan, html.indexOf('id="result"'));
    assert.match(inPlan, /<strong>概算です。<\/strong>/);
    for (const word of ["やること", "払う額", "減る税額", "締切", "注意", "やり方"]) assert.ok(inPlan.includes(`>${word}<`), word);
    // 各項目で、いつも見えているのは「やること・払う額・減る税額」の 3 行。締切・注意・加入の手順は、開いて読む
    for (const steps of inPlan.matchAll(/<dl class="steps">([\s\S]*?)<\/dl>/g)) {
      assert.deepEqual([...(steps[1] ?? "").matchAll(/<dt>(?:<label[^>]*>)?([^<]+)/g)].map((m) => m[1]), ["やること", "払う額", "減る税額"]);
    }
    assert.equal([...inPlan.matchAll(/<details class="help more-info">/g)].length, 4);
    // やり方には、公的機関の公式ページへのリンクを付ける。特定の寄附サイトや金融機関は勧めない
    const links = [...inPlan.matchAll(/<a href="(https:[^"]+)"/g)].map((m) => m[1] ?? "");
    assert.ok(links.length >= 7);
    for (const url of links) assert.match(url, /^https:\/\/(www\.soumu\.go\.jp|www\.nta\.go\.jp|www\.smrj\.go\.jp|kyosai-web\.smrj\.go\.jp|www\.ideco-koushiki\.jp)\//, url);
    for (const word of ["受領書", "ワンストップ特例を使えません", "掛金月額変更（増額・減額）申込書", "運営管理機関", "青色申告承認申請書"]) assert.ok(inPlan.includes(word), word);
    assert.match(html.slice(disclaimer), /計算していないもの/);
  });

  it("保存は、選んだときだけこの端末の中にすることと、消し方を書いている（「保存しません」と言い切らない）", () => {
    assert.match(html, /<input type="checkbox" id="save">/);
    assert.doesNotMatch(html, /id="save"[^>]*checked/);
    assert.match(html, /既定では保存しません。.*この端末のこのブラウザの中にだけ保存.*外には送信しません。.*チェックを外すと、保存した内容をすぐに消します/);
    assert.doesNotMatch(html, /どこにも送信・保存しません/);
  });

  it("文字と背景のコントラスト比は 4.5 以上（明るい配色・暗い配色）", () => {
    const blocks = [...css.matchAll(/:root \{([^}]*)\}/g)].map((m) => m[1] ?? "");
    const light = blocks[0] ?? "";
    const dark = blocks[1] ?? "";
    assert.ok(light.includes("--bg") && dark.includes("--bg"));
    const vars = (block: string): Record<string, string> =>
      Object.fromEntries([...block.matchAll(/--([a-z-]+): (#[0-9a-f]{6});/g)].map((m) => [m[1] ?? "", m[2] ?? ""]));
    const luminance = (hex: string): number => {
      const channel = (i: number): number => {
        const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
    };
    const ratio = (a: string, b: string): number => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
      return (hi + 0.05) / (lo + 0.05);
    };
    const pairs: (readonly [string, string])[] = [
      ["text", "bg"], ["text", "surface"], ["muted", "bg"], ["muted", "surface"], ["muted", "sunken"],
      ["accent", "surface"], ["accent", "bg"], ["accent", "accent-bg"], ["accent-strong", "accent-bg"], ["on-accent", "accent"],
      ["error", "error-bg"], ["caution", "caution-bg"], ["text", "caution-bg"],
    ];
    for (const [name, v] of [["明るい配色", vars(light)], ["暗い配色", { ...vars(light), ...vars(dark) }]] as const) {
      for (const [fg, bg] of pairs) {
        const value = ratio(v[fg] ?? "", v[bg] ?? "");
        assert.ok(value >= 4.5, `${name}: ${fg} / ${bg} = ${value.toFixed(2)}`);
      }
    }
  });

  it("印刷用の体裁がある（入力欄・ボタンを外す）", () => {
    const print = css.slice(css.indexOf("@media print"));
    assert.match(print, /#form[^{]*\{ display: none !important; \}/);
    assert.match(print, /\.share/);
  });
});
