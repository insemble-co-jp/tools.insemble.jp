/* ペット年齢換算の計算のテスト：npm test（node --test。外部ライブラリなし） */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MODELS, STAGES, CHART } from "../src/data/pet-age.js";
import {
  parseYmd, jstToday, monthsBetween, addMonths, readPet, readOwner, modelOf, humanAge, isTablePoint,
  stageOf, convert, fmtAge, fmtHuman, compareOwner, fmtSpan, fmtWhen, chartRows,
} from "../src/lib/pet-age.js";

const S = MODELS.dog.small, L = MODELS.dog.large, C = MODELS.cat;
const base = { y: 2026, m: 11, d: 12 };

/* ---------- 換算データ（出典の値と式） ---------- */
test("犬の表の値は、環境省の資料の式と一致する（整数の年齢すべて）", () => {
  for (let y = 2; y <= 20; y++) assert.equal(humanAge(S, y * 12), 24 + (y - 2) * 4, `小〜中型 ${y}歳`);
  for (let y = 1; y <= 15; y++) assert.equal(humanAge(L, y * 12), 12 + (y - 1) * 7, `大型 ${y}歳`);
  assert.equal(humanAge(S, 12), 15);
});

test("猫の表の値は、資料（FelineVMA）の値そのもの", () => {
  const src = { 1: 1, 3: 4, 6: 10, 12: 15, 24: 24, 36: 28, 48: 32, 72: 40, 84: 44, 120: 56, 180: 76, 240: 96, 252: 100, 300: 116 };
  for (const [m, h] of Object.entries(src)) assert.equal(humanAge(C, +m), h, `${m}か月`);
  // 表にない 5歳・22〜24歳は補間。International Cat Care・環境省の表の値と一致する
  assert.equal(humanAge(C, 60), 36);
  assert.equal(humanAge(C, 264), 104);
  assert.equal(humanAge(C, 288), 112);
  assert.equal(isTablePoint(C, 60), false);
  assert.equal(isTablePoint(C, 72), true);
});

test("表の点は月齢の昇順で、人間の年齢も増えていく（補間が成り立つ）", () => {
  for (const model of [S, L, C]) {
    for (let i = 1; i < model.points.length; i++) {
      assert.ok(model.points[i][0] > model.points[i - 1][0]);
      assert.ok(model.points[i][1] > model.points[i - 1][1]);
    }
    assert.equal(model.points[0][0], model.min);
    assert.equal(model.points.at(-1)[0], model.max);
  }
});

/* ---------- 補間・境界・範囲外 ---------- */
test("補間は区間の境目でつながっている（連続）", () => {
  for (const model of [S, L, C]) {
    for (const [m, h] of model.points) {
      if (m > model.min) assert.ok(Math.abs(humanAge(model, m - 1e-9) - h) < 1e-6);
      if (m < model.max) assert.ok(Math.abs(humanAge(model, m + 1e-9) - h) < 1e-6);
    }
  }
});

test("月齢は直線で補間する（小〜中型犬1歳6か月＝15と24の真ん中）", () => {
  assert.equal(humanAge(S, 18), 19.5);
  assert.equal(fmtHuman(humanAge(S, 18)), "約20歳");
  assert.equal(humanAge(C, 2), 2.5); // 1か月=1歳、3か月=4歳のあいだ
  assert.equal(humanAge(L, 18), 15.5);
});

test("資料の範囲の外は換算しない（外挿しない）", () => {
  assert.equal(humanAge(S, 11), null);
  assert.equal(humanAge(S, 241), null);
  assert.equal(humanAge(L, 181), null);
  assert.equal(humanAge(C, 0), null);
  assert.equal(humanAge(C, 301), null);
  assert.equal(convert({ species: "dog", size: "small", months: 6 }).reason, "under");
  assert.equal(convert({ species: "dog", size: "large", months: 16 * 12 }).reason, "over");
  assert.equal(convert({ species: "dog", size: "small", months: 16 * 12 }).reason, null);
  assert.equal(convert({ species: "cat", size: null, months: 0 }).reason, "under");
  // 範囲の端はちょうど換算できる
  assert.equal(humanAge(S, 240), 96);
  assert.equal(humanAge(L, 180), 110);
  assert.equal(humanAge(C, 300), 116);
});

