export function floorTo(amount, unit) {
    return Math.floor(amount / unit) * unit;
}
/** 「upTo 以下なら value」の表を引く。どの行にも当たらなければ fallback。 */
export function lookupTier(tiers, amount, fallback) {
    for (const tier of tiers) {
        if (tier.upTo === null || amount <= tier.upTo)
            return tier.value;
    }
    return fallback;
}
/** 給与収入から給与所得を求める（国税庁 No.1410 の計算手順）。 */
export function salaryIncome(data, revenue) {
    const rule = data.salary;
    if (revenue <= rule.zeroUpTo)
        return 0;
    if (revenue < rule.flatBelow)
        return revenue - rule.flatDeduction;
    for (const step of rule.fixedSteps) {
        if (revenue < step.below)
            return step.income;
    }
    for (const band of rule.bands) {
        if (revenue < band.below) {
            const base = floorTo(revenue, band.roundUnit);
            return Math.floor((base * band.ratePercent) / 100) - band.minus;
        }
    }
    return revenue - rule.maxDeduction;
}
/**
 * 所得金額調整控除（子ども・特別障害者等を有する者等）の額。
 * {給与収入（上限あり）− 850 万円} × 10%。1 円未満は切り上げる（国税庁 No.1411）。
 * 対象者かどうかは呼び出し側で判定する。
 */
export function incomeAdjustment(data, revenue) {
    const rule = data.salary.incomeAdjustment;
    if (revenue <= rule.revenueAbove)
        return 0;
    return Math.ceil(((Math.min(revenue, rule.revenueCap) - rule.revenueAbove) * rule.ratePercent) / 100);
}
/**
 * 課税される所得金額から所得税・復興特別所得税を求める。
 * 課税所得は 1,000 円未満を切り捨ててから速算表を当てる。
 */
export function incomeTaxOnTaxableIncome(data, taxableIncome) {
    const taxable = floorTo(Math.max(0, taxableIncome), 1_000);
    if (taxable === 0) {
        return { taxableIncome: 0, marginalRatePercent: 0, baseTax: 0, reconstructionTax: 0, total: 0 };
    }
    const brackets = data.incomeTax.brackets;
    const bracket = brackets.find((b) => b.upTo === null || taxable <= b.upTo) ?? brackets[brackets.length - 1];
    if (!bracket)
        throw new Error("所得税の速算表が空です");
    // taxable は 1,000 円単位なので ratePercent / 100 を掛けても整数になる
    const baseTax = (taxable * bracket.ratePercent) / 100 - bracket.deduction;
    const reconstructionTax = Math.floor((baseTax * data.incomeTax.reconstructionPermille) / 1_000);
    return {
        taxableIncome: taxable,
        marginalRatePercent: bracket.ratePercent,
        baseTax,
        reconstructionTax,
        total: floorTo(baseTax + reconstructionTax, 100),
    };
}
/** 納税者本人の合計所得金額が配偶者（特別）控除のどの区分か。対象外なら null。 */
function taxpayerTier(data, totalIncome) {
    const [a, b, c] = data.family.taxpayerTiers;
    if (totalIncome <= a)
        return 0;
    if (totalIncome <= b)
        return 1;
    if (totalIncome <= c)
        return 2;
    return null;
}
function spouseAmounts(data, totalIncome, spouse) {
    const none = { incomeTax: 0, residentTax: 0, difference: 0 };
    if (!spouse)
        return none;
    const tier = taxpayerTier(data, totalIncome);
    if (tier === null)
        return none;
    if (spouse.income <= data.family.spouseDeductionIncomeLimit) {
        const kind = spouse.age70OrOlder ? "elderly" : "general";
        return {
            incomeTax: data.incomeTax.spouseDeduction[kind][tier],
            residentTax: data.residentTax.spouseDeduction[kind][tier],
            difference: data.residentTax.adjustmentCredit.spouseDifference[kind][tier],
        };
    }
    if (spouse.income > data.family.spouseSpecialIncomeLimit)
        return none;
    // 配偶者特別控除
    const incomeTax = lookupTier(data.incomeTax.spouseSpecialDeduction, spouse.income, [0, 0, 0])[tier];
    const rule = data.residentTax.spouseSpecialDeduction;
    let full;
    if (spouse.income <= rule.fullUpTo) {
        full = rule.full;
    }
    else if (spouse.income <= rule.reducedUpTo) {
        const excess = spouse.income - rule.threshold;
        const steps = Math.floor((excess + rule.stepOffset) / rule.stepUnit);
        full = rule.base - (steps * rule.stepUnit - rule.stepOffset);
    }
    else {
        full = rule.minimum;
    }
    // 900 万超は 2/3、950 万超は 1/3（1 万円未満切上げ）
    const residentTax = tier === 0 ? full : Math.ceil((full * (3 - tier)) / 3 / 10_000) * 10_000;
    // 地方税法 第314条の6 の表(7)は配偶者の合計所得金額 55 万円未満が対象。
    // 配偶者特別控除の対象は 62 万円超なので、人的控除額の差は生じない。
    return { incomeTax, residentTax, difference: 0 };
}
function dependentTotal(amounts, dependents) {
    return (amounts.general * dependents.general +
        amounts.specific * dependents.specific +
        amounts.elderly * dependents.elderly +
        amounts.elderlyCohabiting * dependents.elderlyCohabiting);
}
/**
 * 住民税の所得割の非課税限度額（地方税法 附則第3条の3）。
 * 35 万円 ×（同一生計配偶者 + 扶養親族の数 + 1）+ 10 万円（家族がいれば + 32 万円）。
 * 扶養親族には 16 歳未満の者を含む。同一生計配偶者は合計所得金額が配偶者控除の所得要件以下の配偶者。
 */
