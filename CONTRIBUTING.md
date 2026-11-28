# setsuzei への参加のしかた

報告や修正の提案を歓迎します。このプロジェクトは税額を扱うので、**数値の正しさを一次情報でたどれること**を何より優先しています。

## まず Issue から

- 計算結果がおかしい → [「計算結果がおかしい」の Issue](https://github.com/ozko00/setsuzei/issues/new?template=wrong-result.yml)
- 対応してほしい制度・控除がある → [「対応してほしい制度」の Issue](https://github.com/ozko00/setsuzei/issues/new?template=new-measure.yml)

Issue には、実際の収入などをそのまま書く必要はありません。同じ結果が再現できる範囲で、丸めた金額に置き換えてください。Issue は誰でも読めます。

個別の税務相談（「私の場合はどう申告すればよいか」など）にはお答えできません。税理士か、所轄の税務署・市区町村の窓口に確認してください。

## 数値を変える変更には、一次情報の URL が必須です

税率・控除額・上限・所得要件・端数処理など、計算に使う数値や式を足す・直す変更は、次の 3 つがそろっていないとマージしません。

1. **一次情報の URL**。その数値が書かれているページ・条文そのものを示してください。
   - 一次情報として扱うもの: 国税庁（タックスアンサーなど）、総務省、厚生労働省、e-Gov 法令検索の条文、制度の運営主体（中小機構、国民年金基金連合会の iDeCo 公式サイトなど）、自治体の公式ページ
   - 一次情報として扱わないもの: 解説記事、金融機関や税理士事務所のコラム、Q&A サイト、AI の回答、記憶
2. **どの年分・年度の数値か**と、閲覧した日付。改正の施行日と適用開始の年分が違うことがあるので、適用開始がわかる記述も示してください。
3. **その数値を使うテスト**。できれば公的機関が公表している計算例と同じ結果になることを確かめるテスト、なければ境界値のテストを足してください。

数値は [`src/data/`](src/data) の年分ごとのファイルに置き、数値のすぐ上のコメントに出典の URL を書きます。計算コード（[`src/core/`](src/core)）の中に数値を直接書かないでください。

一次情報で確認できなかった数値は、実装しません。「確認できなかったので未対応」と README に書くほうを選びます。

## 開発の手順

Node.js 20 以上が必要です。

```sh
git clone https://github.com/ozko00/setsuzei.git
cd setsuzei
npm ci
npm run typecheck   # 型チェック
npm test            # テスト
npm run build:site  # web/・site/・src/ を変えたら実行し、docs/ の差分もコミットする
npm run test:browser  # 公開ページを Chrome で操作するテスト（下を参照）
```

`npm run test:browser` は、ヘッドレスの Chrome でトップと説明ページを開き、キーボードとマウスで入力して、画面の金額を同じ入力の CLI の結果と突き合わせます。空入力・誤入力の表示、所得区分の切り替え、スマホ幅（375px）でのはみ出し、コンソールのエラー、ページの外への通信がないことも見ます。Node.js 22 以上と Chrome / Chromium が必要です（場所は環境変数 `CHROME_BIN` でも指定できます）。依存パッケージは使いません。`npm test` には含めず、CI では別のジョブで実行しています。ページの欄や見出しを変えたら、[`test/browser/e2e.mjs`](test/browser/e2e.mjs) も合わせて直してください。

画面の使い勝手を変えたら、できれば「初めての人」に実際に操作してもらって確かめてください。`scripts/persona-browser.mjs` は、ヘッドレスの Chrome を「画面を見る・座標を押す・文字を打つ」だけで操作できるようにし、操作をすべて記録します（このプロジェクトを知らないエージェントに、人物像と課題だけを渡して使わせる想定です。使い方はファイルの先頭にあります）。これまでの確認の方法と結果、この方法の限界は [evaluation/usability.md](evaluation/usability.md) にまとめています。

- ブラウザ版で「社会保険料が分からない」ときに置く目安の数値は、[`src/data/2026-insurance-guide.ts`](src/data/2026-insurance-guide.ts) にあります。税額の計算には使わず、置いた額と幅を画面に示します。年度が変わったら、出典のページで確かめて更新してください。
- 入力をこの端末に保存する機能（[`web/storage.ts`](web/storage.ts)）は、利用者が選んだときだけ働きます。保存先に触るコードは、このファイルだけに置きます。
- 計算コアは実行時依存ゼロの純粋関数です。実行時の依存パッケージは増やしません。
- 金額は円の整数、割合は整数（パーセントなど）で扱い、浮動小数の誤差が出ないようにします。
- ブラウザ版（[`docs/`](docs)）は外部と通信しません。外部のスクリプト・フォント・解析ツールは入れません。
- `docs/js` はビルド結果です。`npm run build:site` を忘れるとテストが落ちます。
- CLI とブラウザ版は同じ入力で同じ数字になることをテストで確かめています。入力項目を足すときは、CLI のフラグ（[`src/cli/flags.ts`](src/cli/flags.ts)）とフォーム（[`docs/index.html`](docs/index.html)）の両方に足してください。
- 計算の前提や、計算しないものが変わる場合は、README の「何を計算し、何を計算しないか」も直してください。

### 英語版（docs/en/）

ブラウザ版には英語版があります（トップ [`docs/en/index.html`](docs/en/index.html) と、説明ページ 7 枚）。計算は日本語版と同じ計算コア・同じ画面のコードで、文面だけを言語ごとに持ちます。

- 文面の置き場所: 計算コアの注記・注意・入力エラーは [`src/core/messages.ts`](src/core/messages.ts)、画面の文面は [`web/messages.ts`](web/messages.ts)、説明ページの本文は [`site/pages-en.ts`](site/pages-en.ts)（日本語は [`site/pages.ts`](site/pages.ts)）、トップの固定の文面は `docs/index.html` と `docs/en/index.html`。**文面を足す・変えるときは、日本語と英語の両方を直します**（項目がそろっていることと、同じ入力で数字が変わらないことを [`test/english.test.ts`](test/english.test.ts) が確かめます）。
- 英語は逐語訳にせず、日本の制度を知らない人が読んで分かるように書きます。制度には一言ずつ説明を添え、金額は円のまま（`¥`）にします。書類や窓口で必要になる日本語（源泉徴収票、青色申告承認申請書 など）は、英語の横に添えます。
- 用語は、国税庁の英語の手引き（<https://www.nta.go.jp/english/taxes/individual/incometax_2025.htm>）にある言い方（blue return、final tax return、special income tax for reconstruction など）と、英語圏の利用者がふだん使う言い方（furusato nozei、resident tax、iDeCo）に合わせます。小規模企業共済は、中小機構の英語のページの呼び名（Small Business Mutual Aid）です。
- リンクは、公的機関に英語のページがあればそちらに張り、なければ日本語のページに「(Japanese only)」と添えます。英語のページとして張ってよい URL は `site/pages-en.ts` の `EN_LINKS` にあります（足すときは、開けることを確かめてください）。
- 日本語版と英語版は 1 対 1 です。ページを足すときは両方に足し、`hreflang`・相互リンク・sitemap がそろうようにします（テストが確かめます）。
- 計算の関数は `calculate(input, { locale: "en" })` で英語の文面を返します。CLI と MCP サーバーの出力は、いまは日本語だけです。

### 確定申告書の欄の対応（filing）

計算結果を確定申告書の欄に当てはめる部分は [`src/core/filing.ts`](src/core/filing.ts) にあります。欄の番号と名前は、国税庁が公開している「令和８年分の所得税等の確定申告書（案）」の第一表・第二表で確かめたものです（`FORM_2026.draft` が `true`）。

- **確定した様式が公開されたら**: 国税庁の「確定申告書等の様式・手引き等」から令和8年分の第一表・第二表を取り、`filing.ts` の欄の番号・名前と 1 つずつ照らし合わせます。違いがあれば直し、`FORM_2026` の `draft` を `false`、`sourceUrl` を確定した様式の URL にし、出典一覧（[`src/data/2026.ts`](src/data/2026.ts) の `sources2026`）と説明ページ（`site/pages.ts`・`site/pages-en.ts` の `form2026`）の文面も「案」を外します。
- 年分を足すときは、その年分の様式で同じことをします。欄の番号は年分ごとに変わることがあるので、前の年分の番号を流用しません。
- 金額はここでは計算しません。計算コアの結果を並べ直すだけにしてください（テスト [`test/deductions.test.ts`](test/deductions.test.ts) が、欄の金額と計算コアの値が同じことを確かめます）。

## Agent Skill を変えたとき

[`skills/setsuzei/SKILL.md`](skills/setsuzei/SKILL.md) を変えたら、実際にエージェントで通ることを確かめてください。テスト（`npm test`）が見るのは文面の決まりごとだけで、エージェントの振る舞いは見ません。

1. **聞き取り → CLI 実行 → 説明**: `npm ci` のあと `scripts/skill-e2e.sh` を実行します。Skill を入れた Claude Code に 2 回話しかけ、回答の金額を CLI の出力と突き合わせて PASS / FAIL を出します。Claude Code（ログイン済み）が必要で、利用枠を消費します。CI では実行していません。
2. **取得の手順**: SKILL.md の「CLI を用意する」にあるコマンドを、まっさらな環境でそのまま実行して確かめます。npm に公開済みの版なら、次のように Docker で試せます。

   ```sh
   docker run --rm node:22 npx --yes setsuzei@0.5.0 --version
   ```

   補足の手順（GitHub のタグから取得してビルド）は、`scripts/verify-install.sh` でくり返し実行できます（Node 20 / 22 / 24 / 26 で 10 回ずつ。出力はすべてログに残ります）。取得はネットワークに依存するので、失敗したらログのエラーの文面（`Could not resolve host` など）を先に確かめてください。

## Claude Code のプラグイン

このリポジトリは、そのまま Claude Code のマーケットプレイス兼プラグインです（[`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) と [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json)。プラグインの中身は、`skills/` の Skill と、npm の `setsuzei` を版を固定して起動する MCP サーバーの設定）。

- 仕様は Claude Code の公式ドキュメント（<https://code.claude.com/docs/en/plugins-reference>、<https://code.claude.com/docs/en/plugin-marketplaces>）で確かめてください。
- 変えたら `claude plugin validate .` を実行します。入れてみるには、`claude plugin marketplace add .` と `claude plugin install setsuzei@setsuzei`（自分の設定を汚したくなければ、環境変数 `CLAUDE_CONFIG_DIR` に一時フォルダを指定する）。
- `plugin.json` の `version` はいまの版に、MCP サーバーの `setsuzei@…` は npm に公開済みの版（`config.npmPinned`）にそろえます（テストが確かめます）。

## MCP サーバーを変えたとき

`setsuzei mcp`（[`src/mcp/`](src/mcp)）は、依存パッケージを使わずに MCP の JSON-RPC を処理しています。ツールは計算コアを呼ぶだけで、ここで税の計算はしません。

- 仕様は記憶で書かず、公式の仕様（<https://modelcontextprotocol.io/specification>）で確かめてください。現行の版（リクエストごとに版を名乗る方式）と、それ以前の版（接続時に版を決める方式）の両方に対応しています。
- 出力の形を変えたら、[`src/mcp/schema.ts`](src/mcp/schema.ts) のスキーマも合わせます。実際の出力がスキーマに合うことは `npm test` が確かめます。
- 標準出力には MCP のメッセージ以外を書きません。外部とは通信しません。
- 実際のクライアントでも確かめてください。公式の MCP Inspector なら、`npx -y @modelcontextprotocol/inspector --cli node dist/cli.js mcp --method tools/list` で一覧を、`--method tools/call --tool-name furusato_nozei_limit --tool-arg salaryRevenue=5000000` で呼び出しを試せます。
- 公式の MCP Registry への登録は、[`server.json`](server.json) と `package.json` の `mcpName` を使います。版を上げるときは `server.json` の 2 か所の版もそろえます（テストが確かめます）。登録は、その版が npm に出て動作を確かめたあとに、[`.github/workflows/mcp-registry.yml`](.github/workflows/mcp-registry.yml) をタグを選んで手で実行します（認証は GitHub Actions の OIDC。トークンは使いません）。

### リリースの手順

npm の固定版（`npx setsuzei@…` で案内する版）が、いつも npm に実在する版を指すように、次の順で進めます。

1. **リリースの PR**: `package.json`・`package-lock.json`・`src/version.ts`・`server.json`・`.claude-plugin/plugin.json` と、README・SKILL.md のタグ（`v0.4.0` のような表記）を新しい版にそろえます（そろっていないとテストが落ちます）。
   `npx setsuzei@…` で案内する版（`package.json` の `config.npmPinned` と、README・SKILL.md・この文書の表記）は、**その時点で npm に公開済みの最新の版**にします。これから出す版は、まだ npm にないので書きません。つまり固定版は、いつも 1 つ前の公開済みの版です。
2. **マージ → タグ**: CI が通ったらマージし、その版のタグ（`v0.4.0` の形）を push して GitHub Release を作ります。タグは付け直せないので、`package.json` の版と同じであることを push の前に確かめます。
3. **npm への公開**: タグの push で [`.github/workflows/publish.yml`](.github/workflows/publish.yml) が npm に公開し、公開された版を `npm view` で確かめます。トークンは使わず、npm の Trusted Publishing（GitHub Actions の OIDC）で認証します（npmjs.com 側の登録: リポジトリ `ozko00/setsuzei`、workflow のファイル名 `publish.yml`、environment は空欄。リポジトリの変数 `NPM_TRUSTED_PUBLISHING` が `true` の間、公開の失敗はそのまま失敗になります）。
4. **固定版を上げる**: 次のリリースの PR で、固定版を、公開を確かめた版に上げます（急ぐ理由があれば、公開の確認後に固定版だけを上げる PR を出しても構いません）。

固定版が npm に実在することは、CI（`README と Skill が案内している版が、npm に実在することを確かめる`）が毎回確かめます。固定版がいまの版より新しくないこと、表記がそろっていることは `npm test` が確かめます。

## プルリクエスト

- 1 つのプルリクエストには 1 つの変更をまとめてください。
- CI（Node.js 20 / 22 / 24 / 26 での型チェック・テスト・ビルド）が通ることを確認してください。
- 数値を変える場合は、本文に一次情報の URL と、変更前後で結果がどう変わるかの例を書いてください。

提供されたコードは [MIT License](LICENSE) で公開されます。
