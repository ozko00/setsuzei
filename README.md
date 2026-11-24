# setsuzei

> A CLI, TypeScript library, and Agent Skill that estimates how much Japanese income tax and resident tax a freelancer or side-job worker can still save before year-end.
> Covers furusato nozei (hometown tax donation) limits, iDeCo, Small Enterprise Mutual Aid, and the blue-return special deduction for tax year 2026 (Reiwa 8).
> Every rate and threshold is taken from primary sources (National Tax Agency, MIC, e-Gov) and cited in the data file. Estimates only; not tax advice.

**年末までに、あと何をすればいくら税金が減るか**を概算する道具です。フリーランス・副業のエンジニア向け。令和8年分（2026年分）に対応しています。

収入・経費・家族構成などを入れると、現状の所得税・住民税の見込みと、次の4つの節税策それぞれの軽減額を出します。

- ふるさと納税の控除上限額
- iDeCo（個人型確定拠出年金）
- 小規模企業共済
- 青色申告特別控除（10万円 / 55万円 / 65万円）の差

> [!IMPORTANT]
> 結果は概算です。税理士や税務署・市区町村の判断に代わるものではありません。重要な判断の前に、必ず専門家か所轄の窓口に確認してください。

## 出力例

売上 800 万円・経費 150 万円・青色申告 65 万円・社会保険料 90 万円で、iDeCo を年 27.6 万円、ふるさと納税を 3 万円済ませているフリーランスの場合:

```console
$ setsuzei --revenue 800万 --expenses 150万 --blue 65 --social-insurance 90万 --ideco-paid 27.6万 --furusato-paid 3万
setsuzei 0.1.0 ｜ 令和8年分（2026年分）の概算

■ 現状の見込み
  事業所得（青色申告特別控除 650,000 円を控除後）  5,850,000 円
  合計所得金額                                     5,850,000 円
  所得税の課税所得（税率 20%）                     3,976,000 円
  所得税 + 復興特別所得税                            375,400 円
  住民税（令和9年度・均等割と森林環境税を含む）      404,600 円
  税額の合計                                         780,000 円

■ 年末までにできることと、減る税額の目安
                                           合計      所得税     住民税
  ふるさと納税（あと 93,000 円）      93,000 円   19,000 円  74,000 円
  iDeCo（あと 540,000 円）           164,300 円  110,300 円  54,000 円
  小規模企業共済（あと 840,000 円）  241,700 円  154,800 円  86,900 円
  ※ それぞれ単独で実行した場合の軽減額です。組み合わせると合計は単純な足し算より小さくなることがあります。

  ◆ ふるさと納税
    控除上限額の目安（年間）              123,000 円
    寄附済み                               30,000 円
    上限までの残り                         93,000 円
    上限まで寄附した場合の自己負担          2,000 円
    下の iDeCo・共済を追加した場合の上限   73,000 円
    ・確定申告をする前提の目安です（確定申告をするとワンストップ特例の申請は無効になります）。
    ・所得や控除が見込みから動くと上限も変わります。上限ぎりぎりではなく余裕を持たせてください。
    ・iDeCo や小規模企業共済の掛金を増やすと、住民税の所得割額が減るため上限の目安も下がります。

  ◆ iDeCo（個人型確定拠出年金）
    年間上限                          816,000 円
    支払済み                          276,000 円
    残り枠                            540,000 円
    540,000 円を追加した場合の軽減額  164,300 円
    ・年間上限は国民年金第1号被保険者（月額 68,000 円）として計算しました。国民年金基金の掛金・付加保険料と合算した上限です。
    ・掛金額の変更は年1回で、手続きから反映まで時間がかかります。年末が近い場合は今年分に間に合わないことがあるので、金融機関（運営管理機関）に確認してください。

  ◆ 小規模企業共済
    年間上限                          840,000 円
    支払済み                                0 円
    残り枠                            840,000 円
    840,000 円を追加した場合の軽減額  241,700 円
    ・年間上限は掛金月額の上限 70,000 円 × 12 か月として計算しました。
    ・年内に支払った掛金（1年以内の前納分を含む）が控除の対象です。加入資格・掛金の増額や前納の手続きと締切は中小機構の案内で確認してください。

  ◆ 青色申告特別控除
                          税額の合計     現在との差
    白色申告（控除なし）  977,700 円  197,700 円 増
    青色 10万円           947,300 円  167,300 円 増
    青色 55万円           810,400 円   30,400 円 増
    青色 65万円           780,000 円       （現在）
    ・55万円: 複式簿記で記帳し、貸借対照表・損益計算書を付けて期限内に申告。65万円: それに加えて e-Tax で申告するか、優良な電子帳簿で保存。

■ 免責
  この結果は入力値と簡略化した前提にもとづく概算です。実際の税額は申告内容やお住まいの自治体によって変わります。税理士や税務署・市区町村の判断に代わるものではありません。重要な判断の前に、必ず専門家か所轄の窓口に確認してください。
  計算していないもの: 国民健康保険料、個人事業税、消費税、住民税の非課税判定、分離課税の所得、住宅ローン控除など。
  根拠にした一次情報の一覧は `setsuzei --sources` で表示できます。
```

