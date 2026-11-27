/**
 * 公開ページ（docs/）を実際のブラウザで操作するテスト。
 *
 *   npm run test:browser
 *
 * ヘッドレスの Chrome でトップと説明ページ 4 枚を開き、キーボードとマウスで入力して、
 * 画面に出た金額を、同じ入力で CLI（dist/cli.js）を実行した結果と突き合わせる。
 * あわせて、空入力・誤入力の表示、所得区分の切り替え、スマホ幅（375px）でのはみ出し、
 * コンソールのエラー、ページの外への通信がないことを確かめる。
 *
 * 必要なもの: Node.js 22 以上と Chrome / Chromium（場所は環境変数 CHROME_BIN でも指定できる）。
 * 依存パッケージは増やさない。npm test には含めず、CI では別のジョブで実行する。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { findChrome, launch, serveDocs } from "./cdp.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cliPath = join(root, "dist", "cli.js");
const yen = (n) => `${n.toLocaleString("ja-JP")} 円`;

/** フォームの欄の名前（= CLI のフラグ名）と値の組を、CLI の引数にする。 */
function cliArgs(values) {
  const args = [];
  for (const [name, value] of Object.entries(values)) {
    if (value === true) args.push(`--${name}`);
    else if (typeof value === "string" && value !== "") args.push(`--${name}=${value}`);
  }
  return args;
}

/** 同じ入力で CLI を実行する。成功なら結果の JSON、入力の誤りなら issues。 */
function cli(values) {
  const run = spawnSync(process.execPath, [cliPath, ...cliArgs(values), "--json"], { encoding: "utf8" });
  if (run.status === 0) return { ok: true, result: JSON.parse(run.stdout) };
  assert.equal(run.status, 2, `CLI が想定外の終了コードを返しました: ${run.stderr}`);
  return { ok: false, issues: JSON.parse(run.stderr).error.issues };
}

/** 画面の結果を読み取る。 */
const READ = `(() => {
  const text = (el) => (el ? el.textContent ?? "" : "").trim();
  const result = document.querySelector("#result");
  const jump = document.querySelector("#jump");
  return {
    placeholder: result.querySelector(".placeholder") ? text(result.querySelector(".placeholder")) : null,
    alert: result.querySelector('[role="alert"]')
      ? Array.from(result.querySelectorAll('[role="alert"] li')).map(text)
      : null,
    figures: Object.fromEntries(
      Array.from(result.querySelectorAll(".headline .figure")).map((f) => [text(f.querySelector(".label")), text(f.querySelector("strong"))]),
    ),
    cards: Array.from(result.querySelectorAll("section.card")).map((c) => ({
      title: text(c.querySelector("h3")),
      rows: Object.fromEntries(Array.from(c.querySelectorAll(".row")).map((r) => [text(r.querySelector("dt")), text(r.querySelector("dd"))])),
      notes: Array.from(c.querySelectorAll(".notes li")).map(text),
    })),
    invalid: Array.from(document.querySelectorAll('[aria-invalid="true"]')).map((e) => e.name),
    jump: jump && !jump.hidden
      ? { text: text(jump), error: jump.classList.contains("error"), shown: getComputedStyle(jump).display !== "none" }
      : null,
  };
})()`;

/** 横スクロールと、画面や枠からのはみ出しを探す。 */
const OVERFLOW = `(() => {
  const root = document.documentElement;
  const vw = root.clientWidth;
  const found = [];
  if (root.scrollWidth > vw) found.push("ページ全体が横にスクロールします（" + root.scrollWidth + " > " + vw + "）");
  const inScroller = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === "auto" || o === "scroll") return true;
    }
    return false;
  };
  const name = (el) =>
    el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") +
    (typeof el.className === "string" && el.className.trim() !== "" ? "." + el.className.trim().split(/\\s+/).join(".") : "") +
    " 「" + (el.textContent ?? "").trim().slice(0, 24) + "」";
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || inScroller(el)) continue;
    if (r.right > vw + 0.5 || r.left < -0.5) {
      found.push("画面からはみ出しています: " + name(el) + "（左 " + Math.round(r.left) + " 〜 右 " + Math.round(r.right) + " / 幅 " + vw + "）");
    } else if (style.display !== "inline" && style.overflowX === "visible" && el.scrollWidth > el.clientWidth + 1) {
      found.push("中身が枠からはみ出しています: " + name(el) + "（中身 " + el.scrollWidth + " > 枠 " + el.clientWidth + "）");
    }
  }
  return found;
})()`;

