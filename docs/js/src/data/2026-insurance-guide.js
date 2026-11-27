/**
 * 社会保険料が分からない人のための「目安」に使う数値（令和 8 年・2026 年）。
 *
 * 税額の計算（src/core）には使わない。ブラウザ版で、社会保険料の欄を「分からない」にしたときに
 * 仮に置く額を出すためだけのもの（web/guide.ts）。実際の保険料は、加入している制度・自治体・年齢・
 * 世帯の人数・前年の所得で決まるので、ここから出る額は目安であり、幅を付けて示す。
 *
 * 閲覧日: 2026-11-27
 */
export const insuranceGuide2026 = {
    /**
     * 国民年金保険料（第 1 号被保険者・1 人分・月額）。令和 8 年度（令和 8 年 4 月〜令和 9 年 3 月）。
     * 「令和8年4月～令和9年3月 ￥17,920」（令和 7 年度は ￥17,510）
     * https://www.nenkin.go.jp/service/kokunen/hokenryo/hensen.html
     */
    nationalPensionMonthly: 17_920,
    /**
     * 国民健康保険料（税）の料率の例。料率は自治体ごとに違うので、公式ページで令和 8 年度の料率を
     * 確かめられた 3 つの市区を例として使い、その最小〜最大を幅として示す。
     * rate は所得割の料率（10 万分率。7,510 = 7.51%）、perPerson は均等割（1 人あたり・円）、
     * perHousehold は平等割（1 世帯あたり・円）、cap は賦課限度額（円）。
     * 所得割は「前年中の総所得金額等 − 基礎控除 43 万円」に料率を掛ける。
     * 介護分は 40〜64 歳の加入者だけ。子ども・子育て支援金分は令和 8 年度に新設（均等割は 18 歳以上の額）。
     */
    nationalHealthInsurance: {
        /** 所得割の計算で引く基礎控除（合計所得金額が 2,400 万円以下の場合） */
        basicDeduction: 430_000,
        municipalities: [
            {
                // 「【令和8年度の保険料率等】」
                // https://www.city.shinjuku.lg.jp/hoken/hoken01_001028.html
                name: "東京都新宿区",
                medical: { rate: 7_510, perPerson: 47_600, perHousehold: 0, cap: 670_000 },
                support: { rate: 2_800, perPerson: 17_600, perHousehold: 0, cap: 260_000 },
                care: { rate: 2_430, perPerson: 17_800, perHousehold: 0, cap: 170_000 },
                child: { rate: 270, perPerson: 1_873, perHousehold: 0, cap: 30_000 },
            },
            {
                // 「令和8年度の保険料は次の方法で世帯ごとに計算します。」
                // https://www.city.sapporo.jp/hoken-iryo/kokuho/fuka.html
                name: "札幌市",
                medical: { rate: 8_610, perPerson: 20_550, perHousehold: 32_540, cap: 670_000 },
                support: { rate: 2_560, perPerson: 6_330, perHousehold: 10_010, cap: 260_000 },
                care: { rate: 2_330, perPerson: 6_020, perHousehold: 7_550, cap: 170_000 },
                child: { rate: 290, perPerson: 1_100, perHousehold: 1_000, cap: 30_000 },
            },
            {
                // 「令和８年度国民健康保険料の保険料率」
                // https://www.city.fukuoka.lg.jp/hofuku/kokuho/hp/seido/06-02.html
                name: "福岡市",
                medical: { rate: 5_580, perPerson: 19_807, perHousehold: 18_664, cap: 670_000 },
                support: { rate: 3_140, perPerson: 10_441, perHousehold: 9_838, cap: 260_000 },
                care: { rate: 2_610, perPerson: 10_160, perHousehold: 7_751, cap: 170_000 },
                child: { rate: 280, perPerson: 1_039, perHousehold: 911, cap: 30_000 },
            },
        ],
    },
    /**
     * 会社員の給与から引かれる社会保険料の、本人負担の料率（10 万分率）。
     */
    employee: {
        /**
         * 厚生年金保険料率 18.3% の半分。「厚生年金保険料率は18.3％で固定されています」「事業主と被保険者とが半分ずつ負担します」
         * https://www.nenkin.go.jp/service/kounen/hokenryo/hoshu/20150515-01.html
         */
        pension: 9_150,
        /**
         * 協会けんぽの令和 8 年度の健康保険料率（都道府県ごと）の半分。
         * 最低は新潟県 9.21%、最高は佐賀県 10.55%、47 都道府県の中央は 9.88%。
         * https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r08/index.html
         */
        healthLow: 4_605,
        healthMiddle: 4_940,
        healthHigh: 5_275,
        /** 子ども・子育て支援金 0.23% の半分（令和 8 年 4 月分から。全国一律）。出典は同じページ。 */
        child: 115,
        /** 介護保険料率 1.62% の半分（40〜64 歳だけ。全国一律）。出典は同じページ。 */
        care: 810,
        /**
         * 雇用保険料率の労働者負担（一般の事業）5/1,000。令和 8 年 4 月 1 日〜令和 9 年 3 月 31 日。
         * https://www.mhlw.go.jp/content/001692566.pdf
         */
        employment: 500,
    },
};
/** 目安の根拠にした一次情報（ブラウザ版の、目安の説明の近くに出す） */
export const sourcesInsuranceGuide = [
    { title: "日本年金機構 国民年金保険料の変遷", url: "https://www.nenkin.go.jp/service/kokunen/hokenryo/hensen.html" },
    { title: "新宿区 国民健康保険料の計算方法について（令和8年度の保険料率）", url: "https://www.city.shinjuku.lg.jp/hoken/hoken01_001028.html" },
    { title: "札幌市 国民健康保険料の計算（令和8年度）", url: "https://www.city.sapporo.jp/hoken-iryo/kokuho/fuka.html" },
    { title: "福岡市 国民健康保険料の計算方法（令和8年度の保険料率）", url: "https://www.city.fukuoka.lg.jp/hofuku/kokuho/hp/seido/06-02.html" },
    { title: "日本年金機構 厚生年金保険の保険料", url: "https://www.nenkin.go.jp/service/kounen/hokenryo/hoshu/20150515-01.html" },
    { title: "協会けんぽ 令和8年度の都道府県単位保険料率", url: "https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r08/index.html" },
    { title: "厚生労働省 令和8年度 雇用保険料率のご案内", url: "https://www.mhlw.go.jp/content/001692566.pdf" },
];
