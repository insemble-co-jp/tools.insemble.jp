/* ===========================================================
   ペット年齢換算の計算（画面に依存しない純粋な関数だけ）
   - ページ（.astro）の早見表、ブラウザの計算（src/scripts/tools/pet-age.js）、テスト（tests/）の全部がここを使う
   - 数値は src/data/pet-age.js から読む。ここに換算値を書かない
   - 日付は「日本時間の年月日」を { y, m, d } で扱う（時刻・タイムゾーンを持たないので、日付の境目でずれない）
   =========================================================== */
import { MODELS, STAGES, CHART, LIMITS } from "../data/pet-age.js";

/* ---------- 日付 ---------- */
export const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** "2026-11-12" → { y, m, d }。形が違う・存在しない日付（2月30日など）は null */
export function parseYmd(s) {
  const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? "").trim());
  if (!r) return null;
  const y = +r[1], m = +r[2], d = +r[3];
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) return null;
  return { y, m, d };
}
export const ymd = (o) => `${o.y}-${String(o.m).padStart(2, "0")}-${String(o.d).padStart(2, "0")}`;
export const cmpYmd = (a, b) => a.y - b.y || a.m - b.m || a.d - b.d;

/** 日本時間の今日（端末の時計を使い、タイムゾーンだけ Asia/Tokyo にそろえる） */
export function jstToday(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day };
}

/** 満の月数。誕生日の「日」がその月にないとき（1月31日生まれの2月、2月29日生まれの平年）は、その月の末日を記念日とする */
export function monthsBetween(birth, base) {
  let n = (base.y - birth.y) * 12 + (base.m - birth.m);
  if (base.d < Math.min(birth.d, daysIn(base.y, base.m))) n -= 1;
  return n;
}

/** 基準日から t か月後（負なら前）の年と月 */
export function addMonths(base, t) {
  const total = base.y * 12 + (base.m - 1) + Math.round(t);
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
}

/* ---------- 入力の読み取り ----------
   返り値：{ ok, months, exact, monthsKnown, errors: [{ field, msg }] }
   exact：生年月日から数えた（誕生日がわかっている）／monthsKnown：○か月まで入っている */
const intOrNull = (v) => {
  const s = String(v ?? "").trim().normalize("NFKC");
  if (s === "") return null;
  return /^-?\d+$/.test(s) ? Number(s) : NaN;
};

export function readPet({ method, birth, years, months }, base) {
  const errors = [];
  if (method === "birth") {
    if (!String(birth ?? "").trim()) return { ok: false, errors: [{ field: "birth", msg: "生年月日を入れてください。わからないときは「年齢で入れる」を選んでください。" }] };
    const b = parseYmd(birth);
    if (!b) return { ok: false, errors: [{ field: "birth", msg: "生年月日を正しく入れてください（例：2020-04-01）。" }] };
    if (cmpYmd(b, base) > 0) return { ok: false, errors: [{ field: "birth", msg: "生年月日が、計算する日より後になっています。" }] };
    const n = monthsBetween(b, base);
    if (n > LIMITS.petYears * 12) return { ok: false, errors: [{ field: "birth", msg: `${LIMITS.petYears}歳を超える年齢になっています。生年月日を確かめてください。` }] };
    return { ok: true, months: n, exact: true, monthsKnown: true, errors };
  }
  const y = intOrNull(years);
  const mo = intOrNull(months);
  if (y === null) errors.push({ field: "years", msg: "年齢（歳）を入れてください。1歳未満なら 0 と入れて、月を選んでください。" });
  else if (Number.isNaN(y)) errors.push({ field: "years", msg: "年齢は整数で入れてください（例：5）。" });
  else if (y < 0) errors.push({ field: "years", msg: "年齢にマイナスは入れられません。" });
  else if (y > LIMITS.petYears) errors.push({ field: "years", msg: `年齢は${LIMITS.petYears}歳までで入れてください。` });
  if (mo !== null && (Number.isNaN(mo) || mo < 0 || mo > 11)) errors.push({ field: "months", msg: "月は 0〜11 から選んでください。" });
  if (errors.length) return { ok: false, errors };
  return { ok: true, months: y * 12 + (mo ?? 0), exact: false, monthsKnown: mo !== null, errors };
}

