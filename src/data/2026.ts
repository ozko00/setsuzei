/**
 * 令和 8 年分（2026 年分）の税制データ。
 *
 * - 所得税は令和 8 年分、住民税は令和 8 年中の所得に課される令和 9 年度分。
 * - 各数値には一次情報の URL を付けている。すべて 2026-11-24 に閲覧して確認した。
 * - 令和 8 年度税制改正（基礎控除・給与所得控除の引上げ等）は令和 8 年 12 月 1 日施行で、
 *   令和 8 年分の所得税から適用される。
 *   https://www.nta.go.jp/users/gensen/2026kiso/index.htm
 */
import type { Source, TaxYearData } from "./types.js";

const MAN = 10_000;

export const taxYear2026: TaxYearData = {
  year: 2026,
  label: "令和8年分",
  residentTaxLabel: "令和9年度",

  // 給与所得（令和 8 年分・令和 9 年分）
  // 出典: 国税庁 No.1410 給与所得控除（同ページ掲載の計算式・計算フォームと同じ手順）
  // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm
  salary: {
    // 収入 74 万 1,000 円未満は給与所得なし
    zeroUpTo: 740_999,
    // 74 万 1,000 円以上 219 万 1,000 円未満: 収入 − 74 万円
    flatBelow: 2_191_000,
    flatDeduction: 740_000,
    // 219 万 1,000 円以上 220 万円未満は固定額（同ページ 注2）
    fixedSteps: [
      { below: 2_193_000, income: 1_451_000 },
      { below: 2_196_000, income: 1_453_000 },
      { below: 2_200_000, income: 1_456_000 },
    ],
    bands: [
      // 220 万円以上 360 万円未満: (収入 ÷ 4 を千円未満切捨て) × 4 × 70% − 8 万円
      { below: 3_600_000, roundUnit: 4_000, ratePercent: 70, minus: 80_000 },
      // 360 万円以上 660 万円未満: (収入 ÷ 4 を千円未満切捨て) × 4 × 80% − 44 万円
      { below: 6_600_000, roundUnit: 4_000, ratePercent: 80, minus: 440_000 },
      // 660 万円以上 850 万円未満: 収入 × 90% − 110 万円
      { below: 8_500_000, roundUnit: 1, ratePercent: 90, minus: 1_100_000 },
    ],
    // 850 万円以上: 収入 − 195 万円（給与所得控除の上限）
    maxDeduction: 1_950_000,
    // 所得金額調整控除（子ども・特別障害者等を有する者等）
    // {給与等の収入金額（1,000 万円超は 1,000 万円）− 850 万円} × 10%（1 円未満切上げ）を給与所得から引く。
    // 対象: 本人が特別障害者 / 23 歳未満の扶養親族がいる / 特別障害者の同一生計配偶者・扶養親族がいる
    // 出典: 国税庁 No.1411 所得金額調整控除［令和8年4月1日現在法令等］（2026-11-25 閲覧）
    // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1411.htm
    // 根拠: 租税特別措置法 第41条の3の11 第1項 https://laws.e-gov.go.jp/law/332AC0000000026
    // 住民税も、総所得金額を所得税の計算の例で求める（地方税法 第313条第2項）ので同じ額が引かれる。
    // 給与所得と年金所得の双方がある場合の控除（同条第2項）は、年金を扱わないので実装していない。
    incomeAdjustment: { revenueAbove: 8_500_000, revenueCap: 10_000_000, ratePercent: 10 },
  },

  // 青色申告特別控除: 10 万円 / 55 万円 / 65 万円（0 は白色申告）
  // 出典: 国税庁 No.2072 青色申告特別控除
  // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2072.htm
  blueReturnDeductions: [0, 10 * MAN, 55 * MAN, 65 * MAN],

  family: {
    // 控除対象配偶者の合計所得金額: 62 万円以下（令和 8 年分から）
    // 出典: 国税庁 No.1191 配偶者控除
    // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1191.htm
    // 住民税も、同一生計配偶者・扶養親族の所得要件は令和 9 年度分から 62 万円以下
    // 出典: 地方税法 第292条第1項第7号・第9号（令和 9 年 1 月 1 日施行の条文）と、
    //       地方税法等の一部を改正する法律（令和8年法律第2号）附則第3条第2項・第11条第2項
    //       （令和 9 年度以後の年度分の個人住民税から適用）
    // https://laws.e-gov.go.jp/law/325AC0000000226/20270101_508AC0000000002
    // （API: https://laws.e-gov.go.jp/api/2/law_data/325AC0000000226?asof=2027-01-01）
    // 参考: 江戸川区「令和9年度 税制改正の住民税における主な改正点」
    // https://www.city.edogawa.tokyo.jp/e013/kurashi/zeikin/juminzei/r9kaisei.html
    spouseDeductionIncomeLimit: 62 * MAN,
    // 配偶者特別控除の対象: 62 万円超 133 万円以下
    // 出典: 国税庁 No.1195 配偶者特別控除 / 地方税法 第314条の2第1項第10号の2
    // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1195.htm
    spouseSpecialIncomeLimit: 133 * MAN,
    // 納税者本人の合計所得金額の区分: 900 万以下 / 950 万以下 / 1,000 万以下
    // 出典: 国税庁 No.1191
    taxpayerTiers: [900 * MAN, 950 * MAN, 1_000 * MAN],
  },

  incomeTax: {
    // 所得税の速算表（平成 27 年分以後）
    // 出典: 国税庁 No.2260 所得税の税率
    // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm
    brackets: [
      { upTo: 1_949_000, ratePercent: 5, deduction: 0 },
      { upTo: 3_299_000, ratePercent: 10, deduction: 97_500 },
      { upTo: 6_949_000, ratePercent: 20, deduction: 427_500 },
      { upTo: 8_999_000, ratePercent: 23, deduction: 636_000 },
      { upTo: 17_999_000, ratePercent: 33, deduction: 1_536_000 },
      { upTo: 39_999_000, ratePercent: 40, deduction: 2_796_000 },
      { upTo: null, ratePercent: 45, deduction: 4_796_000 },
    ],

    // 復興特別所得税: 基準所得税額の 2.1%
    // （防衛特別所得税の創設と復興特別所得税率の引下げは令和 9 年以後。令和 8 年分は 2.1% のまま）
    // 出典: 国税庁 No.2260 ※2・※3 / 復興財源確保法 第13条
    // https://laws.e-gov.go.jp/law/423AC0000000117
    reconstructionPermille: 21,

    // 基礎控除（令和 8 年分・令和 9 年分）
    // 出典: 国税庁 No.1199 基礎控除
    // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm
    basicDeduction: [
      { upTo: 489 * MAN, value: 104 * MAN },
      { upTo: 655 * MAN, value: 67 * MAN },
      { upTo: 2_350 * MAN, value: 62 * MAN },
      { upTo: 2_400 * MAN, value: 48 * MAN },
      { upTo: 2_450 * MAN, value: 32 * MAN },
      { upTo: 2_500 * MAN, value: 16 * MAN },
      { upTo: null, value: 0 },
    ],

    // 配偶者控除
    // 出典: 国税庁 No.1191 配偶者控除
    spouseDeduction: {
      general: [38 * MAN, 26 * MAN, 13 * MAN],
      elderly: [48 * MAN, 32 * MAN, 16 * MAN],
    },

    // 配偶者特別控除（令和 8 年分以降）
    // 出典: 国税庁 No.1195 配偶者特別控除
    spouseSpecialDeduction: [
      { upTo: 95 * MAN, value: [38 * MAN, 26 * MAN, 13 * MAN] },
      { upTo: 100 * MAN, value: [36 * MAN, 24 * MAN, 12 * MAN] },
      { upTo: 105 * MAN, value: [31 * MAN, 21 * MAN, 11 * MAN] },
      { upTo: 110 * MAN, value: [26 * MAN, 18 * MAN, 9 * MAN] },
      { upTo: 115 * MAN, value: [21 * MAN, 14 * MAN, 7 * MAN] },
      { upTo: 120 * MAN, value: [16 * MAN, 11 * MAN, 6 * MAN] },
      { upTo: 125 * MAN, value: [11 * MAN, 8 * MAN, 4 * MAN] },
      { upTo: 130 * MAN, value: [6 * MAN, 4 * MAN, 2 * MAN] },
      { upTo: 133 * MAN, value: [3 * MAN, 2 * MAN, 1 * MAN] },
    ],

    // 扶養控除
    // 出典: 国税庁 No.1180 扶養控除
    // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1180.htm
    dependents: {
      general: 38 * MAN,
      specific: 63 * MAN,
      elderly: 48 * MAN,
      elderlyCohabiting: 58 * MAN,
    },

    // 寄附金控除（ふるさと納税）: (寄附額 − 2,000 円) を所得控除。対象は総所得金額等の 40% まで
    // 出典: 国税庁 No.1155 ふるさと納税（寄附金控除）
    // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1155.htm
    donation: { floor: 2_000, incomeCapPercent: 40 },
  },

  residentTax: {
    // 所得割 10%（道府県民税 4% + 市町村民税 6%。指定都市は 2% + 8% で合計は同じ）
    // 出典: 総務省 個人住民税 / 地方税法 第314条の3
    // https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_06.html
    ratePercent: 10,
    // 均等割 4,000 円（道府県民税 1,000 円 + 市町村民税 3,000 円）、森林環境税 1,000 円
    // 出典: 総務省 個人住民税（自治体が独自に上乗せしている場合がある）
    perCapita: 4_000,
    forestTax: 1_000,

    // 所得割の非課税限度額（全国一律）
    //   35 万円 ×（同一生計配偶者 + 扶養親族の数 + 1）+ 10 万円
    //   同一生計配偶者か扶養親族がいる場合は、さらに + 32 万円
    //   扶養親族は「16 歳未満の者」と控除対象扶養親族。総所得金額等がこの額以下なら所得割を課さない。
    //   限度額を少し超える場合は、税引後の所得が限度額を下回らないよう所得割を減額する（同条第2項・第5項）。
    // 出典: 地方税法 附則第3条の3（令和 9 年 1 月 1 日時点の条文で確認）
    // https://laws.e-gov.go.jp/law/325AC0000000226/20270101_508AC0000000002
    incomeLevyExemption: { perPerson: 35 * MAN, addition: 10 * MAN, familyAddition: 32 * MAN },
    // 均等割の非課税限度額は、基本額 35 万円・加算額 21 万円を上限に、生活保護の級地に応じた率を
    // 掛けて市区町村の条例で定める（1 級地でこの額）。級地で変わるので計算には使わない。
    // 出典: 地方税法 第295条第3項、地方税法施行令 第47条の3（令和 9 年 1 月 1 日時点の条文で確認）
    // https://laws.e-gov.go.jp/law/325CO0000000245/20270101_508CO0000000083
    perCapitaExemptionMax: { perPerson: 35 * MAN, addition: 10 * MAN, familyAddition: 21 * MAN },
    // 出典: 地方税法 第295条第1項第2号
    specialExemptIncomeLimit: 135 * MAN,

    // 基礎控除（住民税は令和 8 年度税制改正でも据え置き）
    // 出典: 地方税法 第314条の2第2項
    // https://laws.e-gov.go.jp/law/325AC0000000226
    basicDeduction: [
      { upTo: 2_400 * MAN, value: 43 * MAN },
      { upTo: 2_450 * MAN, value: 29 * MAN },
      { upTo: 2_500 * MAN, value: 15 * MAN },
      { upTo: null, value: 0 },
    ],

    // 配偶者控除
    // 出典: 地方税法 第314条の2第1項第10号
    spouseDeduction: {
      general: [33 * MAN, 22 * MAN, 11 * MAN],
      elderly: [38 * MAN, 26 * MAN, 13 * MAN],
    },

    // 配偶者特別控除
    // 出典: 地方税法 第314条の2第1項第10号の2
    //   100 万円以下: 33 万円
    //   100 万円超 130 万円以下: 38 万円 −（93 万 1 円を超える部分を「5 万円の整数倍 − 3 万円」に切り下げた額）
    //   130 万円超: 3 万円
    spouseSpecialDeduction: {
      fullUpTo: 100 * MAN,
      full: 33 * MAN,
      reducedUpTo: 130 * MAN,
      base: 38 * MAN,
      threshold: 930_001,
      stepUnit: 5 * MAN,
      stepOffset: 3 * MAN,
      minimum: 3 * MAN,
    },

    // 扶養控除（一般 33 万円、特定 45 万円、老人 38 万円、同居老親等 45 万円）
    // 出典: 地方税法 第314条の2第1項第11号・第4項
    dependents: {
      general: 33 * MAN,
      specific: 45 * MAN,
      elderly: 38 * MAN,
      elderlyCohabiting: 45 * MAN,
    },

    // 調整控除
    // 出典: 地方税法 第314条の6（市町村民税 3% + 同旨の道府県民税 2% = 5%）
    adjustmentCredit: {
      taxpayerIncomeLimit: 2_500 * MAN,
      basicDifference: 5 * MAN,
      spouseDifference: {
        general: [5 * MAN, 4 * MAN, 2 * MAN],
        elderly: [10 * MAN, 6 * MAN, 3 * MAN],
      },
      dependentDifference: {
        general: 5 * MAN,
        specific: 18 * MAN,
        elderly: 10 * MAN,
        elderlyCohabiting: 13 * MAN,
      },
      threshold: 200 * MAN,
      ratePercent: 5,
      minimumBase: 5 * MAN,
    },

    // 寄附金税額控除（ふるさと納税）
    // 出典: 総務省 ふるさと納税ポータルサイト「税金の控除について」
    // https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/furusato/mechanism/deduction.html
    // 出典: 地方税法 第314条の7第1項・第11項（道府県民税は第37条の2）
    // 出典: 地方税法 附則第5条の6（復興特別所得税を織り込んだ特例分の割合。
    //       85% → 84.895%、80% → 79.79%、70% → 69.58%、67% → 66.517%、57% → 56.307%、
    //       50% → 49.16%、45% → 44.055%。令和 20 年度分まで）
    //
    // 令和 9 年 1 月 1 日施行の改正で、特例分に定額の上限（道府県民税 77 万 2 千円 +
    // 市町村民税 115 万 8 千円 = 193 万円）が加わるが、適用は令和 10 年度分（2027 年中の寄附）から
    // （令和8年法律第2号 附則第3条第9項・第11条第8項）。令和 9 年度分には適用がないので入れていない。
    donation: {
      floor: 2_000,
      basicRatePercent: 10,
      incomeCapPercent: 30,
      specialCapPercent: 20,
      // 第314条の7第11項第1号の表（85% = 100% − 10% − 5% …）に対応する所得税率。
      // 計算では 100% − 10% − 所得税率 × 1.021 とし、附則第5条の6 の割合と一致する（テストで確認）。
      specialRateBrackets: [
        { upTo: 195 * MAN, value: 5 },
        { upTo: 330 * MAN, value: 10 },
        { upTo: 695 * MAN, value: 20 },
        { upTo: 900 * MAN, value: 23 },
        { upTo: 1_800 * MAN, value: 33 },
        { upTo: 4_000 * MAN, value: 40 },
        { upTo: null, value: 45 },
      ],
      // 同項第2号
      specialRateWhenNegativePercent: 90,
      // 同項第1号: 人的控除差調整額 = 第314条の6第1号イの金額 +（所得税の基礎控除額 − 48 万円）
      basicDeductionReference: 48 * MAN,
    },
  },

  ideco: {
    // 令和 8 年分（2026 年 1〜12 月に納付する掛金）に適用される拠出限度額。
    // 第 1 号 月額 75,000 円・第 2 号 月額 62,000 円への引上げは 2026 年 12 月施行で、
    // 12 月分の掛金は翌年 1 月に納付するため、2026 年分の控除には影響しない。
    // 出典: 国民年金基金連合会の案内「2026年12月分（2027年１月引き落とし分）からiDeCoの拠出限度額が引き上げられます」
    // https://www.ideco-koushiki.jp/library/pdf/notice202612-02.pdf
    // 出典: 厚生労働省 Web マガジン「2026年12月からiDeCoがパワーアップ！ 制度改正の3つのポイント」
    // https://www.mhlw.go.jp/web_magazine/column/20261020.html
    // 出典: iDeCo 公式サイト「iDeCo をはじめるまでの 4 つのポイント」（掛金は 12 月分〜翌年 11 月分、納付は 1〜12 月）
    // https://www.ideco-koushiki.jp/start/
    selfEmployedMonthlyLimit: 68_000,
    employeeWithoutPensionMonthlyLimit: 23_000,
  },

  kyosai: {
    // 小規模企業共済の掛金月額: 1,000 円〜70,000 円。全額が小規模企業共済等掛金控除。
    // 1 年以内の前納掛金も控除できる。
    // 出典: 中小機構「小規模企業共済の掛金」
    // https://kyosai-web.smrj.go.jp/customer/skyosai/installment/index.html
    // 出典: 国税庁 No.1135 小規模企業共済等掛金控除
    // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1135.htm
    monthlyLimit: 70_000,
  },

  medical: {
    // 医療費控除 =（支払った医療費 − 保険金などで補てんされる金額）− 10 万円（総所得金額等が 200 万円未満なら
    // 総所得金額等の 5%）。最高 200 万円。住民税も同じ式（前年の総所得金額等の 5% と 10 万円の小さいほう）。
    // 出典: 国税庁 No.1120 医療費を支払ったとき（医療費控除）[令和8年4月1日現在法令等]
    // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1120.htm
    // 出典: 地方税法 第314条の2第1項第2号（2027-01-01 時点の条文で確認）
    // https://laws.e-gov.go.jp/law/325AC0000000226/20270101_508AC0000000002
    floorMax: 10 * MAN,
    floorIncomePercent: 5,
    cap: 200 * MAN,
    selfMedication: {
      // セルフメディケーション税制: 特定一般用医薬品等購入費のうち 12,000 円を超える部分（最高 88,000 円）。
      // 一定の取組（健康診断・予防接種など）をしている人だけ。通常の医療費控除との選択で、併用はできない。
      // 出典: 国税庁 No.1129 [令和8年4月1日現在法令等]
      // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1129.htm
      // 住民税: 地方税法 附則第4条の5（2027-01-01 時点の条文は「平成三十年度以後の各年度分」で、令和 9 年度分も対象）
      floor: 12_000,
      cap: 88_000,
    },
  },

  lifeInsurance: {
    // 所得税の生命保険料控除。新契約・旧契約の表、新旧両方を申告する区分の上限 4 万円、合計 12 万円。
    // 23 歳未満の扶養親族がいる場合、令和 8 年分と令和 9 年分は新生命保険料の上限が 6 万円（新旧合計も 6 万円）。
    // 端数: 計算した金額の 1 円未満は切り上げる（令和8年分 給与所得者の保険料控除申告書の注記。
    //       確定申告の手引きでは「切り上げて差し支えありません」）。
    // 出典: 国税庁 No.1140 生命保険料控除 [令和8年4月1日現在法令等]
    // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1140.htm
    // 出典: 国税庁 令和8年分 給与所得者の保険料控除申告書
    // https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/gensen/pdf/2026bun_04.pdf
    // 出典: 国税庁 確定申告の手引き（令和7年分）生命保険料控除
    // https://www.nta.go.jp/taxes/shiraberu/shinkoku/tebiki/2025/03/order3/3-3_12.htm
    incomeTax: {
      newContract: [
        { upTo: 20_000, divisor: 1, add: 0 },
        { upTo: 40_000, divisor: 2, add: 10_000 },
        { upTo: 80_000, divisor: 4, add: 20_000 },
        { upTo: null, divisor: 1, add: 40_000 },
      ],
      oldContract: [
        { upTo: 25_000, divisor: 1, add: 0 },
        { upTo: 50_000, divisor: 2, add: 12_500 },
        { upTo: 100_000, divisor: 4, add: 25_000 },
        { upTo: null, divisor: 1, add: 50_000 },
      ],
      combinedCap: 40_000,
      totalCap: 120_000,
      under23: {
        newLife: [
          { upTo: 30_000, divisor: 1, add: 0 },
          { upTo: 60_000, divisor: 2, add: 15_000 },
          { upTo: 120_000, divisor: 4, add: 30_000 },
          { upTo: null, divisor: 1, add: 60_000 },
        ],
        combinedLifeCap: 60_000,
      },
    },
    // 住民税の生命保険料控除。新契約 最高 28,000 円、旧契約 最高 35,000 円、新旧両方で 28,000 円、合計 70,000 円。
    // 23 歳未満の扶養親族の特例は住民税にはない（2027-01-01 時点の条文で確認）。
    // 新旧両方の支払がある区分は、旧契約のみの控除額が 28,000 円を超えれば旧契約のみの額（所得税とは別に選ぶ）。
    // 出典: 小牧市「個人の市県民税の計算方法」 https://www.city.komaki.aichi.jp/admin/soshiki/soumu/kazei/7/1/48422.html
    // 出典: 地方税法 第314条の2第1項第5号
    // https://laws.e-gov.go.jp/law/325AC0000000226/20270101_508AC0000000002
    residentTax: {
      newContract: [
        { upTo: 12_000, divisor: 1, add: 0 },
        { upTo: 32_000, divisor: 2, add: 6_000 },
        { upTo: 56_000, divisor: 4, add: 14_000 },
        { upTo: null, divisor: 1, add: 28_000 },
      ],
      oldContract: [
        { upTo: 15_000, divisor: 1, add: 0 },
        { upTo: 40_000, divisor: 2, add: 7_500 },
        { upTo: 70_000, divisor: 4, add: 17_500 },
        { upTo: null, divisor: 1, add: 35_000 },
      ],
      combinedCap: 28_000,
      totalCap: 70_000,
    },
  },
};

