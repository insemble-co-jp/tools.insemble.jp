/* ===========================================================
   写真台帳メーカー
   写真を入れる → 撮影日時で並べる → 場所・説明を入れる → 台帳を印刷・PDF／名前を付け直したZIP／一覧のCSV
   写真はブラウザの中だけで扱い、どこにも送らない
   途中の内容は、この端末のブラウザ（IndexedDB）にだけ自動で保存し、次に開いたとき続きから使える（ledger-store.js。リセットで消える）
   画面と台帳には縮小した写真（blob: URL）を使い、ZIP には元の写真をそのまま入れる
   =========================================================== */
import { $, esc, svg, showMsgs, picker, download, stamp, safeName, reveal } from "./common.js";
import { printHTML } from "./print.js";
import { store } from "./ledger-store.js";
import { makeZip } from "../../lib/zip.js";
import { exifDate, EXIF_BYTES } from "../../lib/exif.js";
import { MAX_PHOTOS, MAX_MB, MAX_ZIP_MB, fileIso, dateText, timeText, sortItems, parseNotes, clip, newName, uniqueNames, toCsv, paginate, splitBySize } from "../../lib/photo-ledger.js";

const THUMB = 1400;    // 台帳用の写真の長い辺（A4 に3枚並べて刷っても粗く見えない大きさ）
const MINI = 320;      // 一覧用の写真の長い辺（画面の 132px の枠に、高解像度の画面でもきれいに出る大きさ）
const PARALLEL = 3;    // 同時に読み込む写真の数
const MOBILE_SOFT = 100; // スマホ・タブレットで、これより多いと「パソコンのほうが安定します」と伝える

const el = {
  drop: $("#pl-drop"),
  file: $("#pl-file"),
  addDrop: $("#pl-add-drop"),
  addFile: $("#pl-add-file"),
  print2: $("#pl-print2"),
  saved: $("#pl-saved"),
  title: $("#pl-title"),
  by: $("#pl-by"),
  notes: $("#pl-notes"),
  notesApply: $("#pl-notes-apply"),
  notesMsgs: $("#pl-notes-msgs"),
  list: $("#pl-list"),
  sample: $("#pl-sample"),
  work: $("#pl-work"),
  outT: $("#pl-out-t"),
  outD: $("#pl-out-d"),
  print: $("#pl-print"),
  zip: $("#pl-zip"),
  csv: $("#pl-csv"),
  reset: $("#pl-reset"),
  prog: $("#pl-prog"),
  progT: $("#pl-prog-t"),
  progBar: $("#pl-prog .prog-bar i"),
  msgs: $("#pl-msgs"),
};

let items = [];
let seq = 0;
let busy = false;
let manual = false; // ↑↓ で並べ替えたら、撮影日時順などの自動の並べ替えをやめる

const order = picker($('[data-pick="order"]'), (v) => { manual = false; items = sortItems(items, v); draw(); saveState(); });
const per = picker($('[data-pick="per"]'), () => { summary(); saveState(); });

/* ---------- 途中保存（この端末のブラウザにだけ） ---------- */
let storeOk = true;  // 一度失敗したら、それ以降は保存しない（ツールはそのまま使える）
function storeFailed() {
  if (!storeOk) return;
  storeOk = false;
  el.saved.textContent = "途中の保存ができませんでした（ブラウザの保存できる量を超えたか、プライベートブラウズ中です）。台帳づくりはそのまま続けられますが、ページを閉じると消えます。";
  el.saved.classList.add("ng");
}
const saving = (p) => { if (storeOk) p.then(savedNote, storeFailed); };
function savedNote() {
  if (!storeOk) return;
  const d = new Date();
  // 元の写真もそのまま保存しているので、使っている大きさを数字で見せる（容量を使っていることに気づけるように）
  const mb = items.reduce((s, it) => s + (it.size || 0), 0) / 1048576;
  const size = mb >= 1024 ? `約${(mb / 1024).toFixed(1)}GB` : `約${Math.max(1, Math.round(mb))}MB`;
  el.saved.textContent = `写真${items.length}枚・${size}を、この端末のブラウザにだけ自動で保存しています（${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} 保存）。次に開いたときも続きから使えます。使い終わったら「リセット」で消してください。`;
}
let stateTimer = 0;
function saveState() {
  if (!storeOk) return;
  clearTimeout(stateTimer);
  stateTimer = setTimeout(() => saving(store.putState({ v: 1, ids: items.map((it) => it.id), seq, manual, order: order.get(), per: per.get(), title: el.title.value, by: el.by.value })), 300);
}
const metaTimers = new Map();
function saveMeta(it) {
  if (!storeOk) return;
  clearTimeout(metaTimers.get(it.id));
  metaTimers.set(it.id, setTimeout(() => { metaTimers.delete(it.id); saving(store.putMeta([it])); }, 400));
}

