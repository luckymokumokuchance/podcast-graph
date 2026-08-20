// ルート直下の各ページを app/ の同名ページへ転送する薄いHTMLに置き換える。
// 本番公開（app/を正にする）の切り替え用。
//
// 重要：
//   - クエリ文字列とハッシュを必ず引き継ぐ。Spotifyの各エピソード概要欄に
//     ?ep=<id> 付きのリンクが貼られており、落とすと全部トップに着地する
//   - episodes.html は転送しない。Studioにiframe埋め込みされているため、
//     勝手に別画面へ飛ばすと埋め込み先の見え方が壊れる
//   - 元のファイルは git が持っているので、戻したい時は
//     git checkout <commit> -- <file> で復元できる
//
// 使い方:
//   node scripts/make-redirects.mjs         … 転送HTMLを書き出す
//   node scripts/make-redirects.mjs --dry   … 中身を表示するだけ（書き込まない）
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');

// [ルートのファイル名, ページ名（noscript用の文言）]
const PAGES = [
  ['index.html',     'ネットワーク図'],
  ['about.html',     'ABOUT'],
  ['concepts.html',  '概念一覧'],
  ['concept.html',   '概念詳細'],
  ['untagged.html',  '未タグ化の概念'],
  ['inspired.html',  'INSPIRED'],
  ['log.html',       'LOG'],
  ['contact.html',   'CONTACT'],
];
// episodes.html は意図的に含めない（Studioのiframe埋め込み先のため）

const SITE = 'https://luckymokumokuchance.github.io/podcast-graph';

function html(file, label) {
  const target = 'app/' + file;
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ラッキーもくもくチャンス</title>
<link rel="canonical" href="${SITE}/${target}">
<meta name="robots" content="noindex">
<!-- JSが無効でも数秒で移動する保険 -->
<meta http-equiv="refresh" content="3; url=${target}">
<script>
  // クエリ(?ep=12 など)とハッシュを保ったまま転送する。
  // replace を使い、戻るボタンで転送ループに陥らないようにする。
  location.replace('${target}' + location.search + location.hash);
</script>
<style>
  body { font-family: "Hiragino Maru Gothic ProN","BIZ UDGothic",sans-serif;
         margin: 0; min-height: 100vh; display: flex; align-items: center;
         justify-content: center; background: #f5f7f3; color: #16211a; }
  .box { text-align: center; padding: 24px; line-height: 1.9; }
  a { color: #089900; }
</style>
</head>
<body>
  <div class="box">
    <p>${label}のページは移動しました。</p>
    <p><a href="${target}">自動で移動しない場合はこちら</a></p>
  </div>
</body>
</html>
`;
}

PAGES.forEach(([file, label]) => {
  const body = html(file, label);
  const dest = path.join(ROOT, file);
  if (DRY) {
    console.log(`----- ${file} -----`);
    console.log(body);
  } else {
    fs.writeFileSync(dest, body);
    console.log(`書き出し: ${file} → app/${file}`);
  }
});

if (!DRY) console.log('\n※ episodes.html は転送していません（Studio埋め込みのため）');
