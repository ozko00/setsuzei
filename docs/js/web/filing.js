import { webMessages } from "./messages.js";
function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs))
        el.setAttribute(key, value);
    for (const child of children)
        if (child !== null)
            el.append(child);
    return el;
}
const SHEETS = ["first", "second", "resident", "blue"];
/** 欄の一覧（シートごとの見出し + 欄の番号・名前・金額・説明） */
export function filingList(g, t = webMessages()) {
    const out = [];
    if (g.draft)
        out.push(h("p", { class: "sub filing-form" }, `${g.form} — ${t.filingDraftBadge}`));
    for (const sheet of SHEETS) {
        const entries = g.entries.filter((e) => e.sheet === sheet);
        if (entries.length === 0)
            continue;
        out.push(h("h4", {}, t.filingSheet[sheet]), h("ul", { class: "filing", "data-sheet": sheet }, ...entries.map((e) => h("li", {}, h("span", { class: "filing-box" }, `${e.field ? `${e.field} ` : ""}${e.label}`), h("strong", { class: "filing-amount" }, e.amount === null ? (e.field === "㊾" ? t.filingNotCalculated : t.filingNoAmount) : t.yen(e.amount)), h("span", { class: "sub" }, e.note)))));
    }
    out.push(h("ul", { class: "notes" }, ...g.notes.map((n) => h("li", {}, n))));
    out.push(h("p", { class: "sub" }, h("a", { href: g.sourceUrl, rel: "noopener noreferrer", target: "_blank", hreflang: "ja" }, t.filingSourceLink)));
    return out;
}
/** 医療費控除（通常とセルフメディケーション税制の比較）の行 */
export function medicalRows(med, t) {
    const rows = [];
    if (med.normal.netExpenses > 0) {
        rows.push([t.medNormalRow(med.normal.deduction, med.normal.totalTax), med.method === "normal" ? t.medUsed : "", med.method === "normal" ? "current" : undefined]);
    }
    if (med.selfMedication.expenses > 0) {
        rows.push([
            t.medSelfRow(med.selfMedication.deduction, med.selfMedication.totalTax),
            med.method === "selfMedication" ? t.medUsed : "",
            med.method === "selfMedication" ? "current" : undefined,
        ]);
    }
    rows.push([t.medSaving, t.yen(med.saving.total), "strong"]);
    return rows;
}
/** 生命保険料控除の行 */
export function lifeRows(life, t) {
    return [
        [t.lifeRow(t.lifeLife, life.incomeTax.life, life.residentTax.life), ""],
        [t.lifeRow(t.lifeCare, life.incomeTax.medicalCare, life.residentTax.medicalCare), ""],
        [t.lifeRow(t.lifePension, life.incomeTax.pension, life.residentTax.pension), ""],
        [t.lifeRow(t.lifeTotal, life.incomeTax.total, life.residentTax.total), ""],
        [t.lifeSaving, t.yen(life.saving.total), "strong"],
    ];
}
