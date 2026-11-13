/* ===========================================================
   サイトマップの lastmod（各ページの最終更新日）
   画面の「最終更新」・JSON-LD の dateModified と同じ値を、ページのソースから集める（日付を二重に書かない）
   - ツールページ：<ToolPage updated="YYYY-MM-DD">
   - OGPチェッカー：src/data/ogp.js の UPDATED
   - 規約：src/pages/terms/index.astro の REVISED（最終更新日）
   - トップ：src/data/hub.js の UPDATED
   日付が見つからないページには lastmod を付けない（推測の日付は入れない）
   =========================================================== */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import HUB from "../src/data/hub.js";
import OGP from "../src/data/ogp.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** @param {URL} root リポジトリのいちばん上 @returns {Record<string, string>} パス（"/seat/"）→ "YYYY-MM-DD" */
export function lastmods(root) {
  const map = { "/": HUB.UPDATED, "/ogp/": OGP.UPDATED };
  const pages = new URL("src/pages/", root);
  for (const d of readdirSync(pages, { withFileTypes: true })) {
    const path = `/${d.name}/`;
    if (!d.isDirectory() || map[path]) continue;
    const file = new URL(`${d.name}/index.astro`, pages);
    if (!existsSync(file)) continue;
    const src = readFileSync(file, "utf8");
    const m = src.match(/\bupdated="(\d{4}-\d{2}-\d{2})"/) || src.match(/\bconst REVISED = "(\d{4}-\d{2}-\d{2})"/);
    if (m) map[path] = m[1];
  }
  return Object.fromEntries(Object.entries(map).filter(([, v]) => DATE.test(v ?? "")));
}
