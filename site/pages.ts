/**
 * 検索語ごとの静的ページ（docs/<slug>/index.html）と sitemap.xml を組み立てる。
 *
 * - 計算例の表と本文中の金額は、すべて計算コア（calculate）から生成する。手で数字を書かない。
 * - 生成結果は docs/ にコミットし、test/site.test.ts が「コミット済みのファイル = いま生成した結果」を確かめる。
 * - 外部へのリンクは、src/data の出典一覧にある一次情報だけにする（テストで確認）。
 */
import { calculate, compareFurusatoLimit } from "../src/core/calculate.js";
import type { FurusatoComparison, SetsuzeiResult, TaxInput } from "../src/core/types.js";
import { getTaxYear } from "../src/data/index.js";

export const SITE_URL = "https://ozko00.github.io/setsuzei/";
export const REPO_URL = "https://github.com/ozko00/setsuzei";
/** ページの内容を最後に見直した日（sitemap の lastmod と本文の表示に使う） */
export const LAST_REVIEWED = "2026-11-27";

const data = getTaxYear(2026);
const MAN = 10_000;

export const yen = (n: number): string => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} 円`;
const man = (n: number): string => `${String(n / MAN).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} 万円`;

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 一次情報へのリンク（URL は src/data/2026.ts の出典と同じもの） */
const SRC = {
  kaisei: ["国税庁 令和8年度税制改正による所得税の基礎控除の引上げ等について", "https://www.nta.go.jp/users/gensen/2026kiso/index.htm"],
  rate: ["国税庁 No.2260 所得税の税率", "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm"],
  basic: ["国税庁 No.1199 基礎控除", "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm"],
  blue: ["国税庁 No.2072 青色申告特別控除", "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2072.htm"],
  blueApply: ["国税庁 No.2070 青色申告制度", "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2070.htm"],
  mutual: ["国税庁 No.1135 小規模企業共済等掛金控除", "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1135.htm"],
  furusatoNta: ["国税庁 No.1155 ふるさと納税（寄附金控除）", "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1155.htm"],
  furusatoMic: [
    "総務省 ふるさと納税ポータルサイト 税金の控除について",
    "https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/furusato/mechanism/deduction.html",
  ],
  resident: ["総務省 個人住民税", "https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_06.html"],
  localTax: ["e-Gov 地方税法", "https://laws.e-gov.go.jp/law/325AC0000000226"],
  nhi: ["e-Gov 国民健康保険法施行令", "https://laws.e-gov.go.jp/law/333CO0000000362"],
  idecoMhlw: ["厚生労働省 2026年12月からiDeCoがパワーアップ！ 制度改正の3つのポイント", "https://www.mhlw.go.jp/web_magazine/column/20261020.html"],
  idecoSite: ["iDeCo公式サイト iDeCoをはじめるまでの4つのポイント", "https://www.ideco-koushiki.jp/start/"],
  localTax2027: [
    "e-Gov 地方税法（令和9年1月1日施行の条文）",
    "https://laws.e-gov.go.jp/law/325AC0000000226/20270101_508AC0000000002",
  ],
  idecoGuide: ["iDeCo公式サイト iDeCoの特徴", "https://www.ideco-koushiki.jp/guide/"],
  idecoStructure: ["iDeCo公式サイト iDeCoの加入資格・掛金・受取方法等", "https://www.ideco-koushiki.jp/guide/structure.html"],
  idecoAnnual: [
    "国民年金基金連合会 掛金の年単位拠出について",
    "https://www.ideco-koushiki.jp/library/pdf/annual_unit_contribution_291201revision.pdf",
  ],
  idecoNotice: [
    "国民年金基金連合会 iDeCoの拠出限度額の引き上げにあわせた掛金額変更の案内",
    "https://www.ideco-koushiki.jp/library/pdf/notice202612-02.pdf",
  ],
  idecoMerit: ["iDeCo公式サイト iDeCoのメリット", "https://www.ideco-koushiki.jp/guide/good.html"],
  retirement: ["国税庁 No.1420 退職金を受け取ったとき", "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1420.htm"],
  kyosaiClaim: ["中小機構 小規模企業共済の共済金等の請求", "https://kyosai-web.smrj.go.jp/customer/skyosai/claim/index.html"],
  blueR9: ["財務省 令和8年度改正関係資料（納税環境整備関係）", "https://www.mof.go.jp/tax_policy/summary/tins/r8kaiseinoukan.pdf"],
  blueR9Nta: [
    "国税庁 令和9年分以後の 10 万円の青色申告特別控除の要件の見直し",
    "https://www.nta.go.jp/taxes/shiraberu/shinkoku/kojin_jigyo/0026004-012.pdf",
  ],
  kyosaiFee: ["中小機構 小規模企業共済の掛金", "https://kyosai-web.smrj.go.jp/customer/skyosai/installment/index.html"],
  kyosaiEntry: ["中小機構 小規模企業共済の加入資格", "https://kyosai-web.smrj.go.jp/skyosai/entry/index_02.html"],
  salaryDeduction: ["国税庁 No.1410 給与所得控除", "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm"],
  localTax202604: [
    "e-Gov 地方税法（令和8年4月1日施行の条文）",
    "https://laws.e-gov.go.jp/law/325AC0000000226/20260401_508AC0000000002",
  ],
  mofKaisetsu: [
    "財務省 令和8年度税制改正の解説 地方税法等の改正（p.931-932）",
    "https://www.mof.go.jp/tax_policy/tax_reform/outline/fy2026/explanation/PDF/p0921-0989.pdf",
  ],
  incomeTaxLaw: ["e-Gov 所得税法", "https://laws.e-gov.go.jp/law/340AC0000000033"],
  nerima: [
    "練馬区 寄附金税額控除～ふるさと納税の仕組みなど～",
    "https://www.city.nerima.tokyo.jp/kurashi/zei/jyuminzei/zeigakukojo/kifukinzeigakukojo.html",
  ],
  ikoma: ["生駒市 令和8年度から適用される個人住民税の主な改正点", "https://www.city.ikoma.lg.jp/0000038581.html"],
} as const satisfies Record<string, readonly [string, string]>;

function link(key: keyof typeof SRC, text?: string): string {
  const [title, url] = SRC[key];
  return `<a href="${esc(url)}" rel="noopener noreferrer">${esc(text ?? title)}</a>`;
}

// ---------------------------------------------------------------------------
// 計算例の前提
// ---------------------------------------------------------------------------

/** 計算例で使う所得（売上 − 経費。青色申告特別控除を引く前）の並び */
export const EXAMPLE_INCOMES = [3_000_000, 4_000_000, 5_000_000, 6_000_000, 8_000_000, 10_000_000, 15_000_000] as const;

/** 計算例の社会保険料の仮定: 所得（売上 − 経費）の 15% */
export const EXAMPLE_SOCIAL_INSURANCE_PERCENT = 15;

/**
 * 計算例の入力。フリーランス（給与なし）、青色申告特別控除 65 万円、扶養親族なし、
 * 社会保険料は所得の 15% という仮定。
 */
export function exampleInput(income: number, overrides: TaxInput = {}): TaxInput {
  return {
    businessRevenue: income,
    businessExpenses: 0,
    blueReturn: "65",
    socialInsurance: (income * EXAMPLE_SOCIAL_INSURANCE_PERCENT) / 100,
    ...overrides,
  };
}

const example = (income: number, overrides: TaxInput = {}): SetsuzeiResult => calculate(exampleInput(income, overrides));

const EXAMPLE_NOTE =
  `表の前提: 給与収入のないフリーランス、青色申告特別控除 65 万円、扶養親族なし、` +
  `社会保険料は所得（売上 − 経費）の ${EXAMPLE_SOCIAL_INSURANCE_PERCENT}% と仮定。令和8年分の所得税と、令和9年度の住民税で計算しています。` +
  `社会保険料や家族構成で結果は変わるので、自分の数字は上の計算機に入れてください。`;

function table(caption: string, head: readonly string[], body: readonly (readonly string[])[]): string {
  const th = head.map((c) => `<th scope="col">${esc(c)}</th>`).join("");
  const rows = body
    .map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join("")}</tr>`)
    .join("\n      ");
  return `<div class="table-wrap">
    <table class="examples">
      <caption>${esc(caption)}</caption>
      <thead><tr>${th}</tr></thead>
      <tbody>
      ${rows}
      </tbody>
    </table>
  </div>`;
}

// ---------------------------------------------------------------------------
// 各ページの計算例（テストからも使う）
// ---------------------------------------------------------------------------

