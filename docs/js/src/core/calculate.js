import { DEFAULT_YEAR, getTaxYear } from "../data/index.js";
import { estimate, furusatoLimit } from "./estimate.js";
import { validateInput } from "./validate.js";
export const DISCLAIMER = "この結果は入力値と簡略化した前提にもとづく概算です。実際の税額は申告内容やお住まいの自治体によって変わります。" +
    "税理士や税務署・市区町村の判断に代わるものではありません。重要な判断の前に、必ず専門家か所轄の窓口に確認してください。";
const BLUE_LEVELS = ["none", "10", "55", "65"];
function blueAmount(level) {
    return level === "none" ? 0 : Number(level) * 10_000;
}
function saving(before, after) {
    const incomeTax = before.incomeTax.total - after.incomeTax.total;
    const residentTax = before.residentTax.total - after.residentTax.total;
    return { incomeTax, residentTax, total: incomeTax + residentTax };
}
const NO_SAVING = { incomeTax: 0, residentTax: 0, total: 0 };
function contribution(data, base, baseline, opts) {
    const remaining = Math.max(0, opts.annualLimit - opts.paid);
    const notes = [...opts.notes];
    let additional = opts.requested ?? remaining;
    if (additional > remaining) {
        notes.push(`指定された追加額 ${additional.toLocaleString("ja-JP")} 円は残り枠を超えるため、残り枠の ${remaining.toLocaleString("ja-JP")} 円で計算しました。`);
        additional = remaining;
    }
    if (opts.paid > opts.annualLimit) {
        notes.push("支払済みの額が年間上限を超えています。入力値か上限額を確認してください。");
    }
    const after = estimate(data, { ...base, mutualAid: base.mutualAid + additional });
    return {
        applicable: true,
        annualLimit: opts.annualLimit,
        paid: opts.paid,
        remaining,
        additional,
        saving: additional > 0 ? saving(baseline, after) : NO_SAVING,
        notes,
    };
}
/**
 * 現状の所得税・住民税の概算と、節税策ごとの軽減額を計算する。
 *
 * 入力は validateInput を通してから使うので、JSON などの外部入力をそのまま渡してよい。
 */
