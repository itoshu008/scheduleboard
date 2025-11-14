# ScheduleBoard - 社員向けスケジュール管理アプリ

PC、タブレット、スマートフォンに対応した社員向けスケジュール管理アプリケーションです。

**リポジトリ**: [https://github.com/itoshu008/scheduleboard](https://github.com/itoshu008/scheduleboard)

## 📋 目次

- [機能概要](#機能概要)
- [技術スタック](#技術スタック)
- [プロジェクト構造](#プロジェクト構造)
- [セットアップ](#セットアップ)
- [API仕様](#api仕様)
- [使用方法](#使用方法)
- [デプロイ](#デプロイ)
- [トラブルシューティング](#トラブルシューティング)

## 機能概要

### 1. 月別スケジュール（1ページ目）
- 左側に日付、上側に時間（0:00-23:00、15分刻み）のグリッド表示
- マスを選択してスケジュール登録
- 登録タブ：新規登録、テンプレート、コピー
- 36色のカラーパレットから色選択
- スケジュールバーのドラッグ&ドロップ移動
- バーの左右端をドラッグしてリサイズ
- ダブルクリックで編集・削除・コピー
- キーボードショートカット（Delete、Ctrl+C、Ctrl+V）
- 部署ごとの表示管理

### 2. 日別スケジュール（2ページ目）
- 部署別の日別スケジュール表示
- リスト表示とグリッド表示の切り替え
- 部署に所属する全社員の予定確認
- ユーザー登録順での表示

### 3. 全社員スケジュール（3ページ目）
- 社員番号順での全社員表示
- 部署関係なく全社員の予定確認
- 日別の全社員スケジュール一覧

### 4. 設備予約（4ページ目）
- 設備の月別予約管理
- 設備登録機能
- 設備別の予約状況確認
- グリッド表示での予約管理

### 5. 管理機能
- 部署登録・編集・削除・並び替え
- 社員登録・編集・削除・並び替え
- 設備登録・編集・削除・並び替え

## 技術スタック

### フロントエンド
- **React** 18.2.0
- **TypeScript** 5.6.3
- **Vite** 4.5.0 (ビルドツール)
- **React Router** 6.28.0 (ルーティング)
- **TanStack Query** 5.56.2 (データフェッチング)
- **Axios** 1.13.2 (HTTPクライアント)
- **Socket.IO Client** 4.7.5 (リアルタイム通信)
- **Day.js** 1.11.19 (日付処理)
- **CSS3** (レスポンシブデザイン)

### バックエンド
- **Node.js** (推奨: v20以上)
- **Express.js** 4.19.2
- **Socket.IO** 4.7.5 (WebSocket)
- **MySQL2** 3.11.0 (データベースドライバ)
- **Helmet** 7.1.0 (セキュリティ)
- **Compression** 1.7.4 (gzip圧縮)
- **Morgan** 1.10.0 (ロギング)
- **CORS** 2.8.5 (CORS設定)

### データベース
- **MySQL** 8.0以上
- **ホスト**: 210.131.208.22
- **ポート**: 3306
- **データベース名**: zat_sch_db

### 開発ツール
- **Concurrently** 8.2.2 (並列実行)
- **ESLint** (コード品質)
- **Prettier** (コードフォーマット)

## プロジェクト構造

```
scheduleboard/
├── server/                 # Node.js/Express バックエンド
│   ├── server.js          # メインサーバーファイル
│   ├── db.js              # データベース接続設定
│   ├── package.json       # サーバー依存関係
│   └── .env               # 環境変数（要作成）
├── suke/                  # React/Vite フロントエンド
│   ├── src/               # ソースコード
│   │   ├── components/    # Reactコンポーネント
│   │   ├── lib/           # ユーティリティ・APIクライアント
│   │   └── App.tsx        # メインアプリケーション
│   ├── public/            # 静的ファイル
│   ├── vite.config.ts     # Vite設定
│   └── package.json       # クライアント依存関係
├── tools/                 # デプロイ・ユーティリティスクリプト
├── deploy.sh              # デプロイスクリプト
├── package.json           # ルートパッケージ（ワークスペース管理）
└── README.md              # このファイル
```

## クイックスタート

```bash
# 1. リポジトリをクローン
git clone https://github.com/itoshu008/scheduleboard.git
cd scheduleboard

# 2. 依存関係をインストール
npm install

# 3. 環境変数を設定
cd server
cp .env.example .env  # .envファイルを編集してDB接続情報を設定

# 4. 開発サーバーを起動（ルートディレクトリから）
npm run dev
```

開発サーバー起動後:
- **フロントエンド**: http://localhost:5173
- **バックエンドAPI**: http://localhost:3000

## セットアップ

### 前提条件
- **Node.js** 20以上（推奨）
- **npm** 9以上
- **MySQL** 8.0以上
- **Git** (リポジトリクローン用)

### インストール手順

#### 1. リポジトリのクローン
```bash
git clone https://github.com/itoshu008/scheduleboard.git
cd scheduleboard
```

#### 2. 依存関係のインストール
```bash
# ルートから全依存関係をインストール（server + suke）
npm install

# または個別にインストール
npm --prefix server install
npm --prefix suke install
```

#### 3. 環境変数の設定
```bash
# server/.env ファイルを作成
cd server
cp .env.example .env  # 存在する場合
```

`server/.env` ファイルに以下を設定：
```env
# データベース設定
DB_HOST=210.131.208.22
DB_USER=itoshu
DB_PASS=zatint_6487
DB_NAME=zat_sch_db
DB_PORT=3306

# サーバー設定
PORT=3000
NODE_ENV=development

# オプション: モックAPIモード（DB接続なしでテスト）
# MOCK_API=1
```

### 起動方法

#### 開発環境（推奨）

1. サーバーの起動
```bash
cd server
npm start
```

2. クライアントの開発サーバー起動
```bash
cd client
npm start
```

3. ブラウザでアクセス
```
http://localhost:3000 (サーバー)
http://localhost:5173 (クライアント開発サーバー)
```

#### 本番環境

1. サーバーの起動
```bash
cd server
npm start
```

2. クライアントのビルド
```bash
cd client
npm run build
```

3. ブラウザでアクセス
```
http://localhost:3000
```

### 開発手順

#### 本番APIへの接続設定

フロントエンド開発時に本番API（https://zatint1991.com）に接続する場合：

##### CRA（Create React App）使用時

1. **プロキシ設定確認**
   - `server/client/package.json` に `"proxy": "https://zatint1991.com"` が設定済み
   - 開発時は `/api` へのリクエストが自動的に本番APIにプロキシされる

2. **起動コマンド**
   ```bash
   # 開発時（プロキシ経由）
   npm start
   
   # 本番API直接接続
   npm run start:prod
   ```

##### Vite使用時

1. **プロキシ設定確認**
   - `server/client/vite.config.ts` にプロキシ設定済み
   - 開発時は `/api` へのリクエストが自動的に本番APIにプロキシされる

2. **起動コマンド**
   ```bash
   # 開発時（プロキシ経由）
   npm run dev
   
   # 本番API直接接続
   npm run dev:prod
   ```

##### 共通設定

1. **環境変数設定**
   - 開発時: `/api` (プロキシ経由)
   - 本番時: `https://zatint1991.com/api` (直接接続)

2. **API疎通確認**
   - 開発サーバー起動後、ブラウザのコンソールでヘルスチェック結果を確認
   - `/api/health` エンドポイントが 200 で応答することを確認
   - Network タブで `/api` リクエストが本番APIにプロキシされていることを確認

3. **CORS対応**
   - `withCredentials: true` 設定により認証情報も送信
   - 本番API側でCORS設定が必要

#### トラブルシューティング

- **接続エラー**: 本番APIの稼働状況を確認
- **CORS エラー**: 本番API側のCORS設定を確認
- **プロキシエラー**: 
  - CRA: `package.json` の proxy 設定を確認
  - Vite: `vite.config.ts` の proxy 設定を確認

## 使用方法

### 基本操作

1. **部署・社員の登録**
   - 管理ボタンから部署と社員を登録
   - 部署名、社員名、社員番号を入力

2. **スケジュール登録**
   - 月別ページでマスを選択
   - 用件、開始・終了時間、色を設定
   - 登録ボタンで保存

3. **スケジュール編集**
   - スケジュールバーをダブルクリック
   - 編集・削除・コピーから選択

4. **ドラッグ&ドロップ**
   - スケジュールバーをドラッグして移動
   - 左右端をドラッグしてリサイズ

5. **キーボードショートカット**
   - Delete: 選択したスケジュールを削除
   - Ctrl+C: 選択したスケジュールをコピー
   - Ctrl+V: コピーしたスケジュールを貼り付け

### 表示機能

- **平日**: 黒文字
- **土曜日**: 青文字
- **日曜日・祝日**: 赤文字
- **祝日名**: 表示

### レスポンシブ対応

- PC: フル機能対応
- タブレット: タッチ操作対応
- スマートフォン: モバイル最適化

## API仕様

### ベースURL
- **開発環境**: `http://localhost:3000/api/scheduleboard`
- **本番環境**: `https://zatint1991.com/api/scheduleboard`

### エンドポイント一覧

#### ヘルスチェック
- `GET /api/scheduleboard/health` - サーバー・DB状態確認

#### 部署管理（Groups）
- `GET /api/scheduleboard/groups` - 全部署取得
- `POST /api/scheduleboard/groups` - 部署作成
  ```json
  { "name": "部署名", "color": "#FF0000" }
  ```

#### 社員管理（Users）
- `GET /api/scheduleboard/users` - 全社員取得
- `POST /api/scheduleboard/users` - 社員作成
  ```json
  { "code": "社員番号", "name": "社員名", "email": "email@example.com", "group_id": 1 }
  ```

#### テンプレート管理
- `GET /api/scheduleboard/templates` - 全テンプレート取得
- `POST /api/scheduleboard/templates` - テンプレート作成
  ```json
  { "title": "タイトル", "description": "説明", "color": "#FF0000" }
  ```

#### イベント管理（Schedules）
- `GET /api/scheduleboard/events` - イベント検索
  - クエリパラメータ: `user_id`, `from`, `to`
- `POST /api/scheduleboard/events` - イベント作成
  ```json
  {
    "user_id": 1,
    "template_id": 1,
    "start_at": "2024-01-01 09:00:00",
    "end_at": "2024-01-01 18:00:00",
    "note": "備考"
  }
  ```

#### 管理API（Admin）

##### 部署管理
- `GET /api/scheduleboard/admin/departments` - 全部署取得
- `POST /api/scheduleboard/admin/departments` - 部署作成
- `GET /api/scheduleboard/admin/departments/:id` - 部署取得
- `PUT /api/scheduleboard/admin/departments/:id` - 部署更新
- `DELETE /api/scheduleboard/admin/departments/:id` - 部署削除
- `PUT /api/scheduleboard/admin/departments/:id/move` - 部署順序変更
- `PUT /api/scheduleboard/admin/departments/order/update` - 部署順序一括更新

##### 社員管理
- `GET /api/scheduleboard/admin/employees` - 全社員取得（`department_id`でフィルタ可能）
- `POST /api/scheduleboard/admin/employees` - 社員作成
- `GET /api/scheduleboard/admin/employees/:id` - 社員取得
- `GET /api/scheduleboard/admin/employees/number/:employeeNumber` - 社員番号で検索
- `PUT /api/scheduleboard/admin/employees/:id` - 社員更新
- `DELETE /api/scheduleboard/admin/employees/:id` - 社員削除
- `PUT /api/scheduleboard/admin/employees/:id/move` - 社員順序変更
- `PUT /api/scheduleboard/admin/employees/order/update` - 社員順序一括更新

##### 設備管理
- `GET /api/scheduleboard/admin/equipment` - 全設備取得
- `POST /api/scheduleboard/admin/equipment` - 設備作成
- `GET /api/scheduleboard/admin/equipment/:id` - 設備取得
- `PUT /api/scheduleboard/admin/equipment/:id` - 設備更新
- `DELETE /api/scheduleboard/admin/equipment/:id` - 設備削除
- `PUT /api/scheduleboard/admin/equipment/:id/move` - 設備順序変更
- `PUT /api/scheduleboard/admin/equipment/order/update` - 設備順序一括更新

##### 設備予約管理
- `GET /api/scheduleboard/admin/equipment-reservations` - 予約検索
  - クエリパラメータ: `equipment_id`, `from`, `to`
- `POST /api/scheduleboard/admin/equipment-reservations` - 予約作成
- `GET /api/scheduleboard/admin/equipment-reservations/:id` - 予約取得
- `PUT /api/scheduleboard/admin/equipment-reservations/:id` - 予約更新
- `DELETE /api/scheduleboard/admin/equipment-reservations/:id` - 予約削除

### WebSocket（Socket.IO）

#### 接続
- **パス**: `/socket.io`
- **トランスポート**: WebSocket, Polling

#### イベント
- **クライアント → サーバー**:
  - `request:refresh` - データ更新要求
- **サーバー → クライアント**:
  - `data:change` - データ変更通知
    ```json
    { "type": "department|employee|event|equipment", "data": {...}, "timestamp": "..." }
    ```
  - `data:refresh` - データ更新通知

### レスポンス形式

#### 成功レスポンス
```json
{
  "ok": true,
  "data": {...}
}
```

#### エラーレスポンス
```json
{
  "ok": false,
  "error": "エラーメッセージ"
}
```

## データベース構造

### テーブル一覧

#### `groups` (部署)
- `id` (INT, PRIMARY KEY, AUTO_INCREMENT)
- `name` (VARCHAR) - 部署名
- `color` (VARCHAR) - 表示色
- `created_at` (TIMESTAMP)

#### `users` (社員)
- `id` (INT, PRIMARY KEY, AUTO_INCREMENT)
- `code` (VARCHAR) - 社員番号
- `name` (VARCHAR) - 社員名
- `email` (VARCHAR) - メールアドレス
- `group_id` (INT, FOREIGN KEY → groups.id)
- `created_at` (TIMESTAMP)

#### `templates` (テンプレート)
- `id` (INT, PRIMARY KEY, AUTO_INCREMENT)
- `title` (VARCHAR) - タイトル
- `description` (TEXT) - 説明
- `color` (VARCHAR) - 表示色
- `created_at` (TIMESTAMP)

#### `events` (スケジュール)
- `id` (INT, PRIMARY KEY, AUTO_INCREMENT)
- `user_id` (INT, FOREIGN KEY → users.id)
- `template_id` (INT, FOREIGN KEY → templates.id, NULL可)
- `start_at` (DATETIME) - 開始日時
- `end_at` (DATETIME) - 終了日時
- `note` (TEXT) - 備考
- `created_at` (TIMESTAMP)

#### `equipment` (設備)
- `id` (INT, PRIMARY KEY, AUTO_INCREMENT)
- `name` (VARCHAR) - 設備名
- `description` (TEXT) - 説明
- `created_at` (TIMESTAMP)

#### `equipment_reservations` (設備予約)
- `id` (INT, PRIMARY KEY, AUTO_INCREMENT)
- `equipment_id` (INT, FOREIGN KEY → equipment.id)
- `user_id` (INT, FOREIGN KEY → users.id)
- `start_at` (DATETIME) - 開始日時
- `end_at` (DATETIME) - 終了日時
- `note` (TEXT) - 備考
- `created_at` (TIMESTAMP)

## デプロイ

### Prerequisites (admin task)
- Nginx location for `/scheduleboard/`:
  ```
  location ^~ /scheduleboard/ {
    alias /var/www/html/scheduleboard/;
    try_files $uri $uri/ /scheduleboard/index.html;
  }
  ```
- sudoers (limited to nginx only):
  ```
  itoshu2 ALL=(root) NOPASSWD: /usr/sbin/nginx
  ```
  > No other commands (systemctl, rm, bash, etc.) are allowed. Principle of least privilege.

- Target directory owned by `itoshu2` and group `www-data`, with setgid for group inheritance:
  ```
  sudo mkdir -p /var/www/html/scheduleboard
  sudo chown -R itoshu2:www-data /var/www/html/scheduleboard
  sudo chmod -R 2775 /var/www/html/scheduleboard
  ```

### Usage (developer task)

```bash
./deploy.sh
```

This performs: build → rsync (no sudo) → `sudo nginx -t` → `sudo nginx -s reload` (zero-downtime).

### Safety Rules (MUST READ)
- **Least privilege**: `sudo` is allowed **only** for `/usr/sbin/nginx`. No `systemctl`, no `restart`, no `stop`.
- **Always validate before reload**: deploy.sh runs `nginx -t` first. Never reload with syntax errors.
- **Never touch DB from deploy**: this script does not run migrations or alter MySQL.
- **No PM2/system restarts from deploy**: process management is separate and handled by admins.
- **No destructive rsync outside target**: rsync uses `--delete` but only within `/var/www/html/scheduleboard/`.
- **Config changes require admin review**: Nginx/conf edits must be reviewed; deploy just reloads.
- **Auditable**: All sudo operations are logged; any deviation is detectable.

### Troubleshooting
- 404 on assets: ensure Vite `base: '/shuke-b/'` and files exist under `/var/www/html/scheduleboard/`.
- 403/permission error: check ownership (itoshu2) and directory mode `2775`.
- `sudo: a password is required`: confirm sudoers entry is exactly:
  `itoshu2 ALL=(root) NOPASSWD: /usr/sbin/nginx`

### サブパスデプロイ設定
- **Vite base path**: `base: '/shuke-b/'` in `vite.config.ts` でサブパス配信に対応
- **SPA fallback**: `/shuke-b/*` ルートは Express が `index.html` にフォールバック

### エラーハンドリング
- **ErrorBoundary**: React コンポーネントがレンダリングエラーをキャッチし、黄色パネルで表示
- **Status banner**: ページ上部にヘルス/API状態を表示
- **API client**: `suke/src/lib/api.ts` で10秒タイムアウト、明確なエラーメッセージを提供

### バックエンド改善
- **Logging**: `morgan('combined')` で全HTTPリクエストをログ出力
- **Security**: `helmet()` でセキュリティヘッダーを追加（CSPは互換性のため無効化）
- **Compression**: `compression()` ミドルウェアでgzip圧縮を有効化
- **Cache headers**: 
  - 静的アセット (`/shuke-b/assets/*`): 30日間キャッシュ、immutable
  - `index.html`: no-cache で更新を確実に反映

## トラブルシューティング

### よくある問題と解決方法

#### 1. アセット404エラー
**症状**: CSS/JSファイルが読み込まれない

**解決策**:
- `suke/vite.config.ts` に `base: '/shuke-b/'` が設定されているか確認
- `/var/www/html/scheduleboard/` 配下にファイルが存在するか確認
- ビルドが正常に完了しているか確認: `npm run build`

#### 2. API 500エラー
**症状**: APIリクエストが500エラーを返す

**解決策**:
- サーバーログ（morgan）を確認
- データベース接続を確認: `DB_HOST`, `DB_USER`, `DB_PASS` が正しいか
- `/api/scheduleboard/health` エンドポイントでサーバー状態を確認

#### 3. 空白ページ
**症状**: ページが真っ白になる

**解決策**:
- ブラウザコンソールで ErrorBoundary メッセージを確認
- Network タブで API エラーを確認
- サーバーが起動しているか確認: `npm start` (server)

#### 4. ディープリンクが機能しない
**症状**: `/shuke-b/some-path` を直接開くと404になる

**解決策**:
- Express の SPA fallback が正しく設定されているか確認
- `server/server.js` で `app.get('*', ...)` が `index.html` を返すか確認

#### 5. WebSocket接続エラー
**症状**: リアルタイム更新が機能しない

**解決策**:
- Socket.IO のパス設定を確認: `/socket.io`
- Nginx の WebSocket プロキシ設定を確認
- ファイアウォールで WebSocket が許可されているか確認

#### 6. CORS エラー
**症状**: ブラウザコンソールに CORS エラーが表示される

**解決策**:
- サーバー側の CORS 設定を確認: `server/server.js` の `cors()` 設定
- 開発環境では `origin: '*'` を設定
- 本番環境では適切なオリジンを指定

#### 7. データベース接続エラー
**症状**: DB接続に失敗する

**解決策**:
- `.env` ファイルの設定を確認
- MySQL サーバーが起動しているか確認
- ネットワーク接続を確認（ファイアウォール、VPN等）
- データベースユーザーの権限を確認

### デバッグ方法

#### サーバーログの確認
```bash
# サーバーを起動してログを確認
cd server
npm start

# または開発モードで詳細ログを確認
NODE_ENV=development npm start
```

#### API接続テスト
```bash
# ヘルスチェック
curl http://localhost:3000/api/scheduleboard/health

# 部署一覧取得
curl http://localhost:3000/api/scheduleboard/groups
```

#### ブラウザ開発者ツール
- **Network タブ**: リクエスト/レスポンスを確認
- **Console タブ**: JavaScript エラーを確認
- **Application タブ**: ローカルストレージ、セッションストレージを確認

### 検証手順
1. `/shuke-b/` を開く - ステータスバナーにヘルス情報が表示される
2. エラーシミュレーション: 一時的にバックエンドを停止してエラー表示を確認
3. Network タブを確認: API 呼び出しに適切なエラーメッセージがあるか
4. `/shuke-b/any-deep-path` をリロード - 正しく表示されるか（SPA ルーティング）

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 開発情報

### 主要な技術選択理由
- **React + TypeScript**: 型安全性と開発効率の向上
- **Vite**: 高速な開発サーバーとビルド
- **TanStack Query**: 効率的なデータフェッチングとキャッシング
- **Socket.IO**: リアルタイム更新機能
- **Express.js**: シンプルで柔軟なバックエンドフレームワーク
- **MySQL**: リレーショナルデータベースでスケジュールデータを管理

### パフォーマンス最適化
- 静的アセットのキャッシング（30日間）
- gzip圧縮による転送量削減
- React Queryによる自動キャッシング
- コード分割と遅延読み込み

### セキュリティ
- Helmet.jsによるセキュリティヘッダー
- CORS設定による適切なアクセス制御
- SQLインジェクション対策（パラメータ化クエリ）
- 環境変数による機密情報の管理

## サポート

技術的な問題や機能要望については、GitHubのIssuesまでお問い合わせください。

- **リポジトリ**: [https://github.com/itoshu008/scheduleboard](https://github.com/itoshu008/scheduleboard)
- **Issues**: [https://github.com/itoshu008/scheduleboard/issues](https://github.com/itoshu008/scheduleboard/issues) 