import { furusatoComparison2025 } from "../data/2025-furusato.js";
import { DEFAULT_YEAR, getTaxYear } from "../data/index.js";
import { estimate, furusatoLimit, furusatoLimitDetail, perCapitaExemptLimitMax } from "./estimate.js";
import { InputError, validateInput } from "./validate.js";
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
const yen = (n) => `${n.toLocaleString("ja-JP")} 円`;
/**
 * 掛金を upTo 円まで追加したときと同じ税額になる、最小の追加額（1,000 円単位に切り上げ）。
 * 所得税と住民税の所得割が 0 円（か下限）になると、それ以上掛金を増やしても税額は減らない。
 */
function effectiveAdditional(data, base, upTo) {
    const taxAt = (x) => estimate(data, { ...base, mutualAid: base.mutualAid + x }).totalTax;
    const floorTax = taxAt(upTo);
    if (taxAt(0) === floorTax)
        return 0;
    // 税額は掛金に対して単調に減るので二分探索できる
    let lo = 0;
    let hi = upTo;
    while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (taxAt(mid) === floorTax)
            hi = mid;
        else
            lo = mid;
    }
    return Math.min(upTo, Math.ceil(hi / 1_000) * 1_000);
}
function contribution(data, base, baseline, opts) {
    const remaining = Math.max(0, opts.annualLimit - opts.paid);
    const notes = [...opts.notes];
    let additional = opts.requested ?? remaining;
    if (additional > remaining) {
        notes.push(`指定された追加額 ${yen(additional)}は残り枠を超えるため、残り枠の ${yen(remaining)}で計算しました。`);
        additional = remaining;
    }
    if (opts.paid > opts.annualLimit) {
        notes.push("支払済みの額が年間上限を超えています。入力値か上限額を確認してください。");
    }
    // 頭打ちにする前の額（残り枠か、指定された額）。まとめて実行した場合の計算はこちらから始める
    const wanted = additional;
    // 税額が減らなくなる額を超えた掛金は提案しない
    let noEffectBeyond = null;
    const effective = effectiveAdditional(data, base, additional);
    if (effective < additional) {
        noEffectBeyond = effective;
        notes.unshift(effective === 0
            ? "いまの見込みでは、掛金を追加しても税額は減りません（所得税と住民税の所得割が、すでに 0 円かこれ以上減らない額のため）。"
            : `掛金を ${yen(effective)}より多く追加しても、税額はそれ以上減りません（所得税と住民税の所得割が、0 円かこれ以上減らない額になるため）。` +
                `追加額は ${yen(effective)}で計算しました（${opts.requested === undefined ? "残り枠" : "指定された額"}は ${yen(additional)}）。`);
        additional = effective;
    }
    const after = estimate(data, { ...base, mutualAid: base.mutualAid + additional });
    return {
        applicable: true,
        annualLimit: opts.annualLimit,
        paid: opts.paid,
        remaining,
        additional,
        noEffectBeyond,
        saving: additional > 0 ? saving(baseline, after) : NO_SAVING,
        notes,
        wanted,
    };
}
/** 計算の途中でだけ使う wanted を外す */
function publish({ wanted: _wanted, ...measure }) {
    return measure;
}
/** 入力を検証し、既定値を埋めて、計算の土台になるシナリオを作る。 */
function prepare(rawInput) {
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
            under16: input.dependents?.under16 ?? 0,
        },
        // 特定扶養親族（19〜22 歳）と 16 歳未満の扶養親族は必ず 23 歳未満なので、いれば対象
        incomeAdjustment: input.incomeAdjustment === true ||
            (input.dependents?.specific ?? 0) > 0 ||
            (input.dependents?.under16 ?? 0) > 0,
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
        incomeAdjustmentEligible: normalized.incomeAdjustment,
    };
    return { input, year, data, normalized, base };
}
/**
 * 現状の所得税・住民税の概算と、節税策ごとの軽減額を計算する。
 *
 * 入力は validateInput を通してから使うので、JSON などの外部入力をそのまま渡してよい。
 */
