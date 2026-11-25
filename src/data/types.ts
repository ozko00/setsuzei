/**
 * 年分ごとの税制データの型。
 *
 * 金額はすべて円の整数、割合は整数（パーセントなど）で持ち、
 * 計算側で浮動小数の誤差が出ないようにしている。
 */

/** 「◯円以下ならこの値」を上から順に並べた表の 1 行。`upTo: null` は上限なし。 */
export interface Tier<T> {
  readonly upTo: number | null;
  readonly value: T;
}

/** 所得税の速算表の 1 行。税額 = 課税所得 × ratePercent / 100 − deduction */
export interface IncomeTaxBracket {
  /** 課税所得金額がこの金額以下のときに適用。null は上限なし。 */
  readonly upTo: number | null;
  readonly ratePercent: number;
  readonly deduction: number;
}

/** 納税者本人の合計所得金額による 3 区分（900 万以下 / 950 万以下 / 1,000 万以下）の金額。 */
export type ByTaxpayerTier = readonly [number, number, number];

export interface SalaryIncomeRule {
  /** 給与収入がこの金額以下なら給与所得は 0。 */
  readonly zeroUpTo: number;
  /** 給与収入がこの金額未満なら「収入 − flatDeduction」。 */
  readonly flatBelow: number;
  readonly flatDeduction: number;
  /** flatBelow 以上の狭い帯で、給与所得が固定額になる区分。 */
  readonly fixedSteps: readonly { readonly below: number; readonly income: number }[];
  /**
   * 比例計算の区分。
   * 給与所得 = floor(floor(収入 / roundUnit) × roundUnit × ratePercent / 100) − minus
   */
  readonly bands: readonly {
    readonly below: number;
    readonly roundUnit: number;
    readonly ratePercent: number;
    readonly minus: number;
  }[];
  /** 最後の band 以上のときの給与所得控除額（上限）。 */
  readonly maxDeduction: number;
}

export interface DependentAmounts {
  /** 一般の控除対象扶養親族（16〜18 歳、23〜69 歳） */
  readonly general: number;
  /** 特定扶養親族（19〜22 歳） */
  readonly specific: number;
  /** 老人扶養親族（70 歳以上、同居老親等以外） */
  readonly elderly: number;
  /** 老人扶養親族のうち同居老親等 */
  readonly elderlyCohabiting: number;
}

export interface TaxYearData {
  /** 西暦の年分（所得が生じた年） */
  readonly year: number;
  /** 表示用の年分ラベル（例: 令和8年分） */
  readonly label: string;
  /** この年の所得に課される住民税の年度ラベル（例: 令和9年度） */
  readonly residentTaxLabel: string;

  readonly salary: SalaryIncomeRule;

  /** 青色申告特別控除の選択肢（円）。0 は白色申告。 */
  readonly blueReturnDeductions: readonly number[];

  /** 配偶者・扶養親族の所得要件など、所得税と住民税で共通の閾値 */
  readonly family: {
    /** 配偶者控除の対象となる配偶者の合計所得金額の上限 */
    readonly spouseDeductionIncomeLimit: number;
    /** 配偶者特別控除の対象となる配偶者の合計所得金額の上限 */
    readonly spouseSpecialIncomeLimit: number;
    /** 納税者本人の合計所得金額の区分（この金額以下）。最後を超えると配偶者（特別）控除なし。 */
    readonly taxpayerTiers: ByTaxpayerTier;
  };

  readonly incomeTax: {
    readonly brackets: readonly IncomeTaxBracket[];
    /** 復興特別所得税の税率（千分率。21 = 2.1%） */
    readonly reconstructionPermille: number;
    /** 基礎控除（納税者本人の合計所得金額による） */
    readonly basicDeduction: readonly Tier<number>[];
    readonly spouseDeduction: {
      readonly general: ByTaxpayerTier;
      /** 老人控除対象配偶者（70 歳以上） */
      readonly elderly: ByTaxpayerTier;
    };
    /** 配偶者特別控除（配偶者の合計所得金額による） */
    readonly spouseSpecialDeduction: readonly Tier<ByTaxpayerTier>[];
    readonly dependents: DependentAmounts;
    readonly donation: {
      /** 寄附金控除の足切り額 */
      readonly floor: number;
      /** 控除対象となる寄附金の上限（総所得金額等に対するパーセント） */
      readonly incomeCapPercent: number;
    };
  };

