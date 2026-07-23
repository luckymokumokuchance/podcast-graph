// ============================================================
// ラッキーもくもくチャンス - D3.js グラフ描画
// ============================================================

// ▼▼▼ GASのWebアプリURLをここに貼り付けてください ▼▼▼
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxk2jQTHhowhGTXBAMsAcEZWbjELoxQAoSEkVy8EIMHuwXsgO_H6xxNqJPiqsvj5Dnd/exec';
const ASSET_BASE = window.GRAPH_ASSET_BASE || '';
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
    // GASの代わりにRSS(+links.json)から、GASと同じ形のデータを組み立てる
    const d = await window.PodcastData.load();
    const episodeNodes = d.episodes.map(e => ({
      id: String(e.id), type: 'episode',
      title: e.title, url: e.link, summary: e.descHtml, published_at: e.date,
      tags: e.tags || [],
    }));
    const tagNodes = d.nodes.filter(n => n.type === 'tag');
    data = { nodes: [...episodeNodes, ...tagNodes], links: d.graphLinks, images: {} };
  } catch (e) {
    loadingEl.textContent = 'データの取得に失敗しました（RSS）。';
    console.error(e);
    return;
  }

  if (!data.nodes || data.nodes.length === 0) {
    loadingEl.textContent = '表示できるエピソードがまだありません。';
    return;
  }

  const tableLayout = await loadTableLayout();

  loadingEl.classList.add('hidden');
  drawGraph(data, tooltip, tableLayout);
}

// ------------------------------------------------------------
// テーブル整列モードのレイアウト調整値（調整ページで保存したJSONがあれば反映）
// ------------------------------------------------------------
// titleTagsGap/summaryTagsGapは「丸の中心からの絶対Y位置」（旧仕様からの移行値。
// 旧: summaryY = -titleH/2 + titleH + titleTagsGap(9) = 18 / tagsY = summaryY + summaryH + summaryTagsGap(4) = 54）
const TABLE_LAYOUT_DEFAULTS = {
  rowH: 60, leftX: 64, tableR: 10,
  titleX: 20, titleH: 18, titleFont: 12, titleWeight: 400, titleTruncateLen: 40,
  summaryFont: 11, summaryLen: 200, summaryH: 32, summaryTagsGap: 54,
  tagsFont: 9, tagsGap: 5, titleTagsGap: 18,
  topPad: 40, rightPad: 12, bottomPad: 80,
};
async function loadTableLayout() {
  try {
    const r = await fetch('table-layout.json', { cache: 'no-store' });
    if (!r.ok) return { ...TABLE_LAYOUT_DEFAULTS };
    const j = await r.json();
    return { ...TABLE_LAYOUT_DEFAULTS, ...j };
  } catch (e) {
    return { ...TABLE_LAYOUT_DEFAULTS };
  }
}