export const IDECO_FULL = data.ideco.selfEmployedMonthlyLimit * 12;
export const KYOSAI_FULL = data.kyosai.monthlyLimit * 12;
export const IDECO_MONTHLY = [10_000, 23_000, 50_000, data.ideco.selfEmployedMonthlyLimit] as const;
export const KYOSAI_MONTHLY = [10_000, 30_000, 50_000, data.kyosai.monthlyLimit] as const;

export function furusatoRows(): { income: number; single: number; family: number; withIdeco: number }[] {
  return EXAMPLE_INCOMES.map((income) => ({
    income,
    single: example(income).measures.furusato.limit,
    family: example(income, { spouse: { income: 0 }, dependents: { general: 1 } }).measures.furusato.limit,
    withIdeco: example(income, { idecoPaid: IDECO_FULL }).measures.furusato.limit,
  }));
}

export function contributionRows(kind: "ideco" | "kyosai"): { income: number; ratePercent: number; savings: number[] }[] {
  const monthly = kind === "ideco" ? IDECO_MONTHLY : KYOSAI_MONTHLY;
  return EXAMPLE_INCOMES.map((income) => ({
    income,
    ratePercent: example(income).baseline.incomeTax.marginalRatePercent,
    savings: monthly.map((m) => {
      const r = example(income, kind === "ideco" ? { idecoAdditional: m * 12 } : { kyosaiAdditional: m * 12 });
      return r.measures[kind].saving.total;
    }),
  }));
}

export function blueRows(): { income: number; s10: number; s55: number; s65: number; diff65vs55: number }[] {
  return EXAMPLE_INCOMES.map((income) => {
    const options = example(income, { blueReturn: "none" }).measures.blueReturn.options;
    const saving = (level: string): number => options.find((o) => o.level === level)?.savingVsCurrent.total ?? 0;
    return { income, s10: saving("10"), s55: saving("55"), s65: saving("65"), diff65vs55: saving("65") - saving("55") };
  });
}

// ---------------------------------------------------------------------------
// 令和 7 年分と令和 8 年分の、ふるさと納税の上限の比較
// ---------------------------------------------------------------------------

/**
 * 同じ前提（給与収入 500 万円・独身・社会保険料 75 万円）で、令和 7 年分 → 令和 8 年分の上限を
 * 独立に計算している第三者の解説。一次情報ではないので、出典の一覧には入れず、突き合わせとして載せる。
 * どれも 2026-11-27 に閲覧し、同じ前提で 61,0xx 円 → 57,480 円（千円未満を切り捨てると 61,000 円 → 57,000 円）
 * と書いてあることを確かめた。
 */
export const CROSS_CHECKS = [
  {
    title: "いしい税理士・行政書士事務所「2026年分ふるさと納税の控除上限額はどう変わる？」",
    url: "https://ishihide-tax.com/tax/furusato-nozei-limit-2026/",
  },
  {
    title: "progo-tax.com「ふるさと納税シミュレーション｜税理士がつくった限度額計算」",
    url: "https://progo-tax.com/furusato-simulator/",
  },
  {
    title: "kmp.or.jp「ふるさと納税の上限額は2026年いくら？令和8年分の計算方法と年収・家族構成別の早見表」",
    url: "https://kmp.or.jp/furusato-nozei-jogengaku-keisan-2026/",
  },
] as const;

export const YEAR_FAMILIES = [
  { key: "single", label: "独身（配偶者控除・扶養控除なし）", input: {} },
  { key: "couple", label: "所得のない配偶者がいる", input: { spouse: { income: 0 } } },
  { key: "coupleChild", label: "所得のない配偶者と高校生 1 人", input: { spouse: { income: 0 }, dependents: { general: 1 } } },
] as const satisfies readonly { key: string; label: string; input: TaxInput }[];

/** 比較表に載せる給与収入 */
export const YEAR_SALARIES = [
  2_000_000, 3_000_000, 4_000_000, 4_500_000, 5_000_000, 5_500_000, 6_000_000, 6_500_000, 7_000_000, 8_000_000, 10_000_000,
  12_000_000, 15_000_000, 20_000_000,
] as const;

/** 比較表・走査の前提: 社会保険料は給与収入（フリーランスは所得）の 15% */
export function yearSalaryInput(salary: number, family: TaxInput = {}): TaxInput {
  return { salaryRevenue: salary, socialInsurance: (salary * EXAMPLE_SOCIAL_INSURANCE_PERCENT) / 100, ...family };
}

export function yearSalaryRows(): { salary: number; cells: FurusatoComparison[] }[] {
  return YEAR_SALARIES.map((salary) => ({
    salary,
    cells: YEAR_FAMILIES.map((f) => compareFurusatoLimit(yearSalaryInput(salary, f.input))),
  }));
}

export function yearFreelanceRows(): { income: number; cell: FurusatoComparison }[] {
  return EXAMPLE_INCOMES.map((income) => ({ income, cell: compareFurusatoLimit(exampleInput(income)) }));
}

/** 走査する範囲: 給与収入（フリーランスは所得）100 万円〜 2,500 万円を 1 万円きざみ */
export const YEAR_SCAN = { from: 1_000_000, to: 25_000_000, step: 10_000 } as const;

export interface YearScan {
  readonly total: number;
  readonly lower: number;
  readonly same: number;
  readonly higher: number;
  /** 上限が下がる範囲（収入の下端〜上端）と、その中で最も大きい下がり幅 */
  readonly ranges: readonly { from: number; to: number; maxDrop: number }[];
}

/** 1 万円きざみで走査して、上限が下がる・変わらない・上がる収入を数える。 */
export function scanYear(toInput: (amount: number) => TaxInput): YearScan {
  const ranges: { from: number; to: number; maxDrop: number }[] = [];
  let open: { from: number; to: number; maxDrop: number } | null = null;
  let total = 0;
  let lower = 0;
  let higher = 0;
  for (let amount: number = YEAR_SCAN.from; amount <= YEAR_SCAN.to; amount += YEAR_SCAN.step) {
    const { difference } = compareFurusatoLimit(toInput(amount));
    total++;
    if (difference > 0) higher++;
    if (difference < 0) {
      lower++;
      if (!open) {
        open = { from: amount, to: amount, maxDrop: 0 };
        ranges.push(open);
      }
      open.to = amount;
      open.maxDrop = Math.max(open.maxDrop, -difference);
    } else open = null;
  }
  return { total, lower, same: total - lower - higher, higher, ranges };
}

/** 比較表のセル: 「61,000 円 → 57,000 円（−4,000 円）」か「77,000 円（変わらず）」 */
export function yearCell(c: FurusatoComparison): string {
  const limit = (n: number): string => (n > 0 ? yen(n) : "目安なし");
  if (c.difference === 0) return `${limit(c.current.limit)}（変わらず）`;
  const sign = c.difference < 0 ? "−" : "+";
  return `${limit(c.previous.limit)} → ${limit(c.current.limit)}（${sign}${yen(Math.abs(c.difference))}）`;
}

const scanRangeText = (scan: YearScan): string =>
  scan.ranges.map((r) => `${man(r.from)}〜${man(r.to)}（最大 ${yen(r.maxDrop)}）`).join("、");

// ---------------------------------------------------------------------------
// ページの定義
// ---------------------------------------------------------------------------

export type PageKind = "furusato" | "ideco" | "kyosai" | "blue" | "furusato-year";

interface Faq {
  readonly q: string;
  /** HTML（リンクを含められる） */
  readonly a: string;
}

interface PageDef {
  readonly slug: string;
  readonly kind: PageKind;
  /** 検索語そのもの。題名・h1・説明文の頭に置く */
  readonly keyword: string;
  readonly title: string;
  readonly h1: string;
  readonly description: string;
  readonly lead: string;
  /** 計算機に足す入力欄（共通の 4 欄のあとに並べる） */
  readonly extraFields: string;
  readonly formula: string;
  readonly examples: string;
  readonly faqs: readonly Faq[];
  readonly sources: readonly (keyof typeof SRC)[];
  /** 計算機の入力欄をページ専用のものにする場合の HTML（fieldset の並び）。なければ共通の欄 + extraFields */
  readonly form?: string;
  /** 「計算例」の節の見出しを変える場合 */
  readonly examplesTitle?: string;
}

const field = (name: string, label: string, sub: string, placeholder = "", value = ""): string =>
  `<label>${esc(label)}${sub ? `<span class="sub">${esc(sub)}</span>` : ""}
      <input name="${name}" inputmode="numeric"${placeholder ? ` placeholder="${esc(placeholder)}"` : ""}${value ? ` value="${esc(value)}"` : ""}></label>`;

