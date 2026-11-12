# insemble tools（Astro + Tailwind）

`https://tools.insemble.jp/` に置く無料Webツール集です。「どうでもいいけど、毎回ちょっと面倒」を片づけるツールを置いています。

> **ツールを追加する・トップの一覧を直すときは、先に [制作ルール.md](制作ルール.md) を読んでください。** 手順・使う部品・やってはいけないこと・公開前のチェックをまとめています（Claude Code では `CLAUDE.md` から自動で読み込まれます）。

| URL | ページ | 中身 |
|---|---|---|
| `/` | ツールハブ | いま使えるツール（入力に合わせて絞り込み。URLを貼るとOGPチェッカーへのリンクを出す）、これから公開するツール（たたみ）、学ぶ、FAQ、運営会社 |
| `/ogp/` | OGPチェッカー | 上＝道具ゾーン（入力→点数→直すところ→プレビュー→コード）／下＝読みもの |
| `/pdf-extract/` | PDFばらし屋 | PDFから文字（全体・ページごと）・貼られた画像・ページ画像を取り出す。全部入りZIP |
| `/memory-game/` | 神経衰弱メーカー | 写真か絵文字の絵柄 → 画面で遊ぶ（ひとりで／みんなで2〜4人）／A4に6cm角×12枚で印刷（うら面も） |
| `/image-split/` | 画像ばらし屋 | 並べて撮った写真から区切りを見つけて、1つずつの画像に切り出す（すき間あり／敷き詰め）。クリックで区切りを直せる。番号付き・区切り線入りの全体図つきZIP |
| `/seat/` | 席順メーカー | 名前 → 卓の数・人数 → 座席表（長机／丸テーブル）。画像保存・コピー |
| `/schedule-excel/` | スケジュール→Excelメーカー | 予定を1行ずつ → 一覧表／進行表／担当別 → Excel（.xlsx）・CSV |
| `/deadline/` | あと何日？ | 締切の残り時間（日→時間→分で自動更新）＋今日やること。localStorage に保存、まとめて貼り付け（見出しの行があれば列名で担当・期限を読み分け。CSVファイルも読み込め、書き出したCSVを読み戻すと完了の印も戻る。同じ締切は二重に入れない）・タブ区切りコピー・関数入りCSV。締切に「誰の」（`who`）を付けて、すべて／自分／人ごとに絞り込める（お知らせ・ミニ・タブ名も絞り込みに従う）。PWA（`public/deadline/` の manifest・sw.js）でアプリとして置け、オフラインでも開ける。デザインの元データは Claude Design の「あと何日？」 |
| `/roulette/` | イベント用ルーレット | 名前 → 回す → 当たった人を外して次へ。結果の一覧・大きく表示 |
| `/group/` | グループ分けメーカー | 名前 → グループの数・人数 → 均等に分ける。部署ばらし・別にしたい組 |
| `/pet-age/` `/pet-age/dog/` `/pet-age/cat/` | うちの子、ヒトなら何歳？（ペット年齢換算） | 犬・猫の年齢 → 人間の年齢の目安・ライフステージ・飼い主と同い年になる頃 → 画像保存・共有文・Web Share。総合（犬猫の早見表）と、犬（体格別）・猫（月齢から）の3ページ。換算値と出典は `src/data/pet-age.js` だけに持つ |
| `/terms/` | 利用規約・プライバシーポリシー | 全ページのフッターからリンク |

ブログ・カテゴリページは**まだ入れていません**。リンクも置いていません。

カテゴリ（`src/data/hub.js` の `CATS`）：Web制作・SEO／ファイル・変換／決める・分ける／Excel・業務／くらし・計算／その他

---

