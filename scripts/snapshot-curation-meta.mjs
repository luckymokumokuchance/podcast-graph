// 本番GAS(?type=concepts / ?type=works / 画像マップ)から「人が書いた分だけ」を
// 抽出し、app/concepts-meta.json・app/works-meta.json・app/images.json に書き出す。
// 自動計算できる部分(name/status/episodes/cooc、作品のtitle/type/episodes)は
// 一切保存しない — app/data.js の computeConcepts()/computeWorks() が
// RSSから毎回計算するため。
//
// 再実行時は、RSSから消えて計算結果に出てこなくなった概念・作品の
// 手入力データも「exists:false」として保持し続ける（スプレッドシートの
// exists:○/×列と同じ配慮。書いた文章を黙って消さない）。
//
// 使い方: node scripts/snapshot-curation-meta.mjs
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const APP_DIR = path.join(ROOT, 'app');
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxk2jQTHhowhGTXBAMsAcEZWbjELoxQAoSEkVy8EIMHuwXsgO_H6xxNqJPiqsvj5Dnd/exec';

// app/data.js を実際に動かして、「RSS＋episodes-extra.json」から復元できる
// 作品情報を得る。episodes-extra.jsonも合わせて見ないと、そこで既に補完済みの
// 作品までworks-meta.jsonに二重保存してしまう（情報源が2つに分かれてズレる元）。
// （重複した正規表現をこのファイルに持たない。ロジックはapp/data.js側だけで管理する）
async function loadInlineWorks() {
  const dom = new JSDOM('<!doctype html><body></body>', {
    url: 'https://dummy.invalid/app/index.html', // links.json等の相対fetchのための架空ベース
    runScripts: 'dangerously',
  });
  const { window } = dom;
  const extraLocal = readJsonIfExists(path.join(APP_DIR, 'episodes-extra.json'));
  window.fetch = (u, o) => {
    const url = new URL(u, window.location.href).href;
    // episodes-extra.jsonだけはリポジトリのローカルファイルをそのまま返す
    // （ダミーURLなのでネットワークでは取得できないため）
    if (url.includes('/episodes-extra.json')) {
      return Promise.resolve({ ok: true, json: async () => extraLocal });
    }
    return fetch(url, o);
  };
  window.eval(fs.readFileSync(path.join(APP_DIR, 'data.js'), 'utf8'));
  // links.json/images.json はダミーURLなので失敗するが、load()内でcatchされ
  // 空データにフォールバックする（RSS＋episodes-extra.jsonさえ読めればよい）
  const local = await window.PodcastData.load();
  const list = window.PodcastData.computeWorks(local.episodes).list;
  const map = new Map(list.map((w) => [w.type + '|' + w.title, w]));
  dom.window.close();
  return map;
}

function readJsonIfExists(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return {}; }
}

