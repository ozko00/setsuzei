/**
 * 公開ページ（docs/）を実際のブラウザで操作するテスト。
 *
 *   npm run test:browser
 *
 * ヘッドレスの Chrome でトップと説明ページ 5 枚を開き、キーボードとマウスで入力して、
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
  const result = document.querySelector("#results");
  const jump = document.querySelector("#jump");
  const plan = document.querySelector("#plan");
  const shownPlan = plan && !plan.hidden && !plan.classList.contains("stale");
  const action = (name) => {
    const li = document.querySelector("#act-" + name);
    return {
      hidden: li.hidden,
      off: li.classList.contains("off"),
      optional: li.classList.contains("optional"),
      amount: document.querySelector("#" + name + "-add").value,
      saving: text(document.querySelector("#" + name + "-saving")),
      hint: text(document.querySelector("#" + name + "-hint")),
    };
  };
  return {
    placeholder: result.querySelector(".placeholder") ? text(result.querySelector(".placeholder")) : null,
    alert: result.querySelector('[role="alert"]')
      ? Array.from(result.querySelectorAll('[role="alert"] li')).map(text)
      : null,
    figures: Object.fromEntries(
      Array.from(result.querySelectorAll(".headline .figure")).filter((f) => !plan || !plan.contains(f) || shownPlan).map((f) => [text(f.querySelector(".label")), text(f.querySelector("strong"))]),
    ),
    cards: Array.from(result.querySelectorAll("section.card")).map((c) => ({
      title: text(c.querySelector("h3")),
      rows: Object.fromEntries(Array.from(c.querySelectorAll(".row")).map((r) => [text(r.querySelector("dt")), text(r.querySelector("dd"))])),
      notes: Array.from(c.querySelectorAll(".notes li")).map(text),
    })),
    plan: plan ? {
      lead: text(document.querySelector("#plan-lead")),
      assumed: document.querySelector("#assumed").hidden ? [] : Array.from(document.querySelectorAll("#assumed-list li")).map(text),
      furusato: action("furusato"), kyosai: action("kyosai"), ideco: action("ideco"),
      resetShown: !document.querySelector("#plan-reset").hidden,
      budget: text(document.querySelector("#budget-reason")),
    } : null,
    text: document.querySelector("main").innerText,
    effective: plan && plan.dataset.effective ? JSON.parse(plan.dataset.effective) : null,
    invalid: Array.from(document.querySelectorAll('[aria-invalid="true"]')).map((e) => e.name),
    jump: jump
      ? { text: text(jump), error: jump.classList.contains("error"), shown: !jump.hidden && getComputedStyle(jump).display !== "none" }
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
    // 前のテストが保存した入力が残っていても、まっさらな状態から始める
    await page.send("Storage.clearDataForOrigin", { origin: server.origin, storageTypes: "local_storage" });
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

/** 「さらに細かい条件」の中にある欄 */
const TOP_NESTED = new Set(["ideco-limit", "nhi-rate"]);
/** 結果の「年内にやること」の中にある、払う額の欄 */
const TOP_PLAN = new Set(["furusato-add", "kyosai-add", "ideco-add"]);
/** 計算コアの注意書きから、画面では出さない括弧（CLI・JSON の指定方法）を外す */
const shown = (note) => note.replace(/（CLI は[^）]*）/g, "");

/** 払う額の欄の文字（「10万」「100,000」）を数にする */
const amountOf = (text) => (text.endsWith("万") ? Number(text.slice(0, -1)) * 10000 : Number(text.replace(/,/g, "")));

