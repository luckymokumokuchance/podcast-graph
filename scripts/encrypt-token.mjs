// GitHubトークンを合言葉で暗号化し、app/admin.js / logpost.js / layout.js の
// TOKEN_BLOB を新しい値に差し替える。
//
// トークンが失効したとき（管理画面で「ログインできませんでした（キーの期限切れ
// かもしれません）」が出るとき）に使う。
//
// 【推奨】トークンをどこにも打ち込まずに済む方法:
//   1. リポジトリ直下に .token というファイルを作り、トークンだけを貼って保存
//      （メモ帳でOK。.gitignore済みなのでコミットされません）
//   2. node scripts/encrypt-token.mjs
//   3. 成功すると .token は自動で削除されます
//
// 環境変数で渡すこともできます（ただしシェル履歴やログに残る点に注意）:
//   GH_TOKEN=github_pat_xxxxx node scripts/encrypt-token.mjs
//
// 合言葉を変えたいとき（既定は mokumoku）:
//   PASSPHRASE=あたらしいあいことば を一緒に指定する
//
// ※トークンは画面にもリポジトリにも平文で残しません（暗号化した結果だけ書き込みます）
// ※実行前にGitHubで生きているか自動で確認し、無効なら書き込まずに止まります
import { webcrypto as crypto } from 'node:crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(__dirname, '..', 'app');
const TARGETS = ['admin.js', 'logpost.js', 'layout.js'];

// メモ帳は「.token」で保存しようとしても勝手に「.token.txt」にしてしまうので、
// どちらの名前でも受け付ける
const TOKEN_FILE_CANDIDATES = ['.token', '.token.txt', 'token.txt']
  .map((n) => path.join(__dirname, '..', n));

async function main() {
const passphrase = process.env.PASSPHRASE || 'mokumoku';

// ファイル優先（シェル履歴に残らないため）。無ければ環境変数。
let token = '';
let tokenFile = null;
const found = TOKEN_FILE_CANDIDATES.find((p) => fs.existsSync(p));
if (found) {
  token = fs.readFileSync(found, 'utf8').trim();
  tokenFile = found;
  console.log(`${path.basename(found)} からトークンを読みました`);
} else if (process.env.GH_TOKEN) {
  token = process.env.GH_TOKEN.trim();
}

if (!token) {
  console.error('トークンが見つかりません。');
  console.error('リポジトリ直下に .token（または .token.txt）を作り、トークンだけを貼って保存してください。');
  console.error('（使い方の詳細はこのファイルの先頭を見てください）');
  return 1;
}

// 貼り付けミスの早期検出（引用符やBOM、改行混じりなど）
token = token.replace(/^﻿/, '').replace(/^["']|["']$/g, '').trim();
if (/\s/.test(token)) {
  console.error('✗ トークンに空白や改行が含まれています。トークンだけを1行で貼り直してください。');
  return 1;
}

// ---- 1. まずGitHubで生きているか確認（無効なトークンを埋め込まないため） ----
const who = await fetch('https://api.github.com/user', {
  headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github+json' },
});
if (!who.ok) {
  console.error(`✗ このトークンはGitHubで使えません (HTTP ${who.status})。作り直してください。`);
  return 1;
}
const user = await who.json();
console.log(`✓ トークン有効（@${user.login}）`);

// ---- 2. リポジトリへの書き込み権限を確認 ----
const repo = await fetch('https://api.github.com/repos/luckymokumokuchance/podcast-graph', {
  headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github+json' },
});
if (repo.ok) {
  const perm = (await repo.json()).permissions || {};
  if (!perm.push) {
    console.error('✗ このリポジトリへの書き込み権限がありません。');
    console.error('  トークン作成時に Contents: Read and write を選んでください。');
    return 1;
  }
  console.log('✓ 書き込み権限あり');
} else {
  console.error(`✗ リポジトリにアクセスできません (HTTP ${repo.status})。`);
  console.error('  トークン作成時に podcast-graph を対象に含めてください。');
  return 1;
}

// ---- 3. 暗号化（admin.js の decryptToken と同一パラメータ） ----
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
  baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token)));

const blobBytes = new Uint8Array(salt.length + iv.length + ct.length);
blobBytes.set(salt, 0);
blobBytes.set(iv, salt.length);
blobBytes.set(ct, salt.length + iv.length);
const blob = Buffer.from(blobBytes).toString('base64');

// ---- 4. 復号して元に戻るか自己検証 ----
const rt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
if (new TextDecoder().decode(rt) !== token) {
  console.error('✗ 自己検証に失敗しました。書き込みを中止します。');
  return 1;
}
console.log('✓ 暗号化と復号の往復を確認');

// ---- 5. 3ファイルのTOKEN_BLOBを差し替え ----
let changed = 0;
for (const f of TARGETS) {
  const p = path.join(APP_DIR, f);
  if (!fs.existsSync(p)) { console.log(`  - ${f} は存在しないのでスキップ`); continue; }
  const src = fs.readFileSync(p, 'utf8');
  const next = src.replace(/(TOKEN_BLOB\s*=\s*')[^']*(')/, `$1${blob}$2`);
  if (next === src) { console.log(`  ★ ${f} の TOKEN_BLOB が見つかりませんでした`); continue; }
  fs.writeFileSync(p, next);
  console.log(`  ✓ ${f} を更新`);
  changed++;
}

// ---- 6. 平文トークンの後始末（候補名すべてを消す） ----
TOKEN_FILE_CANDIDATES.filter((p) => fs.existsSync(p)).forEach((p) => {
  fs.rmSync(p, { force: true });
  console.log(`  ✓ ${path.basename(p)} を削除しました（平文はもう残っていません）`);
});

console.log(`\n${changed}ファイルを更新しました。`);
if (passphrase !== 'mokumoku') {
  console.log(`※ 合言葉を「${passphrase}」に変更しました。相方にも共有してください。`);
}
console.log('このあと commit & push すれば、約1分で管理画面に入れるようになります。');

  return 0;
}

process.exitCode = await main();