## 30 秒で試す

Node.js 20 以上が必要です。

npm への公開後は、インストールなしで実行できます。

```sh
npx setsuzei          # 対話形式で入力
npx setsuzei --revenue 800万 --expenses 150万 --blue 65 --social-insurance 90万
```

**現在は npm に未公開です。** 公開までは、ソースからビルドして実行してください。

```sh
git clone https://github.com/ozko00/setsuzei.git
cd setsuzei
npm ci && npm run build
node dist/cli.js --revenue 800万 --expenses 150万 --blue 65 --social-insurance 90万
```

以下の例の `setsuzei` は、公開前は `node dist/cli.js` に読み替えてください。

## 使い方

### フラグで入力

金額は円です。`600万` / `6,000,000` / `6000000` のどの書き方でも指定できます。すべて**年間の見込み額**を入れます。

```sh
# 会社員の副業（雑所得）、配偶者控除あり、高校生の子 1 人
setsuzei --salary 600万 --revenue 120万 --expenses 20万 --misc \
  --social-insurance 88万 --spouse-income 0 --dependents 1
```

| フラグ | 内容 |
| --- | --- |
| `--salary` | 給与収入（源泉徴収票の「支払金額」） |
| `--revenue` / `--expenses` | フリーランス・副業の売上 / 必要経費 |
| `--misc` | 売上を雑所得として扱う（既定は事業所得） |
| `--blue none\|10\|55\|65` | 現在見込んでいる青色申告特別控除（既定 `none` = 白色申告） |
| `--social-insurance` | 社会保険料（国民健康保険・国民年金・給与天引き分など） |
| `--ideco-paid` / `--kyosai-paid` | iDeCo / 小規模企業共済の掛金（年末までの支払見込み） |
| `--furusato-paid` | ふるさと納税の寄附済み額 |
| `--spouse-income` / `--spouse-70` | 配偶者の合計所得金額 / 配偶者が 70 歳以上 |
| `--dependents` / `--dependents-specific` / `--dependents-elderly` / `--dependents-elderly-cohabiting` | 扶養親族の人数（16〜18 歳・23〜69 歳 / 19〜22 歳 / 70 歳以上 / 同居老親等） |
| `--other-deductions` | その他の所得控除の合計（医療費控除・生命保険料控除など） |
| `--ideco-limit` | iDeCo の年間拠出限度額（省略時は就業形態から推定） |
| `--ideco-add` / `--kyosai-add` | 追加する掛金（省略時は上限までの残り枠） |
| `--json` | JSON で出力 |
| `--sources` | 根拠にした一次情報の一覧 |

全部の一覧は `setsuzei --help` で確認できます。

### JSON で入力・出力

```sh
setsuzei --input examples/freelancer.json
echo '{"businessRevenue":8000000,"businessExpenses":1500000,"blueReturn":"65","socialInsurance":900000}' \
  | setsuzei --input - --json
```

入力のキーは [`src/core/types.ts`](src/core/types.ts) の `TaxInput`、出力は `SetsuzeiResult` です。入力に誤りがあると終了コード 2 で終わり、`--json` を付けていれば標準エラーに `{"error": {"issues": [...]}}` を出します。

### ライブラリとして使う

計算コアは実行時依存ゼロの純粋関数です。

```ts
import { calculate } from "setsuzei";

const result = calculate({
  businessRevenue: 8_000_000,
  businessExpenses: 1_500_000,
  blueReturn: "65",
  socialInsurance: 900_000,
});

result.baseline.totalTax;        // 現状の所得税 + 住民税
result.measures.furusato.limit;  // ふるさと納税の上限の目安
result.measures.ideco.saving;    // iDeCo を残り枠まで拠出した場合の軽減額
```

