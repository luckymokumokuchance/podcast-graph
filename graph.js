// ============================================================
// ラッキーもくもくチャンス - D3.js グラフ描画
// ============================================================

// ▼▼▼ GASのWebアプリURLをここに貼り付けてください ▼▼▼
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxcVMANVbx4Ia7QF9NL1zWKdzO5LlnGx4LSSM6B5SoSDjL51x7KfEluLd4FYayURfKE/exec';
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

// ------------------------------------------------------------
// エントリーポイント
// ------------------------------------------------------------
async function main() {
  const loadingEl = document.getElementById('loading');
  const tooltip   = document.getElementById('tooltip');

  let data;
  try {
    const res = await fetch(GAS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    loadingEl.textContent = 'データの取得に失敗しました。GAS_URL を確認してください。';
    console.error(e);
    return;
  }

  if (!data.nodes || data.nodes.length === 0) {
    loadingEl.textContent = '表示できるエピソードがまだありません。';
    return;
  }

  loadingEl.classList.add('hidden');
  drawGraph(data, tooltip);
}

// ------------------------------------------------------------
// D3 グラフ描画
// ------------------------------------------------------------
function drawGraph(data, tooltip) {
  const container = document.getElementById('graph-container');
  const width     = container.clientWidth;
  const height    = container.clientHeight;

  // ---------- 状態変数 ----------
  let currentK      = 1;
  let nodeRadius    = 21;
  let epFontPx      = 10;
  let titleFontPx   = 12;
  let strokeMult    = 0.8;
  let hideThreshold = 1.2;
  let rotSpeed      = parseFloat(document.getElementById('s-rotate').value); // 度/秒
  let rotAngle      = 0;
  const TITLE_OFFSET_PX = 14;

  // タグノードの半径（エピソードの55%）
  const tagR = () => Math.max(8, nodeRadius * 0.55);

  // 装飾ノード定数
  const DECO_COUNT  = 200;
  const decoR       = 4;
  const decoColor   = '#cccccc';
  const EP_HOVER    = '#ffbba3'; // オレンジ味のある薄ピンク

  // 装飾ノードを生成してデータに追加
  const decoNodes = d3.range(DECO_COUNT).map(i => ({
    id:   `deco_${i}`,
    type: 'deco',
    x:    Math.random() * width,
    y:    Math.random() * height,
  }));
  data.nodes.push(...decoNodes);

  // ---------- SVG ----------
  const svg = d3.select('#graph')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const g    = svg.append('g');  // ズームグループ
  const rotG = g.append('g');    // 回転グループ

  const zoomBehavior = d3.zoom()
    .scaleExtent([0.2, 4])
    .on('zoom', e => {
      g.attr('transform', e.transform);
      currentK = e.transform.k;
      svg.classed('hide-text', currentK < hideThreshold);
      applyTitleStyle();
    });

  svg.call(zoomBehavior);

  // 初期ズーム：中心を基点に2倍に拡大して画面を星で埋める
  const initScale = 2.0;
  svg.call(zoomBehavior.transform, d3.zoomIdentity
    .translate(width / 2 * (1 - initScale), height / 2 * (1 - initScale))
    .scale(initScale)
  );

  // ---------- 凡例 ----------
  buildLegend();

  // ---------- フォースシミュレーション ----------
  const simulation = d3.forceSimulation(data.nodes)
    .force('link',      d3.forceLink(data.links).id(d => d.id).distance(55))
    .force('charge',    d3.forceManyBody().strength(d => d.type === 'deco' ? -15 : -80))
    .force('x',         d3.forceX(width / 2).strength(0.08))
    .force('y',         d3.forceY(height / 2).strength(0.08))
    .force('collision', d3.forceCollide(d => {
      if (d.type === 'deco') return decoR + 3;
      return (d.type === 'tag' ? tagR() : nodeRadius) + 20;
    }));

  // ---------- リンク ----------
  const link = rotG.append('g').attr('class', 'links')
    .selectAll('line')
    .data(data.links)
    .join('line')
    .attr('class', 'link')
    .style('stroke',           d => d.type === 'tag' ? '#4a8c3a' : '#888888')
    .style('stroke-dasharray', d => d.type === 'manual' ? '5,4' : 'none')
    .style('stroke-width', `${1.2 * strokeMult}px`);

  // PCホバーで reason 表示（タッチは linkHandle で対応）
  link.on('mousemove', (event, d) => {
      if (d.type !== 'manual' || !d.reason) return;
      showTooltip(tooltip, event, d.reason);
    })
    .on('mouseleave', () => hideTooltip(tooltip));

  // ---------- ノード ----------
  const node = rotG.append('g').attr('class', 'nodes')
    .selectAll('g')
    .data(data.nodes)
    .join('g')
    .attr('class', d => `node ${d.type}`)
    .call(makeDrag(simulation));

  // 円（色はD3で直接指定）
  node.append('circle')
    .attr('r', d => {
      if (d.type === 'deco') return decoR;
      return d.type === 'tag' ? tagR() : nodeRadius;
    })
    .style('fill', d => {
      if (d.type === 'deco') return decoColor;
      return d.type === 'tag' ? '#4a8c3a' : '#999999';
    })
    .style('stroke', 'none')
    .style('cursor', d => d.type === 'episode' ? 'pointer' : 'default')
    .on('mouseenter', function(event, d) {
      if      (d.type === 'tag')     d3.select(this).style('fill', '#2d6b20');
      else if (d.type === 'episode') d3.select(this).style('fill', EP_HOVER);
      else if (d.type === 'deco')    d3.select(this).style('fill', '#aaaaaa');
    })
    .on('mouseleave', function(event, d) {
      if      (d.type === 'tag')  d3.select(this).style('fill', '#4a8c3a');
      else if (d.type === 'deco')    d3.select(this).style('fill', decoColor);
      // episode はホバー後も色を保持（リロードまで戻さない）
    });

  // 円の中テキスト（番号 or # ／ decoは非表示）
  node.filter(d => d.type !== 'deco')
    .append('text')
    .attr('class', 'node-ep')
    .attr('x', 0).attr('y', 0)
    .text(d => d.type === 'tag' ? '#' : formatEpId(d.id));

  // 円の下：エピソードタイトル
  node.filter(d => d.type === 'episode')
    .append('text')
    .attr('class', 'node-title')
    .attr('x', 0).attr('y', 0)
    .text(d => truncate(d.title || '', 16));

  // 円の下：タグラベル
  node.filter(d => d.type === 'tag')
    .append('text')
    .attr('class', 'node-tag-label')
    .attr('x', 0).attr('y', 0)
    .text(d => d.label || '');

  // ---------- 手動リンク中点ハンドル ----------
  const manualLinks = data.links.filter(d => d.type === 'manual');
  const linkHandle = rotG.append('g').attr('class', 'link-handles')
    .selectAll('circle')
    .data(manualLinks)
    .join('circle')
    .attr('r', 2.5)
    .style('fill', '#888888')
    .style('cursor', 'pointer')
    .style('stroke', 'none');

  linkHandle
    .on('mousemove', (event, d) => {
      if (!d.reason) return;
      showTooltip(tooltip, event, d.reason);
    })
    .on('mouseleave', () => hideTooltip(tooltip))
    .on('click', (event, d) => {
      if (!d.reason) return;
      event.stopPropagation();
      showTooltip(tooltip, event, d.reason);
    });

  // 初期スタイルと表示状態を明示的に設定
  applyEpStyle();
  applyTitleStyle();
  svg.classed('hide-text', currentK < hideThreshold);

  // ---------- インタラクション ----------
  const isTouch = window.matchMedia('(pointer: coarse)').matches;

  if (isTouch) {
    const modal      = document.getElementById('modal');
    const modalClose = document.getElementById('modal-close');

    function openModal(d) {
      node.filter(n => n.id === d.id).select('circle').style('fill', EP_HOVER);
      document.getElementById('modal-ep').textContent       = formatEpId(d.id);
      document.getElementById('modal-title').textContent    = d.title || '';
      document.getElementById('modal-link').href            = d.url || '#';
      document.getElementById('modal-summary').textContent  = d.summary || '';
      document.getElementById('modal-shownote').textContent = d.shownote || '';
      modal.classList.remove('hidden');
    }

    node.filter(d => d.type === 'episode')
      .on('click', (event, d) => openModal(d));

    node.filter(d => d.type === 'tag')
      .on('click', (event, d) => {
        showTooltip(tooltip, event, `<span class="tip-title">#${d.label}</span>`);
      });

    svg.on('click', (event) => {
      if (!event.target.closest('g.node') && !event.target.closest('g.link-handles')) {
        hideTooltip(tooltip);
      }
    });

    modalClose.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', e => {
      if (e.target === modal) modal.classList.add('hidden');
    });

  } else {
    node.filter(d => d.type === 'episode')
      .on('click',     (event, d) => { if (d.url) window.open(d.url, '_blank'); })
      .on('mousemove', (event, d) => {
        const shownote = d.shownote ? `<br><br>${d.shownote}` : '';
        showTooltip(tooltip, event,
          `<span class="tip-title">${d.title || d.id}</span>${d.summary || ''}${shownote}`
        );
      })
      .on('mouseleave', () => hideTooltip(tooltip));

    node.filter(d => d.type === 'tag')
      .on('mousemove', (event, d) => {
        showTooltip(tooltip, event, `<span class="tip-title">#${d.label}</span>`);
      })
      .on('mouseleave', () => hideTooltip(tooltip));
  }

  // ---------- tick ----------
  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('transform', d => `translate(${d.x},${d.y})`);
    linkHandle
      .attr('cx', d => (d.source.x + d.target.x) / 2)
      .attr('cy', d => (d.source.y + d.target.y) / 2);
  });

  // ---------- 回転アニメーション ----------
  let lastTime = null;
  function rotateLoop(time) {
    if (lastTime !== null && rotSpeed !== 0) {
      rotAngle += rotSpeed * (time - lastTime) / 1000;
      rotG.attr('transform', `rotate(${rotAngle}, ${width / 2}, ${height / 2})`);
      applyEpStyle();
      applyTitleStyle();
    }
    lastTime = time;
    requestAnimationFrame(rotateLoop);
  }
  requestAnimationFrame(rotateLoop);

  // ---------- リサイズ ----------
  window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    svg.attr('viewBox', `0 0 ${w} ${h}`);
    simulation
      .force('x', d3.forceX(w / 2).strength(val('s-gravity')))
      .force('y', d3.forceY(h / 2).strength(val('s-gravity')))
      .alpha(0.3).restart();
  });

  // ============================================================
  // スタイル適用
  // ============================================================
  function applyEpStyle() {
    // 回転角の逆補正で番号を常に正立させる
    g.selectAll('.node-ep')
      .style('font-size', `${epFontPx}px`)
      .attr('transform', `rotate(${-rotAngle})`);
  }

  function applyTitleStyle() {
    // 回転中も円の真下に文字を正立させる
    // タイトルを視覚的に(0, titleY)に置くため、回転座標系内での位置を逆算する
    const a       = rotAngle * Math.PI / 180;
    const sinA    = Math.sin(a);
    const cosA    = Math.cos(a);
    const titleY  = nodeRadius + TITLE_OFFSET_PX / currentK;
    const tagLY   = tagR()    + TITLE_OFFSET_PX / currentK;

    g.selectAll('.node-title')
      .style('font-size', `${titleFontPx / currentK}px`)
      .attr('transform', `translate(${titleY * sinA}, ${titleY * cosA}) rotate(${-rotAngle})`);
    g.selectAll('.node-tag-label')
      .style('font-size', `${titleFontPx / currentK}px`)
      .attr('transform', `translate(${tagLY * sinA}, ${tagLY * cosA}) rotate(${-rotAngle})`);
  }

  // ============================================================
  // スライダー
  // ============================================================
  function val(id) { return parseFloat(document.getElementById(id).value); }
  function setVal(id, v) {
    document.getElementById(id).textContent =
      Number.isInteger(v) ? v : v.toFixed(2);
  }

  document.getElementById('s-stroke').addEventListener('input', () => {
    strokeMult = val('s-stroke');
    setVal('v-stroke', strokeMult);
    link.style('stroke-width', `${1.2 * strokeMult}px`);
  });

  document.getElementById('s-link').addEventListener('input', () => {
    const dist = val('s-link');
    setVal('v-link', dist);
    simulation.force('link', d3.forceLink(data.links).id(d => d.id).distance(dist));
    simulation.alpha(0.3).restart();
  });

  document.getElementById('s-gravity').addEventListener('input', () => {
    const s = val('s-gravity');
    setVal('v-gravity', s);
    simulation
      .force('x', d3.forceX(width / 2).strength(s))
      .force('y', d3.forceY(height / 2).strength(s))
      .alpha(0.3).restart();
  });

  document.getElementById('s-radius').addEventListener('input', () => {
    nodeRadius = val('s-radius');
    setVal('v-radius', nodeRadius);
    node.select('circle').attr('r', d => d.type === 'tag' ? tagR() : nodeRadius);
    simulation.force('collision',
      d3.forceCollide(d => (d.type === 'tag' ? tagR() : nodeRadius) + 20)
    ).alpha(0.3).restart();
    applyTitleStyle();
  });

  document.getElementById('s-ep-font').addEventListener('input', () => {
    epFontPx = val('s-ep-font');
    setVal('v-ep-font', epFontPx);
    applyEpStyle();
  });

  document.getElementById('s-title-font').addEventListener('input', () => {
    titleFontPx = val('s-title-font');
    setVal('v-title-font', titleFontPx);
    applyTitleStyle();
  });

  document.getElementById('s-threshold').addEventListener('input', () => {
    hideThreshold = val('s-threshold');
    setVal('v-threshold', hideThreshold);
    svg.classed('hide-text', currentK < hideThreshold);
  });

  document.getElementById('s-rotate').addEventListener('input', () => {
    rotSpeed = val('s-rotate');
    setVal('v-rotate', rotSpeed);
  });
}