/** 値が入っているのに画面に出ていない入力欄の名前 */
const HIDDEN_VALUES = `Array.from(document.querySelectorAll("#form input:not([type=radio]):not([type=checkbox])"))
  .filter((el) => el.value !== "" && !el.checkVisibility())
  .map((el) => el.name)`;

let server;
let browser;

before(async () => {
  assert.ok(existsSync(cliPath), "dist/cli.js がありません。先に npm run build を実行してください");
  const chrome = findChrome();
  assert.ok(chrome, "Chrome / Chromium が見つかりません。環境変数 CHROME_BIN で場所を指定してください");
  server = await serveDocs(join(root, "docs"));
  browser = await launch(chrome);
});

after(async () => {
  await browser?.close();
  server?.close();
});

/** タブを 1 つ開いてテストし、最後にコンソールのエラーと外への通信がないことを確かめる。 */
function browserTest(name, fn) {
  test(name, { timeout: 60_000 }, async () => {
    const page = await browser.newPage();
    await page.viewport(1280, 900);
    await fn(page);
    assert.deepEqual(page.errors, [], "コンソールにエラーが出ています");
    const outside = page.requests.filter((url) => !url.startsWith(server.origin) && !url.startsWith("data:") && url !== "about:blank");
    assert.deepEqual(outside, [], "ページの外への通信があります");
  });
}

const card = (view, title) => view.cards.find((c) => c.title === title);
const cardStarting = (view, prefix) => view.cards.find((c) => c.title.startsWith(prefix));

// ───────────────────────── トップページ ─────────────────────────

const TOP_DETAILS = new Set(["ideco-limit", "ideco-add", "kyosai-add", "nhi-rate"]);

/** トップページのフォームに、キーボードとマウスで入力する。 */
async function fillTop(page, values) {
  for (const [name, value] of Object.entries(values)) {
    if (name === "misc") {
      await page.click(`input[name="income-type"][value="${value ? "misc" : "business"}"]`);
    } else if (name === "blue") {
      await page.select('select[name="blue"]', value);
    } else if (value === true) {
      await page.click(`input[name="${name}"]`);
    } else {
      if (name === "spouse-income" && !(await page.evaluate('document.querySelector(\'input[name="has-spouse"]\').checked'))) {
        await page.click('input[name="has-spouse"]');
      }
      if (TOP_DETAILS.has(name) && !(await page.evaluate('document.querySelector("#form details").open'))) {
        await page.click("#form details > summary");
      }
      await page.type(`input[name="${name}"]`, value);
    }
  }
}

const BLUE_LABEL = { none: "白色申告", 10: "青色 10万円", 55: "青色 55万円", 65: "青色 65万円" };