function buildPages(): PageDef[] {
  const idecoLimitMonthly = data.ideco.selfEmployedMonthlyLimit;
  const kyosaiLimitMonthly = data.kyosai.monthlyLimit;

  // 本文で引く例（所得 500 万円）
  const e500 = example(5_000_000);
  const e500Ideco = example(5_000_000, { idecoPaid: IDECO_FULL });
  const f = furusatoRows();
  const ideco = contributionRows("ideco");
  const kyosai = contributionRows("kyosai");
  const blue = blueRows();
  const blue500 = blue.find((r) => r.income === 5_000_000);
  const ideco500 = ideco.find((r) => r.income === 5_000_000);
  const kyosai500 = kyosai.find((r) => r.income === 5_000_000);
  if (!blue500 || !ideco500 || !kyosai500) throw new Error("計算例に所得 500 万円の行がありません");
  const idecoFull500 = ideco500.savings[ideco500.savings.length - 1] ?? 0;
  const kyosaiFull500 = kyosai500.savings[kyosai500.savings.length - 1] ?? 0;
  // 所得 0（課税所得なし）の例
  const lowIncome = example(1_200_000, { idecoAdditional: IDECO_FULL });

  return [
    {
      slug: "furusato-nozei-freelance",
      kind: "furusato",
      keyword: "ふるさと納税 上限 計算 フリーランス",
      title: "ふるさと納税の上限を計算（フリーランス・個人事業主）令和8年分 ｜ setsuzei",
      h1: "ふるさと納税の上限額を計算する（フリーランス・個人事業主）",
      description:
        "ふるさと納税の上限額を、フリーランス・個人事業主の売上と経費から計算します。令和8年分の基礎控除の引上げを反映。iDeCo や小規模企業共済で上限がいくら下がるかもわかります。入力は送信しません。",
      lead: "会社員向けの早見表は「年収」で引きますが、フリーランスの上限は所得（売上 − 経費）と所得控除で決まります。売上と経費を入れると、自己負担がおおむね 2,000 円で済む寄附額の上限の目安を出します。",
      extraFields: [
        field("furusato-paid", "ふるさと納税の寄附済み額", "今年すでに寄附した合計", "例: 3万"),
        field("ideco-paid", "iDeCo の掛金", "年末までの拠出見込み。上限が下がります", "例: 27.6万"),
        field("kyosai-paid", "小規模企業共済の掛金", "年末までの支払見込み。上限が下がります"),
      ].join("\n    "),
      formula: `<p>上限の目安は、次の式で求めています。</p>
  <p class="formula">上限の目安 = 住民税の所得割額 × 20% ÷（90% − 所得税率 × 1.021）+ 2,000 円</p>
  <ul>
    <li>ふるさと納税の控除は、所得税の寄附金控除、住民税の基本分（10%）、住民税の特例分の 3 つでできています。特例分は「住民税の所得割額の 20%」が上限で、ここに達する寄附額が「自己負担 2,000 円で済む上限」です（${link("furusatoMic")}、${link("localTax", "地方税法 第314条の7・附則第5条の6")}）。</li>
    <li>式の「所得税率」は 5%〜45% の 7 段階で、課税所得で決まります（${link("rate")}）。1.021 は復興特別所得税の分です。</li>
    <li>住民税の所得割額は、所得から所得控除を引いた額の 10% から調整控除を引いた額です（${link("resident")}）。</li>
    <li>ふるさと納税で減る税額は、寄附した額から自己負担 2,000 円を引いた額までです（${link("furusatoMic")}）。寄附と同じだけお金が出ていくので、手元のお金は増えません。得になるのは返礼品の分です。</li>
    <li>所得が少なく、住民税の所得割がかからない場合（合計所得金額が「35 万円 ×（同一生計配偶者 + 扶養親族の数 + 1）+ 10 万円」以下。家族がいれば + 32 万円。${link("localTax2027", "地方税法 附則第3条の3")}）は、上限の目安を出しません。この限度額を少し超える範囲でも所得割が減額されるので、同じ扱いにしています。16 歳未満の子の人数は<a href="../">全部まとめて計算するページ</a>で入力できます。</li>
    <li>この計算機は目安を 1,000 円未満切り捨てで出します。確定申告をする前提です。フリーランスは確定申告をするので、ワンストップ特例は使えません（特例の対象は「確定申告の不要な給与所得者等」です。${link("furusatoMic", "総務省の説明")}）。</li>
  </ul>`,
      examples:
        table(
          "所得別のふるさと納税の上限の目安（令和8年分）",
          ["所得（売上 − 経費）", "独身", "配偶者（所得なし）と高校生 1 人", `独身で iDeCo を年 ${man(IDECO_FULL)} 拠出`],
          f.map((r) => [man(r.income), yen(r.single), yen(r.family), yen(r.withIdeco)]),
        ) + `\n  <p class="note">${esc(EXAMPLE_NOTE)}</p>`,
      faqs: [
        {
          q: "ふるさと納税をすると、手元に残るお金は増えますか？",
          a: `増えません。ふるさと納税で減る税額は、寄附した額から自己負担 2,000 円を引いた額までです（${link("furusatoMic")}）。先に寄附としてお金が出ていき、あとからほぼ同じ額だけ税が減るので、税の前払いに近い仕組みです。得になるのは受け取る返礼品の分で、上限を超えて寄附した分は自己負担が増えます。`,
        },
        {
          q: "フリーランスの上限は、会社員の早見表で調べられますか？",
          a: `調べられません。会社員向けの早見表は、給与収入から給与所得控除を引き、社会保険料を収入の一定割合と仮定して作られています。フリーランスは売上から経費と青色申告特別控除を引いた所得で決まるので、同じ「年収」でも上限は別の額になります。上の計算機に売上と経費を入れてください。`,
        },
        {
          q: "iDeCo や小規模企業共済を増やすと、ふるさと納税の上限は変わりますか？",
          a: `下がります。掛金は全額が所得控除になり、住民税の所得割額が減るためです。たとえば所得 500 万円（上の表の前提）で独身の場合、上限の目安は ${yen(e500.measures.furusato.limit)} ですが、iDeCo を年 ${man(IDECO_FULL)} 拠出すると ${yen(e500Ideco.measures.furusato.limit)} になります。先に掛金を決めてから、寄附額を決めるのが安全です。`,
        },
        {
          q: "年末まで売上が読めません。いくらまでなら安全ですか？",
          a: `上限は所得で動くので、所得が見込みより下がると上限も下がり、超えた分は自己負担になります。上の表で、見込みより 1 段低い所得の行を見ると、下振れしたときの上限の見当が付きます。計算機に低めの売上を入れて確かめてから寄附するのが確実です。`,
        },
        {
          q: "令和8年分は、去年と同じ所得でも上限が変わりますか？",
          a: `変わることがあります。令和8年分から所得税の基礎控除が引き上げられ（合計所得金額に応じて最大 104 万円。${link("basic")}、${link("kaisei", "国税庁の改正の案内")}）、課税所得が減って所得税率の段階が下がる人がいます。所得税率が下がると式の分母が大きくなり、上限の目安は少し下がります。所得税そのものは基礎控除の分だけ減っています。`,
        },
      ],
      sources: ["furusatoMic", "furusatoNta", "localTax", "localTax2027", "rate", "basic", "kaisei", "resident"],
    },
    {
      slug: "ideco-kojin-jigyonushi",
      kind: "ideco",
      keyword: "iDeCo 節税 シミュレーション 個人事業主",
      title: "iDeCo の節税額シミュレーション（個人事業主・フリーランス）令和8年分 ｜ setsuzei",
      h1: "iDeCo の節税額をシミュレーションする（個人事業主・フリーランス）",
      description:
        "iDeCo の節税額を、個人事業主・フリーランスの売上と経費からシミュレーションします。所得税と住民税の両方を、令和8年分の税率と基礎控除で計算。年末までの残り枠でいくら減るかがわかります。入力は送信しません。",
      lead: `個人事業主（国民年金の第1号被保険者）の iDeCo の掛金は、月額 ${yen(idecoLimitMonthly)}（年 ${man(IDECO_FULL)}）が上限です。掛金は全額が所得控除になるので、売上と経費を入れると、所得税と住民税がいくら減るかを出します。`,
      extraFields: [
        field("ideco-paid", "iDeCo の掛金（支払済み・支払予定）", "年末までの拠出見込み", "例: 27.6万"),
        field("ideco-add", "年内に追加で拠出できる額", "空欄なら年間上限までの残り枠（税額が減らなくなる額まで）。年内に増やせるかは加入先に確認"),
      ].join("\n    "),
      formula: `<p>減る税額は、掛金を入れる前と入れた後の税額をそれぞれ計算し、その差で出しています。</p>
  <p class="formula">減る税額 ≒ 掛金 ×（所得税率 × 1.021 + 住民税 10%）</p>
  <ul>
    <li>iDeCo の掛金は、全額が小規模企業共済等掛金控除として所得から引かれます（${link("mutual")}）。</li>
    <li>所得税率は課税所得に応じて 5%〜45% です（${link("rate")}）。掛金を引いた結果、税率の段階が下がる場合は、上の式より少し小さくなります。計算機はその分も含めて計算します。</li>
    <li>住民税の所得割は一律 10% です（${link("resident")}）。住民税が減るのは翌年度（令和9年度）です。</li>
    <li>上限は、国民年金基金の掛金や付加保険料と合算した額です（${link("idecoSite")}）。</li>
    <li>減る税額は、掛金を支払うことと引き換えです。iDeCo の資産は原則 60 歳になるまで引き出せず、口座管理などの手数料がかかります（金額は金融機関によって異なります。${link("idecoGuide")}）。</li>
    <li>受け取るときは課税の対象になります。一時金は退職所得（${link("retirement")}）、年金は公的年金等として扱われ、それぞれ退職所得控除・公的年金等控除があります（${link("idecoMerit")}）。この計算機は、受取時の税額は計算しません。</li>
    <li>年末が近いと、掛金を増やしても今年の分に間に合わないことが多くあります。掛金額の変更は 1 年（12 月分〜翌年 11 月分）に 1 回だけで（${link("idecoStructure")}）、まとめて拠出するには事前に年単位拠出の届出が必要です（${link("idecoAnnual")}）。</li>
    <li>掛金を増やしても、所得税と住民税の所得割が 0 円になったあとは税額が減りません。計算機は、税額が減らなくなる額までで追加額を止めます。</li>
  </ul>`,
      examples:
        table(
          "所得・掛金別の iDeCo の節税額（年額。所得税 + 住民税。令和8年分）",
          ["所得（売上 − 経費）", "所得税率", ...IDECO_MONTHLY.map((m) => `月 ${yen(m)}`)],
          ideco.map((r) => [man(r.income), `${r.ratePercent}%`, ...r.savings.map(yen)]),
        ) + `\n  <p class="note">${esc(EXAMPLE_NOTE)} 掛金は 12 か月分を拠出した場合の額です。</p>`,
      faqs: [
        {
          q: "個人事業主の iDeCo は、いくら節税になりますか？",
          a: `所得と掛金で決まります。上の表の前提で所得 500 万円の場合、上限の月 ${yen(idecoLimitMonthly)}（年 ${man(IDECO_FULL)}）を拠出すると、所得税と住民税を合わせて年 ${yen(idecoFull500)} 減ります。iDeCo の資産は基本的に 60 歳にならないと引き出せず（${link("idecoSite")}）、口座の手数料がかかり、受け取るときには課税の対象になります（${link("idecoGuide")}、${link("idecoMerit")}）。手元の資金と相談して決めてください。`,
        },
        {
          q: "年末に iDeCo の掛金を増やして、今年の節税額を増やせますか？",
          a: `間に合わないことが多いです。掛金額を変更できるのは 1 年（12 月分〜翌年 11 月分の掛金）に 1 回だけです（${link("idecoStructure")}）。残りの枠をまとめて拠出するには、事前に年単位拠出（月別指定）の届出が必要で、届出は申請の翌月分（翌々月の引落し）からの反映です。過ぎた月の分をあとから納めることもできません（${link("idecoAnnual")}）。今年の控除になるのは 12 月の引落し分（11 月分の掛金）までなので、計算機の「年内に追加で拠出できる額」には、加入先（運営管理機関）に確認して実際に増やせる額を入れてください。`,
        },
        {
          q: "2026 年 12 月に上限が上がると聞きました。令和8年分の節税額は増えますか？",
          a: `増えません。第1号被保険者の上限は 2026 年 12 月から月額 75,000 円に上がりますが（${link("idecoMhlw", "厚生労働省の案内")}）、12 月分の掛金が口座から引き落とされるのは翌年 1 月です（${link("idecoSite")}。国民年金基金連合会も「2026年12月分（2027年1月引き落とし分）から」と案内しています。${link("idecoNotice")}）。その年に納付した掛金がその年の控除になるので、令和8年分（2026 年 1〜12 月の納付）は月額 ${yen(idecoLimitMonthly)} のままで計算しています。`,
        },
        {
          q: "iDeCo で国民健康保険料は下がりますか？",
          a: `下がりません。国民健康保険料の所得割は「総所得金額等 − 基礎控除」をもとに計算され、iDeCo などの所得控除は引かれないためです（${link("nhi", "国民健康保険法施行令 第29条の7")}、${link("localTax", "地方税法 第703条の4")}）。減るのは所得税と住民税です。`,
        },
        {
          q: "所得が少ない年も、iDeCo で税金は減りますか？",
          a: `課税所得がなければ減りません。たとえば所得 120 万円（上の表と同じ前提）では、所得税の課税所得は ${yen(lowIncome.baseline.incomeTax.taxableIncome)} で、上限まで拠出しても減る税額は ${yen(lowIncome.measures.ideco.saving.total)} です。所得控除は、引く前の税額までしか効きません。`,
        },
      ],
      sources: ["mutual", "idecoMhlw", "idecoSite", "idecoGuide", "idecoStructure", "idecoAnnual", "idecoNotice", "idecoMerit", "retirement", "rate", "resident", "nhi", "localTax"],
    },
    {
      slug: "shokibo-kyosai-setsuzei",
      kind: "kyosai",
      keyword: "小規模企業共済 節税額 シミュレーション",
      title: "小規模企業共済の節税額シミュレーション（売上と経費から計算）令和8年分 ｜ setsuzei",
      h1: "小規模企業共済の節税額をシミュレーションする",
      description:
        "小規模企業共済の節税額を、売上と経費からシミュレーションします。掛金（月 1,000〜70,000 円）で所得税と住民税がいくら減るかを、令和8年分の税率と基礎控除で計算。年末までの残り枠にも対応。入力は送信しません。",
      lead: `小規模企業共済の掛金は月額 1,000 円〜${yen(kyosaiLimitMonthly)}で、全額が所得控除になります。中小機構の節税額の表は「課税される所得金額」で引きますが、ここでは売上と経費から課税所得を計算して、減る税額を出します。`,
      extraFields: [
        field("kyosai-paid", "小規模企業共済の掛金（支払済み・支払予定）", "年末までの支払見込み"),
        field("kyosai-add", "追加で支払う額", "空欄なら年間上限までの残り枠（税額が減らなくなる額まで）"),
        field("ideco-paid", "iDeCo の掛金", "同じ控除の枠で引かれます。あれば入力", "例: 27.6万"),
      ].join("\n    "),
      formula: `<p>減る税額は、掛金を入れる前と入れた後の税額をそれぞれ計算し、その差で出しています。</p>
  <p class="formula">減る税額 ≒ 掛金 ×（所得税率 × 1.021 + 住民税 10%）</p>
  <ul>
    <li>掛金は月額 1,000 円〜${yen(kyosaiLimitMonthly)}（500 円単位）で、全額が小規模企業共済等掛金控除になります。1 年以内の前納掛金も控除できます（${link("kyosaiFee")}、${link("mutual")}）。</li>
    <li>所得税率は課税所得に応じて 5%〜45%（${link("rate")}）、住民税の所得割は一律 10% です（${link("resident")}）。</li>
    <li>中小機構も、課税される所得金額と掛金月額ごとの節税額の表を公開しています（${link("kyosaiFee")}）。この計算機の計算コアは、その表の値と一致することをテストで確かめています（<a href="${REPO_URL}/blob/main/test/estimate.test.ts" rel="noopener">テスト</a>）。下の表は、令和8年分の基礎控除の引上げを反映し、売上 − 経費の所得から引けるようにしたものです。</li>
    <li>加入できるのは、小規模企業の個人事業主や共同経営者、会社等の役員です。会社に雇われている人（給与所得者）が副業で事業をしていても加入できません（${link("kyosaiEntry")}）。この計算機は加入資格の判定はしません。</li>
    <li>減る税額は、掛金を支払うことと引き換えです。掛金は事業をやめるときなどに共済金として受け取るもので、受け取るときに課税されます（一括は退職所得、分割は公的年金等の雑所得、65 歳未満の任意解約は一時所得）。任意解約は、掛金納付月数が 240 か月（20 年）未満だと受取額が掛金の合計を下回り、12 か月未満だと掛け捨てになります（${link("kyosaiClaim")}）。この計算機は、受取時の税額は計算しません。</li>
    <li>掛金を増やしても、所得税と住民税の所得割が 0 円になったあとは税額が減りません。計算機は、税額が減らなくなる額までで追加額を止めます。</li>
  </ul>`,
      examples:
        table(
          "所得・掛金別の小規模企業共済の節税額（年額。所得税 + 住民税。令和8年分）",
          ["所得（売上 − 経費）", "所得税率", ...KYOSAI_MONTHLY.map((m) => `月 ${yen(m)}`)],
          kyosai.map((r) => [man(r.income), `${r.ratePercent}%`, ...r.savings.map(yen)]),
        ) + `\n  <p class="note">${esc(EXAMPLE_NOTE)} 掛金は 12 か月分を支払った場合の額です。</p>`,
      faqs: [
        {
          q: "小規模企業共済は、いくら節税になりますか？",
          a: `所得と掛金で決まります。上の表の前提で所得 500 万円の場合、上限の月 ${yen(kyosaiLimitMonthly)}（年 ${man(KYOSAI_FULL)}）を支払うと、所得税と住民税を合わせて年 ${yen(kyosaiFull500)} 減ります。掛金は将来、共済金として受け取るもので、受取時には別に課税があります（この計算機では扱いません）。`,
        },
        {
          q: "小規模企業共済は、途中でやめると損をしますか？",
          a: `任意解約の場合、掛金納付月数が 240 か月（20 年）未満だと、受け取る解約手当金は掛金の合計を下回ります。12 か月未満では解約手当金を受け取れず、掛け捨てになります。受け取るときは課税もあり、65 歳未満の任意解約は一時所得、事業の廃業などで一括で受け取る共済金は退職所得、分割で受け取る場合は公的年金等の雑所得として扱われます（${link("kyosaiClaim")}）。節税額だけでなく、資金を長く預ける前提で決めてください。`,
        },
        {
          q: "iDeCo と小規模企業共済は、両方使えますか？",
          a: `両方とも小規模企業共済等掛金控除として、合わせて所得から引けます（${link("mutual")}）。ただし、両方を上限まで入れると課税所得が大きく減り、所得税率の段階が下がって、1 つずつ計算した節税額の合計よりは小さくなります。<a href="../">全部まとめて計算するページ</a>で、まとめて実行した場合の額を出せます。`,
        },
        {
          q: "年末に掛金を増やしても、今年の控除になりますか？",
          a: `その年に支払った掛金がその年の控除になります。1 年以内の前納掛金も、支払った年に控除できます（${link("mutual")}、${link("kyosaiFee")}）。増額や前納の手続きと締切は、中小機構か取扱いの金融機関で確認してください。`,
        },
        {
          q: "小規模企業共済で国民健康保険料は下がりますか？",
          a: `下がりません。国民健康保険料の所得割は「総所得金額等 − 基礎控除」をもとに計算され、小規模企業共済等掛金控除は引かれないためです（${link("nhi", "国民健康保険法施行令 第29条の7")}、${link("localTax", "地方税法 第703条の4")}）。`,
        },
      ],
      sources: ["kyosaiFee", "kyosaiEntry", "kyosaiClaim", "mutual", "rate", "resident", "nhi", "localTax"],
    },
    {
      slug: "aoiro-shinkoku-65-55-10",
      kind: "blue",
      keyword: "青色申告特別控除 65万 55万 10万 違い",
      title: "青色申告特別控除 65万・55万・10万の違いはいくら？ 税額の差を計算（令和8年分）｜ setsuzei",
      h1: "青色申告特別控除 65万・55万・10万の違いを税額で計算する",
      description:
        "青色申告特別控除の 65万・55万・10万・白色申告の違いを、所得税と住民税の額で計算します。売上と経費を入れると、令和8年分の税率と基礎控除で区分ごとの税額を出します。国民健康保険料への影響の目安も出せます。入力は送信しません。",
      lead: "65 万円と 55 万円の差は「10 万円 × 税率」ですが、税率は所得で変わり、控除で税率の段階が変わることもあります。売上と経費を入れると、白色申告・10 万円・55 万円・65 万円それぞれの税額と、その差を出します。",
      extraFields: [
        field("nhi-rate", "国民健康保険料の所得割率（%）", "任意。自治体の料率の合計を入れると、国保料の差の目安も出します", "例: 11.5"),
      ].join("\n    "),
      formula: `<p>4 つの区分それぞれで所得税と住民税を計算し、その差を出しています。</p>
  <p class="formula">税額の差 ≒ 控除額の差 ×（所得税率 × 1.021 + 住民税 10%）</p>
  <ul>
    <li>青色申告特別控除は、要件に応じて 55 万円（一定の要件を満たす場合は 65 万円）または 10 万円を所得から引く制度です（${link("blue")}）。</li>
    <li>55 万円は、事業所得などを複式簿記で記帳し、貸借対照表と損益計算書を付けて期限内に申告することが要件です。65 万円は、それに加えて e-Tax での申告か、優良な電子帳簿の保存が必要です。どちらにも当たらない青色申告者は 10 万円です（${link("blue")}）。</li>
    <li>控除は事業所得などの黒字が限度です。所得が控除額より少ない場合は、所得の額までしか引けません（${link("blue")}）。</li>
    <li>所得税率は課税所得に応じて 5%〜45%（${link("rate")}）、住民税の所得割は一律 10% です（${link("resident")}）。</li>
    <li>このページは令和8年分の計算です。令和9年分からは制度が見直され、複式簿記 + e-Tax で 65 万円、さらに一定の電子帳簿（請求書データ等との自動連携や訂正削除履歴の記録など）で 75 万円、複式簿記でも書面で申告すると 10 万円になります。簡易簿記の 10 万円は、前々年の事業所得などの収入が 1,000 万円以下の人などに限られます（${link("blueR9")}、${link("blueR9Nta")}）。</li>
    <li>この計算機は税額の差だけを出します。その区分の要件を満たせるかどうかは判定しません。</li>
  </ul>`,
      examples:
        table(
          "所得別の青色申告特別控除による税額の差（年額。所得税 + 住民税。令和8年分）",
          ["所得（売上 − 経費）", "白色 → 10 万円", "白色 → 55 万円", "白色 → 65 万円", "55 万円 → 65 万円"],
          blue.map((r) => [man(r.income), yen(r.s10), yen(r.s55), yen(r.s65), yen(r.diff65vs55)]),
        ) +
        `\n  <p class="note">表の前提: 給与収入のないフリーランス、扶養親族なし、社会保険料は所得（売上 − 経費）の ${EXAMPLE_SOCIAL_INSURANCE_PERCENT}% と仮定。令和8年分の所得税と、令和9年度の住民税で計算しています。「白色 → 65 万円」は、白色申告の場合と比べて減る税額です。</p>`,
      faqs: [
        {
          q: "65 万円と 55 万円の違いは、税額でいくらですか？",
          a: `控除額の差は 10 万円で、税額の差は所得によって変わります。上の表の前提で所得 500 万円の場合、55 万円から 65 万円にすると、所得税と住民税を合わせて年 ${yen(blue500.diff65vs55)} 減ります。所得税率が高い人ほど差は大きくなります。`,
        },
        {
          q: "白色申告から青色申告（65 万円）にすると、いくら減りますか？",
          a: `上の表の前提で所得 500 万円の場合、年 ${yen(blue500.s65)} 減ります（10 万円の控除なら ${yen(blue500.s10)}、55 万円なら ${yen(blue500.s55)}）。ただし、青色申告をするには、青色申告をしようとする年の 3 月 15 日まで（その年の 1 月 16 日以後に開業した場合は、開業から 2 か月以内）に承認申請書を税務署へ出しておく必要があります（${link("blueApply")}）。年末になってから、その年の分を白色から青色に変えることはできません。`,
        },
        {
          q: "青色申告特別控除で、国民健康保険料も下がりますか？",
          a: `下がります。国民健康保険料の所得割は「総所得金額等 − 基礎控除」をもとに計算され、青色申告特別控除は総所得金額等を減らすためです（${link("nhi", "国民健康保険法施行令 第29条の7")}、${link("localTax", "地方税法 第703条の4")}）。iDeCo やふるさと納税と違う点です。料率は自治体ごとに違うので、計算機に所得割率を入れると差の目安を出します（賦課限度額には当てていません）。`,
        },
        {
          q: "令和9年分から、青色申告特別控除は変わりますか？",
          a: `変わります。令和9年分以後の所得税から、複式簿記で記帳して e-Tax で申告する場合が 65 万円、それに加えて一定の要件を満たす電子帳簿を作成・保存している場合が 75 万円になります。複式簿記でも書面で申告する場合は 10 万円です。簡易簿記による 10 万円の控除は、前々年の事業所得などの収入が 1,000 万円以下の人などに限られます（${link("blueR9")}、${link("blueR9Nta")}）。このページの計算は令和8年分（55 万円・65 万円の区分）のものです。`,
        },
        {
          q: "所得が少ない年は、65 万円を全部引けますか？",
          a: `引けるのは事業所得などの黒字の額までです。たとえば売上 − 経費が 40 万円なら、65 万円の要件を満たしていても引けるのは 40 万円です（${link("blue")}）。計算機はこの上限も反映します。`,
        },
      ],
      sources: ["blue", "blueApply", "blueR9", "blueR9Nta", "rate", "resident", "nhi", "localTax"],
    },
    furusatoYearPage(),
  ];
}

