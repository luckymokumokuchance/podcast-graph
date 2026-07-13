// ============================================================
// ラッキーもくもくチャンス - 概念 詳細ページ
//   URL:  concept.html?c=<概念名>
//
// 新しいGAS・新しいシート列は不要。既存の2本のJSONを組み合わせるだけ。
//   1) ?type=concepts … 概念のメタ情報（name/status/description/episodes）＋共起計算用の全概念
//   2) 既定エンドポイント … エピソード本文（shownote）＝「どんな文脈で語られたか」の抜き出し元
//
// ページ内訳とデータの出どころ:
//   見出し（名前・状態・説明・EP数） → ?type=concepts の該当概念
//   どんな文脈で語られたか           → 各EPの shownote から「#概念名 を含む一文」を抽出
//   登場エピソード                   → 該当概念の episodes 配列
//   よく一緒に語られる概念           → 全概念の episodes 集合を突き合わせて共起数を集計
// ============================================================

// ▼ graph.js / episodes.js / concepts.js と同じURL
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxk2jQTHhowhGTXBAMsAcEZWbjELoxQAoSEkVy8EIMHuwXsgO_H6xxNqJPiqsvj5Dnd/exec';

// 関連エピソードのリンク先（グラフの既存ディープリンク ?ep=<id>）
const GRAPH_PAGE = 'index.html';
// 概念一覧・共起チップのリンク先
const LIST_PAGE = 'concepts.html';
const DETAIL_PAGE = 'concept.html';

// タグの区切り文字（episodes.js / GAS と同じ集合）
const TAG_DELIMS = '\\s#、。！？…「」『』【】（）';

// ------------------------------------------------------------
// 汎用ユーティリティ
// ------------------------------------------------------------
function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// エピソード番号の表示（"3" → "003"）
function formatEpNo(id) {
  const m = String(id).match(/(\d+)/);
  return m ? m[1].padStart(3, '0') : String(id);
}

// ------------------------------------------------------------
// 文脈抽出（純粋関数・テスト対象）
// ------------------------------------------------------------

// ショーノートを「一文」に割る（。！？ の直後、または改行で区切る）
function splitSentences(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/(?<=[。！？])|\n+/)
    .map(s => s.trim())
    .filter(Boolean);
}

// その「文」がタグの羅列だけ（本文が無い）かどうか
const TAG_GLOBAL = new RegExp('#{1,2}[^' + TAG_DELIMS + ']+', 'g');
function isTagOnly(s) {
  const rest = s
    .replace(TAG_GLOBAL, '')
    .replace(new RegExp('[' + TAG_DELIMS + ']', 'g'), '')
    .trim();
  return rest.length === 0;
}

// shownote から「概念名を語っている一文」を1つだけ選ぶ。
// 優先順位: ①#タグを含み本文もある文 → ②概念名が素で出る本文の文 → ③#タグを含む文（羅列でも）
function findContext(shownote, name) {
  const sentences = splitSentences(shownote);
  const tagRe = new RegExp('#{1,2}' + escapeRegExp(name) + '(?=[' + TAG_DELIMS + ']|$)');

  let hit = sentences.find(s => tagRe.test(s) && !isTagOnly(s));
  if (hit) return hit;

  hit = sentences.find(s => s.includes(name) && !isTagOnly(s));
  if (hit) return hit;

  hit = sentences.find(s => tagRe.test(s));
  return hit || null;
}

// 抽出した一文をHTML化。概念名は <mark> で強調し、# は取り除く。
// 他の #タグ も # を外して素の言葉として表示（読みやすさのため）。
const DELIM_SET = new Set([...' \t\n#、。！？…「」『』【】（）']);
function renderContext(sentence, name) {
  let out = '';
  let i = 0;
  const n = sentence.length;
  while (i < n) {
    if (sentence[i] === '#') {
      let j = i;
      while (sentence[j] === '#') j++;          // # / ## をまとめて飛ばす
      let k = j;
      while (k < n && !DELIM_SET.has(sentence[k])) k++;
      const tag = sentence.slice(j, k);
      if (tag.length) {
        out += (tag === name)
          ? '<mark>' + esc(tag) + '</mark>'
          : esc(tag);                            // 他タグは # を外して素表示
        i = k;
        continue;
      }
    }
    if (sentence.startsWith(name, i)) {           // # の付かない素の概念名も強調
      out += '<mark>' + esc(name) + '</mark>';
      i += name.length;
      continue;
    }
    out += esc(sentence[i]);
    i++;
  }
  return out;
}

// 共起（よく一緒に語られる概念）の集計
function computeCooccurrence(allConcepts, target) {
  const ids = new Set((target.episodes || []).map(e => String(e.id)));
  return allConcepts
    .filter(c => c.name !== target.name)
    .map(c => {
      const sharedIds = new Set(
        (c.episodes || []).map(e => String(e.id)).filter(id => ids.has(id))
      );
      return { name: c.name, status: c.status, shared: sharedIds.size };
    })
    .filter(c => c.shared > 0)
    .sort((a, b) => b.shared - a.shared || a.name.localeCompare(b.name, 'ja'));
}

