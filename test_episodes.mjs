import { JSDOM } from 'jsdom';
import fs from 'fs';

const html = fs.readFileSync('episodes.html', 'utf8')
  .replace(/<script src="https:[^"]*"><\/script>/, '') // markedはCDNなので除外
  .replace('<script src="episodes.js"></script>', '');

const mock = JSON.parse(fs.readFileSync('mock.json', 'utf8'));

const dom = new JSDOM(html, { url: 'https://example.com/episodes.html', runScripts: 'outside-only' });
const { window } = dom;
window.fetch = async () => ({ ok: true, json: async () => mock });

window.eval(fs.readFileSync('episodes.js', 'utf8'));

await new Promise(r => setTimeout(r, 50)); // main()のawait待ち

const doc = window.document;
const $  = s => doc.querySelector(s);
const $$ = s => [...doc.querySelectorAll(s)];

let failed = 0;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name);
  if (!cond) failed++;
}

// 1. 初期表示：3件・新しい順(011→005→004)
check('初期表示は全3件', $$('.ep-card').length === 3);
check('新しい順に並ぶ', $$('.ep-num').map(e => e.textContent).join(',') === '011,005,004');
check('件数表示', $('#result-count').textContent === '全3話');

// 2. テキスト検索（ひらがな→カタカナ横断）
const input = $('#search-input');
input.value = 'はっふるぱふ';
input.dispatchEvent(new window.Event('input', { bubbles: true }));
check('かな違いでもヒット(はっふるぱふ→ハッフルパフ)', $$('.ep-card').length === 1);
check('タイトルに005を含む', $('.ep-num').textContent === '005');

// 3. ショーノート本文の検索＋ハイライト
input.value = '焼きたらこ';
input.dispatchEvent(new window.Event('input', { bubbles: true }));
check('ショーノート本文でヒット', $$('.ep-card').length === 1);
check('ハイライトされる', $('.ep-excerpt mark') !== null && $('.ep-excerpt mark').textContent === '焼きたらこ');

// 4. ヒットなし
input.value = '存在しないことば';
input.dispatchEvent(new window.Event('input', { bubbles: true }));
check('0件時にemptyメッセージ', $$('.ep-card').length === 0 && !$('#empty').hidden);

// 5. クリア→タグ絞り込み
$('#search-clear').click();
const chips = $$('.tag-chip');
check('タグチップが生成される(4種)', chips.length === 4);
const tex = chips.find(c => c.textContent.includes('テクスチャ'));
tex.click();
check('#テクスチャで2件に絞られる', $$('.ep-card').length === 2);
const pie = chips.find(c => c.textContent.includes('ピエロ'));
pie.click();
check('タグAND絞り込みで1件(011)', $$('.ep-card').length === 1 && $('.ep-num').textContent === '011');
tex.click(); pie.click();
check('タグ解除で全件に戻る', $$('.ep-card').length === 3);

// 6. Spotify埋め込みとリンク
check('Spotify URLはembedに変換', $$('.ep-player iframe').some(f => f.src === 'https://open.spotify.com/embed/episode/AAA111'));
check('URL無しの回はプレイヤー無し', $$('.ep-card')[0].querySelector('iframe, .ep-listen') === null);

// 7. ショーノート開閉（markedなしフォールバック）
const more = $$('.ep-more')[0];
more.click();
const note = $$('.ep-shownote')[0];
check('ショーノートが開いて中身が描画される', !note.hidden && note.innerHTML.length > 0);
check('XSSされない(タグはエスケープ)', !note.innerHTML.includes('<script'));

// 8. 検索インデックスにタグ名も含まれる
input.value = 'テクスチャ';
input.dispatchEvent(new window.Event('input', { bubbles: true }));
check('タグ名でテキスト検索してもヒット', $$('.ep-card').length === 2);

console.log(failed === 0 ? '\nALL TESTS PASSED' : `\n${failed} TESTS FAILED`);
process.exit(failed === 0 ? 0 : 1);