/** トップページに出ている金額が、CLI の結果と同じであること。 */
function assertTopMatches(view, r) {
  const b = r.baseline;
  const m = r.measures;
  assert.equal(view.alert, null, "入力エラーが出ています");
  assert.deepEqual(view.figures, {
    いまの見込み税額: yen(b.totalTax),
    まとめて実行すると減る税額: yen(m.combined.saving.total),
    そのために追加で支払う額: yen(m.combined.totalPayment),
  });

  const now = card(view, `現状の見込み（${r.label}）`);
  assert.ok(now, "現状の見込みの欄がありません");
  assert.equal(now.rows["合計所得金額"], yen(b.totalIncome));
  assert.equal(now.rows["所得税 + 復興特別所得税"], yen(b.incomeTax.total));
  assert.equal(now.rows[`住民税（${r.residentTaxLabel}）`], yen(b.residentTax.total));
  assert.equal(now.rows["税額の合計"], yen(b.totalTax));
  if (r.input.businessRevenue > 0) {
    assert.equal(now.rows[r.input.businessIncomeType === "business" ? "事業所得" : "雑所得"], yen(b.businessIncome));
  }

  const combined = cardStarting(view, "まとめて実行した場合");
  if (m.combined.totalPayment > 0) {
    assert.ok(combined, "まとめて実行した場合の欄がありません");
    assert.equal(combined.rows["追加で支払う額の合計"], yen(m.combined.totalPayment));
    assert.equal(combined.rows["減る税額の合計"], yen(m.combined.saving.total));
    assert.equal(combined.title.includes("iDeCo"), m.combined.idecoAdditional > 0);
  } else assert.equal(combined, undefined);

  const withIdeco = cardStarting(view, "iDeCo の追加も年内に間に合う場合");
  if (m.combinedWithIdeco) {
    assert.ok(withIdeco, "iDeCo も間に合う場合の欄がありません");
    assert.equal(withIdeco.rows["追加で支払う額の合計"], yen(m.combinedWithIdeco.totalPayment));
    assert.equal(withIdeco.rows["減る税額の合計"], yen(m.combinedWithIdeco.saving.total));
  } else assert.equal(withIdeco, undefined);

  const furusato = card(view, "ふるさと納税");
  assert.deepEqual(furusato.notes, m.furusato.notes);
  if (m.furusato.limit > 0) {
    assert.equal(furusato.rows["控除上限額の目安（年間）"], yen(m.furusato.limit));
    assert.equal(furusato.rows["上限までの残り（追加で寄附する額）"], yen(m.furusato.remaining));
    assert.equal(furusato.rows["減る税額"], yen(m.furusato.saving.total));
  } else assert.deepEqual(furusato.rows, {});

  for (const [title, measure] of [
    ["iDeCo（個人型確定拠出年金）", m.ideco],
    ["小規模企業共済", m.kyosai],
  ]) {
    const c = card(view, title);
    assert.deepEqual(c.notes, measure.notes);
    if (measure.applicable) {
      assert.equal(c.rows["残り枠"], yen(measure.remaining));
      assert.equal(c.rows["試算した追加額（追加で支払う額）"], yen(measure.additional));
      assert.equal(c.rows["減る税額"], yen(measure.saving.total));
      assert.equal(c.rows["うち所得税"], yen(measure.saving.incomeTax));
      assert.equal(c.rows["うち住民税"], yen(measure.saving.residentTax));
    } else assert.deepEqual(c.rows, {});
  }

  const blue = card(view, "青色申告特別控除");
  if (m.blueReturn.applicable) {
    assert.deepEqual(
      Object.keys(blue.rows),
      m.blueReturn.options.map((o) => `${BLUE_LABEL[o.level]}（税額 ${yen(o.totalTax)}）`),
    );
  } else assert.deepEqual(blue.rows, {});

  const nhi = cardStarting(view, "国民健康保険料");
  if (m.nationalHealthInsurance) {
    assert.ok(nhi, "国民健康保険料の欄がありません");
    assert.equal(nhi.rows["所得割額の目安"], yen(m.nationalHealthInsurance.incomeLevy));
  } else assert.equal(nhi, undefined);

  assert.deepEqual(card(view, "注意")?.notes ?? [], r.warnings);
  assert.ok(view.jump, "結果へ飛ぶ帯が出ていません");
  assert.ok(view.jump.text.includes(yen(b.totalTax)));
  assert.equal(view.jump.error, false);
}

