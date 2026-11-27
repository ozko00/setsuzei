/**
 * MCP（Model Context Protocol）のサーバー。stdio で動き、ツールだけを提供する。
 * 依存パッケージは使わない（JSON-RPC 2.0 を 1 行 1 メッセージでやり取りするだけ）。外部とは通信しない。
 *
 * 仕様（2026-07-28 版と、それ以前の版の両方に対応する）:
 *   https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning
 *   https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio
 *   https://modelcontextprotocol.io/specification/2026-07-28/server/discover
 *   https://modelcontextprotocol.io/specification/2026-07-28/server/tools
 *   https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
 *
 * - 新しい版（2026-07-28）: 接続の手続き（initialize）はなく、リクエストごとに `_meta` で版を名乗る。
 *   結果には `resultType` を付け、一覧には `ttlMs` と `cacheScope` を付ける。`server/discover` に答える。
 * - それ以前の版: `initialize` で版を決めてから `tools/list`・`tools/call` を受ける。
 */
import { InputError } from "../core/validate.js";
import { VERSION } from "../version.js";
import { TOOLS } from "./tools.js";

/** リクエストごとに版を名乗る方式の版 */
export const MODERN_VERSIONS = ["2026-07-28"] as const;
/** initialize で版を決める方式の版（新しい順） */
export const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;

const META_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_SERVER = "io.modelcontextprotocol/serverInfo";
const SERVER_INFO = { name: "setsuzei", title: "setsuzei: Japanese tax estimate engine", version: VERSION } as const;
const INSTRUCTIONS =
  "Estimates Japanese income tax and resident tax for freelancers and side-job workers (tax year 2026 / Reiwa 8) and the effect of year-end measures " +
  "(furusato nozei, iDeCo, Small Enterprise Mutual Aid, blue-return deduction). Do not do the tax arithmetic yourself: call the tools with the user's figures " +
  "(annual amounts in whole yen) and report the returned numbers as they are. Always tell the user the result is an estimate (meta.disclaimer). " +
  "Everything runs locally; no data leaves the machine.";
/** 一覧は版ごとに変わらないので、長めに覚えてよい */
const CACHE = { ttlMs: 3_600_000, cacheScope: "public" } as const;

type Json = Record<string, unknown>;
type Id = string | number;

const ERROR = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603, unsupportedVersion: -32022 } as const;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

/** ツールの一覧。古い版（2025-03-26 以前）には、その版にない項目（title・outputSchema）を出さない。 */
function listTools(version: string): Json[] {
  const structured = version >= "2025-06-18";
  return TOOLS.map((tool) => ({
    name: tool.name,
    ...(structured ? { title: tool.title } : {}),
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(structured ? { outputSchema: tool.outputSchema } : {}),
    ...(version >= "2025-03-26"
      ? { annotations: { title: tool.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }
      : {}),
  }));
}

function callTool(params: unknown, version: string): Json {
  if (!isObject(params) || typeof params["name"] !== "string") throw new RpcError(ERROR.invalidParams, "tools/call: params.name is required");
  const tool = TOOLS.find((t) => t.name === params["name"]);
  if (!tool) throw new RpcError(ERROR.invalidParams, `Unknown tool: ${params["name"]}`);
  const args = params["arguments"] ?? {};
  if (!isObject(args)) throw new RpcError(ERROR.invalidParams, "tools/call: params.arguments must be an object");
  try {
    const output = tool.run(args);
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      ...(version >= "2025-06-18" ? { structuredContent: output } : {}),
      isError: false,
    };
  } catch (error) {
    // 入力の誤りは、モデルが直してやり直せるよう、ツールの実行エラーとして返す
    if (error instanceof InputError || error instanceof RangeError) {
      const issues = error instanceof InputError ? error.issues : [error.message];
      return {
        content: [{ type: "text", text: `Invalid input. Fix these and call the tool again:\n${issues.map((issue) => `- ${issue}`).join("\n")}` }],
        isError: true,
      };
    }
    throw error;
  }
}

/** 1 つの接続（= 1 つのプロセス）の状態。initialize を受けたときだけ、その版を覚える。 */
export class McpServer {
  private legacyVersion: string | null = null;

