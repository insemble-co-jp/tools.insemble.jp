/* ===========================================================
   画像ばらし屋（/image-split/）の画像処理。DOM を使わない（Node でも試せる）
   並べて撮った写真から「区切り」を見つけ、1つずつの長方形に分ける。AI は使わない。

   2つの並べ方に対応する
   - すき間あり（gap）：商品・名刺など、背景の上にすき間を空けて並べたもの。
     「背景色だけの行・列」をすき間とみなし、その中央で区切る。切り出したあと背景の余白を詰める
   - 敷き詰め（tile）：フローリング・タイルなど、すき間なく並べたもの。
     目地は暗い溝とは限らない（細い線や、隣との色・木目の段差）ので、
     「境界の両側で色がどれだけ変わるか」を行・列ごとにまとめ、飛び出たところを区切りにする

   作業座標：段（行）の向きを u（横）、段を積む向きを v（縦）として扱う。縦に並ぶものは転置して同じ処理に通す
   =========================================================== */

export const MAX_ANALYSIS = 2400; // 解析は長い辺をこの大きさまで縮めて行う（細い目地が消えない程度。切り出しは原寸）

const D = 2;              // 何px離れた画素同士の色差を見るか（解析解像度）
const PERCENTILE = 0.5;   // 線上の画素のうち半分以上で色が変わっていれば境界とみなす
const GUTTER = 0.985;     // 行（列）の98.5%以上が背景色なら、すき間とみなす（ほこりや小さな影を許す）

export function toRGB(rgba, w, h) {
  const c = new Uint8Array(w * h * 3);
  for (let i = 0, p = 0; p < w * h * 4; p += 4) { c[i++] = rgba[p]; c[i++] = rgba[p + 1]; c[i++] = rgba[p + 2]; }
  return c;
}

/* 三角フィルタで縮小する（重み付きの平均）。ブラウザの drawImage で大きく縮めると細い目地がつぶれ、
   単純な面積平均は端数の縮小率で周期的なムラが出て誤検出したため、自前で行う */
function resampleWeights(src, dst) {
  const f = src / dst, list = [];
  for (let o = 0; o < dst; o++) {
    const c = (o + 0.5) * f, i0 = Math.max(0, Math.floor(c - f)), i1 = Math.min(src - 1, Math.ceil(c + f));
    const idx = [], w = [];
    let sum = 0;
    for (let i = i0; i <= i1; i++) { const v = Math.max(0, 1 - Math.abs(i + 0.5 - c) / f); if (v > 0) { idx.push(i); w.push(v); sum += v; } }
    list.push({ idx, w: w.map((v) => v / sum) });
  }
  return list;
}

export function downscaleRGB(rgba, W, H, sw, sh) {
  if (sw === W && sh === H) return toRGB(rgba, W, H);
  const wx = resampleWeights(W, sw), wy = resampleWeights(H, sh), tmp = new Float32Array(sw * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < sw; x++) {
    const { idx, w } = wx[x];
    let r = 0, g = 0, b = 0;
    for (let k = 0; k < idx.length; k++) { const p = (y * W + idx[k]) * 4; r += rgba[p] * w[k]; g += rgba[p + 1] * w[k]; b += rgba[p + 2] * w[k]; }
    const o = (y * sw + x) * 3;
    tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b;
  }
  const out = new Uint8Array(sw * sh * 3);
  for (let y = 0; y < sh; y++) {
    const { idx, w } = wy[y];
    for (let x = 0; x < sw; x++) for (let ch = 0; ch < 3; ch++) {
      let sum = 0;
      for (let k = 0; k < idx.length; k++) sum += tmp[(idx[k] * sw + x) * 3 + ch] * w[k];
      out[(y * sw + x) * 3 + ch] = Math.round(sum);
    }
  }
  return out;
}

