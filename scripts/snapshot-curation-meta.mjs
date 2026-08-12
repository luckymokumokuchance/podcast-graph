// 本番GAS(?type=concepts / ?type=works)から「人が書いた分だけ」を抽出し、
// app/concepts-meta.json と app/works-meta.json に書き出す。
// 自動計算できる部分(name/status/episodes/cooc、作品のtitle/type/episodes)は
// 一切保存しない — app/data.js の computeConcepts()/computeWorks() が
// ショーノートから毎回計算するため（Step 1で本番と完全一致を確認済み）。
//
// 再実行時は、ショーノートから消えて計算結果に出てこなくなった概念・作品の
// 手入力データも「exists:false」として保持し続ける（スプレッドシートの
// exists:○/×列と同じ配慮。書いた文章を黙って消さない）。
//
// 使い方: node scripts/snapshot-curation-meta.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const APP_DIR = path.join(ROOT, 'app');
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxk2jQTHhowhGTXBAMsAcEZWbjELoxQAoSEkVy8EIMHuwXsgO_H6xxNqJPiqsvj5Dnd/exec';

// app/data.js の computeWorks() と同じ抽出ロジック（DOM不要な部分だけの複製）。
// shownotes.json の descHtml は既にプレーンテキスト（スプレッドシートのshownote列
// そのもの）なので、ここではDOMを使わずNodeだけで完結させる。
// ロジックを変えたらapp/data.jsのcomputeWorks()と両方直すこと。
const WORK_EMOJI_TYPE = { '📚': 'book', '🎬': 'movie', '📺': 'anime', '🎵': 'music', '📻': 'radio' };
function buildWorkRe() {
  const emojiAlt = Object.keys(WORK_EMOJI_TYPE).join('|');
  return new RegExp(
    `(${emojiAlt})(?:` +
      `\\[([^\\]]+)\\]\\((https?:[^\\s)]+)\\)(?:[／/・]\\s*)?([^\\s、。！？…「」『』【】（）\\[\\]]*)` +
      `|『([^』]+)』` +
      `|「([^」]+)」` +
      `|\\[([^\\]]+)\\]` +
      `|([^\\s、。！？…「」『』【】（）\\[\\]]+)` +
    `)`,
    'g'
  );
}
function computeInlineWorks(shownoteEpisodes) {
  const re = buildWorkRe();
  const map = new Map(); // "type|title" -> { inlineCreator, inlineLink }
  shownoteEpisodes.forEach((ep) => {
    let m; re.lastIndex = 0;
    while ((m = re.exec(ep.descHtml || '')) !== null) {
      const type = WORK_EMOJI_TYPE[m[1]];
      let title, inlineUrl = '', inlineCreator = '';
      if (m[2] !== undefined) { title = m[2].trim(); inlineUrl = (m[3] || '').trim(); inlineCreator = (m[4] || '').trim(); }
      else title = (m[5] || m[6] || m[7] || m[8] || '').trim();
      if (!title) continue;
      const key = type + '|' + title;
      if (!map.has(key)) map.set(key, { inlineCreator: '', inlineLink: '' });
      const entry = map.get(key);
      if (inlineCreator && !entry.inlineCreator) entry.inlineCreator = inlineCreator;
      if (inlineUrl && !entry.inlineLink) entry.inlineLink = inlineUrl;
    }
  });
  return map;
}

function readJsonIfExists(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return {}; }
}

async function main() {
  const [conceptsRes, worksRes] = await Promise.all([
    fetch(GAS_URL + '?type=concepts').then((r) => r.json()),
    fetch(GAS_URL + '?type=works').then((r) => r.json()),
  ]);
  const concepts = conceptsRes.concepts || [];
  const works = worksRes.works || [];
  const shownotes = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'shownotes.json'), 'utf8'));
  const inlineWorks = computeInlineWorks(shownotes.episodes || []);

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

  // ショーノートから消えたが、以前の手入力データが残っている概念は保持する
  Object.entries(prevConcepts).forEach(([name, data]) => {
    if (!nameSet.has(name)) nextConcepts[name] = { ...data, exists: false };
  });

  fs.writeFileSync(conceptsMetaPath, JSON.stringify(nextConcepts, null, 2) + '\n');

  // ---------- works-meta.json ----------
  const worksMetaPath = path.join(APP_DIR, 'works-meta.json');
  const prevWorks = readJsonIfExists(worksMetaPath);
  const nextWorks = {};
  const workKeySet = new Set(works.map((w) => w.type + '|' + w.title));

  let recoveredCreator = 0, recoveredLink = 0;
  works.forEach((w) => {
    const key = w.type + '|' + w.title;
    const inline = inlineWorks.get(key);
    // creator/link_urlはショーノートのinline記法から復元できるものは保存しない
    // （app/data.jsのcomputeWorks()が毎回同じ値を出すため、二重管理・将来の
    // ズレの元になる）。inline値と一致しない＝シート固有の補完値の時だけ残す。
    const creator = (inline && inline.inlineCreator === w.creator) ? '' : (w.creator || '');
    const link_url = (inline && inline.inlineLink === w.link_url) ? '' : (w.link_url || '');
    if (inline && inline.inlineCreator && inline.inlineCreator === w.creator) recoveredCreator++;
    if (inline && inline.inlineLink && inline.inlineLink === w.link_url) recoveredLink++;
    nextWorks[key] = { exists: true, creator, link_url, image_url: w.image_url || '' };
  });
  console.log(`  (creator: inline記法から復元できたため保存省略=${recoveredCreator}件 / link_url: 同=${recoveredLink}件)`);

  Object.entries(prevWorks).forEach(([key, data]) => {
    if (!workKeySet.has(key)) nextWorks[key] = { ...data, exists: false };
  });

  fs.writeFileSync(worksMetaPath, JSON.stringify(nextWorks, null, 2) + '\n');

  console.log(`concepts-meta.json: ${Object.keys(nextConcepts).length}件 (existsなし含む)`);
  console.log(`works-meta.json: ${Object.keys(nextWorks).length}件 (existsなし含む)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
