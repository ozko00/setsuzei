/**
 * ヘッドレスの Chrome を DevTools Protocol で直接操作するための最小限の部品。
 * 依存パッケージは使わない（Node.js 22 以上の WebSocket と、手元の Chrome / Chromium だけ）。
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, sep } from "node:path";

const CANDIDATES = [
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

/** 使う Chrome。環境変数 CHROME_BIN があればそれ。 */
export function findChrome() {
  if (process.env["CHROME_BIN"]) return process.env["CHROME_BIN"];
  const dirs = (process.env["PATH"] ?? "").split(":");
  for (const name of CANDIDATES) {
    if (name.startsWith("/")) {
      if (existsSync(name)) return name;
      continue;
    }
    for (const dir of dirs) if (dir !== "" && existsSync(join(dir, name))) return join(dir, name);
  }
  return null;
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};

/** docs/ を GitHub Pages と同じ /setsuzei/ の下で配信する。 */
export async function serveDocs(root, prefix = "/setsuzei/") {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let path = decodeURIComponent(url.pathname);
    if (!path.startsWith(prefix)) {
      res.writeHead(404).end("not found");
      return;
    }
    path = path.slice(prefix.length);
    if (path === "" || path.endsWith("/")) path += "index.html";
    const file = normalize(join(root, path));
    if (!file.startsWith(root + sep)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { origin: `http://127.0.0.1:${port}`, base: `http://127.0.0.1:${port}${prefix}`, close: () => server.close() };
}

/** Chrome を起動して、ブラウザ全体の DevTools 接続を返す。 */
export async function launch(chrome) {
  const profile = await mkdtemp(join(tmpdir(), "setsuzei-browser-"));
  const child = spawn(
    chrome,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const wsUrl = await new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error(`Chrome が起動しませんでした:\n${buffer}`)), 30_000);
    child.stderr.on("data", (chunk) => {
      buffer += chunk;
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(buffer);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome が終了しました（code ${code}）:\n${buffer}`));
    });
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("DevTools に接続できませんでした")), { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map(); // sessionId → (method, params) => void
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
      else entry.resolve(message.result);
      return;
    }
    listeners.get(message.sessionId ?? "")?.(message.method, message.params);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      // 応答が来ないまま止まらないようにする（ページの移動で実行中の処理が消えた場合など）
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method}: 15 秒待っても応答がありません`));
      }, 15_000);
      timer.unref();
      const done = (fn) => (value) => {
        clearTimeout(timer);
        fn(value);
      };
      resolve = done(resolve);
      reject = done(reject);
      pending.set(id, { resolve, reject, method });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  return {
    /** 新しいタブを開く。 */
    async newPage() {
      const { targetId } = await send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      return createPage((method, params) => send(method, params, sessionId), (fn) => listeners.set(sessionId, fn));
    },
    async close() {
      try {
        await send("Browser.close");
      } catch {
        child.kill();
      }
      await new Promise((resolve) => (child.exitCode === null ? child.once("exit", resolve) : resolve()));
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}

async function createPage(send, listen) {
  /** ページが出したエラー（例外、console.error、CSP 違反、読み込みの失敗） */
  const errors = [];
  /** ページが出した通信の URL */
  const requests = [];
  const waiters = [];
  listen((method, params) => {
    if (method === "Runtime.exceptionThrown") {
      errors.push(`例外: ${params.exceptionDetails.exception?.description ?? params.exceptionDetails.text}`);
    } else if (method === "Runtime.consoleAPICalled" && (params.type === "error" || params.type === "assert")) {
      errors.push(`console.${params.type}: ${params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
    } else if (method === "Log.entryAdded" && params.entry.level === "error") {
      errors.push(`${params.entry.source}: ${params.entry.text}${params.entry.url ? ` (${params.entry.url})` : ""}`);
    } else if (method === "Network.requestWillBeSent") {
      requests.push(params.request.url);
    } else if (method === "Network.loadingFailed" && !params.canceled) {
      errors.push(`読み込みの失敗: ${params.errorText}`);
    }
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].method === method) waiters.splice(i, 1)[0].resolve(params);
    }
  });
  for (const domain of ["Page", "Runtime", "Log", "Network"]) await send(`${domain}.enable`);

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) {
      throw new Error(`evaluate: ${exceptionDetails.exception?.description ?? exceptionDetails.text}\n${expression}`);
    }
    return result.value;
  };
  const waitFor = (method) => new Promise((resolve) => waiters.push({ method, resolve }));
  const key = async (name, code) => {
    const event = { key: name, code: name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code };
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...event });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
  };
  const sel = (selector) => JSON.stringify(selector);

  return {
    errors,
    requests,
    evaluate,
    /** DevTools Protocol のコマンドをそのまま送る（座標でのクリックなど、下の部品にない操作に使う）。 */
    send,
    /** 画面の大きさ。mobile = true でスマホとして表示する。 */
    async viewport(width, height, mobile = false) {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
      await send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
    },
    async goto(url) {
      const loaded = waitFor("Page.loadEventFired");
      const { errorText } = await send("Page.navigate", { url });
      if (errorText) throw new Error(`${url}: ${errorText}`);
      await loaded;
      // モジュールのスクリプトが動き終わるのを待つ
      await evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
    },
    /** リンクを押すなどしてページが移るのを待つ。移る操作を fn で渡す。 */
    async navigateBy(fn) {
      const loaded = waitFor("Page.loadEventFired");
      await fn();
      await loaded;
      await evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
    },
    /** 入力欄にフォーカスして、キーボードから打ち込む（いまの値は置き換える）。 */
    async type(selector, text) {
      const ok = await evaluate(
        `(() => { const el = document.querySelector(${sel(selector)}); if (!el) return false; el.scrollIntoView({ block: "center" }); el.focus(); el.select(); return document.activeElement === el; })()`,
      );
      if (!ok) throw new Error(`入力欄にフォーカスできません: ${selector}`);
      if (text === "") await key("Backspace", 8);
      else await send("Input.insertText", { text });
    },
    /**
     * 要素をマウスでクリックする。ほかの要素が上に重なっていたら失敗にする。
     * 複数行に折り返したリンクでも当たるよう、最初の行の中央を押す。
     */
    async click(selector) {
      const point = await evaluate(
        `(() => { const el = document.querySelector(${sel(selector)}); if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getClientRects()[0]; if (!r) return null; const x = r.left + r.width / 2, y = r.top + r.height / 2; const top = document.elementFromPoint(x, y); return { x, y, hit: top === el || el.contains(top) }; })()`,
      );
      if (point === null) throw new Error(`要素がありません: ${selector}`);
      if (!point.hit) throw new Error(`ほかの要素が重なっていてクリックできません: ${selector}`);
      const event = { x: point.x, y: point.y, button: "left", clickCount: 1 };
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
      await send("Input.dispatchMouseEvent", { type: "mousePressed", ...event });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...event });
    },
    /** 選択欄の値を変える（ヘッドレスでは選択肢の一覧を開けないので、値を入れて change を起こす）。 */
    async select(selector, value) {
      const ok = await evaluate(
        `(() => { const el = document.querySelector(${sel(selector)}); if (!el) return false; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return el.value === ${JSON.stringify(value)}; })()`,
      );
      if (!ok) throw new Error(`選択できません: ${selector} = ${value}`);
    },
    async screenshot(path) {
      const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
      const { writeFile } = await import("node:fs/promises");
      await writeFile(path, Buffer.from(data, "base64"));
    },
  };
}
