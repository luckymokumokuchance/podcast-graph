// ============================================================
// logpost.js — 合言葉でログイン → app/logs.json を編集してコミット
//   admin.js（links.json用）と全く同じ合言葉・トークン方式を流用。
//   新しいトークンの発行は不要（同じ書き込みトークンを共有）。
// ============================================================
const REPO_OWNER = 'luckymokumokuchance';
const REPO_NAME  = 'podcast-graph';
const FILE_PATH  = 'app/logs.json';
const BRANCH     = 'feature/logo-deco';
const PASS_KEY   = 'lmc_pass';
const GH = 'https://api.github.com';

// 合言葉で復号する書き込みトークン（admin.jsと同一のもの。平文トークンはコードに存在しない）
const TOKEN_BLOB = '7MYtLy8EbcDXfNlqj4Ma249RSaW4RDkMzaCrHVDmfospkRJNFSkTOv+4Gyt8OQZXOxsacK3MghG5r8FMgzHon3BlU9/knsTgrIQbTASZJPCgiF8FXLgtEFkWgI7WhGPbSWCcgzahB+8OZ6KLjMLE18mkSGnVavdV4sOyuEApgp+HWKpAoWqvPus=';

async function decryptToken(passphrase) {
  const raw = Uint8Array.from(atob(TOKEN_BLOB), (c) => c.charCodeAt(0));
  const salt = raw.slice(0, 16), iv = raw.slice(16, 28), ct = raw.slice(28);
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

let token   = '';
let logs    = [];        // 作業中 [{id,title,body,author,date}]
let original = '[]';     // 比較用スナップショット(JSON)
let fileSha = null;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => new Date().toISOString().slice(0, 10);

function isDirty() { return JSON.stringify(logs) !== original; }
function refreshDirty() { $('save').disabled = !isDirty(); }

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
    logs = (JSON.parse(decoded).logs) || [];
  } else { fileSha = null; logs = []; }
  sortLogs();
  original = JSON.stringify(logs);
}
function sortLogs() {
  logs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.id || 0) - (a.id || 0)));
}
async function saveFile(commitMessage) {
  const msg = $('save-msg');
  msg.textContent = '保存中…';
  sortLogs();
  const body = JSON.stringify({ logs }, null, 2) + '\n';
  const content = btoa(unescape(encodeURIComponent(body)));
  const r = await fetch(`${GH}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`, {
    method: 'PUT',
    headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ message: commitMessage || 'log: update logs.json', content, sha: fileSha || undefined, branch: BRANCH }),
  });
  if (r.ok) {
    const j = await r.json();
    fileSha = j.content.sha;
    original = JSON.stringify(logs);
    refreshDirty();
    msg.textContent = '保存しました。サイトには約1分で反映されます。';
    return true;
  } else if (r.status === 403 || r.status === 404) {
    msg.textContent = '保存できません: このリポジトリへの書き込み権限がありません。';
  } else if (r.status === 409) {
    msg.textContent = '競合が発生しました。ページを再読み込みしてやり直してください。';
  } else {
    msg.textContent = '保存に失敗しました (' + r.status + ')';
  }
  return false;
}

