// ============================================================
// ラッキーもくもくチャンス - 概念 詳細ページ
//   URL:  concept.html?c=<概念名>
//
// データは ?type=concepts の1本だけ（軽い）。
//   見出し（名前・状態・説明・EP数） → 該当概念
//   どんな文脈で語られたか           → 各EPの context（concept_contexts シートに手書き）
//   登場エピソード                   → episodes 配列
//   よく一緒に語られる概念           → 全概念の episodes 集合を突き合わせて共起集計
//
// ※「どんな文脈で語られたか」はショーノートからの自動抽出をやめ、
//   スプレッドシート（concept_contexts）に手書きした一文だけを表示する。
//   書いてある回だけ表示され、空欄の回は出ない。
// ============================================================

// ▼ graph.js / episodes.js / concepts.js と同じURL
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxk2jQTHhowhGTXBAMsAcEZWbjELoxQAoSEkVy8EIMHuwXsgO_H6xxNqJPiqsvj5Dnd/exec';

const GRAPH_PAGE  = 'index.html';   // 登場エピソードのリンク先（?ep=<id>）
const DETAIL_PAGE = 'concept.html'; // 共起チップのリンク先

// タグの区切り文字（ハイライト処理用）
const DELIM_SET = new Set([...' \t\n#、。！？…「」『』【】（）']);

// ------------------------------------------------------------
// 汎用ユーティリティ
// ------------------------------------------------------------
function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// エピソード番号の表示（"3" → "003"）
function formatEpNo(id) {
  const m = String(id).match(/(\d+)/);
  return m ? m[1].padStart(3, '0') : String(id);
}

// 手書き文脈をHTML化。概念名（# 付き / 素 どちらでも）を <mark> で強調し、
// # は取り除く。他の #タグ も # を外して素の言葉として表示。
function renderContext(sentence, name) {
  let out = '';
  let i = 0;
  const n = sentence.length;
  while (i < n) {
    if (sentence[i] === '#') {
      let j = i;
      while (sentence[j] === '#') j++;
      let k = j;
      while (k < n && !DELIM_SET.has(sentence[k])) k++;
      const tag = sentence.slice(j, k);
      if (tag.length) {
        out += (tag === name) ? '<mark>' + esc(tag) + '</mark>' : esc(tag);
        i = k;
        continue;
      }
    }
    if (name && sentence.startsWith(name, i)) {
      out += '<mark>' + esc(name) + '</mark>';
      i += name.length;
      continue;
    }
    out += esc(sentence[i]);
    i++;
  }
  return out;
}

// 共起（よく一緒に語られる概念）：共有エピソード数を集計（同一EPは1回だけ）
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
// データ取得（?type=concepts の1本だけ）
// ------------------------------------------------------------
async function loadConcepts() {
  const src = new URLSearchParams(location.search).get('src'); // テスト用モック
  const url = src || (GAS_URL + '?type=concepts');
  const res = await fetch(url);
  if (!res.ok) throw new Error('concepts HTTP ' + res.status);
  const d = await res.json();
  return d.concepts || [];
}

// ------------------------------------------------------------
// 描画
// ------------------------------------------------------------
function show(id) { document.getElementById(id).hidden = false; }
function hide(id) { document.getElementById(id).hidden = true; }

function renderPage(target, allConcepts) {
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
  document.title = target.name + ' | ラッキーもくもくチャンス';

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

  // どんな文脈で語られたか（手書きの context がある回だけ表示）
  const ctxList = document.getElementById('context-list');
  ctxList.innerHTML = '';
  let ctxShown = 0;
  (target.episodes || []).forEach(ep => {
    const text = String(ep.context || '').trim();
    if (!text) return;
    ctxShown++;
    const item = document.createElement('div');
    item.className = 'context-item';
    item.innerHTML =
      '<p class="ctx-meta"><span class="ctx-no">第' + esc(formatEpNo(ep.id)) + '回</span>' +
      '<span class="ctx-title">' + esc(ep.title || '') + '</span></p>' +
      '<p class="ctx-text">' + renderContext(text, target.name) + '</p>';
    ctxList.appendChild(item);
  });
  if (ctxShown === 0) {
    ctxList.innerHTML = '<p class="soft-note">この概念の文脈はまだ記入されていません。スプレッドシートの <code>concept_contexts</code> シートで、登場回の <code>context</code> 欄に一文を書くと、ここに表示されます。</p>';
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

  let concepts;
  try {
    concepts = await loadConcepts();
  } catch (e) {
    console.error(e);
    hide('loading');
    show('error');
    return;
  }

  const target = concepts.find(c => c.name === name);
  if (!target) {
    hide('loading');
    show('notfound');
    return;
  }

  hide('loading');
  show('content');
  renderPage(target, concepts);
}

// ブラウザでのみ自動実行。Node（テスト）では純粋関数だけを公開する。
if (typeof document !== 'undefined') {
  main();
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderContext, computeCooccurrence, formatEpNo };
}
