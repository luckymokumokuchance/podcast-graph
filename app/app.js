// ============================================================
// app.js — ビュー切替（ネットワーク / テーブル）と詳細モーダル
// ============================================================
let DATA = null;
let networkDrawn = false;
let tableSort = { key: 'num', dir: 1 };

async function main() {
  const loading = document.getElementById('loading');
  try {
    DATA = await window.PodcastData.load();
  } catch (e) {
    loading.textContent = 'データの取得に失敗しました（RSS）。' + e.message;
    console.error(e);
    return;
  }
  loading.classList.add('hidden');
  setupTabs();
  drawNetwork();
  networkDrawn = true;
  buildModalHandlers();
}

// ---------- ビュー切替 ----------
function setupTabs() {
  const tN = document.getElementById('tab-network');
  const tT = document.getElementById('tab-table');
  const vN = document.getElementById('view-network');
  const vT = document.getElementById('view-table');
  tN.onclick = () => {
    tN.classList.add('active'); tT.classList.remove('active');
    vN.classList.remove('hidden'); vT.classList.add('hidden');
    if (!networkDrawn) { drawNetwork(); networkDrawn = true; }
  };
  tT.onclick = () => {
    tT.classList.add('active'); tN.classList.remove('active');
    vT.classList.remove('hidden'); vN.classList.add('hidden');
    drawTable();
  };
}

// ---------- テーブルビュー ----------
function drawTable() {
  const wrap = document.getElementById('table-wrap');
  const cols = [
    { key: 'num',   label: '話数' },
    { key: 'title', label: 'タイトル' },
    { key: 'date',  label: '公開日' },
    { key: 'duration', label: '長さ' },
    { key: 'tags',  label: 'タグ' },
    { key: 'links', label: 'リンク数' },
  ];
  const linkCount = {};
  DATA.manualLinks.forEach((l) => {
    linkCount[l.source] = (linkCount[l.source] || 0) + 1;
    linkCount[l.target] = (linkCount[l.target] || 0) + 1;
  });
  const rows = DATA.episodes.map((e) => ({ ...e, links: linkCount[e.id] || 0 }));

  const { key, dir } = tableSort;
  rows.sort((a, b) => {
    let av = a[key], bv = b[key];
    if (key === 'tags') { av = a.tags.length; bv = b.tags.length; }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  let html = '<table class="grid"><thead><tr>';
  cols.forEach((c) => {
    const arrow = tableSort.key === c.key ? (dir === 1 ? ' ▲' : ' ▼') : '';
    html += `<th data-key="${c.key}">${c.label}${arrow}</th>`;
  });
  html += '</tr></thead><tbody>';
  rows.forEach((e) => {
    const tags = e.tags.map((t) => `<span class="chip">#${t}</span>`).join(' ');
    html += `<tr data-id="${e.id}">
      <td class="c-num">${String(e.num).padStart(3, '0')}</td>
      <td class="c-title">${escapeHtml(e.title)}</td>
      <td>${e.date}</td>
      <td>${e.duration}</td>
      <td class="c-tags">${tags}</td>
      <td class="c-links">${e.links}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  wrap.innerHTML = html;

  wrap.querySelectorAll('th').forEach((th) => {
    th.onclick = () => {
      const k = th.dataset.key;
      if (tableSort.key === k) tableSort.dir *= -1;
      else tableSort = { key: k, dir: 1 };
      drawTable();
    };
  });
  wrap.querySelectorAll('tr[data-id]').forEach((tr) => {
    tr.onclick = () => openModal(Number(tr.dataset.id));
  });
}

// ---------- ネットワークビュー ----------
function drawNetwork() {
  const container = document.getElementById('graph-container');
  container.innerHTML = '';
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight - 52;
  const { nodes, graphLinks, COLORS } = DATA;

  const svg = d3.select(container).append('svg')
    .attr('width', width).attr('height', height);
  const g = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.3, 3]).on('zoom', (ev) => g.attr('transform', ev.transform)));

  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(graphLinks).id((d) => d.id).distance((l) => l.type === 'tag' ? 60 : 110))
    .force('charge', d3.forceManyBody().strength(-220))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide(26));

  const link = g.append('g').attr('stroke', '#bbb').attr('stroke-opacity', 0.7)
    .selectAll('line').data(graphLinks).join('line')
    .attr('stroke-dasharray', (d) => d.type === 'tag' ? '2,3' : null);

  const node = g.append('g').selectAll('g').data(nodes).join('g')
    .style('cursor', 'pointer')
    .call(d3.drag()
      .on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
      .on('end', (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

  node.append('circle')
    .attr('r', (d) => d.type === 'episode' ? 18 : 12)
    .attr('fill', (d) => d.type === 'episode' ? COLORS.episode : COLORS.tag);

  node.append('text')
    .attr('text-anchor', 'middle').attr('dy', '0.35em')
    .attr('fill', '#fff').attr('font-size', (d) => d.type === 'episode' ? 11 : 9)
    .text((d) => d.type === 'episode' ? String(d.num).padStart(2, '0') : '#');

  node.append('text')
    .attr('text-anchor', 'middle').attr('dy', (d) => d.type === 'episode' ? 32 : 24)
    .attr('fill', '#333').attr('font-size', 10)
    .text((d) => d.type === 'episode' ? d.title : d.label);

  node.on('click', (ev, d) => { if (d.type === 'episode') openModal(Number(d.id)); });

  sim.on('tick', () => {
    link.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });
}

// ---------- モーダル ----------
function buildModalHandlers() {
  document.getElementById('modal-close').onclick = closeModal;
  document.getElementById('modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };
}
function openModal(id) {
  const e = DATA.episodes.find((x) => x.id === id);
  if (!e) return;
  document.getElementById('modal-title').textContent = `${String(e.num).padStart(3, '0')} ${e.title}`;
  document.getElementById('modal-meta').textContent = `${e.date}　${e.duration}`;
  const audio = document.getElementById('modal-audio');
  if (e.audio) { audio.src = e.audio; audio.classList.remove('hidden'); }
  else audio.classList.add('hidden');
  // RSSの説明はHTML。今回はそのまま挿入（配信元の生成物）
  document.getElementById('modal-body').innerHTML = e.descHtml;
  const link = document.getElementById('modal-link');
  link.href = e.link || '#';
  document.getElementById('modal').classList.remove('hidden');
}
function closeModal() {
  const audio = document.getElementById('modal-audio');
  audio.pause();
  document.getElementById('modal').classList.add('hidden');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

main();
