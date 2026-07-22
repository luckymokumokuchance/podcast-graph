// ============================================================
// admin.js — トークンでログイン → links.json を編集してコミット
//   （OAuthログインを使いたい場合は oauth-worker.js を設定。今は未使用でも動く）
// ============================================================
const REPO_OWNER = 'luckymokumokuchance';
const REPO_NAME  = 'podcast-graph';
const FILE_PATH  = 'app/links.json';
const BRANCH     = 'feature/logo-deco';
const TOKEN_KEY  = 'lmc_gh_token';
const GH = 'https://api.github.com';

let token    = localStorage.getItem(TOKEN_KEY) || '';
let episodes = [];
let epById   = {};
let links    = [];        // 作業中 [{source,target,reason}]
let original = '[]';      // 比較用スナップショット(JSON)
let fileSha  = null;

const $ = (id) => document.getElementById(id);

// ---------- ユーティリティ ----------
function pad(n) { return String(n).padStart(3, '0'); }
function epLabel(id) { const e = epById[id]; return e ? `${pad(e.num)} ${e.title}` : `#${id}`; }
function parseEpId(str) {
  if (!str) return null;
  const m = String(str).match(/^\s*0*(\d+)/);       // 先頭の話数
  if (m) { const id = parseInt(m[1], 10); if (epById[id]) return id; }
  const hit = episodes.find((e) => e.title === String(str).trim());  // タイトル一致
  return hit ? hit.id : null;
}
function isDirty() { return JSON.stringify(links) !== original; }
function refreshDirty() { $('save').disabled = !isDirty(); }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------- GitHub API ----------
async function ghUser() {
  const r = await fetch(`${GH}/user`, { headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github+json' } });
  return r.ok ? r.json() : null;
}
async function loadFile() {
  const r = await fetch(`${GH}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}?ref=${BRANCH}`,
    { headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github+json' } });
  if (r.ok) {
    const j = await r.json();
    fileSha = j.sha;
    const decoded = decodeURIComponent(escape(atob(j.content.replace(/\n/g, ''))));
    links = (JSON.parse(decoded).links) || [];
  } else { fileSha = null; links = []; }
  original = JSON.stringify(links);
}
async function saveFile() {
  const msg = $('save-msg');
  msg.textContent = '保存中…';
  const body = JSON.stringify({ links }, null, 2) + '\n';
  const content = btoa(unescape(encodeURIComponent(body)));
  const r = await fetch(`${GH}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`, {
    method: 'PUT',
    headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ message: 'admin: update links.json', content, sha: fileSha || undefined, branch: BRANCH }),
  });
  if (r.ok) {
    const j = await r.json();
    fileSha = j.content.sha;
    original = JSON.stringify(links);
    refreshDirty();
    msg.textContent = '保存しました。星図には約1分で反映されます。';
  } else if (r.status === 403 || r.status === 404) {
    msg.textContent = '保存できません: このリポジトリへの書き込み権限がありません。';
  } else if (r.status === 409) {
    msg.textContent = '競合が発生しました。ページを再読み込みしてやり直してください。';
  } else {
    msg.textContent = '保存に失敗しました (' + r.status + ')';
  }
}

// ---------- 描画 ----------
function fillDatalist() {
  $('ep-list').innerHTML = episodes.map((e) => `<option value="${esc(pad(e.num) + ' ' + e.title)}"></option>`).join('');
  $('cnt-eps').textContent = episodes.length;
}
function renderLinks() {
  $('cnt-links').textContent = links.length;
  const q = ($('filter').value || '').trim().toLowerCase();
  const list = $('link-list');
  const idx = links.map((l, i) => ({ l, i }))
    .sort((a, b) => (epById[a.l.source]?.num || 0) - (epById[b.l.source]?.num || 0));

  const visible = idx.filter(({ l }) => {
    if (!q) return true;
    const hay = (epLabel(l.source) + ' ' + epLabel(l.target) + ' ' + (l.reason || '')).toLowerCase();
    return hay.includes(q);
  });

  if (!visible.length) { list.innerHTML = `<div class="empty">${links.length ? '一致するリンクがありません' : 'まだリンクがありません。上の「新しいリンクを追加」から登録してください。'}</div>`; }
  else list.innerHTML = visible.map(({ l, i }) => `
    <div class="link-card">
      <div class="lc-pair"><span class="ep">${esc(epLabel(l.source))}</span><span class="via">—</span><span class="ep">${esc(epLabel(l.target))}</span></div>
      <button class="lc-del" data-i="${i}" title="削除">×</button>
      <div class="lc-reason"><input data-i="${i}" class="reason-in" value="${esc(l.reason || '')}" placeholder="理由（任意）" /></div>
    </div>`).join('');

  list.querySelectorAll('.reason-in').forEach((inp) => {
    inp.oninput = () => { links[Number(inp.dataset.i)].reason = inp.value; refreshDirty(); };
  });
  list.querySelectorAll('.lc-del').forEach((b) => {
    b.onclick = () => { links.splice(Number(b.dataset.i), 1); renderLinks(); refreshDirty(); };
  });
  refreshDirty();
}

function addLink() {
  const msg = $('add-msg'); msg.textContent = '';
  const s = parseEpId($('add-source').value);
  const t = parseEpId($('add-target').value);
  if (!s || !t) { msg.textContent = '起点・終点を一覧から選んでください'; return; }
  if (s === t) { msg.textContent = '同じ回同士はつなげません'; return; }
  const dup = links.some((l) => (Number(l.source) === s && Number(l.target) === t) || (Number(l.source) === t && Number(l.target) === s));
  if (dup) { msg.textContent = 'そのリンクは既に登録されています'; return; }
  links.push({ source: s, target: t, reason: $('add-reason').value.trim() });
  $('add-source').value = ''; $('add-target').value = ''; $('add-reason').value = '';
  renderLinks();
}

// ---------- ログイン ----------
async function enter(tok) {
  const msg = $('gate-msg'); msg.textContent = '確認中…';
  token = tok.trim();
  const user = await ghUser();
  if (!user) { token = ''; msg.textContent = 'トークンが無効です。もう一度確認してください。'; return; }
  localStorage.setItem(TOKEN_KEY, token);
  $('who').textContent = '@' + user.login;
  $('gate').classList.add('hidden');
  $('editor').classList.remove('hidden');
  $('logout').classList.remove('hidden');
  await loadFile();
  fillDatalist();
  renderLinks();
}
function logout() { localStorage.removeItem(TOKEN_KEY); location.reload(); }

// ---------- 起動 ----------
async function init() {
  try { const d = await window.PodcastData.load(); episodes = d.episodes; epById = {}; episodes.forEach((e) => { epById[e.id] = e; }); }
  catch (e) { console.error(e); }

  $('enter').onclick = () => enter($('tok').value);
  $('tok').onkeydown = (e) => { if (e.key === 'Enter') enter($('tok').value); };
  $('logout').onclick = logout;
  $('add').onclick = addLink;
  $('save').onclick = saveFile;
  $('filter').oninput = renderLinks;

  if (token) enter(token);   // 保存済みトークンで自動ログイン
}
init();