## はじめかた

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # dist/ に書き出し
npm run preview
npm test         # 計算のテスト（＋ build 後なら dist/ の title・canonical・構造化データ・sitemap の検査）。外部ライブラリなし
npm run test:e2e # build 後に、Google Chrome でペット年齢換算を操作するテスト（playwright-core）
```

- Node 22.12 以上（`.nvmrc` は 24。nvm なら `nvm use`）
- `.env*` は git に入れていません。最初に `cp .env.example .env.development` で作ってください。
- 開発中は `.env.development` の `PUBLIC_OGP_MOCK=true` で、OGPチェッカーが**サンプルの結果**を返します（PHP不要）。本番は未設定（＝false）で、本物の `/api/ogp.php` を使います。
- PHPも手元で試す場合：`php -S localhost:8000 -t public` を起動し、`PUBLIC_OGP_MOCK=false` にします。`/api` は `astro.config.mjs` の proxy で 8000 番へ流れます。
- `npm run dev` / `npm run build` の前に、`scripts/copy-pdfjs.mjs` が pdf.js の付属データ（日本語の文字対応表など）を `public/pdfjs/` にコピーします（git には入れません）。`astro build` を直接呼ぶとコピーされないので、必ず `npm run build` で。

## Xserver への公開

1. サーバーパネルでサブドメイン `tools.insemble.jp` を追加し、無料SSLを有効にする
2. `npm run build`
3. `dist/` の**中身**をサブドメインの公開フォルダへアップロード（**毎回すべて**。CSS・JS のファイル名は中身が変わるたびに変わるので、HTML だけ上げるとデザインが外れる）
   - `dist/api/ogp.php`（OGPの取得）と `dist/.htaccess`、`dist/pdfjs/`（PDFばらし屋が使うデータ・約3.6MB）も一緒に上がります
4. PHP のバージョンは **8.0 以上**（cURL・DOM・mbstring は Xserver 標準で有効）
5. 公開後に確認
   - `https://tools.insemble.jp/ogp/` で自社サイトのURLをチェックできる
   - `https://tools.insemble.jp/ogp/#url=https://www.insemble.co.jp` を開くと、自動でチェックされる
   - `/pdf-extract/` でPDFを開いて「テキストを抽出」できる（開けないときは、`.mjs` と `.wasm` の種類の設定＝ `.htaccess` の `AddType` を確認）
   - `/sitemap.xml`（中身は `/sitemap-index.xml` と同じ）が出ている。Search Console にはどちらかを登録する

### 画像（入っています）
- 共有用の画像（OGP画像・1200×630）
  - `public/og-image.png`：共通（トップ・規約）
  - `public/og/<slug>.png`：ツールごと（`ToolPage.astro` が自動で指定する）
  - どちらも `npm run og` で書き出す（文言は `scripts/og/og.config.mjs`、見た目は `scripts/og/render.mjs`。Google Chrome とネット接続が必要。1枚だけなら `npm run og -- seat`）
  - `public/og/ogp.png`：OGPチェッカー用。これだけはデザインプロジェクトの「OGP画像.html」から作ったもの。文言を変えたらそちらで書き出し直す
- ツールの見本（ファイルを入れる前から、結果のイメージを見せる）
  - PDFばらし屋：`public/pdf-extract/sample.pdf`（架空のチラシ）と `sample-page-*.webp`・`sample-image-*.webp`（サムネイル）
  - 画像ばらし屋：`public/image-split/sample.webp`（並べて撮ったような見本。区切り線は SVG、番号は文字で重ね、1つずつの画像は同じ画像を背景にして切り抜いて見せる）
  - 数値と文字（区切りの位置・PDFから取り出した文字）は `src/data/samples.js`。手で直さない
  - どれも `npm run samples` で書き出す（`scripts/samples/render.mjs`。Google Chrome が必要。区切りはツールと同じ `lib/image-split.js`、文字は pdf.js で、できたファイルから本当に取り出す）。切り出しの処理を変えたら、書き出し直して見本とずれないようにする
  - 神経衰弱の見本の盤面は画像を使わず、`pages/memory-game/index.astro` で絵文字から組み立てる
  - 「この見本で試す」は `scripts/tools/common.js` の `sampleFile()` で見本を読み込み、選んだファイルと同じ流れに渡す
- `favicon.svg` ／ `favicon-32.png` ／ `favicon-48.png`（Google検索結果用）／ `apple-touch-icon.png`（180）／ `icon-192.png` ／ `icon-512.png` ／ `site.webmanifest`

### 公開前に用意するもの
- `src/data/hub.js` の `CHANGELOG`（公開日など）を実際の内容に。更新情報は `SHOW_UPDATES = false` で非表示中

---

## フォルダ構成

