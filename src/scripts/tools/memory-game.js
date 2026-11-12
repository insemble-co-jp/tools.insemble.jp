/* ===========================================================
   神経衰弱メーカー（/memory-game/）
   写真（または絵文字の絵柄）を選ぶ → 画面で遊ぶ（ひとりで／みんなで2〜4人）／印刷して手作りカードにする
   写真はブラウザの中だけで扱い、どこにも送らない（scripts/tools/pictures.js）
   =========================================================== */
import { $, showMsgs, picker, stepper, reduceMotion, reveal } from "./common.js";
import { shuffle } from "../../lib/arrange.js";
import { PICTURE_SETS } from "../../data/picture-sets.js";
import { pictureInput, faceHTML } from "./pictures.js";
import { printHTML } from "./print.js";

const MAX_PAIRS = 24;
const FLIP_BACK_MS = 1000; // そろわなかったとき、見せておく時間

const el = {
  photoBox: $("#mm-photo"),
  drop: $("#mm-drop"),
  file: $("#mm-file"),
  list: $("#mm-list"),
  picMsgs: $("#mm-pic-msgs"),
  sum: $("#mm-sum"),
  back: $("#mm-back"),
  start: $("#mm-start"),
  print: $("#mm-print"),
  msgs: $("#mm-msgs"),
  out: $("#mm-out"),
  stage: $("#mm-stage"),
  status: $("#mm-status"),
  board: $("#mm-board"),
  end: $("#mm-end"),
  again: $("#mm-again"),
  full: $("#mm-full"),
};

const photos = pictureInput({ drop: el.drop, input: el.file, list: el.list, msgs: el.picMsgs, max: MAX_PAIRS, onChange: () => summary() });
const src = picker($('[data-pick="src"]'), (v) => { el.photoBox.hidden = v !== "photo"; summary(); });
/* 遊び方：ひとりで（回数と時間）／みんなで（2〜4人で順番に。人数はこのときだけ出す） */
const MODE_D = {
  solo: "ひとりで全部そろえる。めくった回数と時間が出ます",
  vs: "順番にめくって、そろえた数を競う。そろえた人はもう一回",
};
const mode = picker($('[data-pick="mode"]'), (v) => {
  $("#mm-players").hidden = v !== "vs";
  $("#mm-mode-d").textContent = MODE_D[v];
});
const players = picker($('[data-pick="players"]'));
const playerCount = () => (mode.get() === "vs" ? Number(players.get()) : 1);
const pairs = stepper($("#mm-pairs"), () => summary());

/* いま使える絵柄（写真か、絵文字のセット） */
function pool() {
  const v = src.get();
  if (v === "photo") return photos.get();
  const set = PICTURE_SETS.find((s) => s.id === v) || PICTURE_SETS[0];
  return set.items.map((t) => ({ kind: "emoji", t }));
}
function chosen() {
  const all = pool();
  return shuffle(all).slice(0, Math.min(pairs.get(), all.length));
}
function summary() {
  const n = Math.min(pairs.get(), pool().length);
  el.sum.textContent = src.get() === "photo" && !photos.get().length
    ? "写真を入れると、ここに枚数が出ます"
    : `${n}ペア ・ カード${n * 2}枚${src.get() === "photo" && pool().length < pairs.get() ? `（写真が${pool().length}枚なので）` : ""}`;
}
summary();

/* ---------- 画面で遊ぶ ---------- */
let game = null; // { deck, open, done, turn, scores, flips, players, lock, t0, timer }

function check() {
  const n = Math.min(pairs.get(), pool().length);
  if (src.get() === "photo" && pool().length < 2) return [["err", "写真を2枚以上入れてください。1枚の写真から、同じカードが2枚できます。"]];
  if (n < 2) return [["err", "ペアの数は2以上にしてください。"]];
  return [];
}

function start() {
  const errs = check();
  showMsgs(el.msgs, errs);
  if (errs.length) return;
  const items = chosen();
  const deck = shuffle(items.flatMap((item, id) => [{ item, id }, { item, id }]));
  stopTimer();
  game = { deck, open: [], done: new Map(), turn: 0, scores: Array(playerCount()).fill(0), flips: 0, players: playerCount(), lock: false, t0: 0, timer: 0 };
  const n = deck.length;
  const cols = n <= 12 ? 4 : n <= 20 ? 5 : n <= 30 ? 6 : 8;
  el.board.style.setProperty("--cols", cols);
  el.board.style.setProperty("--cols-sm", Math.min(cols, n <= 24 ? 4 : 6)); // スマホでは、子どもの指で押せる大きさ（1枚 44px 以上）を保つ
  el.stage.style.setProperty("--ratio", cols / Math.ceil(n / cols)); // 大きく表示のとき、縦に収める
  el.board.innerHTML = deck.map((c, i) => `<button type="button" class="mm-card" data-i="${i}" aria-label="カード${i + 1}（うら）"><span class="mm-in"><span class="mm-back" aria-hidden="true"></span><span class="mm-face">${faceHTML(c.item)}</span></span></button>`).join("");
  el.stage.hidden = false;
  el.out.querySelector(".sample")?.remove(); // 見本の盤面を外す
  el.end.hidden = true;
  drawStatus();
  reveal(el.stage);
}

