// ============================================================
// ラッキーもくもくチャンス - 概念一覧（タグ済み＋未タグ 統合）（app/版）
// root版との違いはデータ取得元だけ：
//   root : GASの ?type=concepts を直接叩く
//   app  : PodcastData.loadConceptsPayload()（ショーノートから毎回計算＋
//          concepts-meta.jsonをマージ。GAS不要）
//   #  … タグ化済み（グラフにも出る）      → status: 'tagged'
//   ## … 未タグ（グラフには出さない候補）   → status: 'candidate'
// ============================================================

// テスト時は concepts.html?src=mock.json のように差し替え可能
const _src = new URLSearchParams(location.search).get('src');

// 関連エピソードのリンク先（グラフの既存ディープリンク ?ep=<id>）
const GRAPH_PAGE = 'index.html';
// 概念の詳細ページ
const DETAIL_PAGE = 'concept.html';

const FILTER_LABEL = { all: 'すべて', tagged: 'タグ済み', candidate: '未タグ' };

// ------------------------------------------------------------
// 概念名リンクの見た目（自己完結。concepts.css を触らずに済むよう注入）
// ------------------------------------------------------------
(function injectConceptLinkStyle() {
  const css = `
    .concept-name a.concept-link { color: inherit; text-decoration: none; }
    .concept-name a.concept-link:hover .concept-name-text { text-decoration: underline; }
    .concept-link-arrow { margin-left: 6px; font-weight: 900; opacity: 0.55; }
    .concept-name a.concept-link:hover .concept-link-arrow { opacity: 1; }
  `;
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
})();

// ------------------------------------------------------------
// 検索用の正規化（episodes.js と同一）：全半角そろえ・小文字化・カタカナ→ひらがな
// ------------------------------------------------------------
function normalize(str) {
  return String(str || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, ch =>
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
    if (_src) {
      const res = await fetch(_src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } else {
      data = await window.PodcastData.loadConceptsPayload();
    }
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

    const detailHref = `${DETAIL_PAGE}?c=${encodeURIComponent(c.name)}`;

    const epsHtml = c.episodes.map(e =>
      `<a href="${GRAPH_PAGE}?ep=${encodeURIComponent(e.id)}">${esc(e.title || ('第' + e.id + '回'))}</a>`
    ).join('');

    li.innerHTML = `
      <span class="concept-status ${statusClass}">${statusLabel}</span>
      <h2 class="concept-name"><a class="concept-link" href="${detailHref}"><span class="concept-name-text">${esc(c.name)}</span><span class="concept-link-arrow">→</span></a></h2>
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