const pct = (per100k: number): string => `${per100k / 1_000}%`;

/** 上限まで（または指定した額を）寄附したときの自己負担: 寄附額 − 減る税額（令和 8 年分の計算） */
export function yearOutOfPocket(input: TaxInput, donation: number): number {
  const before = calculate(input).baseline.totalTax;
  const after = calculate({ ...input, furusatoPaid: donation }).baseline.totalTax;
  return donation - (before - after);
}

function furusatoYearPage(): PageDef {
  const input500 = yearSalaryInput(5_000_000);
  const c500 = compareFurusatoLimit(input500);
  const c600 = compareFurusatoLimit(yearSalaryInput(6_000_000));
  const c200 = compareFurusatoLimit(yearSalaryInput(2_000_000));
  const { previous: p, current: c } = c500;
  const burdenAtNew = yearOutOfPocket(input500, c.limit);
  const burdenAtOld = yearOutOfPocket(input500, p.limit);
  const salaryRows = yearSalaryRows();
  const freelanceRows = yearFreelanceRows();
  const scans = YEAR_FAMILIES.map((f) => ({ label: f.label, scan: scanYear((amount) => yearSalaryInput(amount, f.input)) }));
  const freelanceScan = scanYear((amount) => exampleInput(amount));
  const single = scans[0]?.scan;
  if (!single) throw new Error("走査の結果がありません");
  if ([...scans.map((x) => x.scan), freelanceScan].some((x) => x.higher > 0)) {
    throw new Error("上限が上がる収入があります。本文の「上がる人はいません」を直してください");
  }
  const scanNote = `給与収入（フリーランスは所得）${man(YEAR_SCAN.from)}〜${man(YEAR_SCAN.to)}を ${man(YEAR_SCAN.step)}きざみで計算した ${String(single.total).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} 通りの内訳です。社会保険料は収入（所得）の ${EXAMPLE_SOCIAL_INSURANCE_PERCENT}% と仮定しています。`;
  const count = (n: number): string => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} 通り`;

  return {
    slug: "furusato-nozei-jogen-reiwa8",
    kind: "furusato-year",
    keyword: "ふるさと納税 上限 下がる 令和8年 基礎控除",
    title: "ふるさと納税の上限は令和8年分で下がる？ 令和7年分と比べる計算機（基礎控除の引上げ） ｜ setsuzei",
    h1: "ふるさと納税の上限は令和8年分で下がる？ 基礎控除の引上げの影響を令和7年分と比べる",
    description:
      "ふるさと納税の上限の目安を、令和7年分と令和8年分（2026年の寄附）で比べます。基礎控除の引上げで上限が下がるのは一部の所得帯だけで、多くの人は変わりません。年収別の比較表と、条文にもとづく理由を載せています。入力は送信しません。",
    lead: `令和8年分（2026年中の寄附）は、所得税の基礎控除の引上げにより、一部の所得帯で上限の目安が令和7年分より下がります。多くの人は変わらず、同じ収入で上がる人はいません。たとえば給与収入 500 万円・独身は ${yen(p.limit)} → ${yen(c.limit)}、600 万円・独身は ${yen(c600.current.limit)} のままです（社会保険料 ${EXAMPLE_SOCIAL_INSURANCE_PERCENT}% の前提）。収入を入れると、両方の年分の上限と、変わる理由を出します。`,
    extraFields: "",
    form: `<fieldset>
    <legend>収入</legend>
    ${field("salary", "給与収入", "源泉徴収票の「支払金額」の年間見込み", "例: 500万", "500万")}
    ${field("social-insurance", "社会保険料", "源泉徴収票の「社会保険料等の金額」。国民健康保険・国民年金も含む年額", "例: 75万", "75万")}
    ${field("revenue", "フリーランス・副業の売上", "ない場合は空欄", "例: 800万")}
    ${field("expenses", "その必要経費", "", "例: 150万")}
    <label>青色申告特別控除
      <select name="blue">
        <option value="none" selected>なし（給与のみ・白色申告）</option>
        <option value="10">青色 10万円</option>
        <option value="55">青色 55万円</option>
        <option value="65">青色 65万円</option>
      </select></label>
  </fieldset>
  <fieldset>
    <legend>家族と控除</legend>
    <label>配偶者<span class="sub">配偶者に所得がある場合の比較には対応していません</span>
      <select name="spouse-income">
        <option value="" selected>配偶者控除を受けない（独身・共働きなど）</option>
        <option value="0">所得のない配偶者がいる</option>
      </select></label>
    ${field("dependents", "扶養親族（16〜18 歳・23〜69 歳）の人数", "", "0")}
    ${field("dependents-specific", "扶養親族（19〜22 歳）の人数", "", "0")}
    ${field("ideco-paid", "iDeCo の掛金", "年末までの拠出見込み", "例: 27.6万")}
    ${field("kyosai-paid", "小規模企業共済の掛金", "年末までの支払見込み")}
    ${field("other-deductions", "その他の所得控除の合計", "生命保険料控除・医療費控除など")}
  </fieldset>
  <p class="hint">iDeCo や小規模企業共済を増やした場合の税額なども見るときは、<a id="full" href="../">すべての項目を入れられる計算ページ</a>を使ってください。</p>`,
    formula: `<p>結論から書きます。令和8年分で上限の目安が下がるのは、次のどちらかに当てはまる人だけです。それ以外の人は、同じ収入・同じ控除なら令和7年分と同じです。同じ収入・同じ控除で上がる場合はありません（下の表の走査でも 0 通り）。</p>
  <ul>
    <li><strong>特例分の割合の区分の境目（0 円・195 万円・330 万円・695 万円・900 万円・1,800 万円）のすぐ上にいた人</strong>（例: 給与収入 ${scanRangeText({ ...single, ranges: single.ranges.filter((r) => r.from >= 2_200_000) })}。独身・社会保険料 ${EXAMPLE_SOCIAL_INSURANCE_PERCENT}% の前提）。</li>
    <li><strong>給与収入が 220 万円未満の人</strong>。給与所得控除の最低額が 65 万円から 74 万円に上がり（${link("salaryDeduction")}）、住民税の所得割額が減るためです（目安は 1,000 円未満を切り捨てるので、変わらない場合もあります）。</li>
  </ul>
  <h3>上限の式</h3>
  <p class="formula">上限の目安 = 住民税の所得割額 × 20% ÷ 特例分の割合 + 2,000 円</p>
  <ul>
    <li>ふるさと納税の住民税の控除のうち「特例分」は、所得割額の 20% が上限です。ここに達する寄附額が、自己負担がおおむね 2,000 円で済む上限です（${link("localTax202604", "地方税法 第314条の7第1項・第11項、道府県民税は第37条の2")}、${link("furusatoMic")}）。</li>
    <li>特例分の割合は「90% − 所得税率 × 1.021」で、84.895%（所得税率 5%）、79.79%（10%）、69.58%（20%）…と段階になっています（同項第1号の表と附則第5条の6）。</li>
    <li>どの段階になるかは、「住民税の課税総所得金額 − 人的控除差調整額」で決まります（同項第1号）。</li>
  </ul>
  <h3>何が変わったのか</h3>
  <ul>
    <li>令和8年法律第2号で、第314条の7第11項第1号（道府県民税は第37条の2第11項第1号）が改正され、人的控除差調整額に<strong>「所得税の基礎控除額 − 48 万円」</strong>（マイナスなら 0）が加わりました。施行は令和8年4月1日で、令和8年度分の住民税（＝令和7年中の寄附）から適用されています（${link("localTax202604", "改正後の条文と同法附則第11条第1項")}、${link("mofKaisetsu")}）。所得税の基礎控除だけが引き上げられ、住民税の基礎控除（43 万円）は据え置かれたので、所得税の実際の税率に合うように割合の決め方を直したものです。</li>
    <li>式が変わったのは令和7年分からです。令和8年分でさらに差が出るのは、所得税の基礎控除がもう一度上がったためです（${link("basic")}）。合計所得金額 489 万円以下は 88 万円・68 万円（132 万円以下は 95 万円）から 104 万円へ、489 万円超 655 万円以下は 63 万円から 67 万円へ、655 万円超 2,350 万円以下は 58 万円から 62 万円へ。引く額が増えるので、割合を決める金額が下がり、一段低い所得税率の区分に移る人が出ます。</li>
    <li>区分が一段下がると、特例分の割合は上がります（たとえば 79.79% → 84.895%）。割合が上がると、同じ寄附額でも特例分が大きくなり、上限（所得割額の 20%）に少ない寄附額で達します。そのため上限の目安が下がります。</li>
    <li>住民税の所得割額は、給与収入 220 万円以上なら変わりません。住民税の基礎控除・配偶者控除・扶養控除・調整控除は、どちらの年度も同じ条文です（地方税法 第314条の2、第314条の6）。</li>
  </ul>
  <h3>給与収入 500 万円・独身の計算（社会保険料 75 万円）</h3>
  ${table(
    "給与収入 500 万円・独身の上限の計算（令和7年分と令和8年分）",
    ["", p.label, c.label],
    [
      ["給与所得（500 万円 − 給与所得控除 144 万円）", yen(p.salaryIncome), yen(c.salaryIncome)],
      ["住民税の課税総所得金額（− 社会保険料 75 万円 − 基礎控除 43 万円）", yen(p.residentTaxableIncome), yen(c.residentTaxableIncome)],
      ["住民税の所得割額（× 10% − 調整控除 2,500 円）", yen(p.incomeLevy), yen(c.incomeLevy)],
      ["特例分の上限（所得割額 × 20%）", yen(p.specialCap), yen(c.specialCap)],
      ["所得税の基礎控除", yen(p.incomeTaxBasicDeduction), yen(c.incomeTaxBasicDeduction)],
      ["人的控除差調整額（5 万円 + 所得税の基礎控除 − 48 万円）", yen(p.adjustmentAmount), yen(c.adjustmentAmount)],
      ["割合を決める金額（課税総所得金額 − 人的控除差調整額）", yen(p.rateBase), yen(c.rateBase)],
      ["特例分の割合", pct(p.specialRatePer100k), pct(c.specialRatePer100k)],
      ["上限の目安（特例分の上限 ÷ 割合 + 2,000 円。1,000 円未満切り捨て）", yen(p.limit), yen(c.limit)],
    ],
  )}
  <p class="note">令和7年分は割合を決める金額が 195 万円を超えるので 79.79%、令和8年分は 195 万円以下なので 84.895% になります。所得割額はどちらも同じです。</p>
  <h3>ほかの資料との突き合わせ</h3>
  <ul>
    <li>総務省の「年間上限の目安」の表は、基礎控除の引上げより前の税制で作られたものです（給与収入 500 万円・独身は 6.1 万円）。令和8年分を反映した公的な早見表は、確認した範囲では見つかりませんでした。このページの令和8年分の数字は、上の条文から計算したものです。</li>
    <li>式の変更そのものは、自治体も同じ内容を説明しています（${link("nerima")}、${link("ikoma")}）。</li>
    <li>同じ前提（給与収入 500 万円・独身・社会保険料 75 万円）で、令和7年分 約 6.1 万円 → 令和8年分 約 5.7 万円と独立に計算している解説があり、このページの結果と一致します（一次情報ではありません）: ${CROSS_CHECKS.map((x) => `<a href="${esc(x.url)}" rel="noopener noreferrer">${esc(x.title)}</a>`).join("、")}。</li>
  </ul>`,
    examplesTitle: "年収別の比較表",
    examples:
      table(
        "給与収入別のふるさと納税の上限の目安（令和7年分 → 令和8年分）",
        ["給与収入", ...YEAR_FAMILIES.map((f) => f.label)],
        salaryRows.map((r) => [man(r.salary), ...r.cells.map(yearCell)]),
      ) +
      `\n  <p class="note">表の前提: 給与収入のみ、社会保険料は給与収入の ${EXAMPLE_SOCIAL_INSURANCE_PERCENT}% と仮定、ほかの所得控除なし。「変わらず」は、同じ収入・同じ控除なら令和7年分と同じ額という意味です。令和7年分は、所得税の基礎控除と給与所得控除だけを当時の額にして計算しています。</p>\n  ` +
      table(
        "フリーランスの所得別のふるさと納税の上限の目安（令和7年分 → 令和8年分）",
        ["所得（売上 − 経費）", "独身・青色申告特別控除 65 万円"],
        freelanceRows.map((r) => [man(r.income), yearCell(r.cell)]),
      ) +
      `\n  <p class="note">表の前提: 給与収入のないフリーランス、青色申告特別控除 65 万円、扶養親族なし、社会保険料は所得（売上 − 経費）の ${EXAMPLE_SOCIAL_INSURANCE_PERCENT}% と仮定。</p>\n  ` +
      table(
        "上限の目安が下がる人・変わらない人・上がる人の内訳",
        ["前提", "下がる", "変わらない", "上がる", "下がる収入の範囲（最大の下がり幅）"],
        [
          ...scans.map((x) => [`給与収入のみ・${x.label}`, count(x.scan.lower), count(x.scan.same), count(x.scan.higher), scanRangeText(x.scan)]),
          ["フリーランス・独身・青色 65 万円（所得で走査）", count(freelanceScan.lower), count(freelanceScan.same), count(freelanceScan.higher), scanRangeText(freelanceScan)],
        ],
      ) +
      `\n  <p class="note">${esc(scanNote)}範囲は社会保険料や控除の額で前後するので、自分の数字は上の計算機で確かめてください。高い収入の範囲は幅が狭い代わりに、下がり幅が大きくなります。</p>`,
    faqs: [
      {
        q: "令和8年分は、全員のふるさと納税の上限が下がるのですか？",
        a: `いいえ。下がるのは一部の所得帯だけです。給与収入のみ・独身・社会保険料 ${EXAMPLE_SOCIAL_INSURANCE_PERCENT}% の前提で、給与収入 ${man(YEAR_SCAN.from)}〜${man(YEAR_SCAN.to)}を ${man(YEAR_SCAN.step)}きざみで計算すると、${count(single.total)}のうち下がるのは ${count(single.lower)}、変わらないのは ${count(single.same)}、上がるのは ${count(single.higher)}でした。たとえば給与収入 600 万円・独身は ${yen(c600.previous.limit)} のままです。`,
      },
      {
        q: "なぜ基礎控除が上がると、上限が下がる人がいるのですか？",
        a: `上限は「住民税の所得割額 × 20% ÷ 特例分の割合 + 2,000 円」で決まり、特例分の割合は所得税率が低いほど高くなります（90% − 所得税率 × 1.021）。所得税の基礎控除が上がって所得税率の区分が一段下がると、割合が上がり、所得割額の 20% という上限に少ない寄附額で達します。住民税の基礎控除は 43 万円のままなので、所得割額は増えません。割合の決め方に所得税の基礎控除を反映させたのは、令和8年法律第2号による地方税法 第314条の7第11項第1号の改正です（${link("localTax202604")}、${link("mofKaisetsu")}）。`,
      },
      {
        q: "上限が下がるのは、損をしているということですか？",
        a: `寄附できる額の目安が下がるだけで、税の負担が増えるわけではありません。上限が下がるのは、所得税が減って所得税率の区分が下がった人です。給与収入 500 万円・独身の例では、令和8年分の上限の目安 ${yen(c.limit)} を寄附したときの自己負担は ${yen(burdenAtNew)} です（寄附額 − 減る所得税と住民税。この計算機の令和8年分の計算）。ふるさと納税は、寄附した額から自己負担を引いた額だけ税が減る仕組みで、手元のお金が増えるものではありません（${link("furusatoMic")}）。`,
      },
      {
        q: "令和7年分の上限のつもりで寄附すると、どうなりますか？",
        a: `上限を超えた分は、特例分の控除が頭打ちになり、自己負担が増えます。給与収入 500 万円・独身の例で、令和7年分の上限の目安 ${yen(p.limit)} を令和8年分（2026年中）に寄附すると、自己負担は ${yen(burdenAtOld)} になります（上限の目安 ${yen(c.limit)} なら ${yen(burdenAtNew)}）。早見表や去年の額をそのまま使わず、今年の見込みで計算し直すのが安全です。`,
      },
      {
        q: "総務省の早見表では給与収入 500 万円・独身は 6.1 万円です。どちらが正しいですか？",
        a: `総務省の表は、基礎控除の引上げより前の税制で作られた目安です。令和7年分までは、この前提の上限は ${yen(p.limit)} で表と同じです。令和8年分（2026年中の寄附）は、条文どおりに計算すると ${yen(c.limit)} になります（${link("localTax202604", "地方税法 第314条の7第11項第1号")}、${link("basic")}）。令和8年分を反映した公的な早見表は確認した範囲では見つからなかったため、このページの数字は条文からの計算です。実際の額は、翌年 6 月ごろに届く住民税の決定通知書で確認できます。`,
      },
      {
        q: "給与収入が 220 万円未満だと、なぜ下がるのですか？",
        a: `給与所得控除の最低額が、令和7年分の 65 万円から令和8年分は 74 万円に上がったためです（${link("salaryDeduction")}）。給与所得が減ると住民税の所得割額も減り、その 20% である特例分の上限も下がります。たとえば給与収入 200 万円・独身（社会保険料 30 万円）は ${yen(c200.previous.limit)} → ${yen(c200.current.limit)} です。`,
      },
      {
        q: "2026年のいつの寄附から、この計算になりますか？",
        a: `2026年1月1日から12月31日までの寄附が令和8年分で、令和8年分の所得税と令和9年度の住民税から控除されます。基礎控除の引上げは令和8年12月1日施行ですが、令和8年分の所得税の全体に適用されます（${link("kaisei")}、${link("basic")}）。`,
      },
    ],
    sources: ["localTax202604", "mofKaisetsu", "basic", "salaryDeduction", "incomeTaxLaw", "furusatoMic", "kaisei", "nerima", "ikoma", "rate", "resident"],
  };
}

const KIND_LABEL: Record<PageKind, string> = {
  furusato: "ふるさと納税の上限（フリーランス）",
  ideco: "iDeCo の節税額（個人事業主）",
  kyosai: "小規模企業共済の節税額",
  blue: "青色申告特別控除 65万・55万・10万の差",
  "furusato-year": "ふるさと納税の上限（令和7年分と令和8年分の比較）",
};

function jsonLd(value: unknown): string {
  // </script> で途切れないように < をエスケープする
  return `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;
}

