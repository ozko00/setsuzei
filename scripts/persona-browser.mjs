#!/usr/bin/env node
/**
 * 利用者役（このプロジェクトを知らないエージェントや人）に、公開ページを実際のブラウザで操作してもらうための道具。
 * ヘッドレスの Chrome を 1 つ起動して docs/ を開き、「画面を見る・座標を押す・文字を打つ」だけを受け付ける。
 * 操作はすべて記録し、結果が画面に出るまでの操作数をあとで数えられるようにする。
 *
 *   起動:  node scripts/persona-browser.mjs serve --docs docs --dir <記録を置くフォルダ> [--mobile]
 *          （--path en/ を付けると、英語版のトップから始める）
 *   操作:  node scripts/persona-browser.mjs <記録を置くフォルダ> <コマンド> [引数]
 *
 *   look            いまの画面を画像に保存し、画面に見えている文字と、押せるものの座標を出す
 *   click X Y       画面の座標を押す
 *   type 文字        いまカーソルのある欄に打ち込む
 *   clear           いまカーソルのある欄の中身を消す
 *   key 名前         Enter / Tab / Backspace / ArrowDown / ArrowUp / Escape / Space
 *   scroll DY [X Y]  下へ DY ピクセル送る（負の数で上へ）。X Y を付けるとその位置の枠を送る
 *   options X Y     その位置の選択欄の選択肢を出す
 *   choose X Y 文言  その位置の選択欄で、文言の選択肢を選ぶ
 *   dump            （確認する側が使う）入力欄の値と結果の文面をすべて出す
 *   stop            終了する
 *
 * 依存パッケージは使わない（test/browser/cdp.mjs と同じ仕組み）。
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findChrome, launch, serveDocs } from "../test/browser/cdp.mjs";

const self = fileURLToPath(import.meta.url);
const KEYS = { Enter: 13, Tab: 9, Backspace: 8, Delete: 46, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Escape: 27, Space: 32 };

/** 画面に見えている文字と、押せるものの座標 */
const VISIBLE = `(() => {
  const vw = innerWidth, vh = innerHeight;
  const onScreen = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  const shown = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  const center = (r) => "(" + Math.round(Math.max(0, r.left) + Math.min(r.right, vw) >> 1) + "," + Math.round((Math.max(0, r.top) + Math.min(r.bottom, vh)) / 2) + ")";
  // スクロールする枠の外に隠れている部分は「見えていない」として扱う
  const clippedOut = (el, r) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflowY === "visible" && s.overflowX === "visible") continue;
      const pr = p.getBoundingClientRect();
      if (r.bottom <= pr.top + 4 || r.top >= pr.bottom - 4 || r.right <= pr.left || r.left >= pr.right) return true;
    }
    return false;
  };
  const lines = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let current = null;
  const flush = () => { if (current && current.text.trim() !== "") lines.push({ top: current.top, text: current.text.replace(/\\s+/g, " ").trim() }); current = null; };
  const blockOf = (node) => { let el = node.parentElement; while (el && getComputedStyle(el).display.startsWith("inline")) el = el.parentElement; return el; };
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text.trim() === "" || !node.parentElement || !shown(node.parentElement)) continue;
      if (node.parentElement.closest("script, style, noscript, option")) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = Array.from(range.getClientRects()).filter(onScreen).filter((r) => !clippedOut(node.parentElement, r));
      if (rects.length === 0) continue;
      const block = blockOf(node);
      if (!current || current.block !== block) { flush(); current = { block, top: rects[0].top, text: "" }; }
      current.text += text;
      continue;
    }
    const el = node;
    const tag = el.tagName;
    // 見た目を作り込んだ選択肢（透明な input を重ねたもの）も、押せるものとして出す
    const overlay = tag === "INPUT" && (el.type === "radio" || el.type === "checkbox") && el.checkVisibility();
    if ((!shown(el) && !overlay) || seen.has(el)) continue;
    const r = el.getBoundingClientRect();
    if (!onScreen(r) || clippedOut(el.parentElement, r)) continue;
    // 画面に固定された帯などの下に隠れているものは、押せるものとして出さない
    const cx = (Math.max(0, r.left) + Math.min(r.right, vw)) / 2, cy = (Math.max(0, r.top) + Math.min(r.bottom, vh)) / 2;
    const top = document.elementFromPoint(cx, cy);
    if (top && top !== el && !el.contains(top) && !top.contains(el) && !(top.closest("label")?.contains(el))) continue;
    let mark = null;
    if (tag === "INPUT" && (el.type === "checkbox" || el.type === "radio")) mark = (el.type === "radio" ? (el.checked ? "(●)" : "(○)") : (el.checked ? "[✓]" : "[ ]")) + " @" + center(r);
    else if (tag === "INPUT" && el.type === "range") mark = "[スライダー " + el.min + "〜" + el.max + " いま " + el.value + "] @" + center(r);
    else if (tag === "INPUT") mark = "[入力欄 @" + center(r) + (el.value !== "" ? " 値=「" + el.value + "」" : " 空" + (el.placeholder ? "（薄い字: " + el.placeholder + "）" : "")) + (el.disabled || el.readOnly ? " 変更不可" : "") + "]";
    else if (tag === "TEXTAREA") mark = "[入力欄 @" + center(r) + " 値=「" + el.value.slice(0, 40) + "」]";
    else if (tag === "SELECT") mark = "[選択欄 @" + center(r) + " いま=「" + (el.selectedOptions[0]?.textContent ?? "").trim() + "」▼]";
    else if (tag === "BUTTON" || tag === "SUMMARY") mark = "‹押せる @" + center(el.getClientRects()[0] ?? r) + "›";
    else if (tag === "A" && el.hasAttribute("href")) mark = "‹リンク @" + center(el.getClientRects()[0] ?? r) + "›";
    if (mark === null) continue;
    seen.add(el);
    if (current && current.block === blockOf(el)) current.text += " " + mark + " ";
    else { flush(); current = { block: blockOf(el), top: r.top, text: mark + " " }; }
  }
  flush();
  const doc = document.documentElement;
  return {
    title: document.title,
    scroll: "ページの高さ " + doc.scrollHeight + "px のうち、上から " + Math.round(scrollY) + "〜" + Math.round(scrollY + vh) + "px を表示中（画面は 横 " + vw + " × 縦 " + vh + "）",
    lines: lines.map((l) => l.text),
  };
})()`;