### Agent Skill として使う

[`skills/setsuzei/SKILL.md`](skills/setsuzei/SKILL.md) は、Claude Code などのエージェントが聞き取りをして、計算を必ずこの CLI に任せるための Skill です（モデルには税額を暗算させません）。

```sh
# Claude Code の場合: 個人用の Skill として置く
mkdir -p ~/.claude/skills && cp -r skills/setsuzei ~/.claude/skills/
```

そのうえで「今年あといくら節税できる？」のように聞くと、エージェントが必要な項目を質問し、CLI の結果をもとに答えます。

## 何を計算し、何を計算しないか

### 計算するもの

- 給与所得（給与所得控除）、事業所得・雑所得、合計所得金額
- 所得税と復興特別所得税（令和8年分）
- 住民税の所得割・調整控除・均等割・森林環境税（令和8年中の所得に課される令和9年度分）
- 所得控除: 基礎控除、配偶者控除・配偶者特別控除、扶養控除、社会保険料控除（入力値）、小規模企業共済等掛金控除、寄附金控除、その他（入力値）
- ふるさと納税: 自己負担が概ね 2,000 円で済む寄附額の上限の目安と、上限まで寄附した場合の軽減額・自己負担額
- iDeCo・小規模企業共済: 上限までの残り枠と、追加で拠出した場合の軽減額
- 青色申告特別控除: 白色 / 10 万円 / 55 万円 / 65 万円それぞれの税額と、現在の区分との差

### 計算しないもの

- 国民健康保険料・国民年金保険料・介護保険料の金額（所得が減ると国保料も下がる効果を含みません）
- 個人事業税、消費税（インボイス・2割特例など）、源泉徴収税額・予定納税の精算
- 住民税の非課税判定、自治体独自の均等割の上乗せや減免
- 分離課税の所得（株式・配当・不動産の譲渡など）、不動産所得、退職所得、一時所得、年金
- 住宅ローン控除などの税額控除、所得金額調整控除、特定親族特別控除、障害者・ひとり親・寡婦・勤労学生控除（所得控除は「その他の所得控除」に金額を入れれば反映できます）
- 損失の繰越控除、青色事業専従者給与、家事按分の妥当性
- iDeCo・小規模企業共済の受取時の課税、運用成績、手数料

### 簡略化している前提

- 入力はすべて「年末までの年間見込み額」として扱います。月割りや年の途中の変化は見ません。
- 社会保険料は入力値をそのまま社会保険料控除にします。国民健康保険料は自治体ごとに計算が違うため推定しません。
- 事業の所得は「売上 − 経費 − 青色申告特別控除」です。青色申告特別控除は事業所得の黒字が限度です。事業所得の赤字は給与所得と通算し、雑所得の赤字は通算しません。
- 給与所得は国税庁 No.1410 の計算式どおり（収入 660 万円未満は 4,000 円単位に切り下げ）に計算します。
- 住民税は標準税率（所得割 10%、均等割 4,000 円 + 森林環境税 1,000 円）で計算します。所得が少なくても非課税にはせず、均等割と森林環境税の 5,000 円を計上します。
- 住民税の「その他の所得控除」は、指定がなければ所得税と同額とします（実際は生命保険料控除などで額が違います。`--other-deductions-resident` で指定できます）。
- 税額の端数は、所得税 + 復興特別所得税、住民税の所得割とも 100 円未満を切り捨てます。源泉徴収や予定納税との精算前の年税額です。
- ふるさと納税の上限は「住民税所得割額 × 20% ÷（90% − 所得税率 × 1.021）+ 2,000 円」を 1,000 円未満切り捨てにした目安で、確定申告をする前提です（ワンストップ特例は扱いません）。ふるさと納税以外の寄附金は扱いません。
- iDeCo の年間上限は、給与収入がなければ国民年金第1号被保険者（月額 68,000 円 × 12）、給与収入があれば「企業年金のない会社員」（月額 23,000 円 × 12）と仮定します。企業年金がある方・公務員の方は `--ideco-limit` で指定してください。2026 年 12 月施行の限度額引上げは、12 月分の掛金が翌年 1 月の納付になるため、令和8年分には反映していません。
- 小規模企業共済は「掛金月額の上限 70,000 円 × 12 か月」を年間の上限とし、給与収入がある場合・雑所得の場合は対象外として計算しません。加入資格の判定はしません。
- 青色申告の区分の比較は税額の差だけを出します。その区分の要件（承認申請、複式簿記、e-Tax など）を満たせるかは判定しません。
- 各策の軽減額は、その策だけを実行した場合の額です。複数を同時に実行した場合の合計は出しません（iDeCo・共済を追加した場合のふるさと納税の上限だけは別に表示します）。
- 配偶者・扶養親族は、入力された人数・所得がそのまま控除の要件（生計を一にする、所得要件、年齢など）を満たすものとして扱います。