export function webApplicationLd(url: string, name: string, description: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name,
    url,
    description,
    inLanguage: "ja",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Any",
    browserRequirements: "JavaScript が必要です",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
    license: "https://opensource.org/license/mit",
    codeRepository: REPO_URL,
  };
}

/** 共通の入力欄（売上・経費・青色申告・社会保険料 + ページごとの欄） */
function defaultForm(p: PageDef): string {
  return `<fieldset>
    <legend>売上と経費</legend>
    ${field("revenue", "フリーランス・個人事業の売上", "", "例: 800万", "800万")}
    ${field("expenses", "その必要経費", "", "例: 150万", "150万")}
    <label>青色申告特別控除${p.kind === "blue" ? "（現在の見込み）" : ""}
      <select name="blue">
        <option value="none">白色申告（控除なし）</option>
        <option value="10">青色 10万円</option>
        <option value="55">青色 55万円</option>
        <option value="65" selected>青色 65万円</option>
      </select></label>
    ${field("social-insurance", "社会保険料", "国民健康保険・国民年金などの年額", "例: 90万", "90万")}
  </fieldset>
  <fieldset>
    <legend>${p.kind === "blue" ? "国民健康保険料への影響（任意）" : "掛金・寄附"}</legend>
    ${p.extraFields}
  </fieldset>
  <p class="hint">給与収入がある方、配偶者や扶養親族がいる方は、<a id="full" href="../">すべての項目を入れられる計算ページ</a>を使ってください。</p>`;
}

