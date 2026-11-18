/* ===========================================================
   写真の撮影日時を読む（JPEG の Exif。外部ライブラリなし）
   - 写真の先頭にある Exif から、撮影日時（DateTimeOriginal）→ デジタル化の日時 → 更新日時 の順に探す
   - LINE やチャットで送られてきた写真、スクリーンショット、PNG などには入っていないことが多い。そのときは null
   - ファイル全体は読まない。Exif は先頭に入っているので、先頭の 256KB だけを渡せば足りる
   =========================================================== */

export const EXIF_BYTES = 256 * 1024;

const TAG = { exifIfd: 0x8769, dateTime: 0x0132, original: 0x9003, digitized: 0x9004 };

/**
 * @param {ArrayBuffer} buf 写真の先頭（EXIF_BYTES くらい）
 * @returns {string | null} "YYYY-MM-DDTHH:MM:SS"（時差なしの、撮った場所の時刻）
 */
export function exifDate(buf) {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null; // JPEG ではない
  let p = 2;
  while (p + 4 <= v.byteLength) {
    if (v.getUint8(p) !== 0xff) return null;
    const marker = v.getUint8(p + 1);
    if (marker === 0xda || marker === 0xd9) return null; // 画像の本体に入った＝Exif はなかった
    const len = v.getUint16(p + 2);
    if (marker === 0xe1 && p + 10 <= v.byteLength && v.getUint32(p + 4) === 0x45786966 && v.getUint16(p + 8) === 0) {
      return readTiff(v, p + 10, Math.min(v.byteLength, p + 2 + len));
    }
    p += 2 + len;
  }
  return null;
}

/* Exif の中身（TIFF の形）から日時を探す */
function readTiff(v, start, end) {
  if (start + 8 > end) return null;
  const order = v.getUint16(start);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const le = order === 0x4949;
  const u16 = (o) => (o + 2 <= end ? v.getUint16(o, le) : 0);
  const u32 = (o) => (o + 4 <= end ? v.getUint32(o, le) : 0);

  /* IFD（タグの並び）から、欲しいタグの値の位置を返す */
  const entries = (ifd) => {
    const at = start + ifd, n = u16(at), out = new Map();
    for (let i = 0; i < n && i < 512; i++) {
      const e = at + 2 + i * 12;
      if (e + 12 > end) break;
      out.set(u16(e), { type: u16(e + 2), count: u32(e + 4), value: e + 8 });
    }
    return out;
  };
  const ascii = (ent) => {
    if (!ent || ent.type !== 2 || ent.count < 19) return null;
    const o = ent.count > 4 ? start + u32(ent.value) : ent.value;
    if (o + 19 > end) return null;
    let s = "";
    for (let i = 0; i < 19; i++) s += String.fromCharCode(v.getUint8(o + i));
    return toIso(s);
  };

  const ifd0 = entries(u32(start + 4));
  const exifPtr = ifd0.get(TAG.exifIfd);
  const exif = exifPtr ? entries(u32(exifPtr.value)) : new Map();
  return ascii(exif.get(TAG.original)) || ascii(exif.get(TAG.digitized)) || ascii(ifd0.get(TAG.dateTime));
}

/* "2026:11:18 09:30:05" → "2026-11-18T09:30:05"。0000:00:00 などのありえない日時は null */
export function toIso(s) {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m.map(Number);
  if (y < 1990 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}
