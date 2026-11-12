/* ===========================================================
   ツールの「見本」を書き出す：npm run samples
   開いた瞬間に結果のイメージが分かるよう、ファイルを入れる前から見本の結果を並べている。その元になるファイル。
   - PDFばらし屋：架空のチラシ（2ページ・画像2枚）の PDF と、ページ・画像のサムネイル（WebP）
   - 画像ばらし屋：並べて撮ったような見本画像（WebP）と、ツールと同じ処理で見つけた区切り
   書き出し先：public/pdf-extract/sample*、public/image-split/sample.webp、src/data/samples.js（数値と文字）
   - Google Chrome を使う（入っていなければ、環境変数 CHROME に Chrome / Chromium の実行ファイルの場所を入れる）
   - ネットにはつながない（フォントは端末のものを使う）
   =========================================================== */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../../src/lib/image-split.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = (p) => join(root, p);
const fromDataUrl = (u) => Buffer.from(u.split(",")[1], "base64");
const kb = (b) => `${Math.round(b.length / 1024)}KB`;

const exe = process.env.CHROME;
const browser = await chromium.launch(exe ? { executablePath: exe } : { channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
const tab = await ctx.newPage();
mkdirSync(out("public/pdf-extract"), { recursive: true });
mkdirSync(out("public/image-split"), { recursive: true });

/* ブラウザの中で使う小道具：決まった順に出る乱数、canvas → WebP */
const HELPERS = `
  window.rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  window.webp = (src, w, q = 0.82) => { const h = Math.round(src.height * w / src.width), c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, w, h); return { url: c.toDataURL("image/webp", q), w, h }; };
  window.loadImg = (src) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; });
`;

/* ================= 画像ばらし屋：並べて撮ったような見本 ================= */
await tab.setContent(`<!doctype html><html lang="ja"><body><script>${HELPERS}</script></body></html>`);
const split = await tab.evaluate(async () => {
  const W = 1200, H = 900, rows = 3, cols = 4, mx = 74, my = 70, gx = 50, gy = 50;
  const rand = rng(7);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  // 机に敷いた紙（ほんの少しだけ明るさにむらをつける）
  const bg = x.createRadialGradient(W * 0.45, H * 0.4, 100, W * 0.5, H * 0.5, W * 0.75);
  bg.addColorStop(0, "#f3eee4"); bg.addColorStop(1, "#ebe4d7");
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  const cw = (W - mx * 2 - gx * (cols - 1)) / cols, ch = (H - my * 2 - gy * (rows - 1)) / rows;
  const COLORS = ["#d9694f", "#3f8f8a", "#e2b33c", "#5c6fa8", "#8a5a9e", "#5f9e5a", "#c4485f", "#2f7aa6", "#d48a3a", "#6b8e8e", "#b5654a", "#4c7d4f"];
  const rr = (X, Y, w, h, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const i = r * cols + k, w = cw - 6 - rand() * 10, h = ch - 6 - rand() * 10;
    const X = mx + k * (cw + gx) + (cw - w) / 2 + (rand() - 0.5) * 6, Y = my + r * (ch + gy) + (ch - h) / 2 + (rand() - 0.5) * 6;
    // 手作りのコースター：かげ → 地の色 → 模様 → ふちのステッチ
    x.save(); x.shadowColor = "rgba(70,50,30,.22)"; x.shadowBlur = 12; x.shadowOffsetY = 5;
    rr(X, Y, w, h, 20); x.fillStyle = COLORS[i]; x.fill(); x.restore();
    x.save(); rr(X, Y, w, h, 20); x.clip();
    x.fillStyle = "rgba(255,255,255,.22)"; x.strokeStyle = "rgba(255,255,255,.28)"; x.lineWidth = 9;
    const kind = i % 4;
    if (kind === 0) for (let s = -h; s < w; s += 26) { x.beginPath(); x.moveTo(X + s, Y); x.lineTo(X + s + h, Y + h); x.stroke(); }
    if (kind === 1) for (let a = 18; a < w; a += 30) for (let b = 18; b < h; b += 30) { x.beginPath(); x.arc(X + a, Y + b, 6, 0, 7); x.fill(); }
    if (kind === 2) { for (let a = 0; a < w; a += 44) x.fillRect(X + a, Y, 22, h); for (let b = 0; b < h; b += 44) x.fillRect(X, Y + b, w, 22); }
    if (kind === 3) { x.beginPath(); x.arc(X + w / 2, Y + h / 2, Math.min(w, h) * 0.3, 0, 7); x.lineWidth = 14; x.stroke(); }
    x.restore();
    x.save(); rr(X + 11, Y + 11, w - 22, h - 22, 13); x.setLineDash([7, 6]); x.lineWidth = 2.5; x.strokeStyle = "rgba(255,255,255,.75)"; x.stroke(); x.restore();
  }
  const url = c.toDataURL("image/webp", 0.86);
  // ツールと同じく、保存した WebP を開き直して画素を読む（圧縮で少し色が変わるため）
  const img = await loadImg(url), d = document.createElement("canvas"); d.width = W; d.height = H;
  const dx = d.getContext("2d"); dx.drawImage(img, 0, 0);
  const px = dx.getImageData(0, 0, W, H).data;
  let bin = ""; for (let i = 0; i < px.length; i += 0x8000) bin += String.fromCharCode.apply(null, px.subarray(i, i + 0x8000));
  return { url, W, H, rgba: btoa(bin) };
});
writeFileSync(out("public/image-split/sample.webp"), fromDataUrl(split.url));

// ツールの初期値（見つけやすさ 50・並べ方 自動・段の向き 自動）で区切りを探す。中身は src/scripts/tools/image-split.js の params() と同じ
const { W, H } = split, rgba = new Uint8Array(Buffer.from(split.rgba, "base64"));
const s = Math.min(1, L.MAX_ANALYSIS / Math.max(W, H)), sw = Math.round(W * s), sh = Math.round(H * s);
const rgb = L.downscaleRGB(rgba, W, H, sw, sh), cache = {};
const analysis = (o) => (cache[o] ||= L.orientRGB(rgb, sw, sh, o));
const dims = { W, H, s, sw, sh, ws: 1 }, kk = Math.max(W, H) / 900, v = 50;
const p = { k: 12 - v / 10, tol: 24 + v * 0.8, minWidth: Math.round(40 * kk), minLength: Math.round(60 * kk), gapMin: Math.max(4, Math.round(Math.max(W, H) / 200)) };
const res = L.detect(analysis, s, dims, p, { mode: "auto", orient: "auto" });
const pieces = L.piecesOf(analysis(res.orient), s, dims, p, res).map((pc) => ({ row: pc.row, col: pc.col, ...L.toRect(pc, res.orient) }));
const Wk = res.orient === "h" ? W : H;
const seg = (u0, v0, u1, v1) => (res.orient === "h" ? [u0, v0, u1, v1] : [v0, u0, v1, u1]).map(Math.round);
const lines = {
  long: res.longJ.map((y) => seg(0, y, Wk, y)),
  end: res.strips.flatMap((st) => st.joints.map((u) => seg(u, st.top, u, st.bottom))),
};
if (pieces.length !== 12) console.warn(`[samples] 画像ばらし屋：12個のはずが ${pieces.length}個に分かれました。見本の描き方を見直してください`);
console.log(`[samples] public/image-split/sample.webp（${kb(fromDataUrl(split.url))}・${pieces.length}個・${res.mode}）`);

/* ================= PDFばらし屋：架空のチラシ ================= */
const FLYER = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
  @page{size:A4;margin:0}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;color:#2b2a28;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{width:210mm;height:297mm;padding:18mm 17mm;position:relative;overflow:hidden;background:#fffdf8;break-after:page}
  .page:last-child{break-after:auto}
  .band{position:absolute;left:0;right:0;top:0;height:9mm;background:#3f8f8a}
  .k{font-size:12pt;font-weight:700;color:#3f8f8a;letter-spacing:.08em;margin-top:6mm}
  h1{font-size:34pt;line-height:1.2;margin:3mm 0 4mm;font-weight:800}
  h2{font-size:17pt;margin:8mm 0 3mm;padding-bottom:2mm;border-bottom:2px solid #3f8f8a}
  .lead{font-size:14pt;font-weight:700}
  .info{display:grid;grid-template-columns:22mm 1fr;gap:2mm 4mm;font-size:12.5pt;margin:6mm 0;padding:5mm;border:1.5px solid #d8d2c4;border-radius:3mm}
  .info dt{font-weight:700;color:#3f8f8a}
  p{font-size:11.5pt;line-height:1.85;margin-bottom:3mm}
  img{display:block;width:100%;border-radius:3mm;margin:5mm 0}
  ul{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:3mm 6mm;font-size:11.5pt;line-height:1.6}
  li b{display:block;font-size:12.5pt}
  .note{position:absolute;left:17mm;right:17mm;bottom:14mm;font-size:9.5pt;color:#77736b;border-top:1px solid #d8d2c4;padding-top:3mm}
</style></head><body>
<section class="page"><div class="band"></div>
  <p class="k">入場無料 ・ 雨天決行</p>
  <h1>秋の手しごと<br>マーケット</h1>
  <p class="lead">木・布・うつわ。つくり手30組が集まる2日間</p>
  <dl class="info"><dt>日時</dt><dd>10月18日（土）・19日（日）10:00〜16:00</dd><dt>会場</dt><dd>みなと公園 芝生ひろば</dd><dt>持ちもの</dt><dd>エコバッグ（包装を減らしています）</dd></dl>
  <img id="i1" alt="">
  <p>手づくりのうつわや布小物、木のおもちゃなど、つくり手が自分の手で届けるマーケットです。会場では、木のスプーンづくりや、布のコースターづくりのワークショップも開きます。</p>
  <p class="note">この資料は、insemble tools「PDFばらし屋」の見本として作った架空のイベントのチラシです。</p>
</section>
<section class="page"><div class="band"></div>
  <h2>出店するつくり手</h2>
  <ul><li><b>木工房 こもれび</b>木のスプーン・カトラリー</li><li><b>ぬのと糸</b>刺しゅうの布小物</li><li><b>うつわ 小石</b>普段づかいの陶器</li><li><b>紙と版</b>活版印刷のカード</li><li><b>ガラス 月あかり</b>小さなグラスと箸置き</li><li><b>革小物 たね</b>名刺入れ・キーケース</li></ul>
  <h2>会場までの道</h2>
  <img id="i2" alt="">
  <p>駅の東口から歩いて8分です。駐車場はありませんので、電車やバスでお越しください。ワークショップは各回10名まで、当日の朝9時30分から受付で整理券を配ります。</p>
  <p class="note">この資料は、insemble tools「PDFばらし屋」の見本として作った架空のイベントのチラシです。</p>
</section>
<script>${HELPERS}
  // 貼り付ける画像（写真のかわりのイラスト）。PDF に画像として入り、「画像を抽出」で取り出せる
  function market() {
    const W = 1200, H = 640, c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d"), r = rng(3);
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#f6e7cf"); g.addColorStop(1, "#ecd3ad"); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = "#c9a37a"; x.fillRect(0, H * 0.7, W, H * 0.3);
    const cols = ["#d9694f", "#3f8f8a", "#e2b33c", "#5c6fa8", "#8a5a9e", "#5f9e5a"];
    for (let i = 0; i < 7; i++) { const cx = 110 + i * 165, w = 90 + r() * 50, h = 110 + r() * 90; x.fillStyle = cols[i % 6];
      x.beginPath(); x.ellipse(cx, H * 0.7 - h / 2, w / 2, h / 2, 0, 0, 7); x.fill(); x.fillStyle = "rgba(255,255,255,.35)"; x.fillRect(cx - w / 2, H * 0.7 - h * 0.6, w, 10); }
    for (let i = 0; i < 14; i++) { x.fillStyle = i % 2 ? "#5f9e5a" : "#7db36f"; x.beginPath(); x.ellipse(60 + i * 85, 70 + r() * 40, 34, 16, r() * 3, 0, 7); x.fill(); }
    return c;
  }
  function map() {
    const W = 1200, H = 560, c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
    x.fillStyle = "#f1eee6"; x.fillRect(0, 0, W, H);
    x.fillStyle = "#cfe3c4"; x.beginPath(); x.ellipse(820, 300, 260, 170, -0.2, 0, 7); x.fill();
    x.strokeStyle = "#ffffff"; x.lineWidth = 34; x.lineCap = "round";
    x.beginPath(); x.moveTo(0, 150); x.lineTo(W, 190); x.stroke(); x.beginPath(); x.moveTo(330, 0); x.lineTo(380, H); x.stroke();
    x.strokeStyle = "#9aa3ad"; x.lineWidth = 14; x.setLineDash([30, 18]); x.beginPath(); x.moveTo(0, 470); x.lineTo(W, 500); x.stroke(); x.setLineDash([]);
    x.fillStyle = "#5c6fa8"; x.fillRect(250, 430, 160, 70);
    x.strokeStyle = "#d9694f"; x.lineWidth = 10; x.setLineDash([4, 18]); x.beginPath(); x.moveTo(330, 430); x.quadraticCurveTo(420, 260, 760, 290); x.stroke(); x.setLineDash([]);
    x.fillStyle = "#d9694f"; x.beginPath(); x.arc(780, 260, 34, Math.PI, 0); x.lineTo(780, 340); x.closePath(); x.fill(); x.fillStyle = "#fff"; x.beginPath(); x.arc(780, 262, 13, 0, 7); x.fill();
    return c;
  }
  window.ART = [market(), map()];
  document.getElementById("i1").src = ART[0].toDataURL("image/png");
  document.getElementById("i2").src = ART[1].toDataURL("image/png");
</script></body></html>`;

await tab.setContent(FLYER, { waitUntil: "load" });
await tab.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode())); });
const pdf = await tab.pdf({ preferCSSPageSize: true, printBackground: true });
writeFileSync(out("public/pdf-extract/sample.pdf"), pdf);
console.log(`[samples] public/pdf-extract/sample.pdf（${kb(pdf)}）`);

// 取り出した画像のサムネイル
const arts = await tab.evaluate(() => ART.map((c) => ({ ...webp(c, 320), W: c.width, H: c.height })));
// ページ画像のサムネイル（画面のまま撮って縮める）
const pageShots = [];
for (const [i, sec] of (await tab.$$(".page")).entries()) {
  const png = await sec.screenshot({ type: "png" });
  pageShots.push(await tab.evaluate(async (b64) => { const i = await loadImg("data:image/png;base64," + b64); return webp(i, 300, 0.8); }, png.toString("base64")));
}
const files = {
  images: arts.map((a, i) => ({ src: `/pdf-extract/sample-image-${i + 1}.webp`, w: a.w, h: a.h, W: a.W, H: a.H, url: a.url })),
  pages: pageShots.map((a, i) => ({ src: `/pdf-extract/sample-page-${i + 1}.webp`, w: a.w, h: a.h, url: a.url })),
};
for (const f of [...files.images, ...files.pages]) { writeFileSync(out("public" + f.src), fromDataUrl(f.url)); delete f.url; }
await browser.close();

// 文字は、できた PDF から本当に取り出す（ツールの pageText と同じつなぎ方）
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
pdfjs.GlobalWorkerOptions.workerSrc = import.meta.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
const task = pdfjs.getDocument({ data: new Uint8Array(pdf), isEvalSupported: false, verbosity: 0 }), doc = await task.promise;
const text = [];
for (let n = 1; n <= doc.numPages; n++) {
  const tc = await (await doc.getPage(n)).getTextContent();
  let t = "";
  for (const it of tc.items) { if (!("str" in it)) continue; t += it.str; if (it.hasEOL) t += "\n"; }
  text.push(t.replace(/[⺀-⿟]/g, (c) => c.normalize("NFKC")).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ").replace(/[ \t ]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim());
}
await task.destroy(); // v6 には doc.destroy() がないので、読み込みの task ごと片づける
if (!text[0]) console.warn("[samples] PDFばらし屋：PDF から文字を取り出せませんでした");

const data = {
  pdf: { name: "見本のチラシ.pdf", src: "/pdf-extract/sample.pdf", pageCount: text.length, text, chars: text.map((t) => t.replace(/\s/g, "").length), ...files },
  split: { name: "見本の写真.webp", src: "/image-split/sample.webp", W, H, mode: res.mode, rows: new Set(pieces.map((p) => p.row)).size, pieces, lines },
};
writeFileSync(out("src/data/samples.js"), `/* 見本のデータ（npm run samples が書き出す。手で直さない） */\nexport const SAMPLES = ${JSON.stringify(data, null, 2)};\n`);
console.log(`[samples] src/data/samples.js（PDF ${text.length}ページ・${data.pdf.chars.join("+")}文字 / 画像 ${pieces.length}個）`);