function renderPage(p: PageDef, all: readonly PageDef[]): string {
  const url = `${SITE_URL}${p.slug}/`;
  const others = all.filter((o) => o.slug !== p.slug);
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: p.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a.replace(/<[^>]+>/g, "") },
    })),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "setsuzei", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: KIND_LABEL[p.kind], item: url },
    ],
  };
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="setsuzei">
<meta property="og:locale" content="ja_JP">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:image" content="${SITE_URL}img/ogp.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0b6b57">
<link rel="icon" href="../img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="../style.css">
${jsonLd(webApplicationLd(url, p.h1, p.description))}
${jsonLd(faqLd)}
${jsonLd(breadcrumbLd)}
</head>
<body class="article">
<header class="site">
  <p class="crumbs"><a href="../">setsuzei</a> › ${esc(KIND_LABEL[p.kind])}</p>
  <h1>${esc(p.h1)}</h1>
  <p class="lead">${esc(p.lead)}</p>
  <p class="privacy">令和8年分（2026年分）の概算です。入力した内容はこのページの中だけで計算し、どこにも送信・保存しません。</p>
</header>

<main>
<form id="form" autocomplete="off" novalidate data-kind="${p.kind}">
  <p class="hint">すべて<strong>年間の見込み額</strong>を入れます。<code>600万</code> / <code>6,000,000</code> のどちらでも書けます。はじめは例の数字が入っています。</p>
  ${p.form ?? defaultForm(p)}
