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

  it("入力の誤りは日本語で、フラグ名で伝える", () => {
    // マイナスの値（Node の parseArgs が英語のエラーにしていた）
    for (const args of [["--revenue", "-100万"], ["--revenue=-100万"], ["--dependents", "-1"]]) {
      const r = run(args);
      assert.equal(r.code, 2, args.join(" "));
      assert.match(r.stderr, /^入力に誤りがあります:\n {2}- --(revenue|dependents): 0 以上の/);
      assert.doesNotMatch(r.stderr, /ambiguous|argument|Option/);
    }
    // 項目名は JSON のキー（blueReturn）ではなくフラグ名（--blue）
    const blue = run(["--revenue", "100万", "--blue", "20"]);
    assert.match(blue.stderr, /- --blue: "none"/);
    assert.doesNotMatch(blue.stderr, /blueReturn/);
    assert.match(run(["--revenue", "100万", "--misc", "--blue", "65"]).stderr, /- --blue: 雑所得には/);
    assert.match(run(["--revenue", "99999999999999"]).stderr, /- --revenue: 大きすぎます/);
    assert.match(run(["--revenue", "100万", "--dependents-under16", "100"]).stderr, /- --dependents-under16: /);
    // --json でも同じ
    const json = JSON.parse(run(["--revenue", "100万", "--blue", "20", "--json"]).stderr);
    assert.match(json.error.issues[0], /^--blue: /);
    // JSON で入力した人には、JSON の項目名のまま
    assert.match(run(["--input", "-"], JSON.stringify({ blueReturn: "20" })).stderr, /- blueReturn: /);
    // オプションの書き間違い
    assert.match(run(["--income", "100"]).stderr, /--income: 知らないオプションです/);
    assert.match(run(["--revenue"]).stderr, /--revenue: 値を指定してください/);
    assert.match(run(["--revenue", "100万", "abc"]).stderr, /オプションの付いていない値は指定できません/);
  });

  it("表示: 減る税額の隣に支払う額を出し、意味のない行や対象外の策を見出しに出さない", () => {
    const freelancer = run(["--revenue", "800万", "--expenses", "150万", "--blue", "65", "--social-insurance", "90万", "--ideco-paid", "27.6万", "--furusato-paid", "3万"]).stdout;
    assert.match(freelancer, /追加で支払う額\s+減る税額\s+うち所得税\s+うち住民税/);
    assert.match(freelancer, /ふるさと納税\s+93,000 円\s+93,000 円/);
    assert.match(freelancer, /小規模企業共済\s+840,000 円\s+241,700 円/);
    assert.match(freelancer, /iDeCo（年内に増やせる場合）\s+540,000 円\s+164,300 円/);
    assert.match(freelancer, /◆ まとめて実行した場合（ふるさと納税 \+ 小規模企業共済）/);
    assert.match(freelancer, /追加で支払う額の合計\s+896,000 円\n\s+減る税額の合計\s+297,700 円/);
    assert.match(freelancer, /うちふるさと納税による分\s+56,000 円/);
    assert.match(freelancer, /◆ iDeCo の追加も年内に間に合う場合（ふるさと納税 \+ 小規模企業共済 \+ iDeCo）/);
    assert.match(freelancer, /減る税額の合計\s+393,800 円/);
    assert.match(freelancer, /手元のお金は増えません/);
    assert.match(freelancer, /原則 60 歳まで引き出せません/);
    // 給与所得者は共済の対象外。見出しに共済を出さない
    const employee = run(["--salary", "600万", "--social-insurance", "88万"]).stdout;
    assert.doesNotMatch(employee, /（[^）]*小規模企業共済[^）]*）/);
    assert.doesNotMatch(employee, /全部やった場合/);
    // 税額が減らない策は、表に行を出さない
    const none = run(["--revenue", "0"]).stdout;
    assert.match(none, /年内に追加して税額が減る策はありません/);
    assert.doesNotMatch(none, /追加で支払う額\s+減る税額/);
    const low = run(["--revenue", "200万", "--expenses", "50万", "--social-insurance", "30万"]).stdout;
    assert.match(low, /小規模企業共済\s+769,000 円\s+82,600 円/);
    assert.match(low, /追加で支払う額の合計\s+769,000 円/);
    assert.doesNotMatch(low, /1,656,000/);
  });

  it("16 歳未満の扶養親族を入力すると、所得割の非課税限度額に反映する", () => {
    const args = ["--revenue", "215万", "--social-insurance", "35万", "--spouse-income", "0"];
    const without = run(args).stdout;
    assert.match(without, /住民税（令和9年度・均等割と森林環境税を含む）\s+104,000 円/);
    const r = run([...args, "--dependents-under16", "3"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /住民税（令和9年度・均等割と森林環境税を含む）\s+5,000 円/);
    assert.match(r.stdout, /非課税限度額（2,170,000 円/);
    assert.doesNotMatch(r.stdout, /控除上限額の目安/);
    assert.match(run(["--help"]).stdout, /--dependents-under16/);
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
    // 扶養親族がいれば、16 歳未満の人数から聞く
    // 売上 215万 / 経費 0 / 事業所得 / 白色 / 社保 35万 / iDeCo 0 / 共済 0 / ふるさと 0 / 配偶者 y・所得 0・70 歳未満 /
    // 扶養 y・16 歳未満 3・ほか 0 / その他 0
    const family = ["", "215万", "", "1", "none", "35万", "", "", "", "y", "0", "n", "y", "3", "", "", "", "", ""].join("\n") + "\n";
    const f = run(["-i", "--json"], family);
    assert.equal(f.code, 0, f.stderr);
    assert.equal(JSON.parse(f.stdout).input.dependents.under16, 3);
    assert.equal(JSON.parse(f.stdout).baseline.residentTax.total, 5_000);
    assert.match(f.stderr, /16 歳未満（人数）/);
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

describe("Skill と README の取得手順", () => {
  const read = (file: string): string => readFileSync(new URL(file, root), "utf8");
  const tag = `v${VERSION}`;

  it("取得するタグは、いまの版（package.json の version）と同じ", () => {
    for (const file of ["README.md", "skills/setsuzei/SKILL.md"]) {
      const text = read(file);
      const tags = [...text.matchAll(/(?:--branch |setsuzei#)(v\d+\.\d+\.\d+)/g)].map((m) => m[1]);
      assert.ok(tags.length >= 1, `${file}: タグの指定がない`);
      for (const found of tags) assert.equal(found, tag, file);
      // タグなしで GitHub から取得する記載を残さない（開発用の CONTRIBUTING.md は対象外）
      for (const line of text.split("\n")) {
        if (/git clone .*ozko00\/setsuzei/.test(line)) assert.match(line, new RegExp(`--branch ${tag.replace(/\./g, "\\.")}\\b`), `${file}: ${line.trim()}`);
        if (/github:ozko00\/setsuzei/.test(line)) assert.ok(line.includes(`github:ozko00/setsuzei#${tag}`), `${file}: ${line.trim()}`);
      }
    }
  });

  it("Skill: 取得の前に利用者の了承を得る。取得のコマンドは 1 つずつで、つながない", () => {
    const skill = read("skills/setsuzei/SKILL.md");
    assert.match(skill, /取得の前に、[^\n]*了承を得る/);
    assert.match(skill, /すでに使える CLI がないか確かめる/);
    assert.match(skill, /権限の確認で止まった・拒否されたとき/);
    // 取得はネットワークの一時的な失敗で止まることがある（名前解決の失敗を実際に観測した）。
    // clone に失敗したまま npm ci に進まないことと、やり直しは 1 回だけであることを書いておく
    assert.match(skill, /`git clone` がネットワークのエラーで失敗したとき[^\n]*`npm ci` には進まず[^\n]*もう一度だけ実行する[^\n]*2 回続けて失敗したら/);
    assert.match(read("README.md"), /Could not resolve host: github\.com[^\n]*同じ `git clone` をもう一度実行/);
    const blocks = [...skill.matchAll(/```sh\n([\s\S]*?)```/g)].map((m) => (m[1] ?? "").trim());
    const setup = blocks.filter((b) => /git clone|npm ci/.test(b));
    assert.equal(setup.length, 2);
    for (const block of setup) {
      assert.equal(block.split("\n").length, 1, block);
      assert.doesNotMatch(block, /&&|;|\|/, block);
    }
  });
});
