import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parseAmount } from "../src/cli/amount.js";
import { VERSION } from "../src/version.js";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
// コンパイル後は .test-dist/test/ にあるので、リポジトリのルートは 2 つ上
const root = new URL("../../", import.meta.url);

function run(args: string[], stdin?: string) {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", input: stdin ?? "" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("parseAmount", () => {
  it("円・カンマ・万の表記を受け付ける", () => {
    assert.equal(parseAmount("6000000"), 6_000_000);
    assert.equal(parseAmount("6,000,000"), 6_000_000);
    assert.equal(parseAmount("600万"), 6_000_000);
    assert.equal(parseAmount("1億"), 100_000_000);
    assert.equal(parseAmount("1.5億"), 150_000_000);
    assert.equal(parseAmount("1億2000万"), 120_000_000);
    assert.equal(parseAmount("１，２００万"), 12_000_000);
    assert.equal(parseAmount("1億2000"), null);
    assert.equal(parseAmount("億"), null);
    assert.equal(parseAmount("万"), null);
    assert.equal(parseAmount(""), null);
    assert.equal(parseAmount("62.5万"), 625_000);
    assert.equal(parseAmount("６００万円"), 6_000_000);
    assert.equal(parseAmount("0"), 0);
  });
  it("読めないものは null", () => {
    for (const text of ["", "abc", "-100", "1.5", "600万円以上", "1e6"]) {
      assert.equal(parseAmount(text), null, text);
    }
  });
});

describe("CLI", () => {
  it("--version は package.json と一致する", () => {
    const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8")) as { version: string };
    assert.equal(VERSION, pkg.version);
    assert.equal(run(["--version"]).stdout.trim(), pkg.version);
  });

  it("フラグ入力で表を出し、免責を含む", () => {
    const r = run(["--revenue", "800万", "--expenses", "150万", "--blue", "65", "--social-insurance", "90万"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /令和8年分/);
    assert.match(r.stdout, /所得税 \+ 復興特別所得税\s+437,400 円/);
    assert.match(r.stdout, /ふるさと納税/);
    assert.match(r.stdout, /■ 免責/);
    assert.match(r.stdout, /税理士や税務署/);
  });

  it("--json は機械可読な結果を出す", () => {
    const r = run(["--revenue", "8000000", "--expenses", "1500000", "--blue", "65", "--social-insurance", "900000", "--json"]);
    assert.equal(r.code, 0, r.stderr);
    const json = JSON.parse(r.stdout);
    assert.equal(json.version, VERSION);
    assert.equal(json.baseline.incomeTax.total, 437_400);
    assert.equal(json.baseline.residentTax.total, 454_500);
    assert.equal(json.measures.furusato.limit, 131_000);
    assert.match(json.disclaimer, /概算/);
  });

  it("--input でファイルと標準入力の JSON を読み、フラグで上書きできる", () => {
    const file = fileURLToPath(new URL("examples/side-job.json", root));
    const fromFile = run(["--input", file, "--json"]);
    assert.equal(fromFile.code, 0, fromFile.stderr);
    assert.equal(JSON.parse(fromFile.stdout).baseline.incomeTax.total, 211_800);

    const fromStdin = run(["--input", "-", "--json"], JSON.stringify({ businessRevenue: 3_000_000 }));
    assert.equal(JSON.parse(fromStdin.stdout).input.businessRevenue, 3_000_000);

    const overridden = run(["--input", "-", "--revenue", "500万", "--json"], JSON.stringify({ businessRevenue: 3_000_000 }));
    assert.equal(JSON.parse(overridden.stdout).input.businessRevenue, 5_000_000);
  });

  it("家族のフラグ", () => {
    const r = run(["--salary", "700万", "--spouse-income", "0", "--spouse-70", "--dependents-specific", "1", "--json"]);
    const json = JSON.parse(r.stdout);
    assert.equal(json.baseline.incomeTax.deductions.spouse, 480_000);
    assert.equal(json.baseline.incomeTax.deductions.dependents, 630_000);
  });

  it("--nhi-rate を付けたときだけ国民健康保険料の目安を出す", () => {
    const base = ["--revenue", "800万", "--expenses", "150万", "--blue", "55", "--social-insurance", "90万"];
    assert.doesNotMatch(run(base).stdout, /◆ 国民健康保険料/);
    const r = run([...base, "--nhi-rate", "11.5%"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /◆ 国民健康保険料（所得割 11\.5% として・翌年度の目安）/);
    assert.match(r.stdout, /青色 65万円\s+623,300 円\s+11,500 円 減/);
    assert.equal(run([...base, "--nhi-rate", "高い"]).code, 2);
  });

  it("入力の誤りは終了コード 2。--json ならエラーも JSON", () => {
    const bad = run(["--revenue", "たくさん"]);
    assert.equal(bad.code, 2);
    assert.match(bad.stderr, /--revenue/);
    assert.equal(bad.stdout, "");

    const unknown = run(["--income", "100"]);
    assert.equal(unknown.code, 2);

    const json = run(["--input", "-", "--json"], JSON.stringify({ salaryRevenue: -1, foo: 1 }));
    assert.equal(json.code, 2);
    assert.equal(JSON.parse(json.stderr).error.issues.length, 2);

    const none = run([]);
    assert.equal(none.code, 2);
    assert.match(none.stderr, /入力がありません/);
  });

  it("--help と --sources", () => {
    assert.match(run(["--help"]).stdout, /使い方/);
    const sources = run(["--sources"]).stdout;
    assert.match(sources, /nta\.go\.jp/);
    assert.match(sources, /soumu\.go\.jp/);
  });

  it("対話入力（-i）: 質問は標準エラー、結果は標準出力", () => {
    // 給与 0 / 売上 800万 / 経費 150万 / 事業所得 / 青色 65 / 社保 90万 / iDeCo 0 / 共済 0 / ふるさと 0 / 配偶者 n / 扶養 n / その他 0
    const answers = ["", "800万", "150万", "1", "65", "90万", "", "", "", "n", "n", ""].join("\n") + "\n";
    const r = run(["-i", "--json"], answers);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).baseline.incomeTax.total, 437_400);
    assert.match(r.stderr, /給与収入/);
  });
});

describe("実行手順の記載", () => {
  // npm 12.0.0 から allow-git の既定値が none になり、git からの取得は --allow-git=all がないと EALLOWGIT で失敗する
  // https://docs.npmjs.com/cli/v12/using-npm/config#allow-git
  it("GitHub から npx / npm install する記載には、必ず --allow-git=all を付ける", () => {
    for (const file of ["README.md", "skills/setsuzei/SKILL.md", "CONTRIBUTING.md", "docs/index.html"]) {
      const text = readFileSync(new URL(file, root), "utf8");
      for (const line of text.split("\n")) {
        if (/\b(npx|npm install)\b.*github:ozko00\/setsuzei/.test(line)) {
          assert.match(line, /--allow-git=all/, `${file}: ${line.trim()}`);
        }
      }
    }
  });
});