// ------------------------------------------------------------
// データ取得
// ------------------------------------------------------------
async function loadData() {
  const params = new URLSearchParams(location.search);
  const src = params.get('src'); // テスト用：concepts と nodes を1つに入れたモックJSON

  if (src) {
    const d = await (await fetch(src)).json();
    return {
      concepts: d.concepts || [],
      episodes: (d.nodes || []).filter(n => n.type === 'episode'),
    };
  }

  const [cRes, eRes] = await Promise.all([
    fetch(GAS_URL + '?type=concepts'),
    fetch(GAS_URL),
  ]);
  if (!cRes.ok) throw new Error('concepts HTTP ' + cRes.status);
  if (!eRes.ok) throw new Error('episodes HTTP ' + eRes.status);
  const cd = await cRes.json();
  const ed = await eRes.json();
  return {
    concepts: cd.concepts || [],
    episodes: (ed.nodes || []).filter(n => n.type === 'episode'),
  };
}

// ------------------------------------------------------------
// 描画
// ------------------------------------------------------------
function show(id) { document.getElementById(id).hidden = false; }
function hide(id) { document.getElementById(id).hidden = true; }

function renderPage(target, allConcepts, epById) {
  // 見出しカード
  const pill = document.getElementById('status-pill');
  if (target.status === 'tagged') {
    pill.textContent = 'タグ済み';
    pill.className = 'status-pill is-tagged';
  } else {
    pill.textContent = '未タグ';
    pill.className = 'status-pill is-candidate';
  }
  document.getElementById('concept-name').textContent = target.name;
  document.title = target.name + ' - ラッキーもくもくチャンス';

  const descEl = document.getElementById('concept-desc');
  if (target.description) {
    descEl.textContent = target.description;
    descEl.classList.remove('is-empty');
  } else {
    descEl.textContent = '一言説明はまだ登録されていません。';
    descEl.classList.add('is-empty');
  }

  const count = (target.episodes || []).length;
  document.getElementById('ep-count').textContent = count + 'エピソードで登場';

  // どんな文脈で語られたか
  const ctxList = document.getElementById('context-list');
  ctxList.innerHTML = '';
  let ctxShown = 0;
  (target.episodes || []).forEach(ep => {
    const shownote = epById[String(ep.id)] || '';
    const sentence = findContext(shownote, target.name);
    if (!sentence) return;
    ctxShown++;
    const item = document.createElement('div');
    item.className = 'context-item';
    item.innerHTML =
      '<p class="ctx-meta"><span class="ctx-no">第' + esc(formatEpNo(ep.id)) + '回</span>' +
      '<span class="ctx-title">' + esc(ep.title || '') + '</span></p>' +
      '<p class="ctx-text">' + renderContext(sentence, target.name) + '</p>';
    ctxList.appendChild(item);
  });
  if (ctxShown === 0) {
    ctxList.innerHTML = '<p class="soft-note">抜き出せる文脈がまだ見つかりませんでした。ショーノート内でこの概念に触れている一文に <code>#' +
      esc(target.name) + '</code> を書くと、ここに表示されます。</p>';
  }

  // 登場エピソード
  const epList = document.getElementById('ep-list');
  epList.innerHTML = '';
  (target.episodes || []).forEach(ep => {
    const li = document.createElement('li');
    li.innerHTML =
      '<a href="' + GRAPH_PAGE + '?ep=' + encodeURIComponent(ep.id) + '">' +
      '<span class="row-title">' + esc(ep.title || ('第' + formatEpNo(ep.id) + '回')) + '</span>' +
      '<span class="row-no">第' + esc(formatEpNo(ep.id)) + '回</span></a>';
    epList.appendChild(li);
  });

  // よく一緒に語られる概念
  const cooc = computeCooccurrence(allConcepts, target);
  const coocList = document.getElementById('cooc-list');
  coocList.innerHTML = '';
  if (cooc.length === 0) {
    coocList.innerHTML = '<p class="soft-note">まだありません。</p>';
  } else {
    cooc.forEach(c => {
      const a = document.createElement('a');
      a.className = 'cooc-chip';
      a.href = DETAIL_PAGE + '?c=' + encodeURIComponent(c.name);
      a.innerHTML = esc(c.name) + '<span class="cooc-count">' + c.shared + '</span>';
      coocList.appendChild(a);
    });
  }
}

// ------------------------------------------------------------
// 起動
// ------------------------------------------------------------
async function main() {
  const name = new URLSearchParams(location.search).get('c');
  if (!name) {
    hide('loading');
    show('notfound');
    return;
  }

  let data;
  try {
    data = await loadData();
  } catch (e) {
    console.error(e);
    hide('loading');
    show('error');
    return;
  }

  const target = (data.concepts || []).find(c => c.name === name);
  if (!target) {
    hide('loading');
    show('notfound');
    return;
  }

  const epById = {};
  data.episodes.forEach(n => { epById[String(n.id)] = n.summary || ''; });

  hide('loading');
  show('content');
  renderPage(target, data.concepts, epById);
}

// ブラウザでのみ自動実行。Node（テスト）では純粋関数だけを公開する。
if (typeof document !== 'undefined') {
  main();
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    splitSentences, isTagOnly, findContext, renderContext,
    computeCooccurrence, formatEpNo,
  };
}