export function incomeLevyExemptLimit(data, s) {
    return exemptionLimit(data, data.residentTax.incomeLevyExemption, s);
}
/**
 * 均等割の非課税限度額のうち最も高い 1 級地の基準（地方税法施行令 第47条の3）。
 * 実際の額は市区町村の条例で決まるので、注意を出す判断にだけ使う。
 */
export function perCapitaExemptLimitMax(data, s) {
    return exemptionLimit(data, data.residentTax.perCapitaExemptionMax, s);
}
function exemptionLimit(data, rule, s) {
    const spouse = s.spouse && s.spouse.income <= data.family.spouseDeductionIncomeLimit ? 1 : 0;
    const d = s.dependents;
    const family = spouse + d.general + d.specific + d.elderly + d.elderlyCohabiting + d.under16;
    return rule.perPerson * (family + 1) + rule.addition + (family > 0 ? rule.familyAddition : 0);
}
function sumDeductions(parts) {
    const total = parts.basic +
        parts.spouse +
        parts.dependents +
        parts.socialInsurance +
        parts.smallBusinessMutualAid +
        parts.donation +
        parts.other;
    return { ...parts, total };
}
/**
 * ふるさと納税の特例分の割合（10 万分率）。
 * 100% − 基本分 10% − 所得税率 ×（1 + 復興特別所得税率）
 */
