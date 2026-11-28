/**
 * 英語版（docs/en/ と、計算コア・画面の英語の文面）。
 *
 * いちばん大事なのは「同じ入力なら、日本語でも英語でも同じ数字になる」こと。
 * 言語で変わってよいのは文面（文字列）だけで、数値・真偽値・構造は 1 つも変わらないことを確かめる。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { EN_LINKS, pageLinksEn, renderSiteEn } from "../site/pages-en.js";
import { CROSS_CHECKS, EN_SLUG, JA_SLUG, PAGE_KINDS, renderSite, REPO_URL, SITE_URL, siteUrls } from "../site/pages.js";
import { parseAmount } from "../src/cli/amount.js";
import { INPUT_BOOLEAN_FLAGS, INPUT_STRING_FLAGS } from "../src/cli/flags.js";
import { CORE_MESSAGES, currentLocale } from "../src/core/messages.js";
import { sourcesInsuranceGuide } from "../src/data/2026-insurance-guide.js";
import { calculate, compareFurusatoLimit, getSources, InputError, type TaxInput } from "../src/index.js";
import { estimateInsurance } from "../web/guide.js";
import { compute, computeComparison, computeTop, type FormValues } from "../web/logic.js";
import { webMessages } from "../web/messages.js";
import { summaryText } from "../web/summary.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const docs = join(root, "docs");
const read = (path: string): string => readFileSync(join(docs, path), "utf8");

const JAPANESE = /[ぁ-んァ-ヶ一-龥]/;

/** 文字列をすべて同じ印に置き換える（文面は言語で変わってよいので、それ以外が同じかを比べる） */
function withoutText(value: unknown): unknown {
  if (typeof value === "string") return "<text>";
  if (Array.isArray(value)) return value.map(withoutText);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withoutText(v)]));
  return value;
}

/** 値の中の文字列を全部集める */
function texts(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) texts(v, out);
  else if (value !== null && typeof value === "object") for (const v of Object.values(value)) texts(v, out);
  return out;
}

/**
 * 値の中の文字列を、確定申告書の対応表（filing）を除いて集める。
 * 対応表は、紙の申告書で欄を探せるように、欄・書類の名前を日本語のまま添えている（説明は英語）。
 */
function textsOutsideFiling(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) textsOutsideFiling(v, out);
  else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) if (k !== "filing") textsOutsideFiling(v, out);
  }
  return out;
}