async function main() {
  const [conceptsRes, worksRes, graphRes, inlineWorks] = await Promise.all([
    fetch(GAS_URL + '?type=concepts').then((r) => r.json()),
    fetch(GAS_URL + '?type=works').then((r) => r.json()),
    fetch(GAS_URL).then((r) => r.json()), // ?type無し = images マップを含むグラフ用エンドポイント
    loadInlineWorks(),
  ]);
  const concepts = conceptsRes.concepts || [];
  const works = worksRes.works || [];

  // ---------- images.json ----------
  fs.writeFileSync(path.join(APP_DIR, 'images.json'), JSON.stringify(graphRes.images || {}, null, 2) + '\n');

  // ---------- concepts-meta.json ----------
  const conceptsMetaPath = path.join(APP_DIR, 'concepts-meta.json');
  const prevConcepts = readJsonIfExists(conceptsMetaPath);
  const nextConcepts = {};
  const nameSet = new Set(concepts.map((c) => c.name));

  concepts.forEach((c) => {
    // related/contrastは双方向展開済みの配列で返ってくる。片側だけ保存すると
    // どちらの概念のエントリに書くか毎回変わってしまうため、ペアの中で
    // 名前が辞書順で小さい方にだけ持たせる（読み込み時に双方向展開する。
    // GASのaddPair()と同じロジックをapp/data.js側で再現する）
    const relatedOneSided = (c.related || []).filter((other) => c.name.localeCompare(other, 'ja') < 0);
    const contrastOneSided = (c.contrast || []).filter((other) => c.name.localeCompare(other, 'ja') < 0);

    const contexts = {};
    (c.episodes || []).forEach((e) => { if (e.context && e.context.trim()) contexts[e.id] = e.context; });

    nextConcepts[c.name] = {
      exists: true,
      description: c.description || '',
      proposer: c.proposer || '',
      related: relatedOneSided,
      related_external: c.related_external || [],
      contrast: contrastOneSided,
      contexts,
    };
  });

  // RSSから消えたが、以前の手入力データが残っている概念は保持する
  Object.entries(prevConcepts).forEach(([name, data]) => {
    if (!nameSet.has(name)) nextConcepts[name] = { ...data, exists: false };
  });

  fs.writeFileSync(conceptsMetaPath, JSON.stringify(nextConcepts, null, 2) + '\n');

  // ---------- works-meta.json ----------
  const worksMetaPath = path.join(APP_DIR, 'works-meta.json');
  const prevWorks = readJsonIfExists(worksMetaPath);
  const nextWorks = {};
  const workKeySet = new Set(works.map((w) => w.type + '|' + w.title));

  let recoveredCreator = 0, recoveredLink = 0, unmangled = 0;
  works.forEach((w) => {
    const key = w.type + '|' + w.title;
    const inline = inlineWorks.get(key);

    // GAS側の正規表現はURL内の `(` に未対応のままなので、Wikipediaの `_(映画)` 形式で
    // 「著者名が `)` から始まる」壊れた値を返してくる（ep20/22/24）。
    // 実在の著者名が `)` で始まることは無いので、取り込み時に取り除いてから比較する。
    // ※GAS本体を直せばこの正規化は不要になる（QUESTIONS.md参照）
    const rawCreator = String(w.creator || '');
    const gasCreator = rawCreator.replace(/^\)\s*[／/・]?\s*/, '');
    if (gasCreator !== rawCreator) unmangled++;
    // 同様に、URLが途中で切れている場合はinline側（修正済み）を正とする
    const gasLinkBroken = /\([^)]*$/.test(String(w.link_url || ''));

    // creator/link_urlはRSS本文から復元できるものは保存しない
    // （app/data.jsのcomputeWorks()が毎回同じ値を出すため、二重管理・将来の
    // ズレの元になる）。inline値と一致しない＝シート固有の補完値の時だけ残す。
    const creator = (inline && inline.inlineCreator === gasCreator) ? '' : gasCreator;
    const link_url = (gasLinkBroken || (inline && inline.inlineLink === w.link_url)) ? '' : (w.link_url || '');
    if (inline && inline.inlineCreator && inline.inlineCreator === gasCreator) recoveredCreator++;
    if (inline && inline.inlineLink && inline.inlineLink === w.link_url) recoveredLink++;
    nextWorks[key] = { exists: true, creator, link_url, image_url: w.image_url || '' };
  });
  console.log(`  (creator: RSS本文から復元できたため保存省略=${recoveredCreator}件 / link_url: 同=${recoveredLink}件`
    + (unmangled ? ` / GASのパース残骸を除去=${unmangled}件` : '') + ')');

  Object.entries(prevWorks).forEach(([key, data]) => {
    if (!workKeySet.has(key)) nextWorks[key] = { ...data, exists: false };
  });

  fs.writeFileSync(worksMetaPath, JSON.stringify(nextWorks, null, 2) + '\n');

  console.log(`concepts-meta.json: ${Object.keys(nextConcepts).length}件 (existsなし含む)`);
  console.log(`works-meta.json: ${Object.keys(nextWorks).length}件 (existsなし含む)`);
  console.log(`images.json: ${Object.keys(graphRes.images || {}).length}件`);
}

main().catch((e) => { console.error(e); process.exit(1); });
