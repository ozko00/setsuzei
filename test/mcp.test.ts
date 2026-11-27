import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { calculate, compareFurusatoLimit } from "../src/core/calculate.js";
import { getSources } from "../src/data/index.js";
import { LEGACY_VERSIONS, McpServer, MODERN_VERSIONS } from "../src/mcp/server.js";
import { TOOLS } from "../src/mcp/tools.js";
import type { JsonSchema } from "../src/mcp/schema.js";
import { VERSION } from "../src/version.js";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
type Json = Record<string, any>;

/** サーバーのプロセスに、メッセージを 1 行ずつ流して、返ってきた行を読む */
function talk(messages: readonly unknown[]): { replies: Json[]; stdout: string; stderr: string; status: number | null } {
  const input = messages.map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join("\n") + "\n";
  const r = spawnSync(process.execPath, [cli, "mcp"], { input, encoding: "utf8" });
  return { replies: r.stdout.split("\n").filter((l) => l !== "").map((l) => JSON.parse(l) as Json), stdout: r.stdout, stderr: r.stderr, status: r.status };
}

/** テスト用の小さな JSON Schema の検査（このリポジトリのスキーマが使う語だけ）。問題の一覧を返す。 */
function check(schema: JsonSchema, value: unknown, path = "$"): string[] {
  const s = schema as Json;
  if (s["anyOf"]) {
    return (s["anyOf"] as JsonSchema[]).some((option) => check(option, value, path).length === 0) ? [] : [`${path}: anyOf のどれにも合わない`];
  }
  const issues: string[] = [];
  const typeOf = value === null ? "null" : Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value;
  if (s["type"] && !(s["type"] === typeOf || (s["type"] === "number" && typeOf === "integer"))) return [`${path}: ${s["type"]} ではなく ${typeOf}`];
  if (s["enum"] && !(s["enum"] as unknown[]).includes(value)) issues.push(`${path}: enum にない値 ${JSON.stringify(value)}`);
  if ("const" in s && s["const"] !== value) issues.push(`${path}: const と違う`);
  if (typeof s["minimum"] === "number" && typeof value === "number" && value < s["minimum"]) issues.push(`${path}: minimum 未満`);
  if (typeOf === "object") {
    const object = value as Json;
    const properties = (s["properties"] ?? {}) as Record<string, JsonSchema>;
    for (const key of (s["required"] ?? []) as string[]) if (!(key in object)) issues.push(`${path}.${key}: ない`);
    for (const [key, child] of Object.entries(object)) {
      if (properties[key]) issues.push(...check(properties[key], child, `${path}.${key}`));
      else if (s["additionalProperties"] === false) issues.push(`${path}.${key}: スキーマにない項目`);
    }
  }
  if (typeOf === "array" && s["items"]) (value as unknown[]).forEach((item, i) => issues.push(...check(s["items"] as JsonSchema, item, `${path}[${i}]`)));
  return issues;
}

const INIT = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "0" } } };
const READY = { jsonrpc: "2.0", method: "notifications/initialized" };
const MODERN_META = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {} };
const call = (id: number, name: string, args: Json, meta?: Json): Json => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) } });

const INPUTS: readonly Json[] = [
  { businessRevenue: 8_000_000, businessExpenses: 1_500_000, blueReturn: "65", socialInsurance: 900_000, idecoPaid: 276_000, furusatoPaid: 30_000 },
  { salaryRevenue: 6_000_000, businessRevenue: 1_200_000, businessExpenses: 200_000, businessIncomeType: "misc", socialInsurance: 880_000, spouse: { income: 0 }, dependents: { general: 1 } },
  { businessRevenue: 1_050_000, businessExpenses: 450_000, socialInsurance: 60_000 },
  { businessRevenue: 8_000_000, businessExpenses: 1_500_000, blueReturn: "55", socialInsurance: 900_000, nhiIncomeRatePercent: 11.5, idecoAdditional: 100_000 },
  { salaryRevenue: 12_000_000, socialInsurance: 1_500_000, spouse: { income: 0, age70OrOlder: true }, dependents: { under16: 2, specific: 1 } },
];

