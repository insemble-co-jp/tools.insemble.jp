/* ===========================================================
   ツールハブ — カタログデータ
   status: "live"(公開中) | "soon"(作っている途中。画面のどこにも出さない)
     ここはトップの JS にも丸ごと入るので、作る予定の候補は書かない。候補と、何を作るかの方針は ネタ帳.md へ
     （2026-11-18 に「これから公開するツール」をやめ、そこに出していた26件を ネタ帳.md に移した）
   url: true = URLを入力して使う（URL提案の対象／サーバー経由で取得）
   それ以外は端末内（ブラウザ内）で処理する
   kw: 一覧の絞り込み・ハブの検索で拾うことば（画面には出さない）
   hot: ハブの「いま使えるツール」の並び順（小さいほど先。3つずつで1段）
   rel: ツールページの「関連ツール」で先に出す slug（一緒に使う場面が多い順。残りは同じカテゴリ → ほか）
   kind: 名前だけでは何の道具か分からないツールに、フッターなどで名前の横に添える一言（例：あと何日？（締切カウントダウン＋ToDo））
   =========================================================== */
const HUB = (function () {
  const CATS = [
    { id: "web", label: "Web制作・SEO", note: "公開前の点検と、シェアされたときの見え方" },
    { id: "file", label: "ファイル・画像", note: "PDFや写真から、使える素材を取り出す" },
    { id: "decide", label: "イベント・幹事", note: "席・順番・チームを、もめずに決める" },
    { id: "play", label: "遊び・教材", note: "写真や絵で、手作りのゲームを" },
    { id: "office", label: "仕事の段取り", note: "締切とスケジュールを、見える形にする" },
  ];

  /** @type {{ slug: string, name: string, desc: string, cat: string, icon: string, status: "live" | "soon", url?: boolean, hot?: number, uses?: number, added?: string, isNew?: boolean, kw?: string, rel?: string[], kind?: string }[]} */
  const TOOLS = [
    { slug: "ogp", name: "OGPチェッカー", desc: "URLを貼ると、SNSでの見え方を採点してプレビュー。足りないタグは、直したコードをそのまま出せる。", cat: "web", icon: "share", status: "live", url: true, hot: 8, uses: 12480, added: "2026-06-12", kw: "sns シェア x twitter facebook line メタタグ seo ogp画像 ogp確認 公開前 リニューアル", rel: ["pdf-extract", "image-split", "schedule-excel"] },

    { slug: "pdf-extract", name: "PDFばらし屋", kind: "文字・画像の取り出し", desc: "PDFを入れると、文字・画像・ページ画像をまとめて取り出せる。全部入りのZIPも1クリックで保存。", cat: "file", icon: "pdf", status: "live", hot: 6, added: "2026-09-30", isNew: true, kw: "変換 pdf テキスト 抽出 画像 変換 png jpeg zip 文字起こし カタログ パンフレット 素材", rel: ["image-split", "schedule-excel", "ogp"] },
    { slug: "image-split", name: "画像ばらし屋", kind: "並べたものを1枚ずつ切り出し", desc: "並べて撮った写真を入れると、1つずつの画像に切り出す。番号付きの全体図と一緒にZIPで保存。", cat: "file", icon: "split", status: "live", hot: 9, added: "2026-10-26", isNew: true, kw: "画像 分割 切り出し 切り抜き トリミング 一括 まとめ撮り 商品写真 名刺 スキャン アイコン スプライト タイル フローリング 床材 グリッド split crop", rel: ["photo-ledger", "pdf-extract"] },
    { slug: "photo-ledger", name: "写真台帳メーカー", kind: "工事・点検写真の台帳", desc: "写真を入れると、撮影日時の順に並べてA4の写真台帳にする。印刷・PDF保存、名前をそろえたZIPも。", cat: "file", icon: "ledger", status: "live", hot: 5, added: "2026-11-18", isNew: true, kw: "写真台帳 工事写真 工事写真台帳 施工写真 現場写真 写真帳 点検 報告書 写真 整理 日付順 撮影日 exif 印刷 pdf excel リネーム ファイル名 一括 物件 原状回復 before after", rel: ["image-split", "schedule-excel", "pdf-extract"] },

    { slug: "seat", name: "席順メーカー", desc: "参加者の名前を入れると、卓ごとの座席表ができる。画像で保存したり、文字でコピーしたりして配れる。", cat: "decide", icon: "seat", status: "live", hot: 2, added: "2026-09-30", isNew: true, kw: "決める 席替え 席決め 飲み会 宴会 懇親会 忘年会 新年会 歓迎会 送別会 座席表 テーブル 幹事", rel: ["group", "roulette"] },
    { slug: "roulette", name: "イベント用ルーレット", desc: "名前を入れて回すと、1人をランダムに選ぶ。当たった人は自動で外れるので、順番決めや抽選に使える。", cat: "decide", icon: "wheel", status: "live", hot: 3, added: "2026-09-30", isNew: true, kw: "決める 抽選 くじ 順番 当番 発表者 司会 景品 ランダム ビンゴ 忘年会 役員決め", rel: ["seat", "group"] },
    { slug: "group", name: "グループ分けメーカー", desc: "名前を入れると、人数をそろえてグループに分ける。リーダーの固定や、一緒にしない組み合わせも指定できる。", cat: "decide", icon: "users", status: "live", hot: 4, added: "2026-09-30", isNew: true, kw: "分ける 決める チーム分け 班分け 研修 ワークショップ 学校 ランダム 組み分け グループディスカッション gd 面接官 ファシリテーター リーダー 男女 グループワーク 新人研修", rel: ["seat", "roulette"] },

    { slug: "memory-game", name: "神経衰弱メーカー", kind: "写真でつくるカードゲーム", desc: "写真や絵を選ぶと、神経衰弱がその場で遊べる。印刷して、手作りのカードにもできる。", cat: "play", icon: "cards", status: "live", hot: 10, added: "2026-10-26", isNew: true, kw: "神経衰弱 メモリーゲーム 絵合わせ カード 手作り 自作 印刷 写真 子ども 知育 保育園 幼稚園 家族 おうち遊び トランプ", rel: ["roulette"] },

    { slug: "schedule-excel", name: "スケジュール→Excelメーカー", desc: "予定を入れると、そのまま配れるExcelの予定表ができる。進行表や担当別の形でも書き出せる。", cat: "office", icon: "sheet", status: "live", hot: 7, added: "2026-09-30", isNew: true, kw: "エクセル excel 業務 段取り xlsx csv 予定表 進行表 タイムテーブル 工程表 スケジュール表 日程表 研修 撮影 イベント", rel: ["pdf-extract"] },

    { slug: "deadline", name: "あと何日？", kind: "締切カウントダウン＋ToDo", desc: "締切を入れると、残り時間を数え続ける。近づくと色で知らせ、画面の隅にも置いておける。", cat: "office", icon: "timer", status: "live", hot: 1, added: "2026-10-08", isNew: true, kw: "締切 期限 業務 段取り カウントダウン 残り日数 残り時間 タイマー todo やること リマインダー 付箋 notion excel アプリ pwa デスクトップ 常駐 ホーム画面", rel: ["schedule-excel"] },

  ];

  /* 学ぶ：各ツールのページにある解説（実務のヒント #guide・用語集・表示トラブル）への入口。トップで、ツールのカテゴリごとにまとめて出す
     - tool：どのツールのページの解説か（カテゴリと、行に添えるツール名に使う。公開中のツールだけ出る）
     - title：ページの見出しとそろえる。desc：2本の解説の要点を1文で（ページにないことは書かない）
     ツールに「実務のヒント」を足したら、ここにも1件足す */
  const LEARN = [
    { tool: "ogp", kind: "用語集", title: "OGPタグ辞典", desc: "og:title から twitter:card まで、意味と書き方を1語ずつ引ける。", href: "/ogp/#glossary" },
    { tool: "ogp", kind: "トラブル", title: "シェアの画像が出ない・古いままのときの切り分け", desc: "SNSで画像が出ない、直したのに変わらない、Teams・Slackでだけ出ないときに確かめること。", href: "/ogp/#trouble" },
    { tool: "photo-ledger", kind: "ガイド", title: "写真台帳を早く、見やすく作るコツ", desc: "撮る前にカメラの日時と撮る順番をそろえ、説明は「場所・部位」と「状態」を分けて書く。", href: "/photo-ledger/#guide" },
    { tool: "image-split", kind: "ガイド", title: "きれいに切り分けるための撮り方のコツ", desc: "並べて撮るときのすき間と背景の選び方と、切り分けた画像をWebに載せる前の確認。", href: "/image-split/#guide" },
    { tool: "seat", kind: "ガイド", title: "飲み会・懇親会の席決めのコツ", desc: "会場のテーブルを先に確かめ、上座・下座や、離したい人など配慮が必要な条件を整理しておく。", href: "/seat/#guide" },
    { tool: "group", kind: "ガイド", title: "研修・ワークショップの班分けのコツ", desc: "人数だけでなく所属のかたよりも確かめ、条件は研修の目的に合わせてしぼる。", href: "/group/#guide" },
    { tool: "roulette", kind: "ガイド", title: "抽選・順番決めをスムーズに進めるコツ", desc: "景品抽選の前にルールを3つだけ決め、決まった発表順や当番は記録に残しておく。", href: "/roulette/#guide" },
    { tool: "deadline", kind: "ガイド", title: "見落とさない締切管理のコツ", desc: "締切は「記録すること」と「気づくこと」を分け、行動が必要な日ごとに登録する。", href: "/deadline/#guide" },
    { tool: "schedule-excel", kind: "ガイド", title: "伝わる予定表・進行表の作り方", desc: "配る相手に合わせて表の形を選び、進行表には「すき間」と「担当」まで書いておく。", href: "/schedule-excel/#guide" },
    { tool: "memory-game", kind: "作り方", title: "手作り神経衰弱をうまく作るコツ", desc: "写真は「真ん中」と「似すぎない」で選び、印刷するなら紙と裏面を先に決める。", href: "/memory-game/#guide" },
  ];

  const TRUST = [
    { t: "すべて無料・登録不要", d: "会員登録もインストールも要りません。PC・スマホ・タブレットのブラウザで、開いてすぐに使えます。" },
    { t: "入れた内容を、運営者は保存しません", d: "名前やPDFを扱うツールは、お使いのブラウザの中だけで処理し、外部に送りません。URLを調べるツールも、入れたURLと結果を保存しません。" },
    { t: "使い方とよくある質問つき", d: "どのツールのページにも、下に使い方と、つまずきやすいところへの答えを載せています。" },
  ];

  /* 更新情報（公開・改善・修正を日付つきで） */
  const CHANGELOG = [
    { date: "2026/11/18", kind: "新規", text: "写真台帳メーカーを公開しました", tool: "photo-ledger" },
    { date: "2026/11/18", kind: "新規", text: "このサイトと運営者の紹介ページ「insemble tools について」を公開しました" },
    { date: "2026/11/12", kind: "改善", text: "あと何日？で、締切に「誰の」を付けて人ごとに絞り込めるようにし、CSVファイルも読み込めるようにしました", tool: "deadline" },
    { date: "2026/10/26", kind: "新規", text: "画像ばらし屋・神経衰弱メーカーを公開しました" },
    { date: "2026/10/08", kind: "新規", text: "あと何日？を公開しました", tool: "deadline" },
    { date: "2026/09/30", kind: "新規", text: "PDFばらし屋・席順メーカー・イベント用ルーレット・グループ分けメーカー・スケジュール→Excelメーカーを公開しました" },
    { date: "2026/09/10", kind: "改善", text: "OGPチェッカーで、LINE・Teams での見え方も確かめられるようにしました", tool: "ogp" },
    { date: "2026/09/02", kind: "改善", text: "OGPチェッカーで、Next.js・Astro 向けのコードも出せるようにしました", tool: "ogp" },
    { date: "2026/08/25", kind: "修正", text: "長いURLを入れるとプレビューが崩れる不具合を直しました", tool: "ogp" },
    { date: "2026/06/12", kind: "新規", text: "OGPチェッカーを公開しました", tool: "ogp" },
  ];

  /* ハブのよくある質問（FAQPage 構造化データの対象） */
  const FAQ = [
    { q: "insemble tools とは何ですか？", a: "北海道札幌市のWeb制作会社 株式会社インセンブルが運営する、無料のWebツール集です。席順・グループ分け・ルーレット・PDFや写真の取り出し・写真台帳づくり・予定表のExcel化・締切のカウントダウン・OGPの確認など、毎回ちょっと面倒な作業を、登録なしでブラウザだけで片づけられます。くわしくは「insemble tools について」のページをご覧ください。" },
    { q: "本当に無料ですか？", a: "はい。すべてのツールを、登録なしで無料で使えます。ふつうに使う範囲では、回数の制限もありません。" },
    { q: "入力したURLや文章、ファイルは保存されますか？", a: "運営者のサーバーには保存しません。PDFばらし屋や席順メーカーなど「端末内で処理」と書いてあるツールは、入れた名前やファイルを外部に送りません。OGPチェッカーのようにURLを調べるツールは、ページの情報を読み取るためにサーバーを経由しますが、入れたURLと結果は保存しません。あと何日？・スケジュール→Excelメーカー・写真台帳メーカーに入れた内容や、OGPチェッカーの「最近チェックしたURL」は、続きから使えるように、お使いのブラウザの中にだけ保存します。運営者には届きません。くわしくは、ページ下の「利用規約・プライバシーポリシー」をご覧ください。" },
    { q: "スマホでも使えますか？", a: "はい。スマートフォンやタブレットのブラウザでも、PCと同じように使えます。あと何日？は、ホーム画面に置いてアプリのように開くこともできます。" },
    { q: "仕事で使っても大丈夫ですか？", a: "はい、仕事でもお使いいただけます。結果はできるだけ正確になるようにつくっていますが、保証はしていません。社外に出す前や公開する前には、ご自身で最終確認をしてください。" },
    { q: "リンクや紹介は自由ですか？", a: "はい。どのページにも、連絡なしでリンクしていただけます。ブログや社内資料での紹介もご自由にどうぞ。" },
    { q: "欲しいツールがないときは？", a: "ページ下の「制作のご相談」から、運営会社のお問い合わせフォームでご要望をお送りください。いただいたご要望は、次につくるツールを決めるときの参考にします。" },
    { q: "自社用にカスタマイズしたツールはつくれますか？", a: "はい。運営会社のinsembleが、Web制作や業務に合わせた専用ツールの開発をお受けしています。ページ下の「制作のご相談」からお問い合わせください。" },
  ];

  /* トップ（/）の最終更新日。一覧・カテゴリ・学ぶ・FAQ など、トップの中身を変えたら更新する（サイトマップの lastmod に使う） */
  const UPDATED = "2026-11-18";

  /* 公開後、更新が出てきたら true に戻す（ハブの更新情報・ツールページの更新履歴） */
  const SHOW_UPDATES = false;

  /* 名前だけが並ぶところ（フッターなど）で使う表示名。kind があれば括弧で添える */
  const label = (t) => (t.kind ? `${t.name}（${t.kind}）` : t.name);

  return { CATS, TOOLS, LEARN, TRUST, CHANGELOG, FAQ, SHOW_UPDATES, UPDATED, label };
})();

export default HUB;
