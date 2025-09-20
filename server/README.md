# スケジュール管理システム

社員向けのスケジュール管理アプリケーションです。PC、タブレット、スマートフォンで利用可能です。

## 機能概要

### 主要ページ
1. **月別ページ** - 社員別の月間スケジュール表示・編集
2. **日別ページ** - 部署単位での日別スケジュール表示
3. **全社員ページ** - 全社員の日別スケジュール表示（社員番号順）
4. **設備予約ページ** - 設備の月間予約状況表示・管理

### 基本機能
- **スケジュール管理**
  - 15分刻みのタイムスロットでスケジュール登録
  - 36色からカラー選択
  - ドラッグ&ドロップでの移動・リサイズ
  - コピー&ペースト機能
  - ダブルクリックでの編集・削除

- **組織管理**
  - 部署登録・編集・削除・並び替え
  - 社員登録・編集・削除（部署所属）
  - 設備登録・編集・削除・並び替え

- **カレンダー機能**
  - 平日（黒）、土曜（青）、日祝（赤）の色分け
  - 祝日名の表示
  - 日本語での日付表示

## 技術仕様

### フロントエンド
- **React 18** + **TypeScript**
- **React Router** - ページルーティング
- **Axios** - HTTP通信
- **CSS Modules** - スタイリング
- **date-fns** - 日付処理

### バックエンド
- **Node.js** + **Express**
- **TypeScript**
- **MySQL** - データベース
- **CORS** - クロスオリジン対応

### データベース
- **MySQL 8.0+**
- IPアドレス: `210.131.208.22`

## セットアップ手順

### 1. 前提条件
- Node.js 18.0+
- MySQL 8.0+
- Git

### 2. プロジェクトクローン
```bash
git clone <repository-url>
cd schedule-management-app
```

### 3. 依存関係インストール
```bash
npm run install-all
```

### 4. データベースセットアップ
```bash
# MySQLにログイン
mysql -h 210.131.208.22 -u <username> -p

# スキーマ実行
source server/database/schema.sql
```

### 5. 環境変数設定
```bash
# server/.env ファイルを作成
cp server/.env.example server/.env

# 以下の内容を設定
DB_HOST=210.131.208.22
DB_USER=<your_db_username>
DB_PASSWORD=<your_db_password>
DB_NAME=schedule_management
DB_PORT=3306
PORT=5000
NODE_ENV=development
JWT_SECRET=your_jwt_secret_key
```

### 6. アプリケーション起動
```bash
# 開発サーバー起動（フロントエンド + バックエンド）
npm run dev

# または個別起動
npm run server  # バックエンドのみ
npm run client  # フロントエンドのみ
```

### 7. アクセス
- **フロントエンド**: http://localhost:3000
- **バックエンドAPI**: http://localhost:3000

## プロジェクト構造

```
schedule-management-app/
├── client/                 # Reactフロントエンド
│   ├── public/
│   ├── src/
│   │   ├── components/     # UIコンポーネント
│   │   ├── types/          # TypeScript型定義
│   │   ├── utils/          # ユーティリティ関数
│   │   └── App.tsx         # メインアプリケーション
│   └── package.json
├── server/                 # Node.jsバックエンド
│   ├── src/
│   │   ├── database/       # DB接続設定
│   │   ├── models/         # データモデル
│   │   ├── routes/         # APIルート
│   │   └── index.ts        # サーバーエントリーポイント
│   ├── database/
│   │   └── schema.sql      # データベーススキーマ
│   └── package.json
└── package.json            # ルートパッケージ
```

## API エンドポイント

### 部署管理
- `GET /api/departments` - 全部署取得
- `POST /api/departments` - 部署作成
- `PUT /api/departments/:id` - 部署更新
- `DELETE /api/departments/:id` - 部署削除

### 社員管理
- `GET /api/employees` - 全社員取得
- `POST /api/employees` - 社員作成
- `PUT /api/employees/:id` - 社員更新
- `DELETE /api/employees/:id` - 社員削除

### スケジュール管理
- `GET /api/schedules` - スケジュール検索
- `GET /api/schedules/monthly/:employeeId/:year/:month` - 月別スケジュール
- `GET /api/schedules/daily/department/:departmentId/:date` - 部署別日別
- `GET /api/schedules/daily/all/:date` - 全社員日別
- `POST /api/schedules` - スケジュール作成
- `PUT /api/schedules/:id` - スケジュール更新
- `DELETE /api/schedules/:id` - スケジュール削除

### 設備管理
- `GET /api/equipment` - 全設備取得
- `POST /api/equipment` - 設備作成
- `PUT /api/equipment/:id` - 設備更新
- `DELETE /api/equipment/:id` - 設備削除

### 設備予約管理
- `GET /api/equipment-reservations` - 設備予約検索
- `GET /api/equipment-reservations/monthly/:equipmentId/:year/:month` - 月別予約
- `POST /api/equipment-reservations` - 予約作成
- `PUT /api/equipment-reservations/:id` - 予約更新
- `DELETE /api/equipment-reservations/:id` - 予約削除

## 開発状況

### 完成済み機能 ✅
- プロジェクト基本構造
- データベーススキーマ
- 全APIエンドポイント
- 基本UI構造
- 月別スケジュールページ（基本実装）
- スケジュール登録・編集機能
- レスポンシブデザイン

### 今後の実装予定 🚧
- ドラッグ&ドロップ操作
- コピー&ペースト機能
- テンプレート機能
- 日別・全社員ページのグリッド表示
- 設備予約のフル機能
- ユーザー管理のCRUD機能
- 検索・フィルタ機能
- データエクスポート機能

## ライセンス

このプロジェクトは非商用利用のみ許可されています。

## サポート

不具合報告や機能要望は、プロジェクトの Issues にてお願いします。