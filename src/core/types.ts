/** 青色申告特別控除の区分。none は白色申告。 */
export type BlueReturn = "none" | "10" | "55" | "65";

export interface SpouseInput {
  /** 配偶者の合計所得金額（円） */
  readonly income: number;
  /** 配偶者が 70 歳以上（その年の 12 月 31 日時点） */
  readonly age70OrOlder?: boolean;
}

export interface DependentsInput {
  /** 一般の控除対象扶養親族（16〜18 歳、23〜69 歳）の人数 */
  readonly general?: number;
  /** 特定扶養親族（19〜22 歳）の人数 */
  readonly specific?: number;
  /** 老人扶養親族（70 歳以上、同居老親等以外）の人数 */
  readonly elderly?: number;
  /** 同居老親等の人数 */
  readonly elderlyCohabiting?: number;
  /**
   * 16 歳未満の扶養親族の人数。扶養控除はないが、住民税の所得割の非課税限度額の人数に入る。
   * 1 人以上いれば、所得金額調整控除の対象（23 歳未満の扶養親族あり）としても扱う。
   */
  readonly under16?: number;
}

/**
 * 計算の入力。金額はすべて年額・円・0 以上の整数。省略した項目は 0（なし）として扱う。
 */
export interface TaxInput {
  /** 年分（西暦）。省略時は 2026（令和 8 年分）。 */
  readonly year?: number;
  /** 給与収入（源泉徴収票の「支払金額」の年間見込み） */
  readonly salaryRevenue?: number;
  /** 事業（フリーランス・副業）の年間売上見込み */
  readonly businessRevenue?: number;
  /** 事業の年間必要経費見込み */
  readonly businessExpenses?: number;
  /** 事業の所得区分。business = 事業所得、misc = 雑所得（青色申告不可・赤字の損益通算不可）。 */
  readonly businessIncomeType?: "business" | "misc";
  /** 現在見込んでいる青色申告特別控除の区分 */
  readonly blueReturn?: BlueReturn;
  /** 社会保険料控除の対象額（国民健康保険料・国民年金保険料・給与天引きの社会保険料など） */
  readonly socialInsurance?: number;
  /** iDeCo 掛金のうち、年末までに拠出済み・拠出が確定している額 */
  readonly idecoPaid?: number;
  /** iDeCo の年間拠出限度額。省略時は就業形態から推定する。 */
  readonly idecoAnnualLimit?: number;
  /** 小規模企業共済の掛金のうち、年末までに支払済み・支払が確定している額 */
  readonly kyosaiPaid?: number;
  /** 今年すでに行ったふるさと納税の合計額 */
  readonly furusatoPaid?: number;
  /** 配偶者（生計を一にする場合のみ指定） */
  readonly spouse?: SpouseInput;
  /** 扶養親族の人数 */
  readonly dependents?: DependentsInput;
  /**
   * 所得金額調整控除（子ども・特別障害者等）の対象かどうか。
   * 給与収入が 850 万円を超え、次のどれかに当たる場合に true にする:
   * 23 歳未満の扶養親族がいる（16 歳未満の子を含む）/ 本人が特別障害者 / 特別障害者の同一生計配偶者・扶養親族がいる。
   * 特定扶養親族（19〜22 歳）か 16 歳未満の扶養親族を 1 人以上入力した場合は、指定しなくても対象として扱う。
   */
  readonly incomeAdjustment?: boolean;
  /**
   * その年に支払った医療費（自分と、生計を一にする家族の分）。医療費控除の計算に使う。
   * セルフメディケーション税制の対象の薬の購入費は selfMedicationExpenses にも入れる（両方を比べて有利なほうを使う）。
   */
  readonly medicalExpenses?: number;
  /** 医療費のうち、保険金・高額療養費・出産育児一時金などで補てんされる金額 */
  readonly medicalReimbursed?: number;
  /**
   * セルフメディケーション税制の対象の医薬品（スイッチ OTC など）の購入費（保険金などで補てんされる部分を除く）。
   * 健康診断・予防接種などの「一定の取組」をしている人だけが使える。
   */
  readonly selfMedicationExpenses?: number;
  /** 生命保険料（平成 24 年以後の新契約の一般の生命保険料）。剰余金・割戻金を差し引いた年間の額 */
  readonly lifeInsuranceNew?: number;
  /** 生命保険料（平成 23 年以前の旧契約。旧契約の医療保険を含む） */
  readonly lifeInsuranceOld?: number;
  /** 介護医療保険料（新契約） */
  readonly medicalCareInsurance?: number;
  /** 個人年金保険料（新契約） */
  readonly pensionInsuranceNew?: number;
  /** 個人年金保険料（旧契約） */
  readonly pensionInsuranceOld?: number;
  /**
   * 23 歳未満の扶養親族（16 歳未満の子を含む）がいるか。令和 8 年分の生命保険料控除の特例に使う。
   * 特定扶養親族（19〜22 歳）か 16 歳未満の扶養親族を 1 人以上入力した場合は、指定しなくても true として扱う。
   */
  readonly dependentUnder23?: boolean;
  /** その他の所得控除の合計（所得税）。地震保険料控除・障害者控除など（医療費控除・生命保険料控除は上の項目で入れる）。 */
  readonly otherDeductions?: number;
  /** その他の所得控除の合計（住民税）。省略時は otherDeductions と同額。 */
  readonly otherDeductionsResident?: number;
  /**
   * 国民健康保険料（税）の所得割の料率の合計（パーセント。例: 11.5）。
   * 医療分・後期高齢者支援金分・介護分（40〜64 歳）などを足した率を、自治体の案内で確認して入れる。
   * 指定したときだけ、所得が変わる策（青色申告特別控除）による翌年度の国保料の差の目安を出す。
   */
  readonly nhiIncomeRatePercent?: number;
  /**
   * iDeCo に年内に追加で拠出できる額。省略時は、限度額までの残り枠（税額が減らなくなる額まで）で試算する。
   * 指定したときだけ、「まとめて実行した場合」の合計に iDeCo の追加を含める
   * （掛金額の変更は年 1 回で、年内に増やせるかどうかは加入先と時期しだいのため）。
   */
  readonly idecoAdditional?: number;
  /** 小規模企業共済に追加で支払う額。省略時は、年間上限までの残り枠（税額が減らなくなる額まで）。 */
  readonly kyosaiAdditional?: number;
}

