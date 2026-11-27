/**
 * 令和 7 年分（2025 年分）のデータ。ふるさと納税の上限を令和 8 年分と比べるためだけに使う。
 *
 * 年分として対応しているわけではない（getTaxYear(2025) は使えない）。上限の計算に関わる項目のうち、
 * 令和 8 年分と違うものだけを一次情報で確かめて差し替えている。すべて 2026-11-27 に閲覧して確認した。
 *
 * 上限の式（地方税法 第314条の7第1項・第11項）に入るものと、令和 7 年分での扱い:
 *   - 給与所得（給与所得控除）……違う。下で差し替え
 *   - 所得税の基礎控除（特例分の割合を決める「人的控除差調整額」に入る）……違う。下で差し替え
 *   - 住民税の基礎控除・配偶者控除・扶養控除、調整控除、所得割の税率、所得割の非課税限度額……同じ
 *     （地方税法 第314条の2第2項、第314条の3第1項、第314条の6、附則第3条の3第1項を、令和 8 年 4 月 1 日時点と
 *      令和 9 年 1 月 1 日時点の条文で読み比べて、金額に関わる違いがないことを確かめた）
 *   - 特例分の割合の表と、人的控除差調整額に「所得税の基礎控除額 − 48 万円」を加える扱い……同じ
 *     （令和8年法律第2号による第314条の7第11項第1号の改正は令和 8 年 4 月 1 日施行で、令和 8 年度分
 *      ＝令和 7 年中の寄附から適用。同法 附則第11条第1項、財務省「令和8年度税制改正の解説」p.931-932）
 *
 * 配偶者・扶養親族の所得要件（令和 7 年分は 58 万円以下）は差し替えていない。比較は、配偶者の所得が
 * 0 の場合だけに限っている（compareFurusatoLimit）。iDeCo の限度額など、上限の計算に使わない項目は
 * 令和 8 年分のままなので、このデータを上限の比較以外に使ってはいけない。
 */
import { taxYear2026 } from "./2026.js";
import type { Source, TaxYearData } from "./types.js";

const MAN = 10_000;

export const furusatoComparison2025: TaxYearData = {
  ...taxYear2026,
  year: 2025,
  label: "令和7年分",
  residentTaxLabel: "令和8年度",

  // 給与所得（令和 7 年分）
  // 出典: 国税庁 No.1410 給与所得控除「令和7年分」の表（190 万円まで 65 万円、190 万円超は令和 8 年分と同じ式）
  // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm
  // 出典: 所得税法 別表第五（令和 7 年 12 月 31 日時点。65 万 1,000 円未満は 0、65 万 1,000 円以上 190 万円未満は
  //       収入 − 65 万円、190 万円以上は 4,000 円きざみ。例: 206 万円以上 206 万 4,000 円未満 → 136 万 2,000 円）
  // https://laws.e-gov.go.jp/law/340AC0000000033
  // （API: https://laws.e-gov.go.jp/api/2/law_data/340AC0000000033?asof=2025-12-31）
  salary: {
    ...taxYear2026.salary,
    zeroUpTo: 650_999,
    flatBelow: 1_900_000,
    flatDeduction: 650_000,
    fixedSteps: [],
  },

  incomeTax: {
    ...taxYear2026.incomeTax,
    // 基礎控除（令和 7 年分）
    // 出典: 国税庁 No.1199 基礎控除「令和7年分」の列
    // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm
    basicDeduction: [
      { upTo: 132 * MAN, value: 95 * MAN },
      { upTo: 336 * MAN, value: 88 * MAN },
      { upTo: 489 * MAN, value: 68 * MAN },
      { upTo: 655 * MAN, value: 63 * MAN },
      { upTo: 2_350 * MAN, value: 58 * MAN },
      { upTo: 2_400 * MAN, value: 48 * MAN },
      { upTo: 2_450 * MAN, value: 32 * MAN },
      { upTo: 2_500 * MAN, value: 16 * MAN },
      { upTo: null, value: 0 },
    ],
  },
};

/** 令和 7 年分との比較で根拠にした資料（令和 8 年分の出典一覧に加えて使うもの） */
export const sourcesFurusatoComparison: readonly Source[] = [
  {
    title:
      "e-Gov 地方税法 令和8年4月1日施行の条文（第314条の7第11項第1号・第37条の2第11項第1号: 人的控除差調整額に「所得税の基礎控除額 − 48 万円」を加える）と令和8年法律第2号 附則第11条第1項（令和 8 年度分から適用）",
    url: "https://laws.e-gov.go.jp/law/325AC0000000226/20260401_508AC0000000002",
  },
  {
    title: "財務省 令和8年度税制改正の解説 地方税法等の改正（p.931-932: ふるさと納税の特例控除額の計算式の見直し、令和 8 年度分から適用）",
    url: "https://www.mof.go.jp/tax_policy/tax_reform/outline/fy2026/explanation/PDF/p0921-0989.pdf",
  },
  {
    title: "e-Gov 所得税法（第86条: 基礎控除、別表第五: 給与所得控除後の給与等の金額の表）",
    url: "https://laws.e-gov.go.jp/law/340AC0000000033",
  },
  {
    title: "練馬区 寄附金税額控除～ふるさと納税の仕組みなど～（人的控除差調整額の説明。令和 8 年度住民税から適用）",
    url: "https://www.city.nerima.tokyo.jp/kurashi/zei/jyuminzei/zeigakukojo/kifukinzeigakukojo.html",
  },
  {
    title: "生駒市 令和8年度から適用される個人住民税の主な改正点（寄附金税額控除の特例控除額の算定方法の見直し）",
    url: "https://www.city.ikoma.lg.jp/0000038581.html",
  },
];