/** 入力エラーの表示が、CLI の指摘と同じであること。 */
function assertIssuesMatch(view, issues) {
  assert.ok(view.alert, "入力エラーが表示されていません");
  assert.equal(view.alert.length, issues.length);
  const flags = [];
  for (const [i, issue] of issues.entries()) {
    const match = /^--([a-z0-9-]+): (.*)$/s.exec(issue);
    assert.ok(match, `CLI の指摘にフラグ名がありません: ${issue}`);
    flags.push(match[1]);
    assert.ok(view.alert[i].endsWith(match[2]), `「${view.alert[i]}」が CLI の指摘「${match[2]}」と違います`);
    assert.notEqual(view.alert[i], match[2], "どの欄の誤りかが表示されていません");
  }
  assert.deepEqual([...view.invalid].sort(), [...new Set(flags)].sort());
  assert.deepEqual(view.figures, {});
  assert.ok(view.jump?.error, "結果へ飛ぶ帯がエラーの表示になっていません");
  assert.ok(view.jump.text.includes(`${issues.length} 件`));
}

const EXAMPLE = {
  revenue: "800万",
  expenses: "150万",
  blue: "65",
  "social-insurance": "90万",
  "ideco-paid": "27.6万",
  "furusato-paid": "3万",
};

browserTest("トップ: 開いた直後は案内だけが出て、版と出典の一覧が入っている", async (page) => {
  await page.goto(server.base);
  const view = await page.evaluate(READ);
  assert.equal(view.placeholder, "収入を入力すると、ここに結果が出ます。");
  assert.equal(view.jump, null);
  assert.deepEqual(view.figures, {});
  const version = spawnSync(process.execPath, [cliPath, "--version"], { encoding: "utf8" }).stdout.trim();
  assert.equal(await page.evaluate('document.querySelector("#version").textContent'), `setsuzei ${version}`);
  const sources = spawnSync(process.execPath, [cliPath, "--sources"], { encoding: "utf8" }).stdout;
  const links = await page.evaluate('Array.from(document.querySelectorAll("#sources a")).map((a) => a.href)');
  assert.ok(links.length > 0);
  for (const url of links) assert.ok(sources.includes(url), `CLI の出典の一覧にない URL です: ${url}`);
});

browserTest("トップ: 「例を入れてみる」の結果が CLI と一致し、「入力を消す」で案内に戻る", async (page) => {
  await page.goto(server.base);
  await page.click("#example");
  const expected = cli(EXAMPLE);
  assert.ok(expected.ok);
  assertTopMatches(await page.evaluate(READ), expected.result);
  await page.click('#form button[type="reset"]');
  await page.evaluate("new Promise((r) => setTimeout(r, 50))"); // 消したあとの再計算は、次のタイミングで行われる
  const view = await page.evaluate(READ);
  assert.equal(view.placeholder, "収入を入力すると、ここに結果が出ます。");
  assert.equal(view.jump, null);
});

browserTest("トップ: キーボードで打ち込んだ結果が CLI と一致する（副業・雑所得）", async (page) => {
  await page.goto(server.base);
  const values = { salary: "600万", revenue: "120万", expenses: "20万", misc: true, "social-insurance": "88万" };
  await fillTop(page, values);
  const expected = cli(values);
  assert.ok(expected.ok);
  assertTopMatches(await page.evaluate(READ), expected.result);
});

browserTest("トップ: 所得区分を切り替えると、青色申告の欄と結果が切り替わる", async (page) => {
  await page.goto(server.base);
  const business = { revenue: "500万", expenses: "100万", blue: "65", "social-insurance": "70万" };
  await fillTop(page, business);
  const blueShown = 'getComputedStyle(document.querySelector("label.only-business")).display !== "none"';
  assert.equal(await page.evaluate(blueShown), true);
  assertTopMatches(await page.evaluate(READ), cli(business).result);

  // 雑所得にすると、青色申告の欄が消え、選んであった 65 万円は使われない
  await page.click('input[name="income-type"][value="misc"]');
  assert.equal(await page.evaluate(blueShown), false);
  const misc = cli({ revenue: "500万", expenses: "100万", misc: true, "social-insurance": "70万" });
  const view = await page.evaluate(READ);
  assertTopMatches(view, misc.result);
  assert.equal(misc.result.measures.blueReturn.applicable, false);
  assert.ok("雑所得" in card(view, `現状の見込み（${misc.result.label}）`).rows);

  // 事業所得に戻すと、元の結果に戻る
  await page.click('input[name="income-type"][value="business"]');
  assert.equal(await page.evaluate(blueShown), true);
  assertTopMatches(await page.evaluate(READ), cli(business).result);
});

