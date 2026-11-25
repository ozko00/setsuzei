import { compute, isBlank, splitIssue } from "./logic.js";
function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs))
        el.setAttribute(key, value);
    for (const child of children)
        if (child !== null)
            el.append(child);
    return el;
}
const yen = (n) => `${n.toLocaleString("ja-JP")} 円`;
function rows(items) {
    return h("dl", { class: "rows" }, ...items.map(([label, value, cls]) => h("div", { class: cls ? `row ${cls}` : "row" }, h("dt", {}, label), h("dd", {}, value))));
}
function notes(list) {
    return list.length === 0 ? null : h("ul", { class: "notes" }, ...list.map((n) => h("li", {}, n)));
}
function card(title, ...children) {
    return h("section", { class: "card" }, h("h3", {}, title), ...children);
}
function savingRows(s) {
    return [
        ["減る税額（所得税 + 住民税）", yen(s.total), "strong"],
        ["　うち所得税", yen(s.incomeTax)],
        ["　うち住民税（翌年度）", yen(s.residentTax)],
    ];
}
function baselineCard(r) {
    const b = r.baseline;
    return card(`現状の見込み（${r.label}）`, rows([
        [r.input.businessIncomeType === "business" ? "事業所得（青色申告特別控除後）" : "雑所得", yen(b.businessIncome)],
        [`所得税の課税所得（税率 ${b.incomeTax.marginalRatePercent}%）`, yen(b.incomeTax.taxableIncome)],
        ["所得税 + 復興特別所得税", yen(b.incomeTax.total)],
        [`住民税（${r.residentTaxLabel}）`, yen(b.residentTax.total)],
    ]));
}
function contributionCards(title, m) {
    if (!m.applicable)
        return [card(title, notes(m.notes))];
    return [
        h("div", { class: "headline" }, h("div", { class: "figure" }, h("span", { class: "label" }, "追加する掛金"), h("strong", {}, yen(m.additional))), h("div", { class: "figure accent" }, h("span", { class: "label" }, "減る税額"), h("strong", {}, yen(m.saving.total)))),
        card(title, rows([
            ["年間上限", yen(m.annualLimit)],
            ["支払済み・支払予定", yen(m.paid)],
            ["残り枠", yen(m.remaining)],
            ["追加する額", yen(m.additional)],
            ...savingRows(m.saving),
        ]), notes(m.notes)),
    ];
}
const BLUE_LABEL = { none: "白色申告", "10": "青色 10万円", "55": "青色 55万円", "65": "青色 65万円" };
function render(kind, r) {
    const m = r.measures;
    if (kind === "furusato") {
        const f = m.furusato;
        return {
            summary: `上限の目安 ${yen(f.limit)}（あと ${yen(f.remaining)}）`,
            cards: [
                h("div", { class: "headline" }, h("div", { class: "figure accent" }, h("span", { class: "label" }, "上限の目安（年間）"), h("strong", {}, yen(f.limit))), h("div", { class: "figure" }, h("span", { class: "label" }, "あと寄附できる額"), h("strong", {}, yen(f.remaining)))),
                card("ふるさと納税", rows([
                    ["控除上限額の目安（年間）", yen(f.limit), "strong"],
                    ["寄附済み", yen(f.paid)],
                    ["上限までの残り", yen(f.remaining)],
                    ["上限まで寄附した場合に減る税額", yen(f.saving.total)],
                    ["　うち所得税", yen(f.saving.incomeTax)],
                    ["　うち住民税（翌年度）", yen(f.saving.residentTax)],
                    ["上限まで寄附した場合の自己負担", yen(f.outOfPocket)],
                ]), notes(f.notes)),
                baselineCard(r),
            ],
        };
    }
    if (kind === "ideco" || kind === "kyosai") {
        const c = m[kind];
        const title = kind === "ideco" ? "iDeCo" : "小規模企業共済";
        return {
            summary: c.applicable ? `${title}で減る税額 ${yen(c.saving.total)}` : `${title}は計算の対象外です`,
            cards: [...contributionCards(title, c), baselineCard(r)],
        };
    }
    // 青色申告特別控除
    const blue = m.blueReturn;
    const best = blue.options.find((o) => o.level === "65");
    const cards = [];
    if (blue.applicable) {
        cards.push(card("青色申告特別控除の区分ごとの税額", rows(blue.options.map((o) => {
            const diff = o.savingVsCurrent.total;
            const text = o.current ? "現在の見込み" : diff >= 0 ? `${yen(diff)} 減る` : `${yen(-diff)} 増える`;
            return [`${BLUE_LABEL[o.level]}: 税額 ${yen(o.totalTax)}`, text, o.current ? "current" : undefined];
        })), notes(blue.notes)));
    }
    else
        cards.push(card("青色申告特別控除", notes(blue.notes)));
    const nhi = m.nationalHealthInsurance;
    if (nhi && nhi.blueReturnOptions.length > 0) {
        cards.push(card(`国民健康保険料（所得割）の目安（料率 ${nhi.ratePercent}%）`, rows(nhi.blueReturnOptions.map((o) => {
            const diff = o.reductionVsCurrent;
            const text = o.current ? "現在の見込み" : diff >= 0 ? `${yen(diff)} 減る` : `${yen(-diff)} 増える`;
            return [`${BLUE_LABEL[o.level]}: 所得割 ${yen(o.incomeLevy)}`, text, o.current ? "current" : undefined];
        })), notes(nhi.notes)));
    }
    cards.push(baselineCard(r));
    const vs65 = best && !best.current ? `65万円にすると ${yen(best.savingVsCurrent.total)} 減る` : "区分ごとの税額";
    return { summary: vs65, cards };
}
function readForm(form) {
    const values = {};
    for (const el of Array.from(form.elements)) {
        if ((el instanceof HTMLInputElement || el instanceof HTMLSelectElement) && el.name !== "")
            values[el.name] = el.value;
    }
    return values;
}
function fieldLabel(el) {
    for (const node of Array.from(el.closest("label")?.childNodes ?? [])) {
        const text = node.nodeType === Node.TEXT_NODE ? (node.textContent ?? "").trim() : "";
        if (text !== "")
            return text;
    }
    return null;
}
function start() {
    const form = document.querySelector("#form");
    const output = document.querySelector("#result");
    const jump = document.querySelector("#jump");
    const full = document.querySelector("#full");
    if (!form || !output)
        return;
    const kind = form.dataset["kind"] ?? "";
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
        for (const el of Array.from(form.querySelectorAll("[aria-invalid]")))
            el.removeAttribute("aria-invalid");
        // 全項目のページへ、いまの入力を引き継ぐ
        if (full) {
            const params = new URLSearchParams();
            for (const [name, value] of Object.entries(values)) {
                if (typeof value === "string" && value.trim() !== "" && !(name === "blue" && value === "none"))
                    params.set(name, value.trim());
            }
            const query = params.toString();
            full.href = query === "" ? "../" : `../?${query}`;
        }
        if (isBlank(values)) {
            output.replaceChildren(h("p", { class: "placeholder" }, "売上を入力すると、ここに結果が出ます。"));
            setJump(null);
            return;
        }
        const outcome = compute(values);
        if (!outcome.ok) {
            const lines = outcome.issues.map((issue) => {
                const { field, message } = splitIssue(issue);
                const el = field === null ? null : form.querySelector(`[name="${field}"]`);
                if (!el)
                    return message;
                el.setAttribute("aria-invalid", "true");
                const label = fieldLabel(el);
                return label === null ? message : `${label}: ${message}`;
            });
            output.replaceChildren(h("section", { class: "card error", role: "alert" }, h("h3", {}, "入力を確認してください"), notes(lines)));
            setJump(`入力を確認してください（${outcome.issues.length} 件）　内容を見る ↓`, true);
            return;
        }
        const { cards, summary } = render(kind, outcome.result);
        const warnings = outcome.result.warnings;
        output.replaceChildren(...cards, ...(warnings.length > 0 ? [card("注意", notes(warnings))] : []));
        setJump(`${summary}　結果を見る ↓`);
    };
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    form.addEventListener("submit", (event) => event.preventDefault());
    update();
}
start();
