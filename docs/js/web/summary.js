import { VERSION } from "../src/version.js";
import { browserNote } from "./logic.js";
const yen = (n) => `${n.toLocaleString("ja-JP")} 円`;
const BLUE = { none: "なし（白色申告）", "10": "10 万円", "55": "55 万円", "65": "65 万円" };
/** 計算に使った値を、[項目名, 値] の並びにする。 */
export function usedInputs(top) {
    const n = top.result.input;
    const rows = [];
    if (n.salaryRevenue > 0)
        rows.push(["会社の年収（給与収入）", yen(n.salaryRevenue)]);
    if (n.businessRevenue > 0 || n.businessExpenses > 0 || n.salaryRevenue === 0) {
        rows.push([n.salaryRevenue > 0 ? "副業の売上" : "売上", yen(n.businessRevenue)]);
        rows.push(["経費", yen(n.businessExpenses)]);
        rows.push(["所得の種類", n.businessIncomeType === "business" ? "事業所得" : "雑所得"]);
        if (n.businessIncomeType === "business")
            rows.push(["青色申告特別控除", BLUE[n.blueReturn]]);
    }
    rows.push(["社会保険料", top.insurance ? `${yen(n.socialInsurance)}（目安。幅は ${yen(top.insurance.low)}〜${yen(top.insurance.high)}）` : yen(n.socialInsurance)]);
    rows.push(["iDeCo の掛金（ことしの合計）", yen(n.idecoPaid)]);
    rows.push(["小規模企業共済の掛金（ことしの合計）", yen(n.kyosaiPaid)]);
    rows.push(["ふるさと納税の寄附済みの額", yen(n.furusatoPaid)]);
    rows.push(["そのほかの控除", yen(n.otherDeductions)]);
    rows.push([
        "配偶者",
        n.spouse ? `いる（合計所得金額 ${yen(n.spouse.income)}${n.spouse.age70OrOlder ? "・70 歳以上" : ""}）` : "なし",
    ]);
    const d = n.dependents;
    const family = [
        d.under16 > 0 ? `16 歳未満 ${d.under16} 人` : "",
        d.general > 0 ? `16〜18 歳・23〜69 歳 ${d.general} 人` : "",
        d.specific > 0 ? `19〜22 歳 ${d.specific} 人` : "",
        d.elderlyCohabiting > 0 ? `70 歳以上（同居の父母など） ${d.elderlyCohabiting} 人` : "",
        d.elderly > 0 ? `70 歳以上（それ以外） ${d.elderly} 人` : "",
    ].filter((text) => text !== "");
    rows.push(["扶養している家族", family.length > 0 ? family.join("、") : "なし"]);
    return rows;
}
/** 年内にやることを 1 行ずつにする。 */
export function planLines(plan, result) {
    const lines = [];
    const f = plan.furusato;
    if (f.amount > 0) {
        lines.push(`ふるさと納税: ${f.paid > 0 ? "あと " : ""}${yen(f.amount)}寄附する → 税金が ${yen(f.saving.total)}減る（12 月 31 日までに寄附した分。上限の目安は年間 ${yen(f.limit)}）`);
    }
    if (plan.kyosai && plan.kyosai.amount > 0) {
        lines.push(`小規模企業共済: ${plan.kyosai.paid > 0 ? "掛金をあと " : "加入して掛金を "}${yen(plan.kyosai.amount)}払う → 税金が ${yen(plan.kyosai.saving.total)}減る（12 月 31 日までに支払った分）`);
    }
    if (plan.ideco.included && plan.ideco.amount > 0) {
        lines.push(`iDeCo: 掛金をあと ${yen(plan.ideco.amount)}払う → 税金が ${yen(plan.ideco.saving.total)}減る（12 月の引落し分まで）`);
    }
    if (lines.length === 0)
        lines.push("いまの見込みでは、年内に追加で払って税金が減るものはありません。");
    void result;
    return lines;
}
/** 結果の全体を文章にする。date は「2026-11-27」の形。 */
export function summaryText(top, date) {
    const r = top.result;
    const b = r.baseline;
    const plan = top.plan;
    const out = [];
    out.push(`年末までに、あと何をすればいくら税金が減るか（${r.label}の概算）`);
    out.push(`setsuzei ${VERSION} で ${date} に計算`);
    out.push("");
    out.push("■ 年内にやること");
    planLines(plan, r).forEach((line, index) => out.push(`${index + 1}. ${line}`));
    if (plan.totalPayment > 0) {
        out.push(`合計: 年内に ${yen(plan.totalPayment)}払うと、税金が ${yen(plan.saving.total)}減る見込み（税額 ${yen(plan.taxBefore)} → ${yen(plan.taxAfter)}）`);
        if (plan.furusato.amount > 0) {
            out.push("※ ふるさと納税の分は寄附と引き換えで、手元のお金は増えません（得になるのは返礼品の分）。掛金は自分の積立として残ります。");
        }
    }
    if (plan.furusato.skipped) {
        const k = plan.furusato.skipped;
        out.push(`※ ふるさと納税は、やることに入れていません。上限の目安まで ${yen(k.amount)}寄附しても、減る税額は ${yen(k.saving.total)}で、自己負担（${yen(k.amount - k.saving.total)}）のほうが大きいためです。`);
    }
    if (plan.budget)
        out.push(`※ 年内に出せるお金を ${yen(plan.budget.amount)}として配分しています。${plan.budget.reason}`);
    if (plan.kyosai?.ifJoined && !plan.kyosai.custom) {
        out.push(`※ 小規模企業共済は、いま加入していないので合計に入れていません。新しく加入して ${yen(plan.kyosai.ifJoined.amount)}を年内に払えた場合は、それだけで税金が ${yen(plan.kyosai.ifJoined.saving.total)}減ります（11 月・12 月の申込みは、窓口で現金で払う手続きが必要）。`);
    }
    if (!plan.ideco.included && r.measures.ideco.additional > 0) {
        out.push(`※ iDeCo は合計に入れていません。限度額までの残り ${yen(r.measures.ideco.additional)}を年内に払えた場合は、それだけで税金が ${yen(r.measures.ideco.saving.total)}減ります（年内に増やせるかは加入先と時期しだい）。`);
    }
    out.push("");
    out.push("■ いまの税額の見込み");
    out.push(`所得税 + 復興特別所得税: ${yen(b.incomeTax.total)}`);
    out.push(`住民税（${r.residentTaxLabel}）: ${yen(b.residentTax.total)}`);
    out.push(`合計: ${yen(b.totalTax)}`);
    out.push("");
    out.push("■ 計算に使った値（年額の見込み）");
    for (const [label, value] of usedInputs(top))
        out.push(`${label}: ${value}`);
    if (top.assumptions.length > 0) {
        out.push("");
        out.push("■ 入力していないので、仮に置いた値");
        for (const a of top.assumptions)
            out.push(`- ${a.text}`);
    }
    if (r.warnings.length > 0) {
        out.push("");
        out.push("■ 注意");
        for (const w of r.warnings)
            out.push(`- ${browserNote(w)}`);
    }
    out.push("");
    out.push("概算です。入力値と簡略化した前提にもとづく目安で、実際の税額は申告内容やお住まいの自治体によって変わります。税理士や税務署・市区町村の判断に代わるものではありません。");
    out.push("https://ozko00.github.io/setsuzei/");
    return out.join("\n");
}
