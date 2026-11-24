import type { ContributionMeasure, Saving, SetsuzeiResult } from "../core/types.js";

const yen = (n: number): string => `${n.toLocaleString("ja-JP")} 円`;

/** 端末上の表示幅（全角 = 2）。 */
function width(text: string): number {
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    w += wide ? 2 : 1;
  }
  return w;
}

const padEnd = (text: string, w: number): string => text + " ".repeat(Math.max(0, w - width(text)));
const padStart = (text: string, w: number): string => " ".repeat(Math.max(0, w - width(text))) + text;

/** 1 列目は左寄せ、2 列目以降は右寄せの表。 */
function table(rows: readonly (readonly string[])[], indent = "  "): string[] {
  const columns = Math.max(...rows.map((r) => r.length));
  const widths = Array.from({ length: columns }, (_, i) => Math.max(...rows.map((r) => width(r[i] ?? ""))));
  return rows.map((row) =>
    (
      indent +
      row.map((cell, i) => (i === 0 ? padEnd(cell, widths[i] ?? 0) : padStart(cell, widths[i] ?? 0))).join("  ")
    ).trimEnd(),
  );
}

function savingCells(s: Saving): string[] {
  return [yen(s.total), yen(s.incomeTax), yen(s.residentTax)];
}

function bullet(notes: readonly string[]): string[] {
  return notes.map((n) => `    ・${n}`);
}

function contributionRow(name: string, m: ContributionMeasure): string[] {
  return [`${name}（あと ${yen(m.additional)}）`, ...savingCells(m.saving)];
}

const BLUE_LABEL = { none: "白色申告（控除なし）", "10": "青色 10万円", "55": "青色 55万円", "65": "青色 65万円" } as const;

/** 人が読むための出力を組み立てる。 */
export function formatResult(r: SetsuzeiResult, version: string): string {
  const b = r.baseline;
  const m = r.measures;
  const out: string[] = [];

  out.push(`setsuzei ${version} ｜ ${r.label}（${r.year}年分）の概算`);
  out.push("");
  out.push("■ 現状の見込み");
  const income: string[][] = [];
  if (r.input.salaryRevenue > 0) income.push(["給与所得", yen(b.salaryIncome)]);
  if (r.input.businessRevenue > 0 || r.input.businessExpenses > 0) {
    const kind = r.input.businessIncomeType === "business" ? "事業所得" : "雑所得";
    const blue = b.blueDeductionApplied > 0 ? `（青色申告特別控除 ${yen(b.blueDeductionApplied)}を控除後）` : "";
    income.push([`${kind}${blue}`, yen(b.businessIncome)]);
  }
  income.push(["合計所得金額", yen(b.totalIncome)]);
  income.push([`所得税の課税所得（税率 ${b.incomeTax.marginalRatePercent}%）`, yen(b.incomeTax.taxableIncome)]);
  income.push(["所得税 + 復興特別所得税", yen(b.incomeTax.total)]);
  income.push([`住民税（${r.residentTaxLabel}・均等割と森林環境税を含む）`, yen(b.residentTax.total)]);
  income.push(["税額の合計", yen(b.totalTax)]);
  out.push(...table(income));
  out.push("");

  out.push("■ 年末までにできることと、減る税額の目安");
  const rows: string[][] = [["", "合計", "所得税", "住民税"]];
  const f = m.furusato;
  if (f.limit > 0) rows.push([`ふるさと納税（あと ${yen(f.remaining)}）`, ...savingCells(f.saving)]);
  if (m.ideco.applicable) rows.push(contributionRow("iDeCo", m.ideco));
  if (m.kyosai.applicable) rows.push(contributionRow("小規模企業共済", m.kyosai));
  if (rows.length > 1) out.push(...table(rows));
  out.push("  ※ それぞれ単独で実行した場合の軽減額です。組み合わせると合計は単純な足し算より小さくなることがあります。");
  out.push("");

  out.push("  ◆ ふるさと納税");
  if (f.limit > 0) {
    out.push(
      ...table(
        [
          ["控除上限額の目安（年間）", yen(f.limit)],
          ["寄附済み", yen(f.paid)],
          ["上限までの残り", yen(f.remaining)],
          ["上限まで寄附した場合の自己負担", yen(f.outOfPocket)],
          ...(f.limitAfterOtherMeasures !== f.limit
            ? [["下の iDeCo・共済を追加した場合の上限", yen(f.limitAfterOtherMeasures)]]
            : []),
        ],
        "    ",
      ),
    );
  }
  out.push(...bullet(f.notes));
  out.push("");

  for (const [name, c] of [
    ["iDeCo（個人型確定拠出年金）", m.ideco],
    ["小規模企業共済", m.kyosai],
  ] as const) {
    out.push(`  ◆ ${name}`);
    if (c.applicable) {
      out.push(
        ...table(
          [
            ["年間上限", yen(c.annualLimit)],
            ["支払済み", yen(c.paid)],
            ["残り枠", yen(c.remaining)],
            [`${yen(c.additional)}を追加した場合の軽減額`, yen(c.saving.total)],
          ],
          "    ",
        ),
      );
    }
    out.push(...bullet(c.notes));
    out.push("");
  }

  out.push("  ◆ 青色申告特別控除");
  if (m.blueReturn.applicable) {
    const blueRows: string[][] = [["", "税額の合計", "現在との差"]];
    for (const o of m.blueReturn.options) {
      const diff = o.savingVsCurrent.total;
      const diffText = o.current ? "（現在）" : diff >= 0 ? `${yen(diff)} 減` : `${yen(-diff)} 増`;
      blueRows.push([BLUE_LABEL[o.level], yen(o.totalTax), diffText]);
    }
    out.push(...table(blueRows, "    "));
  }
  out.push(...bullet(m.blueReturn.notes));
  out.push("");

  if (r.warnings.length > 0) {
    out.push("■ 注意");
    out.push(...r.warnings.map((w) => `  ・${w}`));
    out.push("");
  }

  out.push("■ 免責");
  out.push(`  ${r.disclaimer}`);
  out.push("  計算していないもの: 国民健康保険料、個人事業税、消費税、住民税の非課税判定、分離課税の所得、住宅ローン控除など。");
  out.push("  根拠にした一次情報の一覧は `setsuzei --sources` で表示できます。");
  return out.join("\n");
}
