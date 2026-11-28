const yen = (n) => `${n.toLocaleString("ja-JP")} 円`;
/** 端末上の表示幅（全角 = 2）。 */
function width(text) {
    let w = 0;
    for (const ch of text) {
        const code = ch.codePointAt(0) ?? 0;
        const wide = (code >= 0x1100 && code <= 0x115f) ||
            (code >= 0x2e80 && code <= 0xa4cf) ||
            (code >= 0xac00 && code <= 0xd7a3) ||
            (code >= 0xf900 && code <= 0xfaff) ||
            (code >= 0xfe30 && code <= 0xfe4f) ||
            (code >= 0xff00 && code <= 0xff60) ||
            (code >= 0xffe0 && code <= 0xffe6);
        w += wide ? 2 : 1;
    }
    return w;
}
const padEnd = (text, w) => text + " ".repeat(Math.max(0, w - width(text)));
const padStart = (text, w) => " ".repeat(Math.max(0, w - width(text))) + text;
/** 1 列目は左寄せ、2 列目以降は右寄せの表。 */
function table(rows, indent = "  ") {
    const columns = Math.max(...rows.map((r) => r.length));
    const widths = Array.from({ length: columns }, (_, i) => Math.max(...rows.map((r) => width(r[i] ?? ""))));
    return rows.map((row) => (indent +
        row.map((cell, i) => (i === 0 ? padEnd(cell, widths[i] ?? 0) : padStart(cell, widths[i] ?? 0))).join("  ")).trimEnd());
}
function savingCells(s) {
    return [yen(s.total), yen(s.incomeTax), yen(s.residentTax)];
}
function bullet(notes) {
    return notes.map((n) => `    ・${n}`);
}
/** まとめて実行した場合に含まれる策の名前（「ふるさと納税 + 小規模企業共済」）。 */
export function combinedParts(c) {
    return [
        ...(c.furusatoAdditional > 0 ? ["ふるさと納税"] : []),
        ...(c.kyosaiAdditional > 0 ? ["小規模企業共済"] : []),
        ...(c.idecoAdditional > 0 ? ["iDeCo"] : []),
    ];
}
function combinedSection(title, c) {
    const out = [`  ◆ ${title}（${combinedParts(c).join(" + ")}）`];
    const parts = [];
    if (c.furusatoAdditional > 0)
        parts.push(["ふるさと納税の追加", yen(c.furusatoAdditional)]);
    if (c.kyosaiAdditional > 0)
        parts.push(["小規模企業共済の追加", yen(c.kyosaiAdditional)]);
    if (c.idecoAdditional > 0)
        parts.push(["iDeCo の追加", yen(c.idecoAdditional)]);
    parts.push(["追加で支払う額の合計", yen(c.totalPayment)]);
    parts.push(["減る税額の合計", yen(c.saving.total)]);
    if (c.furusatoAdditional > 0) {
        parts.push(["　うち掛金の追加による分", yen(c.savingFromContributions.total)]);
        parts.push(["　うちふるさと納税による分", yen(c.savingFromFurusato.total)]);
    }
    parts.push(["　（所得税）", yen(c.saving.incomeTax)]);
    parts.push(["　（住民税）", yen(c.saving.residentTax)]);
    parts.push(["税額の合計（実行後）", yen(c.totalTax)]);
    out.push(...table(parts, "    "));
    out.push(...bullet(c.notes));
    out.push("");
    return out;
}
const BLUE_LABEL = { none: "白色申告（控除なし）", "10": "青色 10万円", "55": "青色 55万円", "65": "青色 65万円" };
/** 人が読むための出力を組み立てる。 */
export function formatResult(r, version, options = {}) {
    const b = r.baseline;
    const m = r.measures;
    const out = [];
    out.push(`setsuzei ${version} ｜ ${r.label}（${r.year}年分）の概算`);
    out.push("");
    out.push("■ 現状の見込み");
    const income = [];
    if (r.input.salaryRevenue > 0) {
        const adjusted = b.incomeAdjustment > 0 ? `（所得金額調整控除 ${yen(b.incomeAdjustment)}を控除後）` : "";
        income.push([`給与所得${adjusted}`, yen(b.salaryIncome)]);
    }
    if (r.input.businessRevenue > 0 || r.input.businessExpenses > 0) {
        const kind = r.input.businessIncomeType === "business" ? "事業所得" : "雑所得";
        const blue = b.blueDeductionApplied > 0 ? `（青色申告特別控除 ${yen(b.blueDeductionApplied)}を控除後）` : "";
        income.push([`${kind}${blue}`, yen(b.businessIncome)]);
    }
    income.push(["合計所得金額", yen(b.totalIncome)]);
    income.push([`所得税の課税所得（税率 ${b.incomeTax.marginalRatePercent}%）`, yen(b.incomeTax.taxableIncome)]);
    income.push(["所得税 + 復興特別所得税", yen(b.incomeTax.total)]);
    income.push([`住民税（${r.residentTaxLabel}・均等割と森林環境税を含む）`, yen(b.residentTax.total)]);
    income.push(["税額の合計", yen(b.totalTax)]);
    out.push(...table(income));
    out.push("");
    out.push("■ 年末までにできることと、支払う額・減る税額の目安");
    const rows = [["", "追加で支払う額", "減る税額", "うち所得税", "うち住民税"]];
    const f = m.furusato;
    const idecoIncluded = m.combined.includesIdeco;
    if (f.remaining > 0 && f.saving.total > 0)
        rows.push(["ふるさと納税", yen(f.remaining), ...savingCells(f.saving)]);
    if (m.kyosai.applicable && m.kyosai.additional > 0) {
        rows.push(["小規模企業共済", yen(m.kyosai.additional), ...savingCells(m.kyosai.saving)]);
    }
    if (m.ideco.applicable && m.ideco.additional > 0) {
        rows.push([
            idecoIncluded ? "iDeCo" : "iDeCo（年内に増やせる場合）",
            yen(m.ideco.additional),
            ...savingCells(m.ideco.saving),
        ]);
    }
    if (rows.length > 1) {
        out.push(...table(rows));
        out.push("  ※ それぞれ単独で実行した場合です。減る税額は、追加で支払う額と引き換えです。");
        if (f.remaining > 0 && f.saving.total > 0) {
            out.push("  ※ ふるさと納税は、寄附した額とほぼ同じだけ税が減る仕組みです。手元のお金は増えません（得になるのは返礼品の分）。");
        }
        if (m.ideco.applicable && m.ideco.additional > 0) {
            out.push(idecoIncluded
                ? "  ※ iDeCo は原則 60 歳まで引き出せません。年内に増やせるかどうかは加入先に確認してください。"
                : "  ※ iDeCo は原則 60 歳まで引き出せません。掛金額の変更は年 1 回で、年内に増やせるかどうかは加入先と時期しだいです。");
        }
    }
    else {
        out.push("  いまの見込みでは、年内に追加して税額が減る策はありません（下の各項目に理由があります）。");
    }
    out.push("");
    const c = m.combined;
    // 上の表に、まとめの対象になる行が 2 つ以上あるときは、足し算されないようにまとめを必ず出す
    const planRows = rows.length - 1 - (m.ideco.applicable && m.ideco.additional > 0 && !idecoIncluded ? 1 : 0);
    const showCombined = c.totalPayment > 0 && (combinedParts(c).length >= 2 || planRows >= 2);
    if (showCombined)
        out.push(...combinedSection("まとめて実行した場合", c));
    const withIdeco = m.combinedWithIdeco;
    if (withIdeco && (combinedParts(withIdeco).length >= 2 || planRows >= 1)) {
        out.push(...combinedSection("iDeCo の追加も年内に間に合う場合", withIdeco));
    }
    else if (!showCombined && !idecoIncluded && m.ideco.additional > 0 && c.totalPayment > 0) {
        // まとめの欄を出さないときも、iDeCo を合計に含めていない理由は伝える
        out.push(...bullet(c.notes.filter((n) => n.startsWith("iDeCo の追加は"))).map((line) => line.slice(2)));
        out.push("");
    }
    out.push("  ◆ ふるさと納税");
    if (f.limit > 0) {
        out.push(...table([
            ["控除上限額の目安（年間）", yen(f.limit)],
            ["寄附済み", yen(f.paid)],
            ["上限までの残り", yen(f.remaining)],
            ["上限まで寄附した場合に減る税額（残りの分）", yen(f.saving.total)],
            ["上限まで寄附した場合の自己負担", yen(f.outOfPocket)],
            ...(f.limitAfterOtherMeasures !== f.limit
                ? [["掛金を追加した場合の上限（まとめて実行した場合）", yen(f.limitAfterOtherMeasures)]]
                : []),
        ], "    "));
    }
    out.push(...bullet(f.notes));
    out.push("");
    for (const [name, k] of [
        ["iDeCo（個人型確定拠出年金）", m.ideco],
        ["小規模企業共済", m.kyosai],
    ]) {
        out.push(`  ◆ ${name}`);
        if (k.applicable) {
            out.push(...table([
                ["年間上限", yen(k.annualLimit)],
                ["支払済み", yen(k.paid)],
                ["残り枠", yen(k.remaining)],
                ["試算した追加額（追加で支払う額）", yen(k.additional)],
                ["その場合に減る税額", yen(k.saving.total)],
            ], "    "));
        }
        out.push(...bullet(k.notes));
        out.push("");
    }
    out.push("  ◆ 青色申告特別控除");
    if (m.blueReturn.applicable) {
        const blueRows = [["", "税額の合計", "現在との差"]];
        for (const o of m.blueReturn.options) {
            const diff = o.savingVsCurrent.total;
            const diffText = o.current ? "（現在）" : diff >= 0 ? `${yen(diff)} 減` : `${yen(-diff)} 増`;
            blueRows.push([BLUE_LABEL[o.level], yen(o.totalTax), diffText]);
        }
        out.push(...table(blueRows, "    "));
    }
    out.push(...bullet(m.blueReturn.notes));
    out.push("");
    const nhi = m.nationalHealthInsurance;
    if (nhi) {
        out.push(`  ◆ 国民健康保険料（所得割 ${nhi.ratePercent}% として・翌年度の目安）`);
        out.push(...table([
            ["所得割の算定基礎（総所得金額等 − 基礎控除）", yen(nhi.baseIncome)],
            ["所得割額の目安", yen(nhi.incomeLevy)],
        ], "    "));
        if (nhi.blueReturnOptions.length > 0) {
            const nhiRows = [["", "所得割額の目安", "現在との差"]];
            for (const o of nhi.blueReturnOptions) {
                const diff = o.reductionVsCurrent;
                const diffText = o.current ? "（現在）" : diff >= 0 ? `${yen(diff)} 減` : `${yen(-diff)} 増`;
                nhiRows.push([BLUE_LABEL[o.level], yen(o.incomeLevy), diffText]);
            }
            out.push(...table(nhiRows, "    "));
        }
        out.push(...bullet(nhi.notes));
        out.push("");
    }
    const med = r.deductionDetails.medical;
    if (med.applicable) {
        out.push("  ◆ 医療費控除（通常）とセルフメディケーション税制");
        const medRows = [["", "控除額", "税額の合計"]];
        if (med.normal.netExpenses > 0) {
            medRows.push([`通常の医療費控除${med.method === "normal" ? "（こちらで計算）" : ""}`, yen(med.normal.deduction), yen(med.normal.totalTax)]);
        }
        if (med.selfMedication.expenses > 0) {
            medRows.push([
                `セルフメディケーション税制${med.method === "selfMedication" ? "（こちらで計算）" : ""}`,
                yen(med.selfMedication.deduction),
                yen(med.selfMedication.totalTax),
            ]);
        }
        out.push(...table(medRows, "    "));
        out.push(...table([["医療費控除で減る税額", yen(med.saving.total)]], "    "));
        out.push(...bullet(med.notes));
        out.push("");
    }
    const life = r.deductionDetails.lifeInsurance;
    if (life.applicable) {
        out.push("  ◆ 生命保険料控除");
        out.push(...table([
            ["", "所得税", "住民税"],
            ["一般の生命保険料", yen(life.incomeTax.life), yen(life.residentTax.life)],
            ["介護医療保険料", yen(life.incomeTax.medicalCare), yen(life.residentTax.medicalCare)],
            ["個人年金保険料", yen(life.incomeTax.pension), yen(life.residentTax.pension)],
            ["控除額の合計", yen(life.incomeTax.total), yen(life.residentTax.total)],
            ["生命保険料控除で減る税額", yen(life.saving.total), ""],
        ], "    "));
        out.push(...bullet(life.notes));
        out.push("");
    }
    if (options.filing) {
        const g = r.filing;
        out.push(`■ 確定申告書のどの欄に書くか（${g.form}）`);
        const sheetName = { first: "第一表", second: "第二表", resident: "第二表 住民税・事業税に関する事項", blue: "青色申告決算書" };
        for (const sheet of ["first", "second", "resident", "blue"]) {
            const entries = g.entries.filter((e) => e.sheet === sheet);
            if (entries.length === 0)
                continue;
            out.push(`  ◆ ${sheetName[sheet]}`);
            out.push(...table(entries.map((e) => [`${e.field ? `${e.field} ` : ""}${e.label}`, e.amount === null ? (e.field === "㊾" ? "（計算していません）" : "（金額ではない）") : yen(e.amount)]), "    "));
        }
        out.push(...g.notes.map((n) => `  ※ ${n}`));
        out.push("");
    }
    if (r.warnings.length > 0) {
        out.push("■ 注意");
        out.push(...r.warnings.map((w) => `  ・${w}`));
        out.push("");
    }
    out.push("■ ことばの説明");
    out.push(...GLOSSARY.map(([term, text]) => `  ・${term}: ${text}`));
    out.push("");
    out.push("■ 免責");
    out.push(`  ${r.disclaimer}`);
    out.push("  計算していないもの: 国民健康保険料の全体額、個人事業税、消費税、住民税の均等割の非課税判定、分離課税の所得、住宅ローン控除など。");
    out.push("  根拠にした一次情報の一覧は `setsuzei --sources` で表示できます。");
    if (!options.filing)
        out.push("  確定申告書のどの欄に書くかは `--filing` を付けると表示します。");
    return out.join("\n");
}
/** 結果に出てくることばの短い説明（CLI とブラウザ版の両方で出す） */
export const GLOSSARY = [
    ["所得", "収入から、経費（給与の場合は給与所得控除）を引いた額。合計所得金額は、その合計"],
    ["控除", "税金を計算する前に、所得から引けるもの（社会保険料、掛金、家族の分など）"],
    ["課税所得", "所得から控除を引いた残り。この額に税率を掛けて所得税を計算する"],
    ["住民税の所得割・均等割", "住民税のうち、所得に応じてかかる部分が所得割、所得にかかわらず定額でかかる部分が均等割"],
    ["事業所得・雑所得", "開業して続けている仕事の所得が事業所得。それに当たらない副業などの所得が雑所得（青色申告特別控除は使えない）"],
];