/** 所得控除の内訳 */
export interface DeductionBreakdown {
  readonly basic: number;
  readonly spouse: number;
  readonly dependents: number;
  readonly socialInsurance: number;
  /** 小規模企業共済等掛金控除（iDeCo + 小規模企業共済） */
  readonly smallBusinessMutualAid: number;
  /** 寄附金控除（所得税のみ。住民税は税額控除） */
  readonly donation: number;
  /** 医療費控除（セルフメディケーション税制を選んだ場合はその額） */
  readonly medical: number;
  readonly lifeInsurance: number;
  readonly other: number;
  readonly total: number;
}

export interface IncomeTaxResult {
  readonly deductions: DeductionBreakdown;
  /** 課税される所得金額（1,000 円未満切捨て） */
  readonly taxableIncome: number;
  /** 適用される税率（パーセント）。課税所得 0 のときは 0。 */
  readonly marginalRatePercent: number;
  /** 所得税額（基準所得税額） */
  readonly baseTax: number;
  /** 復興特別所得税額 */
  readonly reconstructionTax: number;
  /** 所得税 + 復興特別所得税（100 円未満切捨て） */
  readonly total: number;
}

export interface ResidentTaxResult {
  readonly deductions: DeductionBreakdown;
  /** 課税総所得金額（1,000 円未満切捨て） */
  readonly taxableIncome: number;
  /** 調整控除額 */
  readonly adjustmentCredit: number;
  /** 調整控除後・寄附金税額控除前の所得割額（所得割が非課税のときは 0） */
  readonly incomeLevyBeforeDonation: number;
  /** 所得割の非課税限度額（地方税法 附則第3条の3。入力した家族の人数から計算） */
  readonly incomeLevyExemptLimit: number;
  /** 合計所得金額が非課税限度額以下で、所得割が課されないか */
  readonly incomeLevyExempt: boolean;
  /** 非課税限度額を少し超える場合の所得割の減額（同条第2項・第5項）。なければ 0。 */
  readonly exemptionReduction: number;
  /** 寄附金税額控除（基本分） */
  readonly donationCreditBasic: number;
  /** 寄附金税額控除（特例分） */
  readonly donationCreditSpecial: number;
  /** 所得割額（100 円未満切捨て） */
  readonly incomeLevy: number;
  /** 均等割 + 森林環境税 */
  readonly perCapita: number;
  readonly total: number;
}

