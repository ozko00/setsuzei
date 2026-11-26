---
name: setsuzei
description: 日本のフリーランス・副業の人が「年末までに、あと何をすればいくら税金が減るか」を知りたいときに使う。ふるさと納税の控除上限額、iDeCo、小規模企業共済、青色申告特別控除（10万/55万/65万）による所得税・住民税の軽減額を、setsuzei CLI で概算する。節税、ふるさと納税の上限、iDeCo や小規模企業共済でいくら得か、青色申告の控除差、今年の税金の見込みを聞かれたら使う。
---

# setsuzei — 年末までの節税の概算

令和8年分（2026年分）の所得税と、それに対応する令和9年度の住民税を概算し、まだ間に合う節税策ごとの軽減額を出す。

## 守ること

- **税額を自分で計算しない。** 税率・控除額・上限を記憶から答えない。数字は必ず `setsuzei` CLI の出力から引用する。暗算・概算・「だいたい◯%」も行わない。
- CLI を実行できないときは、計算できないと伝える。推測の数字で代用しない。
- 結果は概算であり、税理士や税務署・市区町村の判断に代わらないことを、回答のたびに一言添える。
- 対象は次の4つだけ: ふるさと納税、iDeCo、小規模企業共済、青色申告特別控除。それ以外（医療費控除、法人化、経費の計上方法、消費税、個人事業税など）は計算できないと伝える。国民健康保険料は、料率が入力されたときに所得割の差の目安が出るだけで、保険料の全体額は計算できない。国保料の料率を記憶から答えない。
- 個別の申告判断（何が経費になるか、どの所得区分か、扶養に入れるか）は断定せず、税理士・税務署への確認をすすめる。

## 手順

### 1. 聞き取り

年間の**見込み額**を聞く。年の途中なら「12月までこのペースだと」で構わない。わからない項目は 0 のまま進め、あとで精度を上げる。一度に全部聞かず、まず必須の項目から。

必須:

| 聞くこと | JSON のキー |
| --- | --- |
| 給与収入（会社員・副業の人。源泉徴収票の「支払金額」） | `salaryRevenue` |
| フリーランス・副業の売上 | `businessRevenue` |
| その必要経費 | `businessExpenses` |
| 事業所得か雑所得か（開業届・青色申告の有無が目安。わからなければ本人に確認） | `businessIncomeType`: `"business"` / `"misc"` |
| 青色申告特別控除の見込み（白色は `"none"`） | `blueReturn`: `"none"` / `"10"` / `"55"` / `"65"` |
| 社会保険料の年額（国民健康保険・国民年金・給与天引き分） | `socialInsurance` |

あれば聞く:

| 聞くこと | JSON のキー |
| --- | --- |
| iDeCo の掛金（年末までの拠出見込み） | `idecoPaid` |
| 小規模企業共済の掛金（年末までの支払見込み） | `kyosaiPaid` |
| ふるさと納税の寄附済み額 | `furusatoPaid` |
| 生計を一にする配偶者の**合計所得金額**と、70歳以上か | `spouse`: `{ "income": 0, "age70OrOlder": false }` |
| 扶養親族の人数（16〜18歳・23〜69歳 / 19〜22歳 / 70歳以上 / 70歳以上で同居の父母・祖父母） | `dependents`: `{ "general", "specific", "elderly", "elderlyCohabiting" }` |
| 給与収入が 850 万円を超える人だけ: 23 歳未満の扶養親族（16 歳未満の子を含む）か、特別障害者（本人・同一生計配偶者・扶養親族）がいるか | `incomeAdjustment`: `true` |
| その他の所得控除の合計（医療費控除・生命保険料控除など、金額がわかる場合） | `otherDeductions` |
| iDeCo の年間上限（勤務先に企業年金がある人・公務員は上限が違うので本人に確認） | `idecoAnnualLimit` |
| 国民健康保険料の所得割の料率の合計（%。国保加入者で、自治体の料率がわかる場合だけ。推測で入れない） | `nhiIncomeRatePercent` |

注意:

- 金額はすべて**年額・円・整数**。「600万」は `6000000` に直す（単位の変換だけは行ってよい）。
- 配偶者は「年収」ではなく合計所得金額。給与だけの配偶者の年収しかわからない場合は、`setsuzei --salary <年収> --json`（実行方法は下の「3. 計算」）を実行して `baseline.salaryIncome` を使う（自分で給与所得控除を引かない）。
- 16歳未満の子は扶養控除の対象外なので人数に入れない。

### 2. CLI を用意する

計算は `setsuzei` CLI（v0.2.1）で行う。npm には未公開なので、GitHub の固定したタグから取得してビルドする。Node.js 20 以上と git が必要。

**先に、すでに使える CLI がないか確かめる。** 次のどちらかがバージョンを返せば、取得は不要なのでそれを使う。

```sh
setsuzei --version
```

```sh
node ~/.cache/setsuzei/dist/cli.js --version
```

どちらも使えないときだけ、取得する。**取得の前に、次の 3 点を利用者に伝えて了承を得る。** 了承がなければ取得しない。

