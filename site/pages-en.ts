/**
 * 説明ページ 5 枚の英語版（docs/en/<slug>/index.html）。
 *
 * - 数字は日本語版と同じ計算（site/pages.ts の部品と計算コア）から出す。手で数字を書かない。
 * - 文面は日本語版の逐語訳ではなく、日本の制度を知らない人（日本に住む外国人のフリーランス・会社員）が
 *   読んで分かるように書く。金額は円のまま。用語は国税庁の英語の手引きに合わせる。
 * - 外部へのリンクは、出典一覧にある一次情報（日本語のページには「Japanese」と添える）と、
 *   公的機関の英語のページ（EN_LINKS）だけ。
 */
import { compareFurusatoLimit } from "../src/core/calculate.js";
import type { FurusatoComparison } from "../src/core/types.js";
import { getTaxYear } from "../src/data/index.js";
import {
  alternateLinks,
  blueRows,
  contributionRows,
  CROSS_CHECKS,
  EN_SLUG,
  esc,
  example,
  EXAMPLE_SOCIAL_INSURANCE_PERCENT,
  furusatoRows,
  IDECO_FULL,
  IDECO_MONTHLY,
  JA_SLUG,
  jsonLd,
  KYOSAI_FULL,
  KYOSAI_MONTHLY,
  LAST_REVIEWED,
  PAGE_KINDS,
  REPO_URL,
  SITE_URL,
  SRC,
  table,
  webApplicationLd,
  YEAR_FAMILIES,
  YEAR_SCAN,
  yearFreelanceRows,
  yearOutOfPocket,
  yearSalaryInput,
  yearSalaryRows,
  yearScans,
  type PageKind,
  type YearScan,
} from "./pages.js";

const data = getTaxYear(2026);
const EN_URL = `${SITE_URL}en/`;
const PCT = EXAMPLE_SOCIAL_INSURANCE_PERCENT;

const num = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
export const yenEn = (n: number): string => `¥${num(n)}`;
/** 100 万円単位の言い方（¥4.69 million） */
const million = (n: number): string => `¥${n / 1_000_000} million`;

/** 公的機関の英語のページ（2026-11-27 に開けることを確かめた） */
export const EN_LINKS = {
  ntaGuide: ["NTA: Income Tax and Special Income Tax for Reconstruction Guide (English, 2025 edition)", "https://www.nta.go.jp/english/taxes/individual/incometax_2025.htm"],
  idecoEnglish: ["iDeCo official site: What is iDeCo? (English)", "https://www.ideco-koushiki.jp/english/"],
} as const satisfies Record<string, readonly [string, string]>;

/** 出典（日本語のページ）の、英語での呼び名 */
const SRC_EN: Record<keyof typeof SRC, string> = {
  kaisei: "NTA: the 2026 increase of the basic exemption for income tax",
  rate: "NTA Tax Answer No. 2260: income tax rates",
  basic: "NTA Tax Answer No. 1199: basic exemption",
  blue: "NTA Tax Answer No. 2072: special deduction for blue returns",
  blueApply: "NTA Tax Answer No. 2070: the blue return system",
  mutual: "NTA Tax Answer No. 1135: deduction for small business mutual aid premiums",
  furusatoNta: "NTA Tax Answer No. 1155: furusato nozei (deduction for donations)",
  furusatoMic: "Ministry of Internal Affairs and Communications: furusato nozei portal, how the deduction works",
  resident: "Ministry of Internal Affairs and Communications: individual resident tax",
  localTax: "e-Gov: Local Tax Act",
  nhi: "e-Gov: Order for Enforcement of the National Health Insurance Act",
  idecoMhlw: "Ministry of Health, Labour and Welfare: iDeCo changes from December 2026",
  idecoSite: "iDeCo official site: four points before you start",
  localTax2027: "e-Gov: Local Tax Act (text in force from January 1, 2027)",
  idecoGuide: "iDeCo official site: features of iDeCo",
  idecoStructure: "iDeCo official site: eligibility, contributions and benefits",
  idecoAnnual: "National Pension Fund Association: paying contributions on an annual schedule",
  idecoNotice: "National Pension Fund Association: notice on changing contributions for the higher limit",
  idecoMerit: "iDeCo official site: tax advantages",
  retirement: "NTA Tax Answer No. 1420: retirement income",
  kyosaiClaim: "SMRJ: claiming Small Business Mutual Aid benefits",
  blueR9: "Ministry of Finance: FY2026 tax reform materials (tax administration)",
  blueR9Nta: "NTA: changes to the special deduction for blue returns from tax year 2027",
  kyosaiFee: "SMRJ: Small Business Mutual Aid contributions",
  kyosaiEntry: "SMRJ: who can join Small Business Mutual Aid",
  salaryDeduction: "NTA Tax Answer No. 1410: employment income deduction",
  localTax202604: "e-Gov: Local Tax Act (text in force from April 1, 2026)",
  mofKaisetsu: "Ministry of Finance: commentary on the FY2026 tax reform, Local Tax Act (pp. 931-932)",
  incomeTaxLaw: "e-Gov: Income Tax Act",
  nerima: "Nerima City: tax credit for donations (how furusato nozei works)",
  ikoma: "Ikoma City: furusato nozei and the tax credit",
};

/** 出典へのリンク。日本語のページなので「(Japanese only)」と添える */
function src(key: keyof typeof SRC, text?: string): string {
  return `<a href="${esc(SRC[key][1])}" rel="noopener noreferrer" hreflang="ja">${esc(text ?? SRC_EN[key])} (Japanese only)</a>`;
}

function official(key: keyof typeof EN_LINKS, text?: string): string {
  return `<a href="${esc(EN_LINKS[key][1])}" rel="noopener noreferrer" hreflang="en">${esc(text ?? EN_LINKS[key][0])}</a>`;
}

const field = (name: string, label: string, sub: string, placeholder = "", value = ""): string =>
  `<label>${esc(label)}${sub ? `<span class="sub">${esc(sub)}</span>` : ""}
      <input name="${name}" inputmode="numeric"${placeholder ? ` placeholder="${esc(placeholder)}"` : ""}${value ? ` value="${esc(value)}"` : ""}></label>`;

const EXAMPLE_NOTE =
  `Assumptions for the table: a freelancer with no salary, the ¥650,000 special deduction for blue returns, no dependents, ` +
  `and social insurance premiums at ${PCT}% of income (revenue minus expenses). Income tax is for tax year 2026 and resident tax for fiscal 2027. ` +
  `Your premiums and family change the result, so put your own figures into the calculator above.`;

const FAMILY_EN: Record<(typeof YEAR_FAMILIES)[number]["key"], string> = {
  single: "Single (no spouse or dependent exemption)",
  couple: "Spouse with no income",
  coupleChild: "Spouse with no income and one child in high school",
};

/** 比較表のセル: "¥61,000 → ¥57,000 (−¥4,000)" か "¥77,000 (no change)" */
export function yearCellEn(c: FurusatoComparison): string {
  const limit = (n: number): string => (n > 0 ? yenEn(n) : "no limit shown");
  if (c.difference === 0) return `${limit(c.current.limit)} (no change)`;
  return `${limit(c.previous.limit)} → ${limit(c.current.limit)} (${c.difference < 0 ? "−" : "+"}${yenEn(Math.abs(c.difference))})`;
}