function specialCreditRatePer100k(data, residentTaxable, adjustmentAmount) {
    const rule = data.residentTax.donation;
    const base = residentTaxable - adjustmentAmount;
    if (base < 0)
        return rule.specialRateWhenNegativePercent * 1_000;
    const incomeTaxRate = lookupTier(rule.specialRateBrackets, base, 0);
    return (100 - rule.basicRatePercent) * 1_000 - incomeTaxRate * (1_000 + data.incomeTax.reconstructionPermille);
}
/** シナリオ 1 つ分の所得税・住民税を概算する。 */
export function estimate(data, s) {
    // --- 所得 ---
    const adjustment = s.incomeAdjustmentEligible ? incomeAdjustment(data, s.salaryRevenue) : 0;
    const salary = salaryIncome(data, s.salaryRevenue) - adjustment;
    const businessNet = s.businessRevenue - s.businessExpenses;
    let blueDeductionApplied = 0;
    let businessIncome;
    if (s.businessIncomeType === "business") {
        // 青色申告特別控除は事業所得の黒字が限度
        blueDeductionApplied = Math.min(s.blueDeduction, Math.max(0, businessNet));
        businessIncome = businessNet - blueDeductionApplied;
    }
    else {
        // 雑所得の赤字は他の所得と損益通算できない
        businessIncome = Math.max(0, businessNet);
    }
    const totalIncome = Math.max(0, salary + businessIncome);
    const spouse = spouseAmounts(data, totalIncome, s.spouse);
    // --- 所得税 ---
    const itRule = data.incomeTax;
    const donationCap = Math.floor((totalIncome * itRule.donation.incomeCapPercent) / 100);
    const itDonation = Math.max(0, Math.min(s.donation, donationCap) - itRule.donation.floor);
    const itBasic = lookupTier(itRule.basicDeduction, totalIncome, 0);
    const itDeductions = sumDeductions({
        basic: itBasic,
        spouse: spouse.incomeTax,
        dependents: dependentTotal(itRule.dependents, s.dependents),
        socialInsurance: s.socialInsurance,
        smallBusinessMutualAid: s.mutualAid,
        donation: itDonation,
        other: s.otherDeductions,
    });
    const incomeTax = {
        deductions: itDeductions,
        ...incomeTaxOnTaxableIncome(data, totalIncome - itDeductions.total),
    };
    // --- 住民税 ---
    const rtRule = data.residentTax;
    const rtDeductions = sumDeductions({
        basic: lookupTier(rtRule.basicDeduction, totalIncome, 0),
        spouse: spouse.residentTax,
        dependents: dependentTotal(rtRule.dependents, s.dependents),
        socialInsurance: s.socialInsurance,
        smallBusinessMutualAid: s.mutualAid,
        donation: 0,
        other: s.otherDeductionsResident,
    });
    const rtTaxable = floorTo(Math.max(0, totalIncome - rtDeductions.total), 1_000);
    const levyBeforeCredits = (rtTaxable * rtRule.ratePercent) / 100;
    // 調整控除（地方税法 第314条の6）
    const adj = rtRule.adjustmentCredit;
    const humanDifference = adj.basicDifference + spouse.difference + dependentTotal(adj.dependentDifference, s.dependents);
    let adjustmentCredit = 0;
    if (totalIncome <= adj.taxpayerIncomeLimit) {
        const base = rtTaxable <= adj.threshold
            ? Math.min(humanDifference, rtTaxable)
            : Math.max(humanDifference - (rtTaxable - adj.threshold), adj.minimumBase);
        adjustmentCredit = Math.floor((base * adj.ratePercent) / 100);
    }
    // 所得割の非課税限度額（地方税法 附則第3条の3）。総所得金額等が限度額以下なら所得割を課さない。
    const exemptLimit = incomeLevyExemptLimit(data, s);
    const incomeLevyExempt = totalIncome <= exemptLimit;
    const incomeLevyBeforeDonation = incomeLevyExempt ? 0 : Math.max(0, levyBeforeCredits - adjustmentCredit);
    // 寄附金税額控除（地方税法 第314条の7）
    const don = rtRule.donation;
    const basicTarget = Math.max(0, Math.min(s.donation, Math.floor((totalIncome * don.incomeCapPercent) / 100)) - don.floor);
    const specialTarget = Math.max(0, s.donation - don.floor);
    const adjustmentAmount = humanDifference + Math.max(0, itBasic - don.basicDeductionReference);
    const ratePer100k = specialCreditRatePer100k(data, rtTaxable, adjustmentAmount);
    let donationCreditBasic = Math.floor((basicTarget * don.basicRatePercent) / 100);
    let donationCreditSpecial = Math.min(Math.floor((specialTarget * ratePer100k) / 100_000), Math.floor((incomeLevyBeforeDonation * don.specialCapPercent) / 100));
    // 控除額の合計は所得割額が限度
    if (donationCreditBasic + donationCreditSpecial > incomeLevyBeforeDonation) {
        donationCreditBasic = Math.min(donationCreditBasic, incomeLevyBeforeDonation);
        donationCreditSpecial = incomeLevyBeforeDonation - donationCreditBasic;
    }
    // 限度額を少し超える場合は、「総所得金額等 − 所得割額」が限度額を下回らないように所得割を減額する
    // （同条第2項・第5項。道府県民税と市町村民税に按分する前の合計額で計算している）。
    // 判定に使う所得割額は寄附金税額控除後の額なので、減額後の所得割は
    // 「控除後の所得割額」と「総所得金額等 − 限度額」の小さいほうになる。
    const levyAfterDonation = incomeLevyBeforeDonation - donationCreditBasic - donationCreditSpecial;
    const exemptionReduction = incomeLevyExempt ? 0 : Math.max(0, levyAfterDonation - (totalIncome - exemptLimit));
    const incomeLevy = floorTo(levyAfterDonation - exemptionReduction, 100);
    const perCapita = rtRule.perCapita + rtRule.forestTax;
    const residentTax = {
        deductions: rtDeductions,
        taxableIncome: rtTaxable,
        adjustmentCredit,
        incomeLevyBeforeDonation,
        incomeLevyExemptLimit: exemptLimit,
        incomeLevyExempt,
        exemptionReduction,
        donationCreditBasic,
        donationCreditSpecial,
        incomeLevy,
        perCapita,
        total: incomeLevy + perCapita,
    };
    return {
        salaryIncome: salary,
        incomeAdjustment: adjustment,
        businessIncome,
        blueDeductionApplied,
        totalIncome,
        incomeTax,
        residentTax,
        totalTax: incomeTax.total + residentTax.total,
    };
}
/**
 * ふるさと納税で特例分が頭打ちにならない寄附額の上限（自己負担が概ね 2,000 円で済む目安）。
 * 上限 = 所得割額 × 20% ÷ 特例分の割合 + 2,000 円（目安なので 1,000 円未満は切り捨てる）
 *
 * 所得割が非課税か、非課税限度額による減額を受ける場合は 0（寄附をしても、減額分を超えるまで
 * 住民税が減らないので、自己負担が 2,000 円で済む寄附額がない）。
 */