test("0歳（生まれたばかり）は換算しないが、ライフステージは出る", () => {
  const c = convert({ species: "cat", size: null, months: 0 });
  assert.equal(c.human, null);
  assert.equal(c.stage.label, "子猫期");
  const d = convert({ species: "dog", size: "small", months: 0 });
  assert.equal(d.human, null);
  assert.equal(d.stage.label, "哺乳期・離乳期");
});

test("犬の体格を変えると換算が変わる", () => {
  assert.equal(convert({ species: "dog", size: "small", months: 120 }).human, 56);
  assert.equal(convert({ species: "dog", size: "large", months: 120 }).human, 75);
  assert.equal(modelOf("dog", "xx"), null);
  assert.equal(modelOf("cat", "large"), C); // 猫は体格を見ない
});

/* ---------- ライフステージ（換算と別管理） ---------- */
test("猫のライフステージの境目（2021 AAHA/AAFP）", () => {
  assert.equal(stageOf("cat", null, 11).label, "子猫期");
  assert.equal(stageOf("cat", null, 12).label, "若年期");
  assert.equal(stageOf("cat", null, 83).label, "若年期"); // 6歳11か月
  assert.equal(stageOf("cat", null, 84).label, "成熟期");
  assert.equal(stageOf("cat", null, 119).label, "成熟期");
  assert.equal(stageOf("cat", null, 120).label, "シニア期");
  assert.equal(stageOf("cat", null, 400).label, "シニア期");
});

test("犬のライフステージは体格で変わる（環境省の区分）", () => {
  assert.equal(stageOf("dog", "small", 11).label, "成長期の終わりごろ");
  assert.equal(stageOf("dog", "large", 11).label, "成長期");
  assert.equal(stageOf("dog", "large", 18).label, "成犬期");
  assert.equal(stageOf("dog", "small", 96).label, "中高齢期に入るころ");
  assert.equal(stageOf("dog", "small", 120).label, "中高齢期");
  assert.equal(stageOf("dog", "large", 72).label, "中高齢期に入るころ");
  assert.equal(stageOf("dog", "large", 84).label, "中高齢期");
});

test("ライフステージの区分にすきまや重なりがない", () => {
  for (const list of [STAGES.cat.list, STAGES.dog.small, STAGES.dog.large]) {
    assert.equal(list[0].from, 0);
    for (let i = 1; i < list.length; i++) assert.equal(list[i].from, list[i - 1].to);
    assert.equal(list.at(-1).to, Infinity);
  }
});

/* ---------- 日付 ---------- */
test("日付の読み取り：不正な日付・うるう日", () => {
  assert.deepEqual(parseYmd("2024-02-29"), { y: 2024, m: 2, d: 29 });
  assert.equal(parseYmd("2023-02-29"), null);
  assert.equal(parseYmd("2026-13-01"), null);
  assert.equal(parseYmd("2026-04-31"), null);
  assert.equal(parseYmd("2026/04/01"), null);
  assert.equal(parseYmd(""), null);
  assert.equal(parseYmd(undefined), null);
});

test("満の月数：月末・うるう日生まれ", () => {
  assert.equal(monthsBetween({ y: 2020, m: 4, d: 1 }, { y: 2026, m: 11, d: 12 }), 6 * 12 + 7);
  assert.equal(monthsBetween({ y: 2024, m: 1, d: 31 }, { y: 2024, m: 2, d: 28 }), 0);
  assert.equal(monthsBetween({ y: 2024, m: 1, d: 31 }, { y: 2024, m: 2, d: 29 }), 1);
  // 2月29日生まれ：平年は2月28日で1つ年を取る
  assert.equal(monthsBetween({ y: 2024, m: 2, d: 29 }, { y: 2025, m: 2, d: 27 }), 11);
  assert.equal(monthsBetween({ y: 2024, m: 2, d: 29 }, { y: 2025, m: 2, d: 28 }), 12);
  assert.equal(monthsBetween({ y: 2024, m: 2, d: 29 }, { y: 2028, m: 2, d: 28 }), 47); // うるう年は29日まで待つ
  assert.equal(monthsBetween({ y: 2024, m: 2, d: 29 }, { y: 2028, m: 2, d: 29 }), 48);
  // 誕生日の前日・当日
  assert.equal(monthsBetween({ y: 2021, m: 11, d: 12 }, { y: 2026, m: 11, d: 11 }), 59);
  assert.equal(monthsBetween({ y: 2021, m: 11, d: 12 }, { y: 2026, m: 11, d: 12 }), 60);
});