const scanRangeText = (scan: Pick<YearScan, "ranges">): string =>
  scan.ranges.map((r) => `${million(r.from)} to ${million(r.to)} (by up to ${yenEn(r.maxDrop)})`).join("; ");

interface Faq {
  readonly q: string;
  readonly a: string;
}

interface PageEn {
  readonly kind: PageKind;
  readonly title: string;
  readonly h1: string;
  /** パンくずと「ほかの計算」に出す短い名前 */
  readonly short: string;
  readonly description: string;
  readonly lead: string;
  readonly form: string;
  readonly formula: string;
  readonly examplesTitle: string;
  readonly examples: string;
  readonly faqs: readonly Faq[];
  readonly sources: readonly (keyof typeof SRC)[];
  readonly official: readonly (keyof typeof EN_LINKS)[];
}

/** 売上・経費・青色申告・社会保険料の共通の欄 + ページごとの欄 */
function businessForm(kind: PageKind, legend: string, extra: string): string {
  return `<fieldset>
    <legend>Revenue and expenses</legend>
    ${field("revenue", "Freelance or business revenue", "For the whole year, before expenses", "e.g. 8,000,000", "8,000,000")}
    ${field("expenses", "Business expenses", "", "e.g. 1,500,000", "1,500,000")}
    <label>Special deduction for blue returns${kind === "blue" ? " (what you expect now)" : ""}<span class="sub">A deduction for business owners approved to file a “blue return” (aoiro shinkoku) with proper books</span>
      <select name="blue">
        <option value="none">White return (no deduction)</option>
        <option value="10">Blue return, ¥100,000</option>
        <option value="55">Blue return, ¥550,000</option>
        <option value="65" selected>Blue return, ¥650,000</option>
      </select></label>
    ${field("social-insurance", "Social insurance premiums", "National Health Insurance, National Pension and the like, for the year", "e.g. 900,000", "900,000")}
  </fieldset>
  <fieldset>
    <legend>${esc(legend)}</legend>
    ${extra}
  </fieldset>
  <p class="hint">If you also have a salary, a spouse or dependents, use <a id="full" href="../">the full calculator</a>, which takes every item.</p>`;
}