/* ---------- 写真を受け取る ---------- */
const isImage = (f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(f.name);
const isJpeg = (f) => f.type === "image/jpeg" || /\.jpe?g$/i.test(f.name);

/* 元の写真から、2つの大きさの JPEG（blob: URL）を作る。写真の向き（Exif）はブラウザが合わせて描く
   - src：長い辺 THUMB。台帳の印刷に使う
   - mini：長い辺 MINI。画面の一覧に使う（300枚並べても、ブラウザのメモリーを食わない） */
function shrink(source, w, h, long, quality) {
  const k = Math.min(1, long / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const cx = c.getContext("2d");
  cx.fillStyle = "#fff";
  cx.fillRect(0, 0, c.width, c.height);
  cx.drawImage(source, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => { const size = { w: c.width, h: c.height }; c.width = c.height = 0; b ? res({ blob: b, ...size }) : rej(new Error("toBlob")); }, "image/jpeg", quality));
}
async function thumb(file) {
  const url = URL.createObjectURL(file), img = new Image();
  try {
    img.src = url;
    await img.decode();
    const big = await shrink(img, img.naturalWidth, img.naturalHeight, THUMB, 0.85);
    img.src = ""; // 元の大きな写真を早めに手放す
    const bigUrl = URL.createObjectURL(big.blob);
    // 一覧用は、縮めた写真からさらに縮める（元の写真をもう一度読まない）
    const mid = new Image();
    mid.src = bigUrl;
    await mid.decode();
    const mini = await shrink(mid, big.w, big.h, MINI, 0.8);
    return { src: bigUrl, mini: URL.createObjectURL(mini.blob), bigBlob: big.blob, miniBlob: mini.blob, w: big.w, h: big.h };
  } finally {
    URL.revokeObjectURL(url);
  }
}
const release = (it) => { URL.revokeObjectURL(it.src); URL.revokeObjectURL(it.mini); };

async function readDate(file) {
  if (isJpeg(file)) {
    try { const d = exifDate(await file.slice(0, EXIF_BYTES).arrayBuffer()); if (d) return { date: d, from: "exif" }; } catch (e) {}
  }
  const d = file.lastModified ? fileIso(file.lastModified) : null;
  return { date: d, from: d ? "file" : null };
}

async function add(files) {
  if (busy) return;
  const all = [...files];
  if (!all.length) return;
  const imgs = all.filter(isImage);
  const notes = [];
  if (imgs.length < all.length) notes.push(["warn", `画像ではないファイル（${all.length - imgs.length}件）は飛ばしました。`]);
  const room = MAX_PHOTOS - items.length;
  if (imgs.length > room) notes.push(["warn", room > 0 ? `写真は${MAX_PHOTOS}枚までなので、はじめの${room}枚を入れました。` : `写真はもう${MAX_PHOTOS}枚入っています。台帳を分けて作ってください。`]);
  const todo = imgs.slice(0, Math.max(0, room));

  busy = true;
  el.drop.setAttribute("aria-busy", "true");
  progress(0, todo.length);
  let failed = 0, big = 0, noExif = 0, done = 0, next = 0;
  const got = new Array(todo.length);
  // 同時に読むのは数枚まで（全部を一度に開くと、大きな写真でメモリーがあふれる）
  const worker = async () => {
    while (next < todo.length) {
      const i = next++, f = todo[i];
      if (f.size === 0) failed++;
      else if (f.size > MAX_MB * 1048576) big++;
      else {
        try {
          const [t, d] = await Promise.all([thumb(f), readDate(f)]);
          if (d.from !== "exif") noExif++;
          got[i] = { id: ++seq, file: f, name: f.name, size: f.size, ...d, ...t, place: "", note: "" };
        } catch (e) { failed++; }
      }
      progress(++done, todo.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length) }, worker));
  const added = got.filter(Boolean);
  items.push(...added); // 入れた順を保つ
  if (!manual) items = sortItems(items, order.get());
  if (added.length) { saving(store.addPhotos(added)); saveState(); }
  busy = false;
  el.drop.setAttribute("aria-busy", "false");
  el.prog.hidden = true;

  if (big) notes.push(["warn", `${big}枚は${MAX_MB}MBより大きいため、入れませんでした。`]);
  if (failed) notes.push(["warn", `${failed}枚の写真を開けませんでした。JPEG か PNG で保存し直すと使えます（iPhone の HEIC は、Safari 以外では開けないことがあります）。`]);
  if (noExif) notes.push(["info", `${noExif}枚は写真の中に撮影日時が入っていなかったので、ファイルの日時を使いました（LINE などで送られた写真によくあります）。日付は台帳を作る前に直せます。`]);
  if (items.length > MOBILE_SOFT && small() && !warnedMobile) {
    warnedMobile = true;
    notes.push(["info", `写真が${MOBILE_SOFT}枚を超えました。スマホやタブレットでは、写真が多いと動きが重くなったり、ページが閉じたりすることがあります。たくさんの写真で台帳を作るときは、パソコンのほうが安定します。`]);
  }
  showMsgs(el.msgs, notes);
  draw();
  // 次にやること（場所・説明を書く）へ：入れた写真のうち、いちばん前に並んだものの「場所・部位」欄へ
  const first = items.find((it) => added.includes(it));
  const inp = first && nodes.get(first.id)?.querySelector('[data-f="place"]');
  if (inp) { reveal(nodes.get(first.id)); inp.focus({ preventScroll: true }); }
  else if (todo.length) reveal(el.work);
}
/* スマホ・タブレット（指で操作する画面）か */
const small = () => window.matchMedia?.("(pointer: coarse)").matches;
let warnedMobile = false;

