/* ===========================================================
   画像ばらし屋（/image-split/）
   画像を選ぶ → 区切りを自動で見つける → クリックで直す → ZIP（1枚ずつ＋番号付きの全体図＋区切り線の全体図）
   画像処理は src/lib/image-split.js。すべてブラウザの中で行い、画像はどこにも送らない
   =========================================================== */
import { $, showMsgs, safeName, download, picker, canvasToBlob, FONT, sampleFile, SAMPLE_ERR } from "./common.js";
import { makeZip } from "../../lib/zip.js";
import * as L from "../../lib/image-split.js";

const MAX_MB = 50;
const WORK_PIXELS = 16e6; // 端末で一度に扱う画素数の上限（iPhone の canvas の上限＝約1670万画素に収める）。切り出しは原寸
const PREVIEW_MAX = 2000; // 画面に出す確認用の画像の長い辺
const MAX_PIECES = 400;
const LINE = { long: "#00b8d4", end: "#e6007e", out: "#e60028" };

const el = {
  pick: $('[data-stage="pick"]'),
  work: $('[data-stage="work"]'),
  drop: $("#isp-drop"),
  file: $("#isp-file"),
  opening: $("#isp-opening"),
  pickMsgs: $("#isp-pick-msgs"),
  name: $("#isp-name"),
  meta: $("#isp-meta"),
  reset: $("#isp-reset"),
  sens: $("#isp-sens"),
  sensOut: $("#isp-sens-out"),
  canvas: $("#isp-canvas"),
  outT: $("#isp-out-t"),
  outD: $("#isp-out-d"),
  msgs: $("#isp-msgs"),
  save: $("#isp-save"),
  redo: $("#isp-redo"),
  prog: $("#isp-prog"),
  progT: $("#isp-prog-t"),
  progBar: $("#isp-prog .prog-bar i"),
};

let st = null; // { img, url, W, H, s, sw, sh, ws, rgb, cache, base, fileName, res, pieces }
let busy = false;

const mode = picker($('[data-pick="mode"]'), () => st && detectAll());
const orient = picker($('[data-pick="orient"]'), () => st && detectAll());
const edit = picker($('[data-pick="edit"]'));
const fmt = picker($('[data-pick="fmt"]'));
const pad = (n) => String(n).padStart(2, "0");
const label = (pc) => `${pad(pc.row)}-${pad(pc.col)}`; // ファイル名の番号と同じ表記
const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + "MB" : Math.max(1, Math.round(b / 1024)) + "KB");
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const MODE_LABEL = { gap: "すき間あり", tile: "敷き詰め" };

/* 見つけやすさ（0〜100）から、検出の値を決める。大きさは画像の大きさに合わせる（900px で板の幅40px が目安） */
function params() {
  const v = Number(el.sens.value), kk = Math.max(st.W, st.H) / 900;
  return {
    // 初期値 50 → k=7。実写のフローリングで、本物の継ぎ目は8以上・木目のノイズは6以下だったので、その間
    k: 12 - v / 10,           // 敷き詰め：区切りとみなすスコアの下限
    tol: 24 + v * 0.8,        // すき間あり：背景色とみなす色の差（初期値で 64）
    minWidth: Math.round(40 * kk),
    minLength: Math.round(60 * kk),
    gapMin: Math.max(4, Math.round(Math.max(st.W, st.H) / 200)),
  };
}
const analysis = (o) => (st.cache[o] ||= L.orientRGB(st.rgb, st.sw, st.sh, o));

/* ---------- 画像を受け取る ---------- */
["dragover", "drop"].forEach((t) => window.addEventListener(t, (e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); }));
el.drop.addEventListener("dragenter", (e) => { e.preventDefault(); el.drop.classList.add("over"); });
el.drop.addEventListener("dragover", (e) => { e.preventDefault(); el.drop.classList.add("over"); });
el.drop.addEventListener("dragleave", (e) => { if (!el.drop.contains(e.relatedTarget)) el.drop.classList.remove("over"); });
el.drop.addEventListener("drop", (e) => {
  e.preventDefault();
  el.drop.classList.remove("over");
  const files = [...(e.dataTransfer?.files || [])];
  if (files[0] && !busy) take(files[0], files.length > 1);
});
el.file.addEventListener("change", () => { if (el.file.files[0] && !busy) take(el.file.files[0]); el.file.value = ""; });

