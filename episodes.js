// ============================================================
// ラッキーもくもくチャンス - エピソード一覧＆検索
// グラフと同じ GAS JSON を唯一のデータソースとして使う。
// （スプレッドシートに1回書けば、グラフにもこの一覧にも反映される）
// ============================================================

// ▼ グラフ(graph.js)と同じURLにしてください
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxk2jQTHhowhGTXBAMsAcEZWbjELoxQAoSEkVy8EIMHuwXsgO_H6xxNqJPiqsvj5Dnd/exec';
// ▲ テスト時は episodes.html?src=mock.json のように差し替え可能
const DATA_URL = new URLSearchParams(location.search).get('src') || GAS_URL;

// ------------------------------------------------------------
// 検索用の正規化：全角半角をそろえ、小文字化し、カタカナ→ひらがな
// 「ハッフルパフ」でも「はっふるぱふ」でもヒットさせる
// ------------------------------------------------------------
function normalize(str) {
  return String(str || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

// エピソード番号の表示（"5" → "005"、"ep05" → "005"）
function formatEpId(id) {
  const m = String(id).match(/(\d+)/);
  return m ? m[1].padStart(3, '0') : String(id);
}

// 並び順用の数値
function epNum(id) {
  const m = String(id).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

// Spotify URL → 埋め込みURL
function spotifyEmbedUrl(url) {
  const m = String(url || '').match(
    /open\.spotify\.com\/(?:intl-[a-z]+\/)?(episode|show)\/([A-Za-z0-9]+)/);
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}` : null;
}

// shownote → 検索・抜粋用のプレーンテキスト
// （#タグ, [img:], Markdown記号, URL を除去）
function toPlainText(shownote) {
  return String(shownote || '')
    .replace(/\[img:[^\]]*\]/g, ' ')
    .replace(/#[^\s#、。！？…「」『』【】（）]+/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#*_`>\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// shownote内の #タグ を配列で
function extractTags(shownote) {
  const m = String(shownote || '').match(/#([^\s#、。！？…「」『』【】（）]+)/g) || [];
  return [...new Set(m.map(t => t.slice(1)))];
}

// HTMLエスケープ
function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// プレーンテキストから、検索語の周辺を抜粋し <mark> でハイライト
function excerptWithHighlight(plain, query, maxLen = 140) {
  const nPlain = normalize(plain);
  const nQuery = normalize(query);

  let start = 0;
  let hit = -1;
  if (nQuery) hit = nPlain.indexOf(nQuery);
  if (hit > 40) start = hit - 30;

  let slice = plain.slice(start, start + maxLen);
  const prefix = start > 0 ? '…' : '';
  const suffix = start + maxLen < plain.length ? '…' : '';

  if (!nQuery) return esc(prefix + slice + suffix);

  // 正規化後の位置と元文字列の位置は1対1（NFKC/大小/カナ変換は長さ不変が前提。
  // 万一ズレる文字が混ざっても表示が崩れるだけで安全側）
  const nSlice = normalize(slice);
  const parts = [];
  let cursor = 0;
  let idx;
  while ((idx = nSlice.indexOf(nQuery, cursor)) !== -1) {
    parts.push(esc(slice.slice(cursor, idx)));
    parts.push('<mark>' + esc(slice.slice(idx, idx + nQuery.length)) + '</mark>');
    cursor = idx + nQuery.length;
  }
  parts.push(esc(slice.slice(cursor)));
  return esc(prefix) + parts.join('') + esc(suffix);
}

// [img:key] → <img> 展開 → Markdown（graph.js v19 と同じ挙動）
function renderShownote(text, imageMap) {
  if (!text) return '';
  const withImages = String(text).replace(/\[img:([^\]]+)\]/g, (match, key) => {
    const fileId = imageMap[key.trim()];
    if (!fileId) return match;
    return `<img class="shownote-img" src="https://lh3.googleusercontent.com/d/${fileId}=w800" alt="${esc(key)}">`;
  });
  if (typeof marked !== 'undefined') {
    return marked.parse(withImages, { breaks: true, gfm: true });
  }
  return esc(withImages).replace(/\n/g, '<br>');
}

// ------------------------------------------------------------
// 状態
// ------------------------------------------------------------
let episodes = [];   // {id, num, title, url, shownote, plain, tags, date, searchText}
let imageMap = {};
let activeTags = new Set();

// ------------------------------------------------------------
// 起動
// ------------------------------------------------------------
async function main() {
  const loadingEl = document.getElementById('loading');
  const errorEl   = document.getElementById('error');

  if (typeof marked !== 'undefined') {
    marked.use({
      hooks: {
        postprocess(html) {
          return html.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
        }
      }
    });
  }

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

  imageMap = data.images || {};

  episodes = (data.nodes || [])
    .filter(n => n.type === 'episode')
    .map(n => {
      const plain = toPlainText(n.summary);
      const tags  = extractTags(n.summary);
      return {
        id:       n.id,
        num:      epNum(n.id),
        title:    n.title || '',
        url:      n.url || '',
        shownote: n.summary || '',
        date:     n.published_at || '',   // GAS側が対応していれば表示
        plain,
        tags,
        searchText: normalize(`${formatEpId(n.id)} ${n.title} ${plain} ${tags.join(' ')}`),
      };
    })
    .sort((a, b) => b.num - a.num); // 新しい順

  loadingEl.hidden = true;
  buildTagChips();
  bindSearch();
  render();
}

// ------------------------------------------------------------
// タグチップ（出現数の多い順）
// ------------------------------------------------------------
function buildTagChips() {
  const count = {};
  episodes.forEach(ep => ep.tags.forEach(t => { count[t] = (count[t] || 0) + 1; }));
  const tags = Object.keys(count).sort((a, b) => count[b] - count[a]);

  const row = document.getElementById('tag-row');
  row.innerHTML = '';
  tags.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'tag-chip';
    btn.textContent = '# ' + tag;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      const on = activeTags.has(tag);
      if (on) activeTags.delete(tag); else activeTags.add(tag);
      btn.setAttribute('aria-pressed', String(!on));
      render();
    });
    row.appendChild(btn);
  });
}

