/**
 * 計算結果（現状の見込み = baseline）を、確定申告書の欄に当てはめる。
 *
 * 欄の番号と名前は、国税庁が公開している「令和８年分の所得税等の確定申告書（案）」の
 * 第一表（様式ID NTA1K0A020010230）と第二表（様式ID NTA0K0A020020230）で確かめた（2026-11-28 に閲覧）。
 *   https://www.nta.go.jp/taxes/shiraberu/shinkoku/pdf/0026006-063.pdf
 * 案なので、確定した様式が公開されたら、番号と名前を照らし合わせて差し替える（FORM_2026.draft を false にする）。
 * セルフメディケーション税制を選ぶときの「区分」の書き方は、国税庁 確定申告の手引き（令和7年分）による。
 *   https://www.nta.go.jp/taxes/shiraberu/shinkoku/tebiki/2025/03/order3/3-3_24.htm
 *
 * 金額はここでは計算しない。計算コアの結果を、欄の名前を付けて並べ直すだけ。
 */
import { floorTo } from "./estimate.js";
import { m } from "./messages.js";
/** 当てはめた様式 */
export const FORM_2026 = {
    draft: true,
    sourceUrl: "https://www.nta.go.jp/taxes/shiraberu/shinkoku/pdf/0026006-063.pdf",
};
export function filingGuide(r) {
    const b = r.baseline;
    const n = r.input;
    const it = b.incomeTax;
    const d = it.deductions;
    const t = m().filing;
    const entries = [];
    const add = (sheet, field, label, amount, note) => {
        entries.push({ sheet, field, label, amount, note });
    };
    // --- 第一表: 収入金額等・所得金額等 ---
    const hasBusiness = n.businessRevenue > 0 || n.businessExpenses > 0;
    const isBusiness = n.businessIncomeType === "business";
    if (hasBusiness && isBusiness)
        add("first", "㋐", "収入金額等 事業 営業等", n.businessRevenue, t.revenueBusiness);
    if (n.salaryRevenue > 0)
        add("first", "㋔", "収入金額等 給与", n.salaryRevenue, t.revenueSalary);
    if (hasBusiness && !isBusiness)
        add("first", "㋖", "収入金額等 雑 業務", n.businessRevenue, t.revenueMisc);
    if (hasBusiness && isBusiness)
        add("first", "①", "所得金額等 事業 営業等", b.businessIncome, t.incomeBusiness(b.blueDeductionApplied));
    if (n.salaryRevenue > 0)
        add("first", "⑥", "所得金額等 給与", b.salaryIncome, t.incomeSalary(b.incomeAdjustment));
    if (hasBusiness && !isBusiness) {
        add("first", "⑧", "所得金額等 雑 業務", b.businessIncome, t.incomeMisc);
        add("first", "⑩", "⑦から⑨までの計", b.businessIncome, t.miscTotal);
    }
    add("first", "⑫", "合計（①から⑥までの計＋⑩＋⑪）", b.totalIncome, t.totalIncome);
    // --- 第一表: 所得から差し引かれる金額 ---
    if (d.socialInsurance > 0)
        add("first", "⑬", "社会保険料", d.socialInsurance, t.socialInsurance);
    if (d.smallBusinessMutualAid > 0)
        add("first", "⑭", "小規模企業共済等掛金", d.smallBusinessMutualAid, t.mutualAid);
    if (d.lifeInsurance > 0)
        add("first", "⑮", "生命保険料", d.lifeInsurance, t.lifeInsurance);
    if (d.spouse > 0)
        add("first", "㉑・㉒", "配偶者（特別）", d.spouse, t.spouse);
    if (d.dependents > 0)
        add("first", "㉓", "扶養", d.dependents, t.dependents);
    add("first", "㉕", "基礎", d.basic, t.basic);
    // ㉖ = ⑬〜㉕ の計。「その他の所得控除」（地震保険料控除など）は ⑬〜㉕ のどれかの欄に入るものとして含める
    const subtotal = d.total - d.medical - d.donation;
    add("first", "㉖", "⑬から㉕までの計", subtotal, n.otherDeductions > 0 ? t.subtotalWithOther(n.otherDeductions) : t.subtotal);
    if (d.medical > 0) {
        const self = r.deductionDetails.medical.method === "selfMedication";
        add("first", "㉘", "医療費", d.medical, self ? t.medicalSelf : t.medicalNormal);
    }
    if (d.donation > 0)
        add("first", "㉙", "寄附金", d.donation, t.donation(n.furusatoPaid));
    add("first", "㉚", "合計（㉖＋㉗＋㉘＋㉙）", d.total, t.deductionTotal);
    // --- 第一表: 税金の計算 ---
    add("first", "㉛", "課税される所得金額（⑫－㉚）", it.taxableIncome, t.taxable);
    add("first", "㉜", "上の㉛に対する税額", it.baseTax, t.taxOnTaxable(it.marginalRatePercent));
    add("first", "㊷", "差引所得税額", it.baseTax, t.afterCredits);
    add("first", "㊹", "再差引所得税額（基準所得税額）", it.baseTax, t.baseTax);
    add("first", "㊺", "復興特別所得税額（㊹×2.1%）", it.reconstructionTax, t.reconstruction);
    add("first", "㊻", "所得税及び復興特別所得税の額（㊹＋㊺）", it.baseTax + it.reconstructionTax, t.incomeTaxTotal);
    add("first", "㊾", "源泉徴収税額", null, t.withholding);
    add("first", "㊿", "申告納税額（㊻－㊼－㊽－㊾）", floorTo(it.baseTax + it.reconstructionTax, 100), t.payable);
    // --- 第二表 ---
    if (n.socialInsurance > 0)
        add("second", "⑬", "社会保険料控除（保険料等の種類・支払保険料等の計）", n.socialInsurance, t.socialInsuranceDetail);
    if (n.idecoPaid > 0)
        add("second", "⑭", "小規模企業共済等掛金控除（個人型確定拠出年金）", n.idecoPaid, t.idecoDetail);
    if (n.kyosaiPaid > 0)
        add("second", "⑭", "小規模企業共済等掛金控除（小規模企業共済）", n.kyosaiPaid, t.kyosaiDetail);
    const life = r.deductionDetails.lifeInsurance;
    const lifeRows = [
        [n.lifeInsuranceNew, life.lifeOldOnly, "新生命保険料"],
        [n.lifeInsuranceOld, false, "旧生命保険料"],
        [n.pensionInsuranceNew, life.pensionOldOnly, "新個人年金保険料"],
        [n.pensionInsuranceOld, false, "旧個人年金保険料"],
        [n.medicalCareInsurance, false, "介護医療保険料"],
    ];
    for (const [paid, skipped, label] of lifeRows) {
        if (paid > 0 && !skipped)
            add("second", "⑮", `生命保険料控除 ${label}（支払保険料等の計）`, paid, t.lifeDetail);
    }
    if (d.donation > 0)
        add("second", "㉙", "寄附金控除に関する事項 寄附金", n.furusatoPaid, t.donationDetail);
    const dep = n.dependents;
    const family = dep.general + dep.specific + dep.elderly + dep.elderlyCohabiting + dep.under16;
    if (n.spouse !== null || family > 0)
        add("second", null, "配偶者や親族に関する事項", null, dep.under16 > 0 ? t.familyUnder16(dep.under16) : t.family);
    // --- 第二表: 住民税・事業税に関する事項 ---
    if (n.furusatoPaid > 0)
        add("resident", null, "都道府県、市区町村への寄附（特例控除対象）", n.furusatoPaid, t.residentFurusato);
    if (n.salaryRevenue > 0 && hasBusiness)
        add("resident", null, "給与、公的年金等以外の所得に係る住民税の徴収方法", null, t.residentCollection);
    // --- 青色申告決算書 ---
    if (b.blueDeductionApplied > 0)
        add("blue", null, "青色申告特別控除額（損益計算書）", b.blueDeductionApplied, t.blueStatement);
    const notes = [t.noteDraft, t.noteBaseline, t.noteWithholding, t.noteResidentReturn, t.noteEtax];
    return { form: t.formName, draft: FORM_2026.draft, sourceUrl: FORM_2026.sourceUrl, entries, notes };
}