/* 見本で試す：見本の画像を開いて、区切りを見つけるところまで進める */
$("#isp-sample")?.addEventListener("click", async (e) => {
  const b = e.currentTarget;
  if (busy) return;
  b.disabled = true;
  try {
    await take(await sampleFile(b, "image/webp"));
  } catch (err) {
    showMsgs(el.pickMsgs, [["err", SAMPLE_ERR]]);
  } finally {
    b.disabled = false;
  }
});

function loadImage(file) {
  const url = URL.createObjectURL(file), img = new Image();
  return new Promise((resolve, reject) => {
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}

async function take(file, many = false) {
  showMsgs(el.pickMsgs, []);
  const isImg = file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(file.name);
  if (!isImg) return showMsgs(el.pickMsgs, [["err", "選んだファイルは画像ではないようです。JPEG・PNG などの画像を選び直してください。PDFは「PDFばらし屋」で画像にしてから使えます。"]]);
  if (file.size === 0) return showMsgs(el.pickMsgs, [["err", "このファイルは中身が空（0バイト）です。別のファイルを選んでください。"]]);
  if (file.size > MAX_MB * 1048576) return showMsgs(el.pickMsgs, [["err", `このファイルは${fmtSize(file.size)}あります。読み込めるのは${MAX_MB}MBまでなので、写真アプリなどで小さくしてから選んでください。`]]);
  busy = true;
  el.opening.hidden = false;
  el.file.disabled = true;
  try {
    let loaded;
    try {
      loaded = await loadImage(file);
    } catch (e) {
      const heic = /\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type);
      return showMsgs(el.pickMsgs, [["err", heic
        ? "このブラウザでは HEIC（iPhone の写真の形式）を開けませんでした。写真を JPEG で書き出すか、Safari で開き直してください。"
        : "画像を開けませんでした。壊れているか、このブラウザが読めない形式かもしれません。JPEG か PNG で保存し直してお試しください。"]]);
    }
    const { img, url } = loaded, W = img.naturalWidth, H = img.naturalHeight;
    if (W < 40 || H < 40) { URL.revokeObjectURL(url); return showMsgs(el.pickMsgs, [["err", `この画像は ${W}×${H}px と小さすぎて、区切りを見つけられません。元の大きさの画像を選んでください。`]]); }
    await nextFrame(); // 「画像を調べています…」を先に出してから重い処理に入る
    // 画素を読み、解析用（長い辺 2400px）まで自前で縮める。ブラウザに縮めさせると結果が変わるので、
    // 端末の上限を超える大きな画像のときだけ、先にブラウザで上限まで縮める
    const ws = Math.min(1, Math.sqrt(WORK_PIXELS / (W * H))), iw = Math.round(W * ws), ih = Math.round(H * ws);
    const c = document.createElement("canvas");
    c.width = iw; c.height = ih;
    const cx = c.getContext("2d", { willReadFrequently: true });
    cx.drawImage(img, 0, 0, iw, ih);
    const s = Math.min(1, L.MAX_ANALYSIS / Math.max(W, H)), sw = Math.round(W * s), sh = Math.round(H * s);
    const rgb = L.downscaleRGB(cx.getImageData(0, 0, iw, ih).data, iw, ih, sw, sh);
    c.width = c.height = 0;
    if (st?.url) URL.revokeObjectURL(st.url);
    st = { img, url, W, H, s, sw, sh, ws, rgb, cache: {}, fileName: file.name, base: safeName(file.name.replace(/\.[^.]+$/, ""), "image"), res: null, pieces: [] };
    el.name.textContent = file.name;
    el.meta.textContent = `${W}×${H}px ・ ${fmtSize(file.size)}`;
    el.pick.hidden = true;
    el.work.hidden = false;
    const ps = Math.min(1, PREVIEW_MAX / Math.max(W, H));
    el.canvas.width = Math.round(W * ps);
    el.canvas.height = Math.round(H * ps);
    detectAll(many ? [["info", "画像は1枚ずつ読み取るため、最初の1枚を開きました。ほかの画像は「別の画像にする」を押してから選んでください。"]] : []);
  } catch (e) {
    showMsgs(el.pickMsgs, [["err", "画像を読み取れませんでした。画像が大きすぎるかもしれません。小さくしてから、もう一度お試しください。"]]);
  } finally {
    busy = false;
    el.opening.hidden = true;
    el.file.disabled = false;
  }
}

/* ---------- 区切りを見つける ---------- */
function detectAll(notes = []) {
  const p = params(), mv = mode.get(), ov = orient.get();
  st.res = L.detect(analysis, st.s, st, p, { mode: mv, orient: ov });
  st.res.autoMode = mv === "auto";
  st.notes = notes;
  update();
}

/* 段を手で足し引きしたとき：境目が変わらない段は手直しを残し、新しくできた段だけ探し直す */
function rebuildStrips() {
  const p = params(), res = st.res, Hk = res.orient === "h" ? st.H : st.W;
  res.longJ.sort((x, y) => x - y);
  const B = [0, ...res.longJ, Hk], old = res.strips;
  res.strips = B.slice(0, -1).map((top, i) => old.find((o) => o.top === top && o.bottom === B[i + 1])
    || { top, bottom: B[i + 1], joints: L.detectStripEnds(analysis(res.orient), st.s, top, B[i + 1], p, res) });
}

function update() {
  st.pieces = L.piecesOf(analysis(st.res.orient), st.s, st, params(), st.res).map((pc) => ({ ...pc, rect: L.toRect(pc, st.res.orient) }));
  render();
  const n = st.pieces.length, rows = new Set(st.pieces.map((pc) => pc.row)).size;
  el.outT.innerHTML = n ? `<b>${n}</b>個に分けました` : "区切りが見つかりませんでした";
  el.outD.textContent = `${rows}段 ・ 並べ方：${MODE_LABEL[st.res.mode]}${st.res.autoMode ? "（自動で判定）" : ""}`;
  const msgs = [...st.notes];
  if (n <= 1) msgs.push(["warn", "区切りが見つかりませんでした。「並べ方」を切り替えるか、「細かく調整する」で見つけやすさを上げてください。画像をクリックして、区切りを足すこともできます。"]);
  if (n > MAX_PIECES) msgs.push(["warn", `${n}個に分かれています。細かすぎるときは、「細かく調整する」で見つけやすさを下げてください（保存できるのは${MAX_PIECES}個までです）。`]);
  showMsgs(el.msgs, msgs);
  el.save.disabled = n === 0 || n > MAX_PIECES;
}

/* ---------- 確認用の画像を描く（画面・ZIP の全体図で共通） ---------- */
function drawLines(ctx, k, longColor, endColor) {
  const res = st.res, Wk = res.orient === "h" ? st.W : st.H;
  const line = (u0, v0, u1, v1) => {
    const [x0, y0, x1, y1] = res.orient === "h" ? [u0, v0, u1, v1] : [v0, u0, v1, u1];
    ctx.beginPath(); ctx.moveTo(x0 * k, y0 * k); ctx.lineTo(x1 * k, y1 * k); ctx.stroke();
  };
  ctx.lineWidth = Math.max(2, Math.round(Math.max(st.W, st.H) * k / 570));
  ctx.strokeStyle = longColor;
  res.longJ.forEach((v) => line(0, v, Wk, v));
  ctx.strokeStyle = endColor;
  res.strips.forEach((s) => s.joints.forEach((u) => line(u, s.top, u, s.bottom)));
}

function drawLabels(ctx, k, outline) {
  const base = Math.max(12, Math.round(Math.max(st.W, st.H) * k / 42));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const pc of st.pieces) {
    const r = pc.rect, x = r.x * k, y = r.y * k, w = r.w * k, h = r.h * k, t = label(pc);
    if (outline) {
      ctx.lineWidth = Math.max(2, Math.round(Math.max(st.W, st.H) * k / 760));
      ctx.strokeStyle = "rgba(255,255,255,.9)";
      ctx.strokeRect(x, y, w, h);
    }
    const fs = Math.max(10, Math.min(base, Math.round(Math.min(w, h) * 0.3)));
    ctx.font = `700 ${fs}px ${FONT}`;
    const tw = ctx.measureText(t).width + fs * 0.6;
    ctx.fillStyle = "rgba(0,0,0,.66)";
    ctx.fillRect(x + w / 2 - tw / 2, y + h / 2 - fs * 0.7, tw, fs * 1.4);
    ctx.fillStyle = "#fff";
    ctx.fillText(t, x + w / 2, y + h / 2);
  }
}