test("日本時間の今日：UTC の日付の境目", () => {
  // UTC 11/11 15:00 = 日本時間 11/12 0:00
  assert.deepEqual(jstToday(new Date("2026-11-11T15:00:00Z")), { y: 2026, m: 11, d: 12 });
  assert.deepEqual(jstToday(new Date("2026-11-11T14:59:59Z")), { y: 2026, m: 11, d: 11 });
  // 年またぎ
  assert.deepEqual(jstToday(new Date("2026-12-31T15:00:00Z")), { y: 2027, m: 1, d: 1 });
});

test("月の足し引き", () => {
  assert.deepEqual(addMonths(base, 2), { y: 2027, m: 1 });
  assert.deepEqual(addMonths(base, -11), { y: 2025, m: 12 });
  assert.deepEqual(addMonths(base, 0.4), { y: 2026, m: 11 });
});

/* ---------- 入力の検証 ---------- */
test("ペットの入力：空欄・未来日・不正な日付", () => {
  assert.equal(readPet({ method: "birth", birth: "" }, base).errors[0].field, "birth");
  assert.match(readPet({ method: "birth", birth: "2026-11-13" }, base).errors[0].msg, /後になっています/);
  assert.match(readPet({ method: "birth", birth: "2023-02-29" }, base).errors[0].msg, /正しく/);
  assert.equal(readPet({ method: "birth", birth: "2026-11-12" }, base).months, 0); // 今日生まれ
  assert.match(readPet({ method: "age", years: "" }, base).errors[0].msg, /入れてください/);
  assert.match(readPet({ method: "age", years: "-1" }, base).errors[0].msg, /マイナス/);
  assert.match(readPet({ method: "age", years: "2.5" }, base).errors[0].msg, /整数/);
  assert.match(readPet({ method: "age", years: "41" }, base).errors[0].msg, /40歳/);
  assert.match(readPet({ method: "age", years: "3", months: "12" }, base).errors[0].msg, /0〜11/);
  assert.match(readPet({ method: "birth", birth: "1900-01-01" }, base).errors[0].msg, /40歳/);
});

test("ペットの入力：年齢で入れる（月は省略できる・全角数字も読む）", () => {
  const a = readPet({ method: "age", years: "5", months: "" }, base);
  assert.deepEqual([a.ok, a.months, a.exact, a.monthsKnown], [true, 60, false, false]);
  const b = readPet({ method: "age", years: "０", months: "3" }, base);
  assert.deepEqual([b.ok, b.months, b.monthsKnown], [true, 3, true]);
});

test("年齢で入れた結果と、生年月日で入れた結果が一致する", () => {
  const byBirth = readPet({ method: "birth", birth: "2021-08-12" }, base); // ちょうど5歳3か月
  const byAge = readPet({ method: "age", years: "5", months: "3" }, base);
  assert.equal(byBirth.months, byAge.months);
  assert.equal(convert({ species: "dog", size: "small", months: byBirth.months }).human, convert({ species: "dog", size: "small", months: byAge.months }).human);
});

test("飼い主の入力", () => {
  assert.deepEqual(readOwner({ method: "none" }, base), { ok: true, months: null, exact: false, errors: [] });
  assert.equal(readOwner({ method: "age", years: "35" }, base).months, 420);
  assert.match(readOwner({ method: "age", years: "121" }, base).errors[0].msg, /120歳/);
  assert.match(readOwner({ method: "age", years: "" }, base).errors[0].msg, /入れない/);
  assert.match(readOwner({ method: "birth", birth: "2027-01-01" }, base).errors[0].msg, /後になっています/);
  assert.equal(readOwner({ method: "birth", birth: "1990-11-12" }, base).months, 36 * 12);
});

/* ---------- 家族と同い年になる頃（飼い主も年を取る） ---------- */
test("将来の交点：飼い主も年を取る前提で解く", () => {
  // 猫1歳（約15歳）と飼い主20歳。猫は1歳→2歳で9歳ぶん、そのあと1年に4歳ずつ。飼い主は1年に1歳
  const r = compareOwner(C, 12, 20 * 12);
  assert.ok(r.cross && !r.cross.past);
  // 交点では、猫の換算年齢と、そのときの飼い主の年齢がほぼ等しい
  assert.ok(Math.abs(r.cross.human - r.cross.ownerMonths / 12) < 1e-6);
  // 飼い主の加齢を入れずに「いまの20歳」と比べると、交点が早すぎる（禁止の実装との違い）
  const naive = C.points.find(([, h]) => h >= 20); // 20歳を超える最初の点
  assert.ok(r.cross.petMonths > 12 && r.cross.ownerMonths > 20 * 12);
  assert.ok(naive);
  // 1歳(15) → 2歳(24)：f = 15 + 9t/12 − (20 + t/12) = 0 → t = 7.5 か月
  assert.ok(Math.abs(r.cross.t - 7.5) < 1e-9);
});

