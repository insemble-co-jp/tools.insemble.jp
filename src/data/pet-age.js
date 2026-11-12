/* ===========================================================
   ペット年齢換算（/pet-age/）の換算モデル・ライフステージ・出典
   ★計算（src/lib/pet-age.js）、早見表、ページ本文の数値は、すべてこのファイルから作る。
     ページやコンポーネントに数値を直接書かないこと。
   - 換算モデルとライフステージは別に持つ（換算値だけを理由に「シニア」などの区分を作らない）
   - 月齢は「満○か月」。points は [月齢, 人間の年齢] の組で、あいだは直線で補間する
   - min / max は資料の表がある範囲。ここを超える年齢は換算しない（外挿しない）
   - 出典の数値は、2026-11-12 に原典（PDF）を開いて確かめたもの。変えるときは原典を確かめ、CHECKED と UPDATED を直す
   =========================================================== */

/** 出典を参照（原典を開いて数値を確かめた）日 */
export const CHECKED = "2026-11-12";
/** ページの内容（数値・本文）を最後に更新した日。毎日自動で新しくしない */
export const UPDATED = "2026-11-12";

/* ---------- 出典 ---------- */
export const SOURCES = {
  env: {
    id: "env",
    org: "環境省（自然環境局 総務課 動物愛護管理室）",
    title: "飼い主のためのペットフード・ガイドライン ～犬・猫の健康を守るために～",
    part: "9ページ「ライフステージによる分類」「犬と人間、猫と人間の年齢の目安」",
    url: "https://www.env.go.jp/nature/dobutsu/aigo/2_data/pamph/petfood_guide_1808.html",
    pdf: "https://www.env.go.jp/nature/dobutsu/aigo/2_data/pamph/petfood_guide_1808/pdf/4.pdf",
    // 表紙の発行日は確認できていない。PDF のファイル情報の作成日が 2018年8月、掲載ページに 2018年12月6日・2021年5月21日の更新の記載（いずれも別ページの修正）
    date: "2018年8月版（PDFのファイル情報による。表紙の発行日は未確認）",
    use: "犬の換算（小〜中型犬・大型犬）と、犬のライフステージ。猫の値の確認",
    lang: "ja",
  },
  felinevma: {
    id: "felinevma",
    org: "FelineVMA（猫の獣医療の団体。資料は catvets.com で公開）",
    title: "Feline Life Stages",
    part: "猫の年齢と人の年齢の対応表、ライフステージ（2021 AAHA/AAFP Feline Life Stage Guidelines の区分）",
    url: "https://catvets.com/wp-content/uploads/2026/08/FelineVMA_Life-Stages.pdf",
    page: "https://catvets.com/life-stage",
    date: "公開日の記載なし（© 2026 FelineVMA）",
    use: "猫の換算と、猫のライフステージ",
    lang: "en",
  },
  aahaaafp: {
    id: "aahaaafp",
    org: "AAHA（米国動物病院協会）・AAFP（米国猫臨床医協会）",
    title: "2021 AAHA/AAFP Feline Life Stage Guidelines",
    part: "猫のライフステージの区分（Journal of Feline Medicine and Surgery 掲載、DOI 10.1177/1098612X21993657）",
    url: "https://catvets.com/life-stage",
    date: "2021年",
    use: "猫のライフステージの区分の元になった指針（区分は catvets.com の要約と FelineVMA の資料で確認）",
    lang: "en",
  },
  icc: {
    id: "icc",
    org: "International Cat Care（国際的な猫の福祉団体）",
    title: "How to tell your cat's age in human years",
    part: "猫の年齢と人の年齢の表",
    url: "https://icatcare.org/articles/how-to-tell-your-cats-age-in-human-years",
    date: "2024年6月19日公開・2025年11月28日更新",
    use: "猫の値の確認（採用した表と同じ値）。ライフステージの区切りは別",
    lang: "en",
  },
  akc: {
    id: "akc",
    org: "AKC（アメリカンケネルクラブ）",
    title: "How to Calculate Dog Years to Human Years",
    part: "米国獣医師会（AVMA）の目安の紹介、カリフォルニア大学サンディエゴ校の研究の紹介",
    url: "https://www.akc.org/expert-advice/health/how-to-calculate-dog-years-to-human-years/",
    date: "2026年9月14日更新",
    use: "ほかの換算方法との比較（このツールの計算には使っていない）",
    lang: "en",
    /* 比較のためだけに使う値（このツールの計算には使わない）。いずれも上の AKC のページに書かれているもの */
    avma: { scope: "中型犬", first: 15, second: 9, after: 5 }, // 1年目＝15歳、2年目＝約9歳、そのあと1年に約5歳
    ucsd: { formula: "16×ln(年齢)＋31", dogs: 104, breed: "ラブラドール・レトリーバー", span: 16, paper: "https://www.biorxiv.org/content/10.1101/829192v1" },
  },
};

/* ---------- 換算モデル ----------
   犬：環境省の表（2区分）。資料に体重の境目は書かれていないので、ここでも決めない。
       整数の年齢は、資料の式（小〜中型犬 24＋(年齢−2)×4、大型犬 12＋(年齢−1)×7）と表の値が一致する。
       1〜2歳の間（小〜中型犬）は式がないため、表の値を直線で結ぶ。
   猫：FelineVMA の表。5歳・22〜24歳は表にないため、前後の値を直線で結ぶ（International Cat Care と環境省の表の値とも一致）。 */