export function readOwner({ method, birth, years }, base) {
  if (method === "none") return { ok: true, months: null, exact: false, errors: [] };
  if (method === "birth") {
    if (!String(birth ?? "").trim()) return { ok: false, errors: [{ field: "owner-birth", msg: "飼い主の生年月日を入れてください（比べないときは「入れない」を選んでください）。" }] };
    const b = parseYmd(birth);
    if (!b) return { ok: false, errors: [{ field: "owner-birth", msg: "飼い主の生年月日を正しく入れてください（例：1990-04-01）。" }] };
    if (cmpYmd(b, base) > 0) return { ok: false, errors: [{ field: "owner-birth", msg: "飼い主の生年月日が、計算する日より後になっています。" }] };
    const n = monthsBetween(b, base);
    if (n > LIMITS.ownerYears * 12) return { ok: false, errors: [{ field: "owner-birth", msg: `飼い主の年齢が${LIMITS.ownerYears}歳を超えています。生年月日を確かめてください。` }] };
    return { ok: true, months: n, exact: true, errors: [] };
  }
  const y = intOrNull(years);
  let msg = "";
  if (y === null) msg = "飼い主の年齢を入れてください（比べないときは「入れない」を選んでください）。";
  else if (Number.isNaN(y)) msg = "飼い主の年齢は整数で入れてください（例：35）。";
  else if (y < 0) msg = "飼い主の年齢にマイナスは入れられません。";
  else if (y > LIMITS.ownerYears) msg = `飼い主の年齢は${LIMITS.ownerYears}歳までで入れてください。`;
  if (msg) return { ok: false, errors: [{ field: "owner-years", msg }] };
  return { ok: true, months: y * 12, exact: false, errors: [] };
}

/* ---------- 換算 ---------- */
export const modelOf = (species, size) => (species === "cat" ? MODELS.cat : MODELS.dog[size] ?? null);

/** 人間の年齢（小数のまま）。資料の表がある範囲の外は null（外挿しない） */
export function humanAge(model, months) {
  if (!model || !Number.isFinite(months) || months < model.min || months > model.max) return null;
  const p = model.points;
  for (let i = 0; i < p.length - 1; i++) {
    const [m0, h0] = p[i];
    const [m1, h1] = p[i + 1];
    if (months >= m0 && months <= m1) return h0 + ((h1 - h0) * (months - m0)) / (m1 - m0);
  }
  return null;
}

/** その月齢が、資料の表にそのまま載っている値か */
export const isTablePoint = (model, months) => model.points.some(([m]) => m === months);

/** ライフステージ（資料で決められる範囲だけ。なければ null） */
export function stageOf(species, size, months) {
  const list = species === "cat" ? STAGES.cat.list : STAGES.dog[size];
  return list?.find((s) => months >= s.from && months < s.to) ?? null;
}

export function convert({ species, size, months }) {
  const model = modelOf(species, size);
  if (!model) return null;
  const human = humanAge(model, months);
  return {
    model,
    human,
    reason: human !== null ? null : months < model.min ? "under" : "over",
    stage: stageOf(species, size, months),
  };
}

/* ---------- 表示用の文字 ---------- */
/** 5歳3か月 / 0歳3か月 / 5歳（月がわからないとき） */
export function fmtAge(months, monthsKnown = true) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return monthsKnown ? `${y}歳${m}か月` : `${y}歳`;
}
/** 人間の年齢は整数に丸めて「約」を付ける（月齢の補間で小数が出ても、精密に見せない） */
export const fmtHuman = (h) => `約${Math.round(h)}歳`;
/** 月齢を「生後3か月」「1歳」のように（早見表・範囲の説明用） */
export const fmtPoint = (months) => (months < 12 ? `生後${months}か月` : months % 12 ? fmtAge(months) : `${months / 12}歳`);
export const rangeText = (model) => `${fmtPoint(model.min)}〜${fmtPoint(model.max)}`;

/* ---------- 家族と同い年になる頃 ----------
   未来では飼い主も年を取る：同じ時点 t（基準日から t か月後。負は過去）で
     f(t) = うちの子の人間換算年齢(ペットの月齢 + t) − 飼い主の年齢(飼い主の月齢 + t)
   を比べ、f の符号が変わるところ（交点）を探す。
   - 探す範囲：換算できる月齢（model.min〜max）の中だけ。過去は飼い主が生まれた時点まで
   - 交点が複数あるときは、今後でいちばん近いもの → なければ、いちばん最近の過去のもの
   - 月ごとに調べ、月のあいだは直線で補間する */