export function calculate(rawInput) {
    const input = validateInput(rawInput);
    const year = input.year ?? DEFAULT_YEAR;
    const data = getTaxYear(year);
    const normalized = {
        year,
        salaryRevenue: input.salaryRevenue ?? 0,
        businessRevenue: input.businessRevenue ?? 0,
        businessExpenses: input.businessExpenses ?? 0,
        businessIncomeType: input.businessIncomeType ?? "business",
        blueReturn: input.blueReturn ?? "none",
        socialInsurance: input.socialInsurance ?? 0,
        idecoPaid: input.idecoPaid ?? 0,
        kyosaiPaid: input.kyosaiPaid ?? 0,
        furusatoPaid: input.furusatoPaid ?? 0,
        spouse: input.spouse ?? null,
        dependents: {
            general: input.dependents?.general ?? 0,
            specific: input.dependents?.specific ?? 0,
            elderly: input.dependents?.elderly ?? 0,
            elderlyCohabiting: input.dependents?.elderlyCohabiting ?? 0,
        },
        otherDeductions: input.otherDeductions ?? 0,
        otherDeductionsResident: input.otherDeductionsResident ?? input.otherDeductions ?? 0,
    };
    const base = {
        salaryRevenue: normalized.salaryRevenue,
        businessRevenue: normalized.businessRevenue,
        businessExpenses: normalized.businessExpenses,
        businessIncomeType: normalized.businessIncomeType,
        blueDeduction: blueAmount(normalized.blueReturn),
        socialInsurance: normalized.socialInsurance,
        mutualAid: normalized.idecoPaid + normalized.kyosaiPaid,
        donation: normalized.furusatoPaid,
        spouse: normalized.spouse,
        dependents: normalized.dependents,
        otherDeductions: normalized.otherDeductions,
        otherDeductionsResident: normalized.otherDeductionsResident,
    };
    const baseline = estimate(data, base);
    const hasSalary = normalized.salaryRevenue > 0;
    const hasBusiness = normalized.businessRevenue > 0;
    const isBusinessIncome = normalized.businessIncomeType === "business";
    // --- iDeCo ---
    const idecoNotes = [];
    let idecoLimit;
    if (input.idecoAnnualLimit !== undefined) {
        idecoLimit = input.idecoAnnualLimit;
    }
    else if (hasSalary) {
        idecoLimit = data.ideco.employeeWithoutPensionMonthlyLimit * 12;
        idecoNotes.push(`年間上限は「企業年金のない会社員」（月額 ${data.ideco.employeeWithoutPensionMonthlyLimit.toLocaleString("ja-JP")} 円）として計算しました。` +
            "勤務先に企業年金がある方・公務員の方は上限が異なるので、idecoAnnualLimit（--ideco-limit）で指定してください。");
    }
    else {
        idecoLimit = data.ideco.selfEmployedMonthlyLimit * 12;
        idecoNotes.push(`年間上限は国民年金第1号被保険者（月額 ${data.ideco.selfEmployedMonthlyLimit.toLocaleString("ja-JP")} 円）として計算しました。` +
            "国民年金基金の掛金・付加保険料と合算した上限です。");
    }
    idecoNotes.push("掛金額の変更は年1回で、手続きから反映まで時間がかかります。年末が近い場合は今年分に間に合わないことがあるので、金融機関（運営管理機関）に確認してください。");
    const ideco = contribution(data, base, baseline, {
        annualLimit: idecoLimit,
        paid: normalized.idecoPaid,
        requested: input.idecoAdditional,
        notes: idecoNotes,
    });
    // --- 小規模企業共済 ---
    const kyosaiLimit = data.kyosai.monthlyLimit * 12;
    let kyosai;
    const kyosaiBlocked = hasSalary
        ? "給与収入があるため計算していません。事業を兼業している給与所得者（常時雇用関係にある方）は小規模企業共済に加入できません。"
        : !hasBusiness
            ? "事業の収入がないため計算していません。"
            : !isBusinessIncome
                ? "雑所得として入力されているため計算していません。小規模企業共済は個人事業主などが対象です。"
                : null;
    if (kyosaiBlocked !== null && normalized.kyosaiPaid === 0) {
        kyosai = {
            applicable: false,
            annualLimit: kyosaiLimit,
            paid: 0,
            remaining: 0,
            additional: 0,
            saving: NO_SAVING,
            notes: [kyosaiBlocked],
        };
    }
    else {
        kyosai = contribution(data, base, baseline, {
            annualLimit: kyosaiLimit,
            paid: normalized.kyosaiPaid,
            requested: input.kyosaiAdditional,
            notes: [
                `年間上限は掛金月額の上限 ${data.kyosai.monthlyLimit.toLocaleString("ja-JP")} 円 × 12 か月として計算しました。`,
                "年内に支払った掛金（1年以内の前納分を含む）が控除の対象です。加入資格・掛金の増額や前納の手続きと締切は中小機構の案内で確認してください。",
            ],
        });
    }
    // --- ふるさと納税 ---
    const limit = furusatoLimit(data, base);
    const paid = normalized.furusatoPaid;
    const target = Math.max(limit, paid);
    const atTarget = estimate(data, { ...base, donation: target });
    const noDonation = estimate(data, { ...base, donation: 0 });
    const reliefAtTarget = noDonation.totalTax - atTarget.totalTax;
    const plannedExtra = ideco.additional + kyosai.additional;
    const limitAfterOtherMeasures = plannedExtra > 0 ? furusatoLimit(data, { ...base, mutualAid: base.mutualAid + plannedExtra }) : limit;
    const furusatoNotes = [
        "確定申告をする前提の目安です（確定申告をするとワンストップ特例の申請は無効になります）。",
        "所得や控除が見込みから動くと上限も変わります。上限ぎりぎりではなく余裕を持たせてください。",
    ];
    if (limit === 0) {
        furusatoNotes.unshift("住民税の所得割額が 0 円の見込みのため、ふるさと納税による税の軽減はありません。");
    }
    if (paid > limit && limit > 0) {
        furusatoNotes.unshift("寄附済みの額が上限の目安を超えています。超えた分は自己負担が増えます。");
    }
    if (limitAfterOtherMeasures !== limit) {
        furusatoNotes.push("iDeCo や小規模企業共済の掛金を増やすと、住民税の所得割額が減るため上限の目安も下がります。");
    }
    const furusato = {
        limit,
        paid,
        remaining: Math.max(0, limit - paid),
        saving: target > paid ? saving(baseline, atTarget) : NO_SAVING,
        outOfPocket: target > 0 ? target - reliefAtTarget : 0,
        limitAfterOtherMeasures,
        notes: furusatoNotes,
    };
    // --- まとめて実行した場合 ---
    // 掛金を増やすと住民税の所得割額が減り、ふるさと納税の上限も下がるので、
    // 「掛金を追加した後の上限」まで寄附する前提でまとめて再計算する。
    const combinedDonation = Math.max(limitAfterOtherMeasures, paid);
    const combinedEstimate = estimate(data, {
        ...base,
        mutualAid: base.mutualAid + plannedExtra,
        donation: combinedDonation,
    });
    const combinedNotes = [
        "3 つをまとめて実行した場合の税額を計算し直した値です。各策の軽減額を足した額とは一致しません。",
    ];
    if (limitAfterOtherMeasures < limit) {
        combinedNotes.push(`ふるさと納税は、掛金を追加した後の上限の目安（${limitAfterOtherMeasures.toLocaleString("ja-JP")} 円）まで寄附する前提です。`);
    }
    if (paid > limitAfterOtherMeasures && plannedExtra > 0 && limit > 0) {
        combinedNotes.push("寄附済みの額が、掛金を追加した後の上限の目安を超えます。超えた分は自己負担が増えるので、掛金の追加額とあわせて検討してください。");
    }
    const combined = {
        idecoAdditional: ideco.additional,
        kyosaiAdditional: kyosai.additional,
        furusatoAdditional: combinedDonation - paid,
        totalPayment: plannedExtra + (combinedDonation - paid),
        totalTax: combinedEstimate.totalTax,
        saving: saving(baseline, combinedEstimate),
        notes: combinedNotes,
    };
    // --- 青色申告特別控除 ---
    let blueReturn;
    if (!hasBusiness || !isBusinessIncome) {
        blueReturn = {
            applicable: false,
            current: normalized.blueReturn,
            options: [],
            notes: [
                hasBusiness
                    ? "雑所得として入力されているため計算していません。青色申告特別控除は事業所得（または不動産所得）が対象です。"
                    : "事業の収入がないため計算していません。",
            ],
        };
    }
    else {
        const options = BLUE_LEVELS.map((level) => {
            const e = estimate(data, { ...base, blueDeduction: blueAmount(level) });
            return {
                level,
                deduction: blueAmount(level),
                deductionApplied: e.blueDeductionApplied,
                totalTax: e.totalTax,
                savingVsCurrent: saving(baseline, e),
                current: level === normalized.blueReturn,
            };
        });
        const notes = [
            "55万円: 複式簿記で記帳し、貸借対照表・損益計算書を付けて期限内に申告。65万円: それに加えて e-Tax で申告するか、優良な電子帳簿で保存。",
        ];
        if (normalized.blueReturn === "none") {
            notes.push("青色申告には事前に「青色申告承認申請書」の提出が必要です。未提出の場合、今年分には間に合わない可能性が高いので、提出期限を税務署で確認してください（来年分の準備としては有効です）。");
        }
        blueReturn = { applicable: true, current: normalized.blueReturn, options, notes };
    }
    // --- 注意 ---
    const warnings = [];
    if (baseline.totalIncome === 0) {
        warnings.push("合計所得金額が 0 円の見込みです。入力値（収入・経費）を確認してください。");
    }
    else if (baseline.incomeTax.taxableIncome === 0) {
        warnings.push("所得税の課税所得が 0 円の見込みです。所得控除を増やしても所得税はこれ以上減りません。");
    }
    if (normalized.spouse) {
        const [, , top] = data.family.taxpayerTiers;
        if (baseline.totalIncome > top) {
            warnings.push("本人の合計所得金額が 1,000 万円を超えるため、配偶者控除・配偶者特別控除は適用していません。");
        }
        else if (normalized.spouse.income > data.family.spouseSpecialIncomeLimit) {
            warnings.push("配偶者の合計所得金額が 133 万円を超えるため、配偶者控除・配偶者特別控除は適用していません。");
        }
    }
    if (normalized.salaryRevenue > 8_500_000) {
        warnings.push("給与収入が 850 万円を超える場合の所得金額調整控除は計算に含めていません。");
    }
    if (normalized.blueReturn !== "none" && baseline.blueDeductionApplied < blueAmount(normalized.blueReturn)) {
        warnings.push("事業所得が青色申告特別控除の枠より小さいため、控除は事業所得の金額までにしています。");
    }
    return {
        year,
        label: data.label,
        residentTaxLabel: data.residentTaxLabel,
        input: normalized,
        baseline,
        measures: { furusato, ideco, kyosai, blueReturn, combined },
        warnings,
        disclaimer: DISCLAIMER,
    };
}
