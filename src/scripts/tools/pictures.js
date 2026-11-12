/* ===========================================================
   カードに使う写真を受け取る（神経衰弱メーカー）
   - 何枚かまとめて受け取り、真ん中を正方形に切り抜いて小さくする（印刷しても軽く、画面でもすぐ出る）
   - 写真はブラウザの中だけで扱い、どこにも送らない。作った画像は blob: URL で持つ
   - 絵文字の絵柄（src/data/picture-sets.js）とあわせて、カードの中身は次の形でそろえる
       { kind: "img", src, name } ／ { kind: "emoji", t }
   =========================================================== */
import { $, esc, svg, showMsgs } from "./common.js";

const SIZE = 640;   // 切り抜いた正方形の1辺（印刷で 6cm 角くらいまできれいに出る）
const MAX_MB = 50;

/* 画像1枚 → 真ん中を正方形に切り抜いた JPEG（blob: URL） */
async function toSquare(file) {
  const url = URL.createObjectURL(file), img = new Image();
  try {
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const w = img.naturalWidth, h = img.naturalHeight, side = Math.min(w, h), out = Math.min(SIZE, side);
    const c = document.createElement("canvas");
    c.width = c.height = out;
    const cx = c.getContext("2d");
    cx.fillStyle = "#fff";
    cx.fillRect(0, 0, out, out); // 透明な PNG も白地にする
    cx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, out, out);
    const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.86));
    c.width = c.height = 0;
    if (!blob) throw new Error("toBlob");
    return URL.createObjectURL(blob);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* 写真の置き場所＋サムネイルの一覧。{ drop, input, list, msgs, max, onChange } */
export function pictureInput({ drop, input, list, msgs, max = 24, onChange }) {
  let items = [];
  let working = false;

  const draw = () => {
    list.innerHTML = items.map((it, i) => `<li class="pic-th"><img src="${esc(it.src)}" alt="${esc(it.name)}" /><button type="button" class="pic-del" data-i="${i}" aria-label="${esc(it.name)} を外す">${svg("x", 14)}</button></li>`).join("");
    list.hidden = !items.length;
    onChange?.(items);
  };

  async function add(files) {
    if (working) return;
    const notes = [];
    const imgs = [...files].filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(f.name));
    if (imgs.length < files.length) notes.push(["warn", "画像ではないファイルは飛ばしました。"]);
    const room = max - items.length;
    if (imgs.length > room) notes.push(["warn", room > 0 ? `使える写真は${max}枚までなので、はじめの${room}枚を入れました。` : `写真はもう${max}枚入っています。入れ替えるときは、写真の右上の×で外してください。`]);
    working = true;
    drop.setAttribute("aria-busy", "true");
    let failed = 0;
    for (const f of imgs.slice(0, Math.max(0, room))) {
      if (f.size === 0 || f.size > MAX_MB * 1048576) { failed++; continue; }
      try { items.push({ kind: "img", src: await toSquare(f), name: f.name }); draw(); } catch (e) { failed++; }
    }
    if (failed) notes.push(["warn", `${failed}枚の写真を開けませんでした。JPEG か PNG で保存し直すと使えます（iPhone の HEIC は、Chrome では開けないことがあります）。`]);
    working = false;
    drop.setAttribute("aria-busy", "false");
    showMsgs(msgs, notes);
    draw();
  }

  ["dragover", "drop"].forEach((t) => window.addEventListener(t, (e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); }));
  drop.addEventListener("dragenter", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", (e) => { if (!drop.contains(e.relatedTarget)) drop.classList.remove("over"); });
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); add(e.dataTransfer?.files || []); });
  input.addEventListener("change", () => { add(input.files || []); input.value = ""; });
  list.addEventListener("click", (e) => {
    const b = e.target.closest(".pic-del");
    if (!b) return;
    const [gone] = items.splice(Number(b.dataset.i), 1);
    if (gone) URL.revokeObjectURL(gone.src);
    showMsgs(msgs, []);
    draw();
  });

  return {
    get: () => items,
    clear() { items.forEach((it) => URL.revokeObjectURL(it.src)); items = []; showMsgs(msgs, []); draw(); },
  };
}

/* カードの中身を HTML にする（画面・印刷で共通）。文字は必ず esc を通す */
export function faceHTML(it) {
  if (!it) return "";
  if (it.kind === "img") return `<img class="face-img" src="${esc(it.src)}" alt="" />`;
  return `<span class="face-emoji">${esc(it.t)}</span>`;
}
