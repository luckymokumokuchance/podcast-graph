// ============================================================
// Podcast関係図 - Google Apps Script
// ============================================================

const SHEET_EPISODES = 'episodes';
const SHEET_LINKS    = 'links';
const SHEET_IMAGES   = 'images';
const SHEET_LOGS     = 'logs';
const SHEET_CONCEPTS = 'concepts';         // 概念の管理シート（GASが自動生成・自動更新）
const SHEET_CONTEXTS = 'concept_contexts'; // 「どんな文脈で語られたか」を手書きするシート
const SHEET_INSPIRED    = 'inspired';         // 作品（INSPIRED）の管理シート（GASが自動生成・自動更新）

// concepts シートの列定義 -------------------------------------
// 【自動】GASが「概念シート → 最新の内容に更新する」で毎回書き込む列。
// 【手動】あなたが書き込む列。更新しても消えない（サイトに反映される）。
const CONCEPT_HEADERS = [
  'name',            // 【自動】概念名（キー）
  'status',          // 【自動】タグ済み / 未タグ
  'episode_count',   // 【自動】登場エピソード数
  'episodes',        // 【自動】登場エピソードID（例: 3, 8, 20）
  'episode_titles',  // 【自動】登場エピソードのタイトル
  'cooccurring',     // 【自動】よく一緒に出る概念（例: テクスチャ(2)）
  'exists',          // 【自動】○＝現存 / ×＝消えたが手動データ温存中
  'updated_at',      // 【自動】最終自動更新日時
  'description',     // 【手動】一言説明（詳細ページの見出しに出る）
  'reading',         // 【手動】よみ（任意・並べ替え/検索用）
  'proposer',            // 【手動】提唱者（自由記述。例：イノウエ）
  'related_concepts',    // 【手動】近接概念・自分たちで話したもの（概念名を区切って複数可。ページリンク・片方に書けば双方向表示）
  'related_external',    // 【手動】近接概念・別の文献由来（自由記述。区切って複数可。リンクなし、書いた側にだけ表示）
  'contrast_concepts',   // 【手動】対比概念（概念名。ページリンク・双方向表示）
  'memo',            // 【手動】内部メモ（サイトには出さない）
];
const CONCEPT_MANUAL_COLS = ['description', 'reading', 'proposer', 'related_concepts', 'related_external', 'contrast_concepts', 'memo'];

// concept_contexts シートの列定義 -----------------------------
// concept/episode_id/episode_title は【自動】でGASが並べる（各EP1行の空欄を用意）。
// context だけ【手動】であなたが厳選した一文を書く。
const CONTEXT_HEADERS = ['concept', 'episode_id', 'episode_title', 'context'];

// works シートの列定義 -----------------------------------------
// 【自動】GASが毎回書き直す列。
// 【半自動】空欄の時だけAPI取得を試みる。一度埋まったら（自動でも手入力でも）以後は触らない。
// 【手動】完全に人力。
const WORK_HEADERS = [
  'title',           // 【自動】作品タイトル（キーの一部）
  'type',            // 【自動】book / movie / anime / music
  'episode_count',   // 【自動】登場エピソード数
  'episodes',        // 【自動】登場エピソードID
  'episode_titles',  // 【自動】登場エピソードのタイトル
  'exists',          // 【自動】○＝現存 / ×＝消えたが手動データ温存中
  'updated_at',       // 【自動】最終自動更新日時
  'creator',         // 【半自動】著者/アーティスト名（book・musicはAPI取得を試みる）
  'image_url',       // 【半自動】表紙/ジャケット画像URL
  'link_url',        // 【半自動】参照リンク（Google Books / iTunes等）
  'description',     // 【手動】一言コメント
  'memo',            // 【手動】内部メモ（サイトには出さない）
];
const WORK_ASSIST_COLS = ['creator', 'image_url', 'link_url']; // 空欄の時だけAPI取得
const WORK_MANUAL_COLS = ['description', 'memo'];              // 完全手動

// 絵文字マーカー → 種別 の対応
const WORK_EMOJI_TYPE = {
  '📚': 'book',
  '🎬': 'movie',
  '📺': 'anime',
  '🎵': 'music',
  '📻': 'radio',
};
const WORK_TYPE_LABEL = {
  book:  '本',
  movie: '映画',
  anime: 'アニメ/ドラマ',
  music: '音楽',
  radio: 'ラジオ/ポッドキャスト',
};