// ------------------------------------------------------------
// 検索ボックス
// ------------------------------------------------------------
function bindSearch() {
  const input = document.getElementById('search-input');
  const clear = document.getElementById('search-clear');

  input.addEventListener('input', () => {
    clear.hidden = input.value === '';
    render();
  });
  clear.addEventListener('click', () => {
    input.value = '';
    clear.hidden = true;
    input.focus();
    render();
  });
}

// ------------------------------------------------------------
// フィルタ＆描画
// ------------------------------------------------------------
function currentResults() {
  const q = normalize(document.getElementById('search-input').value.trim());
  return episodes.filter(ep => {
    if (q && !ep.searchText.includes(q)) return false;
    for (const t of activeTags) {
      if (!ep.tags.includes(t)) return false;
    }
    return true;
  });
}

function render() {
  const list    = document.getElementById('episode-list');
  const emptyEl = document.getElementById('empty');
  const countEl = document.getElementById('result-count');
  const query   = document.getElementById('search-input').value.trim();

  const results = currentResults();
  countEl.textContent =
    (query || activeTags.size) ? `${results.length}件みつかりました` : `全${episodes.length}話`;

  list.innerHTML = '';
  emptyEl.hidden = results.length !== 0;

  results.forEach(ep => {
    const li = document.createElement('li');
    li.className = 'ep-card';

    const tagsHtml = ep.tags.map(t => `<span class="ep-tag"># ${esc(t)}</span>`).join('');
    const embed = spotifyEmbedUrl(ep.url);

    li.innerHTML = `
      <div class="ep-head">
        <span class="ep-num">${esc(formatEpId(ep.id))}</span>
        <h2 class="ep-title">${esc(ep.title)}</h2>
      </div>
      ${ep.date ? `<p class="ep-date">${esc(String(ep.date).slice(0, 10))}</p>` : ''}
      <p class="ep-excerpt">${excerptWithHighlight(ep.plain, query)}</p>
      ${tagsHtml ? `<div class="ep-tags">${tagsHtml}</div>` : ''}
      ${ep.shownote ? `<button class="ep-more" aria-expanded="false">ショーノートをひらく ▾</button>
      <div class="ep-shownote" hidden></div>` : ''}
      <div class="ep-player"></div>
    `;

    // ショーノート開閉（開いた時に初めてMarkdownを描画）
    const moreBtn = li.querySelector('.ep-more');
    if (moreBtn) {
      const noteEl = li.querySelector('.ep-shownote');
      moreBtn.addEventListener('click', () => {
        const open = noteEl.hidden;
        if (open && !noteEl.innerHTML) {
          noteEl.innerHTML = renderShownote(ep.shownote, imageMap);
        }
        noteEl.hidden = !open;
        moreBtn.setAttribute('aria-expanded', String(open));
        moreBtn.textContent = open ? 'ショーノートをとじる ▴' : 'ショーノートをひらく ▾';
      });
    }

    // プレイヤー（Spotifyなら埋め込み・それ以外はリンク）
    const playerEl = li.querySelector('.ep-player');
    if (embed) {
      const iframe = document.createElement('iframe');
      iframe.src = embed;
      iframe.loading = 'lazy';
      iframe.allow = 'encrypted-media';
      iframe.title = `${ep.title} を再生`;
      playerEl.appendChild(iframe);
    } else if (ep.url) {
      playerEl.innerHTML =
        `<a class="ep-listen" href="${esc(ep.url)}" target="_blank" rel="noopener noreferrer">聴く →</a>`;
    }

    list.appendChild(li);
  });
}

main();