function progress(done, total) {
  el.prog.hidden = total < 2;
  el.progT.textContent = `写真を読み込んでいます… ${done} / ${total}`;
  el.progBar.style.width = total ? `${Math.round((done / total) * 100)}%` : "0";
}

/* ---------- 一覧（1枚ずつ、場所・説明・日時を直せる） ---------- */
function rowHTML(it, i) {
  const n = i + 1, last = i === items.length - 1;
  const date = it.date ? it.date.slice(0, 16) : "";
  return `<li class="pl-row" data-id="${it.id}">
    <img class="pl-th" src="${esc(it.mini)}" alt="" width="${it.w}" height="${it.h}" loading="lazy" decoding="async" />
    <div class="pl-main">
      <div class="pl-top">
        <span class="pl-n">No.${n}</span>
        <label class="pl-date"><span class="sr-only">No.${n}の撮影日時</span><input type="datetime-local" class="inp" data-f="date" value="${esc(date)}" /></label>
        ${it.from === "file" ? `<span class="pl-src" title="写真の中に撮影日時がなかったので、ファイルの日時を入れています">ファイルの日時</span>` : ""}
      </div>
      <label class="pl-f"><span class="pl-l">場所・部位</span><input type="text" class="inp" data-f="place" maxlength="100" value="${esc(it.place)}" placeholder="例：1階 廊下" /></label>
      <label class="pl-f"><span class="pl-l">説明</span><input type="text" class="inp" data-f="note" maxlength="100" value="${esc(it.note)}" placeholder="例：配管の保温 施工後" /></label>
      <p class="pl-file">${esc(it.name)}</p>
    </div>
    <div class="pl-ctl">
      <button type="button" class="btn btn-ghost btn-sm" data-act="up" aria-label="No.${n}をひとつ前へ"${i === 0 ? " disabled" : ""}>${svg("up", 15)}</button>
      <button type="button" class="btn btn-ghost btn-sm" data-act="down" aria-label="No.${n}をひとつ後ろへ"${last ? " disabled" : ""}>${svg("down", 15)}</button>
      <button type="button" class="btn btn-ghost btn-sm" data-act="del" aria-label="No.${n}を外す">${svg("x", 15)}</button>
    </div>
  </li>`;
}

/* 一覧の行は写真ごとに1回だけ作り、あとは並べ替え・番号の付け直しだけをする
   （300行を毎回作り直すと、並べ替えのたびに数秒かかり、一覧の写真も読み込み直しになる） */