/** 計算コアに通す入力の組（注記・注意の分岐をひととおり踏むように選ぶ） */
const INPUTS: readonly TaxInput[] = [
  { businessRevenue: 8_000_000, businessExpenses: 1_500_000, blueReturn: "65", socialInsurance: 900_000 },
  { businessRevenue: 4_800_000, businessExpenses: 750_000, socialInsurance: 590_000 },
  { salaryRevenue: 5_000_000, socialInsurance: 750_000 },
  { salaryRevenue: 6_000_000, businessRevenue: 1_000_000, businessExpenses: 200_000, businessIncomeType: "misc", socialInsurance: 880_000 },
  { salaryRevenue: 9_000_000, socialInsurance: 1_300_000, spouse: { income: 0 }, dependents: { general: 1 } },
  { salaryRevenue: 12_000_000, socialInsurance: 1_500_000, spouse: { income: 2_000_000 } },
  { businessRevenue: 1_200_000, blueReturn: "65", socialInsurance: 200_000 },
  { businessRevenue: 900_000, businessExpenses: 100_000, dependents: { under16: 2 } },
  { businessRevenue: 500_000, businessExpenses: 500_000 },
  { businessRevenue: 6_000_000, blueReturn: "55", socialInsurance: 800_000, idecoPaid: 816_000, kyosaiPaid: 900_000, furusatoPaid: 200_000 },
  { businessRevenue: 6_000_000, blueReturn: "10", socialInsurance: 800_000, idecoAdditional: 900_000, kyosaiAdditional: 100_000, nhiIncomeRatePercent: 11.5 },
  { businessRevenue: 3_000_000, socialInsurance: 400_000, idecoPaid: 900_000, idecoAnnualLimit: 816_000 },
  { businessRevenue: 2_000_000, businessExpenses: 600_000, socialInsurance: 300_000, kyosaiPaid: 120_000, furusatoPaid: 50_000 },
  { salaryRevenue: 4_000_000, socialInsurance: 600_000, nhiIncomeRatePercent: 10, idecoPaid: 100_000 },
  { businessRevenue: 15_000_000, businessExpenses: 2_000_000, blueReturn: "65", socialInsurance: 1_400_000, spouse: { income: 500_000, age70OrOlder: true }, dependents: { specific: 1, elderly: 1, elderlyCohabiting: 1 } },
  { businessRevenue: 1_700_000, businessExpenses: 300_000, blueReturn: "65", socialInsurance: 250_000, spouse: { income: 0 }, dependents: { under16: 1 } },
  // 雑所得だけ（小規模企業共済・青色申告の対象外）
  { businessRevenue: 2_000_000, businessExpenses: 300_000, businessIncomeType: "misc", socialInsurance: 300_000 },
  // 事業所得が青色申告特別控除の枠より小さい
  { businessRevenue: 500_000, businessExpenses: 100_000, blueReturn: "65" },
  // 配偶者の所得が 133 万円を超える
  { businessRevenue: 6_000_000, socialInsurance: 800_000, spouse: { income: 1_500_000 } },
  // 住民税の所得割の非課税限度額を少し超える（所得割が減額される）
  { businessRevenue: 1_850_000, spouse: { income: 0 }, dependents: { under16: 2 } },
  // 掛金を追加すると、ふるさと納税の上限の目安が 0 円になる
  { businessRevenue: 1_500_000, socialInsurance: 200_000 },
  // 医療費控除（通常のほうが有利）と、生命保険料（旧契約だけを申告するほうが有利）
  { businessRevenue: 8_000_000, businessExpenses: 1_500_000, blueReturn: "65", socialInsurance: 900_000, medicalExpenses: 150_000, selfMedicationExpenses: 30_000, lifeInsuranceNew: 80_000, lifeInsuranceOld: 70_000, pensionInsuranceNew: 90_000, pensionInsuranceOld: 80_000, medicalCareInsurance: 40_000, furusatoPaid: 50_000 },
  // セルフメディケーション税制のほうが有利・23 歳未満の扶養親族の特例・その他の所得控除との重なり
  { salaryRevenue: 9_500_000, businessRevenue: 600_000, businessExpenses: 100_000, businessIncomeType: "misc", socialInsurance: 1_400_000, selfMedicationExpenses: 50_000, medicalExpenses: 60_000, lifeInsuranceNew: 100_000, dependents: { under16: 1 }, otherDeductions: 50_000, idecoPaid: 276_000, kyosaiPaid: 0 },
  // 所得が少なく、医療費の足切りが総所得金額等の 5%
  { businessRevenue: 1_800_000, businessExpenses: 400_000, medicalExpenses: 90_000, medicalReimbursed: 10_000 },
  // 医療費が足切りに届かない
  { businessRevenue: 5_000_000, medicalExpenses: 50_000 },
];