function buildPagesEn(): PageEn[] {
  const idecoMonthly = data.ideco.selfEmployedMonthlyLimit;
  const kyosaiMonthly = data.kyosai.monthlyLimit;
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
  const lowIncome = example(1_200_000, { idecoAdditional: IDECO_FULL });
  const incomeHead = "Income (revenue − expenses)";

  return [
    {
      kind: "furusato",
      title: "Furusato nozei limit calculator for freelancers in Japan (tax year 2026) | setsuzei",
      h1: "Furusato nozei limit calculator for freelancers and sole proprietors",
      short: "Furusato nozei limit (freelancers)",
      description:
        "Work out your furusato nozei (hometown tax) donation limit from your freelance revenue and expenses. Reflects the higher basic exemption for tax year 2026 and shows how iDeCo or Small Business Mutual Aid lowers the limit. Nothing you enter is sent anywhere.",
      lead: "Furusato nozei (ふるさと納税, “hometown tax”) lets you donate to a Japanese municipality, receive local products in return, and have the donation minus about ¥2,000 taken off your income tax and resident tax. The charts you see online are indexed by an employee's salary; a freelancer's limit depends on income (revenue minus expenses) and deductions. Enter yours to get the donation limit at which the out-of-pocket cost stays at about ¥2,000.",
      form: businessForm(
        "furusato",
        "Contributions and donations",
        [
          field("furusato-paid", "Furusato nozei already donated", "Total donated so far this year", "e.g. 30,000"),
          field("ideco-paid", "iDeCo contributions", "Expected total for the year. They lower the limit", "e.g. 276,000"),
          field("kyosai-paid", "Small Business Mutual Aid contributions", "Expected total for the year. They lower the limit"),
        ].join("\n    "),
      ),
      formula: `<p>The limit is worked out as follows.</p>
  <p class="formula">Limit = income-based part of resident tax × 20% ÷ (90% − income tax rate × 1.021) + ¥2,000</p>
  <ul>
    <li>The furusato nozei deduction has three parts: a deduction for donations in income tax, a basic portion in resident tax (10%), and a special portion in resident tax. The special portion is capped at 20% of the income-based part of your resident tax, and the donation that reaches that cap is the limit at which you pay only ¥2,000 yourself (${src("furusatoMic")}; ${src("localTax", "Local Tax Act, Art. 314-7 and Supplementary Provisions Art. 5-6")}).</li>
    <li>The income tax rate in the formula is your bracket, 5% to 45% in seven steps, set by your taxable income (${src("rate")}). The 1.021 is the special income tax for reconstruction, a 2.1% surcharge on income tax.</li>
    <li>Resident tax (住民税, juminzei) is the local tax you pay to your city and prefecture. Its income-based part is 10% of your income after deductions, less a small adjustment credit (${src("resident")}).</li>
    <li>Your tax goes down by at most the donation minus ¥2,000 (${src("furusatoMic")}). The same money leaves your account as a donation, so you do not end up with more cash. What you gain is the return gifts.</li>
    <li>If your income is low enough that the income-based part of resident tax is waived (total income of ¥350,000 × (spouse and dependents + 1) + ¥100,000 or less, plus ¥320,000 if you have a spouse or dependents; ${src("localTax2027", "Local Tax Act, Supplementary Provisions Art. 3-3")}), no limit is shown. The same applies just above that level, where the tax is reduced. Children under 16 can be entered in <a href="../">the full calculator</a>.</li>
    <li>The limit is rounded down to the nearest ¥1,000 and assumes you file a final tax return (kakutei shinkoku). Freelancers file one, so the “one-stop exception” is not available: it is only for employees and others who do not need to file (${src("furusatoMic", "the ministry's explanation")}). How to claim the deduction on the return is in the ${official("ntaGuide", "NTA's English income tax guide")} under “Deduction for donations”.</li>
  </ul>`,
      examplesTitle: "Examples",
      examples:
        table(
          "Furusato nozei limit by income (tax year 2026)",
          [incomeHead, "Single", "Spouse with no income and one child in high school", `Single, paying ${yenEn(IDECO_FULL)} a year into iDeCo`],
          f.map((r) => [yenEn(r.income), yenEn(r.single), yenEn(r.family), yenEn(r.withIdeco)]),
        ) + `\n  <p class="note">${esc(EXAMPLE_NOTE)}</p>`,
      faqs: [
        {
          q: "Does furusato nozei leave me with more money?",
          a: `No. Your tax goes down by at most the donation minus ¥2,000 (${src("furusatoMic")}). You pay the donation first and get almost the same amount back later as lower tax, so it works like paying part of your tax in advance. What you gain is the return gifts. Anything you donate above the limit comes out of your own pocket.`,
        },
        {
          q: "Can I use the charts made for employees?",
          a: "Not reliably. Those charts take a salary, subtract the employment income deduction and assume social insurance at a fixed share of pay. A freelancer's limit comes from revenue minus expenses and the blue-return deduction, so the same “annual income” gives a different limit. Enter your revenue and expenses above.",
        },
        {
          q: "Does paying into iDeCo or Small Business Mutual Aid change my limit?",
          a: `Yes, it lowers it. Contributions are fully deductible, which shrinks the income-based part of your resident tax. With an income of ¥5,000,000 and no dependents (same assumptions as the table), the limit is ${yenEn(e500.measures.furusato.limit)}; paying ${yenEn(IDECO_FULL)} a year into iDeCo brings it to ${yenEn(e500Ideco.measures.furusato.limit)}. Decide your contributions first, then your donations.`,
        },
        {
          q: "I can't predict my revenue until year-end. How much is safe?",
          a: "The limit follows your income. If income comes in below your forecast, the limit drops and the excess is out of pocket. The row one step below your expected income in the table gives a feel for the downside. The surest way is to enter a cautious revenue figure before you donate.",
        },
        {
          q: "With the same income as last year, is my 2026 limit different?",
          a: `It can be. From tax year 2026 the basic exemption for income tax is higher (up to ¥1,040,000 depending on total income; ${src("basic")}, ${src("kaisei", "NTA's notice on the change")}). That lowers taxable income and moves some people into a lower bracket. A lower rate makes the denominator of the formula larger, so the limit goes down a little. Your income tax itself is lower by the larger exemption.`,
        },
      ],
      sources: ["furusatoMic", "furusatoNta", "localTax", "localTax2027", "rate", "basic", "kaisei", "resident"],
      official: ["ntaGuide"],
    },
    {
      kind: "ideco",
      title: "iDeCo tax savings calculator for freelancers in Japan (tax year 2026) | setsuzei",
      h1: "iDeCo tax savings calculator for freelancers and the self-employed",
      short: "iDeCo tax savings (self-employed)",
      description:
        "Estimate how much iDeCo contributions cut your income tax and resident tax as a freelancer or sole proprietor in Japan, using the tax year 2026 rates and basic exemption. Shows what the room left before year-end is worth. Nothing you enter is sent anywhere.",
      lead: `iDeCo is Japan's individual-type defined contribution pension: you pay in monthly, choose the investments, and can take the money out from age 60. Every yen you contribute is deducted from your income. For the self-employed (Category 1 insured persons of the National Pension) the limit is ${yenEn(idecoMonthly)} a month, ${yenEn(IDECO_FULL)} a year. Enter your revenue and expenses to see how much income tax and resident tax that saves.`,
      form: businessForm(
        "ideco",
        "Contributions",
        [
          field("ideco-paid", "iDeCo contributions (paid or scheduled)", "Expected total for the year", "e.g. 276,000"),
          field("ideco-add", "Extra you can still pay in this year", "Left empty: the room left under the annual limit, up to where it stops lowering your tax. Ask your provider whether an increase is still possible this year"),
        ].join("\n    "),
      ),
      formula: `<p>The saving is the difference between your tax without and with the contributions.</p>
  <p class="formula">Tax saved ≈ contributions × (income tax rate × 1.021 + resident tax 10%)</p>
  <ul>
    <li>iDeCo contributions are deducted in full from income, under the deduction for small business mutual aid premiums (${src("mutual")}). What iDeCo is and who can join is explained in English on the ${official("idecoEnglish", "iDeCo official site")}.</li>
    <li>The income tax rate is 5% to 45% depending on taxable income (${src("rate")}). If the contributions move you into a lower bracket, the saving is a little smaller than the formula; the calculator accounts for that.</li>
    <li>The income-based part of resident tax is a flat 10% (${src("resident")}). The resident tax saving shows up in the following fiscal year (fiscal 2027).</li>
    <li>The limit is shared with National Pension Fund contributions and the additional pension premium (${src("idecoSite")}).</li>
    <li>The saving comes in exchange for paying the contributions. As a rule you cannot withdraw before 60, and account fees apply, which differ by provider (${src("idecoGuide")}).</li>
    <li>The payout is taxable: a lump sum is retirement income (${src("retirement")}) and an annuity is treated like a public pension, each with its own deduction (${src("idecoMerit")}). This calculator does not estimate tax at payout.</li>
    <li>Late in the year an increase often comes too late. The monthly amount can be changed only once per contribution year, December to November (${src("idecoStructure")}), and paying several months at once needs an annual-schedule form filed in advance (${src("idecoAnnual")}).</li>
    <li>Once income tax and the income-based part of resident tax reach zero, more contributions save nothing. The calculator stops the extra amount there.</li>
  </ul>`,
      examplesTitle: "Examples",
      examples:
        table(
          "iDeCo tax savings by income and contribution (per year; income tax + resident tax; tax year 2026)",
          [incomeHead, "Income tax rate", ...IDECO_MONTHLY.map((m) => `${yenEn(m)} a month`)],
          ideco.map((r) => [yenEn(r.income), `${r.ratePercent}%`, ...r.savings.map(yenEn)]),
        ) + `\n  <p class="note">${esc(EXAMPLE_NOTE)} Contributions are for a full 12 months.</p>`,
      faqs: [
        {
          q: "How much tax does iDeCo save a freelancer?",
          a: `It depends on your income and contributions. With an income of ¥5,000,000 (same assumptions as the table), paying the maximum ${yenEn(idecoMonthly)} a month (${yenEn(IDECO_FULL)} a year) cuts income tax and resident tax by ${yenEn(idecoFull500)} a year in total. The money is basically locked until you turn 60 (${src("idecoSite")}), the account has fees, and the payout is taxable (${src("idecoGuide")}, ${src("idecoMerit")}). Weigh it against the cash you need on hand.`,
        },
        {
          q: "Can I raise my iDeCo contributions in December to save more this year?",
          a: `Often not. You can change the amount only once per contribution year, December to the following November (${src("idecoStructure")}). Paying the remaining room in one go needs an annual-schedule form filed in advance, which takes effect from the month after you apply (debited the month after that), and missed months cannot be made up (${src("idecoAnnual")}). Only amounts debited by December (the November contribution) count for this year, so under “Extra you can still pay in this year” enter what your provider confirms you can actually add.`,
        },
        {
          q: "I heard the limit goes up in December 2026. Does that raise my 2026 saving?",
          a: `No. The limit for Category 1 insured persons rises to ¥75,000 a month from December 2026 (${src("idecoMhlw", "the ministry's notice")}), but the December contribution is debited in January of the following year (${src("idecoSite")}; the National Pension Fund Association also says “from the December 2026 contribution, debited in January 2027”, ${src("idecoNotice")}). Contributions are deducted in the year they are paid, so tax year 2026 (payments from January to December 2026) is calculated at ${yenEn(idecoMonthly)} a month.`,
        },
        {
          q: "Does iDeCo lower my National Health Insurance premium?",
          a: `No. The income-based part of the premium is charged on total income minus the basic deduction, and deductions such as iDeCo are not subtracted (${src("nhi", "Order for Enforcement of the National Health Insurance Act, Art. 29-7")}; ${src("localTax", "Local Tax Act, Art. 703-4")}). What goes down is income tax and resident tax.`,
        },
        {
          q: "Does iDeCo save tax in a low-income year?",
          a: `Not if you have no taxable income. With an income of ¥1,200,000 (same assumptions as the table), taxable income for income tax is ${yenEn(lowIncome.baseline.incomeTax.taxableIncome)} and contributing up to the limit saves ${yenEn(lowIncome.measures.ideco.saving.total)}. A deduction can only reduce tax you would otherwise owe.`,
        },
      ],
      sources: ["mutual", "idecoMhlw", "idecoSite", "idecoGuide", "idecoStructure", "idecoAnnual", "idecoNotice", "idecoMerit", "retirement", "rate", "resident", "nhi", "localTax"],
      official: ["idecoEnglish", "ntaGuide"],
    },
    {
      kind: "kyosai",
      title: "Small Business Mutual Aid (shokibo kigyo kyosai) tax savings calculator, tax year 2026 | setsuzei",
      h1: "Small Business Mutual Aid (shokibo kigyo kyosai) tax savings calculator",
      short: "Small Business Mutual Aid tax savings",
      description:
        "Estimate how much Small Business Mutual Aid (shokibo kigyo kyosai) contributions of ¥1,000 to ¥70,000 a month cut your income tax and resident tax, from your revenue and expenses, using tax year 2026 rates. Nothing you enter is sent anywhere.",
      lead: `Small Business Mutual Aid (小規模企業共済, shokibo kigyo kyosai) is a retirement fund for sole proprietors and directors of small companies, run by SMRJ (the Organization for Small & Medium Enterprises and Regional Innovation, a government agency). You pay ¥1,000 to ${yenEn(kyosaiMonthly)} a month, deduct all of it from your income, and receive it back when you close the business or retire. SMRJ's own savings table is indexed by taxable income; here you enter revenue and expenses and the calculator works out the rest.`,
      form: businessForm(
        "kyosai",
        "Contributions",
        [
          field("kyosai-paid", "Small Business Mutual Aid contributions (paid or scheduled)", "Expected total for the year"),
          field("kyosai-add", "Extra you would pay", "Left empty: the room left under the annual limit, up to where it stops lowering your tax"),
          field("ideco-paid", "iDeCo contributions", "Deducted under the same heading. Enter them if you have any", "e.g. 276,000"),
        ].join("\n    "),
      ),
      formula: `<p>The saving is the difference between your tax without and with the contributions.</p>
  <p class="formula">Tax saved ≈ contributions × (income tax rate × 1.021 + resident tax 10%)</p>
  <ul>
    <li>Contributions are ¥1,000 to ${yenEn(kyosaiMonthly)} a month, in ¥500 steps, and are deducted in full as small business mutual aid premiums. Prepayments covering up to one year ahead are deductible too (${src("kyosaiFee")}; ${src("mutual")}).</li>
    <li>The income tax rate is 5% to 45% depending on taxable income (${src("rate")}); the income-based part of resident tax is a flat 10% (${src("resident")}).</li>
    <li>SMRJ publishes a table of savings by taxable income and monthly contribution (${src("kyosaiFee")}). This calculator's engine is tested against that table (<a href="${REPO_URL}/blob/main/test/estimate.test.ts" rel="noopener">tests</a>). The table below applies the higher basic exemption for tax year 2026 and is indexed by revenue minus expenses.</li>
    <li>Sole proprietors and partners of small businesses and directors of small companies can join. Employees cannot, even if they run a business on the side (${src("kyosaiEntry")}). This calculator does not check whether you qualify.</li>
    <li>The saving comes in exchange for paying the contributions. You get the money back as a benefit when you close the business or retire, and it is taxed then: a lump sum is retirement income, instalments are pension income, and a voluntary cancellation before 65 is occasional income. Cancel voluntarily with fewer than 240 months (20 years) of contributions and you get back less than you paid; with fewer than 12 months you get nothing (${src("kyosaiClaim")}). Tax at payout is not estimated here.</li>
    <li>Once income tax and the income-based part of resident tax reach zero, more contributions save nothing. The calculator stops the extra amount there.</li>
  </ul>`,
      examplesTitle: "Examples",
      examples:
        table(
          "Small Business Mutual Aid tax savings by income and contribution (per year; income tax + resident tax; tax year 2026)",
          [incomeHead, "Income tax rate", ...KYOSAI_MONTHLY.map((m) => `${yenEn(m)} a month`)],
          kyosai.map((r) => [yenEn(r.income), `${r.ratePercent}%`, ...r.savings.map(yenEn)]),
        ) + `\n  <p class="note">${esc(EXAMPLE_NOTE)} Contributions are for a full 12 months.</p>`,
      faqs: [
        {
          q: "How much tax does Small Business Mutual Aid save?",
          a: `It depends on your income and contributions. With an income of ¥5,000,000 (same assumptions as the table), paying the maximum ${yenEn(kyosaiMonthly)} a month (${yenEn(KYOSAI_FULL)} a year) cuts income tax and resident tax by ${yenEn(kyosaiFull500)} a year in total. The contributions come back to you later as a benefit, which is taxed separately when you receive it (not covered here).`,
        },
        {
          q: "Do I lose money if I quit early?",
          a: `With a voluntary cancellation, yes: with fewer than 240 months (20 years) of contributions the refund is less than you paid in, and with fewer than 12 months there is no refund at all. The payout is also taxed: a voluntary cancellation before 65 is occasional income, a lump sum on closing the business is retirement income, and instalments are pension income (${src("kyosaiClaim")}). Decide on the basis that the money stays in for a long time, not on the tax saving alone.`,
        },
        {
          q: "Can I use both iDeCo and Small Business Mutual Aid?",
          a: `Yes. Both are deducted from income under the same heading (${src("mutual")}). If you max out both, your taxable income falls a lot, you may drop to a lower bracket, and the combined saving is smaller than the two calculated separately. <a href="../">The full calculator</a> gives the saving with everything done together.`,
        },
        {
          q: "If I raise my contributions in December, does it count for this year?",
          a: `Contributions are deducted in the year you pay them, and prepayments covering up to one year ahead are deductible in the year paid (${src("mutual")}; ${src("kyosaiFee")}). Check how to raise or prepay, and the cut-off dates, with SMRJ or the bank or business association that handles your account.`,
        },
        {
          q: "Does it lower my National Health Insurance premium?",
          a: `No. The income-based part of the premium is charged on total income minus the basic deduction, and this deduction is not subtracted (${src("nhi", "Order for Enforcement of the National Health Insurance Act, Art. 29-7")}; ${src("localTax", "Local Tax Act, Art. 703-4")}).`,
        },
      ],
      sources: ["kyosaiFee", "kyosaiEntry", "kyosaiClaim", "mutual", "rate", "resident", "nhi", "localTax"],
      official: ["ntaGuide"],
    },
    {
      kind: "blue",
      title: "Blue return special deduction: ¥650,000 vs ¥550,000 vs ¥100,000 in tax (2026) | setsuzei",
      h1: "Blue return special deduction: ¥650,000 vs ¥550,000 vs ¥100,000 in actual tax",
      short: "Blue return deduction: ¥650,000 / ¥550,000 / ¥100,000",
      description:
        "See what the special deduction for blue returns (aoiro shinkoku) is worth in income tax and resident tax at ¥650,000, ¥550,000, ¥100,000 or a white return, from your revenue and expenses, for tax year 2026. Also estimates the effect on National Health Insurance. Nothing you enter is sent anywhere.",
      lead: "A “blue return” (青色申告, aoiro shinkoku) is the return type for business owners who keep proper books and have the tax office's approval. It comes with a special deduction of ¥100,000, ¥550,000 or ¥650,000 off business income; everyone else files a “white return” with none. The gap between ¥650,000 and ¥550,000 is ¥100,000 times your tax rate, but the rate depends on your income and the deduction itself can change your bracket. Enter your revenue and expenses to see the tax at each level.",
      form: businessForm(
        "blue",
        "Effect on National Health Insurance (optional)",
        [field("nhi-rate", "National Health Insurance income-based rate (%)", "Optional. Enter the total rate in your municipality to also see the rough difference in premium", "e.g. 11.5")].join("\n    "),
      ),
      formula: `<p>Income tax and resident tax are calculated at each of the four levels and compared.</p>
  <p class="formula">Difference in tax ≈ difference in deduction × (income tax rate × 1.021 + resident tax 10%)</p>
  <ul>
    <li>The special deduction for blue returns takes ¥550,000 (¥650,000 if further conditions are met) or ¥100,000 off your income, depending on how you keep books and file (${src("blue")}). The ${official("ntaGuide", "NTA's English income tax guide")} uses the same terms, “blue return” and “white return”.</li>
    <li>¥550,000 requires double-entry bookkeeping for business income, a balance sheet and profit-and-loss statement attached, and a return filed by the deadline. ¥650,000 requires, on top of that, filing online with e-Tax or keeping qualifying electronic books. Blue-return filers who meet neither get ¥100,000 (${src("blue")}).</li>
    <li>The deduction cannot exceed your profit. If business income is below the deduction, only the income itself is deducted (${src("blue")}).</li>
    <li>The income tax rate is 5% to 45% depending on taxable income (${src("rate")}); the income-based part of resident tax is a flat 10% (${src("resident")}).</li>
    <li>This page is for tax year 2026. From tax year 2027 the rules change: ¥650,000 for double-entry books filed with e-Tax, ¥750,000 with certain electronic bookkeeping on top (automatic links to invoice data, a record of corrections and deletions, and so on), and ¥100,000 for double-entry books filed on paper. The ¥100,000 deduction for simple books is limited to people whose business revenue two years earlier was ¥10 million or less, among others (${src("blueR9")}; ${src("blueR9Nta")}).</li>
    <li>The calculator shows the difference in tax only. It does not check whether you meet the conditions for a level.</li>
  </ul>`,
      examplesTitle: "Examples",
      examples:
        table(
          "Tax saved by the special deduction for blue returns, by income (per year; income tax + resident tax; tax year 2026)",
          [incomeHead, "White → ¥100,000", "White → ¥550,000", "White → ¥650,000", "¥550,000 → ¥650,000"],
          blue.map((r) => [yenEn(r.income), yenEn(r.s10), yenEn(r.s55), yenEn(r.s65), yenEn(r.diff65vs55)]),
        ) +
        `\n  <p class="note">Assumptions for the table: a freelancer with no salary, no dependents, and social insurance premiums at ${PCT}% of income (revenue minus expenses). Income tax is for tax year 2026 and resident tax for fiscal 2027. “White → ¥650,000” is the tax saved compared with a white return.</p>`,
      faqs: [
        {
          q: "How much is the difference between ¥650,000 and ¥550,000 in tax?",
          a: `The deductions differ by ¥100,000; the tax difference depends on your income. With an income of ¥5,000,000 (same assumptions as the table), going from ¥550,000 to ¥650,000 cuts income tax and resident tax by ${yenEn(blue500.diff65vs55)} a year in total. The higher your income tax rate, the larger the gap.`,
        },
        {
          q: "How much do I save by moving from a white return to a ¥650,000 blue return?",
          a: `With an income of ¥5,000,000 (same assumptions as the table), ${yenEn(blue500.s65)} a year (${yenEn(blue500.s10)} at the ¥100,000 level, ${yenEn(blue500.s55)} at ¥550,000). To file a blue return you must submit the application (青色申告承認申請書) to the tax office by March 15 of the year you want it to start, or within two months of opening if you started the business on or after January 16 (${src("blueApply")}). You cannot switch that year's return from white to blue at year-end.`,
        },
        {
          q: "Does the blue-return deduction also lower National Health Insurance?",
          a: `Yes. The income-based part of the premium is charged on total income minus the basic deduction, and the blue-return deduction lowers total income (${src("nhi", "Order for Enforcement of the National Health Insurance Act, Art. 29-7")}; ${src("localTax", "Local Tax Act, Art. 703-4")}). That is different from iDeCo and furusato nozei. Rates differ by municipality, so enter yours to see a rough difference (the annual cap is not applied).`,
        },
        {
          q: "Is the deduction changing from tax year 2027?",
          a: `Yes. From tax year 2027, double-entry books filed with e-Tax give ¥650,000, and keeping electronic books that meet certain conditions on top gives ¥750,000. Double-entry books filed on paper give ¥100,000. The ¥100,000 deduction for simple books is limited to people whose business revenue two years earlier was ¥10 million or less, among others (${src("blueR9")}; ${src("blueR9Nta")}). This page calculates tax year 2026, with the ¥550,000 and ¥650,000 levels.`,
        },
        {
          q: "In a low-income year, can I deduct the full ¥650,000?",
          a: `Only up to your business profit. If revenue minus expenses is ¥400,000, you deduct ¥400,000 even if you meet the conditions for ¥650,000 (${src("blue")}). The calculator applies this cap.`,
        },
      ],
      sources: ["blue", "blueApply", "blueR9", "blueR9Nta", "rate", "resident", "nhi", "localTax"],
      official: ["ntaGuide"],
    },
    furusatoYearPageEn(),
  ];
}

