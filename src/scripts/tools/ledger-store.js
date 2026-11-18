/* ===========================================================
   写真台帳メーカーの途中保存（この端末のブラウザの IndexedDB にだけ保存する。サーバーには送らない）
   - photos：1枚ごとの入力（名前・撮影日時・場所・説明など）。入力が変わるたびに上書きする（軽い）
   - blobs ：1枚ごとの写真（元の写真・台帳用・一覧用）。入れたときに1回だけ書く（重い）
   - state ：並び順・表題・作成者・設定
   保存できない環境（プライベートブラウズ・容量不足など）では ok=false を返し、ツールはそのまま使える
   =========================================================== */
const DB = "insemble-photo-ledger";
const VERSION = 1;

let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      if (!("indexedDB" in window)) return rej(new Error("no indexedDB"));
      const r = indexedDB.open(DB, VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains("photos")) d.createObjectStore("photos", { keyPath: "id" });
        if (!d.objectStoreNames.contains("blobs")) d.createObjectStore("blobs", { keyPath: "id" });
        if (!d.objectStoreNames.contains("state")) d.createObjectStore("state");
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error("blocked"));
    });
    dbp.catch(() => { dbp = null; });
  }
  return dbp;
}

/* 1回の書き込み（全部書けたら resolve、容量不足などは reject） */
async function tx(stores, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(stores, "readwrite");
    fn(t);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error("abort"));
  });
}
const all = (store) => db().then((d) => new Promise((res, rej) => {
  const r = d.transaction(store).objectStore(store).getAll();
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
}));
const get = (store, key) => db().then((d) => new Promise((res, rej) => {
  const r = d.transaction(store).objectStore(store).get(key);
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
}));

/* 1枚の入力だけ（写真は含めない） */
export const META_KEYS = ["id", "name", "size", "date", "from", "place", "note", "w", "h"];
export const metaOf = (it) => Object.fromEntries(META_KEYS.map((k) => [k, it[k]]));

export const store = {
  /** 写真を入れたとき：入力と写真をまとめて書く */
  addPhotos: (list) => tx(["photos", "blobs"], (t) => {
    const p = t.objectStore("photos"), b = t.objectStore("blobs");
    for (const it of list) {
      p.put(metaOf(it));
      b.put({ id: it.id, file: it.file, big: it.bigBlob, mini: it.miniBlob });
    }
  }),
  /** 入力が変わったとき */
  putMeta: (list) => tx(["photos"], (t) => { const p = t.objectStore("photos"); list.forEach((it) => p.put(metaOf(it))); }),
  /** 写真を外したとき */
  remove: (id) => tx(["photos", "blobs"], (t) => { t.objectStore("photos").delete(id); t.objectStore("blobs").delete(id); }),
  /** 並び順・表題など */
  putState: (s) => tx(["state"], (t) => t.objectStore("state").put({ ...s, savedAt: Date.now() }, "s")),
  /** リセット：全部消す */
  clear: () => tx(["photos", "blobs", "state"], (t) => ["photos", "blobs", "state"].forEach((n) => t.objectStore(n).clear())),
  /** 開いたとき：前回の続きがあれば { state, photos: [{...入力, file, big, mini}] }、なければ null */
  async load() {
    const s = await get("state", "s");
    if (!s || !Array.isArray(s.ids) || !s.ids.length) return null;
    const [metas, blobs] = await Promise.all([all("photos"), all("blobs")]);
    const m = new Map(metas.map((x) => [x.id, x])), b = new Map(blobs.map((x) => [x.id, x]));
    const photos = s.ids.map((id) => (m.has(id) && b.has(id) ? { ...m.get(id), ...b.get(id) } : null)).filter(Boolean);
    return photos.length ? { state: s, photos } : null;
  },
};
