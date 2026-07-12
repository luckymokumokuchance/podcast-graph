// ============================================================
// ラッキーもくもくチャンス - 概念一覧（タグ済み＋未タグ 統合）
// GASの ?type=concepts を唯一のデータソースとして使う。
//   #  … タグ化済み（グラフにも出る）      → status: 'tagged'
//   ## … 未タグ（グラフには出さない候補）   → status: 'candidate'
// どちらも1ページに並べ、上部のボタンで絞り込む。
// カードの一言コメントは（任意の）concepts シートの description から出る。
// ============================================================

// ▼ graph.js / episodes.js と同じURL
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxk2jQTHhowhGTXBAMsAcEZWbjELoxQAoSEkVy8EIMHuwXsgO_H6xxNqJPiqsvj5Dnd/exec';
// ▲ テスト時は concepts.html?src=mock.json のように差し替え可能。無指定なら concepts エンドポイント。
const _src = new URLSearchParams(location.search).get('src');
const DATA_URL = _src || (GAS_URL + '?type=concepts');

// 関連エピソードのリンク先（グラフの既存ディープリンク ?ep=<id>）
const GRAPH_PAGE = 'index.html';

const FILTER_LABEL = { all: 'すべて', tagged: 'タグ済み', candidate: '未タグ' };

// ------------------------------------------------------------
// 検索用の正規化（episodes.js と同一）：全半角そろえ・小文字化・カタカナ→ひらがな
// ------------------------------------------------------------
function normalize(str) {
  return String(str || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

// HTMLエスケープ
function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ------------------------------------------------------------
// 状態
// ------------------------------------------------------------
let concepts = [];        // {name, description, status, episodes:[{id,title}], count, searchText}
let activeFilter = 'all'; // 'all' | 'tagged' | 'candidate'

// ------------------------------------------------------------
// 起動
// ------------------------------------------------------------
async function main() {
  const loadingEl = document.getElementById('loading');
  const errorEl   = document.getElementById('error');

  let data;
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    console.error(e);
    loadingEl.hidden = true;
    errorEl.hidden = false;
    return;
  }

  concepts = (data.concepts || [])
    .map(c => {
      const eps = Array.isArray(c.episodes) ? c.episodes : [];
      return {
        name:        c.name || '',
        description: c.description || '',
        status:      c.status === 'tagged' ? 'tagged' : 'candidate',
        episodes:    eps,
        count:       eps.length,
        searchText:  normalize(`${c.name} ${c.description || ''} ${eps.map(e => e.title || '').join(' ')}`),
      };
    })
    .sort((a, b) => b.count - a.count); // 登場エピソード数の多い順

  loadingEl.hidden = true;
  bindSearch();
  bindFilter();
  render();
}

// ------------------------------------------------------------
// 検索ボックス（episodes.js と同じ挙動）
// ------------------------------------------------------------
function bindSearch() {
  const input = document.getElementById('search-input');
  const btn   = document.getElementById('search-btn');

  input.addEventListener('input', render);
  btn.addEventListener('click', () => { render(); input.blur(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
  });
}

// ------------------------------------------------------------
// フィルター（すべて／タグ済み／未タグ）
// ------------------------------------------------------------
function bindFilter() {
  const chips = document.querySelectorAll('.filter-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      activeFilter = chip.dataset.filter;
      chips.forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
      render();
    });
  });
}

// ------------------------------------------------------------
// フィルタ（状態＋検索のAND）
// ------------------------------------------------------------
function currentResults() {
  const q = normalize(document.getElementById('search-input').value.trim());
  return concepts.filter(c => {
    if (activeFilter !== 'all' && c.status !== activeFilter) return false;
    if (q && !c.searchText.includes(q)) return false;
    return true;
  });
}

// ------------------------------------------------------------
// 描画
// ------------------------------------------------------------
function render() {
  const list    = document.getElementById('concept-list');
  const emptyEl = document.getElementById('empty');
  const countEl = document.getElementById('result-count');
  const query   = document.getElementById('search-input').value.trim();

  const results = currentResults();
  countEl.textContent = query
    ? `${results.length}件みつかりました`
    : `${FILTER_LABEL[activeFilter]}：${results.length}件`;

  list.innerHTML = '';
  emptyEl.hidden = results.length !== 0;

  results.forEach(c => {
    const li = document.createElement('li');
    li.className = 'concept-card';

    const statusLabel = c.status === 'tagged' ? 'タグ済み' : '未タグ';
    const statusClass = c.status === 'tagged' ? 'is-tagged' : 'is-candidate';

    const epsHtml = c.episodes.map(e =>
      `<a href="${GRAPH_PAGE}?ep=${encodeURIComponent(e.id)}">${esc(e.title || ('第' + e.id + '回'))}</a>`
    ).join('');

    li.innerHTML = `
      <span class="concept-status ${statusClass}">${statusLabel}</span>
      <h2 class="concept-name">${esc(c.name)}</h2>
      ${c.description ? `<p class="concept-desc">${esc(c.description)}</p>` : ''}
      <span class="concept-count">${c.count}エピソード</span>
      ${c.count ? `<button class="concept-more" aria-expanded="false">登場エピソードをみる ▾</button>
      <div class="concept-eps" hidden>${epsHtml}</div>` : ''}
    `;

    const moreBtn = li.querySelector('.concept-more');
    if (moreBtn) {
      const epsEl = li.querySelector('.concept-eps');
      moreBtn.addEventListener('click', () => {
        const open = epsEl.hidden;
        epsEl.hidden = !open;
        moreBtn.setAttribute('aria-expanded', String(open));
        moreBtn.textContent = open ? 'とじる ▴' : '登場エピソードをみる ▾';
      });
    }

    list.appendChild(li);
  });
}

main();
