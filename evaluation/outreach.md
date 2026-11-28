# 掲載先への申請の記録

setsuzei を一覧・ディレクトリに載せてもらうために出した申請と、出さなかった先の理由の記録です。

## この取り組みの決まり

- 掲載条件を満たし、PR か Issue で受け付けていて、エージェントによる申請を断っていない先にだけ出す。同じ先に重ねて出さない。
- 申請の本文には事実だけを書き、エージェントが作った申請であることを明記する。
- 指摘が来たら対応する。
- **掲載と引き換えにスターを付ける（スターの交換にあたる）条件の先には出さない。**
- アカウントやフォームが要る先は、オーナーが判断して行う。

## 申請した先

| 日付 | 先 | 申請 | 状態（記録時） |
|---|---|---|---|
| 2026-11 | sickn33/agentic-awesome-skills | [#2541](https://github.com/sickn33/agentic-awesome-skills/pull/2541) | マージ済み |
| 2026-11 | sickn33/agentic-awesome-skills | [#2553](https://github.com/sickn33/agentic-awesome-skills/pull/2553)（Skill の固定版を 0.3.1 に） | 未マージ |
| 2026-11 | BehiSecc/awesome-claude-skills | [#1573](https://github.com/BehiSecc/awesome-claude-skills/pull/1573) | 未マージ |
| 2026-11-28 | karanb192/awesome-claude-skills（Finance & Tax） | [#834](https://github.com/karanb192/awesome-claude-skills/pull/834) | 未マージ |
| 2026-11-28 | BlockRunAI/awesome-finance-mcp（Community Contributions › Personal Finance） | [#184](https://github.com/BlockRunAI/awesome-finance-mcp/pull/184) | 未マージ |
| 2026-11-28 | TensorBlock/awesome-mcp-servers（Finance & Crypto） | [#7208](https://github.com/TensorBlock/awesome-mcp-servers/pull/7208) | 未マージ |
| 2026-11-28 | punkpeye/awesome-mcp-servers | 保留。README のバッジ（逆リンク）は置いた。ボットが「Glama のすべてのチェックを通ること」を求めるので、オーナーが Glama で Claim と Dockerfile の設定を済ませてから出す（下の「Glama」） | 保留 |

自動で取り込まれる先: 公式 MCP Registry（`io.github.ozko00/setsuzei` を登録）、Glama（自動で掲載。README にバッジを置いている）、Claude Marketplaces（クローラーが収集）、PulseMCP（公式 Registry から取り込むとされるが未確認）。

## 出さなかった先と理由

| 先 | 理由 |
|---|---|
| toolsdk-ai/toolsdk-mcp-registry | 申請の条件が「申請するアカウントで、このリポジトリにスターを付けること」。掲載と引き換えにスターを付けるのはスターの交換にあたるので、この取り組みの決まりで行わない（2026-11-28 にオーナーが判断） |
| hesreallyhim/awesome-claude-code | スター 100 以上・公開 14 日以上が条件で、申請は人が Web の Issue フォームで行うこと（エージェント不可）と明記されている |
| heilcheng/awesome-agent-skills | スター 20 以上・公開 14 日以上が条件（記録時はスター 0、公開 4 日） |
| JackyST0/awesome-agent-skills | スター 512 以上が条件 |
| VoltAgent/awesome-agent-skills | 実際の利用実績が条件で、作ったばかりの Skill は受け付けない |
| ComposioHQ/awesome-claude-skills、travisvn/awesome-claude-skills、libukai・skillmatic-ai の awesome-agent-skills、YuzeHao2023/Awesome-MCP-Servers、composio-community/awesome-claude-plugins、jqueryscript/awesome-claude-code、ccplugins/awesome-claude-code-plugins | PR の処理が止まっている（数か月マージがない、または未処理が 200 件以上で 30 日のマージが 1 件以下） |
| appcypher/awesome-mcp-servers | アーカイブ済み |
| modelcontextprotocol/servers | 外部の PR を受け付けず、公式 Registry への登録を案内している（登録済み） |
| mcpservers.org、mcp.so、MCP Market、Anthropic の公式ディレクトリ、cursor.directory、Smithery | Web フォーム・アカウント・メールアドレス（Anthropic は有料プラン）が要るので、オーナーが判断して行う |
| 日本向け・税・家計・FIRE・在日外国人向けの一覧 | 調べた範囲で、活動中で setsuzei に合う一覧が見つからなかった |

調査の詳細（各先の掲載条件・申請方法・最終更新日・PR の処理状況）は、2026-11-28 の調査で確かめたものです。条件は変わるので、出し直す前に各先の説明を読み直してください。

## Glama（punkpeye/awesome-mcp-servers に出す前の準備）

punkpeye/awesome-mcp-servers の CONTRIBUTING の条件は「Glama の掲載ページへの逆リンク」で、README のバッジで満たしている。ただし同リポジトリのボット（`glama-check`）は、Glama に掲載され**すべてのチェックを通ること**（Dockerfile は Glama 上で直接足す。サーバーが起動して introspection に応答すればよい）を求めている。setsuzei の掲載ページ（<https://glama.ai/mcp/servers/ozko00/setsuzei>）は Glama が自動で載せたもので、2026-11-28 時点で「デプロイ可能なリリースがない」状態だった（バッジの評価は B）。チェックで落ちると分かっている PR は出さない。

### Glama の公式の説明で確かめたこと（2026-11-28）

- 掲載の管理（[FAQ](https://glama.ai/mcp/faq)）: 管理者になると、表示名・説明・分類・README を **Admin → Listing** で、ビルドの指定（build spec）と環境変数を **Admin → Dockerfile** で設定できる。リポジトリ直下の `glama.json` は、管理できる GitHub ユーザーを指定するだけ（組織が持つリポジトリのとき）。
- 管理者の確認（[Methodology](https://glama.ai/mcp/methodology) 1.1）: GitHub OAuth で認証し、リポジトリへの書き込み権か管理権があることを確かめる。持ち主でない人は登録・管理できない。
- ビルドと検査（同 1.3・1.4）: サーバーは Dockerfile（管理者がリポジトリに置いたもの、または Glama の AI が推定したもの）からビルドし、隔離された Firecracker の VM で動かす。動かしながら MCP の introspection（`tools/list`・`resources/list`・`prompts/list` とスキーマ）を行う。AI の推定でビルドできないと、掲載ページは残るが検索や分類には出ない。
- 同期（同 1.2）: 直近 1 日以内に push したリポジトリは 1 時間ごと、1 週間以内は毎日、それ以外は毎週。管理者はいつでも同期できる。
- ベースイメージや起動コマンドの書き方の決まりは、公式の説明には見つからなかった。第三者の記録には「Admin → Dockerfile は Dockerfile の貼り付けではなく、Node の版・ビルドの手順・環境変数などの項目を入れると Dockerfile が作られる」「Deploy → ビルドのテスト → Make Release」とあるが、Glama の公式の説明ではない。

### 用意した Dockerfile

公開済みの `setsuzei@0.6.1` の MCP サーバー（stdio）を起動するだけのもの。実行時に npm から取りに行かないよう、ビルドのときに入れる（`npx -y setsuzei@0.6.1 mcp` と同じサーバー）。

```dockerfile
FROM node:22-alpine
RUN npm install -g setsuzei@0.6.1 && npm cache clean --force
USER node
CMD ["setsuzei", "mcp"]
```

Admin → Dockerfile が項目を入れる形式のときは、次の値に当たる: Node.js 22、ビルドの手順 `npm install -g setsuzei@0.6.1`、起動コマンド `setsuzei mcp`（引数なし）、環境変数なし。版を上げたら `0.6.1` の部分も上げる。

### 手元で確かめたこと（2026-11-28、Docker。0.6.0 と 0.6.1 の両方で同じ結果）

- 上の Dockerfile でビルドできた（イメージ 170 MB）。
- `docker run -i --network none`（ネットワークなし）で起動し、標準入力から MCP のメッセージを送った結果: `initialize` はサーバー名 `setsuzei`・版 `0.6.1`・capabilities は `tools` だけ。`tools/list` は 5 つ（`estimate_tax_savings`、`furusato_nozei_limit`、`compare_furusato_limit_with_2025`、`validate_tax_input`、`list_tax_sources`）。`tools/call`（`furusato_nozei_limit`、給与 500 万円・社会保険料 75 万円）は上限 57,000 円を返した。
- `resources/list` と `prompts/list` は `-32601 Method not found`。setsuzei はツールだけを公開していて、capabilities に resources・prompts を宣言していないので、MCP の仕様どおりの応答。Glama がこれを失敗と見るかは、Glama でのビルドの結果で確かめる。

### オーナーの手順（10〜15 分）

1. <https://glama.ai/mcp/servers/ozko00/setsuzei> を開き、ページ上部の **Sign In** から **GitHub** でサインインする（ozko00 のアカウント。リポジトリの管理権があることを Glama が確かめる）。
2. 掲載ページの **Claim** を押して、管理者になる。
3. 掲載ページのタブ（Overview・Schema・Source・Related Servers・Discussions・**Admin**）の **Admin** → **Dockerfile** を開く。
   - Dockerfile を貼る欄なら、上の 4 行を貼る。
   - 項目を入れる形式なら、Node.js 22、ビルドの手順 `npm install -g setsuzei@0.6.1`、起動コマンド `setsuzei mcp`、環境変数なしを入れる。
4. 保存してビルドを始める（ボタンの名前は画面に従う。第三者の記録では **Deploy**）。ビルドのテストが成功し、ツールが 5 つ見つかったことを確かめる。リリースを作るボタン（第三者の記録では **Make Release**）があれば押す。
5. 掲載ページの「デプロイ可能なリリースがない」の表示が消え、**Schema**（ツールの一覧）に 5 つのツールが出ていることを確かめる。
6. 終わったら、エージェントに「punkpeye/awesome-mcp-servers へ 1 件だけ PR を出す」と伝える。

うまくいかないとき: Admin → Dockerfile の画面の名前や形式が上と違う場合は、そのまま画面の表示に従い、Glama の [Support](https://glama.ai/support) か Discord に問い合わせる。

代わりの方法: Glama は「管理者がリポジトリに置いた Dockerfile」でもビルドする（Methodology 1.3）。リポジトリに Dockerfile を置く場合は、オーナーの判断で別に PR にする。

## 検索順位の点検（2026-11-28）

外の一覧に頼る前に、npm と GitHub の中の検索で見つかるかを測った。点検前は v0.6.0、点検後は v0.6.1（npm の説明を英語の 1 文目に、keywords に `mcp`・`mcp-server`・`model-context-protocol`・`claude`・`tax-calculator`・`kakutei-shinkoku`・`furusato`・`income-tax` などを足した）。GitHub の About と topics は、測った時点ではまだ変えていない。

測り方: npm は registry の検索 API（`/-/v1/search`、上位 250 件まで）、GitHub はリポジトリ検索 API（`search/repositories`、既定の best match、上位 300 件まで）。表の「n/全体」は順位と、その検索語で出る件数。`-` は範囲内に出ないこと。`gh search repos "a b c"` は語の並びを 1 つの語句として検索するので、使わない（同じ語でも API と結果が違った）。

| 検索語 | npm 点検前 | npm 点検後 | GitHub 点検前 | GitHub 点検後 |
|---|---|---|---|---|
| mcp japan tax | - / 148,931 | - / 148,936 | 15 / 16 | 15 / 16 |
| japan tax | - / 5,367 | - / 5,368 | 245 / 254 | 245 / 254 |
| japanese tax | - / 10,124 | - / 10,125 | 177 / 195 | 177 / 195 |
| mcp tax | - | - | - / 705 | - / 705 |
| mcp server tax | - | - | - / 351 | - / 351 |
| furusato nozei | 5 / 5 | 5 / 5 | 24 / 25 | 24 / 25 |
| furusato | 5 / 5 | 5 / 5 | 276 / 278 | 276 / 278 |
| ideco | 10 / 10 | 10 / 10 | - / 351 | - / 351 |
| japan income tax | - / 6,450 | - / 6,451 | 21 / 22 | 21 / 22 |
| tax calculator japan | - | - | - / 45（説明に calculator がない） | - / 45 |
| mcp finance japan | - | - | - / 19（finance の語がない） | - / 19 |
| freelance tax japan | - | - | 7 / 7 | 7 / 7 |
| ふるさと納税 | - / 7,298 | - / 7,300 | - / 67（説明に日本語の語がない） | - / 67 |
| 確定申告 | - / 97,337 | - / 97,342 | - / 106 | - / 106 |

npm のキーワード指定の検索（点検後に測った。点検前は該当するキーワードがなかったものは「一致しない」）:

| 検索語 | 点検前 | 点検後 |
|---|---|---|
| keywords:japan keywords:tax | 19 / 19 | 19 / 19 |
| keywords:mcp-server keywords:japan | 一致しない | 20 / 20 |
| keywords:mcp-server keywords:tax | 一致しない | 23 / 24 |
| keywords:mcp keywords:tax | 一致しない | 133 / 137 |
| keywords:income-tax keywords:japan | 一致しない | 2 / 2 |
| keywords:tax-calculator | 一致しない | 34 / 34 |
| keywords:kakutei-shinkoku | 一致しない | 1 / 1 |
| keywords:furusato | 一致しない | 1 / 1 |
| keywords:ideco | 未測定（keywords にはあった） | 2 / 2 |

わかったこと:

- 自由入力の検索の順位は、npm も GitHub も変わらなかった。npm の自由入力は人気（ダウンロード数など）の重みが大きく、GitHub の best match はスター数の多いものが上に来るので、スター 0・ダウンロード 0 のうちは最下位に近い。説明やキーワードで変えられるのは「検索に一致するかどうか」と、キーワードで絞った検索での位置。
- npm は説明を 255 文字で切る（0.6.1 の説明は末尾が切れた。リポジトリでは 235 文字に縮めたので、次の公開から直る）。
- GitHub では、トピックと説明の語が検索に使われる。「calculator」「finance」と、日本語の「ふるさと納税」「確定申告」が説明・トピックにないので、その語の検索に一致しない。