describe("英語版: 計算コアは、言語を変えても数字が変わらない", () => {
  it("calculate: 日本語と英語で、文字列以外はすべて同じ。英語の結果に日本語の文は残らない", () => {
    let englishNotes = 0;
    for (const input of INPUTS) {
      const ja = calculate(input);
      const en = calculate(input, { locale: "en" });
      assert.deepEqual(withoutText(en), withoutText(ja), JSON.stringify(input));
      // 文面の数（注記・注意の件数）も同じ
      assert.equal(texts(en).length, texts(ja).length, JSON.stringify(input));
      // 確定申告書の対応表は、紙の申告書で欄を探せるように、欄の名前（label）と様式の名前に日本語を残す。
      // 説明（note・notes）は英語で書き、日本語は欄や書類の名前を添えるときだけ使う
      const { filing, ...rest } = en;
      for (const text of texts(rest)) {
        assert.doesNotMatch(text, JAPANESE, `${JSON.stringify(input)}: ${text}`);
        englishNotes++;
      }
      for (const text of [...filing.entries.map((e) => e.note), ...filing.notes, filing.form]) {
        assert.match(text, /[A-Za-z]{4,}.*[A-Za-z]{4,}/, `${JSON.stringify(input)}: 英語の説明がない: ${text}`);
      }
      assert.equal(en.label, "tax year 2026 (Reiwa 8)");
      assert.equal(en.residentTaxLabel, "fiscal 2027");
      // 既定（locale を指定しない）は日本語のまま
      assert.equal(calculate(input, {}).disclaimer, CORE_MESSAGES.ja.disclaimer);
      assert.equal(ja.label, "令和8年分");
    }
    assert.ok(englishNotes > 200);
  });

  it("用意した入力で、計算コアの英語の文面（注記・注意）をほぼすべて通っている", () => {
    const seen = new Set<string>();
    for (const input of INPUTS) for (const text of texts(calculate(input, { locale: "en" }))) seen.add(text);
    const en = CORE_MESSAGES.en;
    const fixed = Object.entries(en).filter(([key, value]) => typeof value === "string" && !/^(flag|cmp|input|not|spouse|dependents|blueLevels|blueForMisc|incomeType|incomeAdjustmentBool|dependentUnder23Bool|lifeLabel|pensionLabel|unknown)/.test(key));
    const missed = fixed.filter(([, value]) => !seen.has(value as string)).map(([key]) => key);
    assert.deepEqual(missed, [], "英語の文面のうち、テストの入力で一度も出ていないもの");
  });

  it("compareFurusatoLimit: 令和7年分との比較も、言語で数字が変わらない", () => {
    const inputs: TaxInput[] = [
      { salaryRevenue: 5_000_000, socialInsurance: 750_000 },
      { salaryRevenue: 6_000_000, socialInsurance: 900_000 },
      { salaryRevenue: 2_000_000, socialInsurance: 300_000 },
      { salaryRevenue: 1_000_000, socialInsurance: 150_000 },
      { businessRevenue: 5_000_000, blueReturn: "65", socialInsurance: 750_000, spouse: { income: 0 } },
    ];
    for (const input of inputs) {
      const ja = compareFurusatoLimit(input);
      const en = compareFurusatoLimit(input, { locale: "en" });
      assert.deepEqual(withoutText(en), withoutText(ja));
      assert.equal(en.notes.length, ja.notes.length);
      for (const text of texts(en)) assert.doesNotMatch(text, JAPANESE, text);
      assert.equal(en.previous.label, "tax year 2025 (Reiwa 7)");
    }
    assert.throws(() => compareFurusatoLimit({ salaryRevenue: 5_000_000, spouse: { income: 1 } }, { locale: "en" }), /only available when the spouse has no income/);
  });

  it("入力エラーも英語になる。計算のあとは、もとの言語（日本語）に戻る", () => {
    const bad = { businessRevenue: -1, blueReturn: "99", typo: 1, dependents: { general: 1.5 }, nhiIncomeRatePercent: 0 } as unknown as TaxInput;
    const issuesOf = (locale?: "ja" | "en"): readonly string[] => {
      try {
        calculate(bad, locale ? { locale } : {});
      } catch (error) {
        assert.ok(error instanceof InputError);
        return error.issues;
      }
      throw new Error("エラーになりませんでした");
    };
    const en = issuesOf("en");
    const ja = issuesOf();
    assert.equal(en.length, ja.length);
    assert.ok(en.length >= 5);
    for (const [index, issue] of en.entries()) {
      assert.doesNotMatch(issue, JAPANESE);
      // どの項目の指摘かは、言語が違っても同じ
      assert.equal(issue.split(":")[0], (ja[index] ?? "").split(":")[0]);
    }
    assert.ok(ja.every((issue) => JAPANESE.test(issue)));
    assert.equal(currentLocale(), "ja");
    assert.throws(() => calculate({}, { locale: "fr" as "en" }), RangeError);
    assert.equal(currentLocale(), "ja");
  });

  it("金額は、英語圏の書き方でも読める（6m・750k・¥・yen・man）。あいまいな書き方は読まない", () => {
    assert.equal(parseAmount("4.8m"), 4_800_000);
    assert.equal(parseAmount("6M"), 6_000_000);
    assert.equal(parseAmount("750k"), 750_000);
    assert.equal(parseAmount("600man"), 6_000_000);
    assert.equal(parseAmount("¥4,800,000"), 4_800_000);
    assert.equal(parseAmount("￥4,800,000"), 4_800_000);
    assert.equal(parseAmount("4,800,000 yen"), 4_800_000);
    assert.equal(parseAmount("4800000 JPY"), 4_800_000);
    assert.equal(parseAmount("480万"), 4_800_000);
    assert.equal(parseAmount("1億2000万"), 120_000_000);
    for (const text of ["4.8mm", "m", "4.8 million", "1k2", "-5m", "4.8km", "0.0001k", "$5,000"]) assert.equal(parseAmount(text), null, text);
  });
});