export function calculate(rawInput) {
    const { input, year, data, normalized, base } = prepare(rawInput);
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
    idecoNotes.push("年内に増やせるかどうかは、加入先（運営管理機関）と時期しだいです。掛金額の変更は 1 年（12 月分〜翌年 11 月分）に 1 回だけで、" +
        "まとめて拠出するには事前に年単位拠出（月別指定）の届出が必要です。届出は申請の翌月分（翌々月の引落し）からの反映で、過ぎた月の分をあとから納めることはできません。" +
        "今年の控除になるのは、12 月の引落し分までです。", "原則 60 歳まで引き出せません。受け取るときは、一時金なら退職所得、年金なら公的年金等として課税の対象になります（それぞれ控除があります）。" +
        "口座管理などの手数料がかかります（金額は金融機関によって異なります）。運用の結果によっては、受け取る額が掛金の合計を下回ることがあります。");
    const idecoPlan = contribution(data, base, baseline, {
        annualLimit: idecoLimit,
        paid: normalized.idecoPaid,
        requested: input.idecoAdditional,
        notes: idecoNotes,
    });
    const ideco = publish(idecoPlan);
    // --- 小規模企業共済 ---
    const kyosaiLimit = data.kyosai.monthlyLimit * 12;
    let kyosai;
    let kyosaiWanted = 0;
    const kyosaiBlocked = hasSalary
        ? "給与収入があるため計算していません。事業を兼業している給与所得者（常時雇用関係にある方）は小規模企業共済に加入できません。"
        : !hasBusiness
            ? "事業の収入がないため計算していません。"
            : !isBusinessIncome
                ? "雑所得（事業とは言えない副業などの所得）として入力されているため計算していません。小規模企業共済は個人事業主などが対象です。"
                : null;
    if (kyosaiBlocked !== null && normalized.kyosaiPaid === 0) {
        kyosai = {
            applicable: false,
            annualLimit: kyosaiLimit,
            paid: 0,
            remaining: 0,
            additional: 0,
            noEffectBeyond: null,
            saving: NO_SAVING,
            notes: [kyosaiBlocked],
        };
    }
    else {
        const kyosaiPlan = contribution(data, base, baseline, {
            annualLimit: kyosaiLimit,
            paid: normalized.kyosaiPaid,
            requested: input.kyosaiAdditional,
            notes: [
                `年間上限は掛金月額の上限 ${data.kyosai.monthlyLimit.toLocaleString("ja-JP")} 円 × 12 か月として計算しました。`,
                "年内に支払った掛金（1年以内の前納分を含む）が控除の対象です。加入資格・掛金の増額や前納の手続きと締切は中小機構の案内で確認してください。",
                "掛金は事業をやめるときなどに共済金として受け取るもので、受け取るときに課税されます（一括は退職所得、分割は公的年金等の雑所得、65 歳未満の任意解約は一時所得）。" +
                    "任意解約は、掛金納付月数が 240 か月（20 年）未満だと受取額が掛金の合計を下回り、12 か月未満だと掛け捨てになります。",
            ],
        });
        kyosai = publish(kyosaiPlan);
        kyosaiWanted = kyosaiPlan.wanted;
    }
    // --- まとめて実行した場合の掛金 ---
    // 掛金を増やすと住民税の所得割額が減り、ふるさと納税の上限も下がるので、
    // 「掛金を追加した後の上限」まで寄附する前提でまとめて再計算する。
    // iDeCo の追加は、年内に増やせるかどうかが加入先と時期しだいなので、額を指定されたときだけ合計に含める。
    const limit = furusatoLimit(data, base);
    const paid = normalized.furusatoPaid;
    const idecoRequested = input.idecoAdditional !== undefined;
    const combine = (includesIdeco) => {
        // 単独では税額が減らなくなる額でも、合わせると減ることがある（所得割の非課税限度額による減額で
        // 税額が横ばいになる範囲を越える場合）。単独で頭打ちにした額ではなく、残り枠・指定された額から始める。
        const idecoWanted = includesIdeco ? idecoPlan.wanted : 0;
        const wanted = kyosaiWanted + idecoWanted;
        // 合わせた掛金でも、税額が減らなくなる額を超える分は含めない
        const total = effectiveAdditional(data, base, wanted);
        // 額を指定された iDeCo を先に、そうでなければ小規模企業共済を先に割り当てる
        const idecoFirst = includesIdeco && idecoRequested;
        const idecoAdditional = !includesIdeco
            ? 0
            : idecoFirst
                ? Math.min(idecoWanted, total)
                : total - Math.min(kyosaiWanted, total);
        const kyosaiAdditional = total - idecoAdditional;
        const limitAfter = total > 0 ? furusatoLimit(data, { ...base, mutualAid: base.mutualAid + total }) : limit;
        const donation = Math.max(limitAfter, paid);
        const contributionsOnly = estimate(data, { ...base, mutualAid: base.mutualAid + total });
        const all = estimate(data, { ...base, mutualAid: base.mutualAid + total, donation });
        const furusatoAdditional = donation - paid;
        const notes = [];
        if ([idecoAdditional, kyosaiAdditional, furusatoAdditional].filter((n) => n > 0).length > 1) {
            notes.push("まとめて実行した場合の税額を計算し直した値です。各策の軽減額を足した額とは一致しません。");
        }
        if (total < wanted) {
            notes.push(`掛金は合わせて ${yen(total)}で税額がそれ以上減らなくなるため、それを超える分は含めていません。`);
        }
        if (furusatoAdditional > 0) {
            notes.push("ふるさと納税による分は、寄附した額から自己負担を引いた額が税から引かれるものです。寄附と同じだけお金が出ていくので、手元のお金は増えません（得になるのは返礼品の分です）。");
        }
        if (limitAfter < limit) {
            notes.push(limitAfter === 0
                ? "掛金を追加すると住民税の所得割額が減り、ふるさと納税の上限の目安が 0 円になるため、ふるさと納税の追加は含めていません。"
                : `ふるさと納税は、掛金を追加した後の上限の目安（${yen(limitAfter)}）まで寄附する前提です。`);
        }
        if (paid > limitAfter && total > 0 && limit > 0) {
            notes.push("寄附済みの額が、掛金を追加した後の上限の目安を超えます。超えた分は自己負担が増えるので、掛金の追加額とあわせて検討してください。");
        }
        if (!includesIdeco && ideco.additional > 0) {
            notes.push("iDeCo の追加は、この合計に含めていません。掛金額の変更は年 1 回で反映にも時間がかかり、年内に増やせるかどうかは加入先と時期しだいのためです。" +
                "年内に追加できる額がわかっている場合は、その額を指定すると合計に含めます" +
                "（CLI は --ideco-add、JSON は idecoAdditional、ブラウザ版は「iDeCo に年内に追加できる額」）。");
        }
        return {
            includesIdeco,
            idecoAdditional,
            kyosaiAdditional,
            furusatoAdditional,
            totalPayment: total + furusatoAdditional,
            totalTax: all.totalTax,
            saving: saving(baseline, all),
            savingFromContributions: saving(baseline, contributionsOnly),
            savingFromFurusato: saving(contributionsOnly, all),
            notes,
            limitAfter,
        };
    };
    const strip = ({ limitAfter: _limitAfter, ...measure }) => measure;
    const combinedPlan = combine(idecoRequested);
    const combined = strip(combinedPlan);
    let combinedWithIdeco = null;
    if (!idecoRequested && idecoPlan.wanted > 0) {
        const withIdeco = combine(true);
        if (withIdeco.idecoAdditional > 0 && withIdeco.saving.total > combined.saving.total) {
            combinedWithIdeco = {
                ...strip(withIdeco),
                notes: [
                    "iDeCo の追加（残り枠）も年内に間に合う場合の合計です。間に合うかどうかは加入先（運営管理機関）に確認してください。",
                    ...withIdeco.notes,
                ],
            };
        }
    }
    // --- ふるさと納税 ---
    const limitAfterOtherMeasures = combinedPlan.limitAfter;
    const target = Math.max(limit, paid);
    const atTarget = estimate(data, { ...base, donation: target });
    const noDonation = estimate(data, { ...base, donation: 0 });
    const reliefAtTarget = noDonation.totalTax - atTarget.totalTax;
    const furusatoNotes = [
        "ふるさと納税で減る税額は、寄附した額から自己負担 2,000 円を引いた額までです。寄附と同じだけお金が出ていくので、手元のお金は増えません（得になるのは返礼品の分です）。",
        "確定申告をする前提の目安です（確定申告をするとワンストップ特例の申請は無効になります）。",
        "所得や控除が見込みから動くと上限も変わります。上限ぎりぎりではなく余裕を持たせてください。",
    ];
    if (limit === 0) {
        furusatoNotes.splice(0, 1, noDonation.residentTax.incomeLevyExempt
            ? "住民税の所得割（所得に応じてかかる部分）がかからない見込みのため、ふるさと納税をしても住民税は減りません。上限の目安は出していません。"
            : noDonation.residentTax.exemptionReduction > 0
                ? "合計所得金額（所得の合計）が、住民税の所得割（所得に応じてかかる部分）がかからなくなる上限を少し超える範囲にあり、所得割が減額される見込みです。寄附をしても減額分を超えるまで住民税が減らないため、自己負担 2,000 円で済む寄附額はありません。上限の目安は出していません。"
                : "住民税の所得割（所得に応じてかかる部分）が 0 円か、ごくわずかの見込みのため、ふるさと納税による税の軽減はありません。");
    }
    if (paid > limit && limit > 0) {
        furusatoNotes.unshift("寄附済みの額が上限の目安を超えています。超えた分は自己負担が増えます。");
    }
    if (limitAfterOtherMeasures !== limit || ideco.additional + kyosai.additional > 0) {
        furusatoNotes.push("iDeCo や小規模企業共済の掛金を増やすと、住民税が減るため上限の目安も下がります。");
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
    // --- 青色申告特別控除 ---
    let blueReturn;
    if (!hasBusiness || !isBusinessIncome) {
        blueReturn = {
            applicable: false,
            current: normalized.blueReturn,
            options: [],
            notes: [
                hasBusiness
                    ? "雑所得（事業とは言えない副業などの所得）として入力されているため計算していません。青色申告特別控除は事業所得（または不動産所得）が対象です。"
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
            "令和9年分からは見直されます（複式簿記 + e-Tax で 65 万円、さらに一定の電子帳簿で 75 万円、複式簿記でも書面で申告すると 10 万円。簡易簿記の 10 万円は前々年の収入が 1,000 万円以下の方などに限定）。この試算は令和8年分のものです。",
        ];
        if (normalized.blueReturn === "none") {
            notes.push("青色申告には事前に「青色申告承認申請書」の提出が必要です。未提出の場合、今年分には間に合わない可能性が高いので、提出期限を税務署で確認してください（来年分の準備としては有効です）。");
        }
        blueReturn = { applicable: true, current: normalized.blueReturn, options, notes };
    }
    // --- 国民健康保険料（税）の所得割への影響（料率が入力されたときだけ） ---
    // 所得割は「総所得金額等 − 住民税の基礎控除」（基礎控除後の総所得金額等）に料率を掛ける。
    // 出典: 地方税法 第703条の4第6項（国民健康保険税）、国民健康保険法施行令 第29条の7第2項第4号（保険料）
    // 所得控除（iDeCo・小規模企業共済・社会保険料など）や税額控除（ふるさと納税）は算定基礎に影響しない。
    let nationalHealthInsurance = null;
    if (input.nhiIncomeRatePercent !== undefined) {
        const ratePer100k = Math.round(input.nhiIncomeRatePercent * 1_000);
        const levyOf = (e) => {
            const baseIncome = Math.max(0, e.totalIncome - e.residentTax.deductions.basic);
            return { baseIncome, incomeLevy: Math.floor((baseIncome * ratePer100k) / 100_000) };
        };
        const current = levyOf(baseline);
        const nhiNotes = [
            "翌年度の国民健康保険料（税）のうち、あなた自身の所得にかかる所得割だけの目安です。均等割・平等割、世帯のほかの加入者の分、賦課限度額、低所得世帯の軽減は考慮していません。",
            "すでに賦課限度額に達している場合は、所得が減っても保険料は下がりません。料率や限度額は自治体と年度によって変わるので、お住まいの市区町村の案内で確認してください。",
            "iDeCo・小規模企業共済の掛金やふるさと納税は、所得割の算定基礎（総所得金額等 − 基礎控除）を減らさないため、国民健康保険料は下がりません。",
        ];
        if (hasSalary) {
            nhiNotes.push("勤務先の健康保険に加入している場合、国民健康保険料はかかりません。国民健康保険に加入している方だけ参考にしてください。");
        }
        nationalHealthInsurance = {
            ratePercent: input.nhiIncomeRatePercent,
            ...current,
            blueReturnOptions: blueReturn.applicable
                ? BLUE_LEVELS.map((level) => {
                    const option = levyOf(estimate(data, { ...base, blueDeduction: blueAmount(level) }));
                    return {
                        level,
                        ...option,
                        reductionVsCurrent: current.incomeLevy - option.incomeLevy,
                        current: level === normalized.blueReturn,
                    };
                })
                : [],
            notes: nhiNotes,
        };
    }
    // --- 注意 ---
    const warnings = [];
    if (baseline.totalIncome === 0) {
        warnings.push("合計所得金額（所得の合計）が 0 円の見込みです。入力値（収入・経費）を確認してください。");
    }
    else if (baseline.incomeTax.taxableIncome === 0) {
        warnings.push("所得税がかかる所得（課税所得。所得から控除を引いた残り）が 0 円の見込みです。控除を増やしても所得税はこれ以上減りません。");
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
    if (normalized.salaryRevenue > data.salary.incomeAdjustment.revenueAbove && !normalized.incomeAdjustment) {
        // 適用していないときだけ案内する（16〜18 歳の子と特別障害者は入力から判別できないため）
        warnings.push("給与収入が 850 万円を超えています。23 歳未満の扶養親族（16 歳未満の子を含む）か特別障害者がいる場合は、" +
            "所得金額調整控除の対象です。今回は計算に含めていません。該当する場合は指定してください" +
            "（CLI は --income-adjustment、JSON は incomeAdjustment、ブラウザ版は「家族」のチェック欄）。");
    }
    if (normalized.blueReturn !== "none" && baseline.blueDeductionApplied < blueAmount(normalized.blueReturn)) {
        warnings.push("事業所得が青色申告特別控除の枠より小さいため、控除は事業所得の金額までにしています。");
    }
    // 住民税の非課税
    const rt = baseline.residentTax;
    const exemptLimitText = `${yen(rt.incomeLevyExemptLimit)}。入力された配偶者・扶養親族の人数で計算`;
    if (baseline.totalIncome > 0 && rt.incomeLevyExempt) {
        warnings.push(`合計所得金額（所得の合計）が、住民税の所得割（所得に応じてかかる部分）がかからなくなる上限（非課税限度額。${exemptLimitText}）以下のため、所得割は 0 円としています。`);
    }
    else if (rt.exemptionReduction > 0) {
        warnings.push(`合計所得金額（所得の合計）が、住民税の所得割（所得に応じてかかる部分）がかからなくなる上限（非課税限度額。${exemptLimitText}）を少し超えるため、所得割を ${yen(rt.exemptionReduction)}減額しています（税引後の所得が限度額を下回らないようにする調整）。`);
    }
    if (baseline.totalIncome > 0) {
        const perCapitaMax = perCapitaExemptLimitMax(data, base);
        if (baseline.totalIncome <= perCapitaMax) {
            warnings.push(`お住まいの市区町村によっては、住民税の均等割（所得にかかわらず定額でかかる部分）もかからない可能性があります（基準は地域で異なり、最も高い地域で合計所得金額 ${yen(perCapitaMax)}以下）。` +
                `この試算では判定せず、均等割と森林環境税の ${yen(rt.perCapita)}を含めたままにしています。市区町村の案内で確認してください。`);
        }
        if (baseline.totalIncome <= data.residentTax.specialExemptIncomeLimit) {
            warnings.push(`障害者・未成年者・寡婦・ひとり親に当たる方は、合計所得金額が ${yen(data.residentTax.specialExemptIncomeLimit)}以下なら住民税がかかりません。この試算では判定していません。`);
        }
        // 16 歳未満の子が 3 人増えたら所得割が非課税になる範囲なら、入力を促す
        const d = normalized.dependents;
        if (!rt.incomeLevyExempt &&
            d.under16 === 0 &&
            baseline.totalIncome <=
                estimate(data, { ...base, dependents: { ...d, under16: 3 } }).residentTax.incomeLevyExemptLimit) {
            warnings.push("16 歳未満の扶養親族（お子さんなど）がいる場合は、人数を入力してください（CLI は --dependents-under16、JSON は dependents.under16、ブラウザ版は「家族」の欄）。" +
                "扶養控除はありませんが、住民税の所得割がかからなくなる所得の上限が変わります。");
        }
    }
    return {
        year,
        label: data.label,
        residentTaxLabel: data.residentTaxLabel,
        input: normalized,
        baseline,
        measures: { furusato, ideco, kyosai, blueReturn, combined, combinedWithIdeco, nationalHealthInsurance },
        warnings,
        disclaimer: DISCLAIMER,
    };
}
const yenText = (n) => `${n.toLocaleString("ja-JP")} 円`;
/** 10 万分率を「84.895%」の形にする */
const rateText = (per100k) => `${per100k / 1_000}%`;
/**
 * ふるさと納税の上限の目安を、令和 8 年分と令和 7 年分で比べる。
 *
 * 令和 7 年分は、上限の計算に関わる項目のうち当時と違うもの（所得税の基礎控除、給与所得控除）だけを
 * 当時の額に差し替えたデータ（src/data/2025-furusato.ts）で、同じ入力を計算する。
 * 配偶者・扶養親族の所得要件は差し替えていないので、配偶者に所得がある入力は受け付けない。
 */
export function compareFurusatoLimit(rawInput) {
    const { year, data, base } = prepare(rawInput);
    if (year !== furusatoComparison2025.year + 1) {
        throw new InputError([`year: 令和7年分との比較は ${furusatoComparison2025.year + 1} 年分だけに対応しています`]);
    }
    if (base.spouse && base.spouse.income > 0) {
        throw new InputError([
            "spouse.income: 令和7年分との比較は、配偶者の所得が 0 の場合だけに対応しています（配偶者の所得要件が年分で違うため）",
        ]);
    }
    const side = (d) => ({
        label: d.label,
        residentTaxLabel: d.residentTaxLabel,
        ...furusatoLimitDetail(d, base),
    });
    const current = side(data);
    const previous = side(furusatoComparison2025);
    const difference = current.limit - previous.limit;
    const reasons = [];
    const notes = [];
    if (current.exempt || previous.exempt) {
        for (const s of [previous, current]) {
            if (s.exempt)
                notes.push(`${s.label}は、住民税の所得割が非課税か減額される見込みのため、上限の目安を出していません。`);
        }
    }
    if (difference === 0) {
        if (!current.exempt && current.limit > 0) {
            notes.push("この入力では、上限の目安は令和7年分と同じです。住民税の所得割額も、特例分の割合の区分も変わらないためです。");
        }
    }
    else if (!current.exempt && !previous.exempt) {
        if (current.specialRatePer100k !== previous.specialRatePer100k) {
            reasons.push("specialRate");
            notes.push(`特例分の割合が ${rateText(previous.specialRatePer100k)} → ${rateText(current.specialRatePer100k)} に変わりました。` +
                `所得税の基礎控除が ${yenText(previous.incomeTaxBasicDeduction)} → ${yenText(current.incomeTaxBasicDeduction)}になり、` +
                `割合を決める金額（住民税の課税総所得金額 − 人的控除差調整額）が ${yenText(previous.rateBase)} → ${yenText(current.rateBase)}になって、` +
                "当てはまる所得税率の区分が変わったためです。割合が上がると、特例分の上限（所得割額の 20%）に少ない寄附額で達するので、上限の目安は下がります。");
        }
        if (current.incomeLevy !== previous.incomeLevy) {
            reasons.push("incomeLevy");
            notes.push(`住民税の所得割額が ${yenText(previous.incomeLevy)} → ${yenText(current.incomeLevy)}に変わりました。` +
                `給与所得控除の最低額が 65 万円 → 74 万円に上がり、給与所得が ${yenText(previous.salaryIncome)} → ${yenText(current.salaryIncome)}になったためです。`);
        }
    }
    if (difference < 0 && reasons.includes("specialRate")) {
        notes.push("上限の目安が下がるのは、所得税が減って、寄附 1 円あたりの所得税の軽減が小さくなった分を、住民税の特例分が埋めるようになったためです。寄附できる額の目安は下がりますが、所得税そのものが減っています。");
    }
    notes.push("令和7年分は、所得税の基礎控除と給与所得控除を当時の額にして、同じ入力（収入・経費・社会保険料・家族）で計算した値です。収入や控除が変われば、どちらの年分の上限も変わります。");
    return { current, previous, difference, reasons, notes };
}
