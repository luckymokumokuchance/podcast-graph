// GAS(スプレッドシート)からキュレーション済みshownote本文とimagesマップを取得し、
// app/shownotes.json と app/images.json に書き出す。
// スプレッドシートを編集したら: node scripts/snapshot-shownotes.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(__dirname, '..', 'app');

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxk2jQTHhowhGTXBAMsAcEZWbjELoxQAoSEkVy8EIMHuwXsgO_H6xxNqJPiqsvj5Dnd/exec';

async function main() {
  const res = await fetch(GAS_URL);
  if (!res.ok) throw new Error('GAS fetch failed: ' + res.status);
  const data = await res.json();

  const episodes = data.nodes
    .filter((n) => n.type === 'episode')
    .map((n) => ({
      num: Number(n.id),
      title: n.title,
      date: n.published_at || '',
      descHtml: n.summary || '',
      url: n.url || '',
    }))
    .sort((a, b) => a.num - b.num);

  const generatedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(APP_DIR, 'shownotes.json'),
    JSON.stringify({ generatedAt, episodes }, null, 2) + '\n'
  );
  fs.writeFileSync(
    path.join(APP_DIR, 'images.json'),
    JSON.stringify(data.images || {}, null, 2) + '\n'
  );
  console.log(`shownotes.json: ${episodes.length} episodes / images.json: ${Object.keys(data.images || {}).length} keys (generatedAt=${generatedAt})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