// ------------------------------------------------------------
// D3 グラフ描画
// ------------------------------------------------------------
function drawGraph(data, tooltip, tableLayout) {
  const container = document.getElementById('graph-container');
  const width     = container.clientWidth;
  const height    = container.clientHeight;

  // ---------- 状態変数 ----------
  let tableMode     = false;   // テーブル整列モード中は回転・力学を止める
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
  let chargeStrength   = parseFloat(document.getElementById('s-charge').value);
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

  // ---------- 重要度サイズ(FORCE_MAP_SPEC §2-1) ----------
  // sizeMetric相当が無いので次数(degree)で代用。r = MIN + (MAX-MIN)*sqrt(deg/max)
  const degree = {};
  data.links.forEach(l => {
    const sId = typeof l.source === 'object' ? l.source.id : l.source;
    const tId = typeof l.target === 'object' ? l.target.id : l.target;
    degree[sId] = (degree[sId] || 0) + 1;
    degree[tId] = (degree[tId] || 0) + 1;
  });
  let maxDeg = 1;
  data.nodes.forEach(n => {
    if (n.type === 'episode' || n.type === 'tag') {
      maxDeg = Math.max(maxDeg, degree[n.id] || 0);
    }
  });
  const sizeK = d => Math.sqrt((degree[d.id] || 0) / maxDeg); // 0..1
  const nodeR = d => d.type === 'tag'
    ? tagR()      * (0.80 + 0.50 * sizeK(d))   // タグ: 0.8〜1.3倍
    : nodeRadius  * (0.72 + 0.56 * sizeK(d));  // エピソード: 0.72〜1.28倍

  // ---------- 脈打つ輪(§2-3): published_atが直近30日 ----------
  const RECENT_DAYS = 30;
  const isRecent = d => {
    if (d.type !== 'episode' || !d.published_at) return false;
    const t = Date.parse(d.published_at);
    return Number.isFinite(t) && (Date.now() - t) <= RECENT_DAYS * 86400e3;
  };
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

  const initScale = 2.0;

  // ロゴノード（3分割PNG、最初は画面中央に整列）
  const LOGO_W = 110;
  const GAP    = 6;
  const logoParts = [
    { src: ASSET_BASE + 'image/' + encodeURIComponent('ラキモクチャン_ロゴ_ラッキー.png'),  origW: 2130, origH: 827, url: 'https://lucky-mokumoku-chance.studio.site/' },
    { src: ASSET_BASE + 'image/' + encodeURIComponent('ラキモクチャン_ロゴ_もくもく.png'), origW: 1965, origH: 827, url: 'https://lucky-mokumoku-chance.studio.site/' },
    { src: ASSET_BASE + 'image/' + encodeURIComponent('ラキモクチャン_ロゴ_チャンス.png'), origW: 2114, origH: 827, url: 'https://lucky-mokumoku-chance.studio.site/' },
  ];
  const logoHeights  = logoParts.map(p => Math.round(LOGO_W * p.origH / p.origW));
  const totalLogoH   = logoHeights.reduce((a, b) => a + b, 0) + GAP * (logoParts.length - 1);
  let   logoTopY     = height / 2 - totalLogoH / 2;
  const logoNodes = logoParts.map((p, i) => {
    const h  = logoHeights[i];
    const cy = logoTopY + h / 2;
    logoTopY += h + GAP;
    return {
      id:   `logo_${i}`,
      type: 'logo',
      src:  p.src,
      url:  p.url,
      w:    LOGO_W,
      h:    h,
      x:    width / 2,
      y:    cy,
      fx:   width / 2,
      fy:   cy,
    };
  });
  data.nodes.push(...logoNodes);

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
    const sr = nodeR(d.source);
    const tr = nodeR(d.target);
    // 手動リンク(点線)はタグリンク(実線)の1.4倍離す(§3)
    const base = linkDist * (d.type === 'manual' ? 1.4 : 1);
    return base + sr + tr;
  };
  const getLinkStrength = d => (d.type === 'manual' ? 0.25 : 0.5);

  const simulation = d3.forceSimulation(data.nodes)
    .force('link',      d3.forceLink(data.links).id(d => d.id)
                          .distance(getLinkDistance).strength(getLinkStrength))
    .force('charge',    d3.forceManyBody().strength(d => d.type === 'logo' ? 0 : d.type === 'deco' ? -8 : -chargeStrength))
    .force('x',         d3.forceX(width / 2).strength(d => (d.type === 'deco' || d.type === 'logo') ? 0 : 0.08))
    .force('y',         d3.forceY(height / 2).strength(d => (d.type === 'deco' || d.type === 'logo') ? 0 : 0.08))
    .force('collision-ep',   makeSubsetCollide(d => d.type !== 'deco' && d.type !== 'logo', d => nodeR(d) + 20))
    .force('collision-deco', makeSubsetCollide(d => d.type === 'deco',
      d => Math.max(decoR, (decoR + 20) * (1 + (d.spreadFactor - 0.5) * decoSpread * 4))))
    .force('collision-logo', makeSubsetCollide(d => d.type === 'logo', d => Math.hypot(d.w / 2, d.h / 2) + 4))
    .force('deco-ep-repel',  makeDecoEpRepel(data.nodes, nodeR, () => decoR, DECO_MARGIN))
    .force('logo-ep-repel',  makeLogoEpRepel(data.nodes, nodeR))
    .force('wander', () => {
      data.nodes.forEach(d => {
        if (d.type !== 'deco' && d.type !== 'logo') return;
        d.vx = (d.vx || 0) + (Math.random() - 0.5) * 0.2;
        d.vy = (d.vy || 0) + (Math.random() - 0.5) * 0.2;
        // 中心引力（デコ星はスライダー連動、ロゴは固定値で ep/tag の反発フィールドに打ち勝つ）
        const gravK = d.type === 'logo' ? 0.0008 : decoGravStrength * 0.015;
        d.vx += (width  / 2 - d.x) * gravK;
        d.vy += (height / 2 - d.y) * gravK;
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
    .style('opacity', 1)
    .style('cursor', 'grab')
    .call(makeDrag(simulation))
    .on('click', (event, d) => {
      if (d.url && !event.defaultPrevented) window.open(d.url, '_blank');
    });

  // 2.5秒後に解放 → α値を二次曲線でランプアップして滑らかに演算開始
  setTimeout(() => {
    logoNodes.forEach(d => { d.fx = null; d.fy = null; });
    simulation.force('logo-ep-repel', null); // 解放後は押しのけ不要
    simulation.alphaDecay(0).restart(); // 自然減衰を一時停止して自前でαを制御
    const RAMP_MS   = 1500;
    const rampStart = performance.now();
    (function ramp(now) {
      const t      = Math.min((now - rampStart) / RAMP_MS, 1);
      const eased  = t * t; // 二次曲線（ゆっくり→加速）
      simulation.alpha(eased * 0.3);
      if (t < 1) requestAnimationFrame(ramp);
      else        simulation.alphaDecay(0.02); // 自然減衰を再開
    })(rampStart);
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

  // 脈打つ輪(最近のエピソードにだけ重ねる)
  // 内側リング(太め・強めの明滅)＋外側リング(半周期ずらして波紋のように)の二重構成
  const recentEp = epNode.filter(d => isRecent(d));

  const pulseRingOuter = recentEp.append('circle')
    .attr('class', 'pulse-ring pulse-ring-outer')
    .attr('r', d => nodeR(d) + 11)
    .style('fill', 'none')
    .style('stroke', COLORS.episode)
    .style('stroke-width', '3px')
    .style('pointer-events', 'none');

  const pulseRing = recentEp.append('circle')
    .attr('class', 'pulse-ring pulse-ring-inner')
    .attr('r', d => nodeR(d) + 6)
    .style('fill', 'none')
    .style('stroke', COLORS.episode)
    .style('stroke-width', '4px')
    .style('pointer-events', 'none');

  epNode.append('circle')
    .attr('class', 'node-circle')
    .attr('r', d => nodeR(d))
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
    .join('g')
    .attr('class', d => `text-node ${d.type}`);

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

  // テーブル整列モード専用: タイトル（省略せず表示。はみ出す分はクリップせず、
  // タップで全文をモーダル表示。foreignObject内でのoverflow-x:autoスクロールは
  // モバイルSafariで描画が壊れる既知の不具合があったため使わない）
  const rowTitleFO = textGroup.filter(d => d.type === 'episode')
    .append('foreignObject')
    .attr('class', 'node-title-fo')
    .attr('height', 18)
    .style('opacity', 0)
    .style('pointer-events', 'auto');
  rowTitleFO.append('xhtml:div').attr('class', 'row-title')
    .on('click', (event, d) => openModal(d));

  // テーブル整列モード専用: タイトル下のショーノート冒頭プレビュー（タップで全文モーダル）
  const rowSummaryFO = textGroup.filter(d => d.type === 'episode')
    .append('foreignObject')
    .attr('class', 'node-summary-fo')
    .style('opacity', 0)
    .style('pointer-events', 'auto');
  rowSummaryFO.append('xhtml:div').attr('class', 'row-summary')
    .on('click', (event, d) => openModal(d));

  // テーブル整列モード専用: タイトル下のタグ一覧（横並び・グレー）
  const rowTagsFO = textGroup.filter(d => d.type === 'episode')
    .append('foreignObject')
    .attr('class', 'node-tags-fo')
    .attr('width', 320).attr('height', 20)
    .style('opacity', 0)
    .style('pointer-events', 'none');
  rowTagsFO.append('xhtml:div').attr('class', 'row-tags');

  applyEpStyle();
  applyTitleStyle();
  svg.classed('hide-text', currentK < hideThreshold);

  // ---------- インタラクション ----------
  const isTouch = window.matchMedia('(pointer: coarse)').matches;

  // モーダル（PCでも ?ep= ディープリンクで使うため共通スコープに置く）
  const modal      = document.getElementById('modal');
  const modalClose = document.getElementById('modal-close');
  const imageMap   = data.images || {};

  // shownote内のリンクは別タブで開く（iframe埋め込み時の親ナビ汚染防止も兼ねる）
  if (typeof marked !== 'undefined') {
    marked.use({
      hooks: {
        postprocess(html) {
          return html.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
        }
      }
    });
  }

  // shownote本文の整形：[img:key] → <img> 展開 → Markdown パース（改行尊重）
  function renderShownote(text) {
    if (!text) return '';
    const withImages = String(text).replace(/\[img:([^\]]+)\]/g, (match, key) => {
      const fileId = imageMap[key.trim()];
      if (!fileId) return match;
      return `<img class="shownote-img" src="https://lh3.googleusercontent.com/d/${fileId}=w800" alt="${key}">`;
    });
    if (typeof marked !== 'undefined') {
      return marked.parse(withImages, { breaks: true, gfm: true });
    }
    return withImages.replace(/\n/g, '<br>');
  }

  function openModal(d) {
    d._clicked = true;
    epNode.filter(n => n.id === d.id).select('circle').style('fill', COLORS.episodeClick);
    document.getElementById('modal-ep').textContent    = formatEpId(d.id);
    document.getElementById('modal-title').textContent = d.title || '';
    const modalLink = document.getElementById('modal-link');
    if (d.url) {
      modalLink.href = d.url;
      modalLink.textContent = 'Spotifyで聴く →';
      modalLink.classList.remove('coming-soon');
      modalLink.setAttribute('target', '_blank');
    } else {
      modalLink.removeAttribute('href');
      modalLink.textContent = 'Coming soon';
      modalLink.classList.add('coming-soon');
      modalLink.removeAttribute('target');
    }
    document.getElementById('modal-summary').innerHTML = renderShownote(d.summary);
    modal.classList.remove('hidden');
  }

  modalClose.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  // テーブルビューから同じモーダルを開けるよう公開
  window.__openModalById = id => {
    const n = data.nodes.find(x => x.type === 'episode' && String(x.id) === String(id));
    if (n) openModal(n);
  };

  // ============================================================
  // ネットワーク ⇔ テーブル（星が番号順に整列してそのまま一覧になる）
  // ============================================================
  const epOnly   = () => epNode.filter(d => d.type === 'episode');
  const epTxt    = () => textGroup.filter(d => d.type === 'episode');
  // ネットワーク専用の要素（線・デコ星・ロゴ・タグ・脈打つ輪）は
  // JSでの毎フレームopacity制御ではなく、#graph.table-modeクラスによる
  // display:none（chrome.css側）で丸ごと非表示にする。
  // → シミュレーションが止まっていても層として完全に切り離され、ふわふわ動く要素が一切残らない。
  // 数値は table-layout.json（調整ページのスライダーで保存）から読み込む。
  // 未取得時はTABLE_LAYOUT_DEFAULTSにフォールバック。
  let ROW_H          = tableLayout.rowH;    // 縦一列の行間（タイトル+タグの2段が収まる高さ）
  let LEFT_X         = tableLayout.leftX;   // 星の列を画面左に寄せる位置（丸が画面端で切れないよう余白を確保）
  let TABLE_R        = tableLayout.tableR;  // テーブル整列モード中の丸の固定半径
  let TABLE_TITLE_X  = tableLayout.titleX;  // 丸の中心からタイトルの左端までの距離
  let TABLE_TITLE_H  = tableLayout.titleH;  // タイトル行(foreignObject)の高さ
  let TABLE_TITLE_Y  = -Math.round(TABLE_TITLE_H / 2); // 丸の中心とタイトルの上下中心を合わせる
  let TABLE_TITLE_FONT = tableLayout.titleFont;
  let TABLE_TITLE_WEIGHT   = tableLayout.titleWeight;      // タイトルの文字の太さ
  let TABLE_TITLE_TRUNCATE = tableLayout.titleTruncateLen; // タイトルを省略する文字数
  let TABLE_SUMMARY_FONT = tableLayout.summaryFont; // ショーノートプレビューの文字サイズ
  let TABLE_SUMMARY_LEN  = tableLayout.summaryLen;  // ショーノートプレビューの文字数
  let TABLE_SUMMARY_H    = tableLayout.summaryH;    // ショーノートプレビューの高さ
  let TABLE_TAGS_FONT  = tableLayout.tagsFont;
  let TABLE_TAGS_GAP   = tableLayout.tagsGap;
  let TABLE_TITLE_TAGS_GAP   = tableLayout.titleTagsGap;   // タイトル行とショーノートプレビューの縦の間隔
  let TABLE_SUMMARY_TAGS_GAP = tableLayout.summaryTagsGap; // ショーノートプレビューとタグ行の縦の間隔
  let TABLE_TOP_PAD    = tableLayout.topPad;    // 一覧の上端の余白
  let TABLE_RIGHT_PAD  = tableLayout.rightPad;  // 一覧の右端の余白（タイトル/ショーノートの折り返し幅に反映）
  let TABLE_BOTTOM_PAD = tableLayout.bottomPad; // 一覧の下端の余白
  function computeColumn() {
    const eps = data.nodes.filter(d => d.type === 'episode')
      .sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));
    eps.forEach((d, i) => { d._tx = 0; d._ty = i * ROW_H + ROW_H / 2; });
  }
  function renderRowTags() {
    const titleW = Math.max(80, width - LEFT_X - TABLE_TITLE_X - TABLE_RIGHT_PAD);
    textGroup.filter(d => d.type === 'episode').select('.node-title-fo')
      .attr('x', TABLE_TITLE_X)
      .attr('y', TABLE_TITLE_Y)
      .attr('width', titleW)
      .attr('height', TABLE_TITLE_H)
      .select('div.row-title')
      .style('font-size', `${TABLE_TITLE_FONT}px`)
      .style('font-weight', TABLE_TITLE_WEIGHT)
      .text(d => truncate(d.title || '', TABLE_TITLE_TRUNCATE));

    // ショーノート・タグの縦位置は、丸の中心からの絶対Yオフセットとして直接指定する
    // （以前はタイトルの高さから足し算で計算していたため、タイトル高さを動かすと
    //  ショーノート・タグも連動してずれた。今は各スライダーの値がそのままYになる＝独立）
    const summaryY = TABLE_TITLE_TAGS_GAP;
    textGroup.filter(d => d.type === 'episode').select('.node-summary-fo')
      .attr('x', TABLE_TITLE_X)
      .attr('y', summaryY)
      .attr('width', titleW)
      .attr('height', TABLE_SUMMARY_H)
      .select('div.row-summary')
      .style('font-size', `${TABLE_SUMMARY_FONT}px`)
      .text(d => truncate(stripHtml(d.summary || ''), TABLE_SUMMARY_LEN));

    const tagsY = TABLE_SUMMARY_TAGS_GAP;
    textGroup.filter(d => d.type === 'episode').select('.node-tags-fo')
      .attr('x', TABLE_TITLE_X)
      .attr('y', tagsY)
      .select('div.row-tags')
      .style('font-size', `${TABLE_TAGS_FONT}px`)
      .style('gap', `${TABLE_TAGS_GAP}px`)
      .html(d => (d.tags || []).map(t => `<span>#${t}</span>`).join(''));
  }
  // 整列済みの行に対し、現在のROW_H/LEFT_X/TABLE_R等を再適用する
  // （調整ページのスライダーからのライブプレビュー用。ネットワーク⇔テーブルの
  //  切替アニメーションは使わず、即座に位置・半径・svg高さを更新するだけ）
  function relayoutTable() {
    if (!tableMode) return;
    computeColumn();
    const epCount = data.nodes.filter(d => d.type === 'episode').length;
    const contentH = epCount * ROW_H + TABLE_BOTTOM_PAD;
    epOnly().attr('transform', d => `translate(${d._tx},${d._ty})`);
    epOnly().select('circle.node-circle').attr('r', TABLE_R);
    epTxt().attr('transform', d => `translate(${d._tx},${d._ty})`);
    data.nodes.forEach(d => { if (d.type === 'episode') { d.x = d._tx; d.y = d._ty; } });
    svg.style('height', `${contentH}px`);
    svg.attr('viewBox', `0 0 ${width} ${contentH}`);
    g.attr('transform', `translate(${LEFT_X},${TABLE_TOP_PAD})`);
    renderRowTags();
  }
  // 調整ページ(layout.html)からのライブプレビュー用に公開
  window.__getTableLayout = () => ({
    rowH: ROW_H, leftX: LEFT_X, tableR: TABLE_R,
    titleX: TABLE_TITLE_X, titleH: TABLE_TITLE_H,
    titleFont: TABLE_TITLE_FONT, titleWeight: TABLE_TITLE_WEIGHT, titleTruncateLen: TABLE_TITLE_TRUNCATE,
    summaryFont: TABLE_SUMMARY_FONT, summaryLen: TABLE_SUMMARY_LEN, summaryH: TABLE_SUMMARY_H,
    tagsFont: TABLE_TAGS_FONT, tagsGap: TABLE_TAGS_GAP,
    titleTagsGap: TABLE_TITLE_TAGS_GAP, summaryTagsGap: TABLE_SUMMARY_TAGS_GAP,
    topPad: TABLE_TOP_PAD, rightPad: TABLE_RIGHT_PAD, bottomPad: TABLE_BOTTOM_PAD,
  });
  window.__setTableLayout = (cfg) => {
    if (cfg.rowH != null)     ROW_H = cfg.rowH;
    if (cfg.leftX != null)    LEFT_X = cfg.leftX;
    if (cfg.tableR != null)   TABLE_R = cfg.tableR;
    if (cfg.titleX != null)   TABLE_TITLE_X = cfg.titleX;
    if (cfg.titleH != null)   { TABLE_TITLE_H = cfg.titleH; TABLE_TITLE_Y = -Math.round(TABLE_TITLE_H / 2); }
    if (cfg.titleFont != null) TABLE_TITLE_FONT = cfg.titleFont;
    if (cfg.titleWeight != null) TABLE_TITLE_WEIGHT = cfg.titleWeight;
    if (cfg.titleTruncateLen != null) TABLE_TITLE_TRUNCATE = cfg.titleTruncateLen;
    if (cfg.summaryFont != null) TABLE_SUMMARY_FONT = cfg.summaryFont;
    if (cfg.summaryLen != null)  TABLE_SUMMARY_LEN = cfg.summaryLen;
    if (cfg.summaryH != null)    TABLE_SUMMARY_H = cfg.summaryH;
    if (cfg.tagsFont != null)  TABLE_TAGS_FONT = cfg.tagsFont;
    if (cfg.tagsGap != null)   TABLE_TAGS_GAP = cfg.tagsGap;
    if (cfg.titleTagsGap != null)   TABLE_TITLE_TAGS_GAP = cfg.titleTagsGap;
    if (cfg.summaryTagsGap != null) TABLE_SUMMARY_TAGS_GAP = cfg.summaryTagsGap;
    if (cfg.topPad != null)    TABLE_TOP_PAD = cfg.topPad;
    if (cfg.rightPad != null)  TABLE_RIGHT_PAD = cfg.rightPad;
    if (cfg.bottomPad != null) TABLE_BOTTOM_PAD = cfg.bottomPad;
    relayoutTable();
  };
  function enterTable() {
    if (tableMode) return;
    tableMode = true;
    simulation.stop();
    data.nodes.forEach(d => { if (d.type === 'episode') { d._nx = d.x; d._ny = d.y; } });
    rotAngle = 0;
    rotG.attr('transform', `rotate(0, ${width / 2}, ${height / 2})`);
    d3.select('#graph').classed('table-mode', true);
    epOnly().on('.drag', null);              // 整列中はドラッグ無効
    svg.on('.zoom', null);                   // パン/ピンチ無効化。縦スクロールのみで見る
    computeColumn();
    const epCount = data.nodes.filter(d => d.type === 'episode').length;
    const contentH = epCount * ROW_H + TABLE_BOTTOM_PAD;
    epOnly().transition().duration(850).ease(d3.easeCubicInOut)
      .attr('transform', d => `translate(${d._tx},${d._ty})`);
    epOnly().select('circle.node-circle').transition().duration(850).ease(d3.easeCubicInOut)
      .attr('r', TABLE_R);
    epTxt().transition().duration(850).ease(d3.easeCubicInOut)
      .attr('transform', d => `translate(${d._tx},${d._ty})`);
    epTxt().select('.node-title-fo').transition().delay(400).duration(450).style('opacity', 1);
    epTxt().select('.node-summary-fo').transition().delay(400).duration(450).style('opacity', 1);
    epTxt().select('.node-tags-fo').transition().delay(400).duration(450).style('opacity', 1);
    data.nodes.forEach(d => { if (d.type === 'episode') { d.x = d._tx; d.y = d._ty; } });
    // 等倍・画面左寄せの縦一列。svgの高さを内容分に広げ、コンテナのネイティブ縦スクロールに任せる
    document.getElementById('graph-container').classList.add('table-scroll');
    svg.style('height', `${contentH}px`);
    svg.attr('viewBox', `0 0 ${width} ${contentH}`);
    g.transition().duration(850).ease(d3.easeCubicInOut)
      .attr('transform', `translate(${LEFT_X},${TABLE_TOP_PAD})`);
    renderRowTags();
    applyEpStyle(); applyTitleStyle();
  }
  function enterNetwork() {
    if (!tableMode) return;
    tableMode = false;
    d3.select('#graph').classed('table-mode', false);
    const graphContainerEl = document.getElementById('graph-container');
    graphContainerEl.classList.remove('table-scroll');
    // テーブル整列モードで一覧をスクロールした状態のまま戻ると、iOSのSafariが
    // -webkit-overflow-scrolling:touch 用のスクロールジェスチャーを引きずったままになり、
    // 星をドラッグしようとしても画面全体がパン/スワイプされてしまう不具合があったため、
    // scrollTopを明示的に0へ戻し、同期的なリフローでスタイル変更を即座に確定させる。
    graphContainerEl.scrollTop = 0;
    void graphContainerEl.offsetHeight;
    epTxt().select('.node-title-fo').transition().duration(250).style('opacity', 0);
    epTxt().select('.node-summary-fo').transition().duration(250).style('opacity', 0);
    epTxt().select('.node-tags-fo').transition().duration(250).style('opacity', 0);
    epOnly().transition().duration(850).ease(d3.easeCubicInOut)
      .attr('transform', d => `translate(${d._nx},${d._ny})`);
    epOnly().select('circle.node-circle').transition().duration(850).ease(d3.easeCubicInOut)
      .attr('r', d => nodeR(d));
    epTxt().transition().duration(850).ease(d3.easeCubicInOut)
      .attr('transform', d => `translate(${d._nx},${d._ny})`);
    data.nodes.forEach(d => { if (d.type === 'episode') { d.x = d._nx; d.y = d._ny; } });
    epOnly().call(makeDrag(simulation));     // ドラッグ復活
    svg.style('height', null);
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    svg.call(zoomBehavior);                  // パン/ズーム復活
    svg.transition().duration(850).call(zoomBehavior.transform,
      d3.zoomIdentity.translate(width / 2 * (1 - initScale), height / 2 * (1 - initScale)).scale(initScale));
    simulation.alpha(0.3).restart();
  }
  window.__viewTable   = enterTable;
  window.__viewNetwork = enterNetwork;

  if (isTouch) {
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

  } else {
    epNode.filter(d => d.type === 'episode')
      .on('click', (event, d) => openModal(d));

    epNode.filter(d => d.type === 'tag')
      .on('mousemove', (event, d) => {
        showTooltip(tooltip, event, `<span class="tip-title">#${d.label}</span>`);
      })
      .on('mouseleave', () => hideTooltip(tooltip));
  }

  // ---------- ディープリンク: ?ep=<id> で該当エピソードのモーダルを自動表示 ----------
  const targetEpId = new URLSearchParams(window.location.search).get('ep');
  if (targetEpId) {
    const targetNode = data.nodes.find(n => n.type === 'episode' && String(n.id) === String(targetEpId));
    if (targetNode) openModal(targetNode);
  }

  // ---------- tick ----------
  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    decoCircle.attr('cx', d => d.x).attr('cy', d => d.y);
    logoImage.attr('x', d => d.x - d.w / 2).attr('y', d => d.y - d.h / 2);
    // テーブル整列モード中は、ロゴ解放タイマー(2.5秒後)などでシミュレーションが
    // 再始動しても、星・テキストの位置は d._tx/d._ty 基準の整列を保ったまま動かさない。
    // ここでd.x/d.yに追従させると、力学計算で位置がずれてテーブルの整列が崩れる。
    if (!tableMode) {
      epNode.attr('transform', d => `translate(${d.x},${d.y})`);
      textGroup.attr('transform', d => `translate(${d.x},${d.y})`);
    }
    linkHandle
      .attr('cx', d => (d.source.x + d.target.x) / 2)
      .attr('cy', d => (d.source.y + d.target.y) / 2);
  });

  // ---------- 回転アニメーション ----------
  let lastTime = null;
  function rotateLoop(time) {
    if (lastTime !== null && rotSpeed !== 0 && !tableMode) {
      rotAngle += rotSpeed * (time - lastTime) / 1000;
      rotG.attr('transform', `rotate(${rotAngle}, ${width / 2}, ${height / 2})`);
      applyEpStyle();
      applyTitleStyle();
      applyLogoStyle();
    }
    lastTime = time;
    requestAnimationFrame(rotateLoop);
  }
  requestAnimationFrame(rotateLoop);

  // ---------- リサイズ ----------
  window.addEventListener('resize', () => {
    // テーブル整列モード中はスマホのアドレスバー開閉などでもresizeが飛んでくるが、
    // ここでシミュレーションを再始動すると整列した行が力学で動いて崩れてしまうので無視する。
    if (tableMode) return;
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
      .style('font-size', d => tableMode && d.type === 'episode' ? '8px' : `${epFontPx}px`)
      .attr('transform', `rotate(${-rotAngle})`);
  }

  function applyTitleStyle() {
    const a      = rotAngle * Math.PI / 180;
    const sinA   = Math.sin(a);
    const cosA   = Math.cos(a);
    g.selectAll('.node-title')
      .style('font-size', d => tableMode && d.type === 'episode' ? `${TABLE_TITLE_FONT}px` : `${titleFontPx / currentK}px`)
      .attr('transform', d => {
        if (tableMode && d.type === 'episode') return `translate(${TABLE_TITLE_X}, ${TABLE_TITLE_Y})`;
        const ty = nodeR(d) + TITLE_OFFSET_PX / currentK;
        return `translate(${ty * sinA}, ${ty * cosA}) rotate(${-rotAngle})`;
      });
    g.selectAll('.node-tag-label')
      .style('font-size', `${titleFontPx / currentK}px`)
      .attr('transform', d => {
        const ty = nodeR(d) + TITLE_OFFSET_PX / currentK;
        return `translate(${ty * sinA}, ${ty * cosA}) rotate(${-rotAngle})`;
      });
  }

  function applyLogoStyle() {
    logoImage.attr('transform', d => `rotate(${-rotAngle}, ${d.x}, ${d.y})`);
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
    simulation.force('link', d3.forceLink(data.links).id(d => d.id)
      .distance(getLinkDistance).strength(getLinkStrength));
    simulation.alpha(0.5).restart();
  });

  document.getElementById('s-charge').addEventListener('input', () => {
    chargeStrength = val('s-charge');
    setVal('v-charge', chargeStrength);
    simulation.force('charge',
      d3.forceManyBody().strength(d => d.type === 'logo' ? 0 : d.type === 'deco' ? -8 : -chargeStrength));
    simulation.alpha(0.5).restart();
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
    epNode.select('circle:not(.pulse-ring)')
      .attr('r', d => nodeR(d));
    pulseRing.attr('r', d => nodeR(d) + 6);
    pulseRingOuter.attr('r', d => nodeR(d) + 11);
    simulation.force('collision-ep',
      makeSubsetCollide(d => d.type !== 'deco', d => nodeR(d) + 20)
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

  // 訪問者向け調整パネル(quickpanel.js)へ初期化完了を通知
  window.dispatchEvent(new CustomEvent('graph-ready'));
}

// ------------------------------------------------------------
// ロゴ矩形→episode/tag 反発フォース（ep/tagノードをロゴ領域から押し出す）
// ------------------------------------------------------------
function makeLogoEpRepel(allNodes, getNodeRadius) {
  const logoNds  = allNodes.filter(d => d.type === 'logo');
  const epTagNds = allNodes.filter(d => d.type === 'episode' || d.type === 'tag');
  return function() {
    logoNds.forEach(logo => {
      const logoR = Math.hypot(logo.w / 2, logo.h / 2) + 10;
      epTagNds.forEach(ep => {
        const dx   = ep.x - logo.x;
        const dy   = ep.y - logo.y;
        const dist = Math.hypot(dx, dy) || 1;
        const epR  = getNodeRadius(ep);
        const minD = logoR + epR;
        if (dist < minD) {
          const push = (minD - dist) / dist * 0.8;
          ep.vx += (dx / dist) * push;
          ep.vy += (dy / dist) * push;
        }
      });
    });
  };
}

// デコ→episode/tag 一方向反発フォース（decoだけ押しのける）
// velocity push方式：ソフトな押し出しで輪っかを作らない
// ------------------------------------------------------------
function makeDecoEpRepel(allNodes, getNodeRadius, getDecoR, decoMargin) {
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
        const minR = getNodeRadius(ep) + getDecoR() + decoMargin;
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
// HTMLタグを除去してプレーンテキストにする（ショーノートプレビュー用）
// ------------------------------------------------------------
function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return div.textContent || '';
}

// ------------------------------------------------------------
// 起動
// ------------------------------------------------------------
// 開発用パネル(凡例・細かい調整・色設定)は、通常は常に非表示。
// 開発時に確認したい場合だけ URL に ?dev=1 を付けて開く。
// （以前は「iframe内かどうか」で判定していたが、直リンクを開いた
// 　時にも一般訪問者向け表示にしたいため、この方式に変更）
const isDevMode = new URLSearchParams(location.search).get('dev') === '1';
if (!isDevMode) {
  document.getElementById('legend').style.display      = 'none';
  document.getElementById('controls').style.display    = 'none';
  document.getElementById('color-panel').style.display = 'none';
  document.getElementById('s-rotate').value = '3';
}

main();
