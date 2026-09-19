// app/data.js の load() が、RSS＋episodes-extra.json から正しく組み立てられて
// いるかを検証する。
// 2026-09-17 Phase2でshownotes.json（スプレッドシート全文コピー）を廃止した
// ため、「本文の期待値」を外部と突き合わせる方式はやめ、「RSSを1件も
// 落としていないか」「episodes-extra.jsonの追記が実際に反映されているか」を見る。
// 使い方: node scripts/verify-parity.mjs http://localhost:8123
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const baseUrl = process.argv[2] || 'http://localhost:8123';
const EXPECT_MANUAL_LINKS = 10;
const DENYLISTED_TAGS = ['ラキもくチャン', 'ラッキーもくもくチャンス'];

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: `${baseUrl}/app/index.html`,
  runScripts: 'dangerously',
  resources: 'usable',
});
const { window } = dom;
window.fetch = (url, opts) => fetch(new URL(url, window.location.href).href, opts);
window.eval(fs.readFileSync(path.join(ROOT, 'app', 'data.js'), 'utf8'));

const result = await window.PodcastData.load();
const extra = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'episodes-extra.json'), 'utf8'));

let ok = true;
function check(label, pass, detail) {
  console.log((pass ? 'PASS' : 'FAIL') + ' - ' + label + (detail ? ' (' + detail + ')' : ''));
  if (!pass) ok = false;
}

// RSSを正として、appが1件も落とさず読み込めているかを見る
// （絶対数は決め打ちしない。エピソードは今後も増え続けるため）
// エピソードIDはRSSタイトル先頭の話数から作るので、話数が無い回は載らない。
// それは「Spotify側のタイトルを直す」で解決する運用上の問題なので、
// パイプラインの検査とは分けて報告する。
const rssRaw = await fetch(window.PodcastData.RSS_URL).then((r) => r.text());
const rssTitles = [...rssRaw.matchAll(/<item[\s>][\s\S]*?<title>(?:<!\[CDATA\[)?([^<\]]+)/g)].map((m) => m[1].trim());
const numbered = rssTitles.filter((t) => /^\s*\d{1,3}\s+/.test(t));
const unnumbered = rssTitles.filter((t) => !/^\s*\d{1,3}\s+/.test(t));

check('話数つきのRSS全話がapp/dataに載っている', result.episodes.length === numbered.length,
  `app=${result.episodes.length} rss(話数つき)=${numbered.length}`);

if (unnumbered.length) {
  console.log(`WARN - タイトルに話数が無いためサイトに出ない回が ${unnumbered.length} 件あります`);
  unnumbered.forEach((t) => console.log(`       「${t}」← Spotify側のタイトルを「0XX ${t}」に直すと出ます`));
}

// episodes-extra.json の addTags が、実際にグラフのタグ（#のみ）へ反映されているか
let extraTagMismatches = 0, extraTagChecked = 0;
Object.entries(extra).forEach(([num, e]) => {
  const singleTags = (e.addTags || []).filter((t) => !t.startsWith('##'));
  if (!singleTags.length) return;
  const ep = result.episodes.find((x) => x.num === Number(num));
  if (!ep) { console.log(`  ★ episodes-extra.json の第${num}回がRSSに見つからない`); extraTagMismatches++; return; }
  singleTags.forEach((t) => {
    extraTagChecked++;
    if (!ep.tags.includes(t)) { console.log(`  ★ 第${num}回: addTags「${t}」が星図タグに反映されていない`); extraTagMismatches++; }
  });
});
check(`episodes-extra.jsonのaddTagsが反映されている (${extraTagChecked - extraTagMismatches}/${extraTagChecked})`, extraTagMismatches === 0);

// episodes-extra.json の addImages が、本文に [img:key] として反映されているか
let imgMismatches = 0, imgChecked = 0;
Object.entries(extra).forEach(([num, e]) => {
  (e.addImages || []).forEach((key) => {
    imgChecked++;
    const ep = result.episodes.find((x) => x.num === Number(num));
    if (!ep || !new RegExp(`\\[img:${key}\\]`).test(ep.descHtml)) {
      console.log(`  ★ 第${num}回: addImages「${key}」が本文に反映されていない`);
      imgMismatches++;
    }
  });
});
check(`episodes-extra.jsonのaddImagesが反映されている (${imgChecked - imgMismatches}/${imgChecked})`, imgMismatches === 0);

check(`手動リンク ${result.manualLinks.length}件`, result.manualLinks.length === EXPECT_MANUAL_LINKS);

const badTags = result.tags.filter((t) => DENYLISTED_TAGS.includes(t));
check('宣伝タグが出ていない', badTags.length === 0, badTags.join(','));

console.log(ok ? '\n=== ALL PASS ===' : '\n=== FAIL ===');
process.exit(ok ? 0 : 1);