/** ある前提での税額の概算 */
export interface TaxEstimate {
  /** 給与所得（所得金額調整控除を引いた後） */
  readonly salaryIncome: number;
  /** 給与所得から引いた所得金額調整控除額（対象外なら 0） */
  readonly incomeAdjustment: number;
  /** 事業所得または雑所得（青色申告特別控除後） */
  readonly businessIncome: number;
  /** 適用した青色申告特別控除額 */
  readonly blueDeductionApplied: number;
  /** 合計所得金額 */
  readonly totalIncome: number;
  readonly incomeTax: IncomeTaxResult;
  readonly residentTax: ResidentTaxResult;
  /** 所得税（復興特別所得税込み）+ 住民税 */
  readonly totalTax: number;
}

/** 税の軽減額 */
export interface Saving {
  readonly incomeTax: number;
  readonly residentTax: number;
  readonly total: number;
}

export interface FurusatoMeasure {
  /** 自己負担が概ね 2,000 円で済む寄附額の上限の目安（年間、寄附済み分を含む） */
  readonly limit: number;
  /** 寄附済みの額 */
  readonly paid: number;
  /** 上限までの残り */
  readonly remaining: number;
  /** 上限まで寄附した場合に、いまの状態から追加で減る税額 */
  readonly saving: Saving;
  /** 上限まで寄附した場合の実質的な自己負担額（年間の寄附総額 − 寄附による税の軽減総額） */
  readonly outOfPocket: number;
  /** 「まとめて実行した場合」（measures.combined）の掛金を追加した後の上限の目安 */
  readonly limitAfterOtherMeasures: number;
  readonly notes: readonly string[];
}

export interface ContributionMeasure {
  /** この策を計算できたか。false のときは notes に理由が入る。 */
  readonly applicable: boolean;
  /** 年間の上限額 */
  readonly annualLimit: number;
  /** 支払済みの額 */
  readonly paid: number;
  /** 上限までの残り枠 */
  readonly remaining: number;
  /** 軽減額の計算に使った追加拠出額（追加で支払う額） */
  readonly additional: number;
  /**
   * 追加額がこの額を超えても税額はそれ以上減らない、という額。
   * 残り枠（か指定された追加額）いっぱいまで税額が減るときは null。
   */
  readonly noEffectBeyond: number | null;
  readonly saving: Saving;
  readonly notes: readonly string[];
}

/** ふるさと納税と掛金の追加をまとめて実行した場合 */
export interface CombinedMeasure {
  /** この合計に iDeCo の追加を含めているか */
  readonly includesIdeco: boolean;
  /** iDeCo に追加する額（含めていなければ 0） */
  readonly idecoAdditional: number;
  /** 小規模企業共済に追加する額（対象外なら 0） */
  readonly kyosaiAdditional: number;
  /** 掛金を追加した後の上限まで寄附する場合の、ふるさと納税の追加額 */
  readonly furusatoAdditional: number;
  /** 追加で支払う額の合計 */
  readonly totalPayment: number;
  /** まとめて実行した場合の税額（まとめて再計算した値） */
  readonly totalTax: number;
  /** 現状からの軽減額（まとめて再計算した値。各策の軽減額の単純な合計ではない） */
  readonly saving: Saving;
  /** saving のうち、掛金（iDeCo・小規模企業共済）の追加による分 */
  readonly savingFromContributions: Saving;
  /** saving のうち、ふるさと納税の追加による分（寄附額から自己負担を引いた額が税から引かれるもので、手取りは増えない） */
  readonly savingFromFurusato: Saving;
  readonly notes: readonly string[];
}

export interface BlueReturnOption {
  readonly level: BlueReturn;
  /** 控除額の枠（10 万 / 55 万 / 65 万） */
  readonly deduction: number;
  /** 実際に引ける額（事業所得が枠より小さい場合は所得が限度） */
  readonly deductionApplied: number;
  readonly totalTax: number;
  /** 現在の区分と比べた軽減額（マイナスは増税） */
  readonly savingVsCurrent: Saving;
  readonly current: boolean;
}