describe("英語版: ブラウザ版の計算（トップと説明ページ）も、言語で数字が変わらない", () => {
  const FORMS: readonly FormValues[] = [
    { work: "freelance", revenue: "480万", expenses: "75万", "si-mode": "estimate", blue: "unknown" },
    { work: "freelance", revenue: "4,800,000", expenses: "750,000", "si-mode": "estimate", blue: "unknown", budget: "100,000" },
    { work: "freelance", revenue: "8m", expenses: "1.5m", "si-mode": "enter", "social-insurance": "900k", blue: "65", "kyosai-paid": "120,000", budget: "300,000" },
    { work: "employee", salary: "6,000,000", revenue: "1,000,000", expenses: "200,000", misc: true, "misc-assumed": true, "si-mode": "estimate" },
    { work: "employee", salary: "9,000,000", "si-mode": "enter", "social-insurance": "1,300,000", "has-spouse": true, "spouse-salary": "1,000,000", dependents: "1", "ideco-add": "100,000" },
    { work: "freelance", revenue: "3,000,000", "si-mode": "estimate", blue: "none", "has-spouse": true, "furusato-add": "50,000", "kyosai-add": "200,000" },
    { work: "freelance", revenue: "1,300,000", expenses: "200,000", "si-mode": "estimate", blue: "65" },
    { work: "freelance", revenue: "5,000,000", "si-mode": "estimate", blue: "55", "furusato-paid": "100,000", "nhi-rate": "11.5" },
  ];

  it("computeTop: 計画・結果・計算に使った値・目安の数字が、日本語と英語で同じ", () => {
    for (const values of FORMS) {
      const ja = computeTop(values);
      const en = computeTop(values, "en");
      assert.ok(ja.ok && en.ok, JSON.stringify(values));
      assert.deepEqual(withoutText(en), withoutText(ja), JSON.stringify(values));
      assert.deepEqual(en.effective, ja.effective);
      for (const text of textsOutsideFiling({ ...en, effective: null })) {
        // 源泉徴収票の欄の名前だけは、探せるように日本語のまま添えている
        assert.doesNotMatch(text.replace("社会保険料等の金額", ""), JAPANESE, text);
      }
      // 文章にした結果（コピー用）も、数字の並びは同じで、英語には日本語が残らない
      const jaText = summaryText(ja, "2026-11-27");
      const enText = summaryText(en, "2026-11-27", "en");
      assert.doesNotMatch(enText, JAPANESE);
      assert.match(enText, /^What to do before year-end, and how much tax it saves\. Estimate for tax year 2026 \(Reiwa 8\)\n/);
      assert.ok(enText.endsWith("https://ozko00.github.io/setsuzei/en/"));
      // 「計算に使った値」より前（やること・税額）の金額は、同じものが同じ数だけ出る
      const amounts = (text: string, until: string): string[] => (text.slice(0, text.indexOf(until)).match(/\d{1,3}(?:,\d{3})+/g) ?? []).sort();
      assert.deepEqual(amounts(enText, webMessages("en").hInputs), amounts(jaText, webMessages("ja").hInputs), JSON.stringify(values));
    }
    assert.equal(currentLocale(), "ja");
  });

  it("年内に出せるお金: いま加入していない小規模企業共済には自動で配分しないので、余りがあればそう伝える（掛金の話は出さない）", () => {
    const values: FormValues = { work: "freelance", revenue: "9,200,000", expenses: "1,100,000", "si-mode": "enter", "social-insurance": "935,040", blue: "65", "furusato-paid": "30,000", budget: "300,000" };
    const ja = computeTop(values);
    const en = computeTop(values, "en");
    assert.ok(ja.ok && en.ok);
    assert.equal(en.plan.totalPayment, 146_000);
    assert.equal(en.plan.kyosai?.amount, 0);
    assert.match(en.plan.budget?.reason ?? "", /¥154,000 of what you can spend is still unused\. Small Business Mutual Aid is not added automatically/);
    assert.match(ja.plan.budget?.reason ?? "", /出せるお金のうち 154,000 円は、まだ使い道がありません。/);
    // 掛金を払っていないのに「掛金が少ないぶん、上限の目安が上がっています」とは言わない
    assert.doesNotMatch(en.plan.budget?.reason ?? "", /limit rises/);
    assert.doesNotMatch(ja.plan.budget?.reason ?? "", /上がっています/);
    // 自分で額を入れたら、余りの案内は出ない
    const joined = computeTop({ ...values, "kyosai-add": "154,000" }, "en");
    assert.ok(joined.ok);
    assert.doesNotMatch(joined.plan.budget?.reason ?? "", /still unused/);
  });

  it("誤入力: 同じ欄を、同じ数だけ指摘する（文面だけが英語）", () => {
    const values: FormValues = { work: "freelance", revenue: "abc", expenses: "-5", "si-mode": "estimate", budget: "x", "has-spouse": true, "spouse-salary": "??" };
    const ja = computeTop(values);
    const en = computeTop(values, "en");
    assert.ok(!ja.ok && !en.ok);
    assert.equal(en.issues.length, ja.issues.length);
    assert.deepEqual(en.issues.map((i) => i.split(":")[0]), ja.issues.map((i) => i.split(":")[0]));
    for (const issue of en.issues) assert.doesNotMatch(issue, JAPANESE);
  });

  it("説明ページの計算機（compute / computeComparison）と、社会保険料の目安も同じ", () => {
    const values: FormValues = { revenue: "800万", expenses: "150万", blue: "65", "social-insurance": "90万", "ideco-add": "10万", "nhi-rate": "11.5" };
    const ja = compute(values);
    const en = compute(values, "en");
    assert.ok(ja.ok && en.ok);
    assert.deepEqual(withoutText(en), withoutText(ja));
    const year: FormValues = { salary: "500万", "social-insurance": "75万" };
    assert.deepEqual(withoutText(computeComparison(year, "en")), withoutText(computeComparison(year)));
    for (const kind of ["employee", "freelance"] as const) {
      const a = estimateInsurance(kind, 6_000_000, 4_000_000);
      const b = estimateInsurance(kind, 6_000_000, 4_000_000, "en");
      assert.deepEqual(withoutText(b), withoutText(a));
      assert.equal(b.parts.length, a.parts.length);
    }
    assert.match(estimateInsurance("freelance", 0, 4_000_000, "en").basis.join(" "), /Shinjuku \(Tokyo\), Sapporo, Fukuoka/);
  });

  it("画面の文面: 日本語と英語で、同じ項目がそろっている（抜けがない）", () => {
    const ja = webMessages("ja") as unknown as Record<string, unknown>;
    const en = webMessages("en") as unknown as Record<string, unknown>;
    assert.deepEqual(Object.keys(en).sort(), Object.keys(ja).sort());
    for (const key of Object.keys(ja)) assert.equal(typeof en[key], typeof ja[key], key);
    assert.deepEqual(Object.keys(CORE_MESSAGES.en).sort(), Object.keys(CORE_MESSAGES.ja).sort());
    // 英語の文面（引数のないもの）に、日本語は入っていない
    for (const [key, value] of [...Object.entries(en), ...Object.entries(CORE_MESSAGES.en)]) {
      // 確定申告書の対応表の見出し（第一表など）は、紙の申告書と照らし合わせられるよう日本語の名前を添える
      if (key === "filing" || key === "filingSheet") continue;
      for (const text of texts(value)) assert.doesNotMatch(text.replace("社会保険料等の金額", ""), JAPANESE, key);
    }
    // 確定申告書の対応表の文面は、日本語の欄名を添えてもよいが、説明は英語で書く
    for (const text of texts(CORE_MESSAGES.en.filing)) assert.match(text, /[A-Za-z]{4,}.*[A-Za-z]{4,}/, text);
    for (const text of texts(webMessages("en").filingSheet)) assert.match(text, /^[A-Z][a-z]{3,}/, text);
  });
});

