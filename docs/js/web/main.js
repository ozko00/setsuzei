/**
 * ブラウザ版（トップページ）の画面まわり。入力はこのページの中だけで処理し、どこにも送信しない。
 * 保存は、利用者が自分でオンにしたときだけ、この端末のブラウザの中に行う（web/storage.ts）。
 */
import { parseAmount } from "../src/cli/amount.js";
import { sourcesInsuranceGuide } from "../src/data/2026-insurance-guide.js";
import { getSources } from "../src/data/index.js";
import { VERSION } from "../src/version.js";
import { browserNote, computeTop, isBlankTop, queryToValues, splitIssue } from "./logic.js";
import { webMessages } from "./messages.js";
import { clearSaved, loadSaved, save } from "./storage.js";
import { summaryText, usedInputs } from "./summary.js";
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
/** このページの言語の文面（<html lang> で決まる）。計算は言語に関係なく同じ */
const t = webMessages(document.documentElement.lang === "en" ? "en" : "ja");
const locale = t.locale;
const yen = t.yen;
const digits = t.digits;
/** 項目名と金額の行を並べた表 */
function rows(items) {
    return h("dl", { class: "rows" }, ...items.map(([label, value, cls]) => h("div", { class: cls ? `row ${cls}` : "row" }, h("dt", {}, label), h("dd", {}, value))));
}
function notes(list) {
    return list.length === 0 ? null : h("ul", { class: "notes" }, ...list.map((n) => h("li", {}, browserNote(n))));
}
function savingRows(s) {
    return [
        [t.saving, yen(s.total), "strong"],
        [t.savingIncomeTax, yen(s.incomeTax)],
        [t.savingResidentTax, yen(s.residentTax)],
    ];
}
function card(title, ...children) {
    return h("section", { class: "card" }, h("h3", {}, title), ...children);
}
function contributionCard(title, m) {
    if (!m.applicable)
        return card(title, notes(m.notes));
    return card(title, rows([
        [t.annualLimit, yen(m.annualLimit)],
        [t.paid, yen(m.paid)],
        [t.remaining, yen(m.remaining)],
        [t.additionalTried, yen(m.additional), "strong"],
        ...savingRows(m.saving),
    ]), notes(m.notes));
}
/** まとめて実行した場合に含まれる策の名前 */
function combinedParts(c) {
    return [
        ...(c.furusatoAdditional > 0 ? [t.furusato] : []),
        ...(c.kyosaiAdditional > 0 ? [t.kyosai] : []),
        ...(c.idecoAdditional > 0 ? [t.ideco] : []),
    ];
}
function combinedCard(title, c) {
    return card(t.combinedTitle(title, combinedParts(c)), rows([
        ...(c.furusatoAdditional > 0 ? [[t.furusatoExtra, yen(c.furusatoAdditional)]] : []),
        ...(c.kyosaiAdditional > 0 ? [[t.kyosaiExtra, yen(c.kyosaiAdditional)]] : []),
        ...(c.idecoAdditional > 0 ? [[t.idecoExtra, yen(c.idecoAdditional)]] : []),
        [t.totalExtraPayment, yen(c.totalPayment), "strong"],
        [t.totalSaving, yen(c.saving.total), "strong"],
        ...(c.furusatoAdditional > 0
            ? [
                [t.fromContributions, yen(c.savingFromContributions.total)],
                [t.fromFurusato, yen(c.savingFromFurusato.total)],
            ]
            : []),
        [t.ofIncomeTax, yen(c.saving.incomeTax)],
        [t.ofResidentTax, yen(c.saving.residentTax)],
        [t.totalTaxAfter, yen(c.totalTax)],
    ]), notes(c.notes));
}
const BLUE_LABEL = t.blueLabel;
/** 内訳（いまの税額、各策の上限と残り枠、青色申告の区分ごとの税額、計算に使った値） */
function renderBreakdown(top) {
    const r = top.result;
    const b = r.baseline;
    const m = r.measures;
    const out = [];
    const income = [];
    if (r.input.salaryRevenue > 0) {
        income.push([t.salaryIncome(b.incomeAdjustment), yen(b.salaryIncome)]);
    }
    if (r.input.businessRevenue > 0 || r.input.businessExpenses > 0) {
        income.push([r.input.businessIncomeType === "business" ? t.businessIncome : t.miscIncome, yen(b.businessIncome)]);
    }
    income.push([t.totalIncome, yen(b.totalIncome)], [t.taxableIncome(b.incomeTax.marginalRatePercent), yen(b.incomeTax.taxableIncome)], [t.incomeTaxLine, yen(b.incomeTax.total)], [t.residentTaxLine(r.residentTaxLabel), yen(b.residentTax.total)], [t.totalTax, yen(b.totalTax), "strong"]);
    out.push(card(t.baselineTitle(r.label), rows(income)));
    const c = m.combined;
    if (c.totalPayment > 0)
        out.push(combinedCard(t.combinedAll, c));
    if (m.combinedWithIdeco)
        out.push(combinedCard(t.combinedIfIdeco, m.combinedWithIdeco));
    const f = m.furusato;
    out.push(card(t.furusato, f.limit > 0
        ? rows([
            [t.furusatoLimitYear, yen(f.limit), "strong"],
            [t.donated, yen(f.paid)],
            [t.furusatoRemainingToDonate, yen(f.remaining)],
            ...savingRows(f.saving),
            [t.furusatoOutOfPocket, yen(f.outOfPocket)],
            ...(f.limitAfterOtherMeasures !== f.limit
                ? [[t.furusatoLimitAfter, yen(f.limitAfterOtherMeasures)]]
                : []),
        ])
        : null, notes(f.notes)));
    out.push(contributionCard(t.idecoTitle, m.ideco));
    out.push(contributionCard(t.kyosai, m.kyosai));
    out.push(card(t.blueTitle, m.blueReturn.applicable
        ? rows(m.blueReturn.options.map((o) => {
            const diff = o.savingVsCurrent.total;
            const text = o.current ? t.current : diff >= 0 ? t.less(diff) : t.more(-diff);
            return [t.blueOption(BLUE_LABEL[o.level], o.totalTax), text, o.current ? "current" : undefined];
        }))
        : null, notes(m.blueReturn.notes)));
    const nhi = m.nationalHealthInsurance;
    if (nhi) {
        out.push(card(t.nhiTitle(nhi.ratePercent), rows([
            [t.nhiBase, yen(nhi.baseIncome)],
            [t.nhiLevy, yen(nhi.incomeLevy), "strong"],
            ...nhi.blueReturnOptions.map((o) => {
                const diff = o.reductionVsCurrent;
                const text = o.current ? t.current : diff >= 0 ? t.less(diff) : t.more(-diff);
                return [t.nhiOption(BLUE_LABEL[o.level], o.incomeLevy), text, o.current ? "current" : undefined];
            }),
        ]), notes(nhi.notes)));
    }
    out.push(card(t.usedTitle, rows(usedInputs(top, locale))));
    out.push(card(t.glossaryTitle, h("ul", { class: "notes" }, ...t.glossary.map(([term, text]) => h("li", {}, h("strong", {}, term), `: ${text}`)))));
    return out;
}
function fillForm(form, values) {
    for (const el of Array.from(form.elements)) {
        if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement) || el.name === "")
            continue;
        if (el instanceof HTMLInputElement && el.type === "radio") {
            if (el.name === "income-type") {
                if (values["misc"] !== undefined)
                    el.checked = (el.value === "misc") === (values["misc"] === true);
            }
            else if (typeof values[el.name] === "string")
                el.checked = el.value === values[el.name];
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
    const label = el.closest("label") ?? (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
    if (el.id && label?.getAttribute("for") === el.id) {
        const name = el.closest(".action")?.querySelector(".action-name")?.textContent ?? "";
        return t.actionField(name, (label.textContent ?? "").trim());
    }
    for (const node of Array.from(label?.childNodes ?? [])) {
        if (node instanceof HTMLElement && (node.classList.contains("num") || node.classList.contains("sub")))
            continue;
        // 働き方で出し分けている見出しは、いま見えているほうを使う
        if (node instanceof HTMLElement && !node.checkVisibility())
            continue;
        const text = (node.textContent ?? "").trim();
        if (text !== "")
            return text;
    }
    return null;
}
const PLAN_FIELDS = ["furusato", "kyosai", "ideco"];
function start() {
    const form = document.querySelector("#form");
    const output = document.querySelector("#result");
    const notice = document.querySelector("#notice");
    const planBox = document.querySelector("#plan");
    const sources = document.querySelector("#sources");
    const version = document.querySelector("#version");
    const more = document.querySelector("#more");
    if (!form || !output || !notice || !planBox || !sources || !more)
        return;
    if (version)
        version.textContent = `setsuzei ${VERSION}`;
    const sourceItem = (s) => h("li", {}, h("a", { href: s.url, rel: "noopener noreferrer", target: "_blank" }, s.title));
    sources.replaceChildren(...getSources().map(sourceItem));
    document.querySelector("#guide-sources")?.replaceChildren(...sourcesInsuranceGuide.map(sourceItem));
    const $ = (id) => {
        const el = document.getElementById(id);
        if (!el)
            throw new Error(`#${id} がありません`);
        return el;
    };
    const text = (id, value) => {
        $(id).textContent = value;
    };
    const planInput = (name) => $(`${name}-add`);
    const planRange = (name) => $(`${name}-range`);
    /** 払う額を利用者が自分で決めたか（そうでなければ、おすすめの額を出す） */
    const custom = { furusato: false, kyosai: false, ideco: false };
    /** 所得の種類を利用者が自分で選んだか */
    let incomeTypeTouched = false;
    /** いまの結果（コピー・印刷に使う） */
    let current = null;
    const saveBox = $("save");
    const jump = document.querySelector("#jump");
    let jumpText = null;
    let totalsVisible = false;
    const showJump = () => {
        if (!jump)
            return;
        // 入力欄に打っている間は出さない（スマホ幅で、帯が次の入力欄に重なり、欄を押したつもりで結果へ飛んでしまうため）
        const active = document.activeElement;
        const typing = active instanceof HTMLInputElement && !["radio", "checkbox", "range"].includes(active.type) && form.contains(active);
        const shown = jumpText !== null && !totalsVisible && !typing;
        jump.hidden = !shown;
        document.body.classList.toggle("has-jump", shown);
    };
    const setJump = (value, error = false) => {
        if (!jump)
            return;
        jumpText = value;
        jump.textContent = value ?? "";
        jump.classList.toggle("error", error);
        jump.setAttribute("href", error ? "#notice" : "#plan");
        showJump();
    };
    if ("IntersectionObserver" in window) {
        // 合計が画面に見えている間は、同じ数字を画面の下に重ねて出さない
        new IntersectionObserver((entries) => {
            for (const entry of entries)
                totalsVisible = entry.isIntersecting;
            showJump();
        }).observe($("plan-lead"));
    }
    form.addEventListener("focusin", showJump);
    form.addEventListener("focusout", () => setTimeout(showJump, 0));
    let liveTimer = 0;
    const announce = (message) => {
        window.clearTimeout(liveTimer);
        // 打つたびに読み上げないよう、入力が止まってから伝える
        liveTimer = window.setTimeout(() => text("live", message), 900);
    };
    const readForm = () => {
        const values = {};
        for (const el of Array.from(form.elements)) {
            if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement) || el.name === "")
                continue;
            if (el instanceof HTMLInputElement && el.type === "checkbox")
                values[el.name] = el.checked;
            else if (el instanceof HTMLInputElement && el.type === "radio") {
                if (!el.checked)
                    continue;
                if (el.name === "income-type")
                    values["misc"] = el.value === "misc";
                else
                    values[el.name] = el.value;
            }
            else
                values[el.name] = el.value;
        }
        // 払う額は、自分で決めたものだけを計算に渡す（そうでなければ、おすすめの額を計算コアが決める）
        for (const name of PLAN_FIELDS)
            if (!custom[name])
                values[`${name}-add`] = "";
        values["misc-assumed"] = !incomeTypeTouched && values["work"] === "employee" && values["misc"] === true;
        return values;
    };
    /** 保存する中身（画面の欄の値そのまま） */
    const snapshot = () => {
        const saved = {};
        for (const [name, value] of Object.entries(readForm()))
            if (value !== undefined && name !== "misc-assumed")
                saved[name] = value;
        saved["income-type-touched"] = incomeTypeTouched;
        return saved;
    };
    const setPlanField = (name, amount, max, blank = false) => {
        const input = planInput(name);
        const range = planRange(name);
        // 自分で打っている途中の欄は書き換えない
        if (!custom[name] && document.activeElement !== input)
            input.value = blank || (name === "ideco" && amount === 0) ? "" : digits(amount);
        range.max = String(Math.ceil(Math.max(max, amount) / 1_000) * 1_000);
        range.value = String(amount);
        range.disabled = max === 0 && amount === 0;
        range.setAttribute("aria-valuetext", yen(amount));
    };
    const renderPlan = (top) => {
        const r = top.result;
        const m = r.measures;
        const plan = top.plan;
        const split = (s) => t.split(s.total, s.incomeTax, s.residentTax);
        text("plan-lead", plan.totalPayment > 0
            ? t.planLead(plan.totalPayment, plan.saving.total, [plan.furusato.amount, plan.kyosai?.amount ?? 0, plan.ideco.amount].filter((n) => n > 0).length > 1)
            : t.planNone);
        // 年内に出せるお金
        const budgetNotes = plan.budget ? [plan.budget.reason] : [];
        if (plan.budget && plan.budget.over > 0)
            budgetNotes.push(t.budgetOver(plan.budget.over));
        text("budget-reason", budgetNotes.join(""));
        // 仮に置いた値
        $("assumed").hidden = top.assumptions.length === 0;
        $("assumed-list").replaceChildren(...top.assumptions.map((a) => h("li", {}, a.text)));
        // ふるさと納税
        const f = plan.furusato;
        // 上限の目安が 0 円でも、自分で入れた寄附額が残っている間は、その欄を出しておく（直せるように）
        const furusatoOff = f.limit === 0 && f.amount === 0 && !custom.furusato;
        $("act-furusato").classList.toggle("off", furusatoOff);
        $("act-furusato").classList.toggle("optional", f.skipped !== null);
        text("furusato-off", f.limit === 0 ? t.furusatoOff(browserNote(m.furusato.notes[0] ?? "")) : "");
        if (!furusatoOff) {
            text("furusato-do", f.skipped
                ? t.furusatoSkipped(f.skipped.amount, f.skipped.saving.total, f.skipped.amount - f.skipped.saving.total)
                : f.amount === 0
                    ? f.paid >= f.limit
                        ? t.furusatoEnough(f.paid, f.limit)
                        : t.furusatoZero
                    : f.paid > 0
                        ? t.furusatoMore(f.amount, f.paid, f.paid + f.amount)
                        : t.furusatoDonate(f.amount));
            const hint = [t.furusatoHintLimit(f.limit)];
            if (f.limit < m.furusato.limit)
                hint.push(t.furusatoHintLowered(m.furusato.limit));
            text("furusato-hint", hint.join(""));
            $("furusato-saving").replaceChildren(split(f.saving), ...(f.over > 0 ? [h("span", { class: "warn" }, t.furusatoOver(f.over))] : []));
            const self = f.amount - f.saving.total;
            text("furusato-worth", f.amount === 0 ? "" : self <= 0 ? t.furusatoWorthFull : t.furusatoWorth(f.amount, f.saving.total, self, f.saving.total < self));
            setPlanField("furusato", f.amount, f.skipped ? f.skipped.amount : f.recommended, f.skipped !== null);
            $("furusato-notes").replaceChildren(...m.furusato.notes.map((n) => h("li", {}, browserNote(n))));
        }
        // 小規模企業共済
        const k = plan.kyosai;
        $("act-kyosai").hidden = k === null;
        if (k) {
            // いま加入していない人には、額を入れるまで合計に入れず、「さらに減らしたい場合」として出す
            const optional = k.ifJoined !== null && !k.custom;
            $("act-kyosai").classList.toggle("optional", optional);
            text("kyosai-kind", t.kyosaiKind(k.ifJoined !== null));
            text("kyosai-do", optional
                ? t.kyosaiOptionalDo
                : k.amount === 0
                    ? k.custom || plan.budget
                        ? t.kyosaiZeroChosen
                        : t.kyosaiNoMore
                    : k.paid > 0
                        ? t.kyosaiIncrease(k.amount)
                        : t.kyosaiJoin(k.amount));
            const limitOfEffect = k.ifJoined ? k.ifJoined.amount : m.kyosai.noEffectBeyond;
            const hint = [t.kyosaiHintMax(k.max)];
            if (k.ifJoined && optional) {
                hint.push(t.kyosaiHintIfJoined(k.ifJoined.amount, k.ifJoined.saving.total));
            }
            else if (limitOfEffect !== null && limitOfEffect < k.max)
                hint.push(t.kyosaiHintNoEffect(limitOfEffect));
            const typed = parseAmount(planInput("kyosai").value);
            if (k.custom && typed !== null && typed > k.amount)
                hint.push(t.kyosaiHintCapped(k.amount));
            text("kyosai-hint", hint.join(""));
            text("kyosai-saving", optional ? t.notIncluded : split(k.saving));
            text("kyosai-worth", !optional && k.amount > 0 ? t.kyosaiWorth(k.amount, k.saving.total) : "");
            setPlanField("kyosai", k.amount, limitOfEffect ?? k.max, optional);
            $("kyosai-notes").replaceChildren(...m.kyosai.notes.map((n) => h("li", {}, browserNote(n))));
        }
        // iDeCo
        const i = plan.ideco;
        text("ideco-do", i.included && i.amount > 0 ? t.idecoIncrease(i.amount) : i.max === 0 ? t.idecoFull : t.idecoIfKnown);
        const idecoHint = [t.idecoHintMax(i.max)];
        if (!i.included && m.ideco.additional > 0 && m.ideco.saving.total > 0) {
            idecoHint.push(t.idecoHintIf(m.ideco.additional, m.ideco.saving.total));
        }
        text("ideco-hint", idecoHint.join(""));
        text("ideco-saving", i.included ? split(i.saving) : t.notIncluded);
        text("ideco-worth", i.included && i.amount > 0 ? t.idecoWorth(i.amount, i.saving.total) : "");
        setPlanField("ideco", i.amount, i.max);
        $("ideco-notes").replaceChildren(...m.ideco.notes.map((n) => h("li", {}, browserNote(n))));
        $("act-ideco").classList.toggle("optional", !i.included);
        // 合計
        text("total-saving", yen(plan.saving.total));
        text("total-payment", yen(plan.totalPayment));
        text("total-tax", `${yen(plan.taxBefore)} → ${yen(plan.taxAfter)}`);
        const totalNotes = [t.totalsTax(r.residentTaxLabel)];
        if ([f.amount, k?.amount ?? 0, i.amount].filter((n) => n > 0).length > 1) {
            totalNotes.push(t.totalsRecomputed);
        }
        if (f.amount > 0) {
            totalNotes.push(t.totalsFurusato(f.saving.total));
        }
        if ((k?.amount ?? 0) + i.amount > 0)
            totalNotes.push(t.totalsContributions);
        text("totals-note", totalNotes.join(""));
        $("plan-reset").hidden = !PLAN_FIELDS.some((name) => custom[name]);
        // 確定申告のときに（青色申告）
        const blue = m.blueReturn;
        const best = blue.options.find((o) => o.level === "65");
        const showLater = blue.applicable && best !== undefined && !best.current && (best.savingVsCurrent.total > 0 || blue.current === "none");
        $("later").hidden = !showLater;
        if (showLater && best) {
            const unknown = blue.current === "none";
            text("later-text", (best.savingVsCurrent.total > 0 ? t.laterSaving(best.savingVsCurrent.total) : t.laterNone) + (unknown ? t.laterUnknown : t.laterNeeds));
        }
    };
    /** 社会保険料の目安の説明（「分からない」を選んでいる間、欄の下に出す） */
    const renderGuide = (top) => {
        const box = $("si-guide");
        if (!top?.insurance) {
            box.replaceChildren(h("p", { class: "sub" }, t.guideEmpty));
            return;
        }
        const e = top.insurance;
        box.replaceChildren(h("p", { class: "guide-amount" }, t.guideLabel, h("strong", {}, yen(e.amount)), t.guideRange(e.low, e.high)), h("ul", { class: "guide-parts" }, ...e.parts.map((p) => h("li", {}, t.guidePart(p.label, p.amount)))), h("p", { class: "sub" }, e.kind === "freelance" ? t.guideNoteFreelance : t.guideNoteEmployee), h("details", { class: "help" }, h("summary", {}, t.guideHow), h("ul", {}, ...e.basis.map((line) => h("li", {}, line)))));
    };
    const update = () => {
        const values = readForm();
        form.classList.toggle("has-spouse", values["has-spouse"] === true);
        form.classList.toggle("is-misc", values["misc"] === true);
        form.classList.toggle("is-employee", values["work"] === "employee");
        form.classList.toggle("si-enter", values["si-mode"] === "enter");
        const revenueFilled = typeof values["revenue"] === "string" && values["revenue"].trim() !== "";
        form.classList.toggle("no-business", values["work"] === "employee" && !revenueFilled);
        for (const el of Array.from(document.querySelectorAll("[aria-invalid]")))
            el.removeAttribute("aria-invalid");
        if (saveBox.checked && !save(snapshot()))
            text("save-status", t.saveFailed);
        if (isBlankTop(values)) {
            current = null;
            planBox.hidden = true;
            notice.replaceChildren(h("p", { class: "placeholder" }, t.placeholder));
            output.replaceChildren();
            renderGuide(null);
            setJump(null);
            return;
        }
        const top = computeTop(values, locale);
        if (!top.ok) {
            // 払う額の欄を直せるよう、出ていた結果は薄くして残す（数字は古いままなので、読み上げからは外す）
            // 保存してあった値を読み込んだ直後など、まだ結果を出していないときでも、
            // 払う額・出せるお金の欄に値があれば、その欄を直せるように出す
            const planHasInput = [...PLAN_FIELDS.map((name) => planInput(name)), $("budget")].some((el) => el.value.trim() !== "");
            if (planHasInput)
                planBox.hidden = false;
            planBox.classList.add("stale");
            planBox.setAttribute("aria-busy", "true");
            current = null;
            const lines = top.issues.map((issue) => {
                const { field, message } = splitIssue(issue);
                const el = field === null ? null : document.querySelector(`[name="${field}"]`);
                if (!el)
                    return message;
                el.setAttribute("aria-invalid", "true");
                const label = fieldLabel(el);
                return label === null ? message : `${label}: ${message}`;
            });
            notice.replaceChildren(h("section", { class: "card error", role: "alert" }, h("h3", {}, t.checkInput), h("ul", { class: "notes" }, ...lines.map((l) => h("li", {}, l)))));
            output.replaceChildren();
            setJump(t.jumpError(top.issues.length), true);
            return;
        }
        current = top;
        planBox.hidden = false;
        planBox.classList.remove("stale");
        // 計算に使った値（CLI のフラグ名 → 値）。同じ値を CLI に渡すと、同じ結果になる
        planBox.dataset["effective"] = JSON.stringify(top.effective);
        planBox.removeAttribute("aria-busy");
        renderPlan(top);
        renderGuide(top);
        const r = top.result;
        notice.replaceChildren(...(r.warnings.length > 0 ? [h("section", { class: "card caution" }, h("h3", {}, t.cautionTitle), notes(r.warnings))] : []));
        output.replaceChildren(h("details", { class: "breakdown", id: "breakdown", ...(output.querySelector("#breakdown")?.open ? { open: "" } : {}) }, h("summary", {}, t.breakdownSummary, h("span", { class: "summary-sub" }, t.breakdownSub)), ...renderBreakdown(top)));
        const breakdown = output.querySelector("#breakdown");
        // 自分で開いたときだけ、開いた先頭が見える位置へ送る（再計算で描き直したときは動かさない）
        breakdown?.querySelector("summary")?.addEventListener("click", () => {
            setTimeout(() => {
                if (breakdown.open)
                    breakdown.scrollIntoView({ block: "start" });
            }, 0);
        });
        const p = top.plan;
        setJump(p.totalPayment > 0 ? t.jumpPay(p.totalPayment, p.saving.total) : t.jumpTax(p.taxBefore));
        announce(p.totalPayment > 0 ? t.announcePay(p.totalPayment, p.saving.total) : t.announceNone);
    };
    /** 働き方に合わせて、所得の種類の既定を決める（自分で選んだあとは変えない） */
    const applyWorkDefault = () => {
        if (incomeTypeTouched)
            return;
        const employee = form.querySelector('input[name="work"][value="employee"]')?.checked === true;
        for (const el of Array.from(form.querySelectorAll('input[name="income-type"]'))) {
            el.checked = (el.value === "misc") === employee;
        }
    };
    // --- はじめの値: 説明ページから引き継いだ値（URL）、なければ保存してある値 ---
    const fromQuery = queryToValues(location.search);
    const saved = Object.keys(fromQuery).length === 0 ? loadSaved() : null;
    if (Object.keys(fromQuery).length > 0) {
        // 引き継いだ値は、CLI に同じフラグを渡したときと同じ計算になるようにする（目安や既定を足さない）
        const salary = fromQuery["salary"];
        fillForm(form, {
            ...fromQuery,
            work: typeof salary === "string" && salary.trim() !== "" ? "employee" : "freelance",
            "si-mode": "enter",
            // 社会保険料の指定がなければ、CLI と同じく 0 円（目安は使わない）
            "social-insurance": typeof fromQuery["social-insurance"] === "string" ? fromQuery["social-insurance"] : "0",
            misc: fromQuery["misc"] === true,
            blue: typeof fromQuery["blue"] === "string" ? fromQuery["blue"] : "none",
        });
        incomeTypeTouched = true;
        for (const name of PLAN_FIELDS)
            custom[name] = planInput(name).value !== "";
        more.open = true;
        // 収入の数字が URL に残って、そのまま人に渡ることがないよう、読み取ったら URL から消す
        history.replaceState(null, "", location.pathname);
    }
    else if (saved) {
        fillForm(form, saved);
        incomeTypeTouched = saved["income-type-touched"] === true;
        for (const name of PLAN_FIELDS)
            custom[name] = planInput(name).value !== "";
        saveBox.checked = true;
        more.open = true;
        text("save-status", t.saveLoaded);
    }
    // 値が入っている欄が、閉じた枠の中に隠れたまま結果に効くことがないよう、値があれば開く
    for (const details of Array.from(form.querySelectorAll("details.nested"))) {
        if (Array.from(details.querySelectorAll("input")).some((el) => el.value !== "")) {
            details.open = true;
            more.open = true;
        }
    }
    /** 払う額の上限（おすすめの額。1,000 円きざみに丸める前の値） */
    const realMax = (name) => {
        if (!current)
            return 0;
        if (name === "furusato")
            return current.plan.furusato.skipped?.amount ?? current.plan.furusato.recommended;
        if (name === "ideco")
            return current.plan.ideco.max;
        return current.plan.kyosai?.ifJoined?.amount ?? current.result.measures.kyosai.noEffectBeyond ?? current.plan.kyosai?.max ?? 0;
    };
    const onInput = (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement) {
            if (target.name === "income-type")
                incomeTypeTouched = true;
            if (target.name === "work")
                applyWorkDefault();
            for (const name of PLAN_FIELDS) {
                if (target === planInput(name))
                    custom[name] = target.value.trim() !== "";
                if (target === planRange(name)) {
                    // スライダーは 1,000 円きざみ。右端は、ちょうど上限の額にする
                    custom[name] = true;
                    planInput(name).value = digits(Math.min(Number(target.value), realMax(name)));
                }
            }
        }
        update();
    };
    form.addEventListener("input", onInput);
    form.addEventListener("change", onInput);
    for (const name of PLAN_FIELDS) {
        // 払う額の欄は form の外にあるので、個別に受け取る
        for (const el of [planInput(name), planRange(name)]) {
            el.addEventListener("input", onInput);
            el.addEventListener("change", onInput);
        }
        planInput(name).addEventListener("blur", () => {
            if (planInput(name).value.trim() === "") {
                custom[name] = false;
                update();
            }
        });
    }
    for (const type of ["input", "change"])
        $("budget").addEventListener(type, onInput);
    form.addEventListener("submit", (event) => event.preventDefault());
    form.addEventListener("reset", () => {
        const keep = saveBox.checked;
        setTimeout(() => {
            incomeTypeTouched = false;
            for (const name of PLAN_FIELDS)
                custom[name] = false;
            saveBox.checked = keep;
            update();
        }, 0);
    });
    $("plan-reset").addEventListener("click", () => {
        for (const name of PLAN_FIELDS) {
            custom[name] = false;
            planInput(name).value = "";
        }
        update();
    });
    // 「もっと正確にする」を自分で開いたら、開いた先頭が見える位置へ送る（開いたことが分かるように）
    more.querySelector(":scope > summary")?.addEventListener("click", () => {
        setTimeout(() => {
            if (more.open)
                more.scrollIntoView({ block: "start" });
        }, 0);
    });
    $("open-more").addEventListener("click", () => {
        more.open = true;
        more.scrollIntoView({ block: "start" });
        more.querySelector("summary")?.focus({ preventScroll: true });
    });
    document.querySelector("#example")?.addEventListener("click", () => {
        const keep = saveBox.checked;
        form.reset();
        incomeTypeTouched = false;
        for (const name of PLAN_FIELDS)
            custom[name] = false;
        saveBox.checked = keep;
        fillForm(form, { work: "freelance", revenue: t.exampleRevenue, expenses: t.exampleExpenses });
        update();
    });
    saveBox.addEventListener("change", () => {
        if (saveBox.checked) {
            text("save-status", save(snapshot()) ? t.saveOn : t.saveFailed);
        }
        else {
            clearSaved();
            text("save-status", t.saveCleared);
        }
    });
    // --- 人に渡す ---
    const today = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    $("copy").addEventListener("click", () => {
        if (!current)
            return;
        const body = summaryText(current, today(), locale);
        const fallback = () => {
            $("copy-fallback").hidden = false;
            const area = $("copy-text");
            area.value = body;
            area.focus();
            area.select();
            text("share-status", "");
        };
        if (!navigator.clipboard) {
            fallback();
            return;
        }
        navigator.clipboard.writeText(body).then(() => {
            $("copy-fallback").hidden = true;
            text("share-status", t.copied);
        }, fallback);
    });
    $("print").addEventListener("click", () => window.print());
    // 印刷するときは、閉じている内訳も開いて出す
    let reopened = [];
    window.addEventListener("beforeprint", () => {
        reopened = Array.from(document.querySelectorAll("#results details:not([open])"));
        for (const d of reopened)
            d.open = true;
    });
    window.addEventListener("afterprint", () => {
        for (const d of reopened)
            d.open = false;
        reopened = [];
    });
    applyWorkDefault();
    update();
}
start();
