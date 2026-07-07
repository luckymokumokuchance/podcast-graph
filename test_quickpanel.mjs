import { JSDOM } from 'jsdom';
import fs from 'fs';

function makeDom(storageData) {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
    <div id="graph-container">
      <input id="s-link"    type="range" min="0" max="100" step="1"    value="13">
      <input id="s-charge" type="range" min="20" max="200" step="5" value="80">
      <input id="s-radius"  type="range" min="12" max="56" step="1"    value="21">
      <input id="s-rotate"  type="range" min="0" max="30"  step="0.5"  value="3">
    </div></body></html>`, { url: 'https://example.com/', runScripts: 'outside-only' });
  if (storageData) dom.window.localStorage.setItem('lmc-graph-settings-v1', storageData);
  dom.window.eval(fs.readFileSync('quickpanel.js', 'utf8'));
  return dom;
}

let failed = 0;
const check = (name, cond) => { console.log((cond?'PASS':'FAIL')+' | '+name); if(!cond) failed++; };

// --- ケース1: 通常起動 ---
{
  const { window } = makeDom(null);
  const doc = window.document;
  // graph.js側のリスナーを模擬（inputイベント受信を記録）
  const received = {};
  ['s-link','s-charge','s-radius','s-rotate'].forEach(id =>
    doc.getElementById(id).addEventListener('input', e => { received[id] = e.target.value; }));

  window.dispatchEvent(new window.CustomEvent('graph-ready'));

  check('トグルボタンが生成される', doc.getElementById('qp-toggle') !== null);
  check('パネルは初期状態で閉じている', doc.getElementById('qp-panel').hidden === true);

  doc.getElementById('qp-toggle').click();
  check('トグルで開く', doc.getElementById('qp-panel').hidden === false);
  check('スライダーは4本', doc.querySelectorAll('#qp-panel input[type=range]').length === 4);

  const qpLink = doc.getElementById('qp-s-link');
  check('min/max/初期値を既存スライダーから引き継ぐ', qpLink.min==='0' && qpLink.max==='100' && qpLink.value==='13');

  qpLink.value = '40';
  qpLink.dispatchEvent(new window.Event('input', { bubbles: true }));
  check('プロキシ: 既存スライダーに値が反映', doc.getElementById('s-link').value === '40');
  check('プロキシ: graph.js側リスナーが発火', received['s-link'] === '40');

  const saved = JSON.parse(window.localStorage.getItem('lmc-graph-settings-v1'));
  check('localStorageに保存される', saved['s-link'] === '40');

  doc.getElementById('qp-reset').click();
  check('リセットで初期値に戻る', doc.getElementById('s-link').value === '13' && received['s-link'] === '13');
  check('リセットで保存も消える', window.localStorage.getItem('lmc-graph-settings-v1') === null);
}

// --- ケース2: 保存済み設定の復元 ---
{
  const { window } = makeDom(JSON.stringify({ 's-link':'77', 's-rotate':'0' }));
  const doc = window.document;
  window.dispatchEvent(new window.CustomEvent('graph-ready'));
  check('復元: s-link=77', doc.getElementById('s-link').value === '77');
  check('復元: s-rotate=0', doc.getElementById('s-rotate').value === '0');
  check('未保存の項目は初期値のまま', doc.getElementById('s-radius').value === '21');
  doc.getElementById('qp-toggle').click();
  doc.getElementById('qp-reset').click();
  check('復元後もリセットは元のデフォルトへ(13)', doc.getElementById('s-link').value === '13');
}

// --- ケース3: 既存スライダーが無い場合は静かに何もしない ---
{
  const dom = new JSDOM(`<!DOCTYPE html><body><div id="graph-container"></div></body>`,
    { url: 'https://example.com/', runScripts: 'outside-only' });
  dom.window.eval(fs.readFileSync('quickpanel.js', 'utf8'));
  dom.window.dispatchEvent(new dom.window.CustomEvent('graph-ready'));
  check('安全側: 対象が無ければUIを出さない', dom.window.document.getElementById('qp-toggle') === null);
}

console.log(failed === 0 ? '\nALL TESTS PASSED' : `\n${failed} TESTS FAILED`);
process.exit(failed === 0 ? 0 : 1);