function drawStatus() {
  if (!game) return;
  if (game.players === 1) {
    el.status.innerHTML = `<span class="mm-st">めくった回数 <b>${game.flips}</b></span><span class="mm-st">じかん <b id="mm-time">${clock()}</b></span><span class="mm-st">そろった <b>${game.done.size / 2}</b> / ${game.deck.length / 2}</span>`;
    return;
  }
  el.status.innerHTML = game.scores.map((s, i) => `<span class="mm-pl hue-${i}${i === game.turn ? " on" : ""}"${i === game.turn ? ' aria-current="true"' : ""}><i aria-hidden="true"></i>プレイヤー${i + 1}<b>${s}</b></span>`).join("")
    + `<span class="sr-only" aria-live="polite">プレイヤー${game.turn + 1}の番です</span>`;
}

const clock = () => {
  const s = game?.t0 ? Math.floor(((game.tEnd || Date.now()) - game.t0) / 1000) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
function stopTimer() { if (game?.timer) clearInterval(game.timer); }

function flip(i, up) {
  const b = el.board.querySelector(`[data-i="${i}"]`);
  b.classList.toggle("up", up);
  b.setAttribute("aria-label", `カード${i + 1}（${up ? "おもて" : "うら"}）`);
}

el.board.addEventListener("click", (e) => {
  const b = e.target.closest(".mm-card");
  if (!b || !game || game.lock) return;
  const i = Number(b.dataset.i);
  if (game.done.has(i) || game.open.includes(i)) return;
  if (!game.t0) {
    game.t0 = Date.now();
    if (game.players === 1) game.timer = setInterval(() => { const t = $("#mm-time"); if (t) t.textContent = clock(); }, 1000);
  }
  flip(i, true);
  game.open.push(i);
  if (game.open.length < 2) return;
  game.flips++;
  const [a, c] = game.open;
  if (game.deck[a].id === game.deck[c].id) {
    // そろった：同じ人がもう一回
    [a, c].forEach((k) => {
      game.done.set(k, game.turn);
      const card = el.board.querySelector(`[data-i="${k}"]`);
      card.classList.add("got", `hue-${game.players > 1 ? game.turn : 0}`);
      card.disabled = true;
    });
    game.scores[game.turn]++;
    game.open = [];
    drawStatus();
    if (game.done.size === game.deck.length) finish();
    return;
  }
  // そろわない：少し見せてから戻して、次の人へ
  game.lock = true;
  drawStatus();
  setTimeout(() => {
    if (!game) return;
    flip(a, false); flip(c, false);
    game.open = [];
    game.lock = false;
    game.turn = (game.turn + 1) % game.players;
    drawStatus();
  }, reduceMotion() ? FLIP_BACK_MS * 0.8 : FLIP_BACK_MS);
});

function finish() {
  game.tEnd = Date.now();
  stopTimer();
  drawStatus();
  let html;
  if (game.players === 1) {
    html = `<p class="mm-end-t">ぜんぶ そろいました！</p><p class="mm-end-d">${game.flips}回めくって、${clock()}でクリア</p>`;
  } else {
    const best = Math.max(...game.scores);
    const rank = game.scores.map((s, i) => ({ s, i })).sort((x, y) => y.s - x.s);
    const winners = rank.filter((r) => r.s === best).map((r) => `プレイヤー${r.i + 1}`);
    html = `<p class="mm-end-t">${winners.length > 1 ? `${winners.join("と")}の引き分け！` : `${winners[0]}の勝ち！`}</p>`
      + `<ol class="mm-rank">${rank.map((r) => `<li class="hue-${r.i}"><i aria-hidden="true"></i>プレイヤー${r.i + 1}<b>${r.s}ペア</b></li>`).join("")}</ol>`;
  }
  el.end.querySelector(".mm-end-body").innerHTML = html;
  el.end.hidden = false;
}

el.start.addEventListener("click", start);
el.again.addEventListener("click", start);

/* 大きく表示（タブレットを机に置いて遊ぶときなど） */
el.full.addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else el.stage.requestFullscreen?.().catch(() => {});
});
document.addEventListener("fullscreenchange", () => {
  const on = document.fullscreenElement === el.stage;
  el.full.querySelector("span").textContent = on ? "元に戻す" : "大きく表示";
  el.full.setAttribute("aria-pressed", String(on));
});

/* ---------- 印刷 ---------- */
const PER_PAGE = 12; // A4 に 6cm 角のカードを 3列×4段
el.print.addEventListener("click", () => {
  const errs = check();
  showMsgs(el.msgs, errs);
  if (errs.length) return;
  const items = chosen();
  const cards = shuffle(items.flatMap((it) => [it, it]));
  const pages = [];
  for (let p = 0; p < cards.length; p += PER_PAGE) {
    const chunk = cards.slice(p, p + PER_PAGE);
    pages.push(`<section class="pr-page mm-pr"><div class="mm-pr-grid">${chunk.map((it) => `<div class="mm-pr-card"><div class="mm-pr-face">${faceHTML(it)}</div></div>`).join("")}</div><p class="mm-pr-foot">点線で切りはなしてください ・ 神経衰弱メーカー（insemble tools）</p></section>`);
    if (el.back.checked) pages.push(`<section class="pr-page mm-pr"><div class="mm-pr-grid">${chunk.map(() => `<div class="mm-pr-card back"><div class="mm-pr-back"></div></div>`).join("")}</div><p class="mm-pr-foot">うら面 ・ おもて面のうらに刷るか、貼り合わせてください</p></section>`);
  }
  printHTML(pages.join(""));
});