// ------------------------------------------------------------
// D3用のJSONデータを組み立てて返す
// ------------------------------------------------------------
function buildPublicGraphData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const episodes = getRowsAsObjects(ss.getSheetByName(SHEET_EPISODES))
    .filter(ep => ep.WEB_status === 'published');

  const allLinks = getRowsAsObjects(ss.getSheetByName(SHEET_LINKS))
    .filter(lk => lk.status === 'approved');

  const publishedIds = new Set(episodes.map(ep => String(ep.id)));

  // エピソードノード
  const episodeNodes = episodes.map(ep => ({
    id:           String(ep.id),
    type:         'episode',
    title:        ep.title,
    url:          ep.url,
    summary:      ep.shownote,
    published_at: formatPublishedAt(ep['公開日']),
  }));

  // summaryから #タグ を抽出（# 1個だけをグラフに載せる。## 以上は候補なので載せない）
  const tagMap = {}; // { タグ名: Set<epId> }
  episodes.forEach(ep => {
    const summary = ep.shownote || '';
    const matches = summary.match(/#+([^\s#、。！？…「」『』【】（）]+)/g) || [];
    matches.forEach(m => {
      const hashes = m.match(/^#+/)[0].length;
      if (hashes !== 1) return;            // ## 以上はスキップ
      const label = m.replace(/^#+/, '');
      if (!tagMap[label]) tagMap[label] = new Set();
      tagMap[label].add(String(ep.id));
    });
  });

  const tagNodes = Object.keys(tagMap).map(label => ({
    id:    `tag_${label}`,
    type:  'tag',
    label: label,
  }));

  const tagLinks = [];
  Object.entries(tagMap).forEach(([label, epIds]) => {
    epIds.forEach(epId => {
      tagLinks.push({ source: `tag_${label}`, target: epId, type: 'tag' });
    });
  });

  // 手動リンク（両端が published のもののみ）
  const manualLinks = allLinks
    .filter(lk => publishedIds.has(String(lk.source)) && publishedIds.has(String(lk.target)))
    .map(lk => ({
      source: String(lk.source),
      target: String(lk.target),
      reason: lk.reason || '',
      type:   'manual',
    }));

  // 画像マップ（images シート：key, fileId）
  const imagesSheet = ss.getSheetByName(SHEET_IMAGES);
  const images = {};
  if (imagesSheet) {
    getRowsAsObjects(imagesSheet).forEach(row => {
      const key    = String(row.key    || '').trim();
      const fileId = String(row.fileId || '').trim();
      if (key && fileId) images[key] = fileId;
    });
  }

  return {
    nodes: [...episodeNodes, ...tagNodes],
    links: [...manualLinks, ...tagLinks],
    images,
  };
}

// ------------------------------------------------------------
// 概念データをショーノートから計算する（唯一の真実はショーノート）
//   戻り値: { list:[{name,status,episodeIds,titles,cooc}], titleById }
// ------------------------------------------------------------
function computeConcepts_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const episodes = getRowsAsObjects(ss.getSheetByName(SHEET_EPISODES))
    .filter(ep => ep.WEB_status === 'published');

  const map = {};           // name -> { status, episodes:Set<id> }
  const titleById = {};
  episodes.forEach(ep => {
    titleById[String(ep.id)] = ep.title;
    const matches = (ep.shownote || '').match(/#+([^\s#、。！？…「」『』【】（）]+)/g) || [];
    matches.forEach(m => {
      const hashes = m.match(/^#+/)[0].length;
      const name   = m.replace(/^#+/, '');
      if (!map[name]) map[name] = { status: 'candidate', episodes: new Set() };
      if (hashes === 1) map[name].status = 'tagged';
      map[name].episodes.add(String(ep.id));
    });
  });

  const list = Object.entries(map).map(([name, v]) => ({
    name,
    status:     v.status,
    episodeIds: [...v.episodes],
    titles:     [...v.episodes].map(id => titleById[id] || ''),
  }));

  // 共起（同じエピソードを共有する概念同士）
  list.forEach(c => {
    const ids = new Set(c.episodeIds);
    c.cooc = list
      .filter(o => o.name !== c.name)
      .map(o => ({ name: o.name, shared: o.episodeIds.filter(id => ids.has(id)).length }))
      .filter(o => o.shared > 0)
      .sort((a, b) => b.shared - a.shared || a.name.localeCompare(b.name, 'ja'));
  });

  list.sort((a, b) => b.episodeIds.length - a.episodeIds.length);
  return { list, titleById };
}

// concepts シートの「手動列」を name で読み込む（無ければ空）
function readConceptManual_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_CONCEPTS);
  const out = {};
  if (!sheet) return out;
  getRowsAsObjects(sheet).forEach(r => {
    const name = String(r.name || '').trim();
    if (!name) return;
    out[name] = {
      description:        String(r.description        || '').trim(),
      reading:             String(r.reading            || '').trim(),
      memo:                String(r.memo               || '').trim(),
      proposer:            String(r.proposer           || '').trim(),
      related_concepts:    String(r.related_concepts   || '').trim(),
      related_external:    String(r.related_external   || '').trim(),
      contrast_concepts:   String(r.contrast_concepts  || '').trim(),
    };
  });
  return out;
}

// 「概念名、概念名／概念名」のような文字列を配列に分解する共通ヘルパー
function splitConceptList_(str) {
  return String(str || '')
    .split(/[、,／\/]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

// 改行（セル内でAlt+Enter / Cmd+Enterで入れた改行）だけを区切りとして分割する。
// 引用文には句読点・スラッシュ・カンマがそのまま登場しうるため、
// related_external（文献由来の近接概念）はこちらを使う。
function splitByLine_(str) {
  return String(str || '')
    .split(/\r\n|\r|\n/)
    .map(s => s.trim())
    .filter(Boolean);
}

// concept_contexts シートを { "概念名|epId": context } で読み込む
function readConceptContexts_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_CONTEXTS);
  const out = {};
  if (!sheet) return out;
  getRowsAsObjects(sheet).forEach(r => {
    const concept = String(r.concept    || '').trim();
    const id      = String(r.episode_id || '').trim();
    const ctx     = String(r.context    || '').trim();
    if (concept && id) out[concept + '|' + id] = ctx;
  });
  return out;
}

// ------------------------------------------------------------
// 概念ページ用データ（?type=concepts）
// 状態・登場EP・共起はショーノートから即時計算（常に最新）。
// 一言説明は concepts シート、各EPの文脈は concept_contexts シートからマージ。
// ------------------------------------------------------------
function buildConceptsData() {
  const { list } = computeConcepts_();
  const manual = readConceptManual_();
  const ctx    = readConceptContexts_();
  const nameSet = new Set(list.map(c => c.name));

  // 近接概念（自分たちで話したもの）・対比概念を双方向に展開する
  // （片方の行にだけ書かれていても、書かれた相手側にも自動で逆リンクを持たせる）
  const relatedMap  = {}; // name -> Set<name>
  const contrastMap = {};
  const addPair = (map, a, b) => {
    if (!nameSet.has(a) || !nameSet.has(b)) return; // 存在しない概念名（タイプミス等）は無視
    if (!map[a]) map[a] = new Set();
    if (!map[b]) map[b] = new Set();
    map[a].add(b);
    map[b].add(a);
  };
  Object.entries(manual).forEach(([name, m]) => {
    splitConceptList_(m.related_concepts).forEach(other  => addPair(relatedMap,  name, other));
    splitConceptList_(m.contrast_concepts).forEach(other => addPair(contrastMap, name, other));
  });

  const concepts = list.map(c => {
    const m = manual[c.name] || {};
    return {
      name:             c.name,
      status:           c.status,
      description:      m.description || '',
      reading:          m.reading     || '',
      proposer:         m.proposer    || '',
      related:          [...(relatedMap[c.name] || [])],        // ページリンクにする（クリックでconcept.html?c=...）
      related_external: splitByLine_(m.related_external),  // 改行区切り。リンクにしない、テキストのまま表示
      contrast:         [...(contrastMap[c.name] || [])],       // ページリンクにする
      episodes:         c.episodeIds.map((id, i) => ({
        id,
        title:   c.titles[i] || '',
        context: ctx[c.name + '|' + id] || '',
      })),
    };
  });

  return { concepts };
}

// ------------------------------------------------------------
// 【メニュー】concepts シート と concept_contexts シートを最新化する
// ------------------------------------------------------------
function syncConceptsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const { list } = computeConcepts_();
  syncConceptsMasterSheet_(ss, list);
  syncContextsScaffold_(ss, list);
  ss.toast(`概念 ${list.length}件を書き出しました`, '概念シート更新', 5);
}

// concepts（管理シート）本体の書き出し。手動列は name で温存。
function syncConceptsMasterSheet_(ss, list) {
  let sheet = ss.getSheetByName(SHEET_CONCEPTS);
  if (!sheet) sheet = ss.insertSheet(SHEET_CONCEPTS);

  const prev = {};
  getRowsAsObjects(sheet).forEach(r => {
    const name = String(r.name || '').trim();
    if (name) prev[name] = r;
  });

  const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  const rowFor = (name, auto) => {
    const p = prev[name] || {};
    return [
      name,
      auto ? (auto.status === 'tagged' ? 'タグ済み' : '未タグ') : '',
      auto ? auto.episodeIds.length : 0,
      auto ? auto.episodeIds.join(', ') : '',
      auto ? auto.titles.join(' / ') : '',
      auto ? auto.cooc.map(o => `${o.name}(${o.shared})`).join(', ') : '',
      auto ? '○' : '×',
      now,
      p.description || '',
      p.reading     || '',
      p.proposer            || '',
      p.related_concepts    || '',
      p.related_external    || '',
      p.contrast_concepts   || '',
      p.memo        || '',
    ];
  };

  const rows = [];
  const seen = new Set();
  list.forEach(c => { seen.add(c.name); rows.push(rowFor(c.name, c)); });
  Object.keys(prev).forEach(name => {
    if (!seen.has(name)) rows.push(rowFor(name, null)); // 消えたが手動データ温存
  });

  sheet.clearContents();
  sheet.getRange(1, 1, 1, CONCEPT_HEADERS.length).setValues([CONCEPT_HEADERS]);
  if (rows.length) sheet.getRange(2, 1, rows.length, CONCEPT_HEADERS.length).setValues(rows);
  sheet.setFrozenRows(1);
}

// concept_contexts（手書き文脈シート）の骨組みを用意。context は key で温存。
function syncContextsScaffold_(ss, list) {
  let sheet = ss.getSheetByName(SHEET_CONTEXTS);
  if (!sheet) sheet = ss.insertSheet(SHEET_CONTEXTS);

  // 既存の手書き context を「概念名|epId」で退避
  const prev = {};
  getRowsAsObjects(sheet).forEach(r => {
    const concept = String(r.concept    || '').trim();
    const id      = String(r.episode_id || '').trim();
    if (!concept || !id) return;
    prev[concept + '|' + id] = {
      title:   String(r.episode_title || ''),
      context: String(r.context       || ''),
    };
  });

  const rows = [];
  const seen = new Set();
  list.forEach(c => {
    c.episodeIds.forEach((id, i) => {
      const key = c.name + '|' + id;
      seen.add(key);
      const p = prev[key] || {};
      rows.push([c.name, id, c.titles[i] || '', p.context || '']);
    });
  });
  // 組み合わせが消えても、書いた context が残っていれば末尾に温存
  Object.keys(prev).forEach(key => {
    if (seen.has(key) || !prev[key].context) return;
    const sep = key.lastIndexOf('|');
    rows.push([key.slice(0, sep), key.slice(sep + 1), prev[key].title, prev[key].context]);
  });

  sheet.clearContents();
  sheet.getRange(1, 1, 1, CONTEXT_HEADERS.length).setValues([CONTEXT_HEADERS]);
  if (rows.length) sheet.getRange(2, 1, rows.length, CONTEXT_HEADERS.length).setValues(rows);
  sheet.setFrozenRows(1);
}

// ------------------------------------------------------------
// 作品（INSPIRED）データをショーノートから計算する
//   絵文字マーカー：📚本 / 🎬映画 / 📺アニメ・ドラマ / 🎵音楽 / 📻ラジオ・ポッドキャスト
//   書き方（優先度順）：
//     1. 📚[タイトル](URL)著者 または 📚[タイトル](URL)／著者 … リンク記法。
//        著者の前の区切り（／ / ・）は任意で許容し、あれば無視する
//     2. 📚『タイトル』/「タイトル」/[タイトル] … タイトルのみ囲む（スペース・記号を含める用）
//     3. 📚タイトル              … 素の1語（スペース・句読点までを1語として拾う）
//   戻り値: { list:[{title,type,episodeIds,titles,inlineCreator,inlineLink}] }
// ------------------------------------------------------------
function computeWorks_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const episodes = getRowsAsObjects(ss.getSheetByName(SHEET_EPISODES))
    .filter(ep => ep.WEB_status === 'published');

  const emojiAlt = Object.keys(WORK_EMOJI_TYPE).join('|');
  // 絵文字は文字クラス[ ]でまとめると内部的に壊れることがあるため、必ず交互パターン( | )で並べる。
  // マッチの優先順位（上から順に試す。マッチした時点でそれ以降は試さない）：
  //   1. 📚[タイトル](URL)著者      … リンク記法。タイトル・URL・著者(任意)をショーノートから直接取得
  //   2. 📚『タイトル』/「タイトル」/[タイトル]  … タイトルだけを囲む（スペース・記号を含める用）
  //   3. 📚タイトル                 … 素の1語（スペース・記号までが区切り）
  const re = new RegExp(
    `(${emojiAlt})(?:` +
      `\\[([^\\]]+)\\]\\((https?:[^\\s)]+)\\)(?:[／/・]\\s*)?([^\\s、。！？…「」『』【】（）\\[\\]]*)` + // 1: リンク記法（区切りの／ / ・は任意で許容し無視）
      `|『([^』]+)』` +                                                                 // 2: 『』
      `|「([^」]+)」` +                                                                 // 3: 「」
      `|\\[([^\\]]+)\\]` +                                                              // 4: []
      `|([^\\s、。！？…「」『』【】（）\\[\\]]+)` +                                       // 5: 素の1語
    `)`,
    'g'
  );

  // "type|title" -> { title, type, episodes:Set<id>, inlineCreator, inlineLink }
  const map = {};
  const titleById = {};

  episodes.forEach(ep => {
    titleById[String(ep.id)] = ep.title;
    const summary = ep.shownote || '';
    let m;
    while ((m = re.exec(summary)) !== null) {
      const type = WORK_EMOJI_TYPE[m[1]];
      let title, inlineUrl = '', inlineCreator = '';

      if (m[2] !== undefined) {
        // リンク記法：[タイトル](URL)著者
        title         = m[2].trim();
        inlineUrl     = (m[3] || '').trim();
        inlineCreator = (m[4] || '').trim();
      } else {
        title = (m[5] || m[6] || m[7] || m[8] || '').trim();
      }
      if (!title) continue;

      const key = type + '|' + title;
      if (!map[key]) map[key] = { title, type, episodes: new Set(), inlineCreator: '', inlineLink: '' };
      map[key].episodes.add(String(ep.id));
      // 複数回書かれている場合、最初に見つかった非空の値を採用する
      if (inlineCreator && !map[key].inlineCreator) map[key].inlineCreator = inlineCreator;
      if (inlineUrl     && !map[key].inlineLink)    map[key].inlineLink    = inlineUrl;
    }
  });

  const list = Object.values(map).map(w => ({
    title:         w.title,
    type:          w.type,
    episodeIds:    [...w.episodes],
    titles:        [...w.episodes].map(id => titleById[id] || ''),
    inlineCreator: w.inlineCreator,
    inlineLink:    w.inlineLink,
  }));

  list.sort((a, b) => b.episodeIds.length - a.episodeIds.length);
  return { list };
}

