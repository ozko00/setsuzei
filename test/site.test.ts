import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  blueRows,
  contributionRows,
  CROSS_CHECKS,
  EXAMPLE_INCOMES,
  exampleInput,
  furusatoRows,
  IDECO_FULL,
  KYOSAI_FULL,
  pageLinks,
  renderSite,
  REPO_URL,
  SITE_URL,
  scanYear,
  siteUrls,
  YEAR_FAMILIES,
  YEAR_SALARIES,
  YEAR_SCAN,
  yearCell,
  yearOutOfPocket,
  yearSalaryInput,
  yearSalaryRows,
  yen,
} from "../site/pages.js";
import { INPUT_BOOLEAN_FLAGS, INPUT_STRING_FLAGS } from "../src/cli/flags.js";
import { calculate, compareFurusatoLimit, getSources } from "../src/index.js";

// コンパイル後は .test-dist/test/ にあるので、リポジトリのルートは 2 つ上
const docs = join(fileURLToPath(new URL("../../", import.meta.url)), "docs");
const site = renderSite();
const pages = [...site].filter(([path]) => path.endsWith("/index.html"));
const index = readFileSync(join(docs, "index.html"), "utf8");

const manLabel = (n: number): string => `${(n / 10_000).toLocaleString("en-US")} 万円`;

const KEYWORDS: Record<string, string> = {
  "furusato-nozei-freelance": "ふるさと納税 上限 計算 フリーランス",
  "ideco-kojin-jigyonushi": "iDeCo 節税 シミュレーション 個人事業主",
  "shokibo-kyosai-setsuzei": "小規模企業共済 節税額 シミュレーション",
  "aoiro-shinkoku-65-55-10": "青色申告特別控除 65万 55万 10万 違い",
  "furusato-nozei-jogen-reiwa8": "ふるさと納税 上限 下がる 令和8年 基礎控除",
  "iryohi-kojo-self-medication": "医療費控除 セルフメディケーション どっちが得 計算",
  "kakutei-shinkokusho-kakikata": "確定申告書 どこに書く 第一表 第二表",
};

/** 計算例の表が「所得別の 7 行」になっているページ（ほかのページは、表の作りがページごとに違う） */
const INCOME_TABLE_SLUGS = ["furusato-nozei-freelance", "ideco-kojin-jigyonushi", "shokibo-kyosai-setsuzei", "aoiro-shinkoku-65-55-10"];

/** 令和 7 年分と令和 8 年分を比べるページ（表の作りがほかのページと違う） */
const YEAR_SLUG = "furusato-nozei-jogen-reiwa8";

describe("検索語ごとのページ: 生成結果とコミット済みのファイル", () => {
  it("docs/ のファイルは、いまの計算コアから生成した結果と一致する（npm run build:site の実行漏れを検出）", () => {
    assert.equal(pages.length, 7);
    for (const [path, content] of site) {
      assert.equal(readFileSync(join(docs, path), "utf8"), content, path);
    }
  });

  it("題名・h1・説明文に検索語がそのまま入っていて、説明文は検索語の先頭の語で始まる", () => {
    for (const [path, html] of pages) {
      const slug = path.replace("/index.html", "");
      const words = (KEYWORDS[slug] ?? "").split(" ");
      assert.ok(words.length >= 3, slug);
      const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
      const h1 = /<h1>([^<]*)<\/h1>/.exec(html)?.[1] ?? "";
      const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? "";
      for (const text of [title, h1, description]) {
        for (const word of words) assert.ok(text.includes(word), `${slug}: 「${word}」がない: ${text}`);
      }
      const first = words[0] ?? "";
      assert.ok(title.startsWith(first) && h1.startsWith(first) && description.startsWith(first), slug);
      assert.ok(description.length >= 80 && description.length <= 160, `${slug}: 説明文 ${description.length} 文字`);
    }
  });

  it("ページごとに題名・h1・説明文が違う（言い換えの量産になっていない）", () => {
    for (const pattern of [/<title>([^<]*)<\/title>/, /<h1>([^<]*)<\/h1>/, /<meta name="description" content="([^"]*)"/]) {
      const values = [index, ...pages.map(([, html]) => html)].map((html) => pattern.exec(html)?.[1]);
      assert.equal(new Set(values).size, values.length);
    }
  });

  it("計算式と根拠・計算例の表・よくある質問・出典が、JavaScript なしで読める HTML 本文にある", () => {
    for (const [path, html] of pages) {
      const body = html.replace(/<script[\s\S]*?<\/script>/g, "");
      const isYear = path === `${YEAR_SLUG}/index.html`;
      const examplesHeading = isYear ? "年収別の比較表" : path.startsWith("kakutei-shinkokusho-kakikata/") ? "記入例（所得 500 万円のフリーランス）" : "計算例";
      for (const heading of ["計算式と根拠", examplesHeading, "よくある質問", "根拠にした一次情報"]) {
        assert.ok(body.includes(`<h2>${heading}</h2>`), `${path}: ${heading}`);
      }
      assert.match(body, /<table class="examples">/);
      if (INCOME_TABLE_SLUGS.some((slug) => path === `${slug}/index.html`)) {
        assert.equal((body.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0].match(/<tr>/g) ?? []).length, EXAMPLE_INCOMES.length, path);
      }
      assert.ok((body.match(/<h3>/g) ?? []).length >= 4, path);
      assert.match(body, /概算です/);
      assert.match(body, /税理士や税務署/);
    }
  });
});

