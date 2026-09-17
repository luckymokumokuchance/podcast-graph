// app/data.js の computeConcepts()/computeWorks() と、本番GASの
// ?type=concepts / ?type=works の差分を報告する。
//
// ▼役割が変わりました（2026-09-17）
//   もともとは「GASと完全一致するか」の合否判定でした（移植時の検証用）。
//   RSSをDBにする設計に移行したことで、app/側は意図的にGASより先に進みます：
//     ・スプレッドシート未登録の回（026/027等）もRSSから拾う
//     ・`📚題／著者` を題名と著者に分割する
//     ・定型フッタを落とす
//   そのため一致しないのが正常で、合否で落とすと警報として機能しません。
//   いまは「見落としを見つけるための差分レポート」です（常に exit 0）。
//   GASが引退するPhase 3で、このスクリプトごと削除します。
//
// 使い方: node scripts/verify-concepts-works.mjs [baseUrl]
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const baseUrl = process.argv[2] || 'http://localhost:8123';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxk2jQTHhowhGTXBAMsAcEZWbjELoxQAoSEkVy8EIMHuwXsgO_H6xxNqJPiqsvj5Dnd/exec';

// 差分レポートなので合否では落とさない（同じ=「同」／違う=「差」として並べるだけ）
function check(label, same, detail) {
  console.log((same ? '同  ' : '差  ') + label + (detail ? ' (' + detail + ')' : ''));
}
function setEq(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
function diff(a, b) {
  const onlyA = [...a].filter((x) => !b.has(x));
  const onlyB = [...b].filter((x) => !a.has(x));
  return { onlyA, onlyB };
}

// ---------- app/data.js をjsdomで動かして自前計算を得る ----------
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: `${baseUrl}/app/index.html`, runScripts: 'dangerously', resources: 'usable',
});
const { window } = dom;
window.fetch = (url, opts) => fetch(new URL(url, window.location.href).href, opts);
window.eval(fs.readFileSync(path.join(ROOT, 'app', 'data.js'), 'utf8'));

const local = await window.PodcastData.load();
const concepts = window.PodcastData.computeConcepts(local.episodes).list;
const works = window.PodcastData.computeWorks(local.episodes).list;

// ---------- 本番GASの実データ ----------
const [gasConcepts, gasWorks] = await Promise.all([
  fetch(GAS_URL + '?type=concepts').then((r) => r.json()).then((j) => j.concepts),
  fetch(GAS_URL + '?type=works').then((r) => r.json()).then((j) => j.works),
]);

console.log(`ローカル: エピソード${local.episodes.length}件 / 概念${concepts.length}件 / 作品${works.length}件`);
console.log(`本番GAS: 概念${gasConcepts.length}件 / 作品${gasWorks.length}件`);
console.log('');

// ---------- 概念の比較 ----------
const localNames = new Set(concepts.map((c) => c.name));
const gasNames = new Set(gasConcepts.map((c) => c.name));
check(`概念の件数一致 (${concepts.length}/${gasConcepts.length})`, concepts.length === gasConcepts.length);
const nameDiff = diff(localNames, gasNames);
check('概念名の集合が完全一致', setEq(localNames, gasNames),
  nameDiff.onlyA.length || nameDiff.onlyB.length ? `ローカルのみ=[${nameDiff.onlyA}] 本番のみ=[${nameDiff.onlyB}]` : '');

let statusMismatch = 0, epMismatch = 0;
const gasByName = new Map(gasConcepts.map((c) => [c.name, c]));
concepts.forEach((c) => {
  const g = gasByName.get(c.name);
  if (!g) return;
  if ((c.status === 'tagged' ? 'tagged' : 'candidate') !== g.status) {
    statusMismatch++;
    console.log(`  status不一致: ${c.name} local=${c.status} gas=${g.status}`);
  }
  const localEp = new Set(c.episodeIds.map(String));
  const gasEp = new Set((g.episodes || []).map((e) => String(e.id)));
  if (!setEq(localEp, gasEp)) {
    epMismatch++;
    const d = diff(localEp, gasEp);
    console.log(`  episode不一致: ${c.name} localのみ=[${d.onlyA}] gasのみ=[${d.onlyB}]`);
  }
});
check(`status一致 (不一致${statusMismatch}件)`, statusMismatch === 0);
check(`登場エピソード一致 (不一致${epMismatch}件)`, epMismatch === 0);

console.log('');

// ---------- 作品の比較 ----------
const localKeys = new Set(works.map((w) => w.type + '|' + w.title));
const gasKeys = new Set(gasWorks.map((w) => w.type + '|' + w.title));
check(`作品の件数一致 (${works.length}/${gasWorks.length})`, works.length === gasWorks.length);
const workDiff = diff(localKeys, gasKeys);
check('作品(種別|タイトル)の集合が完全一致', setEq(localKeys, gasKeys),
  workDiff.onlyA.length || workDiff.onlyB.length ? `ローカルのみ=[${workDiff.onlyA.slice(0,10)}] 本番のみ=[${workDiff.onlyB.slice(0,10)}]` : '');

let workEpMismatch = 0, inlineDiff = 0;
const gasWorkByKey = new Map(gasWorks.map((w) => [w.type + '|' + w.title, w]));
works.forEach((w) => {
  const key = w.type + '|' + w.title;
  const g = gasWorkByKey.get(key);
  if (!g) return;
  const localEp = new Set(w.episodeIds.map(String));
  const gasEp = new Set((g.episodes || []).map((e) => String(e.id)));
  if (!setEq(localEp, gasEp)) {
    workEpMismatch++;
    const d = diff(localEp, gasEp);
    console.log(`  episode不一致: [${key}] localのみ=[${d.onlyA}] gasのみ=[${d.onlyB}]`);
  }
  // inline記法から取れたcreator/linkは、本番側のcreator/link_urlに含まれているはず
  // （本番はシート補完値を優先して返すため、逆方向の完全一致は求めない）
  if (w.inlineCreator && g.creator && w.inlineCreator !== g.creator) inlineDiff++;
});
check(`作品の登場エピソード一致 (不一致${workEpMismatch}件)`, workEpMismatch === 0);
console.log(`  (参考) inline記法のcreatorと本番creatorが食い違う件数: ${inlineDiff}`);

console.log('\n=== 差分レポート終わり ===');
console.log('※ 差が出るのは正常です（app/側はRSSを直接読むぶんGASより先に進んでいます）。');
console.log('   身に覚えのない差が出たときだけ調べてください。');