describe("英語版: 公開するページ（docs/en/）", () => {
  const site = renderSite();
  const siteEn = renderSiteEn();
  const topJa = read("index.html");
  const topEn = read("en/index.html");
  const pairs = [
    { kind: "top", ja: topJa, en: topEn, jaUrl: SITE_URL, enUrl: `${SITE_URL}en/` },
    ...PAGE_KINDS.map((kind) => ({
      kind,
      ja: site.get(`${JA_SLUG[kind]}/index.html`) ?? "",
      en: siteEn.get(`en/${EN_SLUG[kind]}/index.html`) ?? "",
      jaUrl: `${SITE_URL}${JA_SLUG[kind]}/`,
      enUrl: `${SITE_URL}en/${EN_SLUG[kind]}/`,
    })),
  ];
  const CSP = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/;
  const names = (html: string): string[] => [...html.matchAll(/<(?:input|select)[^>]*\bname="([^"]+)"/g)].map((m) => m[1] ?? "").sort();
  const ids = (html: string): string[] => [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1] ?? "").sort();

  it("docs/en/ のファイルは、いまの計算コアから生成した結果と一致する（npm run build:site の実行漏れを検出）", () => {
    assert.equal(siteEn.size, 7);
    for (const [path, content] of siteEn) assert.equal(read(path), content, path);
  });

  it("日本語版と英語版は 1 対 1。互いに hreflang とリンクで結び、canonical は自分自身", () => {
    for (const { kind, ja, en, jaUrl, enUrl } of pairs) {
      assert.ok(ja !== "" && en !== "", kind);
      assert.match(ja, /<html lang="ja">/, kind);
      assert.match(en, /<html lang="en">/, kind);
      for (const html of [ja, en]) {
        assert.ok(html.includes(`<link rel="alternate" hreflang="ja" href="${jaUrl}">`), kind);
        assert.ok(html.includes(`<link rel="alternate" hreflang="en" href="${enUrl}">`), kind);
        assert.ok(html.includes(`<link rel="alternate" hreflang="x-default" href="${jaUrl}">`), kind);
        assert.equal([...html.matchAll(/rel="alternate"/g)].length, 3, kind);
      }
      assert.ok(ja.includes(`<link rel="canonical" href="${jaUrl}">`), kind);
      assert.ok(en.includes(`<link rel="canonical" href="${enUrl}">`), kind);
      // 画面の上（見出し）に、相手の言語へのリンクがある
      const toEn = kind === "top" ? "en/" : `../en/${EN_SLUG[kind as keyof typeof EN_SLUG]}/`;
      const toJa = kind === "top" ? "../" : `../../${JA_SLUG[kind as keyof typeof JA_SLUG]}/`;
      assert.ok(ja.includes(`<a class="lang" href="${toEn}" lang="en" hreflang="en">English</a>`), kind);
      assert.ok(en.includes(`<a class="lang" href="${toJa}" lang="ja" hreflang="ja">日本語</a>`), kind);
      assert.match(en, /<meta property="og:locale" content="en_US">/);
    }
  });

  it("sitemap.xml に、日本語版 8 枚と英語版 8 枚がある", () => {
    const locs = [...(site.get("sitemap.xml") ?? "").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.deepEqual(locs, siteUrls());
    assert.equal(locs.length, 16);
    for (const { jaUrl, enUrl } of pairs) assert.ok(locs.includes(jaUrl) && locs.includes(enUrl));
    assert.equal(new Set(locs).size, 16);
  });

  it("入力欄と画面の部品（name・id）は日本語版と同じ。CSP も同じで、読み込むのは同じサイトのファイルだけ", () => {
    for (const { kind, ja, en } of pairs) {
      assert.deepEqual(names(en), names(ja), kind);
      assert.deepEqual(ids(en), ids(ja), kind);
      assert.equal(CSP.exec(en)?.[1], CSP.exec(ja)?.[1], kind);
      const loaded = [...en.matchAll(/<(?:script|link|img)(?![^>]*rel="(?:canonical|alternate)")[^>]*\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]).sort();
      assert.deepEqual(loaded, kind === "top" ? ["../img/favicon.svg", "../js/web/main.js", "../style.css"] : ["../../img/favicon.svg", "../../js/web/page.js", "../../style.css"], kind);
      assert.doesNotMatch(en, /\$\{|undefined|NaN/, kind);
      const known = new Set<string>([...INPUT_STRING_FLAGS, ...INPUT_BOOLEAN_FLAGS, "has-spouse", "income-type", "work", "si-mode", "furusato-add", "budget", "spouse-salary"]);
      for (const name of names(en)) assert.ok(known.has(name), `${kind}: ${name}`);
    }
    assert.ok(existsSync(join(docs, "js/web/messages.js")));
  });

  it("説明ページの表の数字は、日本語版と同じ（同じ計算から作っている）", () => {
    const cells = (html: string): string[] =>
      [...html.matchAll(/<td>([^<]*)<\/td>/g)]
        // 収入の範囲（「476 万円〜527 万円」と「¥4.76 million to ¥5.27 million」）は書き方が違うので、金額と割合だけを比べる
        .map((m) => (m[1] ?? "").replace(/[\d,.]+ 万円〜[\d,.]+ 万円|¥[\d.]+ million to ¥[\d.]+ million/g, ""))
        .flatMap((cell) => cell.match(/\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?%/g) ?? []);
    for (const { kind, ja, en } of pairs.slice(1)) {
      assert.ok(cells(en).length >= 20, kind);
      assert.deepEqual(cells(en), cells(ja), kind);
      assert.equal([...en.matchAll(/<table/g)].length, [...ja.matchAll(/<table/g)].length, kind);
      assert.equal([...en.matchAll(/<h3>/g)].length, [...ja.matchAll(/<h3>/g)].length, kind);
    }
  });

  it("英語版に残す日本語は、書類や窓口で必要になる語だけ", () => {
    const allowed = [
      // 確定申告書の欄・書類の名前（紙の申告書で探せるように添えている。長い語から消す）
      "給与、公的年金等以外の所得に係る住民税の徴収方法", "都道府県、市区町村への寄附（特例控除対象）", "セルフメディケーション税制の明細書", "小規模企業共済等掛金払込証明書",
      "確定申告書等作成コーナー", "セルフメディケーション税制", "医療費控除の明細書", "個人型確定拠出年金", "確定申告書", "自分で納付", "予定納税", "第一表", "第二表", "医療費", "区分",
      "掛金月額変更（増額・減額）申込書", "青色申告承認申請書", "青色申告特別控除額", "青色申告特別控除", "社会保険料等の金額", "社会保険料控除",
      "小規模企業共済", "ふるさと納税", "源泉徴収票", "生命保険料控除証明書", "控除証明書", "納付通知書", "支払金額", "青色申告", "現金あり", "受領書", "住民税", "日本語版", "日本語", "480万", "600万", "税",
    ];
    for (const { kind, en } of pairs) {
      // 確定申告書の欄の対応表は、1 列目が申告書に印刷されている欄の名前（日本語）。2・3 列目の金額と説明は英語
      let rest = kind === "filing" ? en.replace(/<th scope="row">[^<]*<\/th>/g, "") : en;
      for (const word of allowed) rest = rest.split(word).join("");
      const left = rest.split("\n").filter((line) => JAPANESE.test(line));
      assert.deepEqual(left, [], kind);
    }
  });

  it("外部へのリンク: 英語の公式ページか、出典の一次情報（日本語）だけ。日本語のページには「Japanese」と添える", () => {
    const english = new Set<string>(Object.values(EN_LINKS).map(([, url]) => url));
    const japanese = new Set<string>([...getSources().map((s) => s.url), ...sourcesInsuranceGuide.map((s) => s.url), ...CROSS_CHECKS.map((x) => x.url)]);
    // トップの「やり方」に張っている公式ページ（日本語版のトップと同じもの）
    for (const m of topJa.matchAll(/href="(https?:[^"]+)"/g)) japanese.add(m[1] ?? "");
    for (const { kind, en } of pairs) {
      const body = en.replace(/<head>[\s\S]*?<\/head>/, "");
      const links = [...body.matchAll(/<a href="(https?:[^"]+)"([^>]*)>([^<]*)<\/a>/g)];
      assert.ok(links.length >= 5, kind);
      let englishCount = 0;
      for (const [, url = "", attrs = "", text = ""] of links) {
        if (url.startsWith(REPO_URL)) continue;
        if (english.has(url)) {
          assert.match(attrs, /hreflang="en"/, `${kind}: ${url}`);
          englishCount++;
        } else {
          assert.ok(japanese.has(url), `${kind}: 出典一覧にない外部リンク ${url}`);
          assert.match(attrs, /hreflang="ja"/, `${kind}: ${url}`);
          assert.match(text, /\(Japanese( only)?\)$/, `${kind}: ${text}`);
        }
      }
      // どのページにも、英語で読める公式ページへのリンクが 1 つ以上ある
      assert.ok(englishCount >= 1, kind);
    }
  });

  it("英語のトップは、英語の説明ページ 7 枚すべてへ張っている。各ページは英語のトップとほかの 6 枚へ", () => {
    for (const { slug, label } of pageLinksEn()) {
      assert.ok(topEn.includes(`<a href="${slug}/">${label}</a>`), slug);
      assert.ok(existsSync(join(docs, "en", slug, "index.html")));
    }
    for (const kind of PAGE_KINDS) {
      const html = siteEn.get(`en/${EN_SLUG[kind]}/index.html`) ?? "";
      assert.match(html, /<a id="full" href="\.\.\/">/);
      for (const other of PAGE_KINDS) if (other !== kind) assert.ok(html.includes(`href="../${EN_SLUG[other]}/"`), `${kind} → ${other}`);
      // 構造化データ: WebApplication・FAQPage・パンくず。FAQ は本文の質問と同じ
      const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1] ?? "") as Record<string, unknown>);
      assert.deepEqual(blocks.map((b) => b["@type"]), ["WebApplication", "FAQPage", "BreadcrumbList"]);
      assert.equal(blocks[0]?.["inLanguage"], "en");
      for (const item of blocks[1]?.["mainEntity"] as { name: string; acceptedAnswer: { text: string } }[]) {
        assert.ok(html.includes(`<h3>${item.name}</h3>`), item.name);
        assert.doesNotMatch(item.acceptedAnswer.text, /<|\$\{/);
      }
    }
  });

  it("概算である旨と、日本の居住者を前提にしている旨を、英語のどのページにも書いている。スターを頼む文言はない", () => {
    for (const { kind, en } of pairs) {
      assert.match(en, /<strong>This is an estimate<\/strong>/, kind);
      assert.match(en, /does not replace the judgment of a tax accountant \(zeirishi\), the tax office or your city office/, kind);
      assert.match(en, /resident of Japan for tax purposes/, kind);
      assert.doesNotMatch(en, /star (us|this|the repo)|give (us )?a star/i, kind);
    }
  });
});