</form>

<div class="results" id="results">
  <h2>結果</h2>
  <div id="result" aria-live="polite"><p class="placeholder">${p.kind === "furusato-year" ? "収入" : "売上"}を入力すると、ここに結果が出ます。</p></div>
  <noscript><p class="card error">計算機には JavaScript が必要です。下の計算例の表は JavaScript なしで読めます。</p></noscript>
  <section class="card disclaimer">
    <h3>この結果について</h3>
    <p><strong>概算です。</strong>入力値と簡略化した前提にもとづく目安で、実際の税額は申告内容やお住まいの自治体によって変わります。税理士や税務署・市区町村の判断に代わるものではありません。重要な判断の前に、必ず専門家か所轄の窓口に確認してください。</p>
  </section>
</div>
</main>

<article class="prose">
<section>
  <h2>計算式と根拠</h2>
  ${p.formula}
</section>

<section>
  <h2>${esc(p.examplesTitle ?? "計算例")}</h2>
  ${p.examples}
</section>

<section>
  <h2>よくある質問</h2>
  ${p.faqs.map((faq) => `<h3>${esc(faq.q)}</h3>\n  <p>${faq.a}</p>`).join("\n  ")}
</section>

<section>
  <h2>根拠にした一次情報</h2>
  <ul class="sources">
    ${p.sources.map((key) => `<li>${link(key)}</li>`).join("\n    ")}
  </ul>
  <p class="note">数値はすべて一次情報で確かめ、<a href="${REPO_URL}/blob/main/src/data/2026.ts" rel="noopener">出典の URL を付けたデータファイル</a>にまとめています。計算の前提と、計算していないものは <a href="${REPO_URL}#何を計算し何を計算しないか" rel="noopener">README</a> にあります。内容の最終確認日: ${LAST_REVIEWED}。</p>
