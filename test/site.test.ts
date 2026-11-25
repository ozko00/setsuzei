import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  blueRows,
  contributionRows,
  EXAMPLE_INCOMES,
  exampleInput,
  furusatoRows,
  IDECO_FULL,
  KYOSAI_FULL,
  pageLinks,
  renderSite,
  REPO_URL,
  SITE_URL,
  siteUrls,
  yen,
} from "../site/pages.js";
import { INPUT_BOOLEAN_FLAGS, INPUT_STRING_FLAGS } from "../src/cli/flags.js";
import { calculate, getSources } from "../src/index.js";

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
};

describe("検索語ごとのページ: 生成結果とコミット済みのファイル", () => {
  it("docs/ のファイルは、いまの計算コアから生成した結果と一致する（npm run build:site の実行漏れを検出）", () => {
    assert.equal(pages.length, 4);
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
      for (const heading of ["計算式と根拠", "計算例", "よくある質問", "根拠にした一次情報"]) {
        assert.ok(body.includes(`<h2>${heading}</h2>`), `${path}: ${heading}`);
      }
      assert.match(body, /<table class="examples">/);
      assert.equal((body.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0].match(/<tr>/g) ?? []).length, EXAMPLE_INCOMES.length, path);
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

describe("検索語ごとのページ: リンクと公開まわり", () => {
  it("外部へのリンクは、出典一覧にある一次情報と、このリポジトリだけ", () => {
    const allowed = new Set(getSources().map((s) => s.url));
    for (const [path, html] of pages) {
      const body = html.replace(/<head>[\s\S]*?<\/head>/, "");
      const external = [...body.matchAll(/href="(https?:[^"]+)"/g)].map((m) => (m[1] ?? "").replace(/&amp;/g, "&"));
      assert.ok(external.length >= 5, path);
      for (const url of external) {
        assert.ok(allowed.has(url) || url.startsWith(REPO_URL), `${path}: 出典一覧にない外部リンク ${url}`);
      }
    }
  });

  it("内部リンク: 各ページはトップとほかの 3 ページへ、トップは 4 ページすべてへ張っている", () => {
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
    assert.equal(locs.length, 5);
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
      const loaded = [...html.matchAll(/<(?:script|link|img)(?![^>]*rel="canonical")[^>]*\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
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
