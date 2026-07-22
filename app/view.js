// ============================================================
// view.js — トグルで graph.js の整列アニメ（ネットワーク⇔テーブル）を呼ぶ
//   テーブルは別ページではなく、同じ星が番号順に整列して一覧になる。
// ============================================================
(function () {
  const tabN = document.getElementById('tab-network');
  const tabT = document.getElementById('tab-table');
  function active(which) {
    tabN.classList.toggle('active', which === 'net');
    tabT.classList.toggle('active', which === 'table');
  }
  tabN.onclick = () => { active('net'); if (window.__viewNetwork) window.__viewNetwork(); };
  tabT.onclick = () => { active('table'); if (window.__viewTable) window.__viewTable(); };
})();
