// ============================================================
// ラッキーもくもくチャンス - INSPIRED（本/映画/アニメ・ドラマ/音楽/ラジオ 一覧）（app/版）
// ショーノートの 📚🎬📺🎵📻 マーカーから自動抽出された作品を一覧表示する。
// root版との違いはデータ取得元だけ（PodcastData.loadWorksPayload()）。
// ============================================================

const _src = new URLSearchParams(location.search).get('src');
const GRAPH_PAGE = 'index.html';

const FILTER_LABEL = {
  all:   'すべて',
  book:  '📚 本',
  movie: '🎬 映画',
  anime: '📺 アニメ/ドラマ',
  music: '🎵 音楽',
  radio: '📻 ラジオ/ポッドキャスト',
};

// 画像が無い時のプレースホルダー絵文字
const TYPE_EMOJI = { book: '📚', movie: '🎬', anime: '📺', music: '🎵', radio: '📻' };

// ------------------------------------------------------------
// 検索用の正規化
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
let works = [];           // {title,type,type_label,creator,image_url,link_url,description,episodes:[{id,title}],count,searchText}
let activeFilter = 'all'; // 'all' | 'book' | 'movie' | 'anime' | 'music' | 'radio'

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
      data = await window.PodcastData.loadWorksPayload();
    }
  } catch (e) {
    console.error(e);
    loadingEl.hidden = true;
    errorEl.hidden = false;
    return;
  }

  works = (data.works || [])
    .map(w => {
      const eps = Array.isArray(w.episodes) ? w.episodes : [];
      return {
        title:       w.title || '',
        type:        w.type || '',
        type_label:  w.type_label || '',
        creator:     w.creator || '',
        image_url:   w.image_url || '',
        link_url:    w.link_url || '',
        description: w.description || '',
        episodes:    eps,
        count:       eps.length,
        searchText:  normalize(
          `${w.title} ${w.creator || ''} ${w.description || ''} ${eps.map(e => e.title || '').join(' ')}`
        ),
      };
    })
    .sort((a, b) => b.count - a.count); // 登場エピソード数の多い順

  loadingEl.hidden = true;
  bindSearch();
  bindFilter();
  render();
}

// ------------------------------------------------------------
// 検索ボックス
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
// フィルター（すべて／本／映画／アニメ・ドラマ／音楽／ラジオ）
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
// フィルタ（種別＋検索のAND）
// ------------------------------------------------------------
function currentResults() {
  const q = normalize(document.getElementById('search-input').value.trim());
  return works.filter(w => {
    if (activeFilter !== 'all' && w.type !== activeFilter) return false;
    if (q && !w.searchText.includes(q)) return false;
    return true;
  });
}

// ------------------------------------------------------------
// 描画
// ------------------------------------------------------------
function render() {
  const list    = document.getElementById('work-list');
  const emptyEl = document.getElementById('empty');
  const countEl = document.getElementById('result-count');
  const query   = document.getElementById('search-input').value.trim();

  const results = currentResults();
  countEl.textContent = query
    ? `${results.length}件みつかりました`
    : `${FILTER_LABEL[activeFilter]}：${results.length}件`;

  list.innerHTML = '';
  emptyEl.hidden = results.length !== 0;

  results.forEach(w => {
    const li = document.createElement('li');
    li.className = 'work-card';

    const thumbHtml = w.image_url
      ? `<img class="work-thumb" src="${esc(w.image_url)}" alt="" loading="lazy">`
      : `<span class="work-thumb-placeholder" aria-hidden="true">${TYPE_EMOJI[w.type] || '❔'}</span>`;

    const titleHtml = w.link_url
      ? `<a href="${esc(w.link_url)}" target="_blank" rel="noopener">${esc(w.title)}</a>`
      : esc(w.title);

    const epsHtml = w.episodes.map(e =>
      `<a href="${GRAPH_PAGE}?ep=${encodeURIComponent(e.id)}">${esc(e.title || ('第' + e.id + '回'))}</a>`
    ).join('');

    li.innerHTML = `
      <div class="work-head">
        ${thumbHtml}
        <div class="work-head-text">
          <span class="work-type">${esc(w.type_label)}</span>
          <h2 class="work-title">${titleHtml}</h2>
          ${w.creator ? `<p class="work-creator">${esc(w.creator)}</p>` : ''}
        </div>
      </div>
      ${w.description ? `<p class="work-desc">${esc(w.description)}</p>` : ''}
      <span class="work-count">${w.count}エピソード</span>
      ${w.count ? `<button class="work-more" aria-expanded="false">登場エピソードをみる ▾</button>
      <div class="work-eps" hidden>${epsHtml}</div>` : ''}
    `;

    const moreBtn = li.querySelector('.work-more');
    if (moreBtn) {
      const epsEl = li.querySelector('.work-eps');
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
