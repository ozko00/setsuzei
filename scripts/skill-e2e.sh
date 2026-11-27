#!/usr/bin/env bash
# Agent Skill（skills/setsuzei/SKILL.md）の実地確認。
#
# Skill を入れたエージェント（Claude Code）に、利用者として 2 回話しかける。
#   1 回目: 数字を渡さずに「あといくら節税できる？」と聞く → 必要な項目を聞き返すこと
#   2 回目: 数字を渡す → CLI を実行し、CLI の出力どおりの金額と「概算」の断りを答えること
# 2 回目の回答に出てくる金額を、同じ入力で CLI を直接実行した結果と突き合わせる。
#
# 使い方:
#   npm ci                      # 作業ツリーの CLI をビルド（dist/）
#   scripts/skill-e2e.sh        # 結果は PASS / FAIL。やり取りの全文は表示されたディレクトリに残る
#
# 必要なもの: Node.js 20 以上、Claude Code（`claude` コマンド。ログイン済み）。
# エージェントを 2 回実行するので、Claude Code の利用枠を消費する。CI では実行しない。
#
# 仕組み:
#   - 一時ディレクトリに、作業ツリーの Skill を .claude/skills/ として置いたプロジェクトを作る。
#   - 作業ツリーの CLI（dist/cli.js）を `setsuzei` コマンドとして PATH に置く。Skill の
#     「すでに使える CLI があればそれを使う」の経路を通るので、ホームディレクトリには何も書かない。
#   - エージェントに許可するのは、Skill の読み込みと、`setsuzei`・`echo`・`command` の実行だけ。
#     取得（npx setsuzei@<版>、補足の git clone / npm ci）の経路は、このスクリプトでは確かめない。
#     Docker で SKILL.md のコマンドを実行して確かめる（CONTRIBUTING.md を参照）。
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
command -v claude >/dev/null || { echo "claude コマンドが見つかりません（Claude Code が必要です）" >&2; exit 2; }
[ -f "$root/dist/cli.js" ] || { echo "dist/cli.js がありません。先に npm ci を実行してください" >&2; exit 2; }

work="$(mktemp -d "${TMPDIR:-/tmp}/setsuzei-skill-e2e.XXXXXX")"
mkdir -p "$work/project/.claude/skills" "$work/bin"
cp -r "$root/skills/setsuzei" "$work/project/.claude/skills/"
printf '#!/bin/sh\nexec node "%s/dist/cli.js" "$@"\n' "$root" > "$work/bin/setsuzei"
chmod +x "$work/bin/setsuzei"
export PATH="$work/bin:$PATH"

input='{"businessRevenue":8000000,"businessExpenses":1500000,"blueReturn":"65","socialInsurance":900000,"idecoPaid":276000,"furusatoPaid":30000}'
echo "$input" | setsuzei --input - --json > "$work/expected.json"

allowed='Skill,Read,Bash(setsuzei:*),Bash(echo:*),Bash(command:*)'
cd "$work/project"

echo "1 回目: 数字なしで聞く…"
claude -p "今年あといくら節税できるか知りたいです。フリーランスのエンジニアです。" \
  --allowedTools "$allowed" --output-format json < /dev/null > "$work/turn1.json"
session="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).session_id)' "$work/turn1.json")"

echo "2 回目: 数字を渡す…"
claude -p "売上 800万円、経費 150万円、青色申告 65万円（事業所得、開業届あり）、国民健康保険と国民年金で年 90万円、給与なし。iDeCo は今年 27.6万円、小規模企業共済は入っていません、ふるさと納税は 3万円済み。独身で扶養なし（16歳未満の子もいません）、ほかの控除はありません。setsuzei コマンドは使える状態です。" \
  --resume "$session" --allowedTools "$allowed" --output-format json < /dev/null > "$work/turn2.json"

node - "$work" <<'JS'
const fs = require("fs");
const dir = process.argv[2];
const read = (name) => JSON.parse(fs.readFileSync(`${dir}/${name}`, "utf8"));
const turn1 = read("turn1.json").result ?? "";
const turn2 = read("turn2.json").result ?? "";
const expected = read("expected.json");
fs.writeFileSync(`${dir}/turn1.md`, turn1);
fs.writeFileSync(`${dir}/turn2.md`, turn2);

const yen = (n) => n.toLocaleString("en-US");
const checks = [];
const check = (name, ok) => checks.push([name, ok]);

// 1 回目: 聞き取り。必須の項目を聞いていて、税額の数字はまだ出していない
for (const word of ["売上", "経費", "社会保険料"]) check(`1 回目: 「${word}」を聞いている`, turn1.includes(word));
check("1 回目: まだ税額を答えていない", !turn1.includes(yen(expected.baseline.totalTax)));

// 2 回目: CLI の出力どおりの金額
const m = expected.measures;
const figures = {
  "現状の税額の合計": expected.baseline.totalTax,
  "現状の所得税": expected.baseline.incomeTax.total,
  "現状の住民税": expected.baseline.residentTax.total,
  "ふるさと納税の上限の目安": m.furusato.limit,
  "iDeCo の軽減額": m.ideco.saving.total,
  "小規模企業共済の軽減額": m.kyosai.saving.total,
  "小規模企業共済に追加で支払う額": m.kyosai.additional,
  "まとめて実行した場合の軽減額": m.combined.saving.total,
  "まとめて実行した場合に追加で支払う額": m.combined.totalPayment,
};
for (const [name, value] of Object.entries(figures)) check(`2 回目: ${name} ${yen(value)} 円`, turn2.includes(yen(value)));
// 減る税額だけでなく、資金の拘束・受取時の課税・ふるさと納税の性質・iDeCo が年内に間に合うかを伝えている
check("2 回目: iDeCo は 60 歳まで引き出せない旨", /60 ?歳/.test(turn2));
check("2 回目: ふるさと納税で手元のお金は増えない旨", /返礼品|手取り|手元/.test(turn2));
check("2 回目: iDeCo を年内に増やせるかは加入先しだいである旨", /年内|間に合|加入先|運営管理機関/.test(turn2));
check("2 回目: 受取時に課税がある旨", /受け取るとき|受取時|受け取り時/.test(turn2));
check("2 回目: 概算である旨", turn2.includes("概算"));
check("2 回目: 税理士・税務署の判断に代わらない旨", /税理士|税務署/.test(turn2));
const denials = read("turn2.json").permission_denials ?? [];
check("2 回目: 権限で止まったコマンドがない", denials.length === 0);

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failed++;
}
console.log(failed === 0 ? "\nPASS" : `\nFAIL（${failed} 件）`);
console.log(`やり取りの全文: ${dir}/turn1.md, ${dir}/turn2.md`);
process.exit(failed === 0 ? 0 : 1);
JS
