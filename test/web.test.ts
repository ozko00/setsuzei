import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { INPUT_BOOLEAN_FLAGS, INPUT_STRING_FLAGS } from "../src/cli/flags.js";
import { compute, isBlank, queryToValues, splitIssue, valuesToFlags, type FormValues } from "../web/logic.js";

// コンパイル後は .test-dist/test/ にあるので、リポジトリのルートは 2 つ上
const root = fileURLToPath(new URL("../../", import.meta.url));
const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/** CLI のフラグ列（["--revenue", "800万", "--misc"]）を、ブラウザ版の URL クエリにする */
function toQuery(args: readonly string[]): string {
  const params = new URLSearchParams();
  for (let i = 0; i < args.length; i++) {
    const name = (args[i] ?? "").replace(/^--/, "");
    if ((INPUT_BOOLEAN_FLAGS as readonly string[]).includes(name)) params.set(name, "1");
    else params.set(name, args[++i] ?? "");
  }
  return `?${params.toString()}`;
}

const CASES: readonly (readonly string[])[] = [
  ["--revenue", "800万", "--expenses", "150万", "--blue", "65", "--social-insurance", "90万"],
  ["--revenue", "800万", "--expenses", "150万", "--blue", "65", "--social-insurance", "90万", "--ideco-paid", "27.6万", "--furusato-paid", "3万"],
  ["--salary", "600万", "--revenue", "120万", "--expenses", "20万", "--misc", "--social-insurance", "88万", "--spouse-income", "0", "--dependents", "1"],
  ["--salary", "9,800,000", "--spouse-income", "1020000", "--spouse-70", "--dependents-specific", "2", "--dependents-elderly-cohabiting", "1", "--ideco-limit", "240000", "--ideco-paid", "120000"],
  ["--revenue", "3000000", "--expenses", "500000", "--blue", "10", "--social-insurance", "400000", "--kyosai-paid", "120000", "--kyosai-add", "10万", "--ideco-add", "5万", "--other-deductions", "8万"],
  ["--revenue", "2500万", "--expenses", "300万", "--blue", "55", "--social-insurance", "150万", "--furusato-paid", "100万", "--dependents-elderly", "1"],
  ["--salary", "150万"],
  ["--salary", "1200万", "--social-insurance", "150万", "--spouse-income", "0", "--dependents", "1", "--income-adjustment"],
  ["--revenue", "800万", "--expenses", "150万", "--blue", "55", "--social-insurance", "90万", "--nhi-rate", "11.5"],
];