browserTest("トップ: 16 歳未満の扶養親族を入れると、住民税の所得割の非課税が反映される", async (page) => {
  await page.goto(server.base);
  const without = { revenue: "250万", expenses: "30万", blue: "65", "social-insurance": "30万", "spouse-income": "0" };
  await fillTop(page, without);
  const before16 = cli(without);
  assertTopMatches(await page.evaluate(READ), before16.result);
  assert.equal(before16.result.baseline.residentTax.incomeLevyExempt, false);

  await page.type('input[name="dependents-under16"]', "3");
  const after16 = cli({ ...without, "dependents-under16": "3" });
  assert.equal(after16.result.baseline.residentTax.incomeLevyExempt, true);
  const view = await page.evaluate(READ);
  assertTopMatches(view, after16.result);
  assert.equal(after16.result.measures.furusato.limit, 0);
  assert.ok(card(view, "注意").notes.length > 0, "非課税についての注意が出ていません");

  // 人数を消すと元に戻る
  await page.type('input[name="dependents-under16"]', "");
  assertTopMatches(await page.evaluate(READ), before16.result);
});

browserTest("トップ: iDeCo に年内に追加できる額を入れたときだけ、合計に iDeCo が入る", async (page) => {
  await page.goto(server.base);
  await page.click("#example");
  const base = cli(EXAMPLE);
  assert.equal(base.result.measures.combined.includesIdeco, false);
  const first = await page.evaluate(READ);
  assertTopMatches(first, base.result);
  assert.ok(cardStarting(first, "iDeCo の追加も年内に間に合う場合"), "iDeCo も間に合う場合の欄がありません");

  await fillTop(page, { "ideco-add": "10万" });
  const added = cli({ ...EXAMPLE, "ideco-add": "10万" });
  assert.equal(added.result.measures.combined.includesIdeco, true);
  assert.equal(added.result.measures.combined.idecoAdditional, 100000);
  assertTopMatches(await page.evaluate(READ), added.result);

  // 条件の欄をすべて使う
  const all = { "ideco-limit": "60万", "ideco-add": "5万", "kyosai-add": "30万", "nhi-rate": "11.5" };
  await fillTop(page, all);
  assertTopMatches(await page.evaluate(READ), cli({ ...EXAMPLE, ...all }).result);
});

browserTest("トップ: 家族と控除の欄をすべて使った結果が CLI と一致する", async (page) => {
  await page.goto(server.base);
  const values = {
    salary: "1000万",
    "social-insurance": "140万",
    "ideco-paid": "12万",
    "kyosai-paid": "0",
    "furusato-paid": "2万",
    "other-deductions": "12万",
    "spouse-income": "48万",
    "spouse-70": true,
    "dependents-under16": "1",
    dependents: "1",
    "dependents-specific": "1",
    "dependents-elderly-cohabiting": "1",
    "dependents-elderly": "1",
    "income-adjustment": true,
  };
  await fillTop(page, values);
  const expected = cli(values);
  assert.ok(expected.ok);
  assert.ok(expected.result.baseline.incomeAdjustment > 0);
  assertTopMatches(await page.evaluate(READ), expected.result);

  // 「配偶者がいる」を外すと、入れてあった配偶者の所得は使われない
  await page.click('input[name="has-spouse"]');
  const { "spouse-income": _income, "spouse-70": _age, ...single } = values;
  assertTopMatches(await page.evaluate(READ), cli(single).result);
});