  readonly residentTax: {
    /** 所得割の標準税率（道府県民税 + 市町村民税、パーセント） */
    readonly ratePercent: number;
    /** 均等割（道府県民税 + 市町村民税の標準税率） */
    readonly perCapita: number;
    /** 森林環境税（国税。均等割と併せて徴収） */
    readonly forestTax: number;
    readonly basicDeduction: readonly Tier<number>[];
    readonly spouseDeduction: {
      readonly general: ByTaxpayerTier;
      readonly elderly: ByTaxpayerTier;
    };
    /**
     * 配偶者特別控除（納税者本人の合計所得金額 900 万円以下の場合の額を条文の式で求め、
     * 900 万超は 2/3、950 万超は 1/3 を 1 万円単位に切り上げる）
     */
    readonly spouseSpecialDeduction: {
      /** 配偶者の合計所得金額がこの金額以下なら full */
      readonly fullUpTo: number;
      readonly full: number;
      /** fullUpTo 超〜reducedUpTo 以下: base −（threshold を超える部分を stepUnit×n − stepOffset に切り下げた額） */
      readonly reducedUpTo: number;
      readonly base: number;
      readonly threshold: number;
      readonly stepUnit: number;
      readonly stepOffset: number;
      /** reducedUpTo 超のとき */
      readonly minimum: number;
    };
    readonly dependents: DependentAmounts;
    /** 調整控除 */
    readonly adjustmentCredit: {
      /** 合計所得金額がこの金額を超えると調整控除なし */
      readonly taxpayerIncomeLimit: number;
      /** 人的控除額の差: 基礎控除分 */
      readonly basicDifference: number;
      /** 人的控除額の差: 配偶者控除（納税者本人の所得区分別） */
      readonly spouseDifference: {
        readonly general: ByTaxpayerTier;
        readonly elderly: ByTaxpayerTier;
      };
      /** 人的控除額の差: 扶養控除 */
      readonly dependentDifference: DependentAmounts;
      /** 合計課税所得金額がこの金額以下かどうかで計算式が変わる */
      readonly threshold: number;
      /** 控除率（道府県民税 + 市町村民税、パーセント） */
      readonly ratePercent: number;
      /** threshold 超の場合の最低額（率を掛ける前） */
      readonly minimumBase: number;
    };
    /** 寄附金税額控除（ふるさと納税） */
    readonly donation: {
      readonly floor: number;
      /** 基本分の率（パーセント） */
      readonly basicRatePercent: number;
      /** 基本分の対象となる寄附金の上限（総所得金額等に対するパーセント） */
      readonly incomeCapPercent: number;
      /** 特例分の上限（調整控除後の所得割額に対するパーセント） */
      readonly specialCapPercent: number;
      /**
       * 特例分の割合を決める所得税率の表。
       * 「住民税の課税総所得金額 − 人的控除差調整額」がこの金額以下のときの所得税率（パーセント）。
       * 特例分の割合 = 100% − 基本分 10% − 所得税率 ×（1 + 復興特別所得税率）
       */
      readonly specialRateBrackets: readonly Tier<number>[];
      /** 上の差額がマイナスになるときの特例分の割合（パーセント） */
      readonly specialRateWhenNegativePercent: number;
      /** 人的控除差調整額に加える「所得税の基礎控除額 − この金額」（マイナスなら 0） */
      readonly basicDeductionReference: number;
    };
  };

  readonly ideco: {
    /** 国民年金第 1 号被保険者（自営業・フリーランス）の月額上限。国民年金基金・付加保険料と合算。 */
    readonly selfEmployedMonthlyLimit: number;
    /** 企業年金のない会社員（第 2 号被保険者）の月額上限 */
    readonly employeeWithoutPensionMonthlyLimit: number;
  };

  readonly kyosai: {
    /** 小規模企業共済の掛金月額の上限 */
    readonly monthlyLimit: number;
  };
}

/** 出典 1 件 */
export interface Source {
  readonly title: string;
  readonly url: string;
}
