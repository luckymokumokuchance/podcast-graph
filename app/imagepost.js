// ============================================================
// imagepost.js — 合言葉でログイン → 画像をリポジトリ直接コミット + images.json に登録
//   admin.js/logpost.jsと全く同じ合言葉・トークン方式を流用。
//   Googleドライブ・スプレッドシートは一切使わない。
//   登録したキーは [img:キー] としてSpotifyの説明文に貼ってもらう
//   （本文全体に対して置換されるため、貼った場所がそのまま表示位置になる）。
// ============================================================
const REPO_OWNER   = 'luckymokumokuchance';
const REPO_NAME    = 'podcast-graph';
const IMAGES_PATH  = 'app/images.json';
const IMAGE_DIR    = 'image'; // リポジトリルート直下（ASSET_BASE='../'が指す先と同じ場所）
const BRANCH       = 'feature/logo-deco';
const PASS_KEY     = 'lmc_pass';
const GH = 'https://api.github.com';

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

let token = '';
let images = {};      // key -> 'image/epXXX_N.ext'（新方式） または Drive fileId（旧回のぶん）
let imagesSha = null;

const $ = (id) => document.getElementById(id);

// ---------- GitHub API ----------
async function ghUser() {
  const r = await fetch(`${GH}/user`, { headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github+json' } });
  return r.ok ? r.json() : null;
}

async function getFile(path) {
  const r = await fetch(`${GH}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}&t=${Date.now()}`,
    { headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  return r.ok ? r.json() : null;
}

async function putFile(path, base64Content, sha, message) {
  return fetch(`${GH}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ message, content: base64Content, sha: sha || undefined, branch: BRANCH }),
  });
}

async function loadImages() {
  const j = await getFile(IMAGES_PATH);
  if (j) {
    imagesSha = j.sha;
    const decoded = decodeURIComponent(escape(atob(j.content.replace(/\n/g, ''))));
    images = JSON.parse(decoded) || {};
  } else {
    imagesSha = null;
    images = {};
  }
}

// ---------- キー計算 ----------
function padEp(n) { return String(n).padStart(3, '0'); }

function nextKey(epNum) {
  const prefix = `ep${padEp(epNum)}_`;
  let max = 0;
  Object.keys(images).forEach((k) => {
    if (k.startsWith(prefix)) {
      const n = parseInt(k.slice(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  });
  return `${prefix}${max + 1}`;
}

function extOf(file) {
  const fromName = (file.name.match(/\.([a-zA-Z0-9]+)$/) || [])[1];
  if (fromName) return fromName.toLowerCase().replace('jpeg', 'jpg');
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  return map[file.type] || 'jpg';
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- 一覧表示（この方式=パス形式のものだけ） ----------
function renderRegList() {
  const list = $('reg-list');
  const entries = Object.entries(images).filter(([, v]) => String(v).includes('/'));
  if (!entries.length) {
    list.innerHTML = '<div class="empty">まだこの方式での登録はありません。</div>';
    return;
  }
  entries.sort((a, b) => (a[0] < b[0] ? 1 : -1));
  list.innerHTML = entries.map(([key, path]) => `
    <div class="regrow">
      <img src="../${path}" alt="${key}">
      <code>[img:${key}]</code>
    </div>
  `).join('');
}

// ---------- アップロード ----------
function updateAddButton() {
  $('add').disabled = !($('add-ep').value && $('add-file').files.length);
}

async function upload() {
  const msg = $('add-msg'); msg.textContent = '';
  const epNum = parseInt($('add-ep').value, 10);
  const file = $('add-file').files[0];
  if (!epNum || !file) { msg.textContent = '話数と画像ファイルを指定してください'; return; }

  const btn = $('add');
  btn.disabled = true;
  $('result').classList.add('hidden');

  try {
    await loadImages(); // 直前に最新化（他の場所からの更新との衝突を避ける）
    const key = nextKey(epNum);
    const ext = extOf(file);
    const imagePath = `${IMAGE_DIR}/${key}.${ext}`;
    const base64 = await readAsBase64(file);

    const r1 = await putFile(imagePath, base64, null, `画像追加: ${key}`);
    if (!r1.ok) {
      msg.textContent = '画像のアップロードに失敗しました (' + r1.status + ')';
      return;
    }

    images[key] = imagePath;
    const body = JSON.stringify(images, null, 2) + '\n';
    const content = btoa(unescape(encodeURIComponent(body)));
    const r2 = await putFile(IMAGES_PATH, content, imagesSha, `画像登録: ${key} を images.json に追加`);
    if (!r2.ok) {
      msg.textContent = '画像は保存できましたが、images.jsonの更新に失敗しました (' + r2.status + ')。もう一度お試しください。';
      return;
    }
    const j2 = await r2.json();
    imagesSha = j2.content.sha;

    $('result-key').textContent = `[img:${key}]`;
    $('result').classList.remove('hidden');
    renderRegList();

    $('add-file').value = '';
    $('preview').classList.add('hidden');
    updateAddButton();
    msg.textContent = '登録しました。サイトには約1分で反映されます。';
  } catch (e) {
    msg.textContent = '失敗しました: ' + e.message;
  } finally {
    updateAddButton();
  }
}

// ---------- ログイン ----------
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
  await loadImages();
  renderRegList();
}
function logout() { localStorage.removeItem(PASS_KEY); location.reload(); }

// ---------- 起動 ----------
function init() {
  $('enter').onclick = () => enter($('tok').value);
  $('tok').onkeydown = (e) => { if (e.key === 'Enter') enter($('tok').value); };
  $('logout').onclick = logout;
  $('add').onclick = upload;
  $('add-ep').oninput = updateAddButton;
  $('add-file').onchange = () => {
    updateAddButton();
    const file = $('add-file').files[0];
    const preview = $('preview');
    if (file) {
      const reader = new FileReader();
      reader.onload = () => { preview.src = reader.result; preview.classList.remove('hidden'); };
      reader.readAsDataURL(file);
    } else {
      preview.classList.add('hidden');
    }
  };
  $('copy').onclick = () => {
    navigator.clipboard.writeText($('result-key').textContent);
    $('copy').textContent = 'コピーしました';
    setTimeout(() => { $('copy').textContent = 'コピー'; }, 1500);
  };

  const saved = localStorage.getItem(PASS_KEY);
  if (saved) enter(saved, true);
}
init();