/** 国民健康保険料（税）の所得割への影響の目安。料率を入力したときだけ計算する。 */
export interface NationalHealthInsuranceMeasure {
  /** 入力された所得割の料率（パーセント） */
  readonly ratePercent: number;
  /** 所得割の算定基礎（総所得金額等 − 住民税の基礎控除）。現状の値。 */
  readonly baseIncome: number;
  /** 現状の所得割額の目安（賦課限度額・均等割・平等割・軽減は考慮しない） */
  readonly incomeLevy: number;
  /** 青色申告特別控除の区分ごとの所得割額の目安と、現在の区分との差（プラスは減額）。対象外なら空。 */
  readonly blueReturnOptions: readonly {
    readonly level: BlueReturn;
    readonly baseIncome: number;
    readonly incomeLevy: number;
    readonly reductionVsCurrent: number;
    readonly current: boolean;
  }[];
  readonly notes: readonly string[];
}

export interface BlueReturnMeasure {
  readonly applicable: boolean;
  readonly current: BlueReturn;
  readonly options: readonly BlueReturnOption[];
  readonly notes: readonly string[];
}

export interface SetsuzeiResult {
  readonly year: number;
  readonly label: string;
  readonly residentTaxLabel: string;
  /** 正規化した入力（省略値を埋めたもの） */
  readonly input: Required<Omit<TaxInput, "spouse" | "dependents" | "idecoAnnualLimit" | "idecoAdditional" | "kyosaiAdditional" | "nhiIncomeRatePercent">> & {
    readonly spouse: SpouseInput | null;
    readonly dependents: Required<DependentsInput>;
  };
  /** 現状（入力どおり）の税額の概算 */
  readonly baseline: TaxEstimate;
  readonly measures: {
    readonly furusato: FurusatoMeasure;
    readonly ideco: ContributionMeasure;
    readonly kyosai: ContributionMeasure;
    readonly blueReturn: BlueReturnMeasure;
    /**
     * 年内に実行しやすいものをまとめて実行した場合（青色申告の区分は現在のまま）。
     * ふるさと納税と小規模企業共済の追加。iDeCo の追加は、idecoAdditional を指定したときだけ含める。
     */
    readonly combined: CombinedMeasure;
    /**
     * iDeCo の追加（残り枠）も年内に間に合う場合の合計。
     * combined にすでに含めているか、iDeCo の追加で税額が変わらないときは null。
     */
    readonly combinedWithIdeco: CombinedMeasure | null;
    /** 国民健康保険料への影響の目安。nhiIncomeRatePercent を指定しなければ null。 */
    readonly nationalHealthInsurance: NationalHealthInsuranceMeasure | null;
  };
  /** 医療費控除・生命保険料控除の計算の内訳 */
  readonly deductionDetails: {
    readonly medical: MedicalDeductionResult;
    readonly lifeInsurance: LifeInsuranceResult;
  };
  /** 現状（baseline）の金額を、確定申告書（第一表・第二表）と住民税の欄に当てはめたもの */
  readonly filing: FilingGuide;
  /** 計算上の注意（入力に応じて出るもの） */
  readonly warnings: readonly string[];
  /** 免責 */
  readonly disclaimer: string;
}

/** ある年分の、ふるさと納税の上限の目安と計算の途中の値（compareFurusatoLimit の結果） */
export interface FurusatoYearLimit {
  /** 年分の表記（「令和8年分」など） */
  readonly label: string;
  /** 対応する住民税の年度（「令和9年度」など） */
  readonly residentTaxLabel: string;
  /** 上限の目安（1,000 円未満切り捨て。出せない場合は 0） */
  readonly limit: number;
  /** 給与所得（所得金額調整控除後） */
  readonly salaryIncome: number;
  /** 所得税の基礎控除額 */
  readonly incomeTaxBasicDeduction: number;
  /** 住民税の課税総所得金額 */
  readonly residentTaxableIncome: number;
  /** 住民税の所得割額（調整控除後、寄附金税額控除前） */
  readonly incomeLevy: number;
  /** 特例分の上限（所得割額の 20%） */
  readonly specialCap: number;
  /** 人的控除差調整額 */
  readonly adjustmentAmount: number;
  /** 特例分の割合を決める金額（住民税の課税総所得金額 − 人的控除差調整額） */
  readonly rateBase: number;
  /** 特例分の割合（10 万分率。84,895 = 84.895%） */
  readonly specialRatePer100k: number;
  /** 所得割が非課税か、非課税限度額による減額を受ける（上限の目安を出さない） */
  readonly exempt: boolean;
}