describe("検索語ごとのページ: 計算例の表の数字は計算コアの結果そのもの", () => {
  const page = (slug: string): string => site.get(`${slug}/index.html`) ?? "";
  /** 表の本体から、行ごとのセルの文字列を取り出す */
  const cells = (html: string): string[][] =>
    [...(html.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0] ?? "").matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) =>
      [...(row[1] ?? "").matchAll(/<t[hd][^>]*>([^<]*)<\/t[hd]>/g)].map((c) => c[1] ?? ""),
    );

  it("ふるさと納税: 独身・家族あり・iDeCo 満額の上限を、表とは別に calculate で求めた値と比べる", () => {
    const table = cells(page("furusato-nozei-freelance"));
    EXAMPLE_INCOMES.forEach((income, i) => {
      const common = { businessRevenue: income, blueReturn: "65", socialInsurance: income * 0.15 } as const;
      assert.deepEqual(table[i], [
        manLabel(income),
        yen(calculate(common).measures.furusato.limit),
        yen(calculate({ ...common, spouse: { income: 0 }, dependents: { general: 1 } }).measures.furusato.limit),
        yen(calculate({ ...common, idecoPaid: 816_000 }).measures.furusato.limit),
      ]);
    });
    // 家族がいる・掛金を払うと、上限は下がる
    for (const r of furusatoRows()) assert.ok(r.family < r.single && r.withIdeco < r.single, String(r.income));
  });

  it("iDeCo・小規模企業共済: 節税額は「掛金あり・なしの税額の差」と一致し、掛金 ×（税率 × 1.021 + 10%）を超えない", () => {
    for (const [slug, kind, monthly] of [
      ["ideco-kojin-jigyonushi", "ideco", [10_000, 23_000, 50_000, 68_000]],
      ["shokibo-kyosai-setsuzei", "kyosai", [10_000, 30_000, 50_000, 70_000]],
    ] as const) {
      const table = cells(page(slug));
      const rows = contributionRows(kind);
      EXAMPLE_INCOMES.forEach((income, i) => {
        const base = { businessRevenue: income, blueReturn: "65", socialInsurance: income * 0.15 } as const;
        const before = calculate(base).baseline;
        const expected = monthly.map((m) => {
          const paid = kind === "ideco" ? { idecoPaid: m * 12 } : { kyosaiPaid: m * 12 };
          return before.totalTax - calculate({ ...base, ...paid }).baseline.totalTax;
        });
        assert.deepEqual(rows[i]?.savings, expected, `${kind} ${income}`);
        assert.deepEqual(table[i], [manLabel(income), `${before.incomeTax.marginalRatePercent}%`, ...expected.map(yen)]);
        expected.forEach((saving, j) => {
          const upper = ((monthly[j] ?? 0) * 12 * (before.incomeTax.marginalRatePercent * 1.021 + 10)) / 100;
          assert.ok(saving > 0 && saving <= upper + 200, `${kind} ${income} ${monthly[j]}: ${saving} > ${upper}`);
        });
      });
    }
    assert.equal(IDECO_FULL, 816_000);
    assert.equal(KYOSAI_FULL, 840_000);
  });

  it("青色申告特別控除: 白色との差は区分ごとの税額の差と一致し、控除が大きいほど減る", () => {
    const table = cells(page("aoiro-shinkoku-65-55-10"));
    const rows = blueRows();
    EXAMPLE_INCOMES.forEach((income, i) => {
      const tax = (blueReturn: "none" | "10" | "55" | "65"): number =>
        calculate({ businessRevenue: income, blueReturn, socialInsurance: income * 0.15 }).baseline.totalTax;
      const r = rows[i];
      assert.ok(r);
      assert.deepEqual([r.s10, r.s55, r.s65, r.diff65vs55], [tax("none") - tax("10"), tax("none") - tax("55"), tax("none") - tax("65"), tax("55") - tax("65")]);
      assert.deepEqual(table[i], [manLabel(income), yen(r.s10), yen(r.s55), yen(r.s65), yen(r.diff65vs55)]);
      assert.ok(0 < r.s10 && r.s10 < r.s55 && r.s55 < r.s65);
    });
  });

  it("本文で引いている例（所得 500 万円、所得 120 万円）の金額も計算コアの結果", () => {
    const e500 = calculate(exampleInput(5_000_000));
    assert.ok(page("furusato-nozei-freelance").includes(`上限の目安は ${yen(e500.measures.furusato.limit)} ですが`));
    const ideco500 = calculate(exampleInput(5_000_000, { idecoAdditional: IDECO_FULL })).measures.ideco.saving.total;
    assert.ok(page("ideco-kojin-jigyonushi").includes(`合わせて年 ${yen(ideco500)} 減ります`));
    const kyosai500 = calculate(exampleInput(5_000_000, { kyosaiAdditional: KYOSAI_FULL })).measures.kyosai.saving.total;
    assert.ok(page("shokibo-kyosai-setsuzei").includes(`合わせて年 ${yen(kyosai500)} 減ります`));
    // 「課税所得がなければ減らない」の例は、実際に 0 円になる入力を使っている
    const low = calculate(exampleInput(1_200_000, { idecoAdditional: IDECO_FULL }));
    assert.equal(low.baseline.incomeTax.taxableIncome, 0);
    assert.equal(low.measures.ideco.saving.total, 0);
  });
});