// works シートの「半自動列・手動列」を type|title で読み込む
function readWorkAssistAndManual_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_INSPIRED);
  const out = {};
  if (!sheet) return out;
  getRowsAsObjects(sheet).forEach(r => {
    const title = String(r.title || '').trim();
    const type  = String(r.type  || '').trim();
    if (!title || !type) return;
    out[type + '|' + title] = {
      creator:     String(r.creator     || '').trim(),
      image_url:   String(r.image_url   || '').trim(),
      link_url:    String(r.link_url    || '').trim(),
      description: String(r.description || '').trim(),
      memo:        String(r.memo        || '').trim(),
    };
  });
  return out;
}

// ------------------------------------------------------------
// 作品ページ用データ（?type=works）
// ------------------------------------------------------------
function buildWorksData() {
  const { list } = computeWorks_();
  const prev = readWorkAssistAndManual_();

  const works = list.map(w => {
    const p = prev[w.type + '|' + w.title] || {};
    // 優先順位：①ショーノートのリンク記法（inline）→②シート保存値（手動 or 過去のAPI取得結果）
    return {
      title:        w.title,
      type:         w.type,
      type_label:   WORK_TYPE_LABEL[w.type] || w.type,
      creator:      w.inlineCreator || p.creator     || '',
      image_url:    p.image_url   || '', // 画像はショーノートに書かない設計のためシート値のみ
      link_url:     w.inlineLink    || p.link_url    || '',
      description:  p.description || '',
      episodes:     w.episodeIds.map((id, i) => ({ id, title: w.titles[i] || '' })),
    };
  });

  return { works };
}

