// ============================================================
// ラッキーもくもくチャンス - D3.js グラフ描画
// ============================================================

// ▼▼▼ GASのWebアプリURLをここに貼り付けてください ▼▼▼
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyEh6UMPI2yYMhAsTds_kvCNQH8XEsLuP-ClOa_dTyAnfG5K7itKrOY8Cm_jgEankJp/exec';
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

// ============================================================
// 色の設定 ← ここだけ変更すれば全色が変わります
// ============================================================
const COLORS = {
  episode:          '#089900',  // エピソード円
  episodeHover:     '#0b6100',  // エピソード円ホバー時
  episodeClick:     '#f29191',  // エピソード円クリック時
  tag:              '#878787',  // タグ円
  tagHover:         '#4d4d4d',  // タグ円ホバー時
  deco:             '#dedede',  // デコ星
  linkTag:          '#878787',  // タグリンクの線
  linkManual:       '#878787',  // 手動リンクの線・点
  linkManualHover:  '#4d4d4d',  // 手動リンク点ホバー時
  labelInner:       '#ffffff',  // 円内テキスト（番号・#）
  labelTitle:       '#000000',  // エピソードタイトル
  labelTag:         '#878787',  // タグラベル
};

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
  let epFontPx      = parseFloat(document.getElementById('s-ep-font').value);
  let titleFontPx   = parseFloat(document.getElementById('s-title-font').value);
  let strokeMult    = 0.8;
  let hideThreshold = 1.2;
  let rotSpeed         = parseFloat(document.getElementById('s-rotate').value);
  let rotAngle         = 0;
  let decoGravStrength = parseFloat(document.getElementById('s-deco-gravity').value);
  let decoSpread       = parseFloat(document.getElementById('s-deco-spread').value);
  let decoR            = parseFloat(document.getElementById('s-deco-size').value);
  let linkDist         = parseFloat(document.getElementById('s-link').value);
  const TITLE_OFFSET_PX = 14;

  // CSSカスタムプロパティにCOLORSを反映（style.cssのvar()が自動追従）
  const root = document.documentElement.style;
  root.setProperty('--c-episode',       COLORS.episode);
  root.setProperty('--c-episode-hover', COLORS.episodeHover);
  root.setProperty('--c-episode-click', COLORS.episodeClick);
  root.setProperty('--c-tag',           COLORS.tag);
  root.setProperty('--c-tag-hover',     COLORS.tagHover);
  root.setProperty('--c-deco',          COLORS.deco);
  root.setProperty('--c-link-tag',      COLORS.linkTag);
  root.setProperty('--c-link-manual',   COLORS.linkManual);
  root.setProperty('--c-label-inner',   COLORS.labelInner);
  root.setProperty('--c-label-title',   COLORS.labelTitle);
  root.setProperty('--c-label-tag',     COLORS.labelTag);

  const tagR        = () => Math.max(8, nodeRadius * 0.55);
  const DECO_COUNT  = 500;
  const DECO_MARGIN = 2; // アウトライン間の最小ギャップ（大きすぎると輪っかになる）

  // デコ星を生成してシミュレーションに参加させる
  const decoNodes = d3.range(DECO_COUNT).map(i => ({
    id:           `deco_${i}`,
    type:         'deco',
    x:            Math.random() * width,
    y:            Math.random() * height,
    spreadFactor: Math.random(),
  }));
  data.nodes.push(...decoNodes);

  // ロゴノード（3分割PNG、最初は左上に固定）
  // initScale=2.0 なので画面左上付近のシミュレーション座標 = (画面px / 2 + offset)
  const LOGO_W = 110; // 表示幅 (px in simulation space)
  const logoBaseX = width / 2 - width / initScale / 2 + 20 + LOGO_W / 2;
  const logoBaseY = height / 2 - height / initScale / 2 + 20;
  const logoParts = [
    { src: 'image/ラキモクチャン_ロゴ_ラッキー.png',  origW: 2130, origH: 827 },
    { src: 'image/ラキモクチャン_ロゴ_もくもく.png', origW: 1965, origH: 827 },
    { src: 'image/ラキモクチャン_ロゴ_チャンス.png', origW: 2114, origH: 827 },
  ];
  const logoNodes = logoParts.map((p, i) => {
    const h = Math.round(LOGO_W * p.origH / p.origW);
    const y = logoBaseY + i * (h + 6) + h / 2;
    return {
      id:   `logo_${i}`,
      type: 'logo',
      src:  p.src,
      w:    LOGO_W,
      h:    h,
      x:    logoBaseX,
      y:    y,
      fx:   logoBaseX,
      fy:   y,
    };
  });
  data.nodes.push(...logoNodes);

  const initScale = 2.0;

  // ---------- SVG ----------
  const svg = d3.select('#graph')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const g    = svg.append('g');
  const rotG = g.append('g');

  const zoomBehavior = d3.zoom()
    .scaleExtent([0.2, 4])
    .on('zoom', e => {
      g.attr('transform', e.transform);
      currentK = e.transform.k;
      svg.classed('hide-text', currentK < hideThreshold);
      applyTitleStyle();
    });

  svg.call(zoomBehavior);

  svg.call(zoomBehavior.transform, d3.zoomIdentity
    .translate(width / 2 * (1 - initScale), height / 2 * (1 - initScale))
    .scale(initScale)
  );

  buildLegend();

  // ---------- フォースシミュレーション ----------
  // アウトライン間距離 = linkDist + 両ノードの半径
  const getLinkDistance = d => {
    const sr = d.source.type === 'tag' ? tagR() : nodeRadius;
    const tr = d.target.type === 'tag' ? tagR() : nodeRadius;
    return linkDist + sr + tr;
  };

  const simulation = d3.forceSimulation(data.nodes)
    .force('link',      d3.forceLink(data.links).id(d => d.id).distance(getLinkDistance))
    .force('charge',    d3.forceManyBody().strength(d => (d.type === 'deco' || d.type === 'logo') ? -8 : -80))
    .force('x',         d3.forceX(width / 2).strength(d => (d.type === 'deco' || d.type === 'logo') ? 0 : 0.08))
    .force('y',         d3.forceY(height / 2).strength(d => (d.type === 'deco' || d.type === 'logo') ? 0 : 0.08))
    .force('collision-ep',   makeSubsetCollide(d => d.type !== 'deco' && d.type !== 'logo', d => (d.type === 'tag' ? tagR() : nodeRadius) + 20))
    .force('collision-deco', makeSubsetCollide(d => d.type === 'deco',
      d => Math.max(decoR, (decoR + 20) * (1 + (d.spreadFactor - 0.5) * decoSpread * 4))))
    .force('deco-ep-repel',  makeDecoEpRepel(data.nodes, () => nodeRadius, tagR, () => decoR, DECO_MARGIN))
    .force('wander', () => {
      data.nodes.forEach(d => {
        if (d.type !== 'deco' && d.type !== 'logo') return;
        d.vx = (d.vx || 0) + (Math.random() - 0.5) * 0.2;
        d.vy = (d.vy || 0) + (Math.random() - 0.5) * 0.2;
        // 中心引力
        d.vx += (width  / 2 - d.x) * decoGravStrength * 0.015;
        d.vy += (height / 2 - d.y) * decoGravStrength * 0.015;
        // 円形境界で跳ね返す
        const cx = width / 2, cy = height / 2;
        const bR = Math.min(width, height) * 0.48;
        const bdx = d.x - cx, bdy = d.y - cy;
        const bdist = Math.hypot(bdx, bdy);
        if (bdist > bR) {
          d.vx -= (bdx / bdist) * 0.6;
          d.vy -= (bdy / bdist) * 0.6;
        }
      });
    })
    .alphaDecay(0.02)
    .alphaTarget(0.005);

  // ==========================================================
  // 描画レイヤー（Z順：デコ星 → リンク → ep/tagノード → リンクハンドル → テキスト）
  // ==========================================================

  // 1. デコ星レイヤー（最背面）
  const decoLayer  = rotG.append('g').attr('class', 'deco-layer');
  const decoCircle = decoLayer.selectAll('circle')
    .data(decoNodes)
    .join('circle')
    .attr('r', decoR)
    .style('fill', COLORS.deco)
    .style('stroke', 'none');

  // 1b. ロゴレイヤー（デコ星の前面・リンクの背面）
  const logoLayer = rotG.append('g').attr('class', 'logo-layer');
  const logoImage = logoLayer.selectAll('image')
    .data(logoNodes)
    .join('image')
    .attr('href',   d => d.src)
    .attr('width',  d => d.w)
    .attr('height', d => d.h)
    .attr('x',      d => d.x - d.w / 2)
    .attr('y',      d => d.y - d.h / 2)
    .style('opacity', 0);

  // フェードイン → 2.5秒後に解放してふわふわ
  logoImage.transition().duration(600).style('opacity', 1);
  setTimeout(() => {
    logoNodes.forEach(d => { d.fx = null; d.fy = null; });
    simulation.alpha(0.3).restart();
  }, 2500);

  // 2. リンク
  const link = rotG.append('g').attr('class', 'links')
    .selectAll('line')
    .data(data.links)
    .join('line')
    .attr('class', 'link')
    .style('stroke',           d => d.type === 'tag' ? COLORS.linkTag : COLORS.linkManual)
    .style('stroke-dasharray', d => d.type === 'manual' ? '5,4' : 'none')
    .style('stroke-width', `${1.2 * strokeMult}px`);


  // 3. Episode / tag ノード（円のみ、テキストなし）
  const epTagNodeData = data.nodes.filter(d => d.type !== 'deco' && d.type !== 'logo');
  const epNode = rotG.append('g').attr('class', 'ep-nodes')
    .selectAll('g')
    .data(epTagNodeData)
    .join('g')
    .attr('class', d => `node ${d.type}`);

  epNode.call(makeDrag(simulation));

  epNode.append('circle')
    .attr('r', d => d.type === 'tag' ? tagR() : nodeRadius)
    .style('fill', d => d.type === 'tag' ? COLORS.tag : COLORS.episode)
    .style('stroke', 'none')
    .style('cursor', d => d.type === 'episode' ? 'pointer' : 'default')
    .on('mouseenter', function(event, d) {
      if (d.type === 'tag')              d3.select(this).style('fill', COLORS.tagHover);
      if (d.type === 'episode' && !d._clicked) d3.select(this).style('fill', COLORS.episodeHover);
    })
    .on('mouseleave', function(event, d) {
      if (d.type === 'tag')              d3.select(this).style('fill', COLORS.tag);
      if (d.type === 'episode' && !d._clicked) d3.select(this).style('fill', COLORS.episode);
    });

  // 4. 手動リンク中点ハンドル
  const manualLinks = data.links.filter(d => d.type === 'manual');
  const linkHandle = rotG.append('g').attr('class', 'link-handles')
    .selectAll('circle')
    .data(manualLinks)
    .join('circle')
    .attr('r', 2.5)
    .style('fill', COLORS.linkManual)
    .style('cursor', 'pointer')
    .style('stroke', 'none');

  linkHandle
    .on('mouseenter', function(event, d) {
      d3.select(this).style('fill', COLORS.linkManualHover);
      if (d.reason) showTooltip(tooltip, event, d.reason);
    })
    .on('mousemove', (event, d) => {
      if (d.reason) showTooltip(tooltip, event, d.reason);
    })
    .on('mouseleave', function() {
      d3.select(this).style('fill', COLORS.linkManual);
      hideTooltip(tooltip);
    })
    .on('click', (event, d) => {
      if (!d.reason) return;
      event.stopPropagation();
      showTooltip(tooltip, event, d.reason);
    });

  // 5. テキストレイヤー（最前面）
  const textLayer = rotG.append('g').attr('class', 'text-layer');
  const textGroup = textLayer.selectAll('g')
    .data(epTagNodeData)
    .join('g');

  textGroup.append('text')
    .attr('class', 'node-ep')
    .attr('x', 0).attr('y', 0)
    .text(d => d.type === 'tag' ? '#' : formatEpId(d.id));

  textGroup.filter(d => d.type === 'episode')
    .append('text')
    .attr('class', 'node-title')
    .attr('x', 0).attr('y', 0)
    .text(d => truncate(d.title || '', 16));

  textGroup.filter(d => d.type === 'tag')
    .append('text')
    .attr('class', 'node-tag-label')
    .attr('x', 0).attr('y', 0)
    .text(d => d.label || '');

  applyEpStyle();
  applyTitleStyle();
  svg.classed('hide-text', currentK < hideThreshold);

  // ---------- インタラクション ----------
  const isTouch = window.matchMedia('(pointer: coarse)').matches;

  if (isTouch) {
    const modal      = document.getElementById('modal');
    const modalClose = document.getElementById('modal-close');

    function openModal(d) {
      d._clicked = true;
      epNode.filter(n => n.id === d.id).select('circle').style('fill', COLORS.episodeClick);
      document.getElementById('modal-ep').textContent       = formatEpId(d.id);
      document.getElementById('modal-title').textContent    = d.title || '';
      document.getElementById('modal-link').href            = d.url || '#';
      document.getElementById('modal-summary').innerHTML = (d.summary || '').replace(/\n/g, '<br>');
      modal.classList.remove('hidden');
    }

    epNode.filter(d => d.type === 'episode')
      .on('click', (event, d) => openModal(d));

    epNode.filter(d => d.type === 'tag')
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
    epNode.filter(d => d.type === 'episode')
      .on('click', (event, d) => {
        d._clicked = true;
        d3.select(event.currentTarget).select('circle').style('fill', COLORS.episodeClick);
        if (d.url) window.open(d.url, '_blank');
      })
      .on('mousemove', (event, d) => {
        showTooltip(tooltip, event,
          `<span class="tip-title">${d.title || d.id}</span>${(d.summary || '').replace(/\n/g, '<br>')}`
        );
      })
      .on('mouseleave', () => hideTooltip(tooltip));

    epNode.filter(d => d.type === 'tag')
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
    decoCircle.attr('cx', d => d.x).attr('cy', d => d.y);
    logoImage.attr('x', d => d.x - d.w / 2).attr('y', d => d.y - d.h / 2);
    epNode.attr('transform', d => `translate(${d.x},${d.y})`);
    textGroup.attr('transform', d => `translate(${d.x},${d.y})`);
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
    const s  = val('s-gravity');
    const sd = val('s-deco-gravity');
    simulation
      .force('x', d3.forceX(w / 2).strength(d => d.type === 'deco' ? sd : s))
      .force('y', d3.forceY(h / 2).strength(d => d.type === 'deco' ? sd : s))
      .alpha(0.3).restart();
  });

  // ============================================================
  // スタイル適用
  // ============================================================
  function applyEpStyle() {
    g.selectAll('.node-ep')
      .style('font-size', `${epFontPx}px`)
      .attr('transform', `rotate(${-rotAngle})`);
  }

  function applyTitleStyle() {
    const a      = rotAngle * Math.PI / 180;
    const sinA   = Math.sin(a);
    const cosA   = Math.cos(a);
    const titleY = nodeRadius + TITLE_OFFSET_PX / currentK;
    const tagLY  = tagR()    + TITLE_OFFSET_PX / currentK;

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
    linkDist = val('s-link');
    setVal('v-link', linkDist);
    simulation.force('link', d3.forceLink(data.links).id(d => d.id).distance(getLinkDistance));
    simulation.alpha(0.3).restart();
  });

  document.getElementById('s-gravity').addEventListener('input', () => {
    const s  = val('s-gravity');
    const sd = val('s-deco-gravity');
    setVal('v-gravity', s);
    simulation
      .force('x', d3.forceX(width / 2).strength(d => d.type === 'deco' ? sd : s))
      .force('y', d3.forceY(height / 2).strength(d => d.type === 'deco' ? sd : s))
      .alpha(0.3).restart();
  });

  document.getElementById('s-deco-gravity').addEventListener('input', () => {
    decoGravStrength = val('s-deco-gravity');
    setVal('v-deco-gravity', decoGravStrength);
  });

  document.getElementById('s-deco-spread').addEventListener('input', () => {
    decoSpread = val('s-deco-spread');
    setVal('v-deco-spread', decoSpread);
    simulation.force('collision-deco',
      makeSubsetCollide(d => d.type === 'deco',
        d => Math.max(decoR, (decoR + 20) * (1 + (d.spreadFactor - 0.5) * decoSpread * 4)))
    ).alpha(0.3).restart();
  });

  document.getElementById('s-radius').addEventListener('input', () => {
    nodeRadius = val('s-radius');
    setVal('v-radius', nodeRadius);
    epNode.select('circle')
      .attr('r', d => d.type === 'tag' ? tagR() : nodeRadius);
    simulation.force('collision-ep',
      makeSubsetCollide(d => d.type !== 'deco', d => (d.type === 'tag' ? tagR() : nodeRadius) + 20)
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

  document.getElementById('s-deco-size').addEventListener('input', () => {
    decoR = val('s-deco-size');
    setVal('v-deco-size', decoR);
    decoCircle.attr('r', decoR);
    simulation.force('collision-deco',
      makeSubsetCollide(d => d.type === 'deco',
        d => Math.max(decoR, (decoR + 20) * (1 + (d.spreadFactor - 0.5) * decoSpread * 4)))
    ).alpha(0.3).restart();
  });

  // ============================================================
  // カラーパネル
  // ============================================================
  const COLOR_DEFS = [
    { key: 'episode',      label: 'エピソード円' },
    { key: 'episodeHover', label: 'エピソード（ホバー）' },
    { key: 'episodeClick', label: 'エピソード（クリック）' },
    { key: 'tag',          label: 'タグ円' },
    { key: 'tagHover',     label: 'タグ（ホバー）' },
    { key: 'deco',         label: 'デコ星' },
    { key: 'linkTag',         label: 'タグリンク' },
    { key: 'linkManual',      label: '手動リンク' },
    { key: 'linkManualHover', label: '手動リンク（ホバー）' },
    { key: 'labelInner',      label: '円内テキスト' },
    { key: 'labelTitle',   label: 'タイトル' },
    { key: 'labelTag',     label: 'タグラベル' },
  ];

  const CSS_VAR = {
    episode: '--c-episode', episodeHover: '--c-episode-hover', episodeClick: '--c-episode-click',
    tag: '--c-tag', tagHover: '--c-tag-hover', deco: '--c-deco',
    linkTag: '--c-link-tag', linkManual: '--c-link-manual', linkManualHover: '--c-link-manual-hover',
    labelInner: '--c-label-inner', labelTitle: '--c-label-title', labelTag: '--c-label-tag',
  };

  const cpEl = document.getElementById('color-panel');
  cpEl.innerHTML = COLOR_DEFS.map(({ key, label }) => `
    <div class="color-row">
      <span class="color-label">${label}</span>
      <input class="color-swatch" type="color" data-key="${key}" value="${COLORS[key]}">
      <input class="color-text"   type="text"  data-key="${key}" value="${COLORS[key]}" maxlength="7" spellcheck="false">
    </div>
  `).join('');

  function applyColor(key, value) {
    COLORS[key] = value;
    document.documentElement.style.setProperty(CSS_VAR[key], value);
    if (key === 'episode')    epNode.filter(d => d.type === 'episode').select('circle').style('fill', value);
    if (key === 'tag')        epNode.filter(d => d.type === 'tag').select('circle').style('fill', value);
    if (key === 'deco')       decoCircle.style('fill', value);
    if (key === 'linkTag')  { link.filter(d => d.type === 'tag').style('stroke', value); buildLegend(); }
    if (key === 'linkManual') { link.filter(d => d.type !== 'tag').style('stroke', value); linkHandle.style('fill', value); buildLegend(); }
    if (key === 'linkManualHover') { /* applied on hover */ }
  }

  cpEl.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('input', () => {
      const key = swatch.dataset.key;
      cpEl.querySelector(`.color-text[data-key="${key}"]`).value = swatch.value;
      applyColor(key, swatch.value);
    });
  });

  cpEl.querySelectorAll('.color-text').forEach(text => {
    text.addEventListener('input', () => {
      const key = text.dataset.key;
      if (/^#[0-9a-fA-F]{6}$/.test(text.value)) {
        text.classList.remove('invalid');
        cpEl.querySelector(`.color-swatch[data-key="${key}"]`).value = text.value;
        applyColor(key, text.value);
      } else {
        text.classList.add('invalid');
      }
    });
    text.addEventListener('blur', () => {
      if (text.classList.contains('invalid')) {
        const key = text.dataset.key;
        text.value = COLORS[key];
        text.classList.remove('invalid');
      }
    });
  });
}

