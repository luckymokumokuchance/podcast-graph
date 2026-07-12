// ============================================================
// ラッキーもくもくチャンス - 未タグ化の概念 一覧＆検索
// GASの ?type=concepts を唯一のデータソースとして使う。
// ショーノートに書いた ## が「未タグ化(candidate)」として自動で並ぶ。
// （# に変える＝1文字消すだけでグラフに昇格。追加入力は不要）
// ============================================================

// ▼ graph.js / episodes.js と同じURL
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxk2jQTHhowhGTXBAMsAcEZWbjELoxQAoSEkVy8EIMHuwXsgO_H6xxNqJPiqsvj5Dnd/exec';
// ▲ テスト時は untagged.html?src=mock.json のように差し替え可能。
//   指定が無ければ concepts エンドポイントを見る。
const _src = new URLSearchParams(location.search).get('src');
const DATA_URL = _src || (GAS_URL + '?type=concepts');

// 関連エピソードのリンク先（グラフの既存ディープリンク ?ep=<id>）
const GRAPH_PAGE = 'index.html';

// ------------------------------------------------------------
// 検索用の正規化：全角半角をそろえ、小文字化し、カタカナ→ひらがな
// （episodes.js と同一。「ハッフルパフ」でも「はっふるぱふ」でもヒット）
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
let concepts = [];   // {name, description, episodes:[{id,title}], count, searchText}

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
    .filter(c => c.status === 'candidate')   // このページは「未タグ化」だけ
    .map(c => {
      const eps = Array.isArray(c.episodes) ? c.episodes : [];
      return {
        name:        c.name || '',
        description: c.description || '',
        episodes:    eps,
        count:       eps.length,
        searchText:  normalize(`${c.name} ${c.description || ''} ${eps.map(e => e.title || '').join(' ')}`),
      };
    })
    .sort((a, b) => b.count - a.count); // 登場エピソード数の多い順

  loadingEl.hidden = true;
  bindSearch();
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
// フィルタ
// ------------------------------------------------------------
function currentResults() {
  const q = normalize(document.getElementById('search-input').value.trim());
  return concepts.filter(c => !q || c.searchText.includes(q));
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
    : `全${concepts.length}件`;

  list.innerHTML = '';
  emptyEl.hidden = results.length !== 0;

  results.forEach(c => {
    const li = document.createElement('li');
    li.className = 'concept-card';

    const epsHtml = c.episodes.map(e =>
      `<a href="${GRAPH_PAGE}?ep=${encodeURIComponent(e.id)}">${esc(e.title || ('第' + e.id + '回'))}</a>`
    ).join('');

    li.innerHTML = `
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
