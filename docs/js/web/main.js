/**
 * ブラウザ版（トップページ）の画面まわり。入力はこのページの中だけで処理し、どこにも送信しない。
 * 保存は、利用者が自分でオンにしたときだけ、この端末のブラウザの中に行う（web/storage.ts）。
 */
import { parseAmount } from "../src/cli/amount.js";
import { sourcesInsuranceGuide } from "../src/data/2026-insurance-guide.js";
import { getSources } from "../src/data/index.js";
import { VERSION } from "../src/version.js";
import { browserNote, computeTop, isBlankTop, queryToValues, splitIssue } from "./logic.js";
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
const yen = (n) => `${n.toLocaleString("ja-JP")} 円`;
const digits = (n) => n.toLocaleString("ja-JP");
/** 項目名と金額の行を並べた表 */
function rows(items) {
    return h("dl", { class: "rows" }, ...items.map(([label, value, cls]) => h("div", { class: cls ? `row ${cls}` : "row" }, h("dt", {}, label), h("dd", {}, value))));
}
function notes(list) {
    return list.length === 0 ? null : h("ul", { class: "notes" }, ...list.map((n) => h("li", {}, browserNote(n))));
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
        ["試算した追加額（追加で支払う額）", yen(m.additional), "strong"],
        ...savingRows(m.saving),
    ]), notes(m.notes));
}
/** まとめて実行した場合に含まれる策の名前 */
function combinedParts(c) {
    return [
        ...(c.furusatoAdditional > 0 ? ["ふるさと納税"] : []),
        ...(c.kyosaiAdditional > 0 ? ["小規模企業共済"] : []),
        ...(c.idecoAdditional > 0 ? ["iDeCo"] : []),
    ];
}
function combinedCard(title, c) {
    return card(`${title}（${combinedParts(c).join(" + ")}）`, rows([
        ...(c.furusatoAdditional > 0 ? [["ふるさと納税の追加", yen(c.furusatoAdditional)]] : []),
        ...(c.kyosaiAdditional > 0 ? [["小規模企業共済の追加", yen(c.kyosaiAdditional)]] : []),
        ...(c.idecoAdditional > 0 ? [["iDeCo の追加", yen(c.idecoAdditional)]] : []),
        ["追加で支払う額の合計", yen(c.totalPayment), "strong"],
        ["減る税額の合計", yen(c.saving.total), "strong"],
        ...(c.furusatoAdditional > 0
            ? [
                ["　うち掛金の追加による分", yen(c.savingFromContributions.total)],
                ["　うちふるさと納税による分（寄附と引き換え）", yen(c.savingFromFurusato.total)],
            ]
            : []),
        ["　（所得税）", yen(c.saving.incomeTax)],
        ["　（住民税）", yen(c.saving.residentTax)],
        ["税額の合計（実行後）", yen(c.totalTax)],
    ]), notes(c.notes));
}
const BLUE_LABEL = { none: "白色申告", "10": "青色 10万円", "55": "青色 55万円", "65": "青色 65万円" };
/** 内訳（いまの税額、各策の上限と残り枠、青色申告の区分ごとの税額、計算に使った値） */
function renderBreakdown(top) {
    const r = top.result;
    const b = r.baseline;
    const m = r.measures;
    const out = [];
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
    if (c.totalPayment > 0)
        out.push(combinedCard("まとめて実行した場合", c));
    if (m.combinedWithIdeco)
        out.push(combinedCard("iDeCo の追加も年内に間に合う場合", m.combinedWithIdeco));
    const f = m.furusato;
    out.push(card("ふるさと納税", f.limit > 0
        ? rows([
            ["控除上限額の目安（年間）", yen(f.limit), "strong"],
            ["寄附済み", yen(f.paid)],
            ["上限までの残り（追加で寄附する額）", yen(f.remaining)],
            ...savingRows(f.saving),
            ["上限まで寄附した場合の自己負担", yen(f.outOfPocket)],
            ...(f.limitAfterOtherMeasures !== f.limit
                ? [["掛金を追加した場合の上限（まとめて実行した場合）", yen(f.limitAfterOtherMeasures)]]
                : []),
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
    out.push(card("計算に使った値", rows(usedInputs(top))));
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
        return `${name}の${(label.textContent ?? "").trim()}`;
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
        const shown = jumpText !== null && !totalsVisible;
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
    const setPlanField = (name, amount, max) => {
        const input = planInput(name);
        const range = planRange(name);
        // 自分で打っている途中の欄は書き換えない
        if (!custom[name] && document.activeElement !== input)
            input.value = name === "ideco" && amount === 0 ? "" : digits(amount);
        range.max = String(Math.ceil(Math.max(max, amount) / 1_000) * 1_000);
        range.value = String(amount);
        range.disabled = max === 0 && amount === 0;
        range.setAttribute("aria-valuetext", yen(amount));
    };
    const renderPlan = (top) => {
        const r = top.result;
        const m = r.measures;
        const plan = top.plan;
        const split = (s) => `${yen(s.total)}（所得税 ${yen(s.incomeTax)}・住民税 ${yen(s.residentTax)}）`;
        text("plan-lead", plan.totalPayment > 0
            ? `年内に合わせて ${yen(plan.totalPayment)}払うと、税金が ${yen(plan.saving.total)}減る見込みです。`
            : "いまの見込みでは、年内に追加で払って税金が減るものはありません。");
        // 仮に置いた値
        $("assumed").hidden = top.assumptions.length === 0;
        $("assumed-list").replaceChildren(...top.assumptions.map((a) => h("li", {}, a.text)));
        // ふるさと納税
        const f = plan.furusato;
        const furusatoOff = f.limit === 0;
        $("act-furusato").classList.toggle("off", furusatoOff);
        text("furusato-off", furusatoOff ? `今回は対象になりません。${browserNote(m.furusato.notes[0] ?? "")}` : "");
        if (!furusatoOff) {
            text("furusato-do", f.amount === 0
                ? f.paid >= f.limit
                    ? `これ以上の寄附はしない（寄附済みの ${yen(f.paid)}が、上限の目安の ${yen(f.limit)}に達しています）`
                    : "寄附しない（0 円にしています）"
                : f.paid > 0
                    ? `あと ${yen(f.amount)}寄附する（寄附済みの ${yen(f.paid)}と合わせて、ことしの合計 ${yen(f.paid + f.amount)}）`
                    : `${yen(f.amount)}寄附する`);
            const hint = [`上限の目安は年間 ${yen(f.limit)}です（これを超えた分は、税金が減らず自己負担になります）。`];
            if (f.limit < m.furusato.limit)
                hint.push(`掛金を払う分、上限の目安は ${yen(m.furusato.limit)}から下がっています。`);
            text("furusato-hint", hint.join(""));
            $("furusato-saving").replaceChildren(split(f.saving), ...(f.over > 0 ? [h("span", { class: "warn" }, `上限の目安を ${yen(f.over)}超えています。超えた分は税金が減りません。`)] : []));
            setPlanField("furusato", f.amount, f.recommended);
            $("furusato-notes").replaceChildren(...m.furusato.notes.map((n) => h("li", {}, browserNote(n))));
        }
        // 小規模企業共済
        const k = plan.kyosai;
        $("act-kyosai").hidden = k === null;
        if (k) {
            text("kyosai-do", k.amount === 0
                ? k.custom
                    ? "追加で払わない（0 円にしています）"
                    : "これ以上払っても、税額は減りません"
                : k.paid > 0
                    ? `掛金を、年内にあと ${yen(k.amount)}多く払う（掛金の増額か、先の月の分をまとめて払う前納）`
                    : `加入して、年内に ${yen(k.amount)}の掛金を払う`);
            const limitOfEffect = m.kyosai.noEffectBeyond;
            const hint = [`年間の上限（月 70,000 円 × 12 か月）までの残りは ${yen(k.max)}です。`];
            if (limitOfEffect !== null)
                hint.push(`${yen(limitOfEffect)}を超えて払っても、税額はそれ以上減りません。`);
            const typed = parseAmount(planInput("kyosai").value);
            if (k.custom && typed !== null && typed > k.amount)
                hint.push(`入れた額のうち、税額が減る ${yen(k.amount)}までで計算しています。`);
            text("kyosai-hint", hint.join(""));
            text("kyosai-saving", split(k.saving));
            setPlanField("kyosai", k.amount, limitOfEffect ?? k.max);
            $("kyosai-notes").replaceChildren(...m.kyosai.notes.map((n) => h("li", {}, browserNote(n))));
        }
        // iDeCo
        const i = plan.ideco;
        text("ideco-do", i.included && i.amount > 0
            ? `掛金を、年内にあと ${yen(i.amount)}多く払う`
            : i.max === 0
                ? "追加はできません（年間の限度額まで払う見込みです）"
                : "年内に増やせる額が分かっていれば、その額を「払う額」に入れる（分からなければ、このままで構いません）");
        const idecoHint = [`年間の限度額までの残りは ${yen(i.max)}です。`];
        if (!i.included && m.ideco.additional > 0 && m.ideco.saving.total > 0) {
            idecoHint.push(`${yen(m.ideco.additional)}を年内に払えた場合は、それだけで税金が ${yen(m.ideco.saving.total)}減ります（合計には入れていません）。`);
        }
        text("ideco-hint", idecoHint.join(""));
        text("ideco-saving", i.included ? split(i.saving) : "合計に入れていません");
        setPlanField("ideco", i.amount, i.max);
        $("ideco-notes").replaceChildren(...m.ideco.notes.map((n) => h("li", {}, browserNote(n))));
        $("act-ideco").classList.toggle("optional", !i.included);
        // 合計
        text("total-saving", yen(plan.saving.total));
        text("total-payment", yen(plan.totalPayment));
        text("total-tax", `${yen(plan.taxBefore)} → ${yen(plan.taxAfter)}`);
        const totalNotes = [];
        if ([f.amount, k?.amount ?? 0, i.amount].filter((n) => n > 0).length > 1) {
            totalNotes.push("合計は、まとめて計算し直した額です。それぞれの「減る税額」は、小規模企業共済・iDeCo・ふるさと納税の順に実行したときの額です。");
        }
        if (f.amount > 0) {
            totalNotes.push(`減る税額のうち ${yen(f.saving.total)}はふるさと納税の分で、寄附と引き換えです（手元のお金は増えません）。`);
        }
        if ((k?.amount ?? 0) + i.amount > 0)
            totalNotes.push("掛金は、払った分が自分の積立として残ります。");
        text("totals-note", totalNotes.join(""));
        $("plan-reset").hidden = !PLAN_FIELDS.some((name) => custom[name]);
        // 確定申告のときに（青色申告）
        const blue = m.blueReturn;
        const best = blue.options.find((o) => o.level === "65");
        const showLater = blue.applicable && best !== undefined && !best.current && best.savingVsCurrent.total > 0;
        $("later").hidden = !showLater;
        if (showLater && best) {
            const unknown = blue.current === "none";
            text("later-text", `青色申告特別控除が 65 万円なら、税額はいまの計算より ${yen(best.savingVsCurrent.total)}少なくなります。` +
                (unknown
                    ? "ただし、使えるのは「青色申告承認申請書」を期限までに税務署に出している方だけです。出していて、複式簿記の帳簿と e-Tax での申告ができる方は、「もっと正確にする」の青色申告特別控除で 65 万円を選んでください。上の金額も変わります。"
                    : "65 万円にするには、複式簿記の帳簿と、e-Tax での期限内の申告が必要です。"));
        }
    };
    /** 社会保険料の目安の説明（「分からない」を選んでいる間、欄の下に出す） */
    const renderGuide = (top) => {
        const box = $("si-guide");
        if (!top?.insurance) {
            box.replaceChildren(h("p", { class: "sub" }, "収入を入れると、ここに目安の額と、その出し方を出します。"));
            return;
        }
        const e = top.insurance;
        box.replaceChildren(h("p", { class: "guide-amount" }, "目安: ", h("strong", {}, yen(e.amount)), `（幅 ${yen(e.low)}〜${yen(e.high)}）`), h("ul", { class: "guide-parts" }, ...e.parts.map((p) => h("li", {}, `${p.label}: ${yen(p.amount)}`))), h("details", { class: "help" }, h("summary", {}, "目安の出し方と、正確な額の調べ方"), h("ul", {}, ...e.basis.map((line) => h("li", {}, line)))));
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
            text("save-status", "このブラウザでは保存できませんでした（プライベートブラウズなど）。");
        if (isBlankTop(values)) {
            current = null;
            planBox.hidden = true;
            notice.replaceChildren(h("p", { class: "placeholder" }, "左（上）の 3 つに答えると、ここに「年内にやること」と金額が出ます。"));
            output.replaceChildren();
            renderGuide(null);
            setJump(null);
            return;
        }
        const top = computeTop(values);
        if (!top.ok) {
            // 払う額の欄を直せるよう、出ていた結果は薄くして残す（数字は古いままなので、読み上げからは外す）
            planBox.hidden = current === null && planBox.hidden;
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
            notice.replaceChildren(h("section", { class: "card error", role: "alert" }, h("h3", {}, "入力を確認してください"), h("ul", { class: "notes" }, ...lines.map((l) => h("li", {}, l)))));
            output.replaceChildren();
            setJump(`入力を確認してください（${top.issues.length} 件）　内容を見る`, true);
            return;
        }
        current = top;
        planBox.hidden = false;
        planBox.classList.remove("stale");
        planBox.removeAttribute("aria-busy");
        renderPlan(top);
        renderGuide(top);
        const r = top.result;
        notice.replaceChildren(...(r.warnings.length > 0 ? [h("section", { class: "card caution" }, h("h3", {}, "注意"), notes(r.warnings))] : []));
        output.replaceChildren(h("details", { class: "breakdown", id: "breakdown" }, h("summary", {}, "内訳を見る", h("span", { class: "summary-sub" }, "いまの税額、それぞれの上限と残り枠、青色申告の区分ごとの税額、計算に使った値")), ...renderBreakdown(top)));
        const p = top.plan;
        setJump(p.totalPayment > 0
            ? `${yen(p.totalPayment)}払うと 税金 −${yen(p.saving.total)}　結果を見る`
            : `税額の見込み ${yen(p.taxBefore)}　結果を見る`);
        announce(p.totalPayment > 0
            ? `結果を更新しました。年内に ${yen(p.totalPayment)}払うと、税金が ${yen(p.saving.total)}減る見込みです。`
            : "結果を更新しました。年内に追加で払って税金が減るものはありません。");
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
        text("save-status", "この端末に保存してあった入力を読み込みました。");
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
            return current.plan.furusato.recommended;
        if (name === "ideco")
            return current.plan.ideco.max;
        return current.result.measures.kyosai.noEffectBeyond ?? current.plan.kyosai?.max ?? 0;
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
    $("open-more").addEventListener("click", () => {
        more.open = true;
        more.scrollIntoView({ behavior: "smooth", block: "start" });
        more.querySelector("summary")?.focus({ preventScroll: true });
    });
    document.querySelector("#example")?.addEventListener("click", () => {
        const keep = saveBox.checked;
        form.reset();
        incomeTypeTouched = false;
        for (const name of PLAN_FIELDS)
            custom[name] = false;
        saveBox.checked = keep;
        fillForm(form, { work: "freelance", revenue: "480万", expenses: "75万" });
        update();
    });
    saveBox.addEventListener("change", () => {
        if (saveBox.checked) {
            text("save-status", save(snapshot()) ? "この端末に保存しています。" : "このブラウザでは保存できませんでした（プライベートブラウズなど）。");
        }
        else {
            clearSaved();
            text("save-status", "保存した内容を消しました。");
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
        const body = summaryText(current, today());
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
            text("share-status", "コピーしました。メールやメモに貼り付けられます。");
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