describe("ブラウザ版: CLI と同じ入力で同じ数字になる", () => {
  for (const args of CASES) {
    it(args.join(" "), () => {
      const r = spawnSync(process.execPath, [cli, ...args, "--json"], { encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
      const { version: _version, ...fromCli } = JSON.parse(r.stdout) as Record<string, unknown>;
      const outcome = compute(queryToValues(toQuery(args)));
      assert.ok(outcome.ok);
      // JSON を経由して比べる（undefined のキーなどの差をなくす）
      assert.deepEqual(JSON.parse(JSON.stringify(outcome.result)), fromCli);
    });
  }

  it("公開する docs/js のスクリプト自体も同じ結果を返す", async () => {
    const url = pathToFileURL(join(root, "docs/js/web/logic.js")).href;
    const built = (await import(url)) as typeof import("../web/logic.js");
    for (const args of CASES) {
      const expected = compute(queryToValues(toQuery(args)));
      assert.deepEqual(built.compute(built.queryToValues(toQuery(args))), expected);
    }
  });

  it("入力の誤りは CLI と同じ内容で返す", () => {
    const outcome = compute({ revenue: "たくさん", dependents: "1.5" });
    assert.equal(outcome.ok, false);
    const r = spawnSync(process.execPath, [cli, "--revenue", "たくさん", "--dependents", "1.5", "--json"], { encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.deepEqual(outcome.ok ? [] : outcome.issues, JSON.parse(r.stderr).error.issues);
  });
});

describe("ブラウザ版: フォームの値の扱い", () => {
  it("空欄は指定なし。配偶者はチェックがあるときだけ使い、所得が空欄なら 0 円", () => {
    assert.deepEqual(valuesToFlags({ revenue: " 800万 ", expenses: "", misc: false }), { revenue: "800万" });
    assert.deepEqual(valuesToFlags({ "has-spouse": true, "spouse-income": "" }), { "spouse-income": "0" });
    assert.deepEqual(valuesToFlags({ "has-spouse": false, "spouse-income": "50万", "spouse-70": true }), {});
    assert.deepEqual(valuesToFlags({ "has-spouse": true, "spouse-income": "50万", "spouse-70": true }), {
      "spouse-income": "50万",
      "spouse-70": true,
    });
  });

  it("URL のクエリは CLI のフラグ名で読み、知らない名前は無視する", () => {
    assert.deepEqual(queryToValues("?revenue=800%E4%B8%87&misc=1&utm_source=x"), { revenue: "800万", misc: true });
    assert.deepEqual(queryToValues("?spouse-income=0"), { "spouse-income": "0", "has-spouse": true });
    assert.deepEqual(queryToValues(""), {});
  });

  it("雑所得を選んだら、隠れている青色申告の選択は使わない（エラーにしない）", () => {
    assert.deepEqual(valuesToFlags({ revenue: "100万", misc: true, blue: "65" }), { revenue: "100万", misc: true });
    assert.equal(compute({ revenue: "100万", misc: true, blue: "65" }).ok, true);
  });

  it("おかしな入力は、どの欄のことかわかる形で返す", () => {
    const issuesOf = (values: FormValues): readonly { field: string | null; message: string }[] => {
      const outcome = compute(values);
      assert.equal(outcome.ok, false);
      return outcome.ok ? [] : outcome.issues.map(splitIssue);
    };
    // 文字、マイナス、小数の円、指数表記
    for (const text of ["abc", "-500万", "800.5", "1e7"]) {
      const [issue] = issuesOf({ revenue: text });
      assert.equal(issue?.field, "revenue", text);
      assert.match(issue?.message ?? "", /金額として読めません/);
    }
    // 桁の打ち間違い（1 兆円超）は、内部のキー名ではなく欄の名前で返る
    assert.equal(issuesOf({ revenue: "99999999999999" })[0]?.field, "revenue");
    assert.equal(issuesOf({ revenue: "800万", dependents: "1.5" })[0]?.field, "dependents");
    assert.equal(issuesOf({ revenue: "800万", "nhi-rate": "abc" })[0]?.field, "nhi-rate");
    // 複数の欄が誤っていれば全部返す
    assert.deepEqual(issuesOf({ revenue: "x", expenses: "y" }).map((i) => i.field), ["revenue", "expenses"]);
  });

  it("全角の数字・「円」・「億」も読む", () => {
    const total = (values: FormValues): number => {
      const outcome = compute(values);
      assert.equal(outcome.ok, true);
      return outcome.ok ? outcome.result.baseline.totalTax : -1;
    };
    const expected = total({ revenue: "8000000", dependents: "1" });
    assert.equal(total({ revenue: "８００万円", dependents: "１" }), expected);
    assert.equal(total({ revenue: "1億2000万" }), total({ revenue: "120000000" }));
  });

  it("収入が空なら案内を出す", () => {
    assert.equal(isBlank({ "social-insurance": "90万" }), true);
    assert.equal(isBlank({ salary: "600万" }), false);
  });
});

describe("ブラウザ版: 公開する静的ファイル（docs/）", () => {
  const html = readFileSync(join(root, "docs/index.html"), "utf8");

  it("docs/js は web/ と src/ の最新のビルド結果と一致する（npm run build:site の実行漏れを検出）", () => {
    const out = mkdtempSync(join(tmpdir(), "setsuzei-site-"));
    const tsc = join(root, "node_modules/typescript/bin/tsc");
    const r = spawnSync(process.execPath, [tsc, "-p", join(root, "tsconfig.web.json"), "--outDir", out], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const fresh = listFiles(out).map((f) => relative(out, f)).sort();
    const committed = listFiles(join(root, "docs/js")).map((f) => relative(join(root, "docs/js"), f)).sort();
    assert.deepEqual(committed, fresh);
    for (const file of fresh) {
      assert.equal(readFileSync(join(root, "docs/js", file), "utf8"), readFileSync(join(out, file), "utf8"), file);
    }
  });

  it("フォームの入力名はすべて CLI のフラグ名に対応する", () => {
    const names = [...html.matchAll(/<(?:input|select)[^>]*\bname="([^"]+)"/g)].map((m) => m[1] ?? "");
    const known = new Set<string>([...INPUT_STRING_FLAGS, ...INPUT_BOOLEAN_FLAGS, "has-spouse", "income-type"]);
    assert.ok(names.length >= 15);
    for (const name of names) assert.ok(known.has(name), `知らない入力名: ${name}`);
  });

  it("外部への通信をしない: CSP で接続を禁止し、外部のスクリプト・スタイル・通信 API を使わない", () => {
    assert.match(html, /Content-Security-Policy[^>]*default-src 'none'/);
    assert.match(html, /Content-Security-Policy[^>]*connect-src 'none'/);
    assert.match(html, /Content-Security-Policy[^>]*form-action 'none'/);
    // 読み込むファイルは同じ場所の相対パスだけ
    // （rel="canonical" は読み込みではなく、このページ自身の URL の宣言なので除く）
    const loaded = [...html.matchAll(/<(?:script|link|img)(?![^>]*rel="canonical")[^>]*\b(?:src|href)="([^"]+)"/g)].map((m) => m[1] ?? "");
    assert.deepEqual(loaded.sort(), ["img/favicon.svg", "js/web/main.js", "style.css"]);
    const css = readFileSync(join(root, "docs/style.css"), "utf8");
    assert.doesNotMatch(css, /url\(|@import/);
    for (const file of listFiles(join(root, "docs/js"))) {
      const js = readFileSync(file, "utf8");
      assert.doesNotMatch(js, /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie)\b/, file);
      // Node 専用のモジュールを読み込んでいない
      assert.doesNotMatch(js, /from "node:/, file);
    }
  });

  it("共有されたときの表示（OGP）: タイトル・説明・画像があり、画像は 1200×630 の実ファイル", () => {
    const meta = (property: string): string => {
      const m = new RegExp(`<meta property="${property}" content="([^"]*)"`).exec(html);
      assert.ok(m, `${property} がない`);
      return m[1] ?? "";
    };
    const site = "https://ozko00.github.io/setsuzei/";
    assert.equal(meta("og:url"), site);
    assert.match(meta("og:title"), /setsuzei/);
    assert.ok(meta("og:description").length >= 40);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    // 画像は絶対 URL で指定し、docs/ の中に実体がある
    const image = meta("og:image");
    assert.ok(image.startsWith(site));
    const png = readFileSync(join(root, "docs", image.slice(site.length)));
    assert.equal(png.subarray(1, 4).toString("latin1"), "PNG");
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
    assert.equal(meta("og:image:width"), "1200");
    assert.equal(meta("og:image:height"), "630");
  });

  it("結果の近くに概算である旨と出典を出す", () => {
    assert.match(html, /概算です/);
    assert.match(html, /税理士や税務署/);
    assert.match(html, /id="sources"/);
    assert.match(html, /name="viewport" content="width=device-width, initial-scale=1"/);
  });
});