describe("令和7年分と令和8年分の比較のページ: 表と本文の数字は計算コアの結果そのもの", () => {
  const html = site.get(`${YEAR_SLUG}/index.html`) ?? "";
  /** caption で表を選び、行ごとのセルの文字列を取り出す */
  const tableCells = (caption: string): string[][] => {
    const table = new RegExp(`<caption>${caption}</caption>[\\s\\S]*?<tbody>([\\s\\S]*?)</tbody>`).exec(html)?.[1] ?? "";
    return [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) =>
      [...(row[1] ?? "").matchAll(/<t[hd][^>]*>([^<]*)<\/t[hd]>/g)].map((c) => c[1] ?? ""),
    );
  };

  it("給与収入別の表: 表とは別に compareFurusatoLimit で求めた値と一致する", () => {
    const table = tableCells("給与収入別のふるさと納税の上限の目安（令和7年分 → 令和8年分）");
    assert.equal(table.length, YEAR_SALARIES.length);
    YEAR_SALARIES.forEach((salary, i) => {
      const expected = YEAR_FAMILIES.map((f) => yearCell(compareFurusatoLimit({ salaryRevenue: salary, socialInsurance: salary * 0.15, ...f.input })));
      assert.deepEqual(table[i], [manLabel(salary), ...expected]);
    });
    // 下がる行も、変わらない行も載っている（下がる人だけを並べていない）
    const all = yearSalaryRows().flatMap((r) => r.cells);
    assert.ok(all.some((c) => c.difference < 0) && all.filter((c) => c.difference === 0).length > all.length / 2);
    assert.ok(all.every((c) => c.difference <= 0));
  });

  it("内訳の表: 1 万円きざみの走査の件数と一致し、上がる収入は 1 つもない", () => {
    const table = tableCells("上限の目安が下がる人・変わらない人・上がる人の内訳");
    assert.equal(table.length, YEAR_FAMILIES.length + 1);
    YEAR_FAMILIES.forEach((f, i) => {
      // 走査は、ページの関数を使わずに数え直す
      let lower = 0;
      let same = 0;
      let higher = 0;
      for (let salary: number = YEAR_SCAN.from; salary <= YEAR_SCAN.to; salary += YEAR_SCAN.step) {
        const d = compareFurusatoLimit({ salaryRevenue: salary, socialInsurance: salary * 0.15, ...f.input }).difference;
        if (d < 0) lower++;
        else if (d === 0) same++;
        else higher++;
      }
      const count = (n: number): string => `${n.toLocaleString("en-US")} 通り`;
      assert.deepEqual(table[i]?.slice(1, 4), [count(lower), count(same), count(higher)], f.label);
      assert.equal(higher, 0);
      assert.ok(same > lower * 5, `${f.label}: 変わらない収入のほうがずっと多い`);
      const scan = scanYear((amount) => yearSalaryInput(amount, f.input));
      assert.deepEqual([scan.lower, scan.same, scan.higher, scan.total], [lower, same, higher, lower + same + higher]);
    });
  });

  it("本文で引いている例（給与収入 500 万円・600 万円・200 万円、自己負担）の金額も計算コアの結果", () => {
    const c500 = compareFurusatoLimit({ salaryRevenue: 5_000_000, socialInsurance: 750_000 });
    assert.deepEqual([c500.previous.limit, c500.current.limit], [61_000, 57_000]);
    assert.ok(html.includes(`給与収入 500 万円・独身は ${yen(61_000)} → ${yen(57_000)}`));
    const c600 = compareFurusatoLimit({ salaryRevenue: 6_000_000, socialInsurance: 900_000 });
    assert.equal(c600.difference, 0);
    assert.ok(html.includes(`600 万円・独身は ${yen(c600.current.limit)} のまま`));
    const c200 = compareFurusatoLimit({ salaryRevenue: 2_000_000, socialInsurance: 300_000 });
    assert.ok(html.includes(`${yen(c200.previous.limit)} → ${yen(c200.current.limit)} です`));
    // 自己負担: 寄附額 −（寄附なしの税額 − 寄附ありの税額）
    const input = { salaryRevenue: 5_000_000, socialInsurance: 750_000 };
    const burden = (donation: number): number =>
      donation - (calculate(input).baseline.totalTax - calculate({ ...input, furusatoPaid: donation }).baseline.totalTax);
    assert.equal(yearOutOfPocket(input, 57_000), burden(57_000));
    assert.equal(burden(57_000), 2_000);
    assert.ok(burden(61_000) > burden(57_000));
    assert.ok(html.includes(`を令和8年分（2026年中）に寄附すると、自己負担は ${yen(burden(61_000))} になります`));
  });

  it("題名・見出し・冒頭で、影響が一部の所得帯に限られることを述べている（全員が下がると読める書き方をしない）", () => {
    const lead = /<p class="lead">([^<]*)<\/p>/.exec(html)?.[1] ?? "";
    assert.match(lead, /一部の所得帯/);
    assert.match(lead, /多くの人は変わらず/);
    const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? "";
    assert.match(description, /一部の所得帯だけ/);
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
    const h1 = /<h1>([^<]*)<\/h1>/.exec(html)?.[1] ?? "";
    for (const text of [title, h1]) assert.doesNotMatch(text, /全員|必ず|大幅|激減|損/);
    // 公的な早見表は改正前のもので、数字は条文からの計算であることを明記している
    assert.match(html, /令和8年分を反映した公的な早見表は、確認した範囲では見つかりませんでした。このページの令和8年分の数字は、上の条文から計算したものです。/);
    // 根拠: 条文と財務省の解説
    assert.ok(html.includes("https://laws.e-gov.go.jp/law/325AC0000000226/20260401_508AC0000000002"));
    assert.ok(html.includes("https://www.mof.go.jp/tax_policy/tax_reform/outline/fy2026/explanation/PDF/p0921-0989.pdf"));
  });
});