## 根拠にした一次情報

税率・控除額・上限などの数値は [`src/data/2026.ts`](src/data/2026.ts) にまとめ、数値ごとに出典の URL をコメントで付けています（2026-11-24 閲覧）。`setsuzei --sources` でも一覧を表示できます。

| 内容 | 出典 |
| --- | --- |
| 令和8年度税制改正（基礎控除・給与所得控除の引上げ等） | [国税庁 令和8年度税制改正による所得税の基礎控除の引上げ等について](https://www.nta.go.jp/users/gensen/2026kiso/index.htm) |
| 所得税の税率・復興特別所得税 | [国税庁 No.2260](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm)、[復興財源確保法 第13条](https://laws.e-gov.go.jp/law/423AC0000000117) |
| 基礎控除 | [国税庁 No.1199](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm) |
| 給与所得控除 | [国税庁 No.1410](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm) |
| 青色申告特別控除 | [国税庁 No.2072](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2072.htm) |
| 小規模企業共済等掛金控除 | [国税庁 No.1135](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1135.htm) |
| ふるさと納税（所得税） | [国税庁 No.1155](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1155.htm) |
| 配偶者控除・配偶者特別控除・扶養控除 | 国税庁 [No.1191](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1191.htm)、[No.1195](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1195.htm)、[No.1180](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1180.htm) |
| 住民税の税率・均等割・森林環境税 | [総務省 個人住民税](https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_06.html) |
| ふるさと納税（住民税） | [総務省 ふるさと納税ポータルサイト](https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/furusato/mechanism/deduction.html) |
| 住民税の所得控除・調整控除・寄附金税額控除・端数処理 | [地方税法](https://laws.e-gov.go.jp/law/325AC0000000226) 第20条の4の2、第314条の2、第314条の3、第314条の6、第314条の7 |
| 令和9年度住民税の改正点（扶養の所得要件など） | [江戸川区 令和9年度 税制改正の住民税における主な改正点](https://www.city.edogawa.tokyo.jp/e013/kurashi/zeikin/juminzei/r9kaisei.html) |
| iDeCo の拠出限度額 | [厚生労働省 2026年12月からiDeCoがパワーアップ！](https://www.mhlw.go.jp/web_magazine/column/20261020.html)、[iDeCo公式サイト](https://www.ideco-koushiki.jp/start/) |
| 小規模企業共済の掛金・加入資格 | 中小機構 [掛金](https://kyosai-web.smrj.go.jp/customer/skyosai/installment/index.html)、[加入資格](https://kyosai-web.smrj.go.jp/skyosai/entry/index_02.html) |

テストは、国税庁の具体例（No.2260）、給与所得の計算表（No.1410）、「源泉所得税の改正のあらまし」の対応表、中小機構が公表している節税額一覧表などを出典付きでテストケースにし、税率や控除額が切り替わる境界値も確かめています（[`test/`](test)）。

## 開発

```sh
npm ci
npm run typecheck   # 型チェック
npm test            # テスト（node:test）
npm run build       # dist/ にビルド
```

- 計算コア: [`src/core/`](src/core)（純粋関数、実行時依存なし）
- 年分ごとの税制データ: [`src/data/`](src/data)
- CLI: [`src/cli.ts`](src/cli.ts)、[`src/cli/`](src/cli)

数値の誤りや法令改正への追随漏れを見つけたら、一次情報の URL を添えて Issue を立ててください。

## 免責

このソフトウェアが出す数値は、入力値と上記の簡略化した前提にもとづく**概算**です。実際の税額は、申告内容・適用される特例・お住まいの自治体などによって変わります。税務の助言ではなく、税理士や税務署・市区町村の判断に代わるものではありません。このソフトウェアの利用によって生じた損害について、作者は責任を負いません（[MIT License](LICENSE)）。

## ライセンス

[MIT](LICENSE)