  /** 受け取った 1 行を処理して、返すメッセージ（なければ null）を返す。 */
  handleLine(line: string): Json | null {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return this.error(null, ERROR.parse, "Parse error: the line is not valid JSON");
    }
    if (!isObject(message) || message["jsonrpc"] !== "2.0" || typeof message["method"] !== "string") {
      // クライアントからの応答（result / error）は来ないはずなので、黙って捨てる
      if (isObject(message) && ("result" in message || "error" in message)) return null;
      return this.error(isObject(message) ? this.idOf(message) : null, ERROR.invalidRequest, "Invalid Request: not a JSON-RPC 2.0 request");
    }
    const id = this.idOf(message);
    // 通知（id がない）には応答しない
    if (id === null) return null;
    try {
      return { jsonrpc: "2.0", id, result: this.dispatch(message["method"], message["params"]) };
    } catch (error) {
      if (error instanceof RpcError) return this.error(id, error.code, error.message, error.data);
      return this.error(id, ERROR.internal, `Internal error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private idOf(message: Json): Id | null {
    const id = message["id"];
    return typeof id === "string" || typeof id === "number" ? id : null;
  }

  private error(id: Id | null, code: number, message: string, data?: unknown): Json {
    return { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } };
  }

  private dispatch(method: string, params: unknown): Json {
    const requested = isObject(params) && isObject(params["_meta"]) ? params["_meta"][META_VERSION] : undefined;

    // --- リクエストごとに版を名乗る方式（2026-07-28）---
    if (typeof requested === "string") {
      if (!(MODERN_VERSIONS as readonly string[]).includes(requested)) {
        throw new RpcError(ERROR.unsupportedVersion, "Unsupported protocol version", { supported: [...MODERN_VERSIONS], requested });
      }
      const done = (result: Json): Json => ({ resultType: "complete", ...result, _meta: { [META_SERVER]: SERVER_INFO } });
      switch (method) {
        case "server/discover":
          return done({ supportedVersions: [...MODERN_VERSIONS], capabilities: { tools: {} }, instructions: INSTRUCTIONS, ...CACHE });
        case "tools/list":
          return done({ tools: listTools(requested), ...CACHE });
        case "tools/call":
          return done(callTool(params, requested));
        default:
          throw new RpcError(ERROR.methodNotFound, `Method not found: ${method}`);
      }
    }

    // --- initialize で版を決める方式（2025-11-25 以前）---
    switch (method) {
      case "initialize": {
        const wanted = isObject(params) ? params["protocolVersion"] : undefined;
        // 対応している版ならその版で、そうでなければ対応している最新の版で答える
        this.legacyVersion = typeof wanted === "string" && (LEGACY_VERSIONS as readonly string[]).includes(wanted) ? wanted : LEGACY_VERSIONS[0];
        return { protocolVersion: this.legacyVersion, capabilities: { tools: {} }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS };
      }
      case "ping":
        return {};
      case "tools/list":
        return { tools: listTools(this.legacyVersion ?? LEGACY_VERSIONS[0]) };
      case "tools/call":
        return callTool(params, this.legacyVersion ?? LEGACY_VERSIONS[0]);
      case "server/discover":
        // 版を名乗らない server/discover は、新しい版の決まり（_meta が必須）に合わない
        throw new RpcError(ERROR.unsupportedVersion, "Unsupported protocol version", { supported: [...MODERN_VERSIONS], requested: null });
      default:
        throw new RpcError(ERROR.methodNotFound, `Method not found: ${method}`);
    }
  }
}

/** 1 つのメッセージ（1 行）の大きさの上限。入力は数十の数値だけなので、これを超えるものは受け付けない */
export const MAX_LINE_LENGTH = 1_000_000;

/** 標準入力から 1 行ずつ読み、標準出力に 1 行ずつ返す。標準入力が閉じたら終わる。 */
export async function runStdioServer(input: NodeJS.ReadableStream, output: NodeJS.WritableStream): Promise<void> {
  const server = new McpServer();
  let buffer = "";
  /** 大きすぎる行を読み飛ばしている途中か */
  let skipping = false;
  const tooLong = (): void => {
    output.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: ERROR.invalidRequest, message: `Invalid Request: a message must be at most ${MAX_LINE_LENGTH} characters` } })}\n`);
  };
  input.setEncoding("utf8");
  for await (const chunk of input) {
    buffer += chunk as string;
    for (let newline = buffer.indexOf("\n"); newline !== -1; newline = buffer.indexOf("\n")) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      if (skipping) {
        // 読み飛ばしていた行の終わり
        skipping = false;
        continue;
      }
      if (line.trim() === "") continue;
      if (line.length > MAX_LINE_LENGTH) {
        tooLong();
        continue;
      }
      const reply = server.handleLine(line);
      // JSON.stringify の出力に改行は入らない（文字列の中の改行は \n にエスケープされる）
      if (reply !== null) output.write(`${JSON.stringify(reply)}\n`);
    }
    // 改行が来ないまま大きくなり続ける入力は、ためこまずに捨てる
    if (buffer.length > MAX_LINE_LENGTH) {
      if (!skipping) tooLong();
      skipping = true;
      buffer = "";
    }
  }
}
