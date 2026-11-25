import { getSources } from "../src/data/index.js";
import { VERSION } from "../src/version.js";
import { compute, isBlank, queryToValues, splitIssue } from "./logic.js";
function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs))
        el.setAttribute(key, value);
    for (const child of children) {
        if (child === null || child === false || child === undefined)
            continue;
        el.append(child);
    }
    return el;
}
const yen = (n) => `${n.toLocaleString("ja-JP")} 円`;
/** 項目名と金額の行を並べた表 */
function rows(items) {
    return h("dl", { class: "rows" }, ...items.map(([label, value, cls]) => h("div", { class: cls ? `row ${cls}` : "row" }, h("dt", {}, label), h("dd", {}, value))));
}
function notes(list) {
    return list.length === 0 ? null : h("ul", { class: "notes" }, ...list.map((n) => h("li", {}, n)));
}
function savingRows(s) {
    return [
        ["減る税額", yen(s.total), "strong"],
        ["　うち所得税", yen(s.incomeTax)],
        ["　うち住民税", yen(s.residentTax)],
    ];
}
function card(title, ...children) {
    return h("section", { class: "card" }, h("h3", {}, title), ...children);
}
function contributionCard(title, m) {
    if (!m.applicable)
        return card(title, notes(m.notes));
    return card(title, rows([
        ["年間上限", yen(m.annualLimit)],
        ["支払済み", yen(m.paid)],
        ["残り枠", yen(m.remaining)],
        [`追加する額`, yen(m.additional)],
        ...savingRows(m.saving),
    ]), notes(m.notes));
}
const BLUE_LABEL = { none: "白色申告", "10": "青色 10万円", "55": "青色 55万円", "65": "青色 65万円" };
function renderResult(r) {
    const b = r.baseline;
    const m = r.measures;
    const out = [];
    out.push(h("div", { class: "headline" }, h("div", { class: "figure" }, h("span", { class: "label" }, "いまの見込み税額"), h("strong", {}, yen(b.totalTax))), h("div", { class: "figure accent" }, h("span", { class: "label" }, "全部やると減る税額"), h("strong", {}, yen(m.combined.saving.total)))));
    const income = [];
    if (r.input.salaryRevenue > 0) {
        const adjusted = b.incomeAdjustment > 0 ? `（所得金額調整控除 ${yen(b.incomeAdjustment)}を控除後）` : "";
        income.push([`給与所得${adjusted}`, yen(b.salaryIncome)]);
    }
    if (r.input.businessRevenue > 0 || r.input.businessExpenses > 0) {
        income.push([r.input.businessIncomeType === "business" ? "事業所得" : "雑所得", yen(b.businessIncome)]);
    }
    income.push(["合計所得金額", yen(b.totalIncome)], [`所得税の課税所得（税率 ${b.incomeTax.marginalRatePercent}%）`, yen(b.incomeTax.taxableIncome)], ["所得税 + 復興特別所得税", yen(b.incomeTax.total)], [`住民税（${r.residentTaxLabel}）`, yen(b.residentTax.total)], ["税額の合計", yen(b.totalTax), "strong"]);
    out.push(card(`現状の見込み（${r.label}）`, rows(income)));
    const c = m.combined;
    if (c.totalPayment > 0) {
        out.push(card("全部やった場合", rows([
            ...(c.furusatoAdditional > 0 ? [["ふるさと納税の追加", yen(c.furusatoAdditional)]] : []),
            ...(c.idecoAdditional > 0 ? [["iDeCo の追加", yen(c.idecoAdditional)]] : []),
            ...(c.kyosaiAdditional > 0 ? [["小規模企業共済の追加", yen(c.kyosaiAdditional)]] : []),
            ["追加で支払う額の合計", yen(c.totalPayment)],
            ["税額の合計（実行後）", yen(c.totalTax)],
            ...savingRows(c.saving),
        ]), notes(c.notes)));
    }
    const f = m.furusato;
    out.push(card("ふるさと納税", f.limit > 0
        ? rows([
            ["控除上限額の目安（年間）", yen(f.limit), "strong"],
            ["寄附済み", yen(f.paid)],
            ["上限までの残り", yen(f.remaining)],
            ["上限まで寄附した場合の自己負担", yen(f.outOfPocket)],
            ...(f.limitAfterOtherMeasures !== f.limit
                ? [["iDeCo・共済を追加した場合の上限", yen(f.limitAfterOtherMeasures)]]
                : []),
            ...savingRows(f.saving),
        ])
        : null, notes(f.notes)));
    out.push(contributionCard("iDeCo（個人型確定拠出年金）", m.ideco));
    out.push(contributionCard("小規模企業共済", m.kyosai));
    out.push(card("青色申告特別控除", m.blueReturn.applicable
        ? rows(m.blueReturn.options.map((o) => {
            const diff = o.savingVsCurrent.total;
            const text = o.current ? "現在" : diff >= 0 ? `${yen(diff)} 減` : `${yen(-diff)} 増`;
            return [`${BLUE_LABEL[o.level]}（税額 ${yen(o.totalTax)}）`, text, o.current ? "current" : undefined];
        }))
        : null, notes(m.blueReturn.notes)));
    const nhi = m.nationalHealthInsurance;
    if (nhi) {
        out.push(card(`国民健康保険料（所得割 ${nhi.ratePercent}%・翌年度の目安）`, rows([
            ["所得割の算定基礎", yen(nhi.baseIncome)],
            ["所得割額の目安", yen(nhi.incomeLevy), "strong"],
            ...nhi.blueReturnOptions.map((o) => {
                const diff = o.reductionVsCurrent;
                const text = o.current ? "現在" : diff >= 0 ? `${yen(diff)} 減` : `${yen(-diff)} 増`;
                return [`${BLUE_LABEL[o.level]}（${yen(o.incomeLevy)}）`, text, o.current ? "current" : undefined];
            }),
        ]), notes(nhi.notes)));
    }
    if (r.warnings.length > 0)
        out.push(card("注意", notes(r.warnings)));
    return out;
}
function readForm(form) {
    const values = {};
    for (const el of Array.from(form.elements)) {
        if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement) || el.name === "")
            continue;
        if (el instanceof HTMLInputElement && el.type === "checkbox")
            values[el.name] = el.checked;
        else if (el instanceof HTMLInputElement && el.type === "radio") {
            if (el.checked && el.name === "income-type")
                values["misc"] = el.value === "misc";
        }
        else
            values[el.name] = el.value;
    }
    return values;
}
function fillForm(form, values) {
    for (const el of Array.from(form.elements)) {
        if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement) || el.name === "")
            continue;
        if (el instanceof HTMLInputElement && el.type === "radio") {
            if (el.name === "income-type")
                el.checked = (el.value === "misc") === (values["misc"] === true);
            continue;
        }
        const value = values[el.name];
        if (value === undefined)
            continue;
        if (el instanceof HTMLInputElement && el.type === "checkbox")
            el.checked = value === true;
        else if (typeof value === "string")
            el.value = value;
    }
}
/** 入力欄の見出し（label の先頭の文言）。見つからなければ null。 */
function fieldLabel(el) {
    const label = el.closest("label");
    for (const node of Array.from(label?.childNodes ?? [])) {
        const text = node.nodeType === Node.TEXT_NODE ? (node.textContent ?? "").trim() : "";
        if (text !== "")
            return text;
    }
    return null;
}
/** 入力エラーを「欄の見出し: 内容」の形にし、該当する欄に印を付ける。 */
function showIssues(form, issues) {
    const lines = issues.map((issue) => {
        const { field, message } = splitIssue(issue);
        const el = field === null ? null : form.querySelector(`[name="${field}"]`);
        if (!el)
            return message;
        el.setAttribute("aria-invalid", "true");
        const label = fieldLabel(el);
        return label === null ? message : `${label}: ${message}`;
    });
    return h("section", { class: "card error", role: "alert" }, h("h3", {}, "入力を確認してください"), notes(lines));
}
function start() {
    const form = document.querySelector("#form");
    const output = document.querySelector("#result");
    const sources = document.querySelector("#sources");
    const version = document.querySelector("#version");
    if (!form || !output || !sources)
        return;
    if (version)
        version.textContent = `setsuzei ${VERSION}`;
    sources.replaceChildren(...getSources().map((s) => h("li", {}, h("a", { href: s.url, rel: "noopener noreferrer", target: "_blank" }, s.title))));
    const jump = document.querySelector("#jump");
    const setJump = (text, error = false) => {
        if (!jump)
            return;
        jump.hidden = text === null;
        jump.textContent = text ?? "";
        jump.classList.toggle("error", error);
        document.body.classList.toggle("has-jump", text !== null);
    };
    const update = () => {
        const values = readForm(form);
        form.classList.toggle("has-spouse", values["has-spouse"] === true);
        form.classList.toggle("is-misc", values["misc"] === true);
        for (const el of Array.from(form.querySelectorAll("[aria-invalid]")))
            el.removeAttribute("aria-invalid");
        if (isBlank(values)) {
            output.replaceChildren(h("p", { class: "placeholder" }, "収入を入力すると、ここに結果が出ます。"));
            setJump(null);
            return;
        }
        const outcome = compute(values);
        if (outcome.ok) {
            output.replaceChildren(...renderResult(outcome.result));
            const r = outcome.result;
            setJump(`税額の見込み ${yen(r.baseline.totalTax)} ／ 全部やると −${yen(r.measures.combined.saving.total)}　結果を見る ↓`);
        }
        else {
            output.replaceChildren(showIssues(form, outcome.issues));
            setJump(`入力を確認してください（${outcome.issues.length} 件）　内容を見る ↓`, true);
        }
    };
    fillForm(form, queryToValues(location.search));
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    form.addEventListener("submit", (event) => event.preventDefault());
    form.addEventListener("reset", () => setTimeout(update, 0));
    document.querySelector("#example")?.addEventListener("click", () => {
        form.reset();
        fillForm(form, {
            revenue: "800万",
            expenses: "150万",
            blue: "65",
            "social-insurance": "90万",
            "ideco-paid": "27.6万",
            "furusato-paid": "3万",
        });
        update();
    });
    update();
}
start();