/** ふるさと納税の上限の目安の、令和 8 年分と令和 7 年分の比較 */
export interface FurusatoComparison {
  readonly current: FurusatoYearLimit;
  readonly previous: FurusatoYearLimit;
  /** current.limit − previous.limit（マイナスなら下がった） */
  readonly difference: number;
  /** 変わった理由。specialRate = 特例分の割合の区分、incomeLevy = 住民税の所得割額 */
  readonly reasons: readonly ("specialRate" | "incomeLevy")[];
  readonly notes: readonly string[];
}

/** 医療費控除の方法。none は控除なし */
export type MedicalMethod = "normal" | "selfMedication" | "none";

/** 医療費控除（通常）とセルフメディケーション税制の比較 */
export interface MedicalDeductionResult {
  /** 医療費かセルフメディケーション税制の対象の購入費が入力されたか */
  readonly applicable: boolean;
  /** 税額が少なくなるほう（同じなら通常の医療費控除）。どちらも控除が 0 なら none */
  readonly method: MedicalMethod;
  readonly normal: {
    /** 支払った医療費 − 補てんされる金額 */
    readonly netExpenses: number;
    /** 足切り額（10 万円か、総所得金額等の 5% の小さいほう） */
    readonly floor: number;
    readonly deduction: number;
    /** この方法を選んだ場合の税額（所得税 + 住民税） */
    readonly totalTax: number;
  };
  readonly selfMedication: {
    readonly expenses: number;
    readonly deduction: number;
    readonly totalTax: number;
  };
  /** 選んだ方法で、医療費控除がない場合より減る税額 */
  readonly saving: Saving;
  /** 選ばなかった方法と比べて少ない税額（0 以上） */
  readonly advantage: number;
  readonly notes: readonly string[];
}

/** 生命保険料控除の区分ごとの控除額 */
export interface LifeInsuranceAmounts {
  /** 一般の生命保険料（新・旧） */
  readonly life: number;
  /** 介護医療保険料 */
  readonly medicalCare: number;
  /** 個人年金保険料（新・旧） */
  readonly pension: number;
  readonly total: number;
}

export interface LifeInsuranceResult {
  readonly applicable: boolean;
  /** 令和 8 年分の 23 歳未満の扶養親族の特例（新生命保険料の上限 6 万円）を使ったか */
  readonly under23Rule: boolean;
  /** 一般の生命保険料で、旧契約だけを申告するほうが控除が大きいか（新契約の分は申告書に書かない） */
  readonly lifeOldOnly: boolean;
  /** 個人年金保険料で、旧契約だけを申告するほうが控除が大きいか */
  readonly pensionOldOnly: boolean;
  readonly incomeTax: LifeInsuranceAmounts;
  readonly residentTax: LifeInsuranceAmounts;
  /** 生命保険料控除がない場合より減る税額 */
  readonly saving: Saving;
  readonly notes: readonly string[];
}

/** 確定申告書のどこに書くか: 1 欄分 */
export interface FilingEntry {
  /** first = 第一表、second = 第二表、blue = 青色申告決算書、resident = 第二表の「住民税・事業税に関する事項」 */
  readonly sheet: "first" | "second" | "blue" | "resident";
  /** 欄の番号（「㉘」など）。番号のない欄は null */
  readonly field: string | null;
  /** 申告書に印刷されている欄の名前（日本語のまま） */
  readonly label: string;
  /** 書く金額。金額ではない欄（選ぶもの・書く事項）は null */
  readonly amount: number | null;
  /** 何の金額か・書き方の補足（言語は calculate の locale に従う） */
  readonly note: string;
}

export interface FilingGuide {
  /** 当てはめた様式の名前（「令和8年分の所得税及び復興特別所得税の確定申告書（案）」など） */
  readonly form: string;
  /** 様式が案（確定前）か */
  readonly draft: boolean;
  /** 様式の出典 */
  readonly sourceUrl: string;
  readonly entries: readonly FilingEntry[];
  readonly notes: readonly string[];
}
