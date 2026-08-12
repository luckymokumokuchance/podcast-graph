/*
 * stale-check.js — ショーノートのスナップショット(shownotes.json)がRSSより
 * 古くなっていないかを確認し、管理画面（合言葉の向こう側）にだけ警告を出す。
 * 一般訪問者向けページには絶対に読み込まないこと。
 *
 * 使い方: ログイン成功後に呼ぶ。
 *   window.StaleCheck.run(document.getElementById('editor'));
 */
(function () {
  'use strict';

  const RSS_URL = 'https://anchor.fm/s/110637c28/podcast/rss';
  const SHOWNOTES_URL = 'shownotes.json';

  async function check() {
    const [rssText, shownotes] = await Promise.all([
      fetch(RSS_URL).then((r) => r.text()),
      fetch(SHOWNOTES_URL + '?t=' + Date.now()).then((r) => r.ok ? r.json() : { episodes: [] }),
    ]);
    const rssCount = (rssText.match(/<item[\s>]/g) || []).length;
    const snapCount = (shownotes.episodes || []).length;
    return { stale: rssCount > snapCount, rssCount, snapCount };
  }

  function render(container, result) {
    if (!result.stale) return;
    const bar = document.createElement('div');
    bar.style.cssText = 'background:#fff3cd;border:1px solid #ffe58a;color:#7a5c00;' +
      'border-radius:8px;padding:10px 14px;margin:0 0 14px;font-size:13px;line-height:1.6;';
    bar.textContent = `⚠️ ショーノートが${result.rssCount - result.snapCount}話ぶん未取得です`
      + `（RSS ${result.rssCount}話 / 保存済み ${result.snapCount}話）。`
      + `npm run snapshot で最新化してください。`;
    container.prepend(bar);
  }

  async function run(container) {
    try {
      const result = await check();
      if (container) render(container, result);
      return result;
    } catch (e) {
      console.error('[stale-check]', e);
      return null;
    }
  }

  window.StaleCheck = { run };
})();