// ------------------------------------------------------------
// デコ→episode/tag 一方向反発フォース（decoだけ押しのける）
// velocity push方式：ソフトな押し出しで輪っかを作らない
// ------------------------------------------------------------
function makeDecoEpRepel(allNodes, getNodeRadius, tagR, getDecoR, decoMargin) {
  const epTagNodes = allNodes.filter(d => d.type !== 'deco');
  return function() {
    allNodes.forEach(d => {
      if (d.type !== 'deco') return;
      epTagNodes.forEach(ep => {
        let dx   = d.x - ep.x;
        let dy   = d.y - ep.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.5) {
          const a = Math.random() * Math.PI * 2;
          dx = Math.cos(a); dy = Math.sin(a); dist = 1;
        }
        const minR = (ep.type === 'tag' ? tagR() : getNodeRadius()) + getDecoR() + decoMargin;
        if (dist < minR) {
          // 最低でも 0.5 の押し出しを保証してwanderに負けないようにする
          const push = Math.max((minR - dist) / dist, 0.5);
          d.vx += (dx / dist) * push;
          d.vy += (dy / dist) * push;
        }
      });
    });
  };
}

// ------------------------------------------------------------
// サブセット衝突フォース（指定ノード同士のみ衝突）
// ------------------------------------------------------------
function makeSubsetCollide(filterFn, radiusFn) {
  const inner = d3.forceCollide(radiusFn).strength(1);
  function force(alpha) { inner(alpha); }
  force.initialize = function(nodes, random) {
    inner.initialize(nodes.filter(filterFn), random);
  };
  return force;
}

// ------------------------------------------------------------
// ドラッグ処理（episode / tag 用）
// ------------------------------------------------------------
function makeDrag(simulation) {
  return d3.drag()
    .on('start', (event, d) => {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x; d.fy = d.y;
    })
    .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y; })
    .on('end',   (event, d) => {
      if (!event.active) simulation.alphaTarget(0.005);
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
// 凡例
// ------------------------------------------------------------
function buildLegend() {
  const el = document.getElementById('legend');
  el.innerHTML = `
    <div class="legend-item">
      <svg width="24" height="8">
        <line x1="0" y1="4" x2="24" y2="4"
          stroke="${COLORS.linkTag}" stroke-width="1.5"/>
      </svg>
      <span>タグリンク</span>
    </div>
    <div class="legend-item">
      <svg width="24" height="8">
        <line x1="0" y1="4" x2="24" y2="4"
          stroke="${COLORS.linkManual}" stroke-width="1.5" stroke-dasharray="5,3"/>
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
if (window.self !== window.top) {
  document.getElementById('legend').style.display      = 'none';
  document.getElementById('controls').style.display    = 'none';
  document.getElementById('color-panel').style.display = 'none';
  document.getElementById('s-rotate').value = '3';
}

main();
