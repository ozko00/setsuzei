import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// コンパイル後は .test-dist/test/ にあるので、リポジトリのルートは 2 つ上
const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (file: string): string => readFileSync(join(root, file), "utf8");
const list = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((name) => (statSync(join(root, dir, name)).isDirectory() ? list(join(dir, name)) : [join(dir, name)]));

describe("workflow（.github/workflows）", () => {
  const workflows = list(".github/workflows").filter((f) => /\.ya?ml$/.test(f));

  it("外部の action は、タグではなくコミット SHA で固定し、コメントに版を書く", () => {
    assert.ok(workflows.length >= 2);
    for (const file of workflows) {
      const uses = [...read(file).matchAll(/^\s*-?\s*uses:\s*(.+)$/gm)].map((m) => (m[1] ?? "").trim());
      assert.ok(uses.length > 0, file);
      for (const use of uses) assert.match(use, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, `${file}: ${use}`);
    }
    // 同じ action は、すべての workflow で同じコミットを使う
    const byAction = new Map<string, Set<string>>();
    for (const file of workflows) {
      for (const m of read(file).matchAll(/uses:\s*([\w.-]+\/[\w.-]+)@([0-9a-f]{40})/g)) {
        byAction.set(m[1] ?? "", (byAction.get(m[1] ?? "") ?? new Set()).add(m[2] ?? ""));
      }
    }
    for (const [action, shas] of byAction) assert.equal(shas.size, 1, action);
  });

  it("pull_request_target を使わず、権限は最小（読み取りだけ。公開の workflow だけ id-token: write）", () => {
    for (const file of workflows) {
      const text = read(file);
      assert.doesNotMatch(text, /pull_request_target|workflow_run/, file);
      const permissions = /^permissions:\n((?: {2}.+\n)+)/m.exec(text)?.[1];
      assert.ok(permissions, `${file}: 最上位の permissions がない`);
      const entries = Object.fromEntries(permissions.trim().split("\n").map((line) => line.replace(/#.*$/, "").trim().split(/:\s*/)));
      // 公開（npm・MCP Registry）の workflow だけ、OIDC のための id-token: write を持つ
      const expected = /(publish|mcp-registry)\.yml$/.test(file) ? { "id-token": "write", contents: "read" } : { contents: "read" };
      assert.deepEqual(entries, expected, file);
      // ジョブごとに権限を広げない。トークンや秘密の値を使わない
      assert.equal([...text.matchAll(/^\s*permissions:/gm)].length, 1, file);
      assert.doesNotMatch(text, /secrets\.|NODE_AUTH_TOKEN|NPM_TOKEN|write-all/, file);
    }
  });

  it("Dependabot: 型（@types/node）と TypeScript のメジャー更新は、自動では上げない", () => {
    const text = read(".github/dependabot.yml");
    for (const name of ["@types/node", "typescript"]) {
      assert.match(text, new RegExp(`dependency-name: "${name}"\\n\\s+update-types: \\["version-update:semver-major"\\]`), name);
    }
    // 型は、対応する Node.js の下限（engines.node）のメジャーを大きく超えない版にしておく
    const pkg = JSON.parse(read("package.json")) as { engines: { node: string }; devDependencies: Record<string, string> };
    assert.equal(pkg.engines.node, ">=20");
    assert.match(pkg.devDependencies["@types/node"] ?? "", /^\^2[02]\./);
  });

  it("Dependabot が、action と npm の依存を週 1 回確かめる", () => {
    const text = read(".github/dependabot.yml");
    for (const ecosystem of ["github-actions", "npm"]) {
      assert.match(text, new RegExp(`package-ecosystem: ${ecosystem}\\n\\s+directory: /\\n\\s+schedule:\\n\\s+interval: weekly`));
    }
  });
});

describe("公開ページ（docs/）", () => {
  const CSP =
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'";
  const pages = list("docs").filter((f) => f.endsWith("index.html"));

  it("どのページも、同じ Content-Security-Policy を持つ（弱めていない）", () => {
    // 日本語版 6 枚 + 英語版 6 枚
    assert.equal(pages.length, 12);
    for (const file of pages) {
      const html = read(file);
      const found = [...html.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/g)].map((m) => m[1]);
      assert.deepEqual(found, [CSP], file);
      assert.match(html, /<meta name="referrer" content="no-referrer">/, file);
      // ページの中に直接書いたスクリプトやイベント属性を置かない（CSP で動かないので、置けば壊れる）
      assert.doesNotMatch(html, /<script(?![^>]*type="application\/ld\+json")(?![^>]*src=)[^>]*>/, file);
      assert.doesNotMatch(html, /\son[a-z]+="/, file);
    }
  });

  it("端末への保存: 保存する項目と消し方を書いている。保存先に触るのは web/storage.js だけで、決まったキーにだけ書く", () => {
    const html = read("docs/index.html");
    assert.match(html, /入力欄の値（収入・経費・控除・家族の人数・払う額・年内に出せるお金）をこの端末のこのブラウザの中にだけ保存/);
    assert.match(html, /計算結果は保存しません。/);
    assert.match(html, /チェックを外すと、保存した内容をすぐに消します/);
    const en = read("docs/en/index.html");
    assert.match(en, /stored only in this browser on this device/);
    assert.match(en, /Results are not stored\. Nothing is sent anywhere\./);
    assert.match(en, /Untick it and the stored values are deleted at once/);
    const storage = read("docs/js/web/storage.js");
    assert.match(storage, /const KEY = "setsuzei:input:v1";/);
    for (const call of storage.matchAll(/localStorage\.(\w+)\(([^,)]*)/g)) {
      assert.ok(["getItem", "setItem", "removeItem"].includes(call[1] ?? ""), call[0]);
      assert.equal((call[2] ?? "").trim(), "KEY", call[0]);
    }
    // 保存した値を外へ出す手段（通信の API、Cookie、ほかの保存先）を、公開するスクリプトのどこにも置かない
    for (const file of list("docs/js")) {
      assert.doesNotMatch(read(file), /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|sessionStorage|indexedDB|document\.cookie|postMessage|window\.open)\b/, file);
    }
  });

  it("SECURITY.md に、報告のしかた・対応する版・扱うデータを書いている", () => {
    const text = read("SECURITY.md");
    assert.match(text, /security\/advisories\/new/);
    assert.match(text, /最新のリリースだけ/);
    assert.match(text, /connect-src 'none'/);
    assert.match(text, /setsuzei:input:v1/);
  });
});

describe("Agent Skill: 利用者の入力をコマンドに渡すときの決まり", () => {
  const skill = read("skills/setsuzei/SKILL.md");

  it("コマンドに入れるのは半角数字と決まった選択肢だけ。利用者の文字列をそのまま入れない", () => {
    assert.match(skill, /コマンドに入れてよいのは、半角数字の金額・人数と、決まった選択肢/);
    assert.match(skill, /利用者が書いた文字列を、そのままコマンドや JSON に入れない/);
    assert.match(skill, /コマンドに渡さず、利用者に聞き直す/);
    assert.match(skill, /実行するのは `setsuzei` CLI だけ/);
  });

  it("Skill に書いたコマンドの例は、数字と決まった選択肢だけでできている（変数の展開やコマンドの置き換えを使わない）", () => {
    const blocks = [...skill.matchAll(/```sh\n([\s\S]*?)```/g)].map((m) => m[1] ?? "");
    assert.ok(blocks.length >= 5);
    for (const block of blocks) assert.doesNotMatch(block, /\$\(|`|\$\{|\beval\b|\bsh -c\b|\bcurl\b|\bwget\b/, block);
  });
});