const pct = (per100k: number): string => `${per100k / 1_000}%`;

function furusatoYearPageEn(): PageEn {
  const input500 = yearSalaryInput(5_000_000);
  const c500 = compareFurusatoLimit(input500);
  const c600 = compareFurusatoLimit(yearSalaryInput(6_000_000));
  const c200 = compareFurusatoLimit(yearSalaryInput(2_000_000));
  const { previous: p, current: c } = c500;
  const burdenAtNew = yearOutOfPocket(input500, c.limit);
  const burdenAtOld = yearOutOfPocket(input500, p.limit);
  const { scans, freelanceScan } = yearScans();
  const single = scans[0]?.scan;
  if (!single) throw new Error("走査の結果がありません");
  const cases = (n: number): string => `${num(n)}`;
  const scanNote = `Counts are for ${num(single.total)} cases: salary (income, for freelancers) from ${million(YEAR_SCAN.from)} to ${million(YEAR_SCAN.to)} in steps of ${yenEn(YEAR_SCAN.step)}, with social insurance premiums at ${PCT}% of salary (income).`;
  const Y25 = "Tax year 2025";
  const Y26 = "Tax year 2026";

  return {
    kind: "furusato-year",
    title: "Is your furusato nozei limit lower for 2026? Compare it with 2025 | setsuzei",
    h1: "Is your furusato nozei limit lower for 2026? Compare it with 2025",
    short: "Furusato nozei limit: 2025 vs 2026",
    description:
      "Compare your furusato nozei (hometown tax) donation limit for tax year 2025 and tax year 2026 (donations made in 2026). The higher basic exemption lowers the limit only in some income bands; for most people it is unchanged. With tables by salary and the legal basis. Nothing you enter is sent anywhere.",
    lead: `For tax year 2026 (donations made during 2026) the limit is lower than for 2025 in some income bands, because the basic exemption for income tax went up. For most people it is unchanged, and at the same income it goes up for no one. For example, a single person with a ¥5,000,000 salary goes from ${yenEn(p.limit)} to ${yenEn(c.limit)}, while at ¥6,000,000 it stays at ${yenEn(c600.current.limit)} (assuming social insurance at ${PCT}% of salary). Enter your income to see both years and the reason for any change.`,
    form: `<fieldset>
    <legend>Income</legend>
    ${field("salary", "Salary", "Gross for the year: the “支払金額” box on your withholding slip (gensen choshuhyo)", "e.g. 5,000,000", "5,000,000")}
    ${field("social-insurance", "Social insurance premiums", "The “社会保険料等の金額” box on your withholding slip, or National Health Insurance plus National Pension for the year", "e.g. 750,000", "750,000")}
    ${field("revenue", "Freelance or side-business revenue", "Leave empty if none", "e.g. 8,000,000")}
    ${field("expenses", "Expenses for it", "", "e.g. 1,500,000")}
    <label>Special deduction for blue returns
      <select name="blue">
        <option value="none" selected>None (salary only, or a white return)</option>
        <option value="10">Blue return, ¥100,000</option>
        <option value="55">Blue return, ¥550,000</option>
        <option value="65">Blue return, ¥650,000</option>
      </select></label>
  </fieldset>
  <fieldset>
    <legend>Family and deductions</legend>
    <label>Spouse<span class="sub">The comparison does not cover a spouse who has income</span>
      <select name="spouse-income">
        <option value="" selected>No exemption for a spouse (single, both working, etc.)</option>
        <option value="0">Spouse with no income</option>
      </select></label>
    ${field("dependents", "Dependents aged 16 to 18 or 23 to 69", "", "0")}
    ${field("dependents-specific", "Dependents aged 19 to 22", "", "0")}
    ${field("ideco-paid", "iDeCo contributions", "Expected total for the year", "e.g. 276,000")}
    ${field("kyosai-paid", "Small Business Mutual Aid contributions", "Expected total for the year")}
    ${field("other-deductions", "Other deductions, in total", "Life insurance premiums, medical expenses and so on")}
  </fieldset>
  <p class="hint">To also see what extra iDeCo or Small Business Mutual Aid contributions would save, use <a id="full" href="../">the full calculator</a>.</p>`,
    formula: `<p>The short answer first. For tax year 2026 the limit goes down only if one of the following applies to you. Otherwise, with the same income and deductions, it is the same as for 2025. In no case does it go up at the same income and deductions (0 cases in the scan below).</p>
  <ul>
    <li><strong>You were just above one of the thresholds that set the rate of the special portion (¥0, ¥1.95 million, ¥3.3 million, ¥6.95 million, ¥9 million, ¥18 million).</strong> For a single person with social insurance at ${PCT}% of salary, that means a salary of ${scanRangeText({ ranges: single.ranges.filter((r) => r.from >= 2_200_000) })}.</li>
    <li><strong>Your salary is under ¥2.2 million.</strong> The minimum employment income deduction rose from ¥650,000 to ¥740,000 (${src("salaryDeduction")}), which lowers the income-based part of resident tax. Because the limit is rounded down to ¥1,000, it sometimes stays the same.</li>
  </ul>
  <h3>The formula</h3>
  <p class="formula">Limit = income-based part of resident tax × 20% ÷ rate of the special portion + ¥2,000</p>
  <ul>
    <li>Of the resident tax credit for furusato nozei, the “special portion” is capped at 20% of the income-based part of your resident tax. The donation that reaches the cap is the limit at which you pay about ¥2,000 yourself (${src("localTax202604", "Local Tax Act, Art. 314-7 paras. 1 and 11; Art. 37-2 for prefectural tax")}; ${src("furusatoMic")}).</li>
    <li>The rate of the special portion is 90% − income tax rate × 1.021, in steps: 84.895% (5% income tax), 79.79% (10%), 69.58% (20%) and so on (the table in item 1 of the same paragraph, and Supplementary Provisions Art. 5-6).</li>
    <li>Which step applies is set by your resident-tax taxable income minus the “personal-deduction adjustment” (item 1 of the same paragraph).</li>
  </ul>
  <h3>What changed</h3>
  <ul>
    <li>Act No. 2 of 2026 amended Art. 314-7 para. 11 item 1 (Art. 37-2 para. 11 item 1 for prefectural tax) so that the personal-deduction adjustment now includes <strong>the basic exemption for income tax minus ¥480,000</strong> (zero if negative). It took effect on April 1, 2026 and applies from fiscal 2026 resident tax, that is, from donations made in 2025 (${src("localTax202604", "the amended text and Supplementary Provisions Art. 11 para. 1")}; ${src("mofKaisetsu")}). Only the income tax exemption was raised, while the resident tax basic deduction stayed at ¥430,000, so the way the rate is chosen was adjusted to match the income tax rate people actually pay.</li>
    <li>The formula changed for 2025. The further difference for 2026 comes from the income tax basic exemption rising again (${src("basic")}): for total income of ¥4.89 million or less, from ¥880,000 or ¥680,000 (¥950,000 at ¥1.32 million or less) to ¥1,040,000; above ¥4.89 million up to ¥6.55 million, from ¥630,000 to ¥670,000; above ¥6.55 million up to ¥23.5 million, from ¥580,000 to ¥620,000. A larger subtraction lowers the amount that picks the rate, and some people move down one income tax bracket.</li>
    <li>One bracket lower means a higher rate for the special portion (for example 79.79% → 84.895%). At a higher rate the same donation produces a larger special portion, so the cap (20% of the income-based part) is reached with a smaller donation. That is why the limit goes down.</li>
    <li>The income-based part of resident tax itself is unchanged for salaries of ¥2.2 million or more. The resident tax basic deduction, spouse and dependent deductions and the adjustment credit are the same provisions in both years (Local Tax Act, Arts. 314-2 and 314-6).</li>
  </ul>
  <h3>Worked example: ¥5,000,000 salary, single (social insurance ¥750,000)</h3>
  ${table(
    "Limit for a ¥5,000,000 salary, single: tax year 2025 and tax year 2026",
    ["", Y25, Y26],
    [
      ["Employment income (¥5,000,000 − employment income deduction ¥1,440,000)", yenEn(p.salaryIncome), yenEn(c.salaryIncome)],
      ["Resident-tax taxable income (− social insurance ¥750,000 − basic deduction ¥430,000)", yenEn(p.residentTaxableIncome), yenEn(c.residentTaxableIncome)],
      ["Income-based part of resident tax (× 10% − adjustment credit ¥2,500)", yenEn(p.incomeLevy), yenEn(c.incomeLevy)],
      ["Cap on the special portion (× 20%)", yenEn(p.specialCap), yenEn(c.specialCap)],
      ["Basic exemption for income tax", yenEn(p.incomeTaxBasicDeduction), yenEn(c.incomeTaxBasicDeduction)],
      ["Personal-deduction adjustment (¥50,000 + basic exemption − ¥480,000)", yenEn(p.adjustmentAmount), yenEn(c.adjustmentAmount)],
      ["Amount that picks the rate (taxable income − the adjustment)", yenEn(p.rateBase), yenEn(c.rateBase)],
      ["Rate of the special portion", pct(p.specialRatePer100k), pct(c.specialRatePer100k)],
      ["Limit (cap ÷ rate + ¥2,000, rounded down to ¥1,000)", yenEn(p.limit), yenEn(c.limit)],
    ],
  )}
  <p class="note">For 2025 the amount that picks the rate is above ¥1.95 million, giving 79.79%; for 2026 it is ¥1.95 million or less, giving 84.895%. The income-based part of resident tax is the same in both years.</p>
  <h3>Checked against other material</h3>
  <ul>
    <li>The ministry's “annual limit” chart was made under the rules before the basic exemption was raised (¥61,000 for a ¥5,000,000 salary, single). As far as we could find, no official chart reflects tax year 2026 yet. The 2026 figures on this page are calculated from the provisions above.</li>
    <li>Municipalities describe the change to the formula in the same way (${src("nerima")}; ${src("ikoma")}).</li>
    <li>Independent write-ups using the same assumptions (¥5,000,000 salary, single, ¥750,000 social insurance) get about ¥61,000 for 2025 and about ¥57,000 for 2026, matching this page. These are not primary sources, and they are in Japanese: ${CROSS_CHECKS.map((x, i) => `<a href="${esc(x.url)}" rel="noopener noreferrer" hreflang="ja">write-up ${i + 1} (Japanese only)</a>`).join(", ")}.</li>
  </ul>`,
    examplesTitle: "Tables by income",
    examples:
      table(
        "Furusato nozei limit by salary (tax year 2025 → tax year 2026)",
        ["Salary", ...YEAR_FAMILIES.map((x) => FAMILY_EN[x.key])],
        yearSalaryRows().map((r) => [yenEn(r.salary), ...r.cells.map(yearCellEn)]),
      ) +
      `\n  <p class="note">Assumptions: salary only, social insurance premiums at ${PCT}% of salary, no other deductions. “No change” means the same amount as for 2025 at the same income and deductions. Tax year 2025 is calculated with only the income tax basic exemption and the employment income deduction set to that year's amounts.</p>\n  ` +
      table(
        "Furusato nozei limit for freelancers by income (tax year 2025 → tax year 2026)",
        ["Income (revenue − expenses)", "Single, ¥650,000 blue-return deduction"],
        yearFreelanceRows().map((r) => [yenEn(r.income), yearCellEn(r.cell)]),
      ) +
      `\n  <p class="note">Assumptions: a freelancer with no salary, the ¥650,000 special deduction for blue returns, no dependents, social insurance premiums at ${PCT}% of income (revenue minus expenses).</p>\n  ` +
      table(
        "How many cases go down, stay the same or go up",
        ["Assumptions", "Lower", "Same", "Higher", "Income ranges where it is lower (largest drop)"],
        [
          ...scans.map((x) => [`Salary only, ${FAMILY_EN[x.key as keyof typeof FAMILY_EN].toLowerCase()}`, cases(x.scan.lower), cases(x.scan.same), cases(x.scan.higher), scanRangeText(x.scan)]),
          ["Freelancer, single, ¥650,000 blue-return deduction (scanned by income)", cases(freelanceScan.lower), cases(freelanceScan.same), cases(freelanceScan.higher), scanRangeText(freelanceScan)],
        ],
      ) +
      `\n  <p class="note">${esc(scanNote)} The ranges shift with your premiums and deductions, so check your own figures in the calculator above. At higher incomes the ranges are narrower but the drop is larger.</p>`,
    faqs: [
      {
        q: "Does everyone's furusato nozei limit go down for 2026?",
        a: `No, only in some income bands. For a single person on salary only with social insurance at ${PCT}%, scanning salaries from ${million(YEAR_SCAN.from)} to ${million(YEAR_SCAN.to)} in steps of ${yenEn(YEAR_SCAN.step)} gives ${num(single.total)} cases: ${num(single.lower)} lower, ${num(single.same)} unchanged and ${num(single.higher)} higher. A single person with a ¥6,000,000 salary, for example, stays at ${yenEn(c600.previous.limit)}.`,
      },
      {
        q: "Why would a higher basic exemption lower anyone's limit?",
        a: `The limit is the income-based part of resident tax × 20% ÷ the rate of the special portion + ¥2,000, and that rate is higher when your income tax rate is lower (90% − income tax rate × 1.021). When the higher exemption moves you down one income tax bracket, the rate goes up and the 20% cap is reached with a smaller donation. The resident tax basic deduction is still ¥430,000, so the income-based part does not grow. The rule that brings the income tax exemption into the choice of rate is the amendment of Local Tax Act Art. 314-7 para. 11 item 1 by Act No. 2 of 2026 (${src("localTax202604")}; ${src("mofKaisetsu")}).`,
      },
      {
        q: "Does a lower limit mean I am worse off?",
        a: `Only the amount you can donate at ¥2,000 out of pocket goes down; your tax burden does not go up. The limit falls for people whose income tax fell and whose bracket dropped. In the ¥5,000,000, single example, donating the 2026 limit of ${yenEn(c.limit)} costs ${yenEn(burdenAtNew)} out of pocket (donation minus the income tax and resident tax saved, by this calculator's 2026 calculation). Furusato nozei cuts tax by the donation minus the out-of-pocket amount; it does not leave you with more cash (${src("furusatoMic")}).`,
      },
      {
        q: "What happens if I donate up to my 2025 limit?",
        a: `Above the limit the special portion stops growing and the excess is out of pocket. In the ¥5,000,000, single example, donating the 2025 limit of ${yenEn(p.limit)} during 2026 costs ${yenEn(burdenAtOld)} out of pocket, against ${yenEn(burdenAtNew)} at the 2026 limit of ${yenEn(c.limit)}. Recalculate with this year's forecast rather than reusing a chart or last year's amount.`,
      },
      {
        q: "The ministry's chart says ¥61,000 for a ¥5,000,000 salary, single. Which is right?",
        a: `The ministry's chart was made under the rules before the basic exemption was raised. Up to tax year 2025 the limit under these assumptions is ${yenEn(p.limit)}, the same as the chart. For tax year 2026 (donations made in 2026) the provisions give ${yenEn(c.limit)} (${src("localTax202604", "Local Tax Act, Art. 314-7 para. 11 item 1")}; ${src("basic")}). We could not find an official chart that reflects 2026, so the figures here are calculated from the law. You can confirm the real amount on the resident tax notice that arrives around June of the following year.`,
      },
      {
        q: "Why does it go down for salaries under ¥2.2 million?",
        a: `Because the minimum employment income deduction rose from ¥650,000 for 2025 to ¥740,000 for 2026 (${src("salaryDeduction")}). Lower employment income means a lower income-based part of resident tax, and the cap on the special portion is 20% of that. A single person with a ¥2,000,000 salary (social insurance ¥300,000) goes from ${yenEn(c200.previous.limit)} to ${yenEn(c200.current.limit)}.`,
      },
      {
        q: "From which donations does this apply?",
        a: `Donations made from January 1 to December 31, 2026 belong to tax year 2026 and are deducted from 2026 income tax and fiscal 2027 resident tax. The higher basic exemption takes effect on December 1, 2026 but applies to the whole of tax year 2026 (${src("kaisei")}; ${src("basic")}).`,
      },
    ],
    sources: ["localTax202604", "mofKaisetsu", "basic", "salaryDeduction", "incomeTaxLaw", "furusatoMic", "kaisei", "nerima", "ikoma", "rate", "resident"],
    official: ["ntaGuide"],
  };
}