```
public/
  api/ogp.php          OGPの取得（PHP）。採点はしない
  .htaccess            https統一・末尾スラッシュ・キャッシュ
  favicon.svg / robots.txt
scripts/copy-pdfjs.mjs  pdf.js の付属データを public/pdfjs/ へ（predev / prebuild）
src/
  layouts/Base.astro   <head>（title/description/OGP/canonical/JSON-LD/フォント）
  layouts/ToolPage.astro 端末内ツールの共通の枠（道具ゾーン／使い方／こんなときに使えます／FAQ／関連ツール／概要／運営会社・JSON-LD）
  pages/index.astro    ツールハブ
  pages/ogp/index.astro OGPチェッカー
  pages/{pdf-extract,seat,schedule-excel,roulette,group,deadline}/index.astro  端末内のツール（ToolPage を使う）
  pages/404.astro
  components/
    Header / Footer / Corp / SectionHead / Icon / Faq / Scenes .astro   共通の部品（Scenes＝こんなときに使えます）
    ogp/Glossary.astro   用語集（本文は最初から HTML に出す）
    tools/NamesField / Stepper .astro   名前の欄（1行1人）・−／＋の数字欄
  scripts/
    site.js            ヘッダーの背景・ページ内リンクの位置合わせ
    copy.js            コピーボタン（Astro 側とブラウザ側の両方で使う）
    faq.js             よくある質問の開閉・カテゴリ
    hub.js             ハブの検索（入力で絞り込み・URLならツールへ）・お気に入り／最近使った
    ogp/page.js        OGPチェッカーの入力・最近のURL・用語集
    ogp/results.js     結果パネル（直すところ／プレビュー／タグ一覧／コード）・シェア
    tools/common.js    端末内ツールの共通（esc・コピー・ダウンロード・お知らせ・数字欄・画像の書き出し）
    tools/people.js    席順・グループ分けの共通（人数の連動・条件の読み取り）
    tools/pdf.js / seat.js / schedule.js / roulette.js / group.js  各ツールの動き
  data/
    pet-age.js         ★ペット年齢換算の換算モデル・ライフステージ・出典（数値はここだけに持つ）
    hub.js             ★ツールのカタログ（CATS / TOOLS / FAQ / TRUST / CHANGELOG）
    ogp.js             入門ガイド・用語集・FAQ・最終更新日（UPDATED）
    ogp-samples.js     開発用のサンプル結果（モックのときだけ読み込む）
    org.js             運営会社（JSON-LD の Organization）
  lib/
    ogp.js             API呼び出し＋採点ロジック（analyze）
    ogp-code.js        プレビューするサービス・フレームワーク別コード
    icons.js           アイコン（Astro と JS で共通）
    pet-age.js         ペット年齢換算の計算（換算・補間・ライフステージ・飼い主と同い年になる頃・早見表）。画面に依存しない
    zip.js             ZIPを作る（外部ライブラリなし。PDFの一括保存と .xlsx の中身に使う）
    xlsx.js            Excel（.xlsx）を作る（罫線・見出し・日付と時刻の書式・印刷設定）
    schedule-templates.js ★スケジュールの表の形（一覧表／進行表／担当別）。専用フォーマットはここに足す
    arrange.js         人を卓・グループに分ける（乱数・均等・条件＝同じにしない／同じにする／属性を散らす）
    pdf-extract.js     pdf.js でPDFを読む（PDFを選んだときに初めて読み込む）
  styles/
    global.css         Tailwind 読み込み＋デザイントークン（@theme）
    hub.css / ogp.css  各ページのCSS（デザインから移植）。ogp.css はツールページ共通の部品（ヘッダー・ボタン・読みもの）も持つ
    tools.css          端末内ツールの共通部品（パネル・入力欄・数字欄・お知らせ・ファイル置き場）
```

### ページの作り
React などのUIライブラリは使っていません。画面は `.astro` でHTMLとして書き出し（検索エンジンにも本文が見える）、動きは `src/scripts/` の素の JS です。
- JS は `<script>` で読み込むので、Astro が1つにまとめて `type="module"`（defer 扱い）で出します。
- 結果パネルなど、あとから中身が変わる部分は HTML を文字列で組み立てて差し込みます。**チェックしたページから来た値は必ず `esc()` を通す**こと。

### CSS の方針
- `global.css` … Tailwind と**デザイントークン**。`bg-paper` `text-primary-ink` `font-display` `rounded-lg` `p-g-md` などが使えます。
- `hub.css` / `ogp.css` … デザインのCSSをそのまま移植したもの。**@layer に入れていないので、Tailwind のユーティリティより強い**です。同じ要素にユーティリティを当てても効かないときは、ページCSS側のルールを消すか書き換えてください。
- 新しく作るもの（ツールページなど）は Tailwind のユーティリティで書き、整理のタイミングで少しずつページCSSを置き換えていく想定です。
- ただし ogp.css / hub.css の `*{margin:0;padding:0}` が @layer の外にあるため、**いまは Tailwind の余白ユーティリティ（`p-4` `mt-2` など）が効きません**。端末内ツールは `tools.css` と各ページの `<style is:global>` に、トークン（`var(--g-sm)` など）を使った素の CSS で書いています（JS で差し込む HTML にも効くよう is:global）。ページCSSを @layer に入れる整理をしたら、ユーティリティへ移せます。

