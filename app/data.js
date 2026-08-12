// ============================================================
// data.js — RSS と links.json からデータを組み立てる共通モジュール
//   window.PodcastData.load() → { episodes, links, nodes, graphLinks, tags }
// ============================================================
(function () {
  const RSS_URL       = 'https://anchor.fm/s/110637c28/podcast/rss';
  const LINKS_URL     = 'links.json';
  const SHOWNOTES_URL = 'shownotes.json'; // スプレッドシートshownote（タグ・[img:key]込みの加筆版）のスナップショット。npm run snapshot で更新
  const IMAGES_URL    = 'images.json';    // shownote内 [img:key] 用の key→Drive fileId マップ

  // 説明文の定型フッタ由来の宣伝ハッシュタグはタグノードにしない
  const TAG_DENYLIST = new Set(['ラキもくチャン', 'ラッキーもくもくチャンス']);
  // タグ境界: 空白/記号のほか [ ] / ／ ( ) でも打ち切る
  // 先頭の#の連続数を捕捉: "#tag"=採用（グラフに表示）, "##tag"以上=未タグ候補として除外
  const TAG_RE = /#+([^\s#、。！？…「」『』【】（）\[\]／\/()]+)/g;

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
      const hashes = m[0].match(/^#+/)[0].length;
      if (hashes !== 1) continue; // ##以上（未タグ候補）はグラフに出さない
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

  // RSSの本文はSpotify投稿時点の生テキストで、タグや[img:key]は含まない。
  // スプレッドシートshownote（人力で加筆されたキュレーション版）が有れば本文・タグ抽出をそちらに差し替える。
  // RSSに無い回はここでは足さない（エピソードの存在判定は常にRSSが正）。
  function applyCurated(rssEpisodes, shownotesJson) {
    const byNum = new Map((shownotesJson && shownotesJson.episodes || []).map((e) => [e.num, e]));
    const seen = new Set();
    const out = rssEpisodes.map((ep) => {
      const c = byNum.get(ep.num);
      if (!c) return ep;
      seen.add(ep.num);
      const descHtml = c.descHtml || ep.descHtml;
      return {
        ...ep,
        descHtml,
        descText: stripHtml(descHtml),
        tags: extractTags(stripHtml(descHtml)),
        link: c.url || ep.link,
      };
    });
    byNum.forEach((c, num) => {
      if (!seen.has(num)) console.warn('[data] shownotes.json にRSS未対応の回:', num);
    });
    return out;
  }

  // ============================================================
  // CONCEPTS / INSPIRED（作品）— GASのcomputeConcepts_/computeWorks_の移植
  //   ショーノート本文だけから毎回計算する。保存・スナップショット不要
  //   （エピソードが増えた瞬間に自動で反映される）。
  //   人が書いた付加情報（description/proposer/画像URL等）はここでは
  //   一切扱わない。Step 2でconcepts-meta.json / works-meta.jsonとして
  //   別途マージする。
  // ============================================================

  // GAS版と完全に同じ正規表現・挙動にするため、グラフ用extractTags()とは
  // あえて共有しない（GASはdenylistも[]／()除外も持たない。キュレーション
  // 済みshownoteは宣伝フッタが既に取り除かれている前提のため）
  const CONCEPT_TAG_RE = /#+([^\s#、。！？…「」『』【】（）]+)/g;

  function computeConcepts(episodes) {
    const map = {};        // name -> { status, episodes:Set<id> }
    const titleById = {};
    episodes.forEach((ep) => {
      titleById[String(ep.id)] = ep.title;
      const matches = (ep.descText || '').match(CONCEPT_TAG_RE) || [];
      matches.forEach((m) => {
        const hashes = m.match(/^#+/)[0].length;
        const name = m.replace(/^#+/, '');
        if (!map[name]) map[name] = { status: 'candidate', episodes: new Set() };
        if (hashes === 1) map[name].status = 'tagged';
        map[name].episodes.add(String(ep.id));
      });
    });

    const list = Object.entries(map).map(([name, v]) => ({
      name,
      status: v.status,
      episodeIds: [...v.episodes],
      titles: [...v.episodes].map((id) => titleById[id] || ''),
    }));

    // 共起（同じエピソードを共有する概念同士）
    list.forEach((c) => {
      const ids = new Set(c.episodeIds);
      c.cooc = list
        .filter((o) => o.name !== c.name)
        .map((o) => ({ name: o.name, shared: o.episodeIds.filter((id) => ids.has(id)).length }))
        .filter((o) => o.shared > 0)
        .sort((a, b) => b.shared - a.shared || a.name.localeCompare(b.name, 'ja'));
    });

    list.sort((a, b) => b.episodeIds.length - a.episodeIds.length);
    return { list, titleById };
  }

  // 絵文字マーカー → 種別（GASのWORK_EMOJI_TYPEと同一）
  const WORK_EMOJI_TYPE = { '📚': 'book', '🎬': 'movie', '📺': 'anime', '🎵': 'music', '📻': 'radio' };
  const WORK_TYPE_LABEL = { book: '本', movie: '映画', anime: 'アニメ/ドラマ', music: '音楽', radio: 'ラジオ/ポッドキャスト' };

  function buildWorkRe() {
    const emojiAlt = Object.keys(WORK_EMOJI_TYPE).join('|');
    return new RegExp(
      `(${emojiAlt})(?:` +
        `\\[([^\\]]+)\\]\\((https?:[^\\s)]+)\\)(?:[／/・]\\s*)?([^\\s、。！？…「」『』【】（）\\[\\]]*)` + // 1: リンク記法
        `|『([^』]+)』` +                                                                 // 2: 『』
        `|「([^」]+)」` +                                                                 // 3: 「」
        `|\\[([^\\]]+)\\]` +                                                              // 4: []
        `|([^\\s、。！？…「」『』【】（）\\[\\]]+)` +                                       // 5: 素の1語
      `)`,
      'g'
    );
  }

  function computeWorks(episodes) {
    const re = buildWorkRe();
    const map = {};      // "type|title" -> { title, type, episodes:Set<id>, inlineCreator, inlineLink }
    const titleById = {};

    episodes.forEach((ep) => {
      titleById[String(ep.id)] = ep.title;
      const summary = ep.descText || '';
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(summary)) !== null) {
        const type = WORK_EMOJI_TYPE[m[1]];
        let title, inlineUrl = '', inlineCreator = '';
        if (m[2] !== undefined) {
          title = m[2].trim();
          inlineUrl = (m[3] || '').trim();
          inlineCreator = (m[4] || '').trim();
        } else {
          title = (m[5] || m[6] || m[7] || m[8] || '').trim();
        }
        if (!title) continue;

        const key = type + '|' + title;
        if (!map[key]) map[key] = { title, type, episodes: new Set(), inlineCreator: '', inlineLink: '' };
        map[key].episodes.add(String(ep.id));
        if (inlineCreator && !map[key].inlineCreator) map[key].inlineCreator = inlineCreator;
        if (inlineUrl && !map[key].inlineLink) map[key].inlineLink = inlineUrl;
      }
    });

    const list = Object.values(map).map((w) => ({
      title: w.title,
      type: w.type,
      type_label: WORK_TYPE_LABEL[w.type] || w.type,
      episodeIds: [...w.episodes],
      titles: [...w.episodes].map((id) => titleById[id] || ''),
      inlineCreator: w.inlineCreator,
      inlineLink: w.inlineLink,
    }));

    list.sort((a, b) => b.episodeIds.length - a.episodeIds.length);
    return { list };
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
    const [rssText, linksJson, shownotesJson, images] = await Promise.all([
      fetch(RSS_URL).then((r) => { if (!r.ok) throw new Error('RSS ' + r.status); return r.text(); }),
      fetch(LINKS_URL + '?t=' + Date.now()).then((r) => r.ok ? r.json() : { links: [] }).catch(() => ({ links: [] })),
      fetch(SHOWNOTES_URL).then((r) => r.ok ? r.json() : { episodes: [] }).catch(() => ({ episodes: [] })),
      fetch(IMAGES_URL).then((r) => r.ok ? r.json() : {}).catch(() => ({})),
    ]);
    const episodes = applyCurated(parseRss(rssText), shownotesJson);
    const manualLinks = linksJson.links || [];
    const g = buildGraph(episodes, manualLinks);
    return { episodes, manualLinks, images, ...g };
  }

  // ネットワークとテーブルで二重fetchしないようキャッシュ
  let _cache = null;
  function loadCached() { return _cache || (_cache = load()); }

  // ============================================================
  // concepts.html / concept.html / untagged.html / inspired.html 用
  //   computeConcepts()/computeWorks()（自動計算）に concepts-meta.json /
  //   works-meta.json（人が書いた分）をマージし、GASの
  //   buildConceptsData()/buildWorksData() と同じ形の { concepts:[...] } /
  //   { works:[...] } を返す。ページ側は既存のroot版と同じ形で使える。
  // ============================================================
  const CONCEPTS_META_URL = 'concepts-meta.json';
  const WORKS_META_URL = 'works-meta.json';

  // related/contrastは辞書順で小さい方の概念にだけ片側保存されているので、
  // 読み込み時に双方向へ展開する（GASのaddPair()と同じ結果になる）
  function expandBidirectional(metaObj, field, validNames) {
    const map = new Map(); // name -> Set<name>
    const add = (a, b) => {
      if (!validNames.has(a) || !validNames.has(b)) return; // 消えた概念名は無視
      if (!map.has(a)) map.set(a, new Set());
      if (!map.has(b)) map.set(b, new Set());
      map.get(a).add(b);
      map.get(b).add(a);
    };
    Object.entries(metaObj).forEach(([name, m]) => {
      (m[field] || []).forEach((other) => add(name, other));
    });
    return map;
  }

  async function loadConceptsPayload() {
    const [local, metaJson] = await Promise.all([
      loadCached(),
      fetch(CONCEPTS_META_URL + '?t=' + Date.now()).then((r) => r.ok ? r.json() : {}).catch(() => ({})),
    ]);
    const { list } = computeConcepts(local.episodes);
    const nameSet = new Set(list.map((c) => c.name));
    const relatedMap = expandBidirectional(metaJson, 'related', nameSet);
    const contrastMap = expandBidirectional(metaJson, 'contrast', nameSet);

    const concepts = list.map((c) => {
      const m = metaJson[c.name] || {};
      const contexts = m.contexts || {};
      return {
        name: c.name,
        status: c.status,
        description: m.description || '',
        proposer: m.proposer || '',
        related: [...(relatedMap.get(c.name) || [])],
        related_external: m.related_external || [],
        contrast: [...(contrastMap.get(c.name) || [])],
        episodes: c.episodeIds.map((id, i) => ({ id, title: c.titles[i] || '', context: contexts[id] || '' })),
      };
    });
    return { concepts };
  }

  async function loadWorksPayload() {
    const [local, metaJson] = await Promise.all([
      loadCached(),
      fetch(WORKS_META_URL + '?t=' + Date.now()).then((r) => r.ok ? r.json() : {}).catch(() => ({})),
    ]);
    const { list } = computeWorks(local.episodes);

    const works = list.map((w) => {
      const key = w.type + '|' + w.title;
      const m = metaJson[key] || {};
      return {
        title: w.title,
        type: w.type,
        type_label: w.type_label,
        // 優先順位：①ショーノートのinline記法 → ②works-meta.jsonのシート由来補完値
        creator: w.inlineCreator || m.creator || '',
        image_url: m.image_url || '',
        link_url: w.inlineLink || m.link_url || '',
        description: '', // 未使用列（Step2で移植対象外にした）
        episodes: w.episodeIds.map((id, i) => ({ id, title: w.titles[i] || '' })),
      };
    });
    return { works };
  }

  window.PodcastData = {
    load: loadCached, reload: load, RSS_URL, LINKS_URL,
    computeConcepts, computeWorks, // 検証スクリプトから利用
    loadConceptsPayload, loadWorksPayload, // concepts/concept/untagged/inspiredページから利用
  };
})();