// ------------------------------------------------------------
// ドラッグ処理
// ------------------------------------------------------------
function makeDrag(simulation) {
  return d3.drag()
    .on('start', (event, d) => {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x; d.fy = d.y;
    })
    .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y; })
    .on('end',   (event, d) => {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null; d.fy = null;
    });
}

// ------------------------------------------------------------
// ツールチップ
// ------------------------------------------------------------
function showTooltip(el, event, html) {
  el.innerHTML = html;
  el.classList.remove('hidden');
  const rect = document.getElementById('graph-container').getBoundingClientRect();
  let x = event.clientX - rect.left + 14;
  let y = event.clientY - rect.top  + 14;
  if (x + 260 > rect.width)  x -= 270;
  if (y + 120 > rect.height) y -= 120;
  el.style.left = `${Math.max(4, x)}px`;
  el.style.top  = `${Math.max(4, y)}px`;
}

function hideTooltip(el) { el.classList.add('hidden'); }

// ------------------------------------------------------------
// IDを 001 形式にフォーマット
// ------------------------------------------------------------
function formatEpId(id) {
  const n = parseInt(id, 10);
  return isNaN(n) ? String(id) : String(n).padStart(3, '0');
}

// ------------------------------------------------------------
// 凡例（リンク種別の2種類を固定表示）
// ------------------------------------------------------------
function buildLegend() {
  const el = document.getElementById('legend');
  el.innerHTML = `
    <div class="legend-item">
      <svg width="24" height="8">
        <line x1="0" y1="4" x2="24" y2="4"
          stroke="#4a8c3a" stroke-width="1.5"/>
      </svg>
      <span>タグリンク</span>
    </div>
    <div class="legend-item">
      <svg width="24" height="8">
        <line x1="0" y1="4" x2="24" y2="4"
          stroke="#888888" stroke-width="1.5" stroke-dasharray="5,3"/>
      </svg>
      <span>手動リンク</span>
    </div>
  `;
}

// ------------------------------------------------------------
// テキストを切り詰める
// ------------------------------------------------------------
function truncate(str, maxLen) {
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

// ------------------------------------------------------------
// 起動
// ------------------------------------------------------------

// iframeに埋め込まれているときは凡例とスライダーを非表示にし、回転を有効にする
if (window.self !== window.top) {
  document.getElementById('legend').style.display   = 'none';
  document.getElementById('controls').style.display = 'none';
  document.getElementById('s-rotate').value = '3'; // iframeでは3度/秒で回転
}

main();