---

## OGPチェッカーの流れ

```
入力 → scripts/ogp/page.js submit()
     → lib/ogp.js checkUrl(url)
         → POST /api/ogp.php（本文に url）… <head> を取得して meta / title / canonical を返す
         → analyze()                 … 点数・タグ一覧・直すところ（修正コード付き）を作る
     → scripts/ogp/results.js renderResults() で表示
```

- **ogp.php の安全対策**：http/https のみ・ポートは 80/443 のみ、プライベートIP・予約IPへの接続を拒否（PHP 8.2 以上は `FILTER_FLAG_GLOBAL_RANGE`、DNSの結果を固定して接続）、リダイレクトは1回ごとに検証（最大5回）、`</head>` か 2MB で読み込みを打ち切り、返すメタタグは og:* / twitter:* / description の60件まで、1IPあたり1分20回まで（IPv6 は /64 単位）。
- 入力URLと結果は**保存しません**。レート制限用に、IPから秘密の鍵で作ったハッシュ（元のIPには戻せない）と回数だけを、公開フォルダの外の `.ogp-rl/` に置き、2分たったものは次のアクセスで消します（作れない環境では一時フォルダ）。
- **フレームワーク別コード**（`lib/ogp-code.js`）は、取得した値を JS の文字列なら `q()`、HTML・JSX の属性なら `a()` を通して埋め込む。利用者がそのまま貼るコードなので、テンプレートを足すときも必ず通す。
- **計測タグ（Google アナリティクス・Microsoft Clarity）**は `src/layouts/Base.astro` の `<head>` に直接書いてある（本番ビルドだけ）。
  - GA は、チェックしたURL（`#url=` / `?url=`）だけを外して送る。`utm_` などの計測用の値は残す。
  - Clarity の録画では、入力欄・最近チェックしたURL・結果パネル・ハブの候補を `data-clarity-mask` で伏せ字にしている。`#url=` で受け取ったURLは、読み取ったらアドレスバーから外す。
  - CSP はこのタグの中身をハッシュ値で許可している。タグを変えるとずれるが、CSP は Report-Only なので警告が出るだけで壊れない。直すときは `npm run build` のあとに下を実行し、出た値で `.htaccess` の `'sha256-…'` を置き換える。
    `node -e 'const h=require("fs").readFileSync("dist/index.html","utf8");const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)];for(const x of m)console.log("sha256-"+require("crypto").createHash("sha256").update(x[1]).digest("base64"))'`
- **セキュリティヘッダー**は `public/.htaccess`。CSP は `Report-Only`（止めずに警告を出すだけ）のまま据え置く。表示のエスケープ（`esc()`）を主な守りにしていて、CSP は保険。本番（`Content-Security-Policy`）に切り替えると、タグを変えるたびにハッシュ値の付け直しが必須になるので、切り替えない。HSTS は 1日から始めているので、問題がなければ1年に延ばす。
- 点数のルールは `analyze()` にまとまっています。重み（減点）を変えるならここ。
- 最近チェックしたURLは `localStorage`（`ogp.recent`）にだけ保存。
- `#url=` 付きで開くと自動でチェックします（ハブの入力欄・シェア用リンクもこの形）。`#` から後ろはサーバーに送られないので、アクセスログにURLが残りません。API も POST で受けます。前に配った `?url=` のリンクも開けます。
- ID・パスワード入りのURL（`https://id:pass@…`）は、履歴やシェア用リンクに残らないよう、送る前に止めます。