export function furusatoLimit(data, s) {
    return furusatoLimitDetail(data, s).limit;
}
/** ふるさと納税の上限の目安を、計算の途中の値つきで返す。 */
export function furusatoLimitDetail(data, s) {
    const e = estimate(data, { ...s, donation: 0 });
    const levy = e.residentTax.incomeLevyBeforeDonation;
    const exempt = e.residentTax.incomeLevyExempt || e.residentTax.exemptionReduction > 0;
    const don = data.residentTax.donation;
    const adj = data.residentTax.adjustmentCredit;
    const spouse = spouseAmounts(data, e.totalIncome, s.spouse);
    const humanDifference = adj.basicDifference + spouse.difference + dependentTotal(adj.dependentDifference, s.dependents);
    const adjustmentAmount = humanDifference + Math.max(0, e.incomeTax.deductions.basic - don.basicDeductionReference);
    const ratePer100k = specialCreditRatePer100k(data, e.residentTax.taxableIncome, adjustmentAmount);
    const specialCap = Math.floor((Math.max(0, levy) * don.specialCapPercent) / 100);
    const raw = floorTo(Math.floor((specialCap * 100_000) / ratePer100k) + don.floor, 1_000);
    return {
        // 自己負担の 2,000 円以下の寄附では税は減らない
        limit: levy <= 0 || exempt || raw <= don.floor ? 0 : raw,
        salaryIncome: e.salaryIncome,
        incomeTaxBasicDeduction: e.incomeTax.deductions.basic,
        residentTaxableIncome: e.residentTax.taxableIncome,
        incomeLevy: Math.max(0, levy),
        specialCap,
        adjustmentAmount,
        rateBase: e.residentTax.taxableIncome - adjustmentAmount,
        specialRatePer100k: ratePer100k,
        exempt,
    };
}
