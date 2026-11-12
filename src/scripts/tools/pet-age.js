/* ===========================================================
   うちの子、ヒトなら何歳？（/pet-age/・/pet-age/dog/・/pet-age/cat/）の動き
   - 計算は src/lib/pet-age.js、数値と出典は src/data/pet-age.js（ここに換算値を書かない）
   - 入力（名前・生年月日・飼い主の年齢）はどこにも送らず、保存もしない。URL にも入れない
   - 共有画像は canvas でこの端末の中で作る。生年月日は画像にも共有文にも入れない
   =========================================================== */
import { $, $$, esc, svg, showMsgs, copyText, download, flash, canvasToBlob, roundRect, fitText, FONT, INK, HUES, safeName, stamp, reveal } from "./common.js";
import { STAGES, SOURCES } from "../../data/pet-age.js";
import { jstToday, parseYmd, ymd, readPet, readOwner, convert, modelOf, humanAge, compareOwner, fmtAge, fmtHuman, fmtPoint, fmtSpan, fmtWhen } from "../../lib/pet-age.js";

const SITE = "https://tools.insemble.jp";
const root = $("[data-pa]");

if (root) {
  const form = $("#pa-form", root);
  const out = $("#pa-result", root);
  const live = $("#pa-live", root);
  const msgs = $("#pa-msgs", root);
  const emptyHtml = out.innerHTML;
  const baseInput = $("#pa-base", root);
  const pick = (g) => $(`input[name="pa-${g}"]:checked`, root)?.value ?? "";
  const v = (id) => $("#" + id, root)?.value ?? "";

  let last = null; // 直近の結果（共有で使う）
  let previewUrl = "";

  /* ---------- 計算する日（日本時間の今日を初期値に） ---------- */
  const setToday = () => { baseInput.value = ymd(jstToday()); syncBase(); };
  const fmtDate = (o) => `${o.y}年${o.m}月${o.d}日`;
  function syncBase() {
    const b = parseYmd(baseInput.value);
    const today = ymd(jstToday());
    $("#pa-base-label", root).textContent = b ? `${fmtDate(b)}${baseInput.value === today ? "（日本時間の今日）" : ""}` : "未入力";
    // 生年月日の欄で、計算する日より後を選びにくくする（検証は readPet でもする）
    for (const id of ["pa-birth", "pa-owner-birth"]) $("#" + id, root).max = b ? baseInput.value : "";
  }

  /* ---------- 選んだものに合わせて欄を出し分ける ---------- */
  function syncFields() {
    $("#pa-size-fs", root).hidden = pick("species") !== "dog";
    for (const el of $$("[data-when]", root)) {
      const [g, val] = el.dataset.when.split(":");
      el.hidden = pick(g) !== val;
    }
  }

  /* ---------- エラー表示（欄のそば＋まとめ） ---------- */
  const FIELD = { birth: "pa-birth", years: "pa-years", months: "pa-months", "owner-birth": "pa-owner-birth", "owner-years": "pa-owner-years", base: "pa-base" };
  function clearErrors() {
    for (const p of $$("[data-err]", root)) p.textContent = "";
    for (const id of Object.values(FIELD)) $("#" + id, root)?.removeAttribute("aria-invalid");
    showMsgs(msgs, []);
  }
  function showErrors(errors, focus) {
    for (const e of errors) {
      const p = $(`[data-err="${e.field}"]`, root);
      if (p) p.textContent = e.msg;
      $("#" + FIELD[e.field], root)?.setAttribute("aria-invalid", "true");
    }
    showMsgs(msgs, [["err", errors.length > 1 ? `入力を確かめてください（${errors.length}か所）。` : errors[0].msg]]);
    if (focus) {
      const first = errors.map((e) => $("#" + FIELD[e.field], root)).find(Boolean);
      if (first) {
        first.closest("details")?.setAttribute("open", "");
        first.focus();
      }
    }
  }

  /* ---------- 計算 ---------- */
  function run({ focus = false, announce = true } = {}) {
    clearErrors();
    const base = parseYmd(baseInput.value);
    if (!base) return fail([{ field: "base", msg: "計算する日を正しく入れてください。" }], focus);
    const species = pick("species");
    if (!species) {
      showMsgs(msgs, [["err", "犬か猫を選んでください。"]]);
      if (focus) $('input[name="pa-species"]', root)?.focus();
      return clearResult();
    }
    const size = species === "dog" ? pick("size") : null;
    const pet = readPet({ method: pick("method"), birth: v("pa-birth"), years: v("pa-years"), months: v("pa-months") }, base);
    const owner = readOwner({ method: pick("owner"), birth: v("pa-owner-birth"), years: v("pa-owner-years") }, base);
    const errors = [...(pet.errors ?? []), ...(owner.errors ?? [])];
    if (errors.length) return fail(errors, focus);

    const name = v("pa-name").trim().slice(0, 20);
    const conv = convert({ species, size, months: pet.months });
    const other = species === "dog" ? modelOf("dog", size === "small" ? "large" : "small") : null;
    const cmp = owner.months !== null ? compareOwner(conv.model, pet.months, owner.months) : null;
    last = { base, species, size, pet, owner, name, conv, other, cmp };
    render(last);
    if (announce) say(conv.human !== null ? `${who(name)}は${fmtAge(pet.months, pet.monthsKnown)}、人間なら${fmtHuman(conv.human)}の目安です。` : `${who(name)}は${fmtAge(pet.months, pet.monthsKnown)}です。この年齢は人間の年齢に換算していません。`);
    return true;
  }
  function fail(errors, focus) {
    showErrors(errors, focus);
    clearResult();
    return false;
  }
  function clearResult() {
    last = null;
    out.innerHTML = emptyHtml;
  }
  // 同じ文でも読み上げられるよう、いったん空にしてから入れる
  function say(text) {
    live.textContent = "";
    requestAnimationFrame(() => { live.textContent = text; });
  }

  const who = (name) => name || "うちの子";
  const kindLabel = (r) => (r.species === "cat" ? "猫" : `犬・${r.conv.model.label}`);

  /* ---------- 結果の表示 ---------- */
  function render(r) {
    const { conv, pet, name, base } = r;
    const m = conv.model;
    const src = SOURCES[m.source];
    const ageNote = pet.exact ? "生年月日から" : pet.monthsKnown ? "入力した年齢" : "入力した年齢（月はわからない）";
    let big;
    if (conv.human !== null) {
      big = `<p class="pa-big"><span class="pa-big-k">人間なら</span><b>${Math.round(conv.human)}</b><span class="pa-big-u">歳</span><span class="pa-big-k">くらい</span></p>`;
    } else if (conv.reason === "under") {
      const first = humanAge(m, m.min);
      big = `<p class="pa-out-range">${esc(fmtPoint(m.min))}未満は、資料の表に値がないため、人間の年齢には換算していません。${esc(fmtPoint(m.min))}で${esc(fmtHuman(first))}の目安です。</p>`;
    } else {
      big = `<p class="pa-out-range">資料の表は${esc(fmtPoint(m.max))}（人間なら${esc(fmtHuman(humanAge(m, m.max)))}）までのため、それより上の年齢は換算していません。表の外は根拠がないので、数字を延ばして出すことはしません。</p>`;
    }
    const otherH = r.other ? humanAge(r.other, pet.months) : null;
    const stageSet = r.species === "cat" ? STAGES.cat : STAGES.dog;
    const how =
      r.species === "cat"
        ? "FelineVMA（猫の獣医療の団体）の年齢表で計算しています。表の年齢のあいだは、月ごとに直線でならしています。"
        : `環境省の資料の目安（${m.label}：${m.formula}）で計算しています。${m.id === "small" ? `1〜2歳のあいだは、表の値（1歳＝${Math.round(humanAge(m, 12))}歳、2歳＝${Math.round(humanAge(m, 24))}歳）を月ごとに直線でならしています。` : ""}`;

    out.innerHTML = `
      <section class="pa-res pop-in" aria-labelledby="pa-r-h">
        <div class="out-head">
          <div>
            <h2 class="out-t" id="pa-r-h">${esc(who(name))}<span class="pa-tag">${esc(kindLabel(r))}</span></h2>
            <p class="out-d">${esc(fmtDate(base))}時点の計算</p>
          </div>
        </div>
        <dl class="pa-facts">
          <div><dt>実年齢</dt><dd><b>${esc(fmtAge(pet.months, pet.monthsKnown))}</b><small>（${esc(ageNote)}）</small></dd></div>
        </dl>
        ${big}
        <dl class="pa-facts">
          ${conv.stage ? `<div><dt>ライフステージ</dt><dd><b>${esc(conv.stage.label)}</b><small>${esc(stageSet.name)}：${esc(conv.stage.def)}。<a href="#stages">区分について</a></small></dd></div>` : ""}
          ${otherH !== null ? `<div><dt>${esc(r.other.label)}なら</dt><dd>${esc(fmtHuman(otherH))}<small>体格がはっきりしないときの参考に</small></dd></div>` : ""}
          <div><dt>換算のしかた</dt><dd><small class="pa-how">${esc(how)}<a href="#method">くわしく</a></small></dd></div>
        </dl>
        <p class="pa-note">${svg("info", 15)}<span>換算は目安です。健康状態や寿命を判定するものではありません。出典：${esc(src.org.replace(/（.*$/, ""))}「${esc(src.title)}」</span></p>
      </section>
      ${r.cmp ? famHtml(r) : ""}
      ${conv.human !== null ? shareHtml(r) : ""}`;

    if (conv.human !== null) bindShare();
    reveal($(".pa-res", out));
  }

  /* ---------- 家族と同い年になる頃 ---------- */
  function famHtml(r) {
    const { cmp, pet, owner, base, conv } = r;
    const m = conv.model;
    const nm = esc(who(r.name));
    const approx = !owner.exact || (!pet.exact && !pet.monthsKnown);
    const ownerNow = owner.exact ? fmtAge(owner.months) : `${owner.months / 12}歳`;
    let now = "";
    if (cmp.now) {
      const d = cmp.now.diff;
      const n = Math.round(Math.abs(d));
      now = Math.abs(d) < 0.5
        ? `いまは、${nm}（人間なら${esc(fmtHuman(cmp.now.human))}）とあなた（${esc(ownerNow)}）は、ほぼ同い年です。`
        : `いまは、${d > 0 ? `${nm}（人間なら${esc(fmtHuman(cmp.now.human))}）のほうが、あなた（${esc(ownerNow)}）より約${n}歳年上` : `あなた（${esc(ownerNow)}）のほうが、${nm}（人間なら${esc(fmtHuman(cmp.now.human))}）より約${n}歳年上`}です。`;
    } else {
      now = `いまの${nm}の年齢は換算の範囲外なので、いまの年の差は出していません。`;
    }

    let cross = "";
    const c = cmp.cross;
    if (c) {
      const when = esc(fmtWhen(base, c.t, approx));
      const span = esc(fmtSpan(c.t, approx));
      if (span === "ちょうど今ごろ") cross = `<b>ちょうど今ごろ</b>が、${nm}とあなたが同い年になる時期です。`;
      else if (c.past) cross = `<b>${when}</b>（${span}）に、同い年になりました。そのころ、あなたは約${Math.round(c.ownerMonths / 12)}歳、${nm}は${esc(fmtAge(Math.round(c.petMonths)))}でした。そこから先は、${nm}のほうが年上です。`;
      else cross = `<b>${when}</b>（${span}）に、同い年になりそうです。そのころ、あなたは約${Math.round(c.ownerMonths / 12)}歳、${nm}は${esc(fmtAge(Math.round(c.petMonths)))}です。そこから先は、${nm}のほうが年上になります。`;
    } else {
      const maxH = fmtHuman(humanAge(m, m.max));
      const R = {
        "older-from-start": `${nm}は、換算できるいちばん若い年齢（${esc(fmtPoint(m.min))}、人間なら${esc(fmtHuman(humanAge(m, m.min)))}）の時点で、すでにあなたより年上でした。そのため、同い年だった時期は計算できません。`,
        "older-since-owner-birth": `あなたが生まれたとき、${nm}はすでに人間なら${esc(fmtHuman(humanAge(m, pet.months - owner.months) ?? humanAge(m, m.max)))}くらいでした。同い年だった時期はありません。`,
        "younger-until-max": `資料の表は${esc(fmtPoint(m.max))}（人間なら${esc(maxH)}）までです。その時点でも、あなたのほうが年上の計算になるため、同い年になる頃は出していません。表の外は根拠がないので、延ばして計算しません。`,
        "pet-over": `${nm}の年齢が資料の表の範囲（${esc(fmtPoint(m.max))}まで）を超えていて、その範囲の中で同い年になった時期もないため、比べられません。`,
        "no-range": `資料の表の範囲の中で、${nm}とあなたを比べられる時期がないため、計算できません。`,
      };
      cross = R[cmp.reason] ?? R["no-range"];
    }

    const cond = [
      `同じ日の、${nm}の人間換算の年齢と、あなたの実際の年齢を比べています。未来も過去も、あなたは1年に1歳ずつ年を取る計算です。`,
      !pet.exact ? `${nm}は、計算する日にちょうど${esc(fmtAge(pet.months))}になったものとして計算しています。` : "",
      !owner.exact ? `あなたは、計算する日にちょうど${owner.months / 12}歳になったものとして計算しています。誕生日によって、最大で1年ほどずれます。` : "",
      approx ? "誕生日がわからない入力があるため、時期は年単位で表しています。" : "",
      "月ごとに比べ、月のあいだは直線でならしています。同い年になる時期が2回以上ある場合は、これから先でいちばん近い時期を、なければいちばん最近の時期を出します（この資料の換算は1年に4歳以上ずつ増えるので、実際には1回までです）。",
    ].filter(Boolean);

    return `
      <section class="pa-fam pop-in" aria-labelledby="pa-f-h">
        <h3 class="pa-h3" id="pa-f-h">${svg("users", 17)}家族と同い年になる頃</h3>
        <p class="pa-now">${now}</p>
        <p class="pa-cross">${cross}</p>
        <details class="pa-cond"><summary>${svg("chevron", 15)}どう計算しているか</summary><ul>${cond.map((x) => `<li>${x}</li>`).join("")}</ul></details>
        <p class="pa-note">${svg("info", 15)}<span>遊びとしての目安です。老化の進み方や寿命を予測するものではありません。</span></p>
      </section>`;
  }

  /* ---------- 共有 ---------- */
  function shareHtml(r) {
    return `
      <section class="pa-share pop-in" aria-labelledby="pa-s-h">
        <h3 class="pa-h3" id="pa-s-h">${svg("download", 17)}結果を残す・送る</h3>
        ${r.cmp ? `<label class="chk"><input type="checkbox" id="pa-incl" />飼い主との比較も入れる</label>` : ""}
        <img class="pa-prev" id="pa-prev" alt="" width="540" height="540" />
        <p class="pa-stext" id="pa-stext"></p>
        <div class="acts">
          <button type="button" class="btn btn-primary" id="pa-share" hidden>${svg("upload", 16)}共有する</button>
          <button type="button" class="btn btn-ghost" id="pa-save">${svg("download", 16)}画像で保存</button>
          <button type="button" class="btn btn-ghost" id="pa-copy">${svg("copy", 16)}共有文をコピー</button>
        </div>
        <div class="msgs" id="pa-share-msgs"></div>
        <p class="fld-hint">画像と共有文に、生年月日は入りません。画像はこの端末の中で作っていて、どこにも送っていません。</p>
      </section>`;
  }

  const incl = () => !!$("#pa-incl", out)?.checked;
  const pageUrl = (r) => `${SITE}/pet-age/${r.species}/`;

  function crossLine(r) {
    const c = r.cmp?.cross;
    if (!c) return "";
    const approx = !r.owner.exact || (!r.pet.exact && !r.pet.monthsKnown);
    const span = fmtSpan(c.t, approx);
    if (span === "ちょうど今ごろ") return "飼い主とちょうど同い年のころ";
    return c.past ? `飼い主と同い年になったのは${fmtWhen(r.base, c.t, approx)}` : `飼い主と同い年になるのは${fmtWhen(r.base, c.t, approx)}`;
  }

  function shareText(r) {
    const line = incl() ? crossLine(r) : "";
    return [
      `${who(r.name)}（${kindLabel(r)}）は${fmtAge(r.pet.months, r.pet.monthsKnown)}。人間なら${fmtHuman(r.conv.human)}の目安です。${line ? line + "。" : ""}`,
      "※換算は目安です",
      `うちの子、ヒトなら何歳？｜insemble tools ${pageUrl(r)}`,
    ].join("\n");
  }

  async function drawCard(r) {
    const W = 1080, H = 1080, P = 72;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    x.fillStyle = "#fff";
    x.fillRect(0, 0, W, H);
    // 上の帯（paper）と、色の点
    x.fillStyle = INK.paper;
    x.fillRect(0, 0, W, 190);
    [[930, 70, 14, 0], [980, 120, 9, 1], [890, 140, 7, 2], [1010, 60, 6, 3]].forEach(([cx, cy, rr, i]) => { x.fillStyle = HUES[i]; x.beginPath(); x.arc(cx, cy, rr, 0, Math.PI * 2); x.fill(); });
    x.textBaseline = "alphabetic";
    x.fillStyle = INK.primary;
    x.font = `800 40px ${FONT}`;
    x.fillText("うちの子、ヒトなら何歳？", P, 116);

    // 名前と種類
    x.fillStyle = INK.ink;
    x.font = `800 76px ${FONT}`;
    x.fillText(fitText(x, who(r.name), W - P * 2), P, 318);
    x.font = `700 38px ${FONT}`;
    x.fillStyle = INK.ink2;
    x.fillText(`${kindLabel(r)}　実年齢 ${fmtAge(r.pet.months, r.pet.monthsKnown)}`, P, 384);

    // 大きな数字
    x.fillStyle = INK.muted;
    x.font = `700 44px ${FONT}`;
    x.fillText("人間なら", P, 520);
    const n = String(Math.round(r.conv.human));
    x.fillStyle = INK.primary;
    x.font = `800 260px ${FONT}`;
    const nw = x.measureText(n).width;
    x.fillText(n, P - 6, 740);
    x.fillStyle = INK.ink;
    x.font = `800 84px ${FONT}`;
    x.fillText("歳くらい", P + nw + 12, 740);

    // 飼い主との比較（選んだときだけ）
    const line = incl() ? crossLine(r) : "";
    if (line) {
      x.strokeStyle = INK.line;
      x.lineWidth = 2;
      roundRect(x, P, 790, W - P * 2, 92, 20);
      x.stroke();
      x.fillStyle = INK.ink;
      x.font = `700 38px ${FONT}`;
      x.fillText(fitText(x, line, W - P * 2 - 56), P + 28, 850);
    }

    // 注記とサイト名
    x.fillStyle = INK.muted;
    x.font = `500 30px ${FONT}`;
    const src = SOURCES[r.conv.model.source];
    x.fillText(fitText(x, `※換算は目安です（${src.org.replace(/（.*$/, "")}の資料をもとに計算）`, W - P * 2), P, 950);
    x.fillStyle = INK.line;
    x.fillRect(P, 980, W - P * 2, 2);
    x.fillStyle = INK.ink;
    x.font = `800 32px ${FONT}`;
    x.fillText("insemble tools", P, 1034);
    x.fillStyle = INK.primary;
    x.font = `700 28px ${FONT}`;
    const u = pageUrl(r).replace(/^https:\/\//, "");
    x.fillText(u, W - P - x.measureText(u).width, 1034);
    return canvasToBlob(c);
  }

  async function refreshShare() {
    if (!last || last.conv.human === null) return;
    const blob = await drawCard(last);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    const img = $("#pa-prev", out);
    if (img) {
      img.src = previewUrl;
      img.alt = `共有用の画像のプレビュー：${shareText(last).split("\n")[0]}`;
    }
    const t = $("#pa-stext", out);
    if (t) t.textContent = shareText(last);
  }

  const fileName = (r) => `pet-age-${safeName(r.name, r.species)}-${stamp()}.png`;

  function bindShare() {
    const shareBtn = $("#pa-share", out);
    const box = $("#pa-share-msgs", out);
    // Web Share API があるときだけ「共有する」を出す（ないときは画像保存とコピーで代わりにする）
    if (navigator.share) shareBtn.hidden = false;
    $("#pa-incl", out)?.addEventListener("change", refreshShare);
    $("#pa-save", out).addEventListener("click", async (e) => {
      try {
        download(await drawCard(last), fileName(last));
        flash(e.currentTarget, "保存しました");
      } catch (err) {
        showMsgs(box, [["err", "画像を作れませんでした。共有文のコピーをお使いください。"]]);
      }
    });
    $("#pa-copy", out).addEventListener("click", (e) => copyText(shareText(last), e.currentTarget));
    shareBtn.addEventListener("click", async () => {
      showMsgs(box, []);
      const text = shareText(last);
      try {
        const file = new File([await drawCard(last)], fileName(last), { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text, title: "うちの子、ヒトなら何歳？" });
        else await navigator.share({ text, title: "うちの子、ヒトなら何歳？" });
      } catch (err) {
        if (err?.name === "AbortError") return; // 共有の画面を閉じただけ
        showMsgs(box, [["warn", "この端末では共有できませんでした。「画像で保存」と「共有文をコピー」をお使いください。"]]);
      }
    });
    refreshShare();
  }

  /* ---------- つなぎこみ ---------- */
  let timer = 0;
  const rerun = (opts) => { clearTimeout(timer); timer = setTimeout(() => { if (last || msgs.textContent) run(opts); }, 250); };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    run({ focus: true });
  });
  form.addEventListener("change", (e) => {
    if (e.target === baseInput) syncBase();
    syncFields();
    // 一度計算したあとは、選び直したらそのまま計算し直す
    rerun({ announce: e.target.type === "radio" });
  });
  form.addEventListener("input", (e) => {
    if (e.target.id === "pa-name") rerun({ announce: false });
  });
  $("#pa-reset", root).addEventListener("click", () => {
    form.reset();
    setToday();
    syncFields();
    clearErrors();
    clearResult();
    say("入力をリセットしました。");
  });

  setToday();
  syncFields();
}