test("過去の交点：すでに追い越した", () => {
  // 小〜中型犬10歳（56歳）と飼い主40歳 → 過去に同い年になっている
  const r = compareOwner(S, 120, 480);
  assert.equal(r.cross.past, true);
  assert.ok(r.now.diff > 0);
  // 2歳(24) から 1年4歳ずつ：24 + 4x = 32 + x（飼い主は8年前に32歳）→ x = 8/3 年後の時点
  assert.ok(Math.abs(r.cross.human - r.cross.ownerMonths / 12) < 1e-6);
});

test("交点なし：資料の範囲の最初からうちの子が年上", () => {
  // 飼い主5歳、猫3歳（28歳）。猫が生後1か月（1歳）のとき飼い主は2歳2か月 → 最初は飼い主が年上なので交点あり
  assert.ok(compareOwner(C, 36, 60).cross);
  // 飼い主0歳（今日生まれ）、犬3歳 → 飼い主が生まれた時点ですでに犬が年上
  const r = compareOwner(S, 36, 0);
  assert.equal(r.cross, null);
  assert.equal(r.reason, "older-since-owner-birth");
});

test("交点なし：資料の範囲の終わりまでうちの子が年下", () => {
  // 大型犬1歳（12歳）と飼い主100歳。大型犬15歳（110歳）のとき飼い主は114歳
  const r = compareOwner(L, 12, 1200);
  assert.equal(r.cross, null);
  assert.equal(r.reason, "younger-until-max");
});

test("いまは換算できない子犬でも、換算できる年齢になってからの交点を探す", () => {
  const r = compareOwner(S, 6, 18 * 12);
  assert.equal(r.now, null);
  assert.ok(r.cross && r.cross.petMonths >= 12);
});

test("資料の範囲を超えた子：過去の交点だけを示す", () => {
  const r = compareOwner(L, 16 * 12, 30 * 12);
  assert.equal(r.now, null);
  assert.ok(r.cross.past);
});

test("交点は多くても1つ（換算年齢は1年に4歳以上ずつ増える）→ 交点を全部数えても1つ", () => {
  for (const model of [S, L, C]) {
    for (let pet = model.min; pet <= model.max; pet += 7) {
      for (let owner = 0; owner <= 1200; owner += 37) assert.ok(compareOwner(model, pet, owner).crossings.length <= 1);
    }
  }
});

test("交点の時期の表し方：誕生日が不明なら年単位", () => {
  assert.equal(fmtWhen(base, 29.4, false), "2029年4月頃");
  assert.equal(fmtWhen(base, 29.4, true), "2029年頃");
  assert.equal(fmtSpan(29.4, false), "約2年5か月後");
  assert.equal(fmtSpan(29.4, true), "約2年後");
  assert.equal(fmtSpan(-14, false), "約1年2か月前");
  assert.equal(fmtSpan(4, true), "1年以内");
  assert.equal(fmtSpan(0.2, false), "ちょうど今ごろ");
});

/* ---------- 早見表 ---------- */
test("早見表の値は、計算結果と同じ", () => {
  for (const r of chartRows("dog")) {
    assert.equal(r.small.human, humanAge(S, r.months) === null ? null : Math.round(humanAge(S, r.months)));
    assert.equal(r.large.human, humanAge(L, r.months) === null ? null : Math.round(humanAge(L, r.months)));
  }
  for (const r of chartRows("cat")) {
    assert.equal(r.cat.human, Math.round(convert({ species: "cat", months: r.months }).human));
    assert.equal(r.stage.label, stageOf("cat", null, r.months).label);
  }
  // 大型犬の16歳以上は空（範囲外）
  assert.equal(chartRows("dog").find((r) => r.months === 192).large.human, null);
  assert.equal(chartRows("mix").length, CHART.mix.length);
});

test("表示：実年齢と「約」", () => {
  assert.equal(fmtAge(63), "5歳3か月");
  assert.equal(fmtAge(3), "0歳3か月");
  assert.equal(fmtAge(60, false), "5歳");
  assert.equal(fmtHuman(36.49), "約36歳");
});