const checked = (page, selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)}).checked`);

/** 「もっと正確にする」を開く */
async function openMore(page) {
  if (await page.evaluate('document.querySelector("#more").open')) return;
  await page.click("#more > summary");
  // 開いたあと、開いた先頭が見える位置へ画面が送られるのを待つ
  await page.evaluate("new Promise((r) => setTimeout(r, 50))");
}

/**
 * トップページのフォームに、キーボードとマウスで入力する。
 * exact = true のときは、目安や既定を使わず、CLI に同じ値を渡したときと同じ計算になるようにそろえる
 * （働き方は給与の有無から、社会保険料は「金額を入れる」、所得の種類は misc の指定どおり）。
 */
async function fillTop(page, values, exact = true) {
  if (exact) {
    await openMore(page);
    if ("salary" in values || "revenue" in values) {
      const work = "salary" in values ? (values.salary !== "" ? "employee" : "freelance") : (await checked(page, 'input[name="work"][value="employee"]')) ? "employee" : "freelance";
      if (!(await checked(page, `input[name="work"][value="${work}"]`))) await page.click(`input[name="work"][value="${work}"]`);
    }
    if (!(await checked(page, 'input[name="si-mode"][value="enter"]'))) await page.click('input[name="si-mode"][value="enter"]');
    // 「金額を入れる」は、額を入れるまで目安で計算する。CLI と同じ 0 円にするには 0 と入れる
    if (!("social-insurance" in values) && (await page.evaluate('document.querySelector(\'input[name="social-insurance"]\').value')) === "") {
      await page.type('input[name="social-insurance"]', "0");
    }
  }
  for (const [name, value] of Object.entries(values)) {
    if (name === "misc") continue;
    if (name === "blue") {
      await openMore(page);
      await page.select('select[name="blue"]', value);
    } else if (value === true) {
      await openMore(page);
      await page.click(`input[name="${name}"]`);
    } else {
      if (!["salary", "revenue", "expenses"].includes(name) && !TOP_PLAN.has(name)) await openMore(page);
      if (name === "spouse-income" && !(await checked(page, 'input[name="has-spouse"]'))) await page.click('input[name="has-spouse"]');
      if (TOP_NESTED.has(name) && !(await page.evaluate('document.querySelector("#more details.nested").open'))) {
        await page.click("#more details.nested > summary");
      }
      await page.type(`input[name="${name}"]`, value);
    }
  }
  // 所得の種類は、売上が入って欄が出てから選ぶ
  if (exact && (await page.evaluate('document.querySelector(\'input[name="income-type"]\').checkVisibility()'))) {
    const type = values.misc ? "misc" : "business";
    if ("misc" in values || "salary" in values || "revenue" in values) {
      if (!(await checked(page, `input[name="income-type"][value="${type}"]`)) || !("misc" in values)) await page.click(`input[name="income-type"][value="${type}"]`);
    }
  }
  // 払う額の欄からカーソルを外す（空にした欄が、おすすめの額に戻る）
  await page.evaluate("document.activeElement?.blur()");
}

const BLUE_LABEL = { none: "白色申告", 10: "青色 10万円", 55: "青色 55万円", 65: "青色 65万円" };

/**
 * トップページと同じ条件で CLI を実行する。
 * トップページは、小規模企業共済にいま入っていない人には、払う額を入れるまで合計に入れない（--kyosai-add=0 と同じ）。
 */
function topCli(values) {
  const first = cli(values);
  if (!first.ok || "kyosai-add" in values) return first;
  const k = first.result.measures.kyosai;
  return k.applicable && k.paid === 0 ? cli({ ...values, "kyosai-add": "0" }) : first;
}

/** トップページに出ている金額が、CLI の結果と同じであること。 */
function assertTopMatches(view, r, { customFurusato = false } = {}) {
  const b = r.baseline;
  const m = r.measures;
  const c = m.combined;
  assert.equal(view.alert, null, "入力エラーが出ています");
  if (!customFurusato) {
    assert.deepEqual(view.figures, {
      減る税額の合計: yen(c.saving.total),
      そのために年内に払う額: yen(c.totalPayment),
      "いまの税額の見込み → 実行後": `${yen(b.totalTax)} → ${yen(c.totalTax)}`,
    });
    assert.equal(
      view.plan.lead,
      c.totalPayment > 0
        ? `年内に${[c.furusatoAdditional, c.kyosaiAdditional, c.idecoAdditional].filter((n) => n > 0).length > 1 ? "合わせて " : " "}${yen(c.totalPayment)}払うと、税金が ${yen(c.saving.total)}減る見込みです。`
        : "いまの見込みでは、年内に追加で払って税金が減るものはありません。",
    );
    // やることの一覧: 払う額と、減る税額
    assert.equal(view.plan.furusato.off, m.furusato.limitAfterOtherMeasures === 0);
    if (m.furusato.limitAfterOtherMeasures > 0) {
      assert.equal(amountOf(view.plan.furusato.amount), c.furusatoAdditional);
      assert.ok(view.plan.furusato.saving.startsWith(yen(c.savingFromFurusato.total)), view.plan.furusato.saving);
      assert.ok(view.plan.furusato.hint.includes(yen(m.furusato.limitAfterOtherMeasures)));
    }
    assert.equal(view.plan.kyosai.hidden, !m.kyosai.applicable);
    if (m.kyosai.applicable) assert.equal(amountOf(view.plan.kyosai.amount), c.kyosaiAdditional);
    // いま入っていない人で、額を入れていなければ「さらに減らしたい場合」として合計の外に出す
    if (m.kyosai.applicable) assert.equal(view.plan.kyosai.optional, m.kyosai.paid === 0 && view.plan.kyosai.amount === "");
    assert.equal(amountOf(view.plan.ideco.amount), c.idecoAdditional);
    assert.equal(view.plan.ideco.amount !== "", c.includesIdeco);
    if (m.kyosai.applicable && c.idecoAdditional === 0 && !view.plan.kyosai.optional) {
      assert.ok(view.plan.kyosai.saving.startsWith(yen(c.savingFromContributions.total)), view.plan.kyosai.saving);
    }
    if (!m.kyosai.applicable && c.includesIdeco) assert.ok(view.plan.ideco.saving.startsWith(yen(c.savingFromContributions.total)));
    if (!c.includesIdeco) assert.equal(view.plan.ideco.saving, "合計に入れていません");
  }

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
  if (c.totalPayment > 0) {
    assert.ok(combined, "まとめて実行した場合の欄がありません");
    assert.equal(combined.rows["追加で支払う額の合計"], yen(c.totalPayment));
    assert.equal(combined.rows["減る税額の合計"], yen(c.saving.total));
    assert.equal(combined.title.includes("iDeCo"), c.idecoAdditional > 0);
  } else assert.equal(combined, undefined);

  const withIdeco = cardStarting(view, "iDeCo の追加も年内に間に合う場合");
  if (m.combinedWithIdeco) {
    assert.ok(withIdeco, "iDeCo も間に合う場合の欄がありません");
    assert.equal(withIdeco.rows["追加で支払う額の合計"], yen(m.combinedWithIdeco.totalPayment));
    assert.equal(withIdeco.rows["減る税額の合計"], yen(m.combinedWithIdeco.saving.total));
  } else assert.equal(withIdeco, undefined);

  const furusato = card(view, "ふるさと納税");
  assert.deepEqual(furusato.notes, m.furusato.notes.map(shown));
  if (m.furusato.limit > 0) {
    assert.equal(furusato.rows["控除上限額の目安（年間）"], yen(m.furusato.limit));
    assert.equal(furusato.rows["上限までの残り（追加で寄附する額）"], yen(m.furusato.remaining));
    assert.equal(furusato.rows["減る税額"], yen(m.furusato.saving.total));
  } else assert.deepEqual(furusato.rows, {});

  for (const [title, measure] of [
    ["iDeCo（個人型確定拠出年金）", m.ideco],
    ["小規模企業共済", m.kyosai],
  ]) {
    const item = card(view, title);
    assert.deepEqual(item.notes, measure.notes.map(shown));
    if (measure.applicable) {
      assert.equal(item.rows["残り枠"], yen(measure.remaining));
      assert.equal(item.rows["試算した追加額（追加で支払う額）"], yen(measure.additional));
      assert.equal(item.rows["減る税額"], yen(measure.saving.total));
      assert.equal(item.rows["うち所得税"], yen(measure.saving.incomeTax));
      assert.equal(item.rows["うち住民税"], yen(measure.saving.residentTax));
    } else assert.deepEqual(item.rows, {});
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

  assert.deepEqual(card(view, "注意")?.notes ?? [], r.warnings.map(shown));
  // 画面のどこにも、CLI・JSON の指定方法を出さない
  assert.doesNotMatch(view.text, /CLI|JSON|--[a-z]/);
  assert.ok(view.jump.text.includes(c.totalPayment > 0 && !customFurusato ? yen(c.saving.total) : "結果を見る"), view.jump.text);
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
  assert.ok(view.jump?.error && view.jump.shown, "結果へ飛ぶ帯がエラーの表示になっていません");
  assert.ok(view.jump.text.includes(`${issues.length} 件`));
}

const PLACEHOLDER = "左（上）の 3 つに答えると、ここに「年内にやること」と金額が出ます。";
/** いま画面で計算に使われている値（目安で置いた社会保険料を含む）を、CLI に渡せる形で読む */
const EFFECTIVE = `(() => {
  const form = document.querySelector("#form");
  const value = (name) => form.elements[name]?.value?.trim() ?? "";
  const out = {};
  const employee = form.elements["work"].value === "employee";
  for (const name of ["salary", "revenue", "expenses", "ideco-paid", "kyosai-paid", "furusato-paid", "other-deductions", "ideco-limit", "nhi-rate", "dependents", "dependents-specific", "dependents-elderly", "dependents-elderly-cohabiting", "dependents-under16"]) {
    if (value(name) !== "" && !(name === "salary" && !employee)) out[name] = value(name);
  }
  if (form.elements["income-type"].value === "misc") out.misc = true;
  else if (!["unknown", "none"].includes(value("blue"))) out.blue = value("blue");
  if (form.elements["si-mode"].value === "enter" && value("social-insurance") !== "") out["social-insurance"] = value("social-insurance");
  else out["social-insurance"] = (document.querySelector("#si-guide strong")?.textContent ?? "").replace(/[^0-9]/g, "");
  return out;
})()`;

browserTest("トップ: 開いた直後に見える入力は 3 つだけで、案内が出ていて、版と出典の一覧が入っている", async (page) => {
  await page.goto(server.base);
  const view = await page.evaluate(READ);
  assert.equal(view.placeholder, PLACEHOLDER);
  assert.equal(view.jump.shown, false);
  assert.deepEqual(view.figures, {});
  const visible = await page.evaluate(
    'Array.from(new Set(Array.from(document.querySelectorAll("input, select")).filter((el) => el.checkVisibility()).map((el) => el.name || el.id)))',
  );
  assert.deepEqual(visible, ["work", "revenue", "expenses", "save"]);
  const version = spawnSync(process.execPath, [cliPath, "--version"], { encoding: "utf8" }).stdout.trim();
  assert.equal(await page.evaluate('document.querySelector("#version").textContent'), `setsuzei ${version}`);
  const sources = spawnSync(process.execPath, [cliPath, "--sources"], { encoding: "utf8" }).stdout;
  const links = await page.evaluate('Array.from(document.querySelectorAll("#sources a")).map((a) => a.href)');
  assert.ok(links.length > 0);
  for (const url of links) assert.ok(sources.includes(url), `CLI の出典の一覧にない URL です: ${url}`);
  assert.equal(await page.evaluate('document.querySelectorAll("#guide-sources a").length'), 7);
});

browserTest("トップ: 3 つ答えるだけで結果が出て、仮に置いた値を示し、その値で CLI と一致する（フリーランス）", async (page) => {
  await page.goto(server.base);
  await page.type('input[name="revenue"]', "380万");
  // 売上を入れた時点で結果が出る
  assert.equal((await page.evaluate(READ)).placeholder, null);
  await page.type('input[name="expenses"]', "55万");
  const view = await page.evaluate(READ);
  const effective = await page.evaluate(EFFECTIVE);
  assert.deepEqual(effective, { revenue: "380万", expenses: "55万", "social-insurance": "573000" });
  assert.deepEqual(view.effective, { ...effective, "kyosai-add": "0" });
  const quick = topCli(effective).result;
  assertTopMatches(view, quick);
  // 見出しの金額は、ふるさと納税だけ。小規模企業共済は「さらに減らしたい場合」として別に出る
  assert.equal(view.plan.lead, `年内に ${yen(quick.measures.furusato.remaining)}払うと、税金が ${yen(quick.measures.furusato.saving.total)}減る見込みです。`);
  assert.equal(view.plan.kyosai.optional, true);
  assert.match(view.plan.kyosai.hint, /840,000 円を払った場合は、それだけで税金が [\d,]+ 円減ります（合計には入れていません）/);
  assert.equal(view.plan.assumed.length, 4);
  assert.ok(view.plan.assumed[0].startsWith("社会保険料: 目安の 573,000 円"));
  assert.ok(view.plan.assumed[1].startsWith("青色申告特別控除: なし"));
  // 「違うところを直す」で残りの欄が開き、入力すると仮の値の一覧から消える
  await page.click("#open-more");
  assert.equal(await page.evaluate('document.querySelector("#more").open'), true);
  await page.click('input[name="si-mode"][value="enter"]');
  // 「金額を入れる」を選んだだけでは、結果は動かない（額を入れるまで目安のまま）
  const untouched = await page.evaluate(READ);
  assert.deepEqual(untouched.figures, view.figures);
  assert.ok(untouched.plan.assumed[0].startsWith("社会保険料: 目安の 573,000 円"));
  await page.type('input[name="social-insurance"]', "50.4万");
  await page.select('select[name="blue"]', "65");
  await page.type('input[name="furusato-paid"]', "1万");
  await page.click('input[name="has-spouse"]');
  const exact = { revenue: "380万", expenses: "55万", blue: "65", "social-insurance": "50.4万", "furusato-paid": "1万", "spouse-income": "0" };
  const after = await page.evaluate(READ);
  assertTopMatches(after, topCli(exact).result);
  assert.deepEqual(after.plan.assumed, []);
});

browserTest("トップ: 会社員 + 副業の 3 問は、年収・副業の売上・経費。社会保険料の目安と雑所得で計算し、CLI と一致する", async (page) => {
  await page.goto(server.base);
  await page.click('input[name="work"][value="employee"]');
  assert.deepEqual(
    await page.evaluate('Array.from(document.querySelectorAll("#form input")).filter((el) => el.checkVisibility() && el.type !== "radio").map((el) => el.name)'),
    ["salary", "revenue", "expenses"],
  );
  await page.type('input[name="salary"]', "620万");
  await page.type('input[name="revenue"]', "90万");
  await page.type('input[name="expenses"]', "12万");
  const view = await page.evaluate(READ);
  const effective = await page.evaluate(EFFECTIVE);
  assert.deepEqual(effective, { salary: "620万", revenue: "90万", expenses: "12万", misc: true, "social-insurance": "911000" });
  const expected = topCli(effective).result;
  assertTopMatches(view, expected);
  assert.equal(view.plan.kyosai.hidden, true);
  assert.ok(view.plan.assumed.some((line) => line.startsWith("副業の所得の種類: 雑所得")));
  // フリーランスに戻すと、給与の欄は隠れ、入れてあった年収は使われない
  await page.click('input[name="work"][value="freelance"]');
  const back = await page.evaluate(EFFECTIVE);
  assert.equal(back.salary, undefined);
  assert.equal(back.misc, undefined);
  assertTopMatches(await page.evaluate(READ), topCli(back).result);
});

browserTest("トップ: 「例を入れてみる」の結果が CLI と一致し、「入力を消す」で案内に戻る", async (page) => {
  await page.goto(server.base);
  await page.click("#example");
  const effective = await page.evaluate(EFFECTIVE);
  assert.equal(effective.revenue, "480万");
  assertTopMatches(await page.evaluate(READ), topCli(effective).result);
  await page.click('#form button[type="reset"]');
  await page.evaluate("new Promise((r) => setTimeout(r, 50))"); // 消したあとの再計算は、次のタイミングで行われる
  const view = await page.evaluate(READ);
  assert.equal(view.placeholder, PLACEHOLDER);
  assert.equal(view.jump.shown, false);
});

browserTest("トップ: キーボードで打ち込んだ結果が CLI と一致する（副業・雑所得）", async (page) => {
  await page.goto(server.base);
  const values = { salary: "600万", revenue: "120万", expenses: "20万", misc: true, "social-insurance": "88万" };
  await fillTop(page, values);
  const expected = topCli(values);
  assert.ok(expected.ok);
  assertTopMatches(await page.evaluate(READ), expected.result);
});

browserTest("トップ: 所得の種類を切り替えると、青色申告の欄と結果が切り替わる", async (page) => {
  await page.goto(server.base);
  const business = { revenue: "500万", expenses: "100万", blue: "65", "social-insurance": "70万" };
  await fillTop(page, business);
  const blueShown = 'document.querySelector(\'select[name="blue"]\').checkVisibility()';
  assert.equal(await page.evaluate(blueShown), true);
  assertTopMatches(await page.evaluate(READ), topCli(business).result);

  // 雑所得にすると、青色申告の欄が消え、選んであった 65 万円は使われない
  await page.click('input[name="income-type"][value="misc"]');
  assert.equal(await page.evaluate(blueShown), false);
  const misc = topCli({ revenue: "500万", expenses: "100万", misc: true, "social-insurance": "70万" });
  const view = await page.evaluate(READ);
  assertTopMatches(view, misc.result);
  assert.equal(misc.result.measures.blueReturn.applicable, false);
  assert.ok("雑所得" in card(view, `現状の見込み（${misc.result.label}）`).rows);

  // 事業所得に戻すと、元の結果に戻る
  await page.click('input[name="income-type"][value="business"]');
  assert.equal(await page.evaluate(blueShown), true);
  assertTopMatches(await page.evaluate(READ), topCli(business).result);
});

browserTest("トップ: 16 歳未満の扶養親族を入れると、住民税の所得割の非課税が反映される", async (page) => {
  await page.goto(server.base);
  const without = { revenue: "250万", expenses: "30万", blue: "65", "social-insurance": "30万", "spouse-income": "0" };
  await fillTop(page, without);
  const before16 = topCli(without);
  assertTopMatches(await page.evaluate(READ), before16.result);
  assert.equal(before16.result.baseline.residentTax.incomeLevyExempt, false);

  await page.type('input[name="dependents-under16"]', "3");
  const after16 = topCli({ ...without, "dependents-under16": "3" });
  assert.equal(after16.result.baseline.residentTax.incomeLevyExempt, true);
  const view = await page.evaluate(READ);
  assertTopMatches(view, after16.result);
  assert.equal(after16.result.measures.furusato.limit, 0);
  assert.equal(view.plan.furusato.off, true);
  assert.ok(card(view, "注意").notes.length > 0, "非課税についての注意が出ていません");

  // 寄附額を自分で入れてあるときは、上限の目安が 0 円になっても、その欄を直せる
  await page.type('input[name="dependents-under16"]', "");
  await fillTop(page, { "furusato-add": "1万" });
  await page.type('input[name="dependents-under16"]', "3");
  const kept = await page.evaluate(READ);
  assert.equal(kept.plan.furusato.off, false);
  assert.equal(await page.evaluate('document.querySelector("#furusato-add").checkVisibility()'), true);
  assert.match(kept.plan.furusato.saving, /上限の目安を 10,000 円超えています/);
  assert.match(await page.evaluate('document.querySelector("#furusato-off").textContent'), /^今回は対象になりません。/);
  await fillTop(page, { "furusato-add": "" });
  assert.equal((await page.evaluate(READ)).plan.furusato.off, true);

  // 人数を消すと元に戻る
  await page.type('input[name="dependents-under16"]', "");
  assertTopMatches(await page.evaluate(READ), before16.result);
});

browserTest("トップ: 払う額を自分で動かすと、その額で計算し直す（CLI の税額の差と一致。iDeCo は入れたときだけ合計に入る）", async (page) => {
  await page.goto(server.base);
  const base = { revenue: "800万", expenses: "150万", blue: "65", "social-insurance": "90万", "ideco-paid": "27.6万", "furusato-paid": "3万" };
  await fillTop(page, base);
  const first = await page.evaluate(READ);
  const initial = topCli(base).result;
  assert.equal(initial.measures.combined.includesIdeco, false);
  assertTopMatches(first, initial);
  assert.ok(cardStarting(first, "iDeCo の追加も年内に間に合う場合"), "iDeCo も間に合う場合の欄がありません");
  assert.equal(first.plan.resetShown, false);

  // iDeCo の払う額を入れると、合計に入る
  await fillTop(page, { "ideco-add": "10万" });
  const added = topCli({ ...base, "ideco-add": "10万" });
  assert.equal(added.result.measures.combined.includesIdeco, true);
  assert.equal(added.result.measures.combined.idecoAdditional, 100000);
  assertTopMatches(await page.evaluate(READ), added.result);

  // 小規模企業共済を 30 万円に下げ、細かい条件も使う
  const all = { "ideco-limit": "60万", "ideco-add": "5万", "kyosai-add": "30万", "nhi-rate": "11.5" };
  await fillTop(page, all);
  const withAll = topCli({ ...base, ...all }).result;
  assertTopMatches(await page.evaluate(READ), withAll);

  // ふるさと納税を 2 万円にする: 掛金と寄附を「支払済み」に足した入力で CLI を実行した税額との差になる
  await fillTop(page, { "furusato-add": "2万" });
  const custom = await page.evaluate(READ);
  assertTopMatches(custom, withAll, { customFurusato: true });
  const after = topCli({ ...base, "ideco-limit": "60万", "nhi-rate": "11.5", "ideco-paid": String(276000 + 50000), "kyosai-paid": "300000", "furusato-paid": String(30000 + 20000) }).result;
  const saved = withAll.baseline.totalTax - after.baseline.totalTax;
  assert.deepEqual(custom.figures, {
    減る税額の合計: yen(saved),
    そのために年内に払う額: yen(50000 + 300000 + 20000),
    "いまの税額の見込み → 実行後": `${yen(withAll.baseline.totalTax)} → ${yen(after.baseline.totalTax)}`,
  });
  assert.equal(custom.plan.resetShown, true);

  // 上限の目安を超える額を入れると、超えた額を示す
  const limit = withAll.measures.furusato.limitAfterOtherMeasures;
  await fillTop(page, { "furusato-add": String(limit - 30000 + 15000) });
  assert.ok((await page.evaluate(READ)).plan.furusato.saving.includes("上限の目安を 15,000 円超えています"));

  // スライダーをキーボードで動かせる（1,000 円きざみ）
  await page.evaluate('document.querySelector("#kyosai-range").focus()');
  await page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 });
  assert.equal((await page.evaluate(READ)).plan.kyosai.amount, "299,000");

  // 「おすすめの額に戻す」で、計算コアが決めた額に戻る
  await page.click("#plan-reset");
  assertTopMatches(await page.evaluate(READ), topCli({ ...base, "ideco-limit": "60万", "nhi-rate": "11.5" }).result);
});

browserTest("トップ: 年内に出せるお金を入れると、その範囲の配分になり、理由が出る。締切・注意・加入の手順は開いて読む", async (page) => {
  await page.goto(server.base);
  const member = { revenue: "950万", expenses: "430万", blue: "65", "social-insurance": "120.8万", "kyosai-paid": "36万" };
  await fillTop(page, member);
  const full = await page.evaluate(READ);
  assertTopMatches(full, topCli(member).result);
  assert.equal(full.plan.kyosai.optional, false);
  assert.equal(full.plan.budget, "");

  await page.type("#budget", "10万");
  await page.evaluate("document.activeElement.blur()");
  const view = await page.evaluate(READ);
  const paid = amountOf(view.plan.furusato.amount) + amountOf(view.plan.kyosai.amount);
  assert.ok(paid <= 100000 && paid > 0, `払う額の合計 ${paid}`);
  assert.equal(view.figures["そのために年内に払う額"], yen(paid));
  assert.match(view.plan.budget, /出せるお金の範囲で、減る税額がいちばん大きくなる組み合わせです。.*手元のお金は増えません/);
  // 画面の合計は、その配分を「支払済み」に足して CLI を実行した税額の差
  const before = cli(member).result.baseline.totalTax;
  const after = cli({ ...member, "kyosai-paid": String(360000 + amountOf(view.plan.kyosai.amount)), "furusato-paid": String(amountOf(view.plan.furusato.amount)) }).result.baseline.totalTax;
  assert.equal(view.figures["減る税額の合計"], yen(before - after));
  // 空に戻すと、上限まで実行した場合に戻る
  await page.type("#budget", "");
  await page.evaluate("document.activeElement.blur()");
  assertTopMatches(await page.evaluate(READ), topCli(member).result);

  // いま入っていない人が額を入れても、スライダーの右端は加入した場合の上限のまま（下げたあと、また上げられる）
  await fillTop(page, { "kyosai-paid": "" , "kyosai-add": "30万" });
  assert.equal(await page.evaluate('document.querySelector("#kyosai-range").max'), "840000");
  assert.doesNotMatch((await page.evaluate(READ)).plan.kyosai.hint, /300,000 円を超えて払っても/);
  await fillTop(page, { "kyosai-paid": "36万", "kyosai-add": "" });

  // 各項目でいつも見えているのは 3 行。締切・注意・加入の手順は、開くと読める
  const info = 'Array.from(document.querySelectorAll("#act-kyosai .info dt")).filter((el) => el.checkVisibility()).map((el) => el.textContent)';
  assert.deepEqual(await page.evaluate(info), []);
  assert.deepEqual(
    await page.evaluate('Array.from(document.querySelectorAll("#act-kyosai .steps dt")).filter((el) => el.checkVisibility()).map((el) => el.textContent)'),
    ["やること", "払う額", "減る税額"],
  );
  await page.click("#act-kyosai details.more-info > summary");
  assert.deepEqual(await page.evaluate(info), ["締切", "加入の手順", "注意"]);
  assert.match(await page.evaluate('document.querySelector("#act-kyosai .info").textContent'), /窓口で、掛金をその場で現金で払う方法/);
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
  const expected = topCli(values);
  assert.ok(expected.ok);
  assert.ok(expected.result.baseline.incomeAdjustment > 0);
  assertTopMatches(await page.evaluate(READ), expected.result);

  // 「配偶者がいる」を外すと、入れてあった配偶者の所得は使われない
  await page.click('input[name="has-spouse"]');
  const { "spouse-income": _income, "spouse-70": _age, ...single } = values;
  assertTopMatches(await page.evaluate(READ), topCli(single).result);
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
      'Object.fromEntries(Array.from(document.querySelectorAll(\'#form input:not([type="radio"]):not([type="checkbox"]), #ideco-add\')).filter((el) => el.value !== "" && el.checkVisibility()).map((el) => [el.name, el.value]))',
    );
    const expected = cli(current);
    assert.equal(expected.ok, false, `CLI はこの入力を受け付けました: ${JSON.stringify(current)}`);
    assertIssuesMatch(await page.evaluate(READ), expected.issues);
  }
  // 払う額の欄は、エラーの間も直せる。直すと結果が出て、印が消える
  await fillTop(page, { "ideco-add": "", "spouse-income": "0" });
  const fixed = await page.evaluate(READ);
  assertTopMatches(fixed, topCli({ revenue: "100万", "spouse-income": "0" }).result);
  assert.deepEqual(fixed.invalid, []);
  // ふるさと納税の払う額の誤りも、欄の名前つきで出る
  await fillTop(page, { revenue: "500万", "furusato-add": "たくさん" });
  const wrong = await page.evaluate(READ);
  assert.deepEqual(wrong.alert, ['ふるさと納税の払う額: 金額として読めません（"たくさん"）']);
  assert.deepEqual(wrong.invalid, ["furusato-add"]);
});

browserTest("トップ: URL のクエリで入力を引き継げる（引き継いだあと、収入の数字は URL に残さない）", async (page) => {
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
  assertTopMatches(await page.evaluate(READ), topCli(values).result);
  // 引き継いだ値は、どれも画面に見えている（閉じた欄の中に隠れたまま結果に効かない）
  assert.deepEqual(await page.evaluate(HIDDEN_VALUES), []);
  assert.equal(await page.evaluate("location.search"), "");
});

browserTest("トップ: 入力の保存は、自分で選んだときだけ。チェックを外すと消える", async (page) => {
  const stored = 'JSON.stringify(Object.fromEntries(Object.entries(localStorage)))';
  await page.goto(server.base);
  await page.type('input[name="revenue"]', "380万");
  await page.type('input[name="expenses"]', "55万");
  assert.equal(await page.evaluate(stored), "{}", "選んでいないのに保存されています");
  await page.goto(server.base);
  assert.equal((await page.evaluate(READ)).placeholder, PLACEHOLDER, "開き直したら入力が残っています");

  // 保存を選ぶと、開き直しても続きから使える
  await page.type('input[name="revenue"]', "380万");
  await page.click("#save");
  await page.type('input[name="expenses"]', "55万");
  await fillTop(page, { "kyosai-add": "12万" }, false);
  const before = await page.evaluate(READ);
  assert.notEqual(await page.evaluate(stored), "{}");
  await page.goto(server.base);
  const restored = await page.evaluate(READ);
  assert.deepEqual(restored.figures, before.figures);
  assert.equal(restored.plan.kyosai.amount, "12万");
  assert.equal(await checked(page, "#save"), true);
  assert.deepEqual(await page.evaluate(HIDDEN_VALUES), []);
  assert.match(await page.evaluate('document.querySelector("#save-status").textContent'), /読み込みました/);

  // 読めない値を保存したまま開き直しても、その欄を直せる（結果の枠ごと隠れない）
  await fillTop(page, { "kyosai-add": "たくさん" }, false);
  await page.goto(server.base);
  const broken = await page.evaluate(READ);
  assert.equal(broken.alert.length, 1);
  assert.equal(await page.evaluate('document.querySelector("#kyosai-add").checkVisibility()'), true);
  await fillTop(page, { "kyosai-add": "12万" }, false);
  assert.equal((await page.evaluate(READ)).alert, null);

  // チェックを外すと、すぐに消える
  await page.click("#save");
  assert.equal(await page.evaluate(stored), "{}");
  await page.goto(server.base);
  assert.equal((await page.evaluate(READ)).placeholder, PLACEHOLDER);
  await page.evaluate("localStorage.clear()");
});

browserTest("トップ: 結果を文章でコピーでき、印刷では入力欄を外して内訳を開く", async (page) => {
  await page.send("Browser.grantPermissions", { permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"], origin: server.origin }).catch(() => {});
  await page.goto(server.base);
  await page.type('input[name="revenue"]', "380万");
  await page.type('input[name="expenses"]', "55万");
  const view = await page.evaluate(READ);
  await page.click("#copy");
  await page.evaluate("new Promise((r) => setTimeout(r, 200))");
  const status = await page.evaluate('document.querySelector("#share-status").textContent');
  const text = status.includes("コピーしました")
    ? await page.evaluate("navigator.clipboard.readText()")
    : await page.evaluate('document.querySelector("#copy-text").value');
  assert.match(text, /■ 年内にやること\n1\. ふるさと納税: /);
  assert.ok(text.includes(view.figures["減る税額の合計"]));
  assert.ok(text.includes("社会保険料: 573,000 円（目安"));
  assert.match(text, /概算です。/);

  // 印刷の体裁
  await page.send("Emulation.setEmulatedMedia", { media: "print" });
  await page.evaluate('window.dispatchEvent(new Event("beforeprint"))');
  const printed = await page.evaluate(
    '({ form: document.querySelector("#form").checkVisibility(), plan: document.querySelector("#plan-lead").checkVisibility(), breakdown: document.querySelector("#breakdown").open, used: Array.from(document.querySelectorAll("#breakdown h3")).some((h) => h.textContent === "計算に使った値" && h.checkVisibility()), buttons: document.querySelector("#copy").checkVisibility(), disclaimer: document.querySelector(".disclaimer").checkVisibility() })',
  );
  assert.deepEqual(printed, { form: false, plan: true, breakdown: true, used: true, buttons: false, disclaimer: true });
  await page.evaluate('window.dispatchEvent(new Event("afterprint"))');
  assert.equal(await page.evaluate('document.querySelector("#breakdown").open'), false);
  await page.send("Emulation.setEmulatedMedia", { media: "" });
});

browserTest("トップ: キーボードだけで 3 問に答えられ、読み上げ用の名前と結果の通知がある", async (page) => {
  await page.goto(server.base);
  const tab = async () => {
    await page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    return page.evaluate('(() => { const el = document.activeElement; return el.name || el.id || el.className || el.tagName; })()');
  };
  const order = [];
  for (let i = 0; i < 6; i++) order.push(await tab());
  // 結果へ移動 → 保存の説明へのリンク → 例 → 働き方 → 売上 → 経費
  assert.deepEqual(order.slice(-3), ["work", "revenue", "expenses"]);
  assert.equal(order[0], "skip");
  await page.type('input[name="revenue"]', "380万");
  // 入力欄・選択欄には、すべて読み上げ用の名前がある
  const unnamed = await page.evaluate(
    'Array.from(document.querySelectorAll("input, select, textarea, button")).filter((el) => !(el.labels?.length || el.getAttribute("aria-label") || (el.tagName === "BUTTON" && el.textContent.trim() !== ""))).map((el) => el.name || el.id)',
  );
  assert.deepEqual(unnamed, []);
  await page.evaluate("new Promise((r) => setTimeout(r, 1100))");
  assert.match(await page.evaluate('document.querySelector("#live").textContent'), /^結果を更新しました。年内に .* 円払うと、税金が .* 円減る見込みです。$/);
  // フォーカスの枠が見える
  await page.evaluate('document.querySelector(\'input[name="expenses"]\').focus()');
  assert.notEqual(await page.evaluate('getComputedStyle(document.querySelector("#more > summary")).cursor'), "");
});

browserTest("トップ: スマホ幅（375px）で、横スクロールもはみ出しもなく、結果の要点が画面の下に出続ける", async (page) => {
  await page.viewport(375, 720, true);
  await page.goto(server.base);
  assert.deepEqual(await page.evaluate(OVERFLOW), [], "空のとき");
  // はじめの 3 問が、最初の 2 画面に収まっている
  const bottom = await page.evaluate('document.querySelector(\'input[name="expenses"]\').getBoundingClientRect().bottom + scrollY');
  assert.ok(bottom < 720 * 2, `経費の欄が遠すぎます（${bottom}px）`);

  // すべての欄を開き、桁の多い金額を入れる
  await fillTop(page, {
    salary: "1,234,567,890",
    revenue: "9,876,543,210",
    expenses: "150万",
    "social-insurance": "1,234,567,890",
    "spouse-income": "0",
    "dependents-under16": "2",
    "ideco-add": "10万",
    "nhi-rate": "11.5",
  });
  await page.click(".disclaimer details > summary");
  await page.click("#breakdown > summary");
  await page.click("#act-furusato details.more-info > summary");
  const view = await page.evaluate(READ);
  assert.equal(view.alert, null);
  assert.deepEqual(await page.evaluate(OVERFLOW), [], "結果が出ているとき");

  // 入力欄を見ている間は、結果の要点が画面の下に出ていて、押すと結果の先頭が画面に入る
  await page.evaluate("window.scrollTo(0, 0)");
  await page.evaluate("new Promise((r) => setTimeout(r, 200))");
  const top = await page.evaluate(READ);
  assert.equal(top.jump.shown, true);
  assert.ok(top.jump.text.includes(top.figures["減る税額の合計"]));
  await page.click("#jump");
  await page.evaluate("new Promise((r) => setTimeout(r, 300))");
  const y = await page.evaluate('document.querySelector("#plan").getBoundingClientRect().top');
  assert.ok(y >= -1 && y < 720, `結果が画面に入っていません（top ${y}）`);
  // 結果の先頭が見えている間は、同じ数字を重ねて出さない
  assert.equal((await page.evaluate(READ)).jump.shown, false);

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
    assertTopMatches(await page.evaluate(READ), topCli(values).result);
    assert.deepEqual(await page.evaluate(HIDDEN_VALUES), [], "引き継いだ値が、閉じた欄の中に隠れています");
  });

  browserTest(`${spec.slug}: 空入力は案内、誤入力は欄の名前つきの指摘になる`, async (page) => {
    await page.goto(url());
    await fillPage(page, { revenue: "" });
    let view = await page.evaluate(READ);
    assert.equal(view.placeholder, "売上を入力すると、ここに結果が出ます。");
    assert.equal(view.jump.shown, false);

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

// ───────────── 令和7年分と令和8年分の、ふるさと納税の上限の比較のページ ─────────────

const YEAR_URL = () => `${server.base}furusato-nozei-jogen-reiwa8/`;
/** ページの初期値（給与収入 500 万円・社会保険料 75 万円） */
const YEAR_DEFAULTS = { salary: "500万", "social-insurance": "75万" };
const { compareFurusatoLimit } = await import(new URL("../../dist/index.js", import.meta.url).href);

async function fillYear(page, values) {
  for (const [name, value] of Object.entries(values)) {
    if (name === "blue" || name === "spouse-income") await page.select(`select[name="${name}"]`, value);
    else await page.type(`input[name="${name}"]`, value);
  }
}

/** 画面の比較が、同じ入力を Node.js 側の計算コア（dist/）に渡した結果と同じであること。 */
function assertYearMatches(view, values) {
  const expected = cli(values);
  assert.ok(expected.ok, `CLI がこの入力を受け付けません: ${JSON.stringify(values)}`);
  const r = expected.result;
  const c = compareFurusatoLimit({
    salaryRevenue: r.input.salaryRevenue,
    businessRevenue: r.input.businessRevenue,
    businessExpenses: r.input.businessExpenses,
    businessIncomeType: r.input.businessIncomeType,
    blueReturn: r.input.blueReturn,
    socialInsurance: r.input.socialInsurance,
    idecoPaid: r.input.idecoPaid,
    kyosaiPaid: r.input.kyosaiPaid,
    ...(r.input.spouse ? { spouse: r.input.spouse } : {}),
    dependents: r.input.dependents,
    otherDeductions: r.input.otherDeductions,
  });
  const limit = (n) => (n > 0 ? yen(n) : "目安なし");
  const diff = c.difference === 0 ? "変わりません" : c.difference < 0 ? `${yen(-c.difference)} 下がります` : `${yen(c.difference)} 上がります`;
  assert.equal(view.alert, null, "入力エラーが出ています");
  assert.deepEqual(view.figures, {
    令和7年分の上限の目安: limit(c.previous.limit),
    令和8年分の上限の目安: limit(c.current.limit),
    同じ入力での差: diff,
  });
  // 令和 8 年分の上限は、CLI の上限と同じ
  assert.equal(c.current.limit, r.measures.furusato.limit);
  const detail = card(view, "上限の目安の比較と、計算の途中の値");
  assert.equal(detail.rows["令和7年分（令和8年度の住民税）"], limit(c.previous.limit));
  assert.equal(detail.rows["令和8年分（令和9年度の住民税）"], limit(c.current.limit));
  assert.deepEqual(detail.notes, c.notes);
  baselineRows(view, r);
  assert.deepEqual(card(view, "注意")?.notes ?? [], r.warnings);
  assert.ok(view.jump.text.includes(limit(c.current.limit)));
  return c;
}

browserTest("令和7年分との比較: 初期値と、打ち込んだ値の結果が計算コア・CLI と一致する", async (page) => {
  await page.goto(YEAR_URL());
  // 初期値は、ページの本文に書いてある例（61,000 円 → 57,000 円）
  let view = await page.evaluate(READ);
  assert.deepEqual(view.figures, {
    令和7年分の上限の目安: "61,000 円",
    令和8年分の上限の目安: "57,000 円",
    同じ入力での差: "4,000 円 下がります",
  });
  assertYearMatches(view, YEAR_DEFAULTS);

  // 変わらない例
  await fillYear(page, { salary: "600万", "social-insurance": "90万" });
  view = await page.evaluate(READ);
  assert.equal(view.figures["同じ入力での差"], "変わりません");
  assertYearMatches(view, { salary: "600万", "social-insurance": "90万" });

  // 家族と控除の欄をすべて使う
  const family = {
    salary: "720万",
    "social-insurance": "108万",
    "spouse-income": "0",
    dependents: "1",
    "dependents-specific": "1",
    "ideco-paid": "27.6万",
    "kyosai-paid": "12万",
    "other-deductions": "8万",
  };
  await fillYear(page, family);
  assertYearMatches(await page.evaluate(READ), family);

  // フリーランス（給与なし）
  const freelance = { ...family, salary: "", revenue: "700万", expenses: "155万", blue: "65", "social-insurance": "81.75万", "spouse-income": "", dependents: "", "dependents-specific": "" };
  await fillYear(page, freelance);
  const c = assertYearMatches(await page.evaluate(READ), freelance);
  assert.ok(c.current.limit > 0);

  // 「全項目で計算する」へ、いまの入力を引き継ぐ
  await page.navigateBy(() => page.click("#full"));
  assert.equal(await page.evaluate("location.pathname"), "/setsuzei/");
  assertTopMatches(await page.evaluate(READ), topCli(freelance).result);
  assert.deepEqual(await page.evaluate(HIDDEN_VALUES), []);
});

browserTest("令和7年分との比較: 空入力は案内、誤入力は欄の名前つきの指摘になる", async (page) => {
  await page.goto(YEAR_URL());
  await fillYear(page, { salary: "" });
  let view = await page.evaluate(READ);
  assert.equal(view.placeholder, "収入を入力すると、ここに結果が出ます。");
  assert.equal(view.jump.shown, false);
  for (const wrong of [{ salary: "abc" }, { salary: "-100万" }, { salary: "500万", "social-insurance": "-1", dependents: "1.5" }]) {
    await fillYear(page, wrong);
    const expected = cli({ ...YEAR_DEFAULTS, ...wrong });
    assert.equal(expected.ok, false);
    assertIssuesMatch(await page.evaluate(READ), expected.issues);
  }
  await fillYear(page, { "social-insurance": "75万", dependents: "" });
  view = await page.evaluate(READ);
  assert.deepEqual(view.invalid, []);
  assertYearMatches(view, YEAR_DEFAULTS);
});

browserTest("令和7年分との比較: スマホ幅（375px）で、横スクロールもはみ出しもない", async (page) => {
  await page.viewport(375, 720, true);
  await page.goto(YEAR_URL());
  assert.deepEqual(await page.evaluate(OVERFLOW), [], "初期値のとき");
  assert.ok(
    await page.evaluate('Array.from(document.querySelectorAll("table")).every((t) => ["auto", "scroll"].includes(getComputedStyle(t.closest(".table-wrap")).overflowX))'),
  );
  await fillYear(page, { salary: "9,876,543,210", "spouse-income": "0", dependents: "2" });
  assert.deepEqual(await page.evaluate(OVERFLOW), [], "桁の多い金額のとき");
  await fillYear(page, { salary: "あいうえおかきくけこさしすせそたちつてとなにぬねの", "social-insurance": "-5" });
  assert.ok((await page.evaluate(READ)).alert);
  assert.deepEqual(await page.evaluate(OVERFLOW), [], "入力エラーのとき");
  await fillYear(page, { salary: "", "social-insurance": "" });
  assert.deepEqual(await page.evaluate(OVERFLOW), [], "空のとき");
});
