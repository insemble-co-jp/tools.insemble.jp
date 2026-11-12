/* ペット年齢換算のページ（ビルド後の dist/）のテスト：npm run build のあとに npm test
   title・canonical・構造化データ・sitemap・早見表の値・見出しの階層・入力の扱いを確かめる */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { MODELS } from "../src/data/pet-age.js";
import { humanAge } from "../src/lib/pet-age.js";

const SITE = "https://tools.insemble.jp";
const PAGES = [
  { path: "/pet-age/", h1: "ペット年齢換算｜犬・猫は人間なら何歳？", crumbs: 2 },
  { path: "/pet-age/dog/", h1: "犬の年齢換算｜人間なら何歳？体格別に計算", crumbs: 3 },
  { path: "/pet-age/cat/", h1: "猫の年齢換算｜人間なら何歳？年齢早見表つき", crumbs: 3 },
];
const built = existsSync("dist/pet-age/index.html");
const read = (p) => readFileSync(`dist${p}index.html`, "utf8");
const text = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const all = (html, re) => [...html.matchAll(re)];
const jsonLd = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

test("ページごとに title・description・h1 が固有で、canonical と og:url が自分のURL", { skip: !built && "dist がないので省略（npm run build のあとに実行）" }, () => {
  const titles = new Set(), descs = new Set();
  for (const p of PAGES) {
    const html = read(p.path);
    const title = text(html.match(/<title>([\s\S]*?)<\/title>/)[1]);
    const desc = html.match(/<meta name="description" content="([^"]*)"/)[1];
    titles.add(title);
    descs.add(desc);
    assert.match(title, /insemble tools$/);
    assert.ok(desc.length >= 80 && desc.length <= 160, `${p.path} description の長さ ${desc.length}`);
    const h1s = all(html, /<h1[^>]*>([\s\S]*?)<\/h1>/g);
    assert.equal(h1s.length, 1, `${p.path} の h1 は1つ`);
    assert.equal(text(h1s[0][1]), p.h1);
    assert.equal(html.match(/<link rel="canonical" href="([^"]*)"/)[1], SITE + p.path);
    assert.equal(html.match(/<meta property="og:url" content="([^"]*)"/)[1], SITE + p.path);
    assert.equal(html.match(/<meta property="og:image" content="([^"]*)"/)[1], `${SITE}/og/pet-age.png`);
    assert.ok(!/name="robots" content="noindex"/.test(html), `${p.path} は noindex ではない`);
  }
  assert.equal(titles.size, PAGES.length);
  assert.equal(descs.size, PAGES.length);
});

test("構造化データ：パンくず・WebApplication・FAQPage が画面と一致する", { skip: !built }, () => {
  for (const p of PAGES) {
    const html = read(p.path);
    const ld = jsonLd(html);
    const bc = ld.find((x) => x["@type"] === "BreadcrumbList");
    assert.equal(bc.itemListElement.length, p.crumbs);
    assert.equal(bc.itemListElement.at(-1).item, SITE + p.path);
    if (p.crumbs === 3) assert.equal(bc.itemListElement[1].item, `${SITE}/pet-age/`);
    // 画面のパンくずも同じ数
    const crumb = html.match(/<nav class="crumb"[\s\S]*?<\/nav>/)[0];
    assert.equal(all(crumb, /<li>/g).length, p.crumbs);

    const app = ld.find((x) => x["@type"] === "WebApplication");
    assert.equal(app.url, SITE + p.path);
    assert.equal(app.offers.price, "0"); // 実際に無料。評価・レビューは入れない
    assert.ok(!JSON.stringify(ld).includes("aggregateRating") && !JSON.stringify(ld).includes("review"));

    const faq = ld.find((x) => x["@type"] === "FAQPage");
    const qs = all(html, /<span class="q-text">([\s\S]*?)<\/span>/g).map((m) => text(m[1]));
    const as = all(html, /<p class="q-a">([\s\S]*?)<\/p>/g).map((m) => text(m[1]));
    assert.deepEqual(faq.mainEntity.map((q) => q.name), qs);
    assert.deepEqual(faq.mainEntity.map((q) => q.acceptedAnswer.text), as);
    assert.match(qs[0], /送られますか/); // 1問目は入力の扱い（制作ルール）
  }
});

