// app/data.js の load() が、本番(GAS/スプレッドシート)と同等のデータを組み立てられているか検証する。
// 使い方: node scripts/verify-parity.mjs http://localhost:8123
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const baseUrl = process.argv[2] || 'http://localhost:8123';
const EXPECT_IMAGE_EPISODES = [12, 14, 18]; // GAS版で[img:key]を使用している回（既知）
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
const shownotes = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'shownotes.json'), 'utf8'));

let ok = true;
function check(label, pass, detail) {
  console.log((pass ? 'PASS' : 'FAIL') + ' - ' + label + (detail ? ' (' + detail + ')' : ''));
  if (!pass) ok = false;
}

// RSSの生<item>数を正として、appが1件も落とさず読み込めているかを見る
// （絶対数は決め打ちしない。エピソードは今後も増え続けるため）
const rssRaw = await fetch(window.PodcastData.RSS_URL).then((r) => r.text());
const rssItemCount = (rssRaw.match(/<item[\s>]/g) || []).length;
check('RSSの<item>数とapp/dataの件数が一致', result.episodes.length === rssItemCount,
  `app=${result.episodes.length} rss=${rssItemCount}`);

// タグ一致：shownotes.json自体から期待タグを再計算し、appの出力と突き合わせる
// "#tag"=採用、"##tag"以上（未タグ候補）は除外
const TAG_RE = /#+([^\s#、。！？…「」『』【】（）\[\]／\/()]+)/g;
function expectedTags(html) {
  const withBreaks = String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n');
  const text = withBreaks.replace(/<[^>]+>/g, '');
  const out = [];
  let m;
  while ((m = TAG_RE.exec(text)) !== null) {
    const hashes = m[0].match(/^#+/)[0].length;
    if (hashes !== 1) continue;
    if (/[=.:@]/.test(m[1])) continue;
    if (!DENYLISTED_TAGS.includes(m[1]) && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}
let tagMismatches = 0;
for (const c of shownotes.episodes) {
  const ep = result.episodes.find((e) => e.num === c.num);
  if (!ep) continue;
  const expected = expectedTags(c.descHtml).sort();
  const actual = [...ep.tags].sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    tagMismatches++;
    console.log(`  ep${c.num} タグ不一致: expected=[${expected}] actual=[${actual}]`);
  }
}
check(`タグ一致 ${shownotes.episodes.length - tagMismatches}/${shownotes.episodes.length}`, tagMismatches === 0);

const withImg = EXPECT_IMAGE_EPISODES.filter((num) => {
  const ep = result.episodes.find((e) => e.num === num);
  return ep && /\[img:/.test(ep.descHtml);
});
check(`[img:]を含む回 ${withImg.length}/${EXPECT_IMAGE_EPISODES.length}`, withImg.length === EXPECT_IMAGE_EPISODES.length, `expected=${EXPECT_IMAGE_EPISODES}`);

check(`手動リンク ${result.manualLinks.length}件`, result.manualLinks.length === EXPECT_MANUAL_LINKS);

const badTags = result.tags.filter((t) => DENYLISTED_TAGS.includes(t));
check('宣伝タグが出ていない', badTags.length === 0, badTags.join(','));

console.log(ok ? '\n=== ALL PASS ===' : '\n=== FAIL ===');
process.exit(ok ? 0 : 1);
