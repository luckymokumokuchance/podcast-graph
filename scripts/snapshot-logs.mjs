// GAS(スプレッドシートのlogsシート)からLOGを取得し、app/logs.json に書き出す。
// GitHub Actions (.github/workflows/sync-logs.yml) から定期実行される。
// 手動で走らせる場合: node scripts/snapshot-logs.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'app', 'logs.json');

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxk2jQTHhowhGTXBAMsAcEZWbjELoxQAoSEkVy8EIMHuwXsgO_H6xxNqJPiqsvj5Dnd/exec';

async function main() {
  const res = await fetch(`${GAS_URL}?type=logs`);
  if (!res.ok) throw new Error('GAS fetch failed: ' + res.status);
  const data = await res.json();
  if (!Array.isArray(data.logs)) throw new Error('unexpected payload: logs[] not found');

  // 取得できた件数が0のときは書き出さない（GAS側の一時的な不調で
  // 既存のlogs.jsonを空で上書きしてしまう事故を防ぐ）
  if (data.logs.length === 0) {
    console.error('logs is empty — 既存ファイルを保持して終了します');
    process.exit(1);
  }

  // generatedAtは入れない：毎回変化して差分が出てしまい、内容が同じでも
  // 空コミットが積み上がるため（Workflow側で差分ゼロならコミットしない）
  fs.writeFileSync(OUT, JSON.stringify({ logs: data.logs }, null, 2) + '\n');
  console.log(`app/logs.json: ${data.logs.length} 件`);
}

main().catch((e) => { console.error(e); process.exit(1); });
