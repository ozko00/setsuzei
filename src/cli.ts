#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { calculate } from "./core/calculate.js";
import type { TaxInput } from "./core/types.js";
import { InputError, validateInput } from "./core/validate.js";
import { flagsToInput, INPUT_BOOLEAN_FLAGS, INPUT_STRING_FLAGS, issueWithFlagName } from "./cli/flags.js";
import { formatResult } from "./cli/format.js";
import { askInteractively } from "./cli/interactive.js";
import { DEFAULT_YEAR, getSources, supportedYears } from "./data/index.js";
import { VERSION } from "./version.js";

const HELP = `setsuzei ${VERSION}
年末までに、あと何をすればいくら税金が減るかを概算します（令和8年分・フリーランス / 副業向け）。

使い方:
  setsuzei                       対話形式で入力
  setsuzei [オプション]          フラグで入力
  setsuzei --input FILE          JSON ファイルで入力（- で標準入力）。フラグを併用するとフラグが優先

金額は円。600万 / 6,000,000 / 6000000 のどの書き方でも指定できます。

収入:
  --salary 金額                  給与収入（源泉徴収票の支払金額の年間見込み）
  --revenue 金額                 フリーランス・副業の売上
  --expenses 金額                その必要経費
  --misc                         売上を雑所得として扱う（既定は事業所得）
  --blue none|10|55|65           現在見込んでいる青色申告特別控除（既定 none = 白色申告）

所得控除:
  --social-insurance 金額        社会保険料（国民健康保険・国民年金・給与天引き分など）
  --ideco-paid 金額              iDeCo の掛金（年末までの拠出見込み）
  --kyosai-paid 金額             小規模企業共済の掛金（年末までの支払見込み）
  --furusato-paid 金額           ふるさと納税の寄附済み額
  --other-deductions 金額        その他の所得控除の合計（医療費控除・生命保険料控除など）
  --other-deductions-resident 金額   同・住民税での金額（省略時は所得税と同額）

家族:
  --spouse-income 金額           配偶者の合計所得金額（配偶者がいる場合のみ。所得なしは 0）
  --spouse-70                    配偶者が 70 歳以上
  --dependents-under16 人数      16 歳未満の扶養親族（扶養控除はないが、住民税の所得割がかからなくなる
                                 所得の上限に関わる）
  --dependents 人数              扶養親族（16〜18 歳、23〜69 歳）
  --dependents-specific 人数     特定扶養親族（19〜22 歳）
  --dependents-elderly 人数      老人扶養親族（70 歳以上、同居老親等以外）
  --dependents-elderly-cohabiting 人数   同居老親等
  --income-adjustment            所得金額調整控除の対象（給与収入 850 万円超で、23 歳未満の扶養親族
                                 ＜16 歳未満の子を含む＞か特別障害者がいる場合。16 歳未満か 19〜22 歳の
                                 扶養親族を入力したときは自動で対象）

試算の条件:
  --ideco-limit 金額             iDeCo の年間拠出限度額（省略時は就業形態から推定）
  --ideco-add 金額               iDeCo に年内に追加できる額。指定したときだけ「まとめて実行した場合」の
                                 合計に含める（省略時は残り枠で単独の試算だけを出す。掛金額の変更は
                                 年 1 回で、年内に増やせるかは加入先と時期しだいのため）
  --kyosai-add 金額              小規模企業共済に追加する額（省略時は年間上限までの残り枠）
                                 どちらも、税額が減らなくなる額を超える分は計算に含めない
  --nhi-rate パーセント          国民健康保険料の所得割の料率の合計（例: 11.5）。指定すると、
                                 青色申告の区分による翌年度の国保料（所得割）の差の目安を出す
  --year 年                      年分（西暦）。対応: ${supportedYears().join(", ")}（既定 ${DEFAULT_YEAR}）

出力:
  --json                         JSON で出力
  --sources                      根拠にした一次情報の一覧を表示
  -i, --interactive              対話形式で入力
  -h, --help                     このヘルプ
  -v, --version                  バージョン

例:
  setsuzei --revenue 800万 --expenses 150万 --blue 65 --social-insurance 90万
  setsuzei --salary 600万 --revenue 120万 --expenses 20万 --misc --social-insurance 88万 --json

結果は概算です。税理士や税務署・市区町村の判断に代わるものではありません。
`;

const STRING_FLAGS = [...INPUT_STRING_FLAGS, "input"] as const;
const BOOLEAN_FLAGS = [...INPUT_BOOLEAN_FLAGS, "json", "sources", "interactive", "help", "version"] as const;

type Flags = Partial<Record<(typeof STRING_FLAGS)[number], string>> &
  Partial<Record<(typeof BOOLEAN_FLAGS)[number], boolean>>;