function renderPageEn(p: PageEn, all: readonly PageEn[]): string {
  const slug = EN_SLUG[p.kind];
  const url = `${EN_URL}${slug}/`;
  const others = all.filter((o) => o.kind !== p.kind);
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: "en",
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
      { "@type": "ListItem", position: 1, name: "setsuzei", item: EN_URL },
      { "@type": "ListItem", position: 2, name: p.short, item: url },
    ],
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${url}">
${alternateLinks(p.kind)}
<meta property="og:type" content="website">
<meta property="og:site_name" content="setsuzei">
<meta property="og:locale" content="en_US">
<meta property="og:locale:alternate" content="ja_JP">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:image" content="${SITE_URL}img/ogp.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0b6b57">
<link rel="icon" href="../../img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="../../style.css">
${jsonLd(webApplicationLd(url, p.h1, p.description, "en"))}
${jsonLd(faqLd)}
${jsonLd(breadcrumbLd)}
</head>
<body class="article">
<a class="skip" href="#results">Skip to the result</a>
<header class="site">
  <p class="brand"><a href="../"><span class="mark" aria-hidden="true">税</span></a><a href="../">setsuzei</a><span class="tag">Tax year 2026 · estimate</span><a class="lang" href="../../${JA_SLUG[p.kind]}/" lang="ja" hreflang="ja">日本語</a></p>
  <p class="crumbs"><a href="../">Full year-end calculator</a> › ${esc(p.short)}</p>
  <h1>${esc(p.h1)}</h1>
  <p class="lead">${esc(p.lead)}</p>
  <p class="privacy">An estimate for tax year 2026 (Reiwa 8; income from January to December 2026). What you enter is calculated on this page only; it is not sent or stored anywhere.</p>