- GitHub の `ozko00/setsuzei` のタグ `v0.2.1` を `~/.cache/setsuzei` に取得すること（約 30 MB）
- ビルドのために npm から `typescript` と `@types/node`（とその依存の `undici-types`）を入れること
- 計算そのものは手元だけで行い、入力した金額はどこにも送信しないこと

了承を得たら、次の 2 つのコマンドを **1 つずつ別々に** 実行する（`&&` や `;` でつながない。つなぐと、エージェントの権限設定で止まることがある）。

```sh
git clone --depth 1 --branch v0.2.1 https://github.com/ozko00/setsuzei.git ~/.cache/setsuzei
```

```sh
npm ci --prefix ~/.cache/setsuzei
```

`npm ci` がビルドまで行う。終わったら `node ~/.cache/setsuzei/dist/cli.js --version` が `0.2.1` を返すことを確かめる。

- タグは固定する。`main` や新しいタグに勝手に切り替えない。利用者が新しい版を求めたときだけ、その版のタグを確かめてから取得し直す。
- `~/.cache/setsuzei` が既にあって版が違う場合は、上書きや削除をせず、利用者にどうするか確認する。
- **コマンドが権限の確認で止まった・拒否されたとき** は、同じコマンドを言い換えて再実行しない。利用者に次のどちらかを頼む。
  - 上の 2 つのコマンドを利用者自身の端末で実行してもらう（終わったら教えてもらう）
  - このエージェントに、その 2 つのコマンドの実行を許可してもらう
- 取得もビルドもできないときは、計算できないと伝える。推測の数字で代用しない。代わりに、インストール不要のブラウザ版（https://ozko00.github.io/setsuzei/ ）を案内してよい。

### 3. 計算

入力を JSON にして CLI に渡し、`--json` で結果を受け取る。

```sh
echo '{"businessRevenue":8000000,"businessExpenses":1500000,"blueReturn":"65","socialInsurance":900000}' \
  | node ~/.cache/setsuzei/dist/cli.js --input - --json
```

- 以下 `setsuzei` と書いているコマンドは、手順 2 で使えることを確かめた CLI（`setsuzei` か `node ~/.cache/setsuzei/dist/cli.js`）のこと。
- パイプ（`echo ... |`）が権限の確認で止まる場合は、同じ入力をフラグで渡すと 1 つのコマンドで済む（例: `node ~/.cache/setsuzei/dist/cli.js --revenue 8000000 --expenses 1500000 --blue 65 --social-insurance 900000 --json`）。フラグの一覧は `--help` で確認する。
- 終了コード 2 は入力の誤り。標準エラーの `error.issues` を読んで直す。直せなければユーザーに確認する。
- 「iDeCo をあと10万円だけ」のような条件は `idecoAdditional` / `kyosaiAdditional` で指定して再実行する。条件を変えた比較は、条件ごとに CLI を実行する。差額を自分で按分しない。

### 4. 結果の読み方（JSON）

| 知りたいこと | 場所 |
| --- | --- |
| 現状の所得税（復興特別所得税込み） | `baseline.incomeTax.total` |
| 現状の住民税（均等割・森林環境税込み） | `baseline.residentTax.total` |
| ふるさと納税の上限の目安・残り | `measures.furusato.limit` / `.remaining` |
| 上限まで寄附した場合に追加で減る税額・自己負担 | `measures.furusato.saving` / `.outOfPocket` |
| iDeCo・共済も実行した場合のふるさと納税の上限 | `measures.furusato.limitAfterOtherMeasures` |
| 3つ（ふるさと納税・iDeCo・共済）を全部やった場合の軽減額の合計と、追加で支払う額 | `measures.combined.saving` / `.totalPayment` |
| iDeCo の残り枠と軽減額 | `measures.ideco.remaining` / `.saving` |
| 小規模企業共済の残り枠と軽減額 | `measures.kyosai.remaining` / `.saving` |
| 青色申告の区分ごとの税額と現在との差 | `measures.blueReturn.options[]` |
| 青色申告の区分による翌年度の国保料（所得割）の差（料率を入れたときだけ。なければ `null`） | `measures.nationalHealthInsurance.blueReturnOptions[]` |
| その策を計算できなかった理由 | 各 measure の `applicable: false` と `notes` |
| 入力に応じた注意 | `warnings` |

### 5. 伝え方

1. 現状の税額の見込み（所得税・住民税・合計）。
2. 策ごとに「いくら払うと、いくら減るか」。軽減額の大きい順に並べる。各策の `notes` にある条件や期限の注意を落とさずに伝える。
3. 組み合わせ: 各策の軽減額は単独で実行した場合のもの。全部やった場合の合計は `measures.combined.saving` を使う（各策の軽減額を自分で足さない）。iDeCo や共済を増やすとふるさと納税の上限は下がる（`limitAfterOtherMeasures`）ことも伝える。
4. iDeCo と小規模企業共済は「税が減る」だけでなく資金が原則として長期間引き出せなくなること、ふるさと納税は税の前払いに近く手取りが増えるわけではないことを添える。
5. `warnings` があれば伝える。
6. 概算であること・税理士や税務署の判断に代わらないことを最後に添える。根拠を聞かれたら `setsuzei --sources` の一覧を示す。
