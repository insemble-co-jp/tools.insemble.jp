/* ===========================================================
   写真台帳メーカー — 並べ方・説明のまとめ入力・ファイル名・CSV（画面に依存しない部分）
   1枚の写真は次の形で持つ（写真そのものは src/scripts/tools/photo-ledger.js 側で扱う）
     { id, name, size, date: "YYYY-MM-DDTHH:MM:SS" | null, from: "exif" | "file", place: "", note: "" }
   =========================================================== */

export const MAX_PHOTOS = 300;
export const MAX_MB = 50;            // 1枚あたり
export const MAX_ZIP_MB = 500;       // 1つのZIPに入れる元の写真の合計。ZIP はブラウザのメモリーの中で組み立てるので、超えたら複数のZIPに分ける
export const MAX_TEXT = 100;         // 場所・説明の文字数

const pad = (n) => String(n).padStart(2, "0");

/* ファイルの更新日時（Exif がないときの代わり）→ ISO（その端末の時刻） */
export function fileIso(ms) {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/* 画面と台帳に出す日付："2026/11/18" と "09:30" */
export const dateText = (iso) => (iso ? iso.slice(0, 10).replace(/-/g, "/") : "");
export const timeText = (iso) => (iso ? iso.slice(11, 16) : "");

/* 並べ替え：撮影日時の古い順（同じ日時・日時なしはファイル名の順）／入れた順 */
const byName = (a, b) => a.name.localeCompare(b.name, "ja", { numeric: true });
export function sortItems(items, mode) {
  const list = [...items];
  if (mode === "date") list.sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : 0) || byName(a, b));
  else if (mode === "name") list.sort(byName);
  return list;
}

/* 説明のまとめ入力：1行に1枚。タブ（Excel・スプレッドシートからの貼り付け）があれば「場所・部位 → 説明」、なければ行全体が説明
   空の行も1枚ぶんとして数える（説明のない写真を飛ばせるように）。末尾の空行だけは捨てる */
export function parseNotes(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.map((line) => {
    const cols = line.split("\t").map((s) => s.trim());
    return cols.length >= 2 ? { place: clip(cols[0]), note: clip(cols.slice(1).join(" ")) } : { place: null, note: clip(cols[0]) };
  });
}
export const clip = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);

/* 名前を付け直す：001_20261118_1階廊下.jpg（場所が空なら 001_20261118.jpg、日時もなければ 001.jpg）
   ファイル名に使えない文字は除く。拡張子は元の写真のまま */
export function newName(item, no, digits = 3) {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(item.name)?.[1] || "jpg").toLowerCase();
  const day = item.date ? item.date.slice(0, 10).replace(/\D/g, "") : ""; // 数字だけ（日付以外の文字がファイル名に入らないように）
  const place = String(item.place || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, "").slice(0, 30);
  return [String(no).padStart(digits, "0"), day, place].filter(Boolean).join("_") + "." + ext;
}

/* 同じ名前ができたら (2) (3) を付ける */
export function uniqueNames(names) {
  const seen = new Map();
  return names.map((n) => {
    const k = n.toLowerCase(), c = seen.get(k) || 0;
    seen.set(k, c + 1);
    return c ? n.replace(/(\.[^.]+)$/, `(${c + 1})$1`) : n;
  });
}

/* CSV（Excel で開ける）：先頭に BOM。= + - @ で始まる値は数式として動かないように ' を付ける */
const cell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv(items, renamed) {
  const head = ["番号", "撮影日", "時刻", "場所・部位", "説明", "元のファイル名", "新しいファイル名", "日時の出どころ"];
  const rows = items.map((it, i) => [i + 1, dateText(it.date), timeText(it.date), it.place, it.note, it.name, renamed?.[i] ?? "", it.date ? (it.from === "exif" ? "写真の撮影日時" : "ファイルの日時") : "なし"]);
  return "﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/* 台帳のページ分け */
export function paginate(items, per) {
  const pages = [];
  for (let i = 0; i < items.length; i += per) pages.push(items.slice(i, i + per));
  return pages;
}

/* ZIP を分ける：順番を保ったまま、元の写真の大きさの合計が limit を超えないように区切る（1枚で limit を超えるときは、その1枚だけで1つ） */
export function splitBySize(list, limit) {
  const parts = [];
  let cur = [], sum = 0;
  for (const x of list) {
    const s = x.it.size || 0;
    if (cur.length && sum + s > limit) { parts.push(cur); cur = []; sum = 0; }
    cur.push(x);
    sum += s;
  }
  if (cur.length) parts.push(cur);
  return parts;
}