</header>

<main>
<form id="form" autocomplete="off" novalidate data-kind="${p.kind}">
  <p class="hint">Enter every amount in yen as your <strong>forecast for the whole year</strong>. <code>6,000,000</code>, <code>6m</code> and <code>600万</code> all work. The form starts with example figures.</p>
  ${p.form}
</form>

<div class="results" id="results">
  <h2>Result</h2>
  <div id="result" aria-live="polite"><p class="placeholder">Enter your ${p.kind === "furusato-year" ? "income" : "revenue"} and the result appears here.</p></div>
  <noscript><p class="card error">The calculator needs JavaScript. The tables below can be read without it.</p></noscript>
  <section class="card disclaimer">
    <h3>About this result</h3>
    <p><strong>This is an estimate</strong> based on the figures you entered and simplified assumptions. Your actual tax depends on what you file and on your municipality. It does not replace the judgment of a tax accountant (zeirishi), the tax office or your city office. Check with a professional or the office in charge before any important decision.</p>
    <p>It assumes you are a resident of Japan for tax purposes for the whole year and still live in Japan on January 1 next year. Foreign income, tax treaties and the rules for non-residents are not handled.</p>
  </section>
</div>
</main>

<article class="prose">
<section>
  <h2>How it is calculated, and the basis</h2>
  ${p.formula}
