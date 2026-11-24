import { createInterface } from "node:readline";
import type { BlueReturn, TaxInput } from "../core/types.js";
import { InputError } from "../core/validate.js";
import { parseAmount } from "./amount.js";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** 端末で質問しながら入力を集める。 */
export async function askInteractively(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Promise<TaxInput> {
  // readline の question() はパイプ入力だと行を取りこぼすので、行をキューに貯めて順に渡す
  const rl = createInterface({ input, terminal: false });
  const lines: string[] = [];
  const waiters: ((line: string | null) => void)[] = [];
  let closed = false;
  rl.on("line", (line) => {
    const waiter = waiters.shift();
    if (waiter) waiter(line);
    else lines.push(line);
  });
  rl.on("close", () => {
    closed = true;
    for (const waiter of waiters.splice(0)) waiter(null);
  });
  const ask = async (prompt: string): Promise<string> => {
    output.write(prompt);
    const line = lines.shift() ?? (closed ? null : await new Promise<string | null>((resolve) => waiters.push(resolve)));
    if (line === null) {
      output.write("\n");
      throw new InputError(["入力が途中で終わりました"]);
    }
    return line;
  };
  const say = (text: string): void => void output.write(`${text}\n`);

  const amount = async (question: string): Promise<number> => {
    for (;;) {
      const answer = (await ask(`${question} [0]: `)).trim();
      if (answer === "") return 0;
      const value = parseAmount(answer);
      if (value !== null) return value;
      say("  金額は 6000000 / 6,000,000 / 600万 のように入力してください。");
    }
  };
  const choice = async <T extends string>(question: string, choices: readonly T[], fallback: T): Promise<T> => {
    for (;;) {
      const answer = (await ask(`${question} (${choices.join(" / ")}) [${fallback}]: `)).trim();
      if (answer === "") return fallback;
      if ((choices as readonly string[]).includes(answer)) return answer as T;
      say(`  ${choices.join(" / ")} のいずれかを入力してください。`);
    }
  };
  const yesNo = async (question: string): Promise<boolean> => (await choice(question, ["y", "n"], "n")) === "y";

  try {
    say("令和8年分（2026年分）の年間見込みを入力してください。金額は「600万」のようにも書けます。");
    say("わからない項目は Enter で 0 のまま進められます。");
    say("");
    const result: Mutable<TaxInput> = {};

    result.salaryRevenue = await amount("給与収入（会社員・副業の方。源泉徴収票の支払金額の見込み）");
    result.businessRevenue = await amount("フリーランス・副業の売上");
    if (result.businessRevenue > 0) {
      result.businessExpenses = await amount("その必要経費");
      const type = await choice("所得区分 1=事業所得 2=雑所得", ["1", "2"], "1");
      result.businessIncomeType = type === "1" ? "business" : "misc";
      if (result.businessIncomeType === "business") {
        result.blueReturn = await choice<BlueReturn>(
          "青色申告特別控除の見込み（none は白色申告）",
          ["none", "10", "55", "65"],
          "none",
        );
      }
    }
    result.socialInsurance = await amount("社会保険料（国民健康保険・国民年金・給与天引き分などの年額）");
    result.idecoPaid = await amount("iDeCo の掛金（年末までの拠出見込み）");
    if (result.businessRevenue > 0 && result.salaryRevenue === 0) {
      result.kyosaiPaid = await amount("小規模企業共済の掛金（年末までの支払見込み）");
    }
    result.furusatoPaid = await amount("ふるさと納税の寄附済み額");
    if (await yesNo("生計を一にする配偶者はいますか")) {
      const income = await amount("配偶者の合計所得金額（給与のみなら 収入 − 給与所得控除）");
      const age70OrOlder = await yesNo("配偶者は 70 歳以上ですか");
      result.spouse = { income, age70OrOlder };
    }
    if (await yesNo("扶養親族（16 歳以上）はいますか")) {
      const count = async (q: string): Promise<number> => await amount(`${q}（人数）`);
      result.dependents = {
        general: await count("16〜18 歳・23〜69 歳"),
        specific: await count("19〜22 歳"),
        elderlyCohabiting: await count("70 歳以上で同居している父母・祖父母など"),
        elderly: await count("70 歳以上（上記以外）"),
      };
    }
    result.otherDeductions = await amount("その他の所得控除の合計（医療費控除・生命保険料控除など）");
    say("");
    return result;
  } finally {
    rl.close();
  }
}
