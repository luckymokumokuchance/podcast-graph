// ============================================================
// admin.js — GitHubログイン(OAuth) → links.json をコミット
// ============================================================

// ▼▼▼ セットアップ後にここを差し替える（PLAN.md 参照）▼▼▼
const CLIENT_ID  = 'YOUR_GITHUB_OAUTH_CLIENT_ID';
const WORKER_URL = 'https://YOUR-WORKER.workers.dev'; // 末尾スラッシュ無し
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

const REPO_OWNER = 'luckymokumokuchance';
const REPO_NAME  = 'podcast-graph';
const FILE_PATH  = 'app/links.json';
const BRANCH     = 'feature/logo-deco';

const TOKEN_KEY = 'lmc_gh_token';
let token = localStorage.getItem(TOKEN_KEY) || '';
let episodes = [];
let links = [];   // [{source,target,reason}]
let fileSha = null;

// ---------- OAuth ----------
function startLogin() {
  const redirect = location.origin + location.pathname; // admin.html に戻る
  const url = `https://github.com/login/oauth/authorize`
    + `?client_id=${CLIENT_ID}`
    + `&scope=repo`
    + `&redirect_uri=${encodeURIComponent(WORKER_URL + '/callback?back=' + encodeURIComponent(redirect))}`;
  location.href = url;
}

// Worker が ?token=... を付けて admin.html に戻してくる想定
function captureTokenFromUrl() {
  const p = new URLSearchParams(location.search);
  const t = p.get('token');
  if (t) {
    token = t;
    localStorage.setItem(TOKEN_KEY, t);
    history.replaceState({}, '', location.pathname); // URLからトークン消す
  }
}

function logout() {
  token = '';
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
}

async function ghUser() {
  const r = await fetch('https://api.github.com/user', {
    headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github+json' },
  });
  if (!r.ok) return null;
  return r.json();
}

// ---------- links.json 読み書き ----------
async function loadFile() {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}?ref=${BRANCH}`;
  const r = await fetch(url, { headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github+json' } });
  if (r.ok) {
    const j = await r.json();
    fileSha = j.sha;
    const decoded = decodeURIComponent(escape(atob(j.content.replace(/\n/g, ''))));
    links = (JSON.parse(decoded).links) || [];
  } else {
    fileSha = null;
    links = [];
  }
}

async function saveFile() {
  const status = document.getElementById('save-status');
  status.textContent = '保存中…';
  const body = JSON.stringify({ links }, null, 2) + '\n';
  const content = btoa(unescape(encodeURIComponent(body)));
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({
      message: 'admin: update links.json',
      content, sha: fileSha || undefined, branch: BRANCH,
    }),
  });
  if (r.ok) {
    const j = await r.json();
    fileSha = j.content.sha;
    status.textContent = '保存しました（約1分で反映）';
  } else if (r.status === 403 || r.status === 404) {
    status.textContent = '保存できません: このリポジトリへの書き込み権限がありません（管理者のみ）';
  } else {
    status.textContent = '保存に失敗: ' + r.status;
  }
}

// ---------- UI ----------
function fillEpisodeSelects() {
  const opts = episodes.map((e) => `<option value="${e.id}">${String(e.num).padStart(3, '0')} ${e.title}</option>`).join('');
  document.getElementById('add-source').innerHTML = opts;
  document.getElementById('add-target').innerHTML = opts;
}

function titleOf(id) {
  const e = episodes.find((x) => x.id === Number(id));
  return e ? `${String(e.num).padStart(3, '0')} ${e.title}` : `#${id}`;
}

function renderLinks() {
  const tb = document.querySelector('#link-table tbody');
  tb.innerHTML = links.map((l, i) => `
    <tr>
      <td>${titleOf(l.source)}</td>
      <td>${titleOf(l.target)}</td>
      <td><input data-i="${i}" class="reason-in" value="${(l.reason || '').replace(/"/g, '&quot;')}" /></td>
      <td><button class="del-btn" data-i="${i}">×</button></td>
    </tr>`).join('');
  tb.querySelectorAll('.reason-in').forEach((inp) => {
    inp.onchange = () => { links[Number(inp.dataset.i)].reason = inp.value; };
  });
  tb.querySelectorAll('.del-btn').forEach((b) => {
    b.onclick = () => { links.splice(Number(b.dataset.i), 1); renderLinks(); };
  });
}

function addLink() {
  const s = Number(document.getElementById('add-source').value);
  const t = Number(document.getElementById('add-target').value);
  const reason = document.getElementById('add-reason').value.trim();
  if (s === t) { alert('同じ回同士はつなげません'); return; }
  if (links.some((l) => Number(l.source) === s && Number(l.target) === t)) { alert('既に存在します'); return; }
  links.push({ source: s, target: t, reason });
  document.getElementById('add-reason').value = '';
  renderLinks();
}

// ---------- 起動 ----------
async function init() {
  captureTokenFromUrl();
  document.getElementById('login').onclick = startLogin;
  document.getElementById('logout').onclick = logout;

  // エピソード一覧はRSSから（ログイン不要）
  try {
    const d = await window.PodcastData.load();
    episodes = d.episodes;
  } catch (e) { console.error(e); }

  if (!token) return; // 未ログインならゲート表示のまま

  const user = await ghUser();
  if (!user) { logout(); return; }

  document.getElementById('who').textContent = '@' + user.login;
  document.getElementById('login').classList.add('hidden');
  document.getElementById('logout').classList.remove('hidden');
  document.getElementById('gate').classList.add('hidden');
  document.getElementById('editor').classList.remove('hidden');

  await loadFile();
  fillEpisodeSelects();
  renderLinks();
  document.getElementById('add-btn').onclick = addLink;
  document.getElementById('save-btn').onclick = saveFile;
}

init();