const nodes = new Map(); // id → <li>
function rowNode(it) {
  let li = nodes.get(it.id);
  if (!li) {
    const t = document.createElement("template");
    t.innerHTML = rowHTML(it, 0).trim();
    li = t.content.firstElementChild;
    nodes.set(it.id, li);
  }
  return li;
}
function renumber(li, i) {
  const n = i + 1;
  li.querySelector(".pl-n").textContent = `No.${n}`;
  li.querySelector(".pl-date .sr-only").textContent = `No.${n}の撮影日時`;
  const [up, down, del] = li.querySelectorAll("[data-act]");
  up.setAttribute("aria-label", `No.${n}をひとつ前へ`);
  down.setAttribute("aria-label", `No.${n}をひとつ後ろへ`);
  del.setAttribute("aria-label", `No.${n}を外す`);
  up.disabled = i === 0;
  down.disabled = i === items.length - 1;
}
/* 場所・説明の欄を、items の中身に合わせる（まとめて入れたあと） */
function refreshFields() {
  items.forEach((it) => {
    const li = nodes.get(it.id);
    if (!li) return;
    li.querySelector('[data-f="place"]').value = it.place;
    li.querySelector('[data-f="note"]').value = it.note;
  });
}

function draw() {
  const keep = new Set(items.map((it) => it.id));
  for (const [id, li] of nodes) if (!keep.has(id)) { li.remove(); nodes.delete(id); }
  const frag = document.createDocumentFragment();
  items.forEach((it, i) => { const li = rowNode(it); renumber(li, i); frag.appendChild(li); });
  el.list.appendChild(frag); // すでにある行は、作り直さずに並びだけ変わる
  el.sample.hidden = items.length > 0;
  el.work.hidden = items.length === 0;
  summary();
}

function summary() {
  const n = items.length, pages = Math.ceil(n / Number(per.get()));
  el.outT.textContent = n ? `写真 ${n}枚 → 台帳 ${pages}ページ` : "";
  el.outD.textContent = manual ? "並べ替えた順で台帳にします" : order.get() === "date" ? "撮影日時の古い順に並んでいます" : "ファイル名の順に並んでいます";
}

el.list.addEventListener("input", (e) => {
  const f = e.target.dataset.f, row = e.target.closest(".pl-row");
  if (!f || !row) return;
  const it = items.find((x) => x.id === Number(row.dataset.id));
  if (!it) return;
  if (f === "date") {
    // ふつうは "YYYY-MM-DDTHH:MM"。日時の欄がないブラウザでは文字の欄になるので、形が合うものだけを受け取る
    const v = e.target.value.trim();
    if (v && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) { e.target.setAttribute("aria-invalid", "true"); return; }
    e.target.removeAttribute("aria-invalid");
    it.date = v ? `${v.slice(0, 16)}:00` : null;
    it.from = v ? "manual" : null;
    row.querySelector(".pl-src")?.remove();
  } else it[f] = clip(e.target.value);
  saveMeta(it);
});

/* Enter で次の欄へ：場所・部位 → 説明 → 次の写真の場所・部位。最後の写真の説明なら「写真を追加」へ */
el.list.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return; // 日本語の変換を確定する Enter は使わない
  const f = e.target.dataset.f, row = e.target.closest(".pl-row");
  if (!row || (f !== "place" && f !== "note")) return;
  e.preventDefault();
  if (f === "place") return row.querySelector('[data-f="note"]').focus();
  const next = row.nextElementSibling?.querySelector('[data-f="place"]');
  if (next) { next.focus({ preventScroll: true }); next.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  else el.addFile.closest(".pl-add").focus();
});

el.list.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const id = Number(b.closest(".pl-row").dataset.id), act = b.dataset.act;
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return;
  if (act === "del") {
    release(items[i]);
    items.splice(i, 1);
    saving(store.remove(id));
    saveState();
    draw();
    // 外したあとは、次の写真（なければ前の写真）の×にフォーカスを移す
    const next = items[Math.min(i, items.length - 1)];
    if (next) el.list.querySelector(`[data-id="${next.id}"] [data-act="del"]`)?.focus();
    else el.file.focus();
    return;
  }
  const j = act === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  manual = true;
  clearOrderMark();
  draw();
  saveState();
  // 動かした写真の同じボタンに、もう一度フォーカスを戻す（続けて押せるように）
  const again = el.list.querySelector(`[data-id="${id}"] [data-act="${act}"]`);
  if (again && !again.disabled) again.focus();
  else el.list.querySelector(`[data-id="${id}"] [data-act]:not([disabled])`)?.focus();
});