test("sitemap に3ページが入っている", { skip: !built }, () => {
  const xml = readFileSync("dist/sitemap-0.xml", "utf8");
  for (const p of PAGES) assert.ok(xml.includes(`<loc>${SITE}${p.path}</loc>`), p.path);
});

test("早見表の値（HTML）は計算と同じ", { skip: !built }, () => {
  const S = MODELS.dog.small, L = MODELS.dog.large, C = MODELS.cat;
  const rows = (html) => all(html.match(/<table class="pa-tbl">[\s\S]*?<\/table>/)[0], /<tr>([\s\S]*?)<\/tr>/g).slice(1).map((r) => all(r[1], /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g).map((c) => text(c[1])));
  const months = (label) => (label.startsWith("生後") ? +label.match(/\d+/)[0] : +label.match(/\d+/)[0] * 12);
  const val = (cell) => (cell.startsWith("—") ? null : +cell.match(/\d+/)[0]);
  const want = (model, m) => (humanAge(model, m) === null ? null : Math.round(humanAge(model, m)));

  const dog = rows(read("/pet-age/dog/"));
  assert.equal(dog.length, 20);
  for (const [age, small, large] of dog) {
    assert.equal(val(small), want(S, months(age)), `犬 小〜中型 ${age}`);
    assert.equal(val(large), want(L, months(age)), `犬 大型 ${age}`);
  }
  const cat = rows(read("/pet-age/cat/"));
  for (const [age, human] of cat) assert.equal(val(human), want(C, months(age)), `猫 ${age}`);
  const mix = rows(read("/pet-age/"));
  for (const [age, c, small, large] of mix) {
    assert.equal(val(c), want(C, months(age)));
    assert.equal(val(small), want(S, months(age)));
    assert.equal(val(large), want(L, months(age)));
  }
});

test("見出しの階層が飛ばない（h1 → h2 → h3）", { skip: !built }, () => {
  for (const p of PAGES) {
    const levels = all(read(p.path), /<h([1-6])[\s>]/g).map((m) => +m[1]);
    assert.equal(levels[0], 1);
    for (let i = 1; i < levels.length; i++) assert.ok(levels[i] <= levels[i - 1] + 1, `${p.path}: h${levels[i - 1]} の次に h${levels[i]}`);
  }
});

test("入力が URL やサーバーに送られない作り（form は dialog・入力欄に name を付けない）", { skip: !built }, () => {
  for (const p of PAGES) {
    const html = read(p.path);
    const form = html.match(/<form[^>]*id="pa-form"[^>]*>/)[0];
    assert.match(form, /method="dialog"/);
    assert.ok(!/action=/.test(form));
    const tool = html.match(/<form[^>]*id="pa-form"[\s\S]*?<\/form>/)[0];
    for (const m of all(tool, /<(input|select|textarea)\b[^>]*>/g)) {
      const name = m[0].match(/\sname="([^"]*)"/)?.[1];
      if (name) assert.match(m[0], /type="radio"/, `ラジオ以外に name がある：${m[0]}`);
    }
    // 道具ゾーンは Clarity の録画で伏せ字
    assert.match(html, /<section class="wrap" aria-label="[^"]*" data-clarity-mask="True">\s*<div class="tp-panel pa"/);
  }
});

test("トップの一覧から通常のリンクでたどれる", { skip: !built }, () => {
  const top = readFileSync("dist/index.html", "utf8");
  assert.ok(top.includes('href="/pet-age/"'));
  const hub = read("/pet-age/");
  assert.ok(hub.includes('href="/pet-age/dog/"') && hub.includes('href="/pet-age/cat/"'));
});
