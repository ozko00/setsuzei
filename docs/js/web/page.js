import { compute, computeComparison, isBlank, splitIssue } from "./logic.js";
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
/** このページの言語の文面（<html lang> で決まる）。計算は言語に関係なく同じ */
const t = webMessages(document.documentElement.lang === "en" ? "en" : "ja");
const locale = t.locale;
const yen = t.yen;
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
        [t.pSaving, yen(s.total), "strong"],
        [t.savingIncomeTax, yen(s.incomeTax)],
        [t.pSavingResidentTax, yen(s.residentTax)],
    ];
}
function baselineCard(r) {
    const b = r.baseline;
    return card(t.baselineTitle(r.label), rows([
        ...(r.input.salaryRevenue > 0 ? [[t.salaryIncome(0), yen(b.salaryIncome)]] : []),
        ...(r.input.businessRevenue > 0 || r.input.businessExpenses > 0 || r.input.salaryRevenue === 0
            ? [[r.input.businessIncomeType === "business" ? t.pBusinessIncome : t.miscIncome, yen(b.businessIncome)]]
            : []),
        [t.taxableIncome(b.incomeTax.marginalRatePercent), yen(b.incomeTax.taxableIncome)],
        [t.incomeTaxLine, yen(b.incomeTax.total)],
        [t.residentTaxLine(r.residentTaxLabel), yen(b.residentTax.total)],
    ]));
}
function contributionCards(title, m) {
    if (!m.applicable)
        return [card(title, notes(m.notes))];
    return [
        h("div", { class: "headline" }, h("div", { class: "figure" }, h("span", { class: "label" }, t.pExtraContribution), h("strong", {}, yen(m.additional))), h("div", { class: "figure accent" }, h("span", { class: "label" }, t.saving), h("strong", {}, yen(m.saving.total)))),
        card(title, rows([
            [t.annualLimit, yen(m.annualLimit)],
            [t.pPaidPlanned, yen(m.paid)],
            [t.remaining, yen(m.remaining)],
            [t.additionalTried, yen(m.additional)],
            ...savingRows(m.saving),
        ]), notes(m.notes)),
    ];
}
/** 10 万分率を「84.895%」の形にする */
const rate = (per100k) => `${per100k / 1_000}%`;
/** ふるさと納税の上限を、令和 7 年分と令和 8 年分で比べるページ */
function renderComparison(r, c) {
    const { previous, current, difference } = c;
    const limitText = (s) => (s.limit > 0 ? yen(s.limit) : t.noLimit);
    const diffText = difference === 0 ? t.diffSame : difference < 0 ? t.diffDown(-difference) : t.diffUp(difference);
    const detail = (s) => [
        [t.cmpRowTitle(s.label, s.residentTaxLabel), limitText(s), "strong"],
        [t.cmpSalaryIncome, yen(s.salaryIncome)],
        [t.cmpIncomeLevy, yen(s.incomeLevy)],
        [t.cmpSpecialCap, yen(s.specialCap)],
        [t.cmpBasic, yen(s.incomeTaxBasicDeduction)],
        [t.cmpAdjustment, yen(s.adjustmentAmount)],
        [t.cmpRateBase, yen(s.rateBase)],
        [t.cmpRate, rate(s.specialRatePer100k)],
    ];
    return {
        summary: t.cmpSummary(previous.label, limitText(previous), current.label, limitText(current), diffText),
        cards: [
            h("div", { class: "headline" }, h("div", { class: "figure" }, h("span", { class: "label" }, t.limitOf(previous.label)), h("strong", {}, limitText(previous))), h("div", { class: "figure accent" }, h("span", { class: "label" }, t.limitOf(current.label)), h("strong", {}, limitText(current))), h("div", { class: "figure" }, h("span", { class: "label" }, t.diffLabel), h("strong", {}, diffText))),
            card(t.cmpCardTitle, rows([...detail(previous), ...detail(current)]), notes(c.notes)),
            baselineCard(r),
        ],
    };
}
const BLUE_LABEL = t.blueLabel;
function render(kind, r) {
    const m = r.measures;
    if (kind === "furusato") {
        const f = m.furusato;
        return {
            summary: t.fSummary(f.limit, f.remaining),
            cards: [
                h("div", { class: "headline" }, h("div", { class: "figure accent" }, h("span", { class: "label" }, t.fLimit), h("strong", {}, yen(f.limit))), h("div", { class: "figure" }, h("span", { class: "label" }, t.fCanDonate), h("strong", {}, yen(f.remaining))), h("div", { class: "figure" }, h("span", { class: "label" }, t.fSavingThen), h("strong", {}, yen(f.saving.total)))),
                card(t.furusato, rows([
                    [t.furusatoLimitYear, yen(f.limit), "strong"],
                    [t.donated, yen(f.paid)],
                    [t.fRemaining, yen(f.remaining)],
                    [f.paid > 0 ? t.fSavingRest : t.fSavingFull, yen(f.saving.total)],
                    [t.savingIncomeTax, yen(f.saving.incomeTax)],
                    [t.pSavingResidentTax, yen(f.saving.residentTax)],
                    [t.fOutOfPocket, yen(f.outOfPocket)],
                ]), notes(f.notes)),
                baselineCard(r),
            ],
        };
    }
    if (kind === "ideco" || kind === "kyosai") {
        const c = m[kind];
        const title = kind === "ideco" ? t.ideco : t.kyosai;
        return {
            summary: c.applicable ? t.contribSummary(title, c.saving.total) : t.contribNotApplicable(title),
            cards: [...contributionCards(title, c), baselineCard(r)],
        };
    }
    // 青色申告特別控除
    const blue = m.blueReturn;
    const best = blue.options.find((o) => o.level === "65");
    const cards = [];
    if (blue.applicable) {
        cards.push(card(t.blueOptionsTitle, rows(blue.options.map((o) => {
            const diff = o.savingVsCurrent.total;
            const text = o.current ? t.pCurrent : diff >= 0 ? t.pLess(diff) : t.pMore(-diff);
            return [t.blueTax(BLUE_LABEL[o.level], o.totalTax), text, o.current ? "current" : undefined];
        })), notes(blue.notes)));
    }
    else
        cards.push(card(t.blueTitle, notes(blue.notes)));
    const nhi = m.nationalHealthInsurance;
    if (nhi && nhi.blueReturnOptions.length > 0) {
        cards.push(card(t.pNhiTitle(nhi.ratePercent), rows(nhi.blueReturnOptions.map((o) => {
            const diff = o.reductionVsCurrent;
            const text = o.current ? t.pCurrent : diff >= 0 ? t.pLess(diff) : t.pMore(-diff);
            return [t.pNhiOption(BLUE_LABEL[o.level], o.incomeLevy), text, o.current ? "current" : undefined];
        })), notes(nhi.notes)));
    }
    cards.push(baselineCard(r));
    const vs65 = best && !best.current ? t.vs65(best.savingVsCurrent.total) : t.vs65None;
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
            output.replaceChildren(h("p", { class: "placeholder" }, kind === "furusato-year" ? t.placeholderIncome : t.placeholderRevenue));
            setJump(null);
            return;
        }
        const compared = kind === "furusato-year" ? computeComparison(values, locale) : null;
        const outcome = compared ?? compute(values, locale);
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
            output.replaceChildren(h("section", { class: "card error", role: "alert" }, h("h3", {}, t.checkInput), notes(lines)));
            setJump(t.pJumpError(outcome.issues.length), true);
            return;
        }
        const { cards, summary } = compared?.ok === true ? renderComparison(compared.result, compared.comparison) : render(kind, outcome.result);
        const warnings = outcome.result.warnings;
        output.replaceChildren(...cards, ...(warnings.length > 0 ? [card(t.cautionTitle, notes(warnings))] : []));
        setJump(t.pJump(summary));
    };
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    form.addEventListener("submit", (event) => event.preventDefault());
    update();
}
start();
