# podcast-graph

ポッドキャスト「ラッキーもくもくチャンス」のエピソード関係図を可視化するD3.jsアプリ。

## 構成

- **本体は `app/` 配下**（2026-08-21〜）。ルート直下のHTMLは `app/` へ転送するだけの殻
- **フロントエンド**: D3.js v7（`app/graph.js`, `app/graph.css`, `app/index.html`）
- **データ**: RSS直読み（エピソードの存在・音声・公開日）＋ GitHub上のJSON（`app/*.json`）
- **Markdown**: marked@12（CDN）でshownoteをレンダリング
- **ホスティング**: GitHub Pages / Vercel

## 重要な前提

- **本番公開ブランチは `feature/logo-deco`**（mainは削除済み）。本番反映するには logo-deco に push する必要あり
- **編集するのは `app/` 配下。** ルート直下のHTMLを直しても誰も見ない（転送用の殻のため）
- **`episodes.html` だけはルートのまま**（Studioにiframe埋め込みされているため転送していない）。GAS依存が残る唯一のページ
- **ショーノートは30分おきに自動同期**（`.github/workflows/sync-shownotes.yml`）。手動コマンドは不要
  - ⚠️ `app/` 内にショーノート編集画面を作ったら、このワークフローは**必ず削除**する（直接編集とポーリングの併用は、新しい編集を古いスプレッドシートの内容で上書きする）
- **`gas/Code.gs` はリポジトリと実デプロイがズレやすい。** GASを触る前に必ず最新コードを貼ってもらって同期確認する（過去に古いまま上書きしてLOG機能を消しかけた）
- **GASは手動デプロイ**：`gas/Code.gs` を更新したらユーザーがGASエディタにコピペ → 「**デプロイを管理 → 鉛筆 → 新バージョン**」で再デプロイ。**新規デプロイにするとWebApp URLが変わるので必ず既存デプロイの新バージョン**として上げる
- **スプシID**: `128vhJ_5mR9q9vZNqepeE-slpaycNm9SlU4BVhFecxKA`
  - `episodes` シート: `WEB_status=published` の行のみ公開
  - `links` シート: `status=approved` の行のみ公開
  - `images` シート: `key`, `fileId` 列。shownote 内 `[img:key]` をDrive画像URLに展開
- **GAS WebApp URL は graph.js 冒頭の `GAS_URL` 定数**（変わったら差し替え）

## shownote 記法

**ショーノートが全ての親**。ここに書くだけで、星図のタグ・概念ページ・INSPIREDが自動で付いてくる（個別登録は不要）。

- Markdown対応（`**太字**`, `[テキスト](URL)`, `- 箇条書き` など）
- `[img:ep012_1]` で `images` シートのキーに対応する画像を埋め込み
- **`#タグ`** … 星図にグレーノードとして出る＋概念ページで「タグ済み」
- **`##タグ`** … 星図には出さない。概念ページで「未タグ」として管理（`#`に変える＝1文字消すだけで昇格）
- **`📚[タイトル](URL)著者`** … INSPIREDページに作品として並ぶ（`🎬`映画 / `📺`アニメ・ドラマ / `🎵`音楽 / `📻`ラジオ）
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
