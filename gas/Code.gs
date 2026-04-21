// ============================================================
// Podcast関係図 - Google Apps Script
// ============================================================

const SHEET_EPISODES        = 'episodes';
const SHEET_CANDIDATE_LINKS = 'candidate_links';
const SHEET_PUBLIC_LINKS    = 'public_links';

// ------------------------------------------------------------
// スプレッドシートを開いたときにカスタムメニューを追加する
// ------------------------------------------------------------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Podcast関係図')
    .addItem('✅ 承認済みリンクを公開用にコピー', 'buildPublicLinks')
    .addToUi();
}

// ------------------------------------------------------------
// candidate_links の approved だけを public_links にコピーする
// ------------------------------------------------------------
function buildPublicLinks() {
  const ss         = SpreadsheetApp.getActiveSpreadsheet();
  const candidates = getRowsAsObjects(ss.getSheetByName(SHEET_CANDIDATE_LINKS));
  const approved   = candidates.filter(row => row.status === 'approved');

  const publicSheet = ss.getSheetByName(SHEET_PUBLIC_LINKS);
  publicSheet.clearContents();

  const headers = ['source', 'target', 'reason'];
  publicSheet.appendRow(headers);

  approved.forEach(row => {
    publicSheet.appendRow([row.source, row.target, row.reason || '']);
  });

  SpreadsheetApp.getUi().alert(
    `✅ ${approved.length} 件のリンクを public_links にコピーしました。`
  );
}

// ------------------------------------------------------------
// D3用のJSONデータを組み立てて返す
// ------------------------------------------------------------
function buildPublicGraphData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const episodes = getRowsAsObjects(ss.getSheetByName(SHEET_EPISODES))
    .filter(ep => ep.status === 'published');

  const manualLinks = getRowsAsObjects(ss.getSheetByName(SHEET_PUBLIC_LINKS));

  const publishedIds = new Set(episodes.map(ep => String(ep.id)));

  // エピソードノード
  const episodeNodes = episodes.map(ep => ({
    id:           String(ep.id),
    type:         'episode',
    title:        ep.title,
    url:          ep.url,
    summary:      ep.summary,
    shownote:     ep.shownote,
    published_at: ep.published_at,
  }));

  // summaryから #タグ を抽出してタグノード・タグリンクを生成
  const tagMap = {}; // { タグ名: Set<epId> }
  episodes.forEach(ep => {
    const summary = ep.summary || '';
    const matches = summary.match(/#([^\s#、。！？…「」『』【】（）]+)/g) || [];
    matches.forEach(m => {
      const label = m.slice(1); // # を除く
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

  // 手動リンク（エピソード間）
  const filteredManualLinks = manualLinks
    .filter(lk => publishedIds.has(String(lk.source)) && publishedIds.has(String(lk.target)))
    .map(lk => ({
      source: String(lk.source),
      target: String(lk.target),
      reason: lk.reason || '',
      type:   'manual',
    }));

  return {
    nodes: [...episodeNodes, ...tagNodes],
    links: [...filteredManualLinks, ...tagLinks],
  };
}

// ------------------------------------------------------------
// WebアプリとしてJSONを返す（D3ページから fetch される）
// ------------------------------------------------------------
function doGet(e) {
  const data = buildPublicGraphData();
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
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
