# 新アプリ（app/）— 設計とセットアップ

GAS・スプレッドシート・Driveを廃止し、**RSS直読み + links.json（GitHubで管理）+ GitHubログインでの管理者編集**に置き換える新バージョン。
現行サイト（ルートの index.html）とは**別リンク** `/-podcast-graph-/app/` で並行稼働する。

## 全体像

```
[閲覧] 誰でも
  ブラウザ
    ├─ RSS直fetch (https://anchor.fm/s/110637c28/podcast/rss)  → エピソード
    └─ links.json (このフォルダ)                              → 手動リンク
        → ネットワークビュー / テーブルビュー を切替表示

[編集] 管理者のみ
  admin.html
    → 「GitHubでログイン」(OAuth) → links.json をGitHub APIでコミット
    → GitHub Pages 自動リビルド(約1分) → 反映
```

GASもスプレッドシートも無し。データソースは RSS と links.json だけ。

## データの出どころ（確認済み）

| 項目 | 出どころ |
|---|---|
| タイトル / 話数 | RSS `<title>`（例 "020 コンセプトってなんなん？"） |
| 公開日 | RSS `<pubDate>` |
| 説明 / ショーノート | RSS `<description>`（HTML。#タグ・[トピック]込み） |
| 音声再生 | RSS `<enclosure url>` の mp3 を `<audio>` で（Spotify埋め込み不要） |
| エピソードID | 話数（"020"→20）を安定IDとして使用。links.json はこのIDで参照 |
| 手動リンク | links.json（[{source,target,reason}]） |
| #タグ | 説明文から抽出。ただし定型フッタ（#ラキもくチャン 等）は除外リストで弾く |

RSSは `access-control-allow-origin: *` を返すのでブラウザから直接読める（プロキシ不要・確認済み）。

## 方式2（GitHubログイン）のセットアップ手順

OAuthは「認可コード → アクセストークン」の交換でclient_secretが要る。secretは静的サイトに置けないので、**ごく小さな中継（Cloudflare Worker）** を1つだけ用意する。以下は初回だけ。

### 1. GitHub OAuth App を作る
- GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
- Application name: `podcast-graph admin`
- Homepage URL: `https://luckymokumokuchance.github.io/podcast-graph/app/`
- Authorization callback URL: `https://<あなたのworker>.workers.dev/callback`
- 発行される **Client ID** と **Client Secret** を控える

### 2. Cloudflare Worker をデプロイ（oauth-worker.js）
- Cloudflare（無料枠）に登録 → Workers で新規作成 → `oauth-worker.js` の中身を貼る
- 環境変数に `GITHUB_CLIENT_ID` と `GITHUB_CLIENT_SECRET` を設定
- デプロイして URL（例 `https://lmc-oauth.xxx.workers.dev`）を控える

### 3. admin.js に設定を書く
- `CLIENT_ID` と `WORKER_URL` を控えた値に差し替える

### 4. 管理者を絞る
- 「書き込みできる＝このリポジトリのコラボレーター」なので、GitHub側でコラボレーターに入っている人だけが保存に成功する。
- 非コラボレーターがログインしても、コミットAPIが403で弾かれる＝実質的に管理者限定。

## ビュー切替（今回の目玉）
- 画面上部のトグルで **ネットワーク / テーブル** を切替。
- ネットワーク: 現行同様のD3フォースグラフ（エピソード＋タグ＋手動リンク）。
- テーブル: スプレッドシート風。話数・タイトル・公開日・長さ・タグ・リンク数の列。ソート可。行クリックで詳細。

## 現状のプロトタイプでできていること / これから
- [x] RSS直読み・パース、ネットワーク/テーブル両ビュー、切替、詳細モーダル、mp3再生
- [x] admin.html のUIとGitHubログイン→links.jsonコミットのクライアント側
- [ ] Cloudflare Worker のデプロイ（あなたの作業。oauth-worker.js を貼るだけ）
- [ ] 本番反映（push）は、別マシンの未コミット変更を整理してから
