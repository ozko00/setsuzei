const yenJa = (n) => `${n.toLocaleString("ja-JP")} 円`;
const yenEn = (n) => `¥${n.toLocaleString("en-US")}`;
const numJa = (n) => n.toLocaleString("ja-JP");
const numEn = (n) => n.toLocaleString("en-US");
const ja = {
    yen: yenJa,
    disclaimer: "この結果は入力値と簡略化した前提にもとづく概算です。実際の税額は申告内容やお住まいの自治体によって変わります。" +
        "税理士や税務署・市区町村の判断に代わるものではありません。重要な判断の前に、必ず専門家か所轄の窓口に確認してください。",
    label: (_year, label) => label,
    residentTaxLabel: (_year, label) => label,
    // --- 掛金（iDeCo・小規模企業共済）---
    additionalOverRemaining: (additional, remaining) => `指定された追加額 ${yenJa(additional)}は残り枠を超えるため、残り枠の ${yenJa(remaining)}で計算しました。`,
    paidOverLimit: "支払済みの額が年間上限を超えています。入力値か上限額を確認してください。",
    noEffectAtAll: "いまの見込みでは、掛金を追加しても税額は減りません（所得税と住民税の所得割が、すでに 0 円かこれ以上減らない額のため）。",
    noEffectBeyond: (effective, additional, requested) => `掛金を ${yenJa(effective)}より多く追加しても、税額はそれ以上減りません（所得税と住民税の所得割が、0 円かこれ以上減らない額になるため）。` +
        `追加額は ${yenJa(effective)}で計算しました（${requested ? "指定された額" : "残り枠"}は ${yenJa(additional)}）。`,
    idecoLimitEmployee: (monthly) => `年間上限は「企業年金のない会社員」（月額 ${numJa(monthly)} 円）として計算しました。` +
        "勤務先に企業年金がある方・公務員の方は上限が異なるので、idecoAnnualLimit（--ideco-limit）で指定してください。",
    idecoLimitSelfEmployed: (monthly) => `年間上限は国民年金第1号被保険者（月額 ${numJa(monthly)} 円）として計算しました。` + "国民年金基金の掛金・付加保険料と合算した上限です。",
    idecoTiming: "年内に増やせるかどうかは、加入先（運営管理機関）と時期しだいです。掛金額の変更は 1 年（12 月分〜翌年 11 月分）に 1 回だけで、" +
        "まとめて拠出するには事前に年単位拠出（月別指定）の届出が必要です。届出は申請の翌月分（翌々月の引落し）からの反映で、過ぎた月の分をあとから納めることはできません。" +
        "今年の控除になるのは、12 月の引落し分までです。",
    idecoLockup: "原則 60 歳まで引き出せません。受け取るときは、一時金なら退職所得、年金なら公的年金等として課税の対象になります（それぞれ控除があります）。" +
        "口座管理などの手数料がかかります（金額は金融機関によって異なります）。運用の結果によっては、受け取る額が掛金の合計を下回ることがあります。",
    kyosaiBlockedSalary: "給与収入があるため計算していません。事業を兼業している給与所得者（常時雇用関係にある方）は小規模企業共済に加入できません。",
    kyosaiBlockedNoBusiness: "事業の収入がないため計算していません。",
    kyosaiBlockedMisc: "雑所得（事業とは言えない副業などの所得）として入力されているため計算していません。小規模企業共済は個人事業主などが対象です。",
    kyosaiLimit: (monthly) => `年間上限は掛金月額の上限 ${numJa(monthly)} 円 × 12 か月として計算しました。`,
    kyosaiDeductible: "年内に支払った掛金（1年以内の前納分を含む）が控除の対象です。加入資格・掛金の増額や前納の手続きと締切は中小機構の案内で確認してください。",
    kyosaiPayout: "掛金は事業をやめるときなどに共済金として受け取るもので、受け取るときに課税されます（一括は退職所得、分割は公的年金等の雑所得、65 歳未満の任意解約は一時所得）。" +
        "任意解約は、掛金納付月数が 240 か月（20 年）未満だと受取額が掛金の合計を下回り、12 か月未満だと掛け捨てになります。",
    // --- まとめて実行した場合 ---
    combinedRecomputed: "まとめて実行した場合の税額を計算し直した値です。各策の軽減額を足した額とは一致しません。",
    combinedCapped: (total) => `掛金は合わせて ${yenJa(total)}で税額がそれ以上減らなくなるため、それを超える分は含めていません。`,
    combinedFurusato: "ふるさと納税による分は、寄附した額から自己負担を引いた額が税から引かれるものです。寄附と同じだけお金が出ていくので、手元のお金は増えません（得になるのは返礼品の分です）。",
    combinedFurusatoZero: "掛金を追加すると住民税の所得割額が減り、ふるさと納税の上限の目安が 0 円になるため、ふるさと納税の追加は含めていません。",
    combinedFurusatoUpTo: (limitAfter) => `ふるさと納税は、掛金を追加した後の上限の目安（${yenJa(limitAfter)}）まで寄附する前提です。`,
    combinedPaidOver: "寄附済みの額が、掛金を追加した後の上限の目安を超えます。超えた分は自己負担が増えるので、掛金の追加額とあわせて検討してください。",
    combinedIdecoExcluded: "iDeCo の追加は、この合計に含めていません。掛金額の変更は年 1 回で反映にも時間がかかり、年内に増やせるかどうかは加入先と時期しだいのためです。" +
        "年内に追加できる額がわかっている場合は、その額を指定すると合計に含めます" +
        "（CLI は --ideco-add、JSON は idecoAdditional、ブラウザ版は「iDeCo に年内に追加できる額」）。",
    combinedWithIdeco: "iDeCo の追加（残り枠）も年内に間に合う場合の合計です。間に合うかどうかは加入先（運営管理機関）に確認してください。",
    // --- ふるさと納税 ---
    furusatoRelief: "ふるさと納税で減る税額は、寄附した額から自己負担 2,000 円を引いた額までです。寄附と同じだけお金が出ていくので、手元のお金は増えません（得になるのは返礼品の分です）。",
    furusatoFinalReturn: "確定申告をする前提の目安です（確定申告をするとワンストップ特例の申請は無効になります）。",
    furusatoMargin: "所得や控除が見込みから動くと上限も変わります。上限ぎりぎりではなく余裕を持たせてください。",
    furusatoExempt: "住民税の所得割（所得に応じてかかる部分）がかからない見込みのため、ふるさと納税をしても住民税は減りません。上限の目安は出していません。",
    furusatoReduced: "合計所得金額（所得の合計）が、住民税の所得割（所得に応じてかかる部分）がかからなくなる上限を少し超える範囲にあり、所得割が減額される見込みです。寄附をしても減額分を超えるまで住民税が減らないため、自己負担 2,000 円で済む寄附額はありません。上限の目安は出していません。",
    furusatoTiny: "住民税の所得割（所得に応じてかかる部分）が 0 円か、ごくわずかの見込みのため、ふるさと納税による税の軽減はありません。",
    furusatoPaidOver: "寄附済みの額が上限の目安を超えています。超えた分は自己負担が増えます。",
    furusatoContributionsLower: "iDeCo や小規模企業共済の掛金を増やすと、住民税が減るため上限の目安も下がります。",
    // --- 青色申告特別控除 ---
    blueMisc: "雑所得（事業とは言えない副業などの所得）として入力されているため計算していません。青色申告特別控除は事業所得（または不動産所得）が対象です。",
    blueNoBusiness: "事業の収入がないため計算していません。",
    blueRequirements: "55万円: 複式簿記で記帳し、貸借対照表・損益計算書を付けて期限内に申告。65万円: それに加えて e-Tax で申告するか、優良な電子帳簿で保存。",
    blueFrom2027: "令和9年分からは見直されます（複式簿記 + e-Tax で 65 万円、さらに一定の電子帳簿で 75 万円、複式簿記でも書面で申告すると 10 万円。簡易簿記の 10 万円は前々年の収入が 1,000 万円以下の方などに限定）。この試算は令和8年分のものです。",
    blueApplication: "青色申告には事前に「青色申告承認申請書」の提出が必要です。未提出の場合、今年分には間に合わない可能性が高いので、提出期限を税務署で確認してください（来年分の準備としては有効です）。",
    // --- 国民健康保険料 ---
    nhiScope: "翌年度の国民健康保険料（税）のうち、あなた自身の所得にかかる所得割だけの目安です。均等割・平等割、世帯のほかの加入者の分、賦課限度額、低所得世帯の軽減は考慮していません。",
    nhiCap: "すでに賦課限度額に達している場合は、所得が減っても保険料は下がりません。料率や限度額は自治体と年度によって変わるので、お住まいの市区町村の案内で確認してください。",
    nhiNotReduced: "iDeCo・小規模企業共済の掛金やふるさと納税は、所得割の算定基礎（総所得金額等 − 基礎控除）を減らさないため、国民健康保険料は下がりません。",
    nhiEmployee: "勤務先の健康保険に加入している場合、国民健康保険料はかかりません。国民健康保険に加入している方だけ参考にしてください。",
    // --- 注意 ---
    warnZeroIncome: "合計所得金額（所得の合計）が 0 円の見込みです。入力値（収入・経費）を確認してください。",
    warnNoTaxable: "所得から控除（基礎控除など）を引くと残りが 0 円になるため、所得税はかからない見込みです（課税所得 0 円）。控除を増やしても所得税はこれ以上減りません。",
    warnSpouseOwnIncome: "本人の合計所得金額が 1,000 万円を超えるため、配偶者控除・配偶者特別控除は適用していません。",
    warnSpouseIncome: "配偶者の合計所得金額が 133 万円を超えるため、配偶者控除・配偶者特別控除は適用していません。",
    warnIncomeAdjustment: "給与収入が 850 万円を超えています。23 歳未満の扶養親族（16 歳未満の子を含む）か特別障害者がいる場合は、" +
        "所得金額調整控除の対象です。今回は計算に含めていません。該当する場合は指定してください" +
        "（CLI は --income-adjustment、JSON は incomeAdjustment、ブラウザ版は「家族」のチェック欄）。",
    warnBlueCapped: "事業所得が青色申告特別控除の枠より小さいため、控除は事業所得の金額までにしています。",
    warnLevyExempt: (limit) => `合計所得金額（所得の合計）が、住民税の所得割（所得に応じてかかる部分）がかからなくなる上限（非課税限度額。${yenJa(limit)}。入力された配偶者・扶養親族の人数で計算）以下のため、所得割は 0 円としています。`,
    warnLevyReduced: (limit, reduction) => `合計所得金額（所得の合計）が、住民税の所得割（所得に応じてかかる部分）がかからなくなる上限（非課税限度額。${yenJa(limit)}。入力された配偶者・扶養親族の人数で計算）を少し超えるため、所得割を ${yenJa(reduction)}減額しています（税引後の所得が限度額を下回らないようにする調整）。`,
    warnPerCapita: (max, perCapita) => `お住まいの市区町村によっては、住民税の均等割（所得にかかわらず定額でかかる部分）もかからない可能性があります（基準は地域で異なり、最も高い地域で合計所得金額 ${yenJa(max)}以下）。` +
        `この試算では判定せず、均等割と森林環境税の ${yenJa(perCapita)}を含めたままにしています。市区町村の案内で確認してください。`,
    warnSpecialExempt: (limit) => `障害者・未成年者・寡婦・ひとり親に当たる方は、合計所得金額が ${yenJa(limit)}以下なら住民税がかかりません。この試算では判定していません。`,
    warnUnder16: "16 歳未満の扶養親族（お子さんなど）がいる場合は、人数を入力してください（CLI は --dependents-under16、JSON は dependents.under16、ブラウザ版は「家族」の欄）。" +
        "扶養控除はありませんが、住民税の所得割がかからなくなる所得の上限が変わります。",
    // --- 令和7年分との比較 ---
    cmpYearOnly: (year) => `year: 令和7年分との比較は ${year} 年分だけに対応しています`,
    cmpSpouse: "spouse.income: 令和7年分との比較は、配偶者の所得が 0 の場合だけに対応しています（配偶者の所得要件が年分で違うため）",
    cmpExempt: (label) => `${label}は、住民税の所得割が非課税か減額される見込みのため、上限の目安を出していません。`,
    cmpSame: "この入力では、上限の目安は令和7年分と同じです。住民税の所得割額も、特例分の割合の区分も変わらないためです。",
    cmpRate: (prevRate, curRate, prevBasic, curBasic, prevBase, curBase) => `特例分の割合が ${prevRate} → ${curRate} に変わりました。` +
        `所得税の基礎控除が ${yenJa(prevBasic)} → ${yenJa(curBasic)}になり、` +
        `割合を決める金額（住民税の課税総所得金額 − 人的控除差調整額）が ${yenJa(prevBase)} → ${yenJa(curBase)}になって、` +
        "当てはまる所得税率の区分が変わったためです。割合が上がると、特例分の上限（所得割額の 20%）に少ない寄附額で達するので、上限の目安は下がります。",
    cmpLevy: (prevLevy, curLevy, prevSalary, curSalary) => `住民税の所得割額が ${yenJa(prevLevy)} → ${yenJa(curLevy)}に変わりました。` +
        `給与所得控除の最低額が 65 万円 → 74 万円に上がり、給与所得が ${yenJa(prevSalary)} → ${yenJa(curSalary)}になったためです。`,
    cmpWhyLower: "上限の目安が下がるのは、所得税が減って、寄附 1 円あたりの所得税の軽減が小さくなった分を、住民税の特例分が埋めるようになったためです。寄附できる額の目安は下がりますが、所得税そのものが減っています。",
    cmpBasis: "令和7年分は、所得税の基礎控除と給与所得控除を当時の額にして、同じ入力（収入・経費・社会保険料・家族）で計算した値です。収入や控除が変われば、どちらの年分の上限も変わります。",
    // --- 入力エラー ---
    inputHeader: "入力に誤りがあります:",
    tooLarge: (name, max, value) => `${name}: 大きすぎます。${numJa(max)} 以下で指定してください（受け取った値: ${numJa(value)}）`,
    notAmount: (name, value) => `${name}: 0 以上の整数（円）で指定してください（受け取った値: ${JSON.stringify(value)}）`,
    notObject: "入力は JSON オブジェクトで指定してください",
    unknownKey: (key) => `${key}: 知らない項目です`,
    yearUnsupported: (years, fallback) => `year: 対応している年分は ${years} です（省略時は ${fallback}）`,
    nhiRate: (value) => `nhiIncomeRatePercent: 0 より大きく 100 以下のパーセント（小数第3位まで。例: 11.5）で指定してください（受け取った値: ${JSON.stringify(value)}）`,
    incomeAdjustmentBool: "incomeAdjustment: true / false で指定してください",
    dependentUnder23Bool: "dependentUnder23: true / false で指定してください",
    incomeType: `businessIncomeType: "business"（事業所得）か "misc"（雑所得）で指定してください`,
    blueLevels: `blueReturn: "none" / "10" / "55" / "65" のいずれかで指定してください`,
    spouseShape: "spouse: { income, age70OrOlder } の形で指定してください",
    spouseIncome: "spouse.income: 配偶者の合計所得金額（円）を指定してください",
    spouse70: "spouse.age70OrOlder: true / false で指定してください",
    dependentsShape: "dependents: { general, specific, elderly, elderlyCohabiting, under16 } の形で人数を指定してください",
    blueForMisc: "blueReturn: 雑所得には青色申告特別控除を適用できません",
    flagNegative: (flag, text) => `--${flag}: 0 以上の金額で指定してください（受け取った値: ${JSON.stringify(text)}）`,
    flagNotAmount: (flag, text) => `--${flag}: 金額として読めません（${JSON.stringify(text)}）`,
    flagCount: (flag, text) => `--${flag}: 人数を整数で指定してください（${JSON.stringify(text)}）`,
    flagSpouse70: "--spouse-70: --spouse-income と一緒に指定してください",
    flagNhiRate: (value) => `--nhi-rate: パーセントの数値で指定してください（例: 11.5。受け取った値: ${JSON.stringify(value)}）`,
    // --- 医療費控除・セルフメディケーション税制 ---
    medNormal: (floor, floorMax) => `医療費控除は「支払った医療費 − 保険金などで補てんされる金額 − ${yenJa(floor)}」（最高 200 万円）です。` +
        (floor < floorMax ? `引く額は、総所得金額等が 200 万円未満なのでその 5% の ${yenJa(floor)}です。` : `引く額は 10 万円です（総所得金額等が 200 万円未満なら、その 5%）。`),
    medSelf: (floor, cap) => `セルフメディケーション税制は、対象の医薬品の購入費のうち ${yenJa(floor)}を超える部分（最高 ${yenJa(cap)}）を控除します。` +
        "健康診断・予防接種・特定健診などの「一定の取組」を、申告する本人がその年にしていることが条件です。",
    medNone: "いまの入力では、医療費控除もセルフメディケーション税制も控除額が 0 円です（足切り額を超えていないため）。",
    medChoseNormal: (diff) => `通常の医療費控除のほうが、セルフメディケーション税制より税額が ${yenJa(diff)}少なくなります。`,
    medChoseSelf: (diff) => `セルフメディケーション税制のほうが、通常の医療費控除より税額が ${yenJa(diff)}少なくなります。`,
    medChoice: "2 つは選択で、併用はできません。申告したあとに、更正の請求や修正申告で選び直すこともできません。" +
        "申告書には「医療費控除の明細書」か「セルフメディケーション税制の明細書」を添えます。",
    // --- 生命保険料控除 ---
    lifeLabel: "一般の生命保険料",
    pensionLabel: "個人年金保険料",
    lifeUnder23: "23 歳未満の扶養親族がいるので、令和8年分の特例で、新生命保険料の控除の上限を 6 万円（4 万円ではなく）として計算しました（合計の上限 12 万円は同じ）。住民税にはこの特例はありません。",
    lifeOldOnly: (label) => `${label}は、旧契約の分だけを申告するほうが控除が大きくなるので、そのように計算しました（新契約の分は申告書に書きません）。`,
    lifeCertificate: "保険会社から届く「生命保険料控除証明書」の金額（剰余金・割戻金を引いた額）を、新契約・旧契約、一般・介護医療・個人年金の区分ごとに入れます。証明書は申告書に添付するか、提示します。",
    warnOtherDeductionsOverlap: "「その他の所得控除」にも金額が入っています。医療費控除・生命保険料控除をそちらにも入れていると、二重に引いてしまいます。",
    // --- 確定申告書のどこに書くか ---
    filing: {
        formName: "令和8年分の所得税及び復興特別所得税の確定申告書（案）",
        revenueBusiness: "事業の売上（収入金額）。青色申告決算書（白色は収支内訳書）から書き写します。",
        revenueSalary: "源泉徴収票の「支払金額」。",
        revenueMisc: "副業の売上（業務に係る雑所得の収入金額）。",
        incomeBusiness: (blue) => blue > 0 ? `売上 − 経費 − 青色申告特別控除（${yenJa(blue)}）。` : "売上 − 経費。",
        incomeSalary: (adjustment) => adjustment > 0 ? `給与所得控除と所得金額調整控除（${yenJa(adjustment)}）を引いた額。` : "給与所得控除を引いた額（源泉徴収票の「給与所得控除後の金額」）。",
        incomeMisc: "副業の売上 − 経費。",
        miscTotal: "雑所得の合計。",
        totalIncome: "所得の合計（合計所得金額）。",
        socialInsurance: "国民健康保険料・国民年金保険料・給与から引かれた社会保険料などの合計。内訳は第二表に書きます。",
        mutualAid: "iDeCo と小規模企業共済の掛金の合計。内訳は第二表に書きます。",
        lifeInsurance: "生命保険料控除の額。支払った保険料は第二表に区分ごとに書きます。",
        spouse: "配偶者控除か配偶者特別控除の額。配偶者のことは第二表の「配偶者や親族に関する事項」に書きます。",
        dependents: "扶養控除の額。",
        basic: "基礎控除の額（合計所得金額で決まります）。",
        subtotal: "⑬から㉕までの控除の合計。",
        subtotalWithOther: (other) => `⑬から㉕までの控除の合計。入力した「その他の所得控除」（${yenJa(other)}）を、⑯（地震保険料）などの該当する欄に書いたものとして含めています。`,
        medicalNormal: "医療費控除の額。「区分」の欄は空けておきます。「医療費控除の明細書」を添えます。",
        medicalSelf: "セルフメディケーション税制による控除の額。「区分」の欄に 1 を書きます。「セルフメディケーション税制の明細書」を添えます。",
        donation: (paid) => `寄附金控除の額（ふるさと納税 ${yenJa(paid)} − 2,000 円）。受領証明書を添えるか、寄附金控除に関する証明書を使います。`,
        deductionTotal: "所得から差し引かれる金額の合計。",
        taxable: "課税される所得金額（1,000 円未満切り捨て）。",
        taxOnTaxable: (rate) => `所得税の速算表で求めた税額（税率 ${rate}%）。`,
        afterCredits: "住宅ローン控除などの税額控除がない場合。税額控除はこの計算では扱っていません（ある場合は差し引きます）。",
        baseTax: "災害減免額がない場合の、基準所得税額。",
        reconstruction: "基準所得税額 × 2.1%（1 円未満切り捨て）。",
        incomeTaxTotal: "所得税と復興特別所得税の合計。",
        withholding: "給与や報酬から源泉徴収された税額の合計（源泉徴収票・支払調書で確かめます）。この計算では扱っていません。",
        payable: "源泉徴収税額（㊾）や外国税額控除がない場合の額（100 円未満切り捨て）。㊾がある場合は ㊻ − ㊾ を 100 円未満切り捨てた額で、マイナスなら還付されます。予定納税をした場合は、さらに㊿から差し引きます（51〜53）。",
        socialInsuranceDetail: "種類（国民健康保険、国民年金、給与からの社会保険料など）ごとに、支払った額を書きます。",
        idecoDetail: "種類に「個人型確定拠出年金」と書き、支払った掛金を書きます（年末に届く「小規模企業共済等掛金払込証明書」の額）。",
        kyosaiDetail: "種類に「小規模企業共済」と書き、支払った掛金を書きます（中小機構の掛金払込証明書の額）。",
        lifeDetail: "生命保険料控除証明書の額（剰余金・割戻金を引いた額）。",
        donationDetail: "寄附先の名称（自治体の名前）と、寄附した額を書きます。",
        family: "配偶者・扶養親族の氏名・個人番号・生年月日などを書きます。",
        familyUnder16: (count) => `配偶者・扶養親族の氏名などを書きます。16 歳未満の子（${count} 人）も書き、「住民税」の「同一・16」に○を付けます（住民税の非課税の判定に使われます）。`,
        residentFurusato: "ふるさと納税の合計額。住民税の寄附金税額控除（特例分）の計算に使われます。",
        residentCollection: "副業の所得にかかる住民税を、給料から天引きにする（特別徴収）か、自分で納める（自分で納付）かを選びます。勤務先に副業の住民税の通知が行かないようにしたい場合は「自分で納付」を選びます（自治体によっては選べないことがあります）。",
        blueStatement: "青色申告決算書の損益計算書の「青色申告特別控除額」の欄。所得金額（①）はこの額を引いた後の額です。",
        noteDraft: "欄の番号と名前は、国税庁が公開している「令和８年分の所得税等の確定申告書（案）」の第一表・第二表で確かめたものです。案なので、確定した様式が公開されたら照らし合わせて差し替えます。",
        noteBaseline: "金額は、入力どおりの「現状の見込み」です。年内にふるさと納税などを足した場合は、実行したあとの額で計算し直してください。",
        noteWithholding: "源泉徴収税額・予定納税額・住宅ローン控除などの税額控除は扱っていないので、納める税金・還付される税金は、それらを差し引いて求めます。",
        noteResidentReturn: "確定申告をすれば、住民税の申告は別にしなくてかまいません（第二表の「住民税・事業税に関する事項」が市区町村に伝わります）。確定申告をしない人（給与だけで、副業の所得が 20 万円以下の会社員など）は、市区町村に住民税の申告をします。その様式は市区町村ごとで、欄の番号は共通ではありません。",
        noteEtax: "e-Tax の「確定申告書等作成コーナー」で作る場合は、金額を入れると欄に自動で入ります。この表は、入れた額や紙の申告書を確かめるのに使ってください。",
    },
};
const en = {
    yen: yenEn,
    disclaimer: "This is an estimate based on the figures you entered and simplified assumptions. Your actual tax depends on what you file and on your municipality. " +
        "It does not replace the judgment of a tax accountant (zeirishi), the tax office or your city office. Check with a professional or the office in charge before any important decision.",
    label: (year) => `tax year ${year} (Reiwa ${year - 2018})`,
    residentTaxLabel: (year) => `fiscal ${year + 1}`,
    additionalOverRemaining: (additional, remaining) => `The extra amount you entered (${yenEn(additional)}) is more than the room left this year, so ${yenEn(remaining)} was used.`,
    paidOverLimit: "The amount already paid is above the annual limit. Check the amount or the limit.",
    noEffectAtAll: "On these figures, extra contributions would not lower your tax: income tax and the income-based part of resident tax are already zero or cannot go lower.",
    noEffectBeyond: (effective, additional, requested) => `Contributing more than ${yenEn(effective)} would not lower your tax any further, because income tax and the income-based part of resident tax reach zero or their floor. ` +
        `${yenEn(effective)} was used (${requested ? "you entered" : "room left this year:"} ${yenEn(additional)}).`,
    idecoLimitEmployee: (monthly) => `The annual limit assumes an employee whose company has no corporate pension (¥${numEn(monthly)} a month). ` +
        "If your employer has a corporate pension, or you are a public servant, your limit is different: enter it under “iDeCo annual limit”.",
    idecoLimitSelfEmployed: (monthly) => `The annual limit assumes a Category 1 insured person of the National Pension, which is what freelancers and the self-employed are (¥${numEn(monthly)} a month). ` +
        "National Pension Fund contributions and the additional pension premium count toward the same limit.",
    idecoTiming: "Whether you can still raise this year's contributions depends on your provider and the date. You can change the monthly amount only once per contribution year (December to November). " +
        "Paying several months in one go needs an annual-schedule form filed in advance; it takes effect from the month after you apply (debited the month after that), and missed months cannot be paid later. " +
        "Only amounts debited by December count for this year.",
    idecoLockup: "As a rule you cannot withdraw before age 60. What you receive later is taxable, as retirement income if taken as a lump sum or as pension income if taken as an annuity (each has its own deduction). " +
        "Account fees apply and differ by provider. Depending on investment results, you may get back less than you paid in.",
    kyosaiBlockedSalary: "Not calculated because you have a salary. Employees in regular employment cannot join Small Business Mutual Aid (shokibo kigyo kyosai), even if they also run a business on the side.",
    kyosaiBlockedNoBusiness: "Not calculated because there is no business revenue.",
    kyosaiBlockedMisc: "Not calculated because the side income is entered as miscellaneous income (zatsu shotoku). Small Business Mutual Aid is for sole proprietors and similar business owners.",
    kyosaiLimit: (monthly) => `The annual limit is the maximum monthly contribution, ¥${numEn(monthly)}, times 12.`,
    kyosaiDeductible: "Contributions actually paid this year are deductible, including prepayments covering up to one year ahead. Check eligibility, how to raise or prepay contributions, and the deadlines with SMRJ, the public body that runs the scheme.",
    kyosaiPayout: "You get the money back as a benefit when you close the business or retire, and it is taxed then (retirement income for a lump sum, pension income for instalments, occasional income if you cancel voluntarily before 65). " +
        "If you cancel voluntarily with fewer than 240 months (20 years) of contributions you get back less than you paid, and with fewer than 12 months you get nothing.",
    combinedRecomputed: "This is the tax recomputed with everything done together. It is not the sum of the individual savings.",
    combinedCapped: (total) => `Contributions stop lowering your tax at ${yenEn(total)} in total, so nothing above that is included.`,
    combinedFurusato: "The furusato nozei part is your donation minus the out-of-pocket amount, taken off your tax. The same money leaves your account as a donation, so you do not end up with more cash; what you gain is the return gifts.",
    combinedFurusatoZero: "With the extra contributions, the income-based part of resident tax shrinks and the furusato nozei limit becomes ¥0, so no extra donation is included.",
    combinedFurusatoUpTo: (limitAfter) => `Furusato nozei is assumed up to the limit after the extra contributions (${yenEn(limitAfter)}).`,
    combinedPaidOver: "What you have already donated is above the limit after the extra contributions. The excess costs you more out of pocket, so weigh it against the extra contributions.",
    combinedIdecoExcluded: "Extra iDeCo contributions are not included in this total: the monthly amount can be changed only once a year, the change takes time, and whether you can add more this year depends on your provider and the date. " +
        "If you know how much you can still add this year, enter that amount and it will be included.",
    combinedWithIdeco: "The total if the remaining iDeCo room can also be paid in this year. Ask your iDeCo provider whether that is still possible.",
    furusatoRelief: "Furusato nozei lowers your tax by at most your donation minus ¥2,000 out of pocket. The same money leaves your account as a donation, so you do not end up with more cash; what you gain is the return gifts.",
    furusatoFinalReturn: "The limit assumes you file a final tax return (kakutei shinkoku). Filing a return cancels any one-stop exception application, so the donations must be claimed on the return.",
    furusatoMargin: "If your income or deductions end up different from this forecast, the limit moves too. Leave a margin rather than donating right up to it.",
    furusatoExempt: "The income-based part of your resident tax is expected to be zero, so furusato nozei would not lower your resident tax. No limit is shown.",
    furusatoReduced: "Your total income is just above the level at which the income-based part of resident tax is waived, so that part is expected to be reduced. A donation does not lower resident tax until it exceeds that reduction, so no donation keeps the out-of-pocket cost at ¥2,000. No limit is shown.",
    furusatoTiny: "The income-based part of your resident tax is expected to be zero or very small, so furusato nozei would not lower your tax.",
    furusatoPaidOver: "What you have already donated is above the limit. The excess costs you more out of pocket.",
    furusatoContributionsLower: "Raising iDeCo or Small Business Mutual Aid contributions lowers resident tax, and with it the furusato nozei limit.",
    blueMisc: "Not calculated because the side income is entered as miscellaneous income (zatsu shotoku). The special deduction for blue returns applies to business income (or real estate income).",
    blueNoBusiness: "Not calculated because there is no business revenue.",
    blueRequirements: "¥550,000: double-entry bookkeeping, with a balance sheet and profit-and-loss statement attached, filed by the deadline. ¥650,000: the same, plus filing online with e-Tax (or keeping qualifying electronic books).",
    blueFrom2027: "The rules change from tax year 2027: ¥650,000 for double-entry books filed with e-Tax, ¥750,000 with certain electronic bookkeeping on top, and ¥100,000 for double-entry books filed on paper; the ¥100,000 deduction for simple bookkeeping is limited to people with revenue of ¥10 million or less two years earlier, among others. This estimate is for tax year 2026.",
    blueApplication: "A blue return needs an approved application (aoiro shinkoku shonin shinseisho) filed with the tax office in advance. If you have not filed one, it is most likely too late for this year: check the deadline with your tax office. Filing now still prepares you for next year.",
    nhiScope: "This is only the income-based part of next fiscal year's National Health Insurance premium that comes from your own income. The per-person and per-household parts, other members of your household, the annual cap and the reductions for low-income households are not included.",
    nhiCap: "If you are already at the annual cap, a lower income does not lower the premium. Rates and caps differ by municipality and year: check your city office's guide.",
    nhiNotReduced: "iDeCo and Small Business Mutual Aid contributions and furusato nozei do not lower National Health Insurance premiums, because they do not reduce the base the income-based part is charged on (total income minus the basic deduction).",
    nhiEmployee: "If you are covered by your employer's health insurance, you do not pay National Health Insurance. This applies only if you are enrolled in National Health Insurance.",
    warnZeroIncome: "Your total income comes to ¥0. Check the revenue and expenses you entered.",
    warnNoTaxable: "After the deductions (such as the basic exemption) nothing is left to tax, so no income tax is expected (taxable income ¥0). More deductions cannot lower income tax any further.",
    warnSpouseOwnIncome: "Your own total income is above ¥10 million, so no exemption or special exemption for spouses is applied.",
    warnSpouseIncome: "Your spouse's total income is above ¥1.33 million, so no exemption or special exemption for spouses is applied.",
    warnIncomeAdjustment: "Your salary is above ¥8.5 million. If you have a dependent under 23 (including children under 16) or a family member with a severe disability, " +
        "you qualify for an extra deduction (shotoku kingaku chosei kojo) that is not included here. If it applies, tick the box under “Family”.",
    warnBlueCapped: "Your business income is smaller than the special deduction for blue returns, so the deduction is limited to your business income.",
    warnLevyExempt: (limit) => `Your total income is at or below the level at which the income-based part of resident tax is waived (${yenEn(limit)}, worked out from the spouse and dependents you entered), so that part is ¥0.`,
    warnLevyReduced: (limit, reduction) => `Your total income is just above the level at which the income-based part of resident tax is waived (${yenEn(limit)}, worked out from the spouse and dependents you entered), so that part is reduced by ${yenEn(reduction)} (an adjustment that keeps income after tax from falling below the level).`,
    warnPerCapita: (max, perCapita) => `Depending on your municipality, the flat per-person part of resident tax may be waived as well (the threshold differs by area; the highest is a total income of ${yenEn(max)}). ` +
        `This estimate does not decide that and keeps the ${yenEn(perCapita)} for the per-person part and the forest environment tax. Check your city office's guide.`,
    warnSpecialExempt: (limit) => `People with a disability, minors, widows and single parents pay no resident tax if their total income is ${yenEn(limit)} or less. This estimate does not check for that.`,
    warnUnder16: "If you support children under 16, enter how many under “Family”. " +
        "They give no dependent exemption, but they raise the income level below which the income-based part of resident tax is waived.",
    cmpYearOnly: (year) => `year: the comparison with tax year 2025 is only available for tax year ${year}`,
    cmpSpouse: "spouse.income: the comparison with tax year 2025 is only available when the spouse has no income (the income test for spouses differs between the two years)",
    cmpExempt: (label) => `For ${label}, the income-based part of resident tax is expected to be waived or reduced, so no limit is shown.`,
    cmpSame: "For these figures the limit is the same as for tax year 2025: neither the income-based part of resident tax nor the rate band of the special portion changes.",
    cmpRate: (prevRate, curRate, prevBasic, curBasic, prevBase, curBase) => `The rate of the special portion changed from ${prevRate} to ${curRate}. ` +
        `The basic exemption for income tax went from ${yenEn(prevBasic)} to ${yenEn(curBasic)}, ` +
        `which moved the amount that picks the rate (resident-tax taxable income minus the personal-deduction adjustment) from ${yenEn(prevBase)} to ${yenEn(curBase)} ` +
        "and into a different income tax bracket. A higher rate means a smaller donation reaches the cap on the special portion (20% of the income-based part of resident tax), so the limit goes down.",
    cmpLevy: (prevLevy, curLevy, prevSalary, curSalary) => `The income-based part of resident tax changed from ${yenEn(prevLevy)} to ${yenEn(curLevy)}. ` +
        `The minimum employment income deduction rose from ¥650,000 to ¥740,000, which took employment income from ${yenEn(prevSalary)} to ${yenEn(curSalary)}.`,
    cmpWhyLower: "The limit goes down because your income tax went down: each yen donated now saves less income tax, and the special portion of resident tax fills the gap. You can donate less at ¥2,000 out of pocket, but you are paying less income tax to begin with.",
    cmpBasis: "Tax year 2025 is the same input (revenue, expenses, social insurance, family) calculated with that year's basic exemption and employment income deduction. If your income or deductions change, the limit for either year changes too.",
    inputHeader: "There are problems with the input:",
    tooLarge: (name, max, value) => `${name}: too large. Enter ${numEn(max)} or less (received: ${numEn(value)})`,
    notAmount: (name, value) => `${name}: enter a whole number of yen, 0 or more (received: ${JSON.stringify(value)})`,
    notObject: "The input must be a JSON object",
    unknownKey: (key) => `${key}: unknown field`,
    yearUnsupported: (years, fallback) => `year: supported tax years are ${years} (default ${fallback})`,
    nhiRate: (value) => `nhiIncomeRatePercent: enter a percentage above 0 and up to 100, with at most three decimals, e.g. 11.5 (received: ${JSON.stringify(value)})`,
    incomeAdjustmentBool: "incomeAdjustment: must be true or false",
    dependentUnder23Bool: "dependentUnder23: must be true or false",
    incomeType: `businessIncomeType: must be "business" (business income) or "misc" (miscellaneous income)`,
    blueLevels: `blueReturn: must be one of "none" / "10" / "55" / "65"`,
    spouseShape: "spouse: must have the form { income, age70OrOlder }",
    spouseIncome: "spouse.income: enter the spouse's total income in yen",
    spouse70: "spouse.age70OrOlder: must be true or false",
    dependentsShape: "dependents: enter head counts in the form { general, specific, elderly, elderlyCohabiting, under16 }",
    blueForMisc: "blueReturn: the special deduction for blue returns cannot be applied to miscellaneous income",
    flagNegative: (flag, text) => `--${flag}: enter an amount of 0 or more (received: ${JSON.stringify(text)})`,
    flagNotAmount: (flag, text) => `--${flag}: this does not read as an amount (${JSON.stringify(text)}). Use digits, e.g. 4,800,000 or 4.8m`,
    flagCount: (flag, text) => `--${flag}: enter a whole number of people (${JSON.stringify(text)})`,
    flagSpouse70: "--spouse-70: use together with --spouse-income",
    flagNhiRate: (value) => `--nhi-rate: enter a percentage as a number, e.g. 11.5 (received: ${JSON.stringify(value)})`,
    medNormal: (floor, floorMax) => `The deduction for medical expenses is “medical expenses paid − amounts reimbursed by insurance and similar − ${yenEn(floor)}”, up to ¥2,000,000. ` +
        (floor < floorMax
            ? `The amount taken off is 5% of your total income (${yenEn(floor)}), because your total income is below ¥2 million.`
            : "The amount taken off is ¥100,000 (or 5% of total income, if your total income is below ¥2 million)."),
    medSelf: (floor, cap) => `The self-medication tax system deducts what you spent on eligible over-the-counter medicines above ${yenEn(floor)}, up to ${yenEn(cap)}. ` +
        "You qualify only if you yourself had a health check, vaccination or similar preventive check-up during the year.",
    medNone: "On these figures, neither the deduction for medical expenses nor the self-medication tax system gives a deduction: your spending does not exceed the threshold.",
    medChoseNormal: (diff) => `The regular deduction for medical expenses leaves you ${yenEn(diff)} less tax than the self-medication tax system.`,
    medChoseSelf: (diff) => `The self-medication tax system leaves you ${yenEn(diff)} less tax than the regular deduction for medical expenses.`,
    medChoice: "You choose one of the two; you cannot use both, and you cannot switch after filing (not even by amending the return). " +
        "Attach the statement for the one you choose: the medical expense statement or the self-medication statement.",
    lifeLabel: "general life insurance",
    pensionLabel: "individual pension insurance",
    lifeUnder23: "Because you have a dependent under 23, the 2026 rule applies: the deduction for new-contract life insurance goes up to ¥60,000 instead of ¥40,000 (the overall ¥120,000 limit is unchanged). Resident tax has no such rule.",
    lifeOldOnly: (label) => `For ${label}, claiming only the old contracts gives a larger deduction, so that is what was calculated (leave the new contracts off the return).`,
    lifeCertificate: "Use the amounts on the life insurance premium certificates your insurers send (after dividends and refunds), split into new and old contracts and into general, medical/long-term care and pension. Attach or show the certificates when you file.",
    warnOtherDeductionsOverlap: "You also entered an amount under “other deductions”. If it includes medical expenses or life insurance premiums, they are being deducted twice.",
    filing: {
        formName: "Final income tax return for tax year 2026 (確定申告書, draft form)",
        revenueBusiness: "Business revenue. Copy it from your blue-return financial statement (white return: the income and expense statement).",
        revenueSalary: "The “支払金額” box on your withholding slip (源泉徴収票).",
        revenueMisc: "Side-business revenue (miscellaneous income from business activities).",
        incomeBusiness: (blue) => blue > 0 ? `Revenue − expenses − the special deduction for blue returns (${yenEn(blue)}).` : "Revenue − expenses.",
        incomeSalary: (adjustment) => adjustment > 0
            ? `Salary after the employment income deduction and the income adjustment deduction (${yenEn(adjustment)}).`
            : "Salary after the employment income deduction (“給与所得控除後の金額” on the withholding slip).",
        incomeMisc: "Side-business revenue − expenses.",
        miscTotal: "Total miscellaneous income.",
        totalIncome: "Total income.",
        socialInsurance: "National Health Insurance, National Pension and social insurance taken out of your salary, in total. The breakdown goes on page 2.",
        mutualAid: "iDeCo and Small Business Mutual Aid contributions, in total. The breakdown goes on page 2.",
        lifeInsurance: "The deduction for life insurance premiums. The premiums paid go on page 2 by type.",
        spouse: "The deduction for a spouse (or the special deduction for a spouse). Details of your spouse go in the family section on page 2.",
        dependents: "The deduction for dependents.",
        basic: "The basic deduction (set by your total income).",
        subtotal: "Deductions ⑬ to ㉕ in total.",
        subtotalWithOther: (other) => `Deductions ⑬ to ㉕ in total. It includes the “other deductions” you entered (${yenEn(other)}), assuming they go in boxes such as ⑯ (earthquake insurance).`,
        medicalNormal: "The deduction for medical expenses. Leave the “区分” box empty. Attach the medical expense statement (医療費控除の明細書).",
        medicalSelf: "The self-medication deduction. Write 1 in the “区分” box. Attach the self-medication statement (セルフメディケーション税制の明細書).",
        donation: (paid) => `The deduction for donations (furusato nozei ${yenEn(paid)} − ¥2,000). Attach the donation receipts or the certificate of donation deduction.`,
        deductionTotal: "All deductions from income in total.",
        taxable: "Taxable income (rounded down to ¥1,000).",
        taxOnTaxable: (rate) => `Income tax from the rate table (${rate}% bracket).`,
        afterCredits: "Assuming no tax credits such as the housing loan credit, which this calculator does not handle (subtract them if you have any).",
        baseTax: "Base income tax, assuming no disaster relief.",
        reconstruction: "Base income tax × 2.1% (rounded down to ¥1).",
        incomeTaxTotal: "Income tax plus the special income tax for reconstruction.",
        withholding: "Tax already withheld from your salary or fees (see your withholding slips and payment records). Not handled by this calculator.",
        payable: "The amount if nothing was withheld (㊾) and there is no foreign tax credit, rounded down to ¥100. If tax was withheld, it is ㊻ − ㊾ rounded down to ¥100, and a negative figure is refunded. Prepaid tax (予定納税) is then subtracted (boxes 51–53).",
        socialInsuranceDetail: "By type (National Health Insurance, National Pension, social insurance from salary, etc.), the amount paid.",
        idecoDetail: "Write “個人型確定拠出年金” as the type and the contributions paid (the certificate 小規模企業共済等掛金払込証明書 that arrives near year-end).",
        kyosaiDetail: "Write “小規模企業共済” as the type and the contributions paid (from SMRJ's payment certificate).",
        lifeDetail: "The amount on the life insurance premium certificate (after dividends and refunds).",
        donationDetail: "The name of the municipality you donated to, and the amount.",
        family: "Names, My Number and dates of birth of your spouse and dependents.",
        familyUnder16: (count) => `Names and other details of your spouse and dependents. Include your children under 16 (${count}) and circle “同一・16” under “住民税”: it is used to decide whether resident tax is waived.`,
        residentFurusato: "Your furusato nozei donations in total. Used for the special portion of the resident tax credit for donations.",
        residentCollection: "Choose whether resident tax on your side income is taken from your salary (特別徴収) or paid by you (自分で納付). Choose 自分で納付 if you do not want your employer to receive a resident tax notice for the side income (some municipalities may not allow it).",
        blueStatement: "The “青色申告特別控除額” box in the profit and loss statement of the blue-return financial statement. Business income (①) is after this deduction.",
        noteDraft: "Box numbers and names were checked against the draft final return for tax year 2026 (令和８年分の所得税等の確定申告書（案）, pages 1 and 2) published by the National Tax Agency. It is a draft: once the final form is published, they will be checked and replaced.",
        noteBaseline: "The amounts are your current forecast as entered. If you add furusato nozei or other measures before year-end, recalculate with the amounts after doing so.",
        noteWithholding: "Withheld tax, prepaid tax and tax credits such as the housing loan credit are not handled, so subtract them to get the tax to pay or the refund.",
        noteResidentReturn: "If you file a final tax return, you do not need a separate resident tax return: the resident tax section on page 2 is passed on to your municipality. If you do not file one (for example, an employee whose side income is ¥200,000 or less), file a resident tax return with your municipality instead; its form differs by municipality and has no common box numbers.",
        noteEtax: "If you use e-Tax's online return preparation (確定申告書等作成コーナー), the boxes are filled in as you enter amounts. Use this table to check the amounts or a paper return.",
    },
};
export const CORE_MESSAGES = { ja, en };
let current = "ja";
/** いま使っている言語の文面 */
export function m() {
    return CORE_MESSAGES[current];
}
/** いま使っている言語 */
export function currentLocale() {
    return current;
}
/**
 * fn を、指定した言語で実行する（終わったら元の言語に戻す）。locale を省くと、いまの言語のまま。
 * 計算は同期で終わるので、途中でほかの言語の計算が割り込むことはない。
 */
export function withLocale(locale, fn) {
    const previous = current;
    if (locale !== undefined) {
        if (!(locale in CORE_MESSAGES))
            throw new RangeError(`locale: "ja" か "en" で指定してください（受け取った値: ${JSON.stringify(locale)}）`);
        current = locale;
    }
    try {
        return fn();
    }
    finally {
        current = previous;
    }
}