/* orient: "h" = 段が横に流れる（そのまま）／"v" = 段が縦に流れる（転置） */
export function orientRGB(c, w, h, orient) {
  if (orient === "h") return { c, gw: w, gh: h };
  const t = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (y * w + x) * 3, ti = (x * h + y) * 3;
    t[ti] = c[si]; t[ti + 1] = c[si + 1]; t[ti + 2] = c[si + 2];
  }
  return { c: t, gw: h, gh: w };
}

const colorDiff = (c, i, j) => Math.abs(c[i] - c[j]) + Math.abs(c[i + 1] - c[j + 1]) + Math.abs(c[i + 2] - c[j + 2]);
const nearBg = (c, i, bg, tol) => Math.abs(c[i] - bg[0]) + Math.abs(c[i + 1] - bg[1]) + Math.abs(c[i + 2] - bg[2]) <= tol;

function median(arr) {
  const s = Float32Array.from(arr).sort(), n = s.length;
  return n === 0 ? 0 : n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/* ---------- 敷き詰め（tile） ---------- */
const hist = new Uint32Array(766);
function histPercentile(n) {
  const k = Math.floor(n * PERCENTILE);
  let acc = 0;
  for (let b = 0; b < 766; b++) { acc += hist[b]; if (acc > k) return b; }
  return 765;
}
function fillEdges(a) {
  for (let i = 0; i < D; i++) { a[i] = a[D]; a[a.length - 1 - i] = a[a.length - 1 - D]; }
  return a;
}

// 各行の上下の色差（行全体の中央値）。全幅に通る区切りで大きくなり、ずれた継ぎ目・節・木目は効かない
function rowProfile(a) {
  const { c, gw, gh } = a, out = new Float32Array(gh), step = D * gw * 3;
  for (let v = D; v < gh - D; v++) {
    hist.fill(0);
    for (let u = 0, i = v * gw * 3; u < gw; u++, i += 3) hist[colorDiff(c, i - step, i + step)]++;
    out[v] = histPercentile(gw);
  }
  return fillEdges(out);
}

// 段（v0〜v1）の中の各列の左右の色差。段の高さ全体で色が変わるところ＝継ぎ目
function colProfile(a, v0, v1) {
  const { c, gw } = a, out = new Float32Array(gw), step = D * 3;
  for (let u = D; u < gw - D; u++) {
    hist.fill(0);
    for (let v = v0; v < v1; v++) { const i = (v * gw + u) * 3; hist[colorDiff(c, i - step, i + step)]++; }
    out[u] = histPercentile(v1 - v0);
  }
  return fillEdges(out);
}

// 周り（minGap 幅）の中央値を差し引き、ばらつき（MAD）で割ったスコアが k を超える山を区切りとする
function findPeaks(prof, k, minGap) {
  const n = prof.length, r = Math.max(2, Math.round(minGap / 2)), res = new Float32Array(n);
  for (let i = 0; i < n; i++) res[i] = prof[i] - median(prof.subarray(Math.max(0, i - r), Math.min(n, i + r + 1)));
  const m = median(res), mad = Math.max(1, median(res.map((x) => Math.abs(x - m))));
  const z = res.map((x) => (x - m) / mad);
  const cands = [];
  for (let i = 1; i < n - 1; i++) if (z[i] > k && z[i] > z[i - 1] && z[i] >= z[i + 1]) cands.push(i);
  cands.sort((a, b) => z[b] - z[a]);
  const edge = D + 1, out = [];
  for (const i of cands) {
    if (i < edge || i > n - 1 - edge) continue;
    if (out.every((o) => Math.abs(o.i - i) >= minGap)) out.push({ i, score: z[i] });
  }
  // 細い線は両側に山が2つ立つので、近くの重心を区切りの中心とする
  return out.map((o) => {
    let sum = 0, wsum = 0;
    for (let j = Math.max(0, o.i - 2 * D); j <= Math.min(n - 1, o.i + 2 * D); j++) { const w = Math.max(0, z[j]); sum += w * j; wsum += w; }
    return { pos: sum / wsum, score: o.score };
  }).sort((a, b) => a.pos - b.pos);
}

/* 戻り値の pos は元画像の px（s = 解析用の縮小率） */
export function detectTileLong(a, s, p) {
  return findPeaks(rowProfile(a), p.k, p.minWidth * s).map((d) => ({ pos: d.pos / s, score: d.score }));
}

export function detectTileEnds(a, s, top, bottom, p) {
  const margin = Math.max(D + 1, (bottom - top) * s * 0.1); // 段の区切りの近くは除く
  const v0 = Math.ceil(top * s + margin), v1 = Math.min(a.gh, Math.floor(bottom * s - margin));
  if (v1 - v0 < 3) return [];
  return findPeaks(colProfile(a, v0, v1), p.k, p.minLength * s).map((d) => ({ pos: d.pos / s, score: d.score }));
}

/* 区切りがはっきりした画像では、スコアが「本物の区切り（大）」と「模様のノイズ（小）」に大きく分かれる。
   15以下の群と3倍以上離れた切れ目があれば、そこで足切りする（切れ目がなければ k のまま） */
export function gapCut(scores, k) {
  const s = scores.filter((x) => x > k).sort((a, b) => a - b);
  let cut = k;
  for (let i = 0; i < s.length - 1; i++) if (s[i] <= 15 && s[i + 1] / s[i] >= 3) cut = s[i];
  return cut;
}

/* ---------- すき間あり（gap） ---------- */

/* 背景色＝画像のふち（外周1%）の色の中央値。uniform は、ふちのうち背景色に近い画素の割合 */
export function borderColor(c, w, h, tol) {
  const n = Math.max(2, Math.round(Math.min(w, h) * 0.01)), R = [], G = [], B = [], idx = [];
  const take = (x, y) => { const i = (y * w + x) * 3; R.push(c[i]); G.push(c[i + 1]); B.push(c[i + 2]); idx.push(i); };
  for (let y = 0; y < h; y += 2) {
    if (y < n || y >= h - n) { for (let x = 0; x < w; x += 2) take(x, y); }
    else { for (let x = 0; x < n; x += 2) take(x, y); for (let x = w - n; x < w; x += 2) take(x, y); }
  }
  const bg = [median(R), median(G), median(B)];
  const uniform = idx.filter((i) => nearBg(c, i, bg, tol)).length / idx.length;
  return { bg, uniform };
}

/* 背景だけの行（列）が続くところ＝すき間。その中央を区切りにする。画像の端につながる余白は区切りにしない */
function gutterCuts(frac, minGap) {
  const n = frac.length, cands = [];
  for (let i = 0; i < n;) {
    if (frac[i] >= GUTTER) {
      let j = i;
      while (j < n && frac[j] >= GUTTER) j++;
      if (i > 0 && j < n) cands.push({ pos: (i + j - 1) / 2, score: j - i });
      i = j;
    } else i++;
  }
  // 近すぎる区切り（minGap 未満）は、すき間の広い方を残す
  const out = [];
  for (const c of [...cands].sort((a, b) => b.score - a.score)) if (out.every((o) => Math.abs(o.pos - c.pos) >= minGap)) out.push(c);
  return out.sort((a, b) => a.pos - b.pos);
}

export function rowBgFraction(a, bg, tol, v0 = 0, v1 = a.gh, u0 = 0, u1 = a.gw) {
  const out = new Float32Array(v1 - v0);
  for (let v = v0; v < v1; v++) {
    let n = 0;
    for (let u = u0, i = (v * a.gw + u0) * 3; u < u1; u++, i += 3) if (nearBg(a.c, i, bg, tol)) n++;
    out[v - v0] = n / (u1 - u0);
  }
  return out;
}

function colBgFraction(a, bg, tol, v0, v1, u0 = 0, u1 = a.gw) {
  const out = new Float32Array(u1 - u0);
  for (let u = u0; u < u1; u++) {
    let n = 0;
    for (let v = v0; v < v1; v++) if (nearBg(a.c, (v * a.gw + u) * 3, bg, tol)) n++;
    out[u - u0] = n / (v1 - v0);
  }
  return out;
}

export function detectGapLong(a, s, p, bg) {
  return gutterCuts(rowBgFraction(a, bg, p.tol), p.gapMin * s).map((d) => ({ pos: d.pos / s, score: d.score }));
}

export function detectGapEnds(a, s, top, bottom, p, bg) {
  const v0 = Math.max(0, Math.ceil(top * s)), v1 = Math.min(a.gh, Math.floor(bottom * s));
  if (v1 - v0 < 2) return [];
  return gutterCuts(colBgFraction(a, bg, p.tol, v0, v1), p.gapMin * s).map((d) => ({ pos: d.pos / s, score: d.score }));
}

/* 切り出した範囲から、まわりの背景を詰める（中身がなければ null）。r は作業座標の元画像 px */
export function trimToContent(a, s, r, bg, tol) {
  const u0 = Math.max(0, Math.floor(r.u0 * s)), u1 = Math.min(a.gw, Math.ceil(r.u1 * s));
  const v0 = Math.max(0, Math.floor(r.v0 * s)), v1 = Math.min(a.gh, Math.ceil(r.v1 * s));
  if (u1 - u0 < 2 || v1 - v0 < 2) return null;
  const rows = rowBgFraction(a, bg, tol, v0, v1, u0, u1), cols = colBgFraction(a, bg, tol, v0, v1, u0, u1);
  const hasRow = (i) => rows[i] < 0.99, hasCol = (i) => cols[i] < 0.99;
  let t = 0, b = rows.length - 1, l = 0, rr = cols.length - 1;
  while (t <= b && !hasRow(t)) t++;
  while (b >= t && !hasRow(b)) b--;
  while (l <= rr && !hasCol(l)) l++;
  while (rr >= l && !hasCol(rr)) rr--;
  if (t > b || l > rr) return null;
  // 中身がごく小さいもの（ほこり・ゴミ）は捨てる
  if ((b - t + 1) < 6 || (rr - l + 1) < 6) return null;
  const pad = 1; // 解析 px。縁を少し残して、切りすぎを防ぐ
  return {
    ...r,
    u0: Math.max(r.u0, Math.round((u0 + l - pad) / s)), u1: Math.min(r.u1, Math.round((u0 + rr + 1 + pad) / s)),
    v0: Math.max(r.v0, Math.round((v0 + t - pad) / s)), v1: Math.min(r.v1, Math.round((v0 + b + 1 + pad) / s)),
  };
}

/* ---------- 検出の流れ ---------- */

/* p：{ k（敷き詰めの足切り）, tol（背景色とみなす色差）, minWidth・minLength（敷き詰めの板の最小の幅・長さ）,
        gapMin（すき間ありの区切り同士の最小間隔。小さなアイコンが並ぶ画像もあるので小さめ）。単位はすべて元画像 px }
   an(orient)：解析用の画像（作業座標）を返す関数。dims：{ W, H }（元画像）
   mode・orient は "auto" か、決め打ちの値 */
export function detect(an, s, dims, p, { mode = "auto", orient = "auto" } = {}) {
  const h = an("h");
  const { bg, uniform } = borderColor(h.c, h.gw, h.gh, p.tol);
  const gapCuts = (o) => detectGapLong(an(o), s, p, bg);
  if (mode === "auto") {
    // ふちがほぼ1色で、背景だけの行か列が中にあれば「すき間あり」
    const rows = rowBgFraction(h, bg, p.tol), contentRows = rows.filter((f) => f < 0.9).length / rows.length;
    mode = uniform >= 0.9 && contentRows >= 0.15 && (gapCuts("h").length || gapCuts("v").length) ? "gap" : "tile";
  }
  if (orient === "auto") {
    // 格子状なら読む順（左上から横へ）にしたいので、横のすき間があれば横。縦にずらして並べたときだけ縦
    if (mode === "gap") orient = !gapCuts("h").length && gapCuts("v").length ? "v" : "h";
    else {
      const score = (o) => detectTileLong(an(o), s, p).reduce((sum, d) => sum + d.score, 0);
      orient = score("v") > score("h") ? "v" : "h";
    }
  }
  const a = an(orient), Hk = orient === "h" ? dims.H : dims.W;
  let longJ, endCut = 0;
  if (mode === "gap") longJ = gapCuts(orient).map((d) => d.pos);
  else {
    const long = detectTileLong(a, s, p), lc = gapCut(long.map((d) => d.score), p.k);
    longJ = long.filter((d) => d.score > lc).map((d) => d.pos);
  }
  const B = [0, ...longJ, Hk];
  const raw = B.slice(0, -1).map((top, i) => (mode === "gap" ? detectGapEnds(a, s, top, B[i + 1], p, bg) : detectTileEnds(a, s, top, B[i + 1], p)));
  // 敷き詰めの継ぎ目は、全段の候補をまとめて足切り値を決める（あとで段を足したときも同じ値を使う）
  if (mode === "tile") endCut = gapCut(raw.flat().map((d) => d.score), p.k);
  const strips = raw.map((r, i) => ({ top: B[i], bottom: B[i + 1], joints: r.filter((d) => d.score > endCut).map((d) => d.pos) }));
  return { mode, orient, bg, longJ, strips, endCut };
}

/* 段を手で足し引きしたあと、新しくできた段の区切りだけを探し直す */
export function detectStripEnds(a, s, top, bottom, p, res) {
  const r = res.mode === "gap" ? detectGapEnds(a, s, top, bottom, p, res.bg) : detectTileEnds(a, s, top, bottom, p);
  return r.filter((d) => d.score > res.endCut).map((d) => d.pos);
}

/* 区切りから切り出す長方形（元画像の座標）。すき間ありは、まわりの背景を詰めて、中身のないマスを外す */
export function piecesOf(a, s, dims, p, res) {
  const Wk = res.orient === "h" ? dims.W : dims.H;
  if (res.mode === "tile") {
    const inset = Math.max(1, Math.round(Math.max(dims.W, dims.H) / 900)); // 目地の中心から少し内側で切る
    return buildPieces(res.strips, Wk, inset);
  }
  return renumber(buildPieces(res.strips, Wk, 0).map((pc) => trimToContent(a, s, pc, res.bg, p.tol)).filter(Boolean));
}

/* 空のマスを外したあと、段・列の番号を 1 から詰め直す（ファイル名が 01-01, 01-03 のように飛ばないように） */
function renumber(pieces) {
  const rows = [...new Set(pieces.map((pc) => pc.row))].sort((a, b) => a - b);
  const count = {};
  return pieces.map((pc) => {
    const row = rows.indexOf(pc.row) + 1;
    count[row] = (count[row] || 0) + 1;
    return { ...pc, row, col: count[row] };
  });
}

/* ---------- 共通 ---------- */

/* 区切りの座標から長方形を作る。inset：区切りの中心からこの幅だけ内側で切る（目地を残さないため） */
export function buildPieces(strips, Wk, inset) {
  const pieces = [], last = strips.length - 1;
  strips.forEach((st, i) => {
    const E = [0, ...st.joints, Wk];
    const v0 = Math.round(st.top + (i > 0 ? inset : 0));
    const v1 = Math.round(st.bottom - (i < last ? inset : 0));
    for (let j = 0; j < E.length - 1; j++) {
      const u0 = Math.round(E[j] + (j > 0 ? inset : 0));
      const u1 = Math.round(E[j + 1] - (j < E.length - 2 ? inset : 0));
      if (u1 - u0 >= 4 && v1 - v0 >= 4) pieces.push({ row: i + 1, col: j + 1, u0, v0, u1, v1 });
    }
  });
  return pieces;
}

export function toRect(p, orient) {
  return orient === "h"
    ? { x: p.u0, y: p.v0, w: p.u1 - p.u0, h: p.v1 - p.v0 }
    : { x: p.v0, y: p.u0, w: p.v1 - p.v0, h: p.u1 - p.u0 };
}