/* 手で並べ替えたら、「撮影日時順」などの押された印を外す */
function clearOrderMark() {
  document.querySelectorAll('[data-pick="order"] button').forEach((x) => x.setAttribute("aria-pressed", "false"));
}

/* ---------- 説明をまとめて入れる ---------- */
el.notesApply.addEventListener("click", () => {
  if (!items.length) return showMsgs(el.notesMsgs, [["err", "先に写真を入れてください。説明は、並んでいる写真の No.1 から順に入ります。"]]);
  const rows = parseNotes(el.notes.value);
  if (!rows.length) return showMsgs(el.notesMsgs, [["err", "説明が入っていません。1行に1枚ずつ書くか、Excel の「場所」「説明」の2列をコピーして貼り付けてください。"]]);
  rows.slice(0, items.length).forEach((r, i) => {
    if (r.place != null) items[i].place = r.place;
    items[i].note = r.note;
  });
  const notes = [["ok", `No.1〜No.${Math.min(rows.length, items.length)} に説明を入れました。`]];
  if (rows.length > items.length) notes.push(["warn", `写真より説明が${rows.length - items.length}行多かったので、あまった行は使っていません。`]);
  showMsgs(el.notesMsgs, notes);
  refreshFields();
  saving(store.putMeta(items));
});

/* ---------- 持ち出す ---------- */
const need = () => {
  if (items.length) return true;
  showMsgs(el.msgs, [["err", "写真が入っていません。上の欄に写真をドロップするか、タップして選んでください。"]]);
  return false;
};
const title = () => clip(el.title.value) || "写真台帳";

function print() {
  if (!need()) return;
  const n = Number(per.get()), pages = paginate(items.map((it, i) => ({ it, no: i + 1 })), n);
  const by = clip(el.by.value);
  const head = (p) => `<header class="pl-pr-head"><h1>${esc(title())}</h1><p>${by ? esc(by) + "　" : ""}${p + 1} / ${pages.length}</p></header>`;
  const meta = ({ it, no }) => `<dl>
      <div><dt>No.</dt><dd>${no}</dd></div>
      <div><dt>撮影日</dt><dd>${esc(dateText(it.date))} ${esc(timeText(it.date))}</dd></div>
      <div><dt>場所・部位</dt><dd>${esc(it.place)}</dd></div>
      <div class="pl-pr-note"><dt>説明</dt><dd>${esc(it.note)}</dd></div>
    </dl>`;
  const html = pages.map((list, p) => n === 3
    ? `<section class="pr-page pl-pr pl-pr3">${head(p)}${list.map((x) => `<div class="pl-pr-row"><div class="pl-pr-ph"><img src="${esc(x.it.src)}" alt="" /></div>${meta(x)}</div>`).join("")}</section>`
    : `<section class="pr-page pl-pr pl-pr6">${head(p)}<div class="pl-pr-grid">${list.map((x) => `<div class="pl-pr-cell"><div class="pl-pr-ph"><img src="${esc(x.it.src)}" alt="" /></div>${meta(x)}</div>`).join("")}</div></section>`
  ).join("");
  printHTML(html);
}
el.print.addEventListener("click", print);
el.print2.addEventListener("click", print);

el.csv.addEventListener("click", () => {
  if (!need()) return;
  download(new Blob([toCsv(items, names())], { type: "text/csv;charset=utf-8" }), `${safeName(title(), "写真台帳")}_一覧_${stamp()}.csv`);
});

const names = () => uniqueNames(items.map((it, i) => newName(it, i + 1, items.length >= 1000 ? 4 : 3)));