// ---------- 描画 ----------
function renderLogs() {
  $('cnt-logs').textContent = logs.length;
  const q = ($('filter').value || '').trim().toLowerCase();
  const list = $('log-list');

  const visible = logs.filter((l) => {
    if (!q) return true;
    return ((l.title || '') + ' ' + (l.body || '')).toLowerCase().includes(q);
  });

  if (!visible.length) {
    list.innerHTML = `<div class="empty">${logs.length ? '一致するLOGがありません' : 'まだLOGがありません。上のフォームから投稿してください。'}</div>`;
    return;
  }

  list.innerHTML = visible.map((l) => `
    <div class="log-edit-card" data-id="${l.id}">
      <div class="log-edit-head">
        <input type="text" class="f-title" value="${esc(l.title || '')}" placeholder="タイトル" />
        <button class="log-edit-del" title="削除">×</button>
      </div>
      <textarea class="f-body" placeholder="本文">${esc(l.body || '')}</textarea>
      <div class="log-edit-meta">
        <select class="f-author">
          <option value="イノウエ" ${l.author === 'イノウエ' ? 'selected' : ''}>イノウエ</option>
          <option value="カワサキ" ${l.author === 'カワサキ' ? 'selected' : ''}>カワサキ</option>
        </select>
        <input type="date" class="f-date" value="${esc(l.date || '')}" />
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.log-edit-card').forEach((card) => {
    const id = Number(card.dataset.id);
    const entry = () => logs.find((l) => l.id === id);
    card.querySelector('.f-title').oninput = (e) => { entry().title = e.target.value; refreshDirty(); };
    card.querySelector('.f-body').oninput = (e) => { entry().body = e.target.value; refreshDirty(); };
    card.querySelector('.f-author').onchange = (e) => { entry().author = e.target.value; refreshDirty(); };
    card.querySelector('.f-date').onchange = (e) => { entry().date = e.target.value; refreshDirty(); };
    card.querySelector('.log-edit-del').onclick = () => {
      logs = logs.filter((l) => l.id !== id);
      renderLogs();
      refreshDirty();
    };
  });
  refreshDirty();
}

// ---------- 新規投稿（ちょっとした遊び心つき） ----------
const CHEERS = [
  'もくもくっと公開されました！☁️',
  '今日もひとつ、雲が増えました。',
  'いいログです。もくもく〜',
  '投稿ありがとう！また書いてね。',
  'もくもく、たしかに受け取りました。',
];

function nextId() {
  return logs.reduce((max, l) => Math.max(max, Number(l.id) || 0), 0) + 1;
}

function popPuffs(anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const emojis = ['☁️', '✨', '💨'];
  for (let i = 0; i < 5; i++) {
    const span = document.createElement('span');
    span.className = 'puff';
    span.textContent = emojis[i % emojis.length];
    span.style.left = (rect.left + rect.width / 2 + (Math.random() * 80 - 40)) + 'px';
    span.style.top = (rect.top + (Math.random() * 10)) + 'px';
    span.style.animationDelay = (Math.random() * 0.15) + 's';
    document.body.appendChild(span);
    setTimeout(() => span.remove(), 1300);
  }
}

async function addAndSave() {
  const msg = $('add-msg'); msg.textContent = '';
  const title = $('add-title').value.trim();
  const body  = $('add-body').value.trim();
  const author = $('add-author').value;
  const date  = $('add-date').value || todayStr();
  if (!title || !body) { msg.textContent = 'タイトルと本文は必須です'; return; }

  const btn = $('add');
  btn.disabled = true;
  const newEntry = { id: nextId(), title, body, author, date };
  logs.push(newEntry);

  const ok = await saveFile('log: 新規投稿「' + title + '」');
  btn.disabled = false;

  if (ok) {
    $('add-title').value = '';
    $('add-body').value = '';
    $('add-date').value = todayStr();
    renderLogs();
    popPuffs(btn);
    const cheer = $('post-cheer');
    cheer.textContent = CHEERS[Math.floor(Math.random() * CHEERS.length)];
    cheer.classList.remove('show'); void cheer.offsetWidth; // アニメーション再生のためリフロー
    cheer.classList.remove('hidden');
    cheer.classList.add('show');
  } else {
    // 保存に失敗した場合は追加分を取り消す（二重登録防止）
    logs = logs.filter((l) => l !== newEntry);
    renderLogs();
  }
}

// ---------- ログイン（合言葉） ----------
async function enter(passphrase, silent) {
  const msg = $('gate-msg'); if (!silent) msg.textContent = '確認中…';
  const pass = (passphrase || '').trim();
  try { token = await decryptToken(pass); }
  catch (e) { token = ''; if (!silent) msg.textContent = '合言葉が違います'; localStorage.removeItem(PASS_KEY); return; }
  const user = await ghUser();
  if (!user) { token = ''; if (!silent) msg.textContent = 'ログインできませんでした（キーの期限切れかもしれません）'; return; }
  localStorage.setItem(PASS_KEY, pass);
  $('who').textContent = '@' + user.login;
  $('gate').classList.add('hidden');
  $('editor').classList.remove('hidden');
  $('logout').classList.remove('hidden');
  $('add-date').value = todayStr();
  await loadFile();
  renderLogs();
  if (window.StaleCheck) window.StaleCheck.run($('editor'));
}
function logout() { localStorage.removeItem(PASS_KEY); location.reload(); }

// ---------- 起動 ----------
function init() {
  $('enter').onclick = () => enter($('tok').value);
  $('tok').onkeydown = (e) => { if (e.key === 'Enter') enter($('tok').value); };
  $('logout').onclick = logout;
  $('add').onclick = addAndSave;
  $('save').onclick = () => saveFile();
  $('filter').oninput = renderLogs;

  const saved = localStorage.getItem(PASS_KEY);
  if (saved) enter(saved, true);
}
init();
