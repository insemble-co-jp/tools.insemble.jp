/* ===========================================================
   ツールハブ（React なし）
   やりたいことから、選ぶ（検索欄とカテゴリで絞り込み）/ お気に入り・最近使った（このブラウザの中だけ）
   =========================================================== */
import { goTo } from "./site.js";
import "./faq.js";
import { toolSvg } from "../lib/icons.js";
import H from "../data/hub.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const bySlug = (s) => H.TOOLS.find((t) => t.slug === s && t.status === "live"); // お気に入り・最近使ったに出すのは公開中だけ

/* ---------- 端末内の保存（お気に入り・最近使った） ---------- */
const load = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
let favs = load("hub.favs");
let recent = load("hub.recent");

// URLは #url= で渡す（# から後ろはサーバーに送られないので、アクセスログに残らない）
const toolUrl = (t, url) => "/" + t.slug + "/" + (url ? "#url=" + encodeURIComponent(/^https?:\/\//i.test(url) ? url : "https://" + url) : "");
function remember(slug) {
  recent = [slug, ...recent.filter((x) => x !== slug)].slice(0, 8);
  save("hub.recent", recent);
}
// ツールへのリンクを押したら「最近使った」に入れる（遷移はリンクのまま）
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-open]");
  if (a) remember(a.dataset.open);
});

/* ---------- お気に入り／最近使った ---------- */
function drawMy() {
  const f = favs.map(bySlug).filter(Boolean);
  const r = recent.filter((s) => !favs.includes(s)).map(bySlug).filter(Boolean).slice(0, 4);
  const row = (label, icon, items) => items.length ? `<div class="my-row">
      <span class="my-k">${toolSvg(icon, 14)}${label}</span>
      <div class="chips">${items.map((t) => `<a class="chip my-chip" href="/${t.slug}/" data-open="${t.slug}">${toolSvg(t.icon, 14)}${esc(t.name)}</a>`).join("")}</div>
    </div>` : "";
  $("#my-slot").innerHTML = f.length || r.length ? `<div class="my">${row("お気に入り", "star", f)}${row("最近使った", "clock", r)}</div>` : "";
}
function drawFavs() {
  $$("[data-fav]").forEach((b) => {
    const on = favs.includes(b.dataset.fav);
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on);
    const name = bySlug(b.dataset.fav)?.name ?? "";
    b.setAttribute("aria-label", on ? `${name}をお気に入りから外す` : `${name}をお気に入りに追加`);
  });
}
$$("[data-fav]").forEach((b) => b.addEventListener("click", () => {
  const s = b.dataset.fav;
  favs = favs.includes(s) ? favs.filter((x) => x !== s) : [s, ...favs];
  save("hub.favs", favs);
  drawFavs();
  drawMy();
}));

/* ---------- やりたいことから、選ぶ：検索欄（ツールを探す専用。入れたそばから絞り込む）＋カテゴリ ---------- */
const form = $("#hub-search");
const input = $("input", form);
const clearBtn = $("#hub-clear");
const urlHint = $("#hub-url");
const urlLink = $("#hub-url-link");
const looksUrl = (u) => /^https?:\/\//i.test(u) || /^[\w-]+(\.[\w-]+)+(\/|$)/.test(u);
const urlTool = H.TOOLS.find((t) => t.url && t.status === "live");
const catBtns = $$(".show-cats [data-cat]");
let cat = "all";

function onInput() {
  const v = input.value.trim();
  clearBtn.hidden = !input.value;
  const isUrl = looksUrl(v);
  // URLを貼った人には、URLで使うツールへのリンクを出すだけ（押すかどうかは本人が決める）
  if (urlHint) {
    urlHint.hidden = !isUrl || !urlTool;
    if (isUrl && urlTool) urlLink.href = toolUrl(urlTool, v);
  }
  filter();
}
input.addEventListener("input", onInput);
clearBtn.addEventListener("click", () => { input.value = ""; onInput(); input.focus(); });

catBtns.forEach((b) => b.addEventListener("click", () => {
  cat = b.dataset.cat;
  catBtns.forEach((x) => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on); });
  filter();
}));

// キーボード：「/」か ⌘K / Ctrl+K で検索欄へ。検索欄で Esc を押すと入力を消す（DESIGN.md §9）
document.addEventListener("keydown", (e) => {
  const t = e.target;
  const typing = t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  const cmdK = (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k";
  if (cmdK || (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey)) {
    e.preventDefault();
    input.focus({ preventScroll: true });
    input.select();
    goTo("#pick");
  }
});
input.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !input.value) return;
  e.preventDefault(); // type=search の標準の消去と二重にならないように
  input.value = "";
  onInput();
});

// Enter：スマホのキーボードを閉じるだけ（一覧は入力のたびに絞り込み済み）
form.addEventListener("submit", (e) => {
  e.preventDefault();
  input.blur();
});

/* ---------- 一覧の絞り込み ---------- */
const cards = $$("#live-list [data-search]");

function filter() {
  const raw = input.value.trim();
  // URLのときは絞り込まない。全角・半角をそろえ、空白で区切ったことばがすべて含まれるものを出す（例：「ＰＤＦ 画像」）
  const terms = looksUrl(raw) ? [] : raw.normalize("NFKC").toLowerCase().split(/\s+/).filter(Boolean);
  let n = 0;
  cards.forEach((c) => {
    const ok = (cat === "all" || c.dataset.cat === cat) && terms.every((t) => c.dataset.search.includes(t));
    c.hidden = !ok;
    if (ok) n++;
  });
  // 1つも当たらないときは「見つかりませんでした」（文言は index.astro の #no-hit に書いたまま使う）
  $("#no-hit").hidden = n > 0;
  $("#no-hit-q").textContent = raw;
  // 件数が変わったときだけ読み上げる（1文字ごとに同じ件数をくり返さない）
  const msg = n ? `${n}件のツール` : "合うツールはありません";
  if (hitN.textContent !== msg) hitN.textContent = msg;
}
const hitN = $("#hit-n");

/* ---------- 起動 ---------- */
drawFavs();
drawMy();