/** README と `setsuzei --sources` に出す出典一覧 */
export const sources2026: readonly Source[] = [
  {
    title: "国税庁 令和8年度税制改正による所得税の基礎控除の引上げ等について",
    url: "https://www.nta.go.jp/users/gensen/2026kiso/index.htm",
  },
  {
    title: "国税庁 No.2260 所得税の税率",
    url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm",
  },
  {
    title: "国税庁 No.1199 基礎控除",
    url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm",
  },
  {
    title: "国税庁 No.1410 給与所得控除",
    url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm",
  },
  {
    title: "国税庁 No.2072 青色申告特別控除",
    url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2072.htm",
  },
  {
    title: "国税庁 No.1135 小規模企業共済等掛金控除",
    url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1135.htm",
  },
  {
    title: "国税庁 No.1155 ふるさと納税（寄附金控除）",
    url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1155.htm",
  },
  {
    title: "国税庁 No.2070 青色申告制度（承認申請の期限。ブラウザ版の説明ページで参照）",
    url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2070.htm",
  },
  {
    title: "国税庁 No.1411 所得金額調整控除（根拠: 租税特別措置法 第41条の3の11。住民税は地方税法 第313条第2項で同じ計算）",
    url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1411.htm",
  },
  {
    title: "国税庁 No.1191 配偶者控除",
    url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1191.htm",
  },
  {
    title: "国税庁 No.1195 配偶者特別控除",
    url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1195.htm",
  },
  {
    title: "国税庁 No.1180 扶養控除",
    url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1180.htm",
  },
  {
    title: "総務省 個人住民税",
    url: "https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_06.html",
  },
  {
    title: "総務省 ふるさと納税ポータルサイト 税金の控除について",
    url: "https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/furusato/mechanism/deduction.html",
  },
  {
    title: "e-Gov 地方税法（第20条の4の2、第314条の2、第314条の3、第314条の6、第314条の7、附則第5条の6）",
    url: "https://laws.e-gov.go.jp/law/325AC0000000226",
  },
  {
    title:
      "e-Gov 地方税法 令和9年1月1日施行の条文（第292条第1項第7号・第9号: 配偶者・扶養親族の所得要件 62 万円、第295条: 非課税の範囲、附則第3条の3: 所得割の非課税限度額）と令和8年法律第2号 附則",
    url: "https://laws.e-gov.go.jp/law/325AC0000000226/20270101_508AC0000000002",
  },
  {
    title: "e-Gov 地方税法施行令 令和9年1月1日施行の条文（第47条の3: 均等割の非課税限度額の基準。注意の表示にだけ使用）",
    url: "https://laws.e-gov.go.jp/law/325CO0000000245/20270101_508CO0000000083",
  },
  {
    title: "e-Gov 復興財源確保法（第13条）",
    url: "https://laws.e-gov.go.jp/law/423AC0000000117",
  },
  {
    title: "e-Gov 国民健康保険法施行令（第29条の7: 保険料の所得割は基礎控除後の総所得金額等に按分。国民健康保険税は地方税法 第703条の4）",
    url: "https://laws.e-gov.go.jp/law/333CO0000000362",
  },
  {
    title: "江戸川区 令和9年度 税制改正の住民税における主な改正点（給与収入への換算の参考）",
    url: "https://www.city.edogawa.tokyo.jp/e013/kurashi/zeikin/juminzei/r9kaisei.html",
  },
  {
    title: "厚生労働省 2026年12月からiDeCoがパワーアップ！ 制度改正の3つのポイント",
    url: "https://www.mhlw.go.jp/web_magazine/column/20261020.html",
  },
  {
    title: "iDeCo公式サイト iDeCoをはじめるまでの4つのポイント",
    url: "https://www.ideco-koushiki.jp/start/",
  },
  {
    title: "iDeCo公式サイト iDeCoの特徴（原則 60 歳まで引き出せない、手数料がかかる、課税所得がなければ所得控除は受けられない）",
    url: "https://www.ideco-koushiki.jp/guide/",
  },
  {
    title: "iDeCo公式サイト iDeCoの加入資格・掛金・受取方法等（掛金額の変更は 12 月分〜翌年 11 月分の 1 年に 1 回）",
    url: "https://www.ideco-koushiki.jp/guide/structure.html",
  },
  {
    title: "国民年金基金連合会 掛金の年単位拠出について（事前の届出が必要、反映は申請の翌月分〈翌々月納付〉以降、前納・追納はできない）",
    url: "https://www.ideco-koushiki.jp/library/pdf/annual_unit_contribution_291201revision.pdf",
  },
  {
    title: "国民年金基金連合会 iDeCoの拠出限度額の引き上げにあわせた掛金額変更の案内（2026年12月分＝2027年1月引き落とし分から引上げ）",
    url: "https://www.ideco-koushiki.jp/library/pdf/notice202612-02.pdf",
  },
  {
    title: "iDeCo公式サイト iDeCoのメリット（受取時は公的年金等控除・退職所得控除の対象）",
    url: "https://www.ideco-koushiki.jp/guide/good.html",
  },
  {
    title: "国税庁 No.1420 退職金を受け取ったとき（確定拠出年金の老齢給付金の一時金は退職所得）",
    url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1420.htm",
  },
  {
    title: "中小機構 小規模企業共済の共済金等の請求（受取時の税法上の取扱い、任意解約は掛金納付月数 240 か月未満で掛金合計額を下回る）",
    url: "https://kyosai-web.smrj.go.jp/customer/skyosai/claim/index.html",
  },
  {
    title: "財務省 令和8年度改正関係資料（納税環境整備関係）: 青色申告特別控除の見直し（令和9年分以後。この計算は令和8年分なので未反映）",
    url: "https://www.mof.go.jp/tax_policy/summary/tins/r8kaiseinoukan.pdf",
  },
  {
    title: "国税庁 令和9年分以後の 10 万円の青色申告特別控除の要件の見直し（リーフレット）",
    url: "https://www.nta.go.jp/taxes/shiraberu/shinkoku/kojin_jigyo/0026004-012.pdf",
  },
  {
    title: "中小機構 小規模企業共済の掛金",
    url: "https://kyosai-web.smrj.go.jp/customer/skyosai/installment/index.html",
  },
  {
    title: "中小機構 小規模企業共済の加入資格",
    url: "https://kyosai-web.smrj.go.jp/skyosai/entry/index_02.html",
  },
  {
    title: "国税庁 No.1120 医療費を支払ったとき（医療費控除）",
    url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1120.htm",
  },
  {
    title: "国税庁 No.1129 特定一般用医薬品等購入費を支払ったとき（医療費控除の特例）【セルフメディケーション税制】",
    url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1129.htm",
  },
  {
    title: "国税庁 No.1140 生命保険料控除（23歳未満の扶養親族がいる場合の令和8年分・9年分の特例を含む）",
    url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1140.htm",
  },
  {
    title: "国税庁 令和8年分 給与所得者の保険料控除申告書（控除額の 1 円未満の端数は切り上げ）",
    url: "https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/gensen/pdf/2026bun_04.pdf",
  },
  {
    title: "国税庁 確定申告の手引き（令和7年分）医療費控除（セルフメディケーション税制を選ぶときは「区分」に 1）",
    url: "https://www.nta.go.jp/taxes/shiraberu/shinkoku/tebiki/2025/03/order3/3-3_24.htm",
  },
  {
    title: "国税庁 確定申告の手引き（令和7年分）生命保険料控除（新旧両方の契約がある場合の計算、1 円未満の端数）",
    url: "https://www.nta.go.jp/taxes/shiraberu/shinkoku/tebiki/2025/03/order3/3-3_12.htm",
  },
  {
    title: "小牧市 個人の市県民税の計算方法（住民税の生命保険料控除: 新旧両方の支払がある場合、旧契約のみの控除額が 28,000 円を超えれば旧契約のみの額）",
    url: "https://www.city.komaki.aichi.jp/admin/soshiki/soumu/kazei/7/1/48422.html",
  },
  {
    title: "国税庁 令和８年分の所得税等の確定申告書（案）（第一表・第二表の欄の番号）",
    url: "https://www.nta.go.jp/taxes/shiraberu/shinkoku/pdf/0026006-063.pdf",
  },
];
