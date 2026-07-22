// ============================================================
// view.js — ネットワーク/テーブルのビュー切替とテーブル描画
//   ネットワークは graph.js（元コードそのまま）が担当。
//   ここはテーブルと切替、詳細は元モーダル(window.__openModalById)を再利用。
// ============================================================
(function () {
  let tableData = null;
  let tableBuilt = false;
  let sort = { key: 'num', dir: 1 };

  const tabN = document.getElementById('tab-network');
  const tabT = document.getElementById('tab-table');
  const viewTable = document.getElementById('view-table');

  tabN.onclick = () => {
    tabN.classList.add('active'); tabT.classList.remove('active');
    viewTable.classList.add('hidden');
  };
  tabT.onclick = async () => {
    tabT.classList.add('active'); tabN.classList.remove('active');
    viewTable.classList.remove('hidden');
    if (!tableBuilt) { await buildTable(); tableBuilt = true; }
  };

  async function buildTable() {
    const d = await window.PodcastData.load();
    const linkCount = {};
    d.manualLinks.forEach((l) => {
      linkCount[l.source] = (linkCount[l.source] || 0) + 1;
      linkCount[l.target] = (linkCount[l.target] || 0) + 1;
    });
    tableData = d.episodes.map((e) => ({ ...e, links: linkCount[e.id] || 0 }));
    render();
  }

  function render() {
    const wrap = document.getElementById('table-wrap');
    const cols = [
      { key: 'num', label: '話数' },
      { key: 'title', label: 'タイトル' },
      { key: 'date', label: '公開日' },
      { key: 'duration', label: '長さ' },
      { key: 'tags', label: 'タグ' },
      { key: 'links', label: 'リンク数' },
    ];
    const { key, dir } = sort;
    const rows = [...tableData].sort((a, b) => {
      let av = a[key], bv = b[key];
      if (key === 'tags') { av = a.tags.length; bv = b.tags.length; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });

    let html = '<table class="grid"><thead><tr>';
    cols.forEach((c) => {
      const arrow = key === c.key ? (dir === 1 ? ' ▲' : ' ▼') : '';
      html += `<th data-key="${c.key}">${c.label}${arrow}</th>`;
    });
    html += '</tr></thead><tbody>';
    rows.forEach((e) => {
      const tags = e.tags.map((t) => `<span class="chip">#${esc(t)}</span>`).join(' ');
      html += `<tr data-id="${e.id}">
        <td class="c-num">${String(e.num).padStart(3, '0')}</td>
        <td class="c-title">${esc(e.title)}</td>
        <td>${e.date}</td>
        <td>${e.duration}</td>
        <td>${tags}</td>
        <td class="c-links">${e.links}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;

    wrap.querySelectorAll('th').forEach((th) => {
      th.onclick = () => {
        const k = th.dataset.key;
        if (sort.key === k) sort.dir *= -1; else sort = { key: k, dir: 1 };
        render();
      };
    });
    wrap.querySelectorAll('tr[data-id]').forEach((tr) => {
      tr.onclick = () => { if (window.__openModalById) window.__openModalById(tr.dataset.id); };
    });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
