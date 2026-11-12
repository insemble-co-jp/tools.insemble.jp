/* ===========================================================
   印刷（神経衰弱メーカー）
   「印刷する」を押したときだけ、#print-root に入れた中身だけを刷る（ほかの部分は tools.css の @media print で隠す）
   ブラウザの印刷画面から「PDFに保存」も選べるので、PDF を作るライブラリは使わない
   =========================================================== */
export async function printHTML(html) {
  let root = document.getElementById("print-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "print-root";
    document.body.appendChild(root);
  }
  root.innerHTML = html;
  document.documentElement.classList.add("is-printing");
  // 画像が読み込まれる前に印刷画面を開くと、白いカードが刷られる
  await Promise.all([...root.querySelectorAll("img")].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  await document.fonts?.ready;
  const done = () => {
    document.documentElement.classList.remove("is-printing");
    root.innerHTML = "";
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}