export function compareOwner(model, petMonths, ownerMonths) {
  const f = (t) => {
    const h = humanAge(model, petMonths + t);
    return h === null ? null : h - (ownerMonths + t) / 12;
  };
  const lo = Math.max(model.min - petMonths, -ownerMonths);
  const hi = model.max - petMonths;
  const nowHuman = humanAge(model, petMonths);
  const now = nowHuman === null ? null : { human: nowHuman, owner: ownerMonths / 12, diff: nowHuman - ownerMonths / 12 };

  if (lo > hi) return { now, cross: null, crossings: [], reason: hi < 0 ? "pet-over" : "no-range" };

  const ts = [lo];
  for (let t = Math.ceil(lo); t <= Math.floor(hi); t++) if (t > lo && t < hi) ts.push(t);
  if (hi > lo) ts.push(hi);

  const crossings = [];
  for (let i = 0; i < ts.length; i++) {
    const a = ts[i];
    const fa = f(a);
    if (fa === 0) { crossings.push(a); continue; }
    if (i === ts.length - 1) break;
    const b = ts[i + 1];
    const fb = f(b);
    if (fb !== 0 && Math.sign(fa) !== Math.sign(fb)) crossings.push(a + ((b - a) * -fa) / (fb - fa));
  }
  const uniq = crossings.filter((t, i) => i === 0 || Math.abs(t - crossings[i - 1]) > 1e-6);
  const future = uniq.filter((t) => t >= 0).sort((a, b) => a - b);
  const past = uniq.filter((t) => t < 0).sort((a, b) => b - a);
  const pick = future[0] ?? past[0] ?? null;

  let reason = null;
  if (pick === null) {
    const fLo = f(lo);
    const fHi = f(hi);
    if (fLo > 0 && fHi > 0) reason = -ownerMonths > model.min - petMonths ? "older-since-owner-birth" : "older-from-start";
    else if (fLo < 0 && fHi < 0) reason = hi < 0 ? "pet-over" : "younger-until-max";
    else reason = "no-range";
  }
  return {
    now,
    cross: pick === null ? null : { t: pick, past: pick < 0, petMonths: petMonths + pick, ownerMonths: ownerMonths + pick, human: humanAge(model, petMonths + pick) },
    crossings: uniq,
    reason,
    lo,
    hi,
  };
}

/** 交点までの期間の言い方。approx（誕生日がわからない入力がある）なら年単位 */
export function fmtSpan(t, approx) {
  const a = Math.abs(t);
  const dir = t < 0 ? "前" : "後";
  if (approx) {
    const y = Math.round(a / 12);
    return y === 0 ? (t < 0 ? "この1年ほどのあいだ" : "1年以内") : `約${y}年${dir}`;
  }
  const n = Math.round(a);
  if (n === 0) return "ちょうど今ごろ";
  const y = Math.floor(n / 12);
  const m = n % 12;
  return `約${y ? `${y}年` : ""}${m ? `${m}か月` : ""}${dir}`;
}
/** 交点の時期：2029年4月頃／2029年頃 */
export function fmtWhen(base, t, approx) {
  const { y, m } = addMonths(base, t);
  return approx ? `${y}年頃` : `${y}年${m}月頃`;
}

/* ---------- 早見表（ページの HTML と同じ値を使う） ---------- */
export function chartRows(kind) {
  const S = MODELS.dog.small, L = MODELS.dog.large, C = MODELS.cat;
  const cell = (model, m) => {
    const h = humanAge(model, m);
    return { human: h === null ? null : Math.round(h), table: h !== null && isTablePoint(model, m) };
  };
  return CHART[kind].map((m) => ({
    months: m,
    label: fmtPoint(m),
    ...(kind === "cat" ? { cat: cell(C, m), stage: stageOf("cat", null, m) } : {}),
    ...(kind === "dog" ? { small: cell(S, m), large: cell(L, m) } : {}),
    ...(kind === "mix" ? { cat: cell(C, m), small: cell(S, m), large: cell(L, m) } : {}),
  }));
}
