// ============================================================
// layout.js — 合言葉でログイン → テーブル整列モードのレイアウト数値を
//   スライダーでライブプレビューしながら table-layout.json に保存する。
//   合言葉・トークンの扱いは admin.js と同じ仕組みを再利用。
// ============================================================
const REPO_OWNER = 'luckymokumokuchance';
const REPO_NAME  = 'podcast-graph';
const FILE_PATH  = 'app/table-layout.json';
const BRANCH     = 'feature/logo-deco';
const PASS_KEY   = 'lmc_pass';
const GH = 'https://api.github.com';

// admin.js と同一の暗号化トークン（合言葉は共通）
const TOKEN_BLOB = 'FnDFsqu+YNBtW0017eIRG01/IC0PGiZ78a8hyHBaWqu8OCXHZ7O1ItCqYTa7YNLE2ww7GkG0itXtvvCy+CO9YctD5r4wSZqCRWmJJztavcS5uj1bh4f/GkRtHUlHcSbnw9idewO5QBpmHW98bubT2f7wrnog3rvcoR1niVi5aT5YKQl4eCQY82A=';

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

const FIELDS = [
  'rowH', 'leftX', 'tableR', 'titleX', 'titleH',
  'titleFont', 'titleWeight', 'titleTruncateLen', 'titleTagsGap',
  'summaryFont', 'summaryLen', 'summaryH', 'summaryTagsGap',
  'tagsFont', 'tagsGap',
];

let token   = '';
let fileSha = null;
let saved   = {};   // GitHub上の現在値（比較用スナップショット）

const $ = (id) => document.getElementById(id);

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
    saved = JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\n/g, '')))));
  } else {
    fileSha = null;
    saved = window.__getTableLayout ? window.__getTableLayout() : {};
  }
}
async function saveFile() {
  const msg = $('save-msg');
  msg.textContent = '保存中…';
  const current = window.__getTableLayout();
  const body = JSON.stringify(current, null, 2) + '\n';
  const content = btoa(unescape(encodeURIComponent(body)));
  const r = await fetch(`${GH}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`, {
    method: 'PUT',
    headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ message: 'admin: update table-layout.json', content, sha: fileSha || undefined, branch: BRANCH }),
  });
  if (r.ok) {
    const j = await r.json();
    fileSha = j.content.sha;
    saved = current;
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

// ---------- スライダー ----------
function isDirty() { return JSON.stringify(window.__getTableLayout()) !== JSON.stringify(saved); }
function refreshDirty() { $('save').disabled = !isDirty(); }

function fillSliders() {
  const cfg = window.__getTableLayout();
  FIELDS.forEach((k) => {
    $(`l-${k}`).value = cfg[k];
    $(`v-${k}`).textContent = cfg[k];
  });
}
function wireSliders() {
  FIELDS.forEach((k) => {
    $(`l-${k}`).addEventListener('input', () => {
      const v = Number($(`l-${k}`).value);
      $(`v-${k}`).textContent = v;
      window.__setTableLayout({ [k]: v });
      refreshDirty();
    });
  });
}

// ---------- graph.js の初期描画完了イベント ----------
// ログイン処理（GitHub APIへの往復）と星図の初期化（RSS取得など）は並行に進むため、
// どちらが先に終わるかは実行毎に変わる。'graph-ready' は一度きりのイベントなので
// ページ読み込み直後（ログイン前）にリスナーを登録しておき、フラグで到達済みかを覚えておく。
let graphReady  = false;
let loggedIn    = false;
window.addEventListener('graph-ready', () => {
  graphReady = true;
  onBothReady();
}, { once: true });

function onBothReady() {
  if (!graphReady || !loggedIn) return;
  if (window.__viewTable) window.__viewTable();
  fillSliders();
  wireSliders();
  refreshDirty();
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
  $('app').classList.remove('hidden');
  await loadFile();
  loggedIn = true;
  onBothReady();
}

// ---------- 起動 ----------
function init() {
  $('enter').onclick = () => enter($('tok').value);
  $('tok').onkeydown = (e) => { if (e.key === 'Enter') enter($('tok').value); };
  $('save').onclick = saveFile;

  const savedPass = localStorage.getItem(PASS_KEY);
  if (savedPass) enter(savedPass, true);
}
init();