## 端末内のツール（PDF・画像・席順・Excel・ルーレット・グループ分け）
- どれも**ブラウザの中だけで処理**し、入れたものをサーバーに送りません。サーバーAPI・DBは増やしていません。
- 画面の枠は `ToolPage.astro`。道具ゾーンは `data-clarity-mask` で Clarity の録画から伏せ字。
- **PDFばらし屋**：pdf.js（`pdfjs-dist` の legacy 版）を、PDFを選んだときに動的 import（ページを開いただけでは約490KB＋worker を読まない）。取り出した画像は PNG。ZIP の中身は `text/all.txt`・`text/01.txt…`・`images/page-01-image-01.png…`・`pages/page-01.png…`。パスワード付きPDFはパスワード入力で開ける。
- **神経衰弱**：写真は `scripts/tools/pictures.js` で真ん中を正方形（640px の JPEG）に切り抜いて blob: URL で持つ。写真がなくても遊べる絵文字の絵柄は `data/picture-sets.js`（古い端末でも出る絵文字だけ）。印刷は `scripts/tools/print.js`：`#print-root` に中身を入れて `window.print()`、`tools.css` の `@media print` で `html.is-printing` のときだけほかを隠す（PDF のライブラリなし。印刷画面の「PDFに保存」で PDF になる）。カテゴリ「あそぶ（play）」を足した。
- **画像ばらし屋**：AI・外部ライブラリなし。処理は `lib/image-split.js`（DOM を使わないので Node でも試せる）。並べ方は2つで、ふちが1色で背景だけの行・列があれば「すき間あり」（背景色の行・列＝すき間の中央で区切り、切り出したあと余白を詰める）、それ以外は「敷き詰め」（行・列ごとの色の変わり具合の中央値から、飛び出たところを区切りにする）。解析は長い辺 2400px に自前の三角フィルタで縮めて行う（ブラウザの drawImage で大きく縮めると細い目地がつぶれ、検出数が3割落ちたため）。約1600万画素を超える画像だけ、先にブラウザで縮める（iPhone の canvas 上限）。切り出しは原寸。ZIP は `<名前>_01-02.png…`・`_番号付き.jpg`・`_区切り線.jpg`・`_位置.json`。
- **スケジュール→Excel**：入力途中の内容だけ `localStorage`（`schedule.draft`）に一時保存（規約に明記済み。リセットで消える）。表の形は `schedule-templates.js` の `TEMPLATES` に1件足せば画面にも出る（`build()` が sheet model を返す。書き方は `xlsx.js` の冒頭）。プレビューも同じ sheet model から描くので、画面とExcelがずれない。
- **席順・グループ分け・ルーレット**：振り分けは `arrange.js`。条件は `COST` に関数を1つ足せば増やせる（前回と同じ組を避ける・男女比など）。名前の欄は「名前,部署」も読む（グループ分けで部署をばらけさせる）。
- CSV は先頭に BOM（Excel で文字化けしない）。`=` `+` `-` `@` で始まる値は先頭に `'` を付けて、数式として動かないようにしている。
- CSP（Report-Only）に、pdf.js 用の `'wasm-unsafe-eval'`・`font-src data:`・`img-src blob:` を足してある。

## ペット年齢換算（/pet-age/）
- **数値は `src/data/pet-age.js` だけに持つ。** 計算（`lib/pet-age.js`）、早見表（`components/pet-age/ChartTable.astro`）、ページ本文の数字、ブラウザの計算は、すべてここから作る。本文に数字を直接書かない。
- 換算モデル：犬は環境省「飼い主のためのペットフード・ガイドライン」p.9 の目安（小〜中型犬・大型犬の2区分。体重の境目は資料にないので決めていない）。猫は FelineVMA「Feline Life Stages」の表。表のあいだは月ごとに直線で補間し、表の範囲の外（犬の1歳未満、小〜中型犬20歳超、大型犬15歳超、猫の生後1か月未満・25歳超）は換算しない。
- ライフステージは換算と別に持つ（猫：2021 AAHA/AAFP、犬：環境省の区分）。
- 飼い主と同い年になる頃：同じ時点の「ペットの換算年齢」と「飼い主の実年齢」の差の符号が変わるところを、表の範囲の中で月ごとに探す（飼い主も年を取る）。
- 入力はどこにも送らず、保存もしない。`<form method="dialog">` で、入力欄に name を付けない（ラジオだけ）ので、JS が動かなくても URL やサーバーに入力が出ない。共有画像は canvas で端末内で作り、生年月日は入れない。
- 下層ページは `ToolPage` の `path`・`name`・`crumbs` で作る（パンくずと構造化データも3段になる）。OGP画像は3ページ共通で `/og/pet-age.png`。
- 資料を見直したら、`CHECKED`（参照日）と `UPDATED`（内容の更新日）を直す。`UPDATED` は毎日自動で新しくしない。

## ツールを追加するとき
[制作ルール.md](制作ルール.md) にまとめています（カタログへの追加・ページの作り方・共通部品・公開前のチェック）。

## あとでやること
- microCMS 連携（ブログ・お知らせ）
- ブログページの追加と、フッター・ヘッダーへのリンク
- 席順・グループ分けの条件の追加（前回と同じ組を避ける・男女比）。`arrange.js` の `COST` に足す
- ogp.css の共通部分を分けて @layer に入れる（ツールページが OGP 固有のCSSまで読んでいるのを解消し、Tailwind のユーティリティを使えるようにする）
- カテゴリページ（`/category/meta/` など）
- 見出しフォントのサブセット化（使う文字だけのフォントを自前配信して `<link rel="preload">`）
