/* ===========================================================
   ペット年齢換算のブラウザテスト：npm run build のあと npm run test:e2e
   - dist/ を Google Chrome（playwright-core）に直接わたして操作する（サーバーは立てない）
     （Chrome がなければ、環境変数 CHROME に実行ファイルの場所を入れる）
   - 外部への通信（計測タグなど）は止めたうえで中身を記録し、入力した値が含まれていないかを確かめる
   =========================================================== */
import { chromium } from "playwright-core";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import assert from "node:assert/strict";

const DIST = join(process.cwd(), "dist");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json", ".xml": "application/xml" };
/* サーバーは立てず、ブラウザの通信を横取りして dist/ のファイルを返す（ローカルのポートを開けない環境でも動く） */
const ORIGIN = "https://pet-age.test";
async function serve(route) {
  let p = decodeURIComponent(new URL(route.request().url()).pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = join(DIST, p);
  try {
    if (!f.startsWith(DIST) || !(await stat(f)).isFile()) throw 0;
    return route.fulfill({ status: 200, contentType: TYPES[extname(f)] ?? "application/octet-stream", body: await readFile(f) });
  } catch {
    return route.fulfill({ status: 404, body: "not found" });
  }
}

const exe = process.env.CHROME;
const browser = await chromium.launch(exe ? { executablePath: exe } : { channel: "chrome" });

/* 入力に使う値（通信・URL・共有文に出てはいけないもの） */
const SECRET = { petBirth: "2021-08-12", ownerYears: "35", name: "テスト<b>こむぎ</b>" };

let failed = 0;
async function check(title, fn) {
  try {
    await fn();
    console.log(`ok - ${title}`);
  } catch (e) {
    failed++;
    console.log(`not ok - ${title}\n  ${String(e.stack || e).split("\n").slice(0, 4).join("\n  ")}`);
  }
}

async function open(path, { share } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
  const external = [];
  await ctx.route("**/*", (route) => {
    const r = route.request();
    if (r.url().startsWith(ORIGIN)) return serve(route);
    external.push({ url: r.url(), body: r.postData() ?? "" });
    return route.abort();
  });
  // Web Share API のあり／なしを切り替える
  await ctx.addInitScript((mode) => {
    if (mode === "none") {
      Object.defineProperty(Navigator.prototype, "share", { value: undefined, configurable: true });
      Object.defineProperty(Navigator.prototype, "canShare", { value: undefined, configurable: true });
    } else if (mode === "files") {
      Object.defineProperty(Navigator.prototype, "canShare", { value: () => true, configurable: true });
      Object.defineProperty(Navigator.prototype, "share", { value: async (d) => { window.__shared = { text: d.text, files: (d.files || []).map((f) => ({ name: f.name, type: f.type, size: f.size })) }; }, configurable: true });
    }
  }, share ?? "none");
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.goto(ORIGIN + path);
  // 計算する日を固定する（テストを日付に左右させない）
  await page.fill("#pa-base", "2026-11-12");
  await page.dispatchEvent("#pa-base", "change");
  return { ctx, page, external, errors };
}
const big = (page) => page.locator(".pa-big b").textContent();

await check("総合ページ：種類を選ばずに押すとエラー。キーボードで犬を選び、生年月日の空欄エラー → 入力して計算", async () => {
  const { ctx, page, errors } = await open("/pet-age/");
  assert.equal(await page.isHidden("#pa-size-fs"), true);
  await page.click("button[type=submit]");
  assert.match(await page.textContent("#pa-msgs"), /犬か猫を選んでください/);
  // キーボード：種類のラジオにフォーカスして Space
  await page.focus('input[name="pa-species"][value="dog"]');
  await page.keyboard.press("Space");
  assert.equal(await page.isVisible("#pa-size-fs"), true);
  // 生年月日が空のまま Enter（名前欄から）
  await page.focus("#pa-name");
  await page.keyboard.press("Enter");
  assert.match(await page.textContent("#pa-err-birth"), /生年月日を入れてください/);
  assert.equal(await page.getAttribute("#pa-birth", "aria-invalid"), "true");
  assert.equal(await page.evaluate(() => document.activeElement.id), "pa-birth");
  // 未来の日付
  await page.fill("#pa-birth", "2027-01-01");
  await page.click("button[type=submit]");
  assert.match(await page.textContent("#pa-err-birth"), /後になっています/);
  // 正しく入れる：小〜中型犬 5歳3か月 → 24 + 3×4 + 4×3/12 = 37
  await page.fill("#pa-birth", SECRET.petBirth);
  await page.click("button[type=submit]");
  assert.equal(await big(page), "37");
  assert.match(await page.textContent(".pa-facts"), /5歳3か月/);
  assert.match(await page.textContent("#pa-result"), /2026年11月12日時点/);
  assert.match(await page.textContent("#pa-result"), /成犬期/);
  assert.match(await page.textContent("#pa-result"), /健康状態や寿命を判定するものではありません/);
  await page.waitForFunction(() => document.querySelector("#pa-live").textContent.includes("約37歳"));
  // 体格を大型犬に（キーボード）：12 + 4.25×7 = 41.75 → 42
  await page.focus('input[name="pa-size"][value="small"]');
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => document.querySelector(".pa-big b")?.textContent === "42");
  // 猫に切り替え：体格は隠れ、4歳(32)〜6歳(40)の補間で 37
  await page.click('label:has(input[name="pa-species"][value="cat"])');
  await page.waitForFunction(() => document.querySelector("#pa-tag, .pa-tag")?.textContent === "猫");
  assert.equal(await page.isHidden("#pa-size-fs"), true);
  assert.equal(await big(page), "37");
  assert.match(await page.textContent("#pa-result"), /若年期/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check("年齢で入れる：月の省略・0歳・範囲外・不正な値", async () => {
  const { ctx, page, errors } = await open("/pet-age/dog/");
  assert.equal(await page.isChecked('input[name="pa-species"][value="dog"]'), true);
  await page.click('label:has(input[name="pa-method"][value="age"])');
  await page.fill("#pa-years", "-1");
  await page.click("button[type=submit]");
  assert.match(await page.textContent("#pa-err-years"), /マイナス/);
  await page.fill("#pa-years", "5");
  await page.click("button[type=submit]");
  assert.equal(await big(page), "36"); // 5歳（月は不明）＝表の値
  assert.match(await page.textContent(".pa-facts"), /5歳（入力した年齢（月はわからない））|5歳/);
  await page.fill("#pa-years", "0");
  await page.selectOption("#pa-months", "6");
  await page.click("button[type=submit]");
  assert.equal(await page.locator(".pa-big").count(), 0);
  assert.match(await page.textContent(".pa-out-range"), /1歳未満は、資料の表に値がない/);
  assert.match(await page.textContent("#pa-result"), /成長期/);
  await page.fill("#pa-years", "21");
  await page.selectOption("#pa-months", "");
  await page.click("button[type=submit]");
  assert.match(await page.textContent(".pa-out-range"), /20歳（人間なら約96歳）まで/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check("飼い主と比べる：同い年になる頃・推定条件の表示", async () => {
  const { ctx, page, external, errors } = await open("/pet-age/cat/");
  await page.fill("#pa-birth", SECRET.petBirth);
  await page.fill("#pa-name", SECRET.name);
  await page.click("#pa-owner-box summary");
  await page.click('label:has(input[name="pa-owner"][value="age"])');
  await page.fill("#pa-owner-years", SECRET.ownerYears);
  await page.click("button[type=submit]");
  const fam = await page.textContent(".pa-fam");
  // 猫 5歳3か月（約37歳）と 35歳 → いまは猫が約2歳年上、過去に同い年になっている
  assert.match(fam, /約2歳年上/);
  assert.match(fam, /同い年になりました/);
  assert.match(fam, /\d{4}年頃/); // 飼い主を年齢で入れたので年単位
  assert.match(fam, /ちょうど35歳になったもの/);
  assert.match(fam, /老化の進み方や寿命を予測するものではありません/);
  // 名前はタグとして解釈されず、文字のまま出る
  assert.equal(await page.locator("#pa-r-h b").count(), 0);
  assert.match(await page.textContent("#pa-r-h"), /テスト<b>こむぎ<\/b>/);
  // 入力が URL に出ていない
  assert.equal(new URL(page.url()).search, "");
  assert.deepEqual(errors, []);
  await ctx.close();
  for (const r of external) for (const v of Object.values(SECRET)) assert.ok(!r.url.includes(v) && !r.body.includes(v), `外部への通信に入力値：${r.url}`);
});

await check("共有：Web Share がない端末では「共有する」を出さず、画像保存とコピーができる。生年月日は入らない", async () => {
  const { ctx, page, external, errors } = await open("/pet-age/dog/");
  await page.fill("#pa-birth", SECRET.petBirth);
  await page.fill("#pa-name", "こむぎ");
  await page.click("#pa-owner-box summary");
  await page.click('label:has(input[name="pa-owner"][value="age"])');
  await page.fill("#pa-owner-years", SECRET.ownerYears);
  await page.click("button[type=submit]");
  await page.waitForFunction(() => document.querySelector("#pa-prev")?.getAttribute("src"));
  assert.equal(await page.isHidden("#pa-share"), true);
  // 共有文：最初は飼い主との比較を入れない
  let t = await page.textContent("#pa-stext");
  assert.match(t, /こむぎ（犬・小〜中型犬）は5歳3か月。人間なら約37歳の目安です。/);
  assert.ok(!t.includes("飼い主") && !t.includes("2021") && !t.includes("35歳"));
  assert.match(t, /https:\/\/tools\.insemble\.jp\/pet-age\/dog\//);
  await page.check("#pa-incl");
  await page.waitForFunction(() => document.querySelector("#pa-stext").textContent.includes("飼い主と同い年"));
  // コピー
  await page.click("#pa-copy");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /飼い主と同い年になったのは\d{4}年頃/);
  assert.ok(!copied.includes(SECRET.petBirth));
  // 画像で保存（PNG）
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#pa-save")]);
  assert.match(dl.suggestedFilename(), /^pet-age-こむぎ-\d{8}\.png$/);
  const head = await (await import("node:fs/promises")).readFile(await dl.path());
  assert.equal(head.subarray(1, 4).toString(), "PNG");
  assert.deepEqual(errors, []);
  await ctx.close();
  for (const r of external) for (const v of Object.values(SECRET)) assert.ok(!r.url.includes(v) && !r.body.includes(v), `外部への通信に入力値：${r.url}`);
});

await check("共有：Web Share がある端末では、画像つきで共有する", async () => {
  const { ctx, page, errors } = await open("/pet-age/cat/", { share: "files" });
  await page.click('label:has(input[name="pa-method"][value="age"])');
  await page.fill("#pa-years", "3");
  await page.click("button[type=submit]");
  await page.click("#pa-share");
  const shared = await page.waitForFunction(() => window.__shared).then((h) => h.jsonValue());
  assert.equal(shared.files[0].type, "image/png");
  assert.ok(shared.files[0].size > 1000);
  assert.match(shared.text, /うちの子（猫）は3歳。人間なら約28歳の目安です。/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check("リセットで最初の状態に戻る", async () => {
  const { ctx, page } = await open("/pet-age/cat/");
  await page.fill("#pa-birth", SECRET.petBirth);
  await page.click("button[type=submit]");
  await page.click("#pa-reset");
  assert.equal(await page.locator(".pa-big").count(), 0);
  assert.equal(await page.inputValue("#pa-birth"), "");
  assert.match(await page.inputValue("#pa-base"), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(await page.isChecked('input[name="pa-species"][value="cat"]'), true);
  await ctx.close();
});

await check("スマホ幅（375px）で横にはみ出さない・押せるところは44px以上", async () => {
  for (const p of ["/pet-age/", "/pet-age/dog/", "/pet-age/cat/"]) {
    const { ctx, page } = await open(p);
    await page.click('label:has(input[name="pa-method"][value="age"])');
    await page.fill("#pa-years", "7");
    if (p === "/pet-age/") await page.click('label:has(input[name="pa-species"][value="dog"])');
    await page.click("button[type=submit]");
    await page.waitForSelector(".pa-big");
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 375, `${p} の横幅 ${w}px`);
    const small = await page.evaluate(() => [...document.querySelectorAll("#pa-form .pa-opt span, #pa-form button, #pa-result button")].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44).map((e) => e.textContent.trim()));
    assert.deepEqual(small, [], `${p} の小さすぎるボタン`);
    await ctx.close();
  }
});

await browser.close();
console.log(failed ? `\n${failed} 件失敗` : "\nすべて成功");
process.exit(failed ? 1 : 0);