describe("MCP サーバー（setsuzei mcp）: 接続", () => {
  it("initialize で版を決める方式: 求められた版が対応済みならその版、未対応なら対応している最新の版で答える", () => {
    for (const version of LEGACY_VERSIONS) {
      const { replies } = talk([{ ...INIT, params: { ...INIT.params, protocolVersion: version } }]);
      assert.equal(replies[0]?.["result"].protocolVersion, version);
    }
    const { replies } = talk([{ ...INIT, params: { ...INIT.params, protocolVersion: "1999-01-01" } }, READY, { jsonrpc: "2.0", id: 2, method: "ping" }]);
    assert.equal(replies.length, 2, "通知には応答しない");
    assert.deepEqual(replies[0]?.["result"], {
      protocolVersion: LEGACY_VERSIONS[0],
      capabilities: { tools: {} },
      serverInfo: { name: "setsuzei", title: "setsuzei: Japanese tax estimate engine", version: VERSION },
      instructions: replies[0]?.["result"].instructions,
    });
    assert.match(replies[0]?.["result"].instructions, /Do not do the tax arithmetic yourself/);
    assert.deepEqual(replies[1], { jsonrpc: "2.0", id: 2, result: {} });
  });

  it("リクエストごとに版を名乗る方式（2026-07-28）: server/discover に答え、結果に resultType・serverInfo・ttlMs・cacheScope を付ける", () => {
    const { replies } = talk([
      { jsonrpc: "2.0", id: "d", method: "server/discover", params: { _meta: MODERN_META } },
      { jsonrpc: "2.0", id: "l", method: "tools/list", params: { _meta: MODERN_META } },
      call(3, "list_tax_sources", {}, MODERN_META),
    ]);
    const [discover, list, called] = replies.map((r) => r["result"] as Json);
    assert.deepEqual(discover?.["supportedVersions"], [...MODERN_VERSIONS]);
    assert.deepEqual(discover?.["capabilities"], { tools: {} });
    for (const result of [discover, list, called]) {
      assert.equal(result?.["resultType"], "complete");
      assert.deepEqual(result?.["_meta"], { "io.modelcontextprotocol/serverInfo": { name: "setsuzei", title: "setsuzei: Japanese tax estimate engine", version: VERSION } });
    }
    for (const result of [discover, list]) {
      assert.equal(result?.["ttlMs"], 3_600_000);
      assert.equal(result?.["cacheScope"], "public");
    }
    assert.equal(called?.["isError"], false);
  });

  it("対応していない版を名乗られたら、対応している版の一覧を付けて -32022 を返す", () => {
    const { replies } = talk([{ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { "io.modelcontextprotocol/protocolVersion": "1900-01-01" } } }]);
    assert.deepEqual(replies[0]?.["error"], { code: -32022, message: "Unsupported protocol version", data: { supported: [...MODERN_VERSIONS], requested: "1900-01-01" } });
  });

  it("壊れた行・JSON-RPC でないもの・知らないメソッド・知らないツールは、決まったエラーコードで返す。標準出力には MCP のメッセージしか書かない", () => {
    const { replies, stdout, status } = talk([
      "{ not json",
      { hello: "world" },
      { jsonrpc: "2.0", id: 7, method: "resources/list" },
      call(8, "no_such_tool", {}),
      { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "estimate_tax_savings", arguments: [] } },
      { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1 } },
    ]);
    assert.deepEqual(replies.map((r) => [r["id"], r["error"]?.code]), [[null, -32700], [null, -32600], [7, -32601], [8, -32602], [9, -32602]]);
    assert.equal(replies[3]?.["error"].message, "Unknown tool: no_such_tool");
    // どの行も、改行を含まない 1 つの JSON-RPC メッセージ
    for (const line of stdout.split("\n").filter((l) => l !== "")) assert.equal((JSON.parse(line) as Json)["jsonrpc"], "2.0");
    // 標準入力が閉じたら、正常に終わる
    assert.equal(status, 0);
  });

  it("不正な入力で落ちない: 巨大な行、型の違う引数、入れ子の深い値、制御文字、空行。そのあとの正しいリクエストにも答える", () => {
    const huge = `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"estimate_tax_savings","arguments":{"x":"${"a".repeat(3_000_000)}"}}}`;
    let deep: unknown = 1;
    for (let i = 0; i < 2_000; i++) deep = [deep];
    const { replies, stdout, stderr, status } = talk([
      huge,
      "",
      "   ",
      "null",
      "[]",
      "123",
      '"text"',
      { jsonrpc: "2.0", id: 2, method: 42 },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: "not an object" },
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: 5 } },
      call(5, "estimate_tax_savings", { businessRevenue: 1e308, businessExpenses: -1, spouse: "yes", dependents: [1], blueReturn: 65, year: "2026" }),
      call(6, "estimate_tax_savings", { businessRevenue: deep }),
      call(7, "estimate_tax_savings", { businessRevenue: 8_000_000, note: "\u0000\u001b[31m\n\r" }),
      call(8, "list_tax_sources", { year: "2026" }),
      { jsonrpc: "2.0", id: { nested: true }, method: "ping" },
      { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "validate_tax_input", arguments: { __proto__: { polluted: true }, constructor: 1 } } },
      call(10, "furusato_nozei_limit", { salaryRevenue: 5_000_000, socialInsurance: 750_000 }),
    ]);
    assert.equal(status, 0, stderr);
    assert.equal(stderr, "");
    // 標準出力は、1 行に 1 つの JSON-RPC メッセージだけ（制御文字や改行がそのまま出ていない）
    const lines = stdout.split("\n").filter((l) => l !== "");
    for (const line of lines) {
      assert.equal((JSON.parse(line) as Json)["jsonrpc"], "2.0");
      assert.doesNotMatch(line, /[\u0000-\u001f]/);
    }
    assert.equal(replies[0]?.["error"].code, -32600, "巨大な行");
    assert.match(replies[0]?.["error"].message, /at most 1000000 characters/);
    const byId = new Map(replies.filter((r) => r["id"] !== null).map((r) => [r["id"], r]));
    assert.equal(byId.get(2)?.["error"].code, -32600);
    assert.equal(byId.get(3)?.["error"].code, -32602);
    assert.equal(byId.get(4)?.["error"].code, -32602);
    for (const id of [5, 6, 7, 8]) assert.equal(byId.get(id)?.["result"].isError, true, String(id));
    assert.ok((byId.get(5)?.["result"].content[0].text as string).split("\n").length >= 6, "誤りを全部挙げる");
    assert.equal(byId.get(9)?.["result"].structuredContent.valid, false);
    // 最後の正しいリクエストには、ふつうに答える
    assert.equal(byId.get(10)?.["result"].structuredContent.furusato.limit, 57_000);
    assert.equal(({} as Json)["polluted"], undefined);
  });

  it("オプションを付けて起動したら、MCP のメッセージを待たずにエラーで終わる", () => {
    const r = spawnSync(process.execPath, [cli, "mcp", "--port", "1"], { input: "", encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.equal(r.stdout, "");
  });
});

