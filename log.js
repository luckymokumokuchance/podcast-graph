// ============================================================
// ラッキーもくもくチャンス - LOG一覧＆検索
// episodes.js と同じGAS Web Appを ?type=logs で叩く。
// ============================================================

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxk2jQTHhowhGTXBAMsAcEZWbjELoxQAoSEkVy8EIMHuwXsgO_H6xxNqJPiqsvj5Dnd/exec';

// 本文がこの文字数を超えたら折りたたむ（▼全文表示ボタンを出す）
const COLLAPSE_THRESHOLD = 400;

const els = {
  loading: document.getElementById('loading'),
  error: document.getElementById('error'),
  empty: document.getElementById('empty'),
  list: document.getElementById('log-list'),
  searchInput: document.getElementById('search-input'),
  searchBtn: document.getElementById('search-btn'),
  resultCount: document.getElementById('result-count'),
};

let allLogs = [];

init();

async function init() {
  try {
    const res = await fetch(`${GAS_URL}?type=logs`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allLogs = Array.isArray(data.logs) ? data.logs : [];

    els.loading.hidden = true;

    if (allLogs.length === 0) {
      els.empty.hidden = false;
      return;
    }

    els.list.hidden = false;
    render(allLogs);

    els.searchInput.addEventListener('input', onSearch);
    els.searchBtn.addEventListener('click', onSearch);
  } catch (err) {
    console.error('[log.js] fetch failed', err);
    els.loading.hidden = true;
    els.error.hidden = false;
  }
}

function onSearch() {
  const rawQuery = els.searchInput.value.trim();
  if (!rawQuery) {
    render(allLogs);
    return;
  }
  const q = normalize(rawQuery);
  const filtered = allLogs.filter(log => {
    const haystack = normalize(`${log.title} ${log.body}`);
    return haystack.includes(q);
  });
  render(filtered, rawQuery);
}

function render(logs, highlightQuery) {
  els.resultCount.textContent = highlightQuery
    ? `${logs.length}件ヒット`
    : `全${logs.length}件`;

  if (logs.length === 0) {
    els.list.innerHTML = '';
    els.empty.hidden = false;
    els.list.hidden = true;
    return;
  }
  els.empty.hidden = true;
  els.list.hidden = false;

  els.list.innerHTML = logs.map(log => renderCard(log, highlightQuery)).join('');

  // 折りたたみトグルのイベントを付与
  els.list.querySelectorAll('.log-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const body = btn.previousElementSibling;
      const collapsed = body.classList.toggle('is-collapsed');
      btn.textContent = collapsed ? '▼全文表示' : '▲たたむ';
    });
  });
}

function renderCard(log, highlightQuery) {
  const title = escapeHtml(log.title);
  const bodyEscaped = escapeHtml(log.body);
  const bodyHtml = highlightQuery ? highlight(bodyEscaped, highlightQuery) : bodyEscaped;
  const titleHtml = highlightQuery ? highlight(title, highlightQuery) : title;

  const isLong = (log.body || '').length > COLLAPSE_THRESHOLD;
  const collapsedClass = isLong ? ' is-collapsed' : '';
  const toggleBtn = isLong ? `<button type="button" class="log-toggle">▼全文表示</button>` : '';

  const authorBadge = log.author
    ? `<span class="log-author">${escapeHtml(log.author)}</span>`
    : '';

  return `
    <li class="log-card">
      <div class="log-head">
        <h2 class="log-title">${titleHtml}</h2>
        <div class="log-meta">
          <span class="log-date">${escapeHtml(log.date || '')}</span>
          ${authorBadge}
        </div>
      </div>
      <div class="log-body${collapsedClass}">${bodyHtml}</div>
      ${toggleBtn}
    </li>
  `;
}

// ---------- 検索語ハイライト ----------
function highlight(escapedHtml, rawQuery) {
  const q = escapeRegExp(rawQuery.trim());
  if (!q) return escapedHtml;
  const re = new RegExp(q, 'gi');
  return escapedHtml.replace(re, m => `<mark>${m}</mark>`);
}

// ---------- ひらがな・カタカナ・全角半角を吸収した比較用正規化 ----------
function normalize(str) {
  return String(str || '')
    .toLowerCase()
    // カタカナ→ひらがな
    .replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    // 全角英数→半角
    .replace(/[\uff01-\uff5e]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    // 空白除去
    .replace(/\s+/g, '');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