</section>

<nav class="related" aria-label="ほかの計算">
  <h2>ほかの計算</h2>
  <ul>
    <li><a href="../">全部まとめて計算する（ふるさと納税 + iDeCo + 小規模企業共済 + 青色申告）</a></li>
    ${others.map((o) => `<li><a href="../${o.slug}/">${esc(o.h1)}</a></li>`).join("\n    ")}
  </ul>
</nav>
</article>

<a id="jump" class="jump" href="#results" hidden></a>

<footer class="site">
  <p>setsuzei ・ MIT License ・ <a href="${REPO_URL}" rel="noopener">実行方法・ソースコード・計算の前提（GitHub）</a></p>
</footer>
<script type="module" src="../js/web/page.js"></script>
</body>
</html>
`;
}

/** トップページから各ページへ張るリンクの一覧（docs/index.html に同じものがあることをテストで確かめる） */
export function pageLinks(): { slug: string; label: string }[] {
  return buildPages().map((p) => ({ slug: p.slug, label: p.h1 }));
}

function sitemap(pages: readonly PageDef[]): string {
  const urls = [SITE_URL, ...pages.map((p) => `${SITE_URL}${p.slug}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${LAST_REVIEWED}</lastmod></url>`).join("\n")}
</urlset>
`;
}

/** 生成するファイル（docs/ からの相対パス → 内容） */
export function renderSite(): Map<string, string> {
  const pages = buildPages();
  const files = new Map<string, string>();
  for (const p of pages) files.set(`${p.slug}/index.html`, renderPage(p, pages));
  files.set("sitemap.xml", sitemap(pages));
  files.set("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`);
  return files;
}

/** 公開している URL の一覧（IndexNow の送信に使う） */
export function siteUrls(): string[] {
  return [SITE_URL, ...buildPages().map((p) => `${SITE_URL}${p.slug}/`)];
}