browserTest("トップ: 誤った入力は、欄の名前つきで CLI と同じ指摘が出る", async (page) => {
  await page.goto(server.base);
  for (const values of [
    { revenue: "abc" },
    { revenue: "-100万" },
    { revenue: "100万", expenses: "-5", "dependents-under16": "1.5" },
    { revenue: "100万", expenses: "", "dependents-under16": "", "nhi-rate": "200" },
    { revenue: "100万", "nhi-rate": "", "ideco-add": "1億", "spouse-income": "x" },
  ]) {
    await fillTop(page, values);
    const current = await page.evaluate(
      'Object.fromEntries(Array.from(document.querySelectorAll(\'#form input:not([type="radio"]):not([type="checkbox"])\')).filter((el) => el.value !== "").map((el) => [el.name, el.value]))',
    );
    const expected = cli(current);
    assert.equal(expected.ok, false, `CLI はこの入力を受け付けました: ${JSON.stringify(current)}`);
    assertIssuesMatch(await page.evaluate(READ), expected.issues);
  }
  // 直すと結果が出て、印が消える
  await fillTop(page, { "ideco-add": "", "spouse-income": "0" });
  const fixed = await page.evaluate(READ);
  assertTopMatches(fixed, cli({ revenue: "100万", "spouse-income": "0" }).result);
  assert.deepEqual(fixed.invalid, []);
});

browserTest("トップ: URL のクエリで入力を引き継げる", async (page) => {
  await page.goto(`${server.base}?revenue=${encodeURIComponent("800万")}&expenses=${encodeURIComponent("150万")}&blue=65&social-insurance=${encodeURIComponent("90万")}&dependents-under16=2&spouse-income=0&ideco-add=${encodeURIComponent("10万")}`);
  const values = {
    revenue: "800万",
    expenses: "150万",
    blue: "65",
    "social-insurance": "90万",
    "dependents-under16": "2",
    "spouse-income": "0",
    "ideco-add": "10万",
  };
  assertTopMatches(await page.evaluate(READ), cli(values).result);
  // 引き継いだ値は、どれも画面に見えている（閉じた欄の中に隠れたまま結果に効かない）
  assert.deepEqual(await page.evaluate(HIDDEN_VALUES), []);
});

browserTest("トップ: スマホ幅（375px）で、横スクロールもはみ出しもない", async (page) => {
  await page.viewport(375, 720, true);
  await page.goto(server.base);
  assert.deepEqual(await page.evaluate(OVERFLOW), [], "空のとき");

  // すべての欄を開き、桁の多い金額を入れる
  await page.click("#example");
  await fillTop(page, {
    salary: "1,234,567,890",
    revenue: "9,876,543,210",
    "spouse-income": "0",
    "dependents-under16": "2",
    "ideco-add": "10万",
    "kyosai-add": "30万",
    "nhi-rate": "11.5",
  });
  await page.click(".disclaimer details > summary");
  const view = await page.evaluate(READ);
  assert.equal(view.alert, null);
  assert.deepEqual(await page.evaluate(OVERFLOW), [], "結果が出ているとき");

  // 結果へ飛ぶ帯が出ていて、押すと結果が画面に入る
  assert.equal(view.jump?.shown, true);
  await page.evaluate("window.scrollTo(0, 0)");
  await page.click("#jump");
  const top = await page.evaluate('document.querySelector("#results").getBoundingClientRect().top');
  assert.ok(top >= -1 && top < 720, `結果が画面に入っていません（top ${top}）`);

  await fillTop(page, { revenue: "あいうえおかきくけこさしすせそたちつてとなにぬねの", expenses: "-5" });
  assert.ok((await page.evaluate(READ)).alert);
  assert.deepEqual(await page.evaluate(OVERFLOW), [], "入力エラーのとき");
});

// ───────────────────────── 説明ページ ─────────────────────────

/** 説明ページの初期値（ページに書いてある例） */
const PAGE_DEFAULTS = { revenue: "800万", expenses: "150万", blue: "65", "social-insurance": "90万" };

/** 説明ページのフォームに入力する（欄は金額と青色申告の選択だけ）。 */
async function fillPage(page, values) {
  for (const [name, value] of Object.entries(values)) {
    if (name === "blue") await page.select('select[name="blue"]', value);
    else await page.type(`input[name="${name}"]`, value);
  }
}

