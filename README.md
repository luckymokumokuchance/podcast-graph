# 聴くための星図

Podcast各回のつながりを、D3.jsのネットワーク図で表示するプロジェクトです。  
関係データはGoogleスプレッドシートで手動管理し、GAS（Google Apps Script）を通じてWebページに配信します。

---

## ファイル構成

```
ClaudeCode/
├── gas/
│   └── Code.gs          ← GASに貼るコード（スプレッドシート連携）
├── public/
│   ├── index.html       ← 関係図ページのHTML
│   ├── style.css        ← デザイン
│   └── graph.js         ← D3.jsでグラフを描くコード
└── README.md            ← このファイル
```

---

## セットアップ手順

### STEP 1: Googleスプレッドシートを作る

スプレッドシートを新規作成し、以下の4シートを作ります。  
**シート名はこの通りにしてください（スペルに注意）。**

#### `episodes` シート（エピソード一覧）
| 列名 | 説明 |
|------|------|
| id | エピソードID（例: ep01, ep02） |
| title | タイトル |
| url | エピソードのURL |
| summary | 概要・説明文 |
| shownote | 詳細なショーノート |
| status | `published`（公開）または `draft`（下書き） |
| published_at | 公開日（例: 2024-01-15） |

#### `candidate_links` シート（リンク候補）
| 列名 | 説明 |
|------|------|
| source | つながりの起点エピソードID（例: ep01） |
| target | つながりの終点エピソードID（例: ep03） |
| score | 関連度（0〜1の小数。1が最も強い） |
| relation | 関係の種類（例: テーマ、人物、用語） |
| reason | なぜつながっているか |
| status | `approved`（公開OK）または `pending`（確認中） |
| reviewer | 確認者名 |
| memo | メモ |
| created_at | 作成日 |

#### `public_links` シート（公開用リンク）
「承認済みリンクを公開用にコピー」ボタンで自動生成されます。  
**手動で編集しないでください。**

| 列名 | 説明 |
|------|------|
| source | 起点エピソードID |
| target | 終点エピソードID |
| score | 関連度 |
| relation | 関係の種類 |
| reason | 理由 |

#### `relations` シート（関係ラベル一覧）
| 列名 | 説明 |
|------|------|
| relation | 関係の種類（例: テーマ、人物） |
| label | 表示名 |
| description | 説明 |

---

### STEP 2: GASにコードを貼る

1. スプレッドシートのメニュー「**拡張機能**」→「**Apps Script**」を開く
2. 最初から書いてある `function myFunction() {}` を**全部削除**する
3. `gas/Code.gs` の中身を**コピーして貼り付ける**
4. 左上のフロッピーアイコン（💾）で保存する
5. 「**デプロイ**」→「**新しいデプロイ**」を選ぶ
6. 種類：「ウェブアプリ」を選ぶ
7. 以下のように設定する：
   - **説明**：（任意）
   - **次のユーザーとして実行**：「自分」
   - **アクセスできるユーザー**：「全員」
8. 「デプロイ」ボタンを押す
9. 表示された「**ウェブアプリのURL**」をコピーしておく

---

### STEP 3: D3ページにURLを設定する

`public/graph.js` を開き、最初の方にある以下の行を探します：

```javascript
const GAS_URL = 'YOUR_GAS_WEB_APP_URL_HERE';
```

`'YOUR_GAS_WEB_APP_URL_HERE'` の部分を、STEP 2 でコピーしたURLに書き換えます。

```javascript
const GAS_URL = 'https://script.google.com/macros/s/xxxx/exec';
```

---

### STEP 4: 動作確認

1. スプレッドシートに `episodes` を数件入力し、`status` を `published` にする
2. `candidate_links` にリンクを入力し、`status` を `approved` にする
3. スプレッドシートのメニューに「**Podcast関係図**」が追加されているので：
   - 「✅ 承認済みリンクを公開用にコピー」を実行 → `public_links` が更新される
   - 「📋 JSONプレビュー（ログ確認）」を実行 → ログでJSONを確認できる
4. `public/index.html` をブラウザで開いて図が表示されることを確認する

---

### STEP 5: STUDIOに埋め込む

STUDIOの埋め込み（iframe）機能を使います。

`public/` フォルダの3ファイル（`index.html` / `style.css` / `graph.js`）を、  
静的ファイルとして公開できる場所にアップロードしてください。

> 例：GitHub Pages、Netlify、Vercelなど（いずれも無料プランあり）

公開URLが決まったら、STUDIOで「埋め込み」コンポーネントを追加し、以下のように設定します：

```html
<iframe
  src="https://あなたのドメイン/index.html"
  width="100%"
  height="600px"
  style="border: none;"
></iframe>
```

---

## 日常の使い方

```
新しいエピソードを追加
  ↓
episodes シートに1行追加（status = published）
  ↓
candidate_links シートにリンクを追加（status = pending）
  ↓
2人でレビューして approved に変更
  ↓
「✅ 承認済みリンクを公開用にコピー」を実行
  ↓
関係図ページに反映される
```

---

## よくある質問

**Q: グラフが表示されない**  
→ `GAS_URL` が正しく設定されているか確認してください。  
→ GASのデプロイで「アクセスできるユーザー：全員」になっているか確認してください。  
→ ブラウザの開発者ツール（F12）→ Consoleタブでエラーを確認してください。

**Q: リンクが反映されない**  
→ `candidate_links` の `status` が `approved`（小文字）になっているか確認してください。  
→ 「承認済みリンクを公開用にコピー」を再実行してください。

**Q: GASのコードを変更したのに反映されない**  
→ GASを変更したら「**新しいデプロイ**」が必要です。既存のデプロイを「更新」しても変更が反映される場合もありますが、うまくいかない場合は新規デプロイしてください。

---

## 今後の拡張について（メモ）

このコードは、あとからAI自動生成を追加しやすい構造にしています。

- GAS側では `getRowsAsObjects()` 関数でシートのデータを読んでいます
- AI生成を追加する場合は `generateCandidateLinks()` のような関数を追加し、  
  OpenAIやClaude APIを呼び出してから `candidate_links` に書き込む形になります
- D3ページ側は変更不要です（JSONの形式が同じであれば）
