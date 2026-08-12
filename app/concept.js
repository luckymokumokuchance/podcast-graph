// ============================================================
// ラッキーもくもくチャンス - 概念 詳細ページ（app/版）
//   URL:  concept.html?c=<概念名>
// root版との違いはデータ取得元だけ（PodcastData.loadConceptsPayload()）。
// ============================================================

const GRAPH_PAGE  = 'index.html';   // 登場エピソードのリンク先（?ep=<id>）
const DETAIL_PAGE = 'concept.html'; // 共起・近接・対比チップのリンク先

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
// データ取得
// ------------------------------------------------------------
async function loadConcepts() {
  const src = new URLSearchParams(location.search).get('src'); // テスト用モック
  if (src) {
    const res = await fetch(src);
    if (!res.ok) throw new Error('concepts HTTP ' + res.status);
    const d = await res.json();
    return d.concepts || [];
  }
  const d = await window.PodcastData.loadConceptsPayload();
  return d.concepts || [];
}

// ------------------------------------------------------------
// 描画
// ------------------------------------------------------------
function show(id) { document.getElementById(id).hidden = false; }
function hide(id) { document.getElementById(id).hidden = true; }

// ページリンクのチップ（近接概念・対比概念・共起で共通）
function makeLinkChip(name, extraClass) {
  const a = document.createElement('a');
  a.className = extraClass ? 'cooc-chip ' + extraClass : 'cooc-chip';
  a.href = DETAIL_PAGE + '?c=' + encodeURIComponent(name);
  a.textContent = name;
  return a;
}

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

  // ---- 概念ごとにdescription / OGP / canonicalを書き換え ----
  const pageUrl = location.origin + location.pathname + '?c=' + encodeURIComponent(target.name);
  const pageDesc = target.description
    ? target.name + 'について：' + target.description
    : 'ラッキーもくもくチャンスで語られた概念「' + target.name + '」の詳細ページです。';

  const setMeta = (selector, attr, value) => {
    const el = document.querySelector(selector);
    if (el) el.setAttribute(attr, value);
  };

  setMeta('meta[name="description"]', 'content', pageDesc);
  setMeta('meta[property="og:title"]', 'content', target.name + ' | ラッキーもくもくチャンス');
  setMeta('meta[property="og:description"]', 'content', pageDesc);
  setMeta('meta[property="og:url"]', 'content', pageUrl);
  setMeta('#canonical-link', 'href', pageUrl);

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

  // 提唱者（無ければバッジごと非表示）
  const proposerEl = document.getElementById('proposer-badge');
  if (target.proposer) {
    proposerEl.textContent = '提唱：' + target.proposer;
    proposerEl.hidden = false;
  } else {
    proposerEl.hidden = true;
  }

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
    ctxList.innerHTML = '<p class="soft-note">この概念の文脈はまだ記入されていません。</p>';
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

  // 近接概念（話した分：ページリンク）
  const related = target.related || [];
  const relatedGroup = document.getElementById('related-group');
  const relatedList  = document.getElementById('related-list');
  relatedList.innerHTML = '';
  if (related.length) {
    related.forEach(name => relatedList.appendChild(makeLinkChip(name)));
    relatedGroup.hidden = false;
  } else {
    relatedGroup.hidden = true;
  }

  // 近接概念（文献由来：テキストのみ、リンクなし）
  const relatedExternal = target.related_external || [];
  const relatedExtGroup = document.getElementById('related-external-group');
  const relatedExtList  = document.getElementById('related-external-list');
  relatedExtList.innerHTML = '';
  if (relatedExternal.length) {
    relatedExternal.forEach(text => {
      const span = document.createElement('span');
      span.className = 'external-chip';
      span.textContent = text;
      relatedExtList.appendChild(span);
    });
    relatedExtGroup.hidden = false;
  } else {
    relatedExtGroup.hidden = true;
  }

  // どちらも空の時だけ「まだありません」を出す
  document.getElementById('related-empty').hidden = (related.length > 0 || relatedExternal.length > 0);

  // 対比概念（ページリンク）
  const contrast = target.contrast || [];
  const contrastList = document.getElementById('contrast-list');
  contrastList.innerHTML = '';
  if (contrast.length === 0) {
    contrastList.innerHTML = '<p class="soft-note">まだありません。</p>';
  } else {
    contrast.forEach(name => contrastList.appendChild(makeLinkChip(name, 'contrast-chip')));
  }

  // よく一緒に語られる概念（自動計算・共起数バッジ付き）
  const cooc = computeCooccurrence(allConcepts, target);
  const coocList = document.getElementById('cooc-list');
  coocList.innerHTML = '';
  if (cooc.length === 0) {
    coocList.innerHTML = '<p class="soft-note">まだありません。</p>';
  } else {
    cooc.forEach(c => {
      const a = makeLinkChip(c.name);
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

if (typeof document !== 'undefined') {
  main();
}