const baselineRows = (view, r) => {
  const now = card(view, `現状の見込み（${r.label}）`);
  assert.ok(now, "現状の見込みの欄がありません");
  assert.equal(now.rows["所得税 + 復興特別所得税"], yen(r.baseline.incomeTax.total));
  assert.equal(now.rows[`住民税（${r.residentTaxLabel}）`], yen(r.baseline.residentTax.total));
};

const PAGES = [
  {
    slug: "furusato-nozei-freelance",
    change: { revenue: "500万", "ideco-paid": "27.6万", "kyosai-paid": "12万", "furusato-paid": "2万" },
    matches(view, r) {
      const f = r.measures.furusato;
      assert.deepEqual(view.figures, {
        "上限の目安（年間）": yen(f.limit),
        "あと寄附できる額（支払う額）": yen(f.remaining),
        それで減る税額: yen(f.saving.total),
      });
      const c = card(view, "ふるさと納税");
      assert.equal(c.rows["控除上限額の目安（年間）"], yen(f.limit));
      assert.equal(c.rows["寄附済み"], yen(f.paid));
      assert.equal(c.rows["上限までの残り"], yen(f.remaining));
      assert.equal(c.rows["うち所得税"], yen(f.saving.incomeTax));
      assert.equal(c.rows["うち住民税（翌年度）"], yen(f.saving.residentTax));
      assert.deepEqual(c.notes, f.notes);
      assert.ok(view.jump.text.includes(yen(f.limit)));
    },
  },
  {
    slug: "ideco-kojin-jigyonushi",
    change: { revenue: "600万", "ideco-paid": "27.6万", "ideco-add": "10万" },
    matches: (view, r) => contributionMatches(view, "iDeCo", r.measures.ideco),
  },
  {
    slug: "shokibo-kyosai-setsuzei",
    change: { revenue: "600万", "ideco-paid": "27.6万", "kyosai-paid": "12万", "kyosai-add": "30万" },
    matches: (view, r) => contributionMatches(view, "小規模企業共済", r.measures.kyosai),
  },
  {
    slug: "aoiro-shinkoku-65-55-10",
    change: { revenue: "600万", blue: "10", "nhi-rate": "11.5" },
    matches(view, r) {
      const blue = r.measures.blueReturn;
      const c = card(view, "青色申告特別控除の区分ごとの税額");
      assert.deepEqual(
        Object.keys(c.rows),
        blue.options.map((o) => `${BLUE_LABEL[o.level]}: 税額 ${yen(o.totalTax)}`),
      );
      for (const o of blue.options) {
        const diff = o.savingVsCurrent.total;
        const text = o.current ? "現在の見込み" : diff >= 0 ? `${yen(diff)} 減る` : `${yen(-diff)} 増える`;
        assert.equal(c.rows[`${BLUE_LABEL[o.level]}: 税額 ${yen(o.totalTax)}`], text);
      }
      assert.deepEqual(c.notes, blue.notes);
      const nhi = r.measures.nationalHealthInsurance;
      const nhiCard = cardStarting(view, "国民健康保険料");
      if (nhi) {
        assert.deepEqual(
          Object.keys(nhiCard.rows),
          nhi.blueReturnOptions.map((o) => `${BLUE_LABEL[o.level]}: 所得割 ${yen(o.incomeLevy)}`),
        );
      } else assert.equal(nhiCard, undefined);
    },
  },
];

function contributionMatches(view, title, m) {
  assert.equal(m.applicable, true);
  assert.deepEqual(view.figures, { 追加で支払う掛金: yen(m.additional), 減る税額: yen(m.saving.total) });
  const c = card(view, title);
  assert.equal(c.rows["年間上限"], yen(m.annualLimit));
  assert.equal(c.rows["支払済み・支払予定"], yen(m.paid));
  assert.equal(c.rows["残り枠"], yen(m.remaining));
  assert.equal(c.rows["試算した追加額（追加で支払う額）"], yen(m.additional));
  assert.equal(c.rows["減る税額（所得税 + 住民税）"], yen(m.saving.total));
  assert.equal(c.rows["うち所得税"], yen(m.saving.incomeTax));
  assert.equal(c.rows["うち住民税（翌年度）"], yen(m.saving.residentTax));
  assert.deepEqual(c.notes, m.notes);
  assert.ok(view.jump.text.includes(yen(m.saving.total)));
}