describe("検索語ごとのページ: リンクと公開まわり", () => {
  it("外部へのリンクは、出典一覧にある一次情報と、このリポジトリだけ", () => {
    const allowed = new Set(getSources().map((s) => s.url));
    // 令和 7 年分との比較のページだけは、独立した計算との突き合わせとして第三者の解説にも張る
    const crossChecks = new Set<string>(CROSS_CHECKS.map((x) => x.url));
    for (const [path, html] of pages) {
      const body = html.replace(/<head>[\s\S]*?<\/head>/, "");
      const external = [...body.matchAll(/href="(https?:[^"]+)"/g)].map((m) => (m[1] ?? "").replace(/&amp;/g, "&"));
      assert.ok(external.length >= 5, path);
      for (const url of external) {
        const crossCheck = path === `${YEAR_SLUG}/index.html` && crossChecks.has(url);
        assert.ok(allowed.has(url) || url.startsWith(REPO_URL) || crossCheck, `${path}: 出典一覧にない外部リンク ${url}`);
      }
    }
  });

  it("内部リンク: 各ページはトップとほかのすべてのページへ、トップはすべてのページへ張っている", () => {
    const slugs = pages.map(([path]) => path.replace("/index.html", ""));
    for (const [path, html] of pages) {
      const self = path.replace("/index.html", "");
      assert.match(html, /<a [^>]*href="\.\.\/"/);
      for (const slug of slugs) {
        if (slug !== self) assert.ok(html.includes(`href="../${slug}/"`), `${path} → ${slug}`);
      }
    }
    for (const { slug, label } of pageLinks()) {
      assert.ok(index.includes(`<a href="${slug}/">${label}</a>`), `トップ → ${slug}`);
      assert.ok(existsSync(join(docs, slug, "index.html")));
    }
  });

  it("sitemap.xml に全ページ、robots.txt に sitemap の場所がある", () => {
    const sitemap = site.get("sitemap.xml") ?? "";
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.deepEqual(locs, siteUrls());
    assert.equal(locs.length, 16);
    assert.equal(locs[0], SITE_URL);
    assert.match(site.get("robots.txt") ?? "", new RegExp(`^Sitemap: ${SITE_URL}sitemap\\.xml$`, "m"));
    // canonical は sitemap の URL と同じ
    for (const [path, html] of pages) {
      assert.ok(html.includes(`<link rel="canonical" href="${SITE_URL}${path.replace("index.html", "")}">`), path);
    }
  });

  it("構造化データ（JSON-LD）: トップと各ページに WebApplication、各ページに FAQPage とパンくず", () => {
    const blocks = (html: string): Record<string, unknown>[] =>
      [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
        (m) => JSON.parse(m[1] ?? "") as Record<string, unknown>,
      );
    const top = blocks(index);
    assert.equal(top.length, 1);
    assert.equal(top[0]?.["@type"], "WebApplication");
    assert.equal(top[0]?.["url"], SITE_URL);
    for (const [path, html] of pages) {
      const types = blocks(html).map((b) => b["@type"]);
      assert.deepEqual(types, ["WebApplication", "FAQPage", "BreadcrumbList"], path);
      const faq = blocks(html)[1]?.["mainEntity"] as { name: string; acceptedAnswer: { text: string } }[];
      // FAQ の構造化データは、本文に見えている質問と同じ
      for (const item of faq) {
        assert.ok(html.includes(`<h3>${item.name}</h3>`), `${path}: ${item.name}`);
        assert.doesNotMatch(item.acceptedAnswer.text, /<|\$\{/);
      }
    }
  });

  it("外部への通信をしない: CSP は同じで、読み込むのは同じサイトのファイルだけ。入力名は CLI のフラグ名", () => {
    const known = new Set<string>([...INPUT_STRING_FLAGS, ...INPUT_BOOLEAN_FLAGS]);
    for (const [path, html] of pages) {
      assert.match(html, /Content-Security-Policy[^>]*default-src 'none'[^>]*connect-src 'none'[^>]*form-action 'none'/);
      const loaded = [...html.matchAll(/<(?:script|link|img)(?![^>]*rel="(?:canonical|alternate)")[^>]*\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(loaded.sort(), ["../img/favicon.svg", "../js/web/page.js", "../style.css"], path);
      for (const m of html.matchAll(/<(?:input|select)[^>]*\bname="([^"]+)"/g)) assert.ok(known.has(m[1] ?? ""), `${path}: ${m[1]}`);
      assert.doesNotMatch(html, /\$\{|undefined|NaN/, path);
    }
    assert.ok(existsSync(join(docs, "js/web/page.js")));
  });

  it("IndexNow のキーファイル: ファイル名と中身が同じ 32 桁の 16 進数", () => {
    const keys = readdirSync(docs).filter((name) => /^[0-9a-f]{32}\.txt$/.test(name));
    assert.equal(keys.length, 1);
    assert.equal(readFileSync(join(docs, keys[0] ?? ""), "utf8"), (keys[0] ?? "").replace(".txt", ""));
  });
});