</section>

<section>
  <h2>${esc(p.examplesTitle)}</h2>
  ${p.examples}
</section>

<section>
  <h2>Common questions</h2>
  ${p.faqs.map((faq) => `<h3>${esc(faq.q)}</h3>\n  <p>${faq.a}</p>`).join("\n  ")}
</section>

<section>
  <h2>Sources</h2>
  <p>Official pages in English:</p>
  <ul class="sources">
    ${p.official.map((key) => `<li>${official(key)}</li>`).join("\n    ")}
  </ul>
  <p>Primary sources the numbers were checked against:</p>
  <ul class="sources">
    ${p.sources.map((key) => `<li>${src(key)}</li>`).join("\n    ")}
  </ul>
  <p class="note">Every number was checked against a primary source and is kept in a <a href="${REPO_URL}/blob/main/src/data/2026.ts" rel="noopener">data file with the source URLs</a>. The assumptions, and what is not calculated, are in the <a href="${REPO_URL}/blob/main/README.en.md" rel="noopener">README</a>. English terms follow the NTA's English income tax guide where it has one. Last reviewed: ${LAST_REVIEWED}.</p>
</section>

<nav class="related" aria-label="Other calculators">
  <h2>Other calculators</h2>
  <ul>
    <li><a href="../">Full year-end calculator (furusato nozei + iDeCo + Small Business Mutual Aid + blue return)</a></li>
    ${others.map((o) => `<li><a href="../${EN_SLUG[o.kind]}/">${esc(o.h1)}</a></li>`).join("\n    ")}
  </ul>