function render() {
  const ctx = el.canvas.getContext("2d"), k = el.canvas.width / st.W;
  ctx.drawImage(st.img, 0, 0, el.canvas.width, el.canvas.height);
  drawLines(ctx, k, LINE.long, LINE.end);
  drawLabels(ctx, k, false);
}

/* ---------- クリックで区切りを直す ---------- */
el.canvas.addEventListener("click", (e) => {
  if (!st?.res || busy) return;
  const r = el.canvas.getBoundingClientRect(), k = st.W / r.width;
  const x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k, tol = 14 * k;
  const res = st.res, [u, v] = res.orient === "h" ? [x, y] : [y, x];
  if (e.shiftKey || edit.get() === "long") {
    const i = res.longJ.findIndex((p) => Math.abs(p - v) < tol);
    if (i >= 0) res.longJ.splice(i, 1); else res.longJ.push(v);
    rebuildStrips();
  } else {
    const strip = res.strips.find((s) => v >= s.top && v < s.bottom);
    if (!strip) return;
    const i = strip.joints.findIndex((p) => Math.abs(p - u) < tol);
    if (i >= 0) strip.joints.splice(i, 1); else strip.joints.push(u);
    strip.joints.sort((a, b) => a - b);
  }
  st.notes = [];
  update();
});