for (const spec of PAGES) {
  const url = () => `${server.base}${spec.slug}/`;

  browserTest(`${spec.slug}: 初期値と、打ち込んだ値の結果が CLI と一致する`, async (page) => {
    await page.goto(url());
    const initial = cli(PAGE_DEFAULTS);
    let view = await page.evaluate(READ);
    assert.equal(view.alert, null);
    spec.matches(view, initial.result);
    baselineRows(view, initial.result);

    await fillPage(page, spec.change);
    const values = { ...PAGE_DEFAULTS, ...spec.change };
    const changed = cli(values);
    assert.ok(changed.ok);
    view = await page.evaluate(READ);
    assert.equal(view.alert, null);
    spec.matches(view, changed.result);
    baselineRows(view, changed.result);
    assert.deepEqual(card(view, "注意")?.notes ?? [], changed.result.warnings);

    // 「全項目で計算する」へ、いまの入力を引き継ぐ
    await page.navigateBy(() => page.click("#full"));
    assert.equal(await page.evaluate("location.pathname"), "/setsuzei/");
    assertTopMatches(await page.evaluate(READ), changed.result);
    assert.deepEqual(await page.evaluate(HIDDEN_VALUES), [], "引き継いだ値が、閉じた欄の中に隠れています");
  });

  browserTest(`${spec.slug}: 空入力は案内、誤入力は欄の名前つきの指摘になる`, async (page) => {
    await page.goto(url());
    await fillPage(page, { revenue: "" });
    let view = await page.evaluate(READ);
    assert.equal(view.placeholder, "売上を入力すると、ここに結果が出ます。");
    assert.equal(view.jump, null);

    for (const wrong of [{ revenue: "abc" }, { revenue: "-100万" }, { revenue: "800万", expenses: "1.5.5", "social-insurance": "-1" }]) {
      await fillPage(page, wrong);
      const expected = cli({ ...PAGE_DEFAULTS, ...wrong });
      assert.equal(expected.ok, false);
      assertIssuesMatch(await page.evaluate(READ), expected.issues);
    }
    await fillPage(page, { expenses: "150万", "social-insurance": "90万" });
    view = await page.evaluate(READ);
    assert.equal(view.alert, null);
    assert.deepEqual(view.invalid, []);
    spec.matches(view, cli(PAGE_DEFAULTS).result);
  });

  browserTest(`${spec.slug}: スマホ幅（375px）で、横スクロールもはみ出しもない`, async (page) => {
    await page.viewport(375, 720, true);
    await page.goto(url());
    assert.deepEqual(await page.evaluate(OVERFLOW), [], "初期値のとき");
    // 表は、表の枠の中だけで横にスクロールする
    assert.ok(
      await page.evaluate('Array.from(document.querySelectorAll("table")).every((t) => ["auto", "scroll"].includes(getComputedStyle(t.closest(".table-wrap")).overflowX))'),
    );
    await fillPage(page, { ...spec.change, revenue: "9,876,543,210" });
    assert.deepEqual(await page.evaluate(OVERFLOW), [], "桁の多い金額のとき");
    await fillPage(page, { revenue: "あいうえおかきくけこさしすせそたちつてとなにぬねの", expenses: "-5" });
    assert.ok((await page.evaluate(READ)).alert);
    assert.deepEqual(await page.evaluate(OVERFLOW), [], "入力エラーのとき");
    await fillPage(page, { revenue: "" });
    assert.deepEqual(await page.evaluate(OVERFLOW), [], "空のとき");
  });
}