el.zip.addEventListener("click", async () => {
  if (!need() || busy) return;
  busy = true;
  el.zip.disabled = true;
  el.prog.hidden = false;
  try {
    const n = names(), csv = toCsv(items, n);
    // ZIP はブラウザのメモリーの中で組み立てるので、MAX_ZIP_MB ごとに分けて、1つずつ作っては保存する
    const parts = splitBySize(items.map((it, i) => ({ it, name: n[i] })), MAX_ZIP_MB * 1048576);
    const base = `${safeName(title(), "写真台帳")}_写真_${stamp()}`;
    for (let k = 0; k < parts.length; k++) {
      el.progT.textContent = parts.length > 1 ? `ZIPにまとめています… ${k + 1} / ${parts.length}` : "ZIPにまとめています…";
      el.progBar.style.width = `${Math.round(((k + 0.5) / parts.length) * 100)}%`;
      // 写真（JPEG など）はもう圧縮されているので、そのまま入れる（速く、大きさもほぼ変わらない）。一覧はどのZIPにも入れる
      const files = parts[k].map((x) => ({ name: x.name, data: x.it.file, compress: false }));
      files.push({ name: "一覧.csv", data: csv });
      download(await makeZip(files), parts.length > 1 ? `${base}_${k + 1}of${parts.length}.zip` : `${base}.zip`);
      if (k < parts.length - 1) await new Promise((r) => setTimeout(r, 1000)); // 保存が始まってから次へ（前のZIPを手放してから作る）
    }
    showMsgs(el.msgs, [["ok", parts.length > 1
      ? `写真が多いので、ZIPを${parts.length}つに分けて保存しました（1つ${MAX_ZIP_MB}MBまで）。ブラウザによっては、複数のファイルを保存してよいかの確認が出ます。どのZIPにも、全体の一覧（一覧.csv）が入っています。`
      : `名前を「001_撮影日_場所」の形に付け直した写真${items.length}枚と、一覧のCSVをZIPで保存しました。`]]);
  } catch (e) {
    showMsgs(el.msgs, [["err", "ZIPを作れませんでした。ほかのタブやアプリを閉じてから、もう一度試してください。"]]);
  } finally {
    busy = false;
    el.zip.disabled = false;
    el.prog.hidden = true;
  }
});

el.reset.addEventListener("click", () => {
  if (busy) return;
  if (items.length && !window.confirm(`入れた写真${items.length}枚と説明を消して、最初からにします。この端末に保存している途中の内容も消えます。よろしいですか？`)) return;
  items.forEach(release);
  saving(store.clear());
  el.saved.textContent = "";
  warnedMobile = false;
  items = [];
  manual = false;
  order.set("date", false);
  el.title.value = el.by.value = el.notes.value = "";
  showMsgs(el.msgs, []);
  showMsgs(el.notesMsgs, []);
  draw();
});

/* ---------- ファイル置き場（左の大きな置き場と、一覧の下の「写真を追加」） ---------- */
["dragover", "drop"].forEach((t) => window.addEventListener(t, (e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); }));
function bindDrop(zone, input) {
  zone.addEventListener("dragenter", (e) => { e.preventDefault(); zone.classList.add("over"); });
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("over"); });
  zone.addEventListener("dragleave", (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove("over"); });
  zone.addEventListener("drop", (e) => { e.preventDefault(); zone.classList.remove("over"); add(e.dataTransfer?.files || []); });
  input.addEventListener("change", () => { add(input.files || []); input.value = ""; });
}
bindDrop(el.drop, el.file);
bindDrop(el.addDrop, el.addFile);
// 「写真を追加」はキーボードでも押せるように（Enter・スペース）
el.addDrop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.addFile.click(); } });
el.title.addEventListener("input", saveState);
el.by.addEventListener("input", saveState);

/* ---------- 開いたとき：前回の続きがあれば戻す ---------- */
async function restore() {
  let saved = null;
  try { saved = await store.load(); } catch (e) { storeFailed(); return; } // 保存の仕組みが使えない環境では、保存なしで動く（そのことは一覧の下に出す）
  if (!saved || items.length) return;
  const { state: s, photos } = saved;
  for (const p of photos) {
    items.push({ ...p, bigBlob: p.big, miniBlob: p.mini, src: URL.createObjectURL(p.big), mini: URL.createObjectURL(p.mini) });
  }
  seq = Math.max(s.seq || 0, ...items.map((it) => it.id));
  manual = !!s.manual;
  el.title.value = s.title || "";
  el.by.value = s.by || "";
  if (s.per) per.set(s.per, false);
  if (s.order) order.set(s.order, false);
  if (manual) clearOrderMark();
  draw();
  const when = s.savedAt ? new Date(s.savedAt) : null;
  const at = when ? `${when.getMonth() + 1}月${when.getDate()}日 ${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}` : "前回";
  showMsgs(el.msgs, [["ok", `${at}に保存した続き（写真${items.length}枚）を開きました。最初からにするときは「リセット」を押してください。`]]);
  savedNote();
  // 説明がまだ空の、いちばん前の写真へ
  const todo = items.find((it) => !it.place && !it.note);
  if (todo) nodes.get(todo.id)?.querySelector('[data-f="place"]')?.focus({ preventScroll: true });
}

draw();
restore();
