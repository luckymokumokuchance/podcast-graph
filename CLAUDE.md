# podcast-graph

ポッドキャスト「ラッキーもくもくチャンス」のエピソード関係図を可視化するD3.jsアプリ。

## 構成

- **フロントエンド**: D3.js v7（`graph.js`, `style.css`, `index.html`）
- **バックエンド**: Google Apps Script（`gas/Code.gs`）→ スプレッドシートからJSONを返すAPI
- **Markdown**: marked@12（CDN）でshownoteをレンダリング
- **ホスティング**: GitHub Pages

## 重要な前提

- **本番公開ブランチは `feature/logo-deco`**（mainではない）。本番反映するには logo-deco に push する必要あり
- **GASは手動デプロイ**：`gas/Code.gs` を更新したらユーザーがGASエディタにコピペ → 「**デプロイを管理 → 鉛筆 → 新バージョン**」で再デプロイ。**新規デプロイにするとWebApp URLが変わるので必ず既存デプロイの新バージョン**として上げる
- **スプシID**: `128vhJ_5mR9q9vZNqepeE-slpaycNm9SlU4BVhFecxKA`
  - `episodes` シート: `WEB_status=published` の行のみ公開
  - `links` シート: `status=approved` の行のみ公開
  - `images` シート: `key`, `fileId` 列。shownote 内 `[img:key]` をDrive画像URLに展開
- **GAS WebApp URL は graph.js 冒頭の `GAS_URL` 定数**（変わったら差し替え）

## shownote 記法

- Markdown対応（`**太字**`, `[テキスト](URL)`, `- 箇条書き`, `## 見出し` など）
- `[img:ep012_1]` で `images` シートのキーに対応する画像を埋め込み
- `#タグ`（スペース無し）はGAS側で自動的にタグノードとして抽出される
- 階層リストは行頭半角スペース2個でネスト
- shownote内リンクは `target="_blank"` で別タブ開き（marked の postprocess hook で付与）

## URLパラメータ

- `?ep=<id>` でエピソードのモーダルを自動オープン（Spotify概要欄から飛ばす用）

## 作業スタイル

- 数値チューニングは確認なしで即commit & push
- 設定値は **`COLORS` オブジェクト**や **`logoParts` 配列**などファイル冒頭にまとめる
- 実験機能は新ブランチで開発し、本番ブランチ（feature/logo-deco）に merge
- 説明は1行で。返答は短く

## 開発体制・コミュニケーション

4人体制（河﨑+Win側Claude／イノウエ+もう一台のClaude）。

- **状況報告・引き継ぎ**：`HANDOVER*.md`（大きめの区切りごとに作成。前回分を必ず読んでから着手）
  - commit/pushしたら、同じタイミングでHANDOVERファイルも更新する（「大きめの区切り」を待たず、意味のあるまとまりごとに）
  - 相手はpullするまでローカルで確認できない、が前提。だからこそ「何をpushしたか」をHANDOVERに書き残すことが唯一の引き継ぎ手段になる
- **軽い質問・確認**：`QUESTIONS.md`（相手への質問はここに追記。回答が付いたら解決済みへ移動）
- Win側Claude（河﨑と作業）は git CLIに直接アクセスでき、push/pull/マージが可能
- イノウエ側Claude（このセッション）も2026-08-03以降、git/gh CLIに直接アクセス可能（inouemstアカウントがリポジトリのコラボレーターとして追加済み）。以前は「非公開リポジトリを直接見られずWeb UIのみ」だったが、現在はpush/pull/コミットとも可能

## 関連リソース

- **本番サイト**: https://luckymokumokuchance.github.io/podcast-graph/
- **Studio埋め込み**: https://lucky-mokumoku-chance.studio.site/
- **GitHubリポジトリ**: luckymokumokuchance/podcast-graph
- **スプレッドシート**: https://docs.google.com/spreadsheets/d/128vhJ_5mR9q9vZNqepeE-slpaycNm9SlU4BVhFecxKA/edit