</nav>
</article>

<a id="jump" class="jump" href="#results" hidden></a>

<footer class="site">
  <p>setsuzei · MIT License · The same calculation runs on the command line with <code>npx setsuzei</code> (Node.js 20 or later; output in Japanese). · <a href="${REPO_URL}/blob/main/README.en.md" rel="noopener">How to run it, source code and assumptions (GitHub)</a> · <a href="../../${JA_SLUG[p.kind]}/" lang="ja" hreflang="ja">日本語版</a></p>
</footer>
<script type="module" src="../../js/web/page.js"></script>
</body>
</html>
`;
}

/** 英語のトップから各ページへ張るリンク（docs/en/index.html に同じものがあることをテストで確かめる） */
export function pageLinksEn(): { slug: string; label: string }[] {
  return buildPagesEn().map((p) => ({ slug: EN_SLUG[p.kind], label: p.h1 }));
}

/** 生成するファイル（docs/ からの相対パス → 内容） */
export function renderSiteEn(): Map<string, string> {
  const pages = buildPagesEn();
  if (pages.length !== PAGE_KINDS.length) throw new Error("英語版のページが日本語版とそろっていません");
  const files = new Map<string, string>();
  for (const p of pages) files.set(`en/${EN_SLUG[p.kind]}/index.html`, renderPageEn(p, pages));
  return files;
}
