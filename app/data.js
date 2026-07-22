// ============================================================
// data.js — RSS と links.json からデータを組み立てる共通モジュール
//   window.PodcastData.load() → { episodes, links, nodes, graphLinks, tags }
// ============================================================
(function () {
  const RSS_URL   = 'https://anchor.fm/s/110637c28/podcast/rss';
  const LINKS_URL = 'links.json';

  // 説明文の定型フッタ由来の宣伝ハッシュタグはタグノードにしない
  const TAG_DENYLIST = new Set(['ラキもくチャン', 'ラッキーもくもくチャンス']);
  // タグ境界: 空白/記号のほか [ ] / ／ ( ) でも打ち切る
  const TAG_RE = /#([^\s#、。！？…「」『』【】（）\[\]／\/()]+)/g;

  function textOf(node, tag) {
    const el = node.querySelector(tag);
    return el ? el.textContent.trim() : '';
  }

  // "020 コンセプトってなんなん？" → { num:20, title:"コンセプトってなんなん？" }
  function splitTitle(raw) {
    const m = raw.match(/^\s*(\d{1,3})\s+(.*)$/);
    if (m) return { num: parseInt(m[1], 10), title: m[2].trim() };
    return { num: null, title: raw.trim() };
  }

  function stripHtml(html) {
    // ブロック要素の境界に改行を入れてから素のテキスト化
    // （textContent は <p></p> を区切らず連結するため、#タグが後続文へ食い込むのを防ぐ）
    const withBreaks = String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n');
    const d = document.createElement('div');
    d.innerHTML = withBreaks;
    return d.textContent || '';
  }

  function extractTags(text) {
    const out = [];
    let m;
    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(text)) !== null) {
      const label = m[1];
      // URL断片（#utm_source=... 等）を除外
      if (/[=.:@]/.test(label)) continue;
      if (!TAG_DENYLIST.has(label) && !out.includes(label)) out.push(label);
    }
    return out;
  }

  function parseRss(xmlText) {
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    const items = [...xml.querySelectorAll('item')];
    return items.map((item) => {
      const rawTitle = textOf(item, 'title');
      const { num, title } = splitTitle(rawTitle);
      const descHtml = textOf(item, 'description');
      const enclosure = item.querySelector('enclosure');
      const pub = textOf(item, 'pubDate');
      const date = pub ? new Date(pub) : null;
      // duration は itunes 名前空間。querySelector はローカル名で拾える
      let duration = '';
      item.querySelectorAll('*').forEach((n) => {
        if (n.localName === 'duration' && !duration) duration = n.textContent.trim();
      });
      return {
        id: num,                          // 話数を安定IDに
        num,
        title,
        rawTitle,
        date: date ? date.toISOString().slice(0, 10) : '',
        dateObj: date,
        duration,
        descHtml,
        descText: stripHtml(descHtml),
        audio: enclosure ? enclosure.getAttribute('url') : '',
        link: textOf(item, 'link'),
        guid: textOf(item, 'guid'),
        tags: extractTags(stripHtml(descHtml)),
      };
    }).filter((e) => e.id != null)
      .sort((a, b) => a.num - b.num);
  }

  function buildGraph(episodes, manualLinks) {
    const ids = new Set(episodes.map((e) => e.id));
    const COLORS = { episode: '#089900', tag: '#878787' };

    const episodeNodes = episodes.map((e) => ({
      id: String(e.id), type: 'episode', num: e.num, title: e.title, ep: e,
    }));

    // タグノード＋タグリンク
    const tagMap = {};
    episodes.forEach((e) => e.tags.forEach((t) => {
      (tagMap[t] = tagMap[t] || new Set()).add(e.id);
    }));
    const tagNodes = Object.keys(tagMap).map((label) => ({
      id: `tag_${label}`, type: 'tag', label,
    }));
    const tagLinks = [];
    Object.entries(tagMap).forEach(([label, epIds]) => {
      epIds.forEach((epId) => tagLinks.push({ source: `tag_${label}`, target: String(epId), type: 'tag' }));
    });

    // 手動リンク（両端が存在する回のみ）
    const manual = (manualLinks || [])
      .filter((l) => ids.has(Number(l.source)) && ids.has(Number(l.target)))
      .map((l) => ({ source: String(l.source), target: String(l.target), reason: l.reason || '', type: 'manual' }));

    return {
      nodes: [...episodeNodes, ...tagNodes],
      graphLinks: [...manual, ...tagLinks],
      tags: Object.keys(tagMap).sort(),
      COLORS,
    };
  }

  async function load() {
    const [rssText, linksJson] = await Promise.all([
      fetch(RSS_URL).then((r) => { if (!r.ok) throw new Error('RSS ' + r.status); return r.text(); }),
      fetch(LINKS_URL + '?t=' + Date.now()).then((r) => r.ok ? r.json() : { links: [] }).catch(() => ({ links: [] })),
    ]);
    const episodes = parseRss(rssText);
    const manualLinks = linksJson.links || [];
    const g = buildGraph(episodes, manualLinks);
    return { episodes, manualLinks, ...g };
  }

  // ネットワークとテーブルで二重fetchしないようキャッシュ
  let _cache = null;
  function loadCached() { return _cache || (_cache = load()); }

  window.PodcastData = { load: loadCached, reload: load, RSS_URL, LINKS_URL };
})();
