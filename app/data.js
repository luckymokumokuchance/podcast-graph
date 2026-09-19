// ============================================================
// data.js — RSS と links.json からデータを組み立てる共通モジュール
//   window.PodcastData.load() → { episodes, links, nodes, graphLinks, tags }
// ============================================================
(function () {
  const RSS_URL     = 'https://anchor.fm/s/110637c28/podcast/rss';
  const LINKS_URL   = 'links.json';
  const EXTRA_URL   = 'episodes-extra.json'; // RSSだけでは足りない差分（##候補・作品URL）を後から追記する層。●から編集
  const IMAGES_URL  = 'images.json';         // shownote内 [img:key] 用の key→Drive fileId マップ

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

  // 番組の定型フッタ（リスナー向けの案内文）はサイトに出さない。
  // Spotify側には残したままでよい ─ 表示・抽出のときだけ落とす。
  //   ●毎週火曜朝8時の基本週1回配信
  //   ●ご感想は #ラキもくチャン #ラッキーもくもくチャンス でお願いします
  //   ✉️lucky.mokumoku.chance@gmail.com
  //   番組HP：...
  // ※フッタは本文の末尾とは限らず、[参考文献]の前に挟まっていることがあるため
  //   「ここから後ろを全部消す」ではなく、行単位で判定する
  function isBoilerplateLine(t) {
    const s = String(t).trim();
    if (!s) return false;
    return /^[●・]/.test(s)
      || /^✉/.test(s)
      || /lucky\.mokumoku\.chance@gmail\.com/.test(s)
      || /^番組HP[:：]?/.test(s)
      || /^(番組HP|公式(WEB|サイト))$/.test(s);
  }

  function stripBoilerplate(html) {
    const d = document.createElement('div');
    d.innerHTML = String(html);
    // <p>等のブロック単位で、まるごと定型文なら取り除く
    [...d.children].forEach((el) => {
      const lines = (el.innerHTML || '').split(/<br\s*\/?>/i);
      const kept = lines.filter((ln) => {
        const tmp = document.createElement('div');
        tmp.innerHTML = ln;
        return !isBoilerplateLine(tmp.textContent || '');
      });
      if (kept.length === 0) el.remove();
      else if (kept.length !== lines.length) el.innerHTML = kept.join('<br>');
    });
    return d.innerHTML;
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
      // 定型フッタはここで落とす。以降の表示・タグ抽出・作品抽出すべてに効く
      const descHtml = stripBoilerplate(textOf(item, 'description'));
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

  // RSS(Spotifyの説明文)が本文の正。episodes-extra.json は「RSSだけでは
  // 出てこない差分」を後から追記するだけの層で、本文そのものは持たない
  //   addTags   … RSSに無い #タグ・##候補（例：後から振り返って足した概念）
  //   workLinks … RSSに無い/URLや著者が欠けている作品の補完
  //     "type|title": "URL"                     … URLだけ補う場合（文字列）
  //     "type|title": {url, creator}             … URL・著者ごと補う場合（片方だけでも可）
  //     ※古い回はRSSに絵文字マーカー自体が無く作品が1件も出てこないことがあるため、
  //       単なる「URL追加」ではなく「作品そのものの補完」も兼ねる
  // 追記分は ep._extraText という別フィールドに積むだけで、表示用の
  // descHtml/descText には混ぜない（本文に余計な文字が見えないようにするため）。
  // computeConcepts/computeWorks はこの _extraText も合わせて見て計算する。
  function emojiOf(type) {
    return Object.keys(WORK_EMOJI_TYPE).find((e) => WORK_EMOJI_TYPE[e] === type) || '';
  }
  function buildExtraText(extra) {
    if (!extra) return '';
    const tagPart = (extra.addTags || [])
      .map((t) => (t.startsWith('##') ? t : `#${t}`))
      .join(' ');
    const workPart = Object.entries(extra.workLinks || {})
      .map(([key, val]) => {
        const [type, title] = key.split('|');
        const emoji = emojiOf(type);
        const url = typeof val === 'string' ? val : (val && val.url) || '';
        const creator = typeof val === 'string' ? '' : (val && val.creator) || '';
        // URLがあればmarkdown形式(③)、無ければ素の題名形式(②)で合成する。
        // どちらもcomputeWorks()のプレーンテキスト経路がそのまま解釈できる
        return url
          ? `${emoji}[${title}](${url})${creator ? '／' + creator : ''}`
          : `${emoji}${title}${creator ? '／' + creator : ''}`;
      })
      .join(' ');
    return [tagPart, workPart].filter(Boolean).join(' ');
  }

  function applyExtras(rssEpisodes, extraJson) {
    const byNum = new Map(Object.entries(extraJson || {}).map(([num, e]) => [Number(num), e]));
    const seen = new Set();
    const out = rssEpisodes.map((ep) => {
      const extra = byNum.get(ep.num);
      if (!extra) return ep;
      seen.add(ep.num);
      const extraText = buildExtraText(extra);

      // addImagesだけは例外的に本文(descHtml/descText)へ直接追記する。
      // [img:key]は表示時に<img>タグへ置き換わるため、addTags/workLinksと違って
      // 「余計な文字がそのまま見える」問題が起きない（renderShownote参照）。
      const imgSuffix = (extra.addImages || []).map((k) => `[img:${k}]`).join(' ');
      const descHtml = imgSuffix ? `${ep.descHtml || ''} ${imgSuffix}` : ep.descHtml;
      const descText = imgSuffix ? `${ep.descText || ''} ${imgSuffix}` : ep.descText;

      return {
        ...ep,
        descHtml,
        descText,
        _extraText: extraText,
        tags: extractTags(`${descText || ''} ${extraText}`),
      };
    });
    byNum.forEach((_, num) => {
      if (!seen.has(num)) console.warn('[data] episodes-extra.json にRSS未対応の回:', num);
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
      const text = `${ep.descText || ''} ${ep._extraText || ''}`;
      const matches = text.match(CONCEPT_TAG_RE) || [];
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

  // 作品は3通りの書き方を受け付ける。SpotifyはHTMLが書けるので①が推奨。
  //   ① 📚<a href="URL">題名</a>／著者   … SpotifyにHTMLで書いた形（リンクも著者も取れる）
  //   ② 📚題名／著者                     … 素で書いた形（著者まで取れる）
  //   ③ 📚[題名](URL)／著者              … 旧スプレッドシートのmarkdown形式
  //
  // ①はHTMLタグを外すとURLが消えてしまうため、先にHTMLのまま<a>を拾い、
  // 拾い終わった部分を取り除いてから、残りをプレーンテキストとして処理する。
  const WORK_EMOJI_ALT = Object.keys(WORK_EMOJI_TYPE).join('|');

  // ① HTMLのアンカー形式
  function buildWorkAnchorRe() {
    return new RegExp(
      `(${WORK_EMOJI_ALT})\\s*<a\\s[^>]*href=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>` +
      `\\s*(?:[／/・]\\s*)?([^\\s<、。！？…「」『』【】（）\\[\\]]*)`,
      'gi'
    );
  }

  // ②③ プレーンテキスト形式（題名と著者を ／ / ・ で分割する）
  // URLは `(` を1段だけ入れ子で許す。`[^\s)]+` だとWikipediaの `_(映画)` 形式で
  // URLが途中で切れ、余りの `)` が著者名として拾われていた（ep20/22/24で実害あり）
  // 著者の取り方は「題名がどう区切られているか」で変わる：
  //   ・『』「」[] () で囲まれていれば題名の終わりが明確なので、区切り文字は無くてもよい
  //     （例 `📚[超芸術トマソン](URL)赤瀬川原平` — 旧スプレッドシートに多い形）
  //   ・素の題名は、区切り文字だけが題名の終わりを示すので ／ か / を必須にする
  //     （例 `📚ルックバック／藤本タツキ`）
  const WORK_CREATOR = `([^\\s、。！？…「」『』【】（）\\[\\]]+)`;
  const WORK_SEP_OPT = `(?:\\s*[／/・]\\s*)?`;   // 囲み題名のあと：区切りは任意
  const WORK_SEP_REQ = `\\s*[／/]\\s*`;          // 素の題名のあと：区切りは必須

  function buildWorkPlainRe() {
    return new RegExp(
      `(${WORK_EMOJI_ALT})\\s*(?:` +
        // ③ markdownリンク
        `\\[([^\\]]+)\\]\\((https?:(?:[^\\s()]|\\([^\\s()]*\\))+)\\)${WORK_SEP_OPT}${WORK_CREATOR}?` +
        `|『([^』]+)』${WORK_SEP_OPT}${WORK_CREATOR}?` +
        `|「([^」]+)」${WORK_SEP_OPT}${WORK_CREATOR}?` +
        `|\\[([^\\]]+)\\]${WORK_SEP_OPT}${WORK_CREATOR}?` +
        // ② 素の題名。`・` は「ゆる学徒カフェ・オープンマイクチャンネル」のように
        //    題名の一部であることが多いので区切りに使わない
        `|([^\\s、。！？…「」『』【】（）\\[\\]／/]+)(?:${WORK_SEP_REQ}${WORK_CREATOR})?` +
      `)`,
      'g'
    );
  }

  function computeWorks(episodes) {
    const anchorRe = buildWorkAnchorRe();
    const plainRe = buildWorkPlainRe();
    const map = {};      // "type|title" -> { title, type, episodes:Set<id>, inlineCreator, inlineLink }
    const titleById = {};

    episodes.forEach((ep) => {
      titleById[String(ep.id)] = ep.title;

      const add = (type, title, url, creator) => {
        if (!type || !title) return;
        const key = type + '|' + title;
        if (!map[key]) map[key] = { title, type, episodes: new Set(), inlineCreator: '', inlineLink: '' };
        map[key].episodes.add(String(ep.id));
        if (creator && !map[key].inlineCreator) map[key].inlineCreator = creator;
        if (url && !map[key].inlineLink) map[key].inlineLink = url;
      };

      // ① HTMLのまま<a>形式を拾う（ここでしかURLは取れない）
      const html = ep.descHtml || '';
      let m;
      anchorRe.lastIndex = 0;
      while ((m = anchorRe.exec(html)) !== null) {
        add(WORK_EMOJI_TYPE[m[1]], stripHtml(m[3]).trim(), (m[2] || '').trim(), (m[4] || '').trim());
      }

      // ②③ ①で拾った部分を取り除いた残りを、プレーンテキストとして処理する
      // （episodes-extra.jsonのworkLinksもここで一緒に処理される。③と同じmarkdown形式で
      //  合成しているため）
      // グループ: 1=絵文字
      //   markdown 2=題 3=URL 4=著者 ／ 『』5=題 6=著者 ／ 「」7=題 8=著者
      //   []9=題 10=著者 ／ 素の題名 11=題 12=著者
      const rest = stripHtml(html.replace(buildWorkAnchorRe(), '')) + ' ' + (ep._extraText || '');
      plainRe.lastIndex = 0;
      while ((m = plainRe.exec(rest)) !== null) {
        const title = (m[2] || m[5] || m[7] || m[9] || m[11] || '').trim();
        const creator = (m[4] || m[6] || m[8] || m[10] || m[12] || '').trim();
        add(WORK_EMOJI_TYPE[m[1]], title, (m[3] || '').trim(), creator);
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
    const [rssText, linksJson, extraJson, images] = await Promise.all([
      fetch(RSS_URL).then((r) => { if (!r.ok) throw new Error('RSS ' + r.status); return r.text(); }),
      fetch(LINKS_URL + '?t=' + Date.now()).then((r) => r.ok ? r.json() : { links: [] }).catch(() => ({ links: [] })),
      fetch(EXTRA_URL + '?t=' + Date.now()).then((r) => r.ok ? r.json() : {}).catch(() => ({})),
      fetch(IMAGES_URL).then((r) => r.ok ? r.json() : {}).catch(() => ({})),
    ]);
    const episodes = applyExtras(parseRss(rssText), extraJson);
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