el.sens.addEventListener("input", () => { el.sensOut.value = el.sens.value; });
el.sens.addEventListener("change", () => st && detectAll());
el.redo.addEventListener("click", () => st && detectAll());

el.reset.addEventListener("click", () => {
  if (busy) return;
  if (st?.url) URL.revokeObjectURL(st.url);
  st = null;
  el.work.hidden = true;
  el.pick.hidden = false;
  showMsgs(el.msgs, []);
  showMsgs(el.pickMsgs, []);
});

/* ---------- 保存（ZIP） ---------- */
function progress(i, n) {
  el.progT.textContent = `書き出しています… ${i} / ${n}`;
  el.progBar.style.width = `${Math.round((i / n) * 100)}%`;
}

el.save.addEventListener("click", async () => {
  if (!st || busy || !st.pieces.length) return;
  busy = true;
  el.save.disabled = true;
  el.prog.hidden = false;
  const jpg = fmt.get() === "jpg", type = jpg ? "image/jpeg" : "image/png", ext = jpg ? "jpg" : "png";
  const files = [], layout = [], n = st.pieces.length + 2;
  try {
    const c = document.createElement("canvas"), cx = c.getContext("2d");
    for (const [i, pc] of st.pieces.entries()) {
      progress(i, n);
      const r = pc.rect, f = Math.min(1, Math.sqrt(16e6 / (r.w * r.h))); // 1枚が大きすぎるときだけ縮める
      c.width = Math.round(r.w * f); c.height = Math.round(r.h * f);
      cx.drawImage(st.img, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
      const name = `${st.base}_${label(pc)}.${ext}`;
      files.push({ name, data: await canvasToBlob(c, type, 0.92), compress: false });
      layout.push({ file: name, row: pc.row, col: pc.col, x: r.x, y: r.y, w: r.w, h: r.h });
      if (i % 8 === 7) await nextFrame();
    }
    // どれがどこかを確かめる全体図（番号付き・区切り線入り）。写真なので JPEG
    c.width = Math.round(st.W * st.ws); c.height = Math.round(st.H * st.ws);
    const k = st.ws;
    progress(n - 2, n);
    cx.drawImage(st.img, 0, 0, c.width, c.height); drawLabels(cx, k, true);
    files.push({ name: `${st.base}_番号付き.jpg`, data: await canvasToBlob(c, "image/jpeg", 0.9), compress: false });
    progress(n - 1, n);
    cx.drawImage(st.img, 0, 0, c.width, c.height); drawLines(cx, k, LINE.out, LINE.out);
    files.push({ name: `${st.base}_区切り線.jpg`, data: await canvasToBlob(c, "image/jpeg", 0.9), compress: false });
    c.width = c.height = 0;
    const json = { source: st.fileName, width: st.W, height: st.H, arrangement: st.res.mode, pieces: layout };
    files.push({ name: `${st.base}_位置.json`, data: JSON.stringify(json, null, 2) });
    progress(n, n);
    download(await makeZip(files), `${st.base}_ばらし.zip`);
    showMsgs(el.msgs, [["ok", `${st.pieces.length}枚の画像と、番号付き・区切り線入りの全体図をZIPで保存しました。`]]);
  } catch (e) {
    showMsgs(el.msgs, [["err", "保存の途中で止まりました。画像が大きすぎるか、分けた数が多すぎるかもしれません。パソコンでお試しいただくか、見つけやすさを下げて数を減らしてください。"]]);
  } finally {
    busy = false;
    el.prog.hidden = true;
    el.save.disabled = false;
  }
});