// ------------------------------------------------------------
// 【メニュー】works シートを最新化する（半自動列はAPI取得を試みる）
// ------------------------------------------------------------
function syncWorksSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const { list } = computeWorks_();
  let sheet = ss.getSheetByName(SHEET_INSPIRED);
  if (!sheet) sheet = ss.insertSheet(SHEET_INSPIRED);

  const prev = {};
  getRowsAsObjects(sheet).forEach(r => {
    const key = String(r.type || '').trim() + '|' + String(r.title || '').trim();
    if (key !== '|') prev[key] = r;
  });

  const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  let apiCalls = 0;
  const API_LIMIT = 30; // 1回の実行での外部API呼び出し上限（暴走防止）

  const rowFor = (auto) => {
    const key = auto ? (auto.type + '|' + auto.title) : null;
    const p = key ? (prev[key] || {}) : {};

    let creator   = String(p.creator   || '').trim();
    let imageUrl  = String(p.image_url || '').trim();
    let linkUrl   = String(p.link_url  || '').trim();

    // 優先順位①：ショーノートのリンク記法（[タイトル](URL)著者）があれば最優先で使う
    if (auto && auto.inlineCreator) creator = auto.inlineCreator;
    if (auto && auto.inlineLink)    linkUrl = auto.inlineLink;

    // 優先順位②：画像だけが空欄の場合はAPI取得を試みる
    // （creator/linkUrlは①のリンク記法や既存シート値を尊重し、上書きしない。
    //  以前は creator/imageUrl/linkUrl が「全部」空の時しか呼んでおらず、
    //  ①リンク記法で著者・URLだけ書いた本の画像が永久に取得されないバグがあったため変更）
    if (auto && !imageUrl && apiCalls < API_LIMIT) {
      let meta = null;
      if (auto.type === 'book') {
        meta = fetchBookMeta_(auto.title, creator || null);
      } else if (auto.type === 'music') {
        meta = fetchMusicMeta_(auto.title, creator || null);
      } else if (auto.type === 'radio') {
        meta = fetchPodcastMeta_(auto.title, creator || null);
      }
      Logger.log('DEBUG type=' + auto.type + ' title=' + auto.title + ' meta=' + JSON.stringify(meta));
      // movie / anime は今回は自動取得なし（将来TMDb連携時に対応）

      if (meta) {
        if (!imageUrl) imageUrl = meta.image_url;
        if (!creator)  creator  = meta.creator;   // 既に分かっていれば上書きしない
        if (!linkUrl)  linkUrl  = meta.link_url;   // 既に分かっていれば上書きしない
      }
      if (auto.type === 'book' || auto.type === 'music' || auto.type === 'radio') apiCalls++;
    }

    return [
      auto ? auto.title : (key ? key.split('|')[1] : ''),
      auto ? auto.type  : (key ? key.split('|')[0] : ''),
      auto ? auto.episodeIds.length : 0,
      auto ? auto.episodeIds.join(', ') : '',
      auto ? auto.titles.join(' / ') : '',
      auto ? '○' : '×',
      now,
      creator,
      imageUrl,
      linkUrl,
      String(p.description || ''),
      String(p.memo        || ''),
    ];
  };

  const rows = [];
  const seen = new Set();
  list.forEach(w => { seen.add(w.type + '|' + w.title); rows.push(rowFor(w)); });
  Object.keys(prev).forEach(key => {
    if (!seen.has(key)) rows.push(rowFor(null)); // 消えたが手動データ温存
  });

  sheet.clearContents();
  sheet.getRange(1, 1, 1, WORK_HEADERS.length).setValues([WORK_HEADERS]);
  if (rows.length) sheet.getRange(2, 1, rows.length, WORK_HEADERS.length).setValues(rows);
  sheet.setFrozenRows(1);

  ss.toast(`作品 ${list.length}件を書き出しました（API取得 ${apiCalls}件）`, '作品シート更新', 5);
}

