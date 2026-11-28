import { VERSION } from "../src/version.js";
import { browserNote } from "./logic.js";
import { webMessages } from "./messages.js";
/** 計算に使った値を、[項目名, 値] の並びにする。 */
export function usedInputs(top, locale = "ja") {
    const t = webMessages(locale);
    const yen = t.yen;
    const n = top.result.input;
    const rows = [];
    if (n.salaryRevenue > 0)
        rows.push([t.uSalary, yen(n.salaryRevenue)]);
    if (n.businessRevenue > 0 || n.businessExpenses > 0 || n.salaryRevenue === 0) {
        rows.push([n.salaryRevenue > 0 ? t.uSideRevenue : t.uRevenue, yen(n.businessRevenue)]);
        rows.push([t.uExpenses, yen(n.businessExpenses)]);
        rows.push([t.uIncomeType, n.businessIncomeType === "business" ? t.businessIncome : t.miscIncome]);
        if (n.businessIncomeType === "business")
            rows.push([t.uBlue, t.blueShort[n.blueReturn]]);
    }
    rows.push([t.uInsurance, top.insurance ? t.insuranceEstimated(n.socialInsurance, top.insurance.low, top.insurance.high) : yen(n.socialInsurance)]);
    rows.push([t.uIdeco, yen(n.idecoPaid)]);
    rows.push([t.uKyosai, yen(n.kyosaiPaid)]);
    rows.push([t.uFurusato, yen(n.furusatoPaid)]);
    if (n.medicalExpenses > 0)
        rows.push([t.uMedical, yen(Math.max(0, n.medicalExpenses - n.medicalReimbursed))]);
    if (n.selfMedicationExpenses > 0)
        rows.push([t.uSelfMedication, yen(n.selfMedicationExpenses)]);
    const lifePaid = n.lifeInsuranceNew + n.lifeInsuranceOld + n.medicalCareInsurance + n.pensionInsuranceNew + n.pensionInsuranceOld;
    if (lifePaid > 0)
        rows.push([t.uLifeInsurance, yen(lifePaid)]);
    rows.push([t.uOther, yen(n.otherDeductions)]);
    rows.push([t.uSpouse, n.spouse ? t.spouseYes(n.spouse.income, n.spouse.age70OrOlder === true) : t.none]);
    const d = n.dependents;
    const family = [
        d.under16 > 0 ? t.depUnder16(d.under16) : "",
        d.general > 0 ? t.depGeneral(d.general) : "",
        d.specific > 0 ? t.depSpecific(d.specific) : "",
        d.elderlyCohabiting > 0 ? t.depElderlyCohabiting(d.elderlyCohabiting) : "",
        d.elderly > 0 ? t.depElderly(d.elderly) : "",
    ].filter((text) => text !== "");
    rows.push([t.uDependents, family.length > 0 ? family.join(t.listSeparator) : t.none]);
    return rows;
}
/** 年内にやることを 1 行ずつにする。 */
export function planLines(plan, _result, locale = "ja") {
    const t = webMessages(locale);
    const lines = [];
    const f = plan.furusato;
    if (f.amount > 0)
        lines.push(t.lineFurusato(f.amount, f.saving.total, f.limit, f.paid > 0));
    if (plan.kyosai && plan.kyosai.amount > 0)
        lines.push(t.lineKyosai(plan.kyosai.amount, plan.kyosai.saving.total, plan.kyosai.paid > 0));
    if (plan.ideco.included && plan.ideco.amount > 0)
        lines.push(t.lineIdeco(plan.ideco.amount, plan.ideco.saving.total));
    if (lines.length === 0)
        lines.push(t.planNone);
    return lines;
}
/** 結果の全体を文章にする。date は「2026-11-27」の形。 */
export function summaryText(top, date, locale = "ja") {
    const t = webMessages(locale);
    const r = top.result;
    const b = r.baseline;
    const plan = top.plan;
    const out = [];
    out.push(t.sumTitle(r.label));
    out.push(t.sumMadeBy(VERSION, date));
    out.push("");
    out.push(t.hPlan);
    planLines(plan, r, locale).forEach((line, index) => out.push(`${index + 1}. ${line}`));
    if (plan.totalPayment > 0) {
        out.push(t.sumTotal(plan.totalPayment, plan.saving.total, plan.taxBefore, plan.taxAfter));
        if (plan.furusato.amount > 0)
            out.push(t.sumFurusatoNote);
    }
    if (plan.furusato.skipped) {
        const k = plan.furusato.skipped;
        out.push(t.sumSkipped(k.amount, k.saving.total, k.amount - k.saving.total));
    }
    if (plan.budget)
        out.push(t.sumBudget(plan.budget.amount, plan.budget.reason));
    if (plan.kyosai?.ifJoined && !plan.kyosai.custom)
        out.push(t.sumKyosaiNot(plan.kyosai.ifJoined.amount, plan.kyosai.ifJoined.saving.total));
    if (!plan.ideco.included && r.measures.ideco.additional > 0)
        out.push(t.sumIdecoNot(r.measures.ideco.additional, r.measures.ideco.saving.total));
    out.push("");
    out.push(t.hTax);
    out.push(t.sumIncomeTax(b.incomeTax.total));
    out.push(t.sumResidentTax(r.residentTaxLabel, b.residentTax.total));
    out.push(t.sumTotalTax(b.totalTax));
    out.push("");
    out.push(t.hInputs);
    for (const [label, value] of usedInputs(top, locale))
        out.push(`${label}: ${value}`);
    if (top.assumptions.length > 0) {
        out.push("");
        out.push(t.hAssumed);
        for (const a of top.assumptions)
            out.push(`- ${a.text}`);
    }
    if (r.warnings.length > 0) {
        out.push("");
        out.push(t.hCaution);
        for (const w of r.warnings)
            out.push(`- ${browserNote(w)}`);
    }
    out.push("");
    out.push(t.sumDisclaimer);
    out.push(t.siteUrl);
    return out.join("\n");
}
