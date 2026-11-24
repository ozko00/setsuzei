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
  /** その他の所得控除の合計（所得税）。医療費控除・生命保険料控除など。 */
  readonly otherDeductions?: number;
  /** その他の所得控除の合計（住民税）。省略時は otherDeductions と同額。 */
  readonly otherDeductionsResident?: number;
  /** iDeCo に追加で拠出する額。省略時は限度額までの残り枠。 */
  readonly idecoAdditional?: number;
  /** 小規模企業共済に追加で支払う額。省略時は年間上限までの残り枠。 */
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
  /** 調整控除後・寄附金税額控除前の所得割額 */
  readonly incomeLevyBeforeDonation: number;
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
  /** 給与所得 */
  readonly salaryIncome: number;
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
  /** iDeCo・小規模企業共済を下の計画どおり追加した場合の上限の目安 */
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
  /** 軽減額の計算に使った追加拠出額 */
  readonly additional: number;
  readonly saving: Saving;
  readonly notes: readonly string[];
}

/** ふるさと納税・iDeCo・小規模企業共済をまとめて実行した場合 */
export interface CombinedMeasure {
  /** iDeCo に追加する額（measures.ideco.additional と同じ） */
  readonly idecoAdditional: number;
  /** 小規模企業共済に追加する額（measures.kyosai.additional と同じ。対象外なら 0） */
  readonly kyosaiAdditional: number;
  /** 掛金を追加した後の上限まで寄附する場合の、ふるさと納税の追加額 */
  readonly furusatoAdditional: number;
  /** 追加で支払う額の合計 */
  readonly totalPayment: number;
  /** 3 つをまとめて実行した場合の税額（まとめて再計算した値） */
  readonly totalTax: number;
  /** 現状からの軽減額（まとめて再計算した値。各策の軽減額の単純な合計ではない） */
  readonly saving: Saving;
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
  readonly input: Required<Omit<TaxInput, "spouse" | "dependents" | "idecoAnnualLimit" | "idecoAdditional" | "kyosaiAdditional">> & {
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
    /** ふるさと納税・iDeCo・小規模企業共済をまとめて実行した場合（青色申告の区分は現在のまま） */
    readonly combined: CombinedMeasure;
  };
  /** 計算上の注意（入力に応じて出るもの） */
  readonly warnings: readonly string[];
  /** 免責 */
  readonly disclaimer: string;
}