function parseFlags(argv: readonly string[]): Flags {
  const options: Record<string, { type: "string" | "boolean"; short?: string }> = {};
  for (const name of STRING_FLAGS) options[name] = { type: "string" };
  for (const name of BOOLEAN_FLAGS) options[name] = { type: "boolean" };
  options["help"] = { type: "boolean", short: "h" };
  options["version"] = { type: "boolean", short: "v" };
  options["interactive"] = { type: "boolean", short: "i" };
  // 「--revenue -100万」は、Node の parseArgs が値をオプションと取り違えて英語のエラーにするので先に弾く
  for (const [i, arg] of argv.entries()) {
    const next = argv[i + 1];
    if (!arg.startsWith("--") || next === undefined) continue;
    if (!(STRING_FLAGS as readonly string[]).includes(arg.slice(2))) continue;
    if (/^[-−ー－]\s*[0-9０-９.,，]/.test(next)) {
      throw new InputError([`${arg}: 0 以上の値で指定してください（受け取った値: ${JSON.stringify(next)}）`]);
    }
  }
  try {
    return parseArgs({ args: [...argv], options, strict: true, allowPositionals: false }).values as Flags;
  } catch (error) {
    throw new InputError([`${describeParseError(error)}（--help で使い方を表示）`]);
  }
}

/** Node の parseArgs のエラー（英語）を日本語にする。 */
function describeParseError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const option = /'(-{1,2}[^\s'=<]+)/.exec(message)?.[1];
  if (code === "ERR_PARSE_ARGS_UNKNOWN_OPTION" && option) return `${option}: 知らないオプションです`;
  if (code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE" && option) {
    return /does not take an argument/.test(message)
      ? `${option}: 値を取らないオプションです`
      : `${option}: 値を指定してください`;
  }
  if (code === "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL") {
    const value = /'([^']*)'/.exec(message)?.[1];
    return `オプションの付いていない値は指定できません${value === undefined ? "" : `（${JSON.stringify(value)}）`}`;
  }
  return `オプションを読めません（${message}）`;
}

function readJsonInput(path: string): Record<string, unknown> {
  let text: string;
  try {
    text = readFileSync(path === "-" ? 0 : path, "utf8");
  } catch (error) {
    throw new InputError([`--input: ${path} を読めません（${error instanceof Error ? error.message : String(error)}）`]);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new InputError([`--input: JSON として読めません（${error instanceof Error ? error.message : String(error)}）`]);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new InputError(["--input: JSON オブジェクトを指定してください"]);
  }
  return parsed as Record<string, unknown>;
}

async function main(argv: readonly string[]): Promise<number> {
  const wantsJson = argv.includes("--json");
  try {
    const flags = parseFlags(argv);
    if (flags.help) {
      process.stdout.write(HELP);
      return 0;
    }
    if (flags.version) {
      process.stdout.write(`${VERSION}\n`);
      return 0;
    }
    const fromFlags = flagsToInput(flags);
    if (flags.sources) {
      const year = typeof fromFlags["year"] === "number" ? fromFlags["year"] : DEFAULT_YEAR;
      const sources = getSources(year);
      process.stdout.write(
        flags.json
          ? `${JSON.stringify({ year, sources }, null, 2)}\n`
          : `${sources.map((s) => `${s.title}\n  ${s.url}`).join("\n")}\n`,
      );
      return 0;
    }

    let input: TaxInput;
    const hasInputFlags = Object.keys(fromFlags).some((key) => key !== "year");
    if (flags.input !== undefined) {
      input = validateInput({ ...readJsonInput(flags.input), ...fromFlags });
    } else if (hasInputFlags && !flags.interactive) {
      input = validateInput(fromFlags);
    } else if (flags.interactive || (process.stdin.isTTY && process.stdout.isTTY)) {
      const answers = await askInteractively(process.stdin, process.stderr);
      input = validateInput({ ...answers, ...fromFlags });
    } else {
      throw new InputError([
        "入力がありません。--revenue などのフラグか --input FILE（標準入力は --input -）で指定してください（--help で使い方を表示）",
      ]);
    }

    const result = calculate(input);
    process.stdout.write(
      flags.json ? `${JSON.stringify({ version: VERSION, ...result }, null, 2)}\n` : `${formatResult(result, VERSION)}\n`,
    );
    return 0;
  } catch (error) {
    const known = error instanceof InputError || error instanceof RangeError;
    // フラグで入力した人には、項目名を JSON のキーではなくフラグ名で伝える（--input の JSON はキーのまま）
    const usesJsonInput = argv.some((arg) => arg === "--input" || arg.startsWith("--input="));
    const shown =
      error instanceof InputError && !usesJsonInput ? new InputError(error.issues.map(issueWithFlagName)) : error;
    const message = shown instanceof Error ? shown.message : String(shown);
    if (wantsJson) {
      const issues = shown instanceof InputError ? shown.issues : [message];
      process.stderr.write(`${JSON.stringify({ error: { message, issues } }, null, 2)}\n`);
    } else {
      process.stderr.write(`${known ? message : `予期しないエラー: ${message}`}\n`);
    }
    return known ? 2 : 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