/** 結果の数字が画面のどこかに出ているか（操作数を数えるための目印。画面外でも数える） */
const RESULT_SHOWN = `!!document.querySelector("#result .headline, #result .figure, #result [data-result]")`;

const DUMP = `(() => ({
  url: location.href,
  fields: Object.fromEntries(Array.from(document.querySelectorAll("input, select, textarea")).filter((el) => el.name || el.id).map((el) => [
    (el.name || el.id) + (el.type === "radio" ? "=" + el.value : ""),
    el.type === "checkbox" || el.type === "radio" ? el.checked : el.value,
  ])),
  result: (document.querySelector("#results") ?? document.body).innerText,
}))()`;

async function serve(args) {
  const opt = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
  const dir = resolve(opt("--dir") ?? ".");
  const docs = resolve(opt("--docs") ?? "docs");
  const mobile = args.includes("--mobile");
  mkdirSync(dir, { recursive: true });
  const log = (entry) => appendFileSync(join(dir, "log.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");

  const site = await serveDocs(docs);
  const chrome = findChrome();
  if (!chrome) throw new Error("Chrome / Chromium が見つかりません（CHROME_BIN で指定できます）");
  const browser = await launch(chrome);
  const page = await browser.newPage();
  const [width, height] = mobile ? [375, 720] : [1280, 800];
  await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
  await page.goto(opt("--url") ?? `${site.base}${opt("--path") ?? ""}`);
  let shots = 0;

  const elementAt = (x, y) => `(() => { let el = document.elementFromPoint(${x}, ${y}); if (el && el.tagName === "LABEL") el = el.control ?? el.querySelector("select") ?? el; return el; })()`;
  const commands = {
    async look() {
      const file = join(dir, `screen-${String(++shots).padStart(3, "0")}.png`);
      const { data } = await page.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(file, Buffer.from(data, "base64"));
      const v = await page.evaluate(VISIBLE);
      return `画像: ${file}\n${v.scroll}\n--- 画面に見えている文字（@(X,Y) は押せる位置） ---\n${v.lines.join("\n")}`;
    },
    async click(x, y) {
      const event = { x: Number(x), y: Number(y), button: "left", clickCount: 1 };
      if (!Number.isFinite(event.x) || !Number.isFinite(event.y)) return "使い方: click X Y";
      await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: event.x, y: event.y });
      await page.send("Input.dispatchMouseEvent", { type: "mousePressed", ...event });
      await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...event });
      await new Promise((r) => setTimeout(r, 300));
      return `(${x},${y}) を押しました。`;
    },
    async type(...words) {
      const text = words.join(" ");
      const focused = await page.evaluate('["INPUT","TEXTAREA"].includes(document.activeElement?.tagName ?? "")');
      if (!focused) return "カーソルが入力欄にありません。先に入力欄を click してください。";
      await page.send("Input.insertText", { text });
      return `「${text}」と打ちました。`;
    },
    async clear() {
      const ok = await page.evaluate('(() => { const el = document.activeElement; if (!el || !("select" in el)) return false; el.select(); return true; })()');
      if (!ok) return "カーソルが入力欄にありません。";
      await commands.key("Backspace");
      return "欄の中身を消しました。";
    },
    async key(name) {
      const code = KEYS[name];
      if (code === undefined) return `使えるキー: ${Object.keys(KEYS).join(" / ")}`;
      const event = { key: name === "Space" ? " " : name, code: name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code };
      await page.send("Input.dispatchKeyEvent", { type: name === "Enter" || name === "Space" ? "keyDown" : "rawKeyDown", ...event, ...(name === "Enter" ? { text: "\r" } : name === "Space" ? { text: " " } : {}) });
      await page.send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
      await new Promise((r) => setTimeout(r, 200));
      return `${name} キーを押しました。`;
    },
    async scroll(dy, x, y) {
      const px = x === undefined ? width / 2 : Number(x);
      const py = y === undefined ? height / 2 : Number(y);
      await page.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: px, y: py, deltaX: 0, deltaY: Number(dy) });
      await new Promise((r) => setTimeout(r, 400));
      return `${dy}px 送りました。`;
    },
    async options(x, y) {
      const list = await page.evaluate(`(() => { const el = ${elementAt(Number(x), Number(y))}; return el && el.tagName === "SELECT" ? Array.from(el.options).map((o) => (o.selected ? "● " : "○ ") + o.textContent.trim()) : null; })()`);
      return list === null ? "その位置に選択欄はありません。" : `選択肢:\n${list.join("\n")}`;
    },
    async choose(x, y, ...words) {
      const label = words.join(" ");
      const result = await page.evaluate(`(() => { const el = ${elementAt(Number(x), Number(y))}; if (!el || el.tagName !== "SELECT") return "その位置に選択欄はありません。"; const o = Array.from(el.options).find((o) => o.textContent.trim() === ${JSON.stringify(label)}) ?? Array.from(el.options).find((o) => o.textContent.includes(${JSON.stringify(label)})); if (!o) return "その選択肢はありません。options で確かめてください。"; el.focus(); el.value = o.value; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return "「" + o.textContent.trim() + "」を選びました。"; })()`);
      return result;
    },
    async dump() {
      return JSON.stringify(await page.evaluate(DUMP), null, 2);
    },
  };

  const control = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      const [name, ...rest] = JSON.parse(body || "[]");
      if (name === "stop") {
        res.end("終了します。");
        log({ command: "stop" });
        await browser.close();
        site.close();
        control.close();
        return;
      }
      const fn = commands[name];
      let output;
      try {
        output = fn ? await fn(...rest) : `知らないコマンドです: ${name}（look / click / type / clear / key / scroll / options / choose）`;
      } catch (error) {
        output = `失敗しました: ${error.message}`;
      }
      let shown = null;
      try {
        shown = await page.evaluate(RESULT_SHOWN);
      } catch {
        // ページの移動中など
      }
      if (name !== "dump") log({ command: name, args: rest, resultShown: shown, url: await page.evaluate("location.pathname + location.search").catch(() => null) });
      res.end(output);
    });
  });
  await new Promise((r) => control.listen(0, "127.0.0.1", r));
  writeFileSync(join(dir, "session.json"), JSON.stringify({ control: control.address().port, site: site.base, mobile, pid: process.pid }));
  log({ command: "start", mobile, errors: page.errors });
}

async function client(dir, command) {
  const file = join(resolve(dir), "session.json");
  if (!existsSync(file)) throw new Error(`${file} がありません。先に serve で起動してください`);
  const { control } = JSON.parse(readFileSync(file, "utf8"));
  const res = await fetch(`http://127.0.0.1:${control}/`, { method: "POST", body: JSON.stringify(command) });
  console.log(await res.text());
}

const [first, ...rest] = process.argv.slice(2);
if (first === "serve") {
  if (rest.includes("--foreground")) await serve(rest);
  else {
    // 起動したらすぐ戻れるよう、別のプロセスに任せる
    const child = spawn(process.execPath, [self, "serve", "--foreground", ...rest], { detached: true, stdio: "ignore" });
    child.unref();
    const dir = resolve(rest[rest.indexOf("--dir") + 1] ?? ".");
    for (let i = 0; i < 100 && !existsSync(join(dir, "session.json")); i++) await new Promise((r) => setTimeout(r, 200));
    console.log(existsSync(join(dir, "session.json")) ? `起動しました: ${dir}` : "起動を確認できませんでした");
  }
} else if (first === undefined || rest.length === 0) {
  console.log(readFileSync(self, "utf8").split("*/")[0]);
} else await client(first, rest);