describe("MCP サーバー: ツール", () => {
  const { replies } = talk([INIT, READY, { jsonrpc: "2.0", id: 2, method: "tools/list" }]);
  const tools = replies[1]?.["result"].tools as Json[];

  it("ツールは 5 つ。名前は決まった順で、説明・入力と出力のスキーマ・読み取りだけである印が付いている", () => {
    assert.deepEqual(tools.map((t) => t["name"]), ["estimate_tax_savings", "furusato_nozei_limit", "compare_furusato_limit_with_2025", "validate_tax_input", "list_tax_sources"]);
    for (const tool of tools) {
      assert.match(tool["name"], /^[a-z0-9_]{1,64}$/);
      assert.ok(tool["description"].length > 80);
      assert.equal(tool["inputSchema"].type, "object");
      assert.equal(tool["outputSchema"].type, "object");
      assert.deepEqual(tool["annotations"], { title: tool["title"], readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
      // どのツールの出力にも、概算である旨・前提・出典が必ず入る
      assert.ok((tool["outputSchema"].required as string[]).includes("meta"), tool["name"]);
    }
    // 入力は、決まった項目だけ（知らない項目は受け付けない）
    assert.equal(tools[0]?.["inputSchema"].additionalProperties, false);
  });

  it("古い版（2024-11-05）には、その版にない項目（outputSchema・structuredContent）を出さない", () => {
    const old = talk([{ ...INIT, params: { ...INIT.params, protocolVersion: "2024-11-05" } }, { jsonrpc: "2.0", id: 2, method: "tools/list" }, call(3, "list_tax_sources", {})]);
    const tool = old.replies[1]?.["result"].tools[0] as Json;
    assert.deepEqual(Object.keys(tool), ["name", "description", "inputSchema"]);
    assert.deepEqual(Object.keys(old.replies[2]?.["result"]), ["content", "isError"]);
  });

  it("estimate_tax_savings: 計算コアの結果そのまま。出力はスキーマに合い、文章の出力は同じ JSON", () => {
    const out = talk([INIT, ...INPUTS.map((input, i) => call(10 + i, "estimate_tax_savings", input))]).replies.slice(1);
    for (const [i, input] of INPUTS.entries()) {
      const result = out[i]?.["result"] as Json;
      assert.equal(result["isError"], false);
      const expected = JSON.parse(JSON.stringify(calculate(input)));
      assert.deepEqual(result["structuredContent"].result, expected);
      assert.deepEqual(JSON.parse(result["content"][0].text), result["structuredContent"]);
      assert.deepEqual(check(tools[0]?.["outputSchema"], result["structuredContent"]), []);
      // 入力そのものも、入力のスキーマに合っている
      assert.deepEqual(check(tools[0]?.["inputSchema"], input), []);
      const meta = result["structuredContent"].meta as Json;
      assert.equal(meta["estimate"], true);
      assert.match(meta["disclaimer"], /概算.*税理士や税務署・市区町村の判断に代わるものではありません/);
      assert.ok(meta["assumptions"].length >= 5 && meta["notCalculated"].length >= 5);
      assert.deepEqual(meta["sources"], getSources(2026));
      assert.deepEqual(meta["engine"], { name: "setsuzei", version: VERSION });
    }
  });

  it("CLI（--json）と同じ数字になる", () => {
    const input = INPUTS[0] ?? {};
    const fromCli = JSON.parse(spawnSync(process.execPath, [cli, "--input", "-", "--json"], { input: JSON.stringify(input), encoding: "utf8" }).stdout) as Json;
    const { version: _version, ...expected } = fromCli;
    const reply = talk([INIT, call(2, "estimate_tax_savings", input)]).replies[1];
    assert.deepEqual(reply?.["result"].structuredContent.result, expected);
  });

  it("furusato_nozei_limit: 上限・残り・減る税額。給与 500 万円・社会保険料 75 万円なら 57,000 円", () => {
    const out = talk([INIT, call(2, "furusato_nozei_limit", { salaryRevenue: 5_000_000, socialInsurance: 750_000 }), ...INPUTS.map((input, i) => call(10 + i, "furusato_nozei_limit", input))]).replies.slice(1);
    assert.equal(out[0]?.["result"].structuredContent.furusato.limit, 57_000);
    for (const [i, input] of INPUTS.entries()) {
      const structured = out[i + 1]?.["result"].structuredContent as Json;
      const r = calculate(input);
      assert.deepEqual(structured["furusato"], JSON.parse(JSON.stringify(r.measures.furusato)));
      assert.equal(structured["baseline"].totalTax, r.baseline.totalTax);
      assert.deepEqual(check(tools[1]?.["outputSchema"], structured), []);
    }
  });

  it("compare_furusato_limit_with_2025: 令和7年分 61,000 円 → 令和8年分 57,000 円。配偶者に所得がある入力は、実行エラーで理由を返す", () => {
    const input = { salaryRevenue: 5_000_000, socialInsurance: 750_000 };
    const out = talk([INIT, call(2, "compare_furusato_limit_with_2025", input), call(3, "compare_furusato_limit_with_2025", { ...input, spouse: { income: 500_000 } })]).replies.slice(1);
    const structured = out[0]?.["result"].structuredContent as Json;
    assert.deepEqual(structured["comparison"], JSON.parse(JSON.stringify(compareFurusatoLimit(input))));
    assert.deepEqual([structured["comparison"].previous.limit, structured["comparison"].current.limit, structured["comparison"].difference], [61_000, 57_000, -4_000]);
    assert.deepEqual(check(tools[2]?.["outputSchema"], structured), []);
    assert.equal(out[1]?.["result"].isError, true);
    assert.match(out[1]?.["result"].content[0].text, /配偶者の所得が 0 の場合だけ/);
  });

  it("validate_tax_input: 誤りを項目名つきで全部返す。正しければ、既定値を埋めた入力を返す", () => {
    const out = talk([INIT, call(2, "validate_tax_input", { businessRevenue: "800万", blueReturn: "60", evil: 1 }), call(3, "validate_tax_input", { businessRevenue: 8_000_000 })]).replies.slice(1);
    const bad = out[0]?.["result"].structuredContent as Json;
    assert.equal(out[0]?.["result"].isError, false);
    assert.equal(bad["valid"], false);
    assert.equal(bad["issues"].length, 3);
    assert.equal(bad["normalized"], null);
    const good = out[1]?.["result"].structuredContent as Json;
    assert.deepEqual([good["valid"], good["issues"], good["normalized"].blueReturn, good["normalized"].year], [true, [], "none", 2026]);
    // 返す入力は、そのまま計算のツールの入力のスキーマに合う（配偶者がいなければ、項目ごと省く）
    assert.equal("spouse" in good["normalized"], false);
    assert.deepEqual(check(tools[0]?.["inputSchema"], good["normalized"]), []);
    for (const structured of [bad, good]) assert.deepEqual(check(tools[3]?.["outputSchema"], structured), []);

    // 返ってきた入力を計算のツールに渡しても、元の入力と同じ結果になる（試算の条件を落とさない）
    const plan = { businessRevenue: 8_000_000, idecoAnnualLimit: 240_000, idecoAdditional: 100_000, kyosaiAdditional: 0, nhiIncomeRatePercent: 11.5, spouse: { income: 0 } };
    const validated = talk([INIT, call(2, "validate_tax_input", plan)]).replies[1]?.["result"].structuredContent as Json;
    assert.deepEqual(check(tools[3]?.["outputSchema"], validated), []);
    assert.deepEqual(check(tools[0]?.["inputSchema"], validated["normalized"]), []);
    const both = talk([INIT, call(2, "estimate_tax_savings", plan), call(3, "estimate_tax_savings", validated["normalized"])]).replies.slice(1);
    assert.deepEqual(both[1]?.["result"].structuredContent.result, both[0]?.["result"].structuredContent.result);
    assert.equal(both[0]?.["result"].structuredContent.result.measures.combined.kyosaiAdditional, 0);
  });

  it("list_tax_sources: CLI の --sources と同じ一覧", () => {
    const structured = talk([INIT, call(2, "list_tax_sources", {})]).replies[1]?.["result"].structuredContent as Json;
    const fromCli = JSON.parse(spawnSync(process.execPath, [cli, "--sources", "--json"], { encoding: "utf8" }).stdout) as Json;
    assert.deepEqual({ year: structured["year"], sources: structured["sources"] }, fromCli);
    assert.deepEqual(check(tools[4]?.["outputSchema"], structured), []);
  });

  it("入力の誤り（文字列の金額、知らない項目、対応していない年分）は、直してやり直せるよう、実行エラーとして返す", () => {
    const out = talk([INIT, call(2, "estimate_tax_savings", { businessRevenue: "800万" }), call(3, "estimate_tax_savings", { businessRevenue: 1, x: 1 }), call(4, "furusato_nozei_limit", { year: 2020 })]).replies.slice(1);
    for (const reply of out) {
      assert.equal(reply["result"].isError, true);
      assert.equal(reply["result"].structuredContent, undefined);
      assert.match(reply["result"].content[0].text, /^Invalid input\. Fix these and call the tool again:\n- /);
    }
  });

  it("ツールの定義（サーバーが返すもの）は、コードの TOOLS と同じ。プロセスを介さず McpServer を直接使っても同じ答え", () => {
    const server = new McpServer();
    server.handleLine(JSON.stringify(INIT));
    const direct = server.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
    assert.deepEqual(direct?.["result"], replies[1]?.["result"]);
    assert.equal(TOOLS.length, tools.length);
  });
});

describe("MCP サーバー: 外部と通信しない", () => {
  it("サーバーのコードは、通信・ファイル・子プロセスのモジュールを読み込まない", () => {
    const dir = fileURLToPath(new URL("../src/mcp/", import.meta.url));
    const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
    assert.deepEqual(files.sort(), ["schema.js", "server.js", "tools.js"]);
    for (const file of files) {
      const js = readFileSync(`${dir}${file}`, "utf8");
      assert.doesNotMatch(js, /from "node:|require\(|\bfetch\(|XMLHttpRequest|WebSocket|process\.env/, file);
    }
  });

  it("実行時の依存パッケージはない", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as Json;
    assert.equal(pkg["dependencies"], undefined);
  });
});

describe("MCP の登録用のファイルと、README の案内", () => {
  const read = (file: string): string => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

  it("server.json: 名前は package.json の mcpName と同じ、版はいまの版、起動は npx setsuzei mcp（stdio）", () => {
    const server = JSON.parse(read("server.json")) as Json;
    const pkg = JSON.parse(read("package.json")) as Json;
    assert.equal(server["name"], "io.github.ozko00/setsuzei");
    assert.equal(pkg["mcpName"], server["name"]);
    assert.equal(server["version"], VERSION);
    assert.ok(server["description"].length <= 100, "MCP Registry は説明を 100 文字までに制限している");
    assert.deepEqual(server["packages"], [
      { registryType: "npm", identifier: "setsuzei", version: VERSION, runtimeHint: "npx", transport: { type: "stdio" }, packageArguments: [{ type: "positional", value: "mcp" }] },
    ]);
    assert.equal(server["repository"].url, "https://github.com/ozko00/setsuzei");
  });

  it("README（日本語・英語）: 冒頭で何かを 1 文で言い、MCP の設定を載せ、確かめていないクライアントを明記する", () => {
    const ja = read("README.md");
    const en = read("README.en.md");
    assert.match(ja.split("\n").slice(0, 10).join("\n"), /\*\*LLM に日本の税額を暗算させないための、出典つき・テスト済みの計算エンジンです。\*\*/);
    assert.match(en.split("\n").slice(0, 10).join("\n"), /\*\*A cited, tested calculation engine so that LLMs don't have to do Japanese tax arithmetic in their heads\.\*\*/);
    for (const text of [ja, en]) {
      // 設定例は、npm に公開済みの版を固定する（版を付けないと、npx が手元に残った古い版を使うことがある）
      const pinned = (JSON.parse(read("package.json")) as Json)["config"].npmPinned as string;
      assert.ok(text.includes(`"args": ["-y", "setsuzei@${pinned}", "mcp"]`));
      assert.ok(text.includes(`claude mcp add setsuzei -- npx -y setsuzei@${pinned} mcp`));
      assert.doesNotMatch(text, /npx -y setsuzei mcp|"setsuzei", "mcp"/);
      for (const tool of TOOLS) assert.ok(text.includes(`\`${tool.name}\``), tool.name);
      // 測った結果には、限界（問いの数・モデルの数）と記録への案内を添える
      assert.ok(text.includes("evaluation/model-vs-tool.md"));
    }
    assert.match(ja, /Claude Desktop では未確認/);
    assert.match(en, /Not checked with Claude Desktop/);
    assert.ok(ja.includes("[English](README.en.md)") && en.includes("[日本語](README.md)"));
    // MCP サーバーの案内は、ブラウザ版の案内より前
    assert.ok(ja.indexOf("## エージェントに入れる") < ja.indexOf("## ブラウザ版"));
    // 確かめていない主張（監査など）は書かない
    for (const text of [ja, en]) assert.doesNotMatch(text, /独立監査|independent audit|監査済み/i);
  });

  it("ヘルプに mcp の説明がある", () => {
    const help = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" }).stdout;
    assert.match(help, /setsuzei mcp\s+MCP サーバーとして起動/);
  });
});
