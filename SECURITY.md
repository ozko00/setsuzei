# セキュリティについて

## 脆弱性の報告

脆弱性を見つけたら、公開の Issue ではなく、GitHub の非公開の報告で知らせてください。

- リポジトリの [Security → Report a vulnerability](https://github.com/ozko00/setsuzei/security/advisories/new) から送れます。
- 再現の手順と、影響があると考える範囲を書いてください。実際の収入などの数字は要りません（丸めた値に置き換えてください）。
- 個人で保守しているため、返信に数日かかることがあります。

計算結果が違う、という報告は脆弱性ではないので、通常の [Issue](https://github.com/ozko00/setsuzei/issues/new?template=wrong-result.yml) にお願いします。

## 対応する版

最新のリリースだけを直します。古い版への修正の取り込みは行いません。

## この道具が扱うデータ

- **CLI・ライブラリ**: 入力した金額は手元で計算するだけで、ネットワークを使いません。実行時の依存パッケージはありません。
- **ブラウザ版**（<https://ozko00.github.io/setsuzei/>）: 入力はページの中だけで計算し、外には送信しません。
  - Content-Security-Policy で、外部への接続（`connect-src 'none'`）、外部のスクリプト・スタイル、フォームの送信を禁止しています。アクセス解析は入れていません。
  - 説明ページから引き継いだ入力は、読み取ったあと URL から消します。
  - 「入力をこの端末に保存する」は、利用者が自分で選んだときだけ働きます。保存するのは入力欄の値（収入・経費・控除・家族の人数・払う額・年内に出せるお金など）で、保存先はその端末のそのブラウザの中（localStorage の `setsuzei:input:v1`）だけです。チェックを外すと消えます。既定では何も保存しません。
- **Agent Skill**: エージェントは、取得の前に利用者の了承を得てから、版を固定した CLI を実行します。CLI に渡すのは金額・人数・決まった選択肢だけです。

これらは、テスト（`npm test`、`npm run test:browser`）で確かめています。

## 配布物

- npm のパッケージは、GitHub Actions から npm の Trusted Publishing（OIDC）で公開する構成です（トークンをリポジトリに置きません）。この方法で公開した版には、npm が来歴（provenance）を自動で付けます。
- workflow で使う外部の action は、コミット SHA で固定しています。