// Google Books API で書籍の著者・表紙・リンクを取得（キー不要）
// authorHint: ①リンク記法の著者、またはシート既存のcreatorがあれば渡す（無ければnull可）
function fetchBookMeta_(title, authorHint) {
  const baseQuery = authorHint
    ? 'intitle:' + title + ' inauthor:' + authorHint
    : 'intitle:' + title;

  try {
    return tryQuery_(baseQuery, 'ja')
        || tryQuery_(baseQuery, null)
        || tryQuery_(authorHint ? (title + ' ' + authorHint) : title, null);
  } catch (err) {
    if (err instanceof QuotaError_) return null; // クォータ切れ：この本は諦めて次へ
    throw err;
  }
}

function tryQuery_(q, lang) {
  try {
    const suffix = lang ? '&langRestrict=' + lang : '';
    const url = 'https://www.googleapis.com/books/v1/volumes?q='
      + encodeURIComponent(q) + '&maxResults=1' + suffix;
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const code = res.getResponseCode();
    Logger.log('BOOKS_HTTP status=' + code + ' q=' + q);
    if (code === 429) throw new QuotaError_(); // クォータ切れは即座に諦める（呼び出し元でキャッチ）
    if (code !== 200) return null;
    const json = JSON.parse(res.getContentText());
    const item = json.items && json.items[0];
    if (!item) return null;
    const info = item.volumeInfo || {};
    let image = (info.imageLinks && (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail)) || '';
    if (image) image = image.replace(/^http:\/\//, 'https://');
    const result = {
      creator:   (info.authors || []).join(' / '),
      image_url: image,
      link_url:  info.infoLink || info.previewLink || '',
    };
    return (result.creator || result.image_url) ? result : null;
  } catch (err) {
    if (err instanceof QuotaError_) throw err; // 上に伝播させる
    Logger.log('ERROR: ' + err);
    return null;
  }
}

function QuotaError_() {} // クォータ切れを識別するための専用エラー型
QuotaError_.prototype = Object.create(Error.prototype);

// iTunes Search API で楽曲/アーティスト情報を取得（キー不要）
// artistHint: ①リンク記法のアーティスト、またはシート既存のcreatorがあれば渡す（無ければnull可）
function fetchMusicMeta_(title, artistHint) {
  const term = artistHint ? (title + ' ' + artistHint) : title;
  try {
    const url = 'https://itunes.apple.com/search?term=' + encodeURIComponent(term)
      + '&media=music&limit=1&country=JP';
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    const json = JSON.parse(res.getContentText());
    const item = json.results && json.results[0];
    if (!item) return null;
    let image = item.artworkUrl100 || '';
    if (image) {
      image = image.replace(/^http:\/\//, 'https://').replace('100x100bb', '600x600bb'); // 大きいサイズに差し替え
    }
    const result = {
      creator:   item.artistName || '',
      image_url: image,
      link_url:  item.trackViewUrl || item.collectionViewUrl || '',
    };
    return (result.creator || result.image_url) ? result : null;
  } catch (err) {
    Logger.log('ERROR: ' + err);
    return null;
  }
}

// iTunes Search API でラジオ/ポッドキャスト番組情報を取得（キー不要）
// creatorHint: ①リンク記法の配信者、またはシート既存のcreatorがあれば渡す（無ければnull可）
function fetchPodcastMeta_(title, creatorHint) {
  const term = creatorHint ? (title + ' ' + creatorHint) : title;
  try {
    const url = 'https://itunes.apple.com/search?term=' + encodeURIComponent(term)
      + '&media=podcast&limit=1&country=JP';
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    const json = JSON.parse(res.getContentText());
    const item = json.results && json.results[0];
    if (!item) return null;
    let image = item.artworkUrl600 || item.artworkUrl100 || '';
    if (image) image = image.replace(/^http:\/\//, 'https://');
    const result = {
      creator:   item.artistName || '', // 配信者/制作元
      image_url: image,
      link_url:  item.collectionViewUrl || item.trackViewUrl || '',
    };
    return (result.creator || result.image_url) ? result : null;
  } catch (err) {
    Logger.log('ERROR: ' + err);
    return null;
  }
}

// スプレッドシートを開いた時にメニューを追加する（簡易トリガー）
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('概念シート')
    .addItem('最新の内容に更新する', 'syncConceptsSheet')
    .addToUi();
  ui.createMenu('作品シート')
    .addItem('最新の内容に更新する（API取得あり）', 'syncWorksSheet')
    .addToUi();
}

// ------------------------------------------------------------
// WebアプリとしてJSONを返す
// ------------------------------------------------------------
function doGet(e) {
  const type = (e && e.parameter && e.parameter.type) || 'graph';
  const cacheKey = 'data_' + type;
  const cache = CacheService.getScriptCache();

  const cached = cache.get(cacheKey);
  if (cached) {
    return ContentService
      .createTextOutput(cached)
      .setMimeType(ContentService.MimeType.JSON);
  }

  let data;
  if      (type === 'logs')     data = buildLogsData();
  else if (type === 'concepts') data = buildConceptsData();
  else if (type === 'works')    data = buildWorksData();
  else                          data = buildPublicGraphData();

  const json = JSON.stringify(data);

  try {
    cache.put(cacheKey, json, 600); // 600秒 = 10分
  } catch (err) {
    // 100KB上限超過などで保存に失敗しても、レスポンス自体は正常に返す
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------
// 「公開日」セルの値を yyyy-MM-dd 文字列に変換する
// ------------------------------------------------------------
function formatPublishedAt(value) {
  if (!value) return '';

  // ケース1: 日付型セル。Apps Scriptでは実行コンテキストの都合で
  // `value instanceof Date` が false になることがあるため型名で判定する。
  const isDateLike = Object.prototype.toString.call(value) === '[object Date]';
  if (isDateLike && typeof value.getTime === 'function' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM-dd');
  }

  // ケース2: 文字列 "yy/mm/dd" / "yyyy/mm/dd" の保険
  const str = String(value).trim();
  const m = str.match(/^(\d{2}|\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    let [, y, mo, d] = m;
    if (y.length === 2) y = '20' + y;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    if (!isNaN(dt.getTime())) {
      return Utilities.formatDate(dt, 'Asia/Tokyo', 'yyyy-MM-dd');
    }
  }

  return '';
}

// ------------------------------------------------------------
// 共通：シートの1行目をヘッダーとしてオブジェクト配列に変換する
// ------------------------------------------------------------
function getRowsAsObjects(sheet) {
  if (!sheet) return [];
  const [headers, ...rows] = sheet.getDataRange().getValues();
  return rows
    .filter(row => row.some(cell => cell !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
      return obj;
    });
}

// ------------------------------------------------------------
// LOGページ用データを組み立てて返す
// ------------------------------------------------------------
function buildLogsData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_LOGS);
  const rows = getRowsAsObjects(sheet);

  const logs = rows.map((row, i) => ({
    id:     i + 1,
    title:  row['タイトル'] || '',
    body:   row['本文'] || '',
    author: row['執筆者'] || '',
    date:   formatLogDate(row['タイムスタンプ']),
  }));

  logs.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { logs };
}

// ------------------------------------------------------------
// フォームの「タイムスタンプ」列を yyyy-MM-dd に変換する
// ------------------------------------------------------------
function formatLogDate(value) {
  const isDateLike = Object.prototype.toString.call(value) === '[object Date]';
  if (isDateLike && typeof value.getTime === 'function' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  const str = String(value || '').trim();
  const m = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    if (!isNaN(dt.getTime())) return Utilities.formatDate(dt, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  return '';
}

function testFetchDebug() {
  const result = fetchPodcastMeta_('ゆる言語学ラジオ', 'Yuru Gengogaku');
  Logger.log('結果: ' + JSON.stringify(result));
}