export const MODELS = {
  dog: {
    small: {
      id: "small",
      species: "dog",
      label: "小〜中型犬",
      short: "小〜中型",
      source: "env",
      formula: "24＋(年齢−2)×4",
      rule: "最初の2年で24歳、3年目からは1年に4歳ずつ",
      // 資料の表にある値
      points: [[12, 15], [24, 24], [36, 28], [60, 36], [84, 44], [120, 56], [144, 64], [180, 76], [240, 96]],
      min: 12,
      max: 240,
    },
    large: {
      id: "large",
      species: "dog",
      label: "大型犬",
      short: "大型",
      source: "env",
      formula: "12＋(年齢−1)×7",
      rule: "最初の1年で12歳、2年目からは1年に7歳ずつ",
      points: [[12, 12], [24, 19], [36, 26], [60, 40], [84, 54], [120, 75], [144, 89], [180, 110]],
      min: 12,
      max: 180,
    },
  },
  cat: {
    id: "cat",
    species: "cat",
    label: "猫",
    short: "猫",
    source: "felinevma",
    formula: "",
    rule: "1歳で15歳、2歳で24歳、そのあとは1年に4歳ずつ",
    points: [
      [1, 1], [3, 4], [6, 10], [12, 15], [24, 24], [36, 28], [48, 32], [72, 40], [84, 44], [96, 48], [108, 52], [120, 56],
      [132, 60], [144, 64], [156, 68], [168, 72], [180, 76], [192, 80], [204, 84], [216, 88], [228, 92], [240, 96], [252, 100], [300, 116],
    ],
    min: 1,
    max: 300,
  },
};

/* ---------- ライフステージ（換算とは別に管理） ----------
   from 以上・to 未満（月齢）。edge: true は資料の書き方に幅がある「移るころ」 */
export const STAGES = {
  cat: {
    source: "felinevma",
    name: "2021 AAHA/AAFP の区分",
    list: [
      { label: "子猫期", en: "Kitten", from: 0, to: 12, def: "誕生〜1歳未満" },
      { label: "若年期", en: "Young adult", from: 12, to: 84, def: "1〜6歳" },
      { label: "成熟期", en: "Mature adult", from: 84, to: 120, def: "7〜10歳" },
      { label: "シニア期", en: "Senior", from: 120, to: Infinity, def: "10歳以上" },
    ],
    note: "資料では成熟期が「7〜10歳」、シニア期が「10歳以上」と書かれていて、10歳が両方に入ります。このツールでは、10歳からをシニア期として表示します。なお指針では、終末期（End-of-life）を年齢に関係なく訪れうる段階として、別に扱っています。",
  },
  dog: {
    source: "env",
    name: "環境省の資料の区分（フード選びのための目安）",
    small: [
      { label: "哺乳期・離乳期", from: 0, to: 2, def: "誕生〜生後60日ぐらい" },
      { label: "成長期", from: 2, to: 10, def: "生後50日ぐらいから、小型犬は10か月ぐらいまで・中型犬は1年ぐらいまで" },
      { label: "成長期の終わりごろ", from: 10, to: 12, def: "小型犬は10か月ぐらい、中型犬は1年ぐらいで成長期が終わります", edge: true },
      { label: "成犬期", from: 12, to: 96, def: "成長期を終えてから7年間ぐらい" },
      { label: "中高齢期に入るころ", from: 96, to: 120, def: "約8〜10歳から中高齢期", edge: true },
      { label: "中高齢期", from: 120, to: Infinity, def: "約8〜10歳以降" },
    ],
    large: [
      { label: "哺乳期・離乳期", from: 0, to: 2, def: "誕生〜生後60日ぐらい" },
      { label: "成長期", from: 2, to: 18, def: "生後50日ぐらいから1年半ぐらいまで" },
      { label: "成犬期", from: 18, to: 72, def: "成長期を終えてから5年間ぐらい" },
      { label: "中高齢期に入るころ", from: 72, to: 84, def: "約6〜7歳から中高齢期", edge: true },
      { label: "中高齢期", from: 84, to: Infinity, def: "約6〜7歳以降" },
    ],
    note: "ここでの区分は、資料でフードの選び方のために示された目安です。年齢になったら急に切り替わるものではありません。",
    /* 資料の書き方そのまま（犬のページの表に出す） */
    sourceRows: [
      ["哺乳期", "誕生〜30日ぐらい"],
      ["離乳期", "生後20〜60日ぐらい"],
      ["成長期", "生後50日から、小型犬では10か月ぐらい、中型犬では1年ぐらい、大型犬では1年半ぐらいまで"],
      ["成犬期", "成長期を終えてから7年間（大型犬では5年）程度"],
      ["中高齢期", "約8〜10歳（大型犬は6〜7歳）以降"],
    ],
  },
  /* 参考：International Cat Care の区切り（猫のページで「資料によって区切りが違う」例として出す。計算には使わない） */
  catIcc: {
    source: "icc",
    list: [
      ["Kitten", "0〜6か月"],
      ["Junior", "7か月〜2歳"],
      ["Adult", "3〜6歳"],
      ["Mature", "7〜10歳"],
      ["Senior", "11〜14歳"],
      ["Super Senior", "15歳以上"],
    ],
  },
};

/* 早見表に出す年齢（月齢）。値はすべて MODELS から計算する */
export const CHART = {
  dog: [12, 24, 36, 48, 60, 72, 84, 96, 108, 120, 132, 144, 156, 168, 180, 192, 204, 216, 228, 240],
  cat: [1, 3, 6, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120, 132, 144, 156, 168, 180, 192, 204, 216, 228, 240, 252, 264, 276, 288, 300],
  /* 総合ページの短い表（犬・猫を並べる） */
  mix: [12, 24, 36, 60, 84, 120, 144, 180, 240],
};

/* 入力の上限（これを超える値は入力の誤りとして扱う） */
export const LIMITS = { petYears: 40, ownerYears: 120 };
