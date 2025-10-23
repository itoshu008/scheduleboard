# 本番同等環境での開発ガイド

## 🎯 開発環境の概要

**目標**: フロントエンドをローカルで開発、バックエンドは本番サーバー（https://zatint1991.com）を使用

## 🚀 起動方法

### Option 1: Vite開発サーバー（推奨）
```bash
cd server/client
npm run dev
```
- **URL**: http://localhost:3001
- **プロキシ**: vite.config.ts で設定
- **特徴**: 高速ホットリロード

### Option 2: React Scripts開発サーバー
```bash
cd server/client  
npm start
```
- **URL**: http://localhost:3000
- **プロキシ**: setupProxy.js で設定
- **特徴**: 安定した動作

## 🔧 プロキシ設定

### Vite設定（`vite.config.ts`）
```typescript
server: {
  port: 3001,
  proxy: {
    '/api': {
      target: 'https://zatint1991.com',
      changeOrigin: true,
      secure: true,  // 本番HTTPS
      headers: {
        Host: 'zatint1991.com',
        'X-Forwarded-Proto': 'https',
      },
    },
  },
}
```

### React Scripts設定（`setupProxy.js`）
```javascript
module.exports = function (app) {
  app.use('/api', createProxyMiddleware({
    target: 'https://zatint1991.com',
    changeOrigin: true,
    secure: true,
    headers: { 
      Host: 'zatint1991.com',
      'X-Forwarded-Proto': 'https',
    },
  }));
};
```

## 🌐 接続フロー

```
開発環境                           本番サーバー
┌─────────────────┐               ┌─────────────────┐
│ Vite/React      │               │ zatint1991.com  │
│ localhost:3001  │    /api/*     │                 │
│ または          │ ────────────→ │ ✅ 部署: 7件    │
│ localhost:3000  │   HTTPS       │ ✅ 社員: 8件    │
│                 │ ←──────────── │ ✅ 設備: 4件    │
│ - ホットリロード │   JSON        │ ✅ スケジュール │
│ - デバッグ      │   データ      │    : 11件       │
└─────────────────┘               └─────────────────┘
```

## 🛠️ 開発ワークフロー

### 1. 環境起動
```bash
# Step 1: 開発サーバー起動
npm run dev  # または npm start

# Step 2: ブラウザアクセス
# http://localhost:3001 (Vite)
# または
# http://localhost:3000 (React Scripts)

# Step 3: 接続確認
# 右上の「🔧 接続テスト」ボタンをクリック
```

### 2. 開発作業
```bash
# コード編集
# → 自動ホットリロード
# → 本番APIからデータ取得
# → リアルタイムデバッグ
```

### 3. 接続テスト
```bash
# 本番サーバー直接テスト
node test-connection.js

# 期待される出力
✅ 直接接続成功: {message: 'OK'}
✅ /api/departments: 7 items
✅ /api/employees: 8 items
✅ /api/equipment: 4 items
✅ /api/schedules: 11 items
```

## 🔍 トラブルシューティング

### 問題: localhost:3001 に接続できない
**原因**: Viteサーバーの起動待ち
**解決策**: 
```bash
# サーバー状況確認
netstat -an | findstr :3001

# 再起動
npm run dev
```

### 問題: プロキシが動作しない
**原因**: 設定ファイルの読み込み問題
**解決策**:
```bash
# 設定確認
cat vite.config.ts
cat src/setupProxy.js

# キャッシュクリア
npm start -- --reset-cache
```

### 問題: CORS エラー
**原因**: 本番サーバーのCORS設定
**解決策**: 
- 本番サーバーで `localhost:3001` を許可
- または開発環境用の設定調整

## 📊 現在の技術スタック

### フロントエンド（ローカル開発）
- **React 18.2.0** + **TypeScript 4.7.4**
- **Vite** または **React Scripts**
- **Zustand 5.0.8**（状態管理）
- **カスタムフック**（パフォーマンス最適化）

### バックエンド（本番サーバー）
- **https://zatint1991.com**
- **Express.js** API
- **本番データベース**
- **HTTPS/SSL対応**

## 🎯 開発の利点

### ✅ 本番同等環境
- 実際のデータ構造
- 本番APIのレスポンス
- 実際のパフォーマンス特性

### ✅ 効率的な開発
- ホットリロード対応
- 即座のコード反映
- リアルタイムデバッグ

### ✅ 安全性
- フロントエンドのみローカル
- 本番データの直接操作なし
- 安定したバックエンド

## 🎉 完成状態

**現在の環境**:
- ✅ **本番サーバー接続**: https://zatint1991.com（7部署、8社員、4設備、11スケジュール）
- ✅ **プロキシ設定**: Vite + React Scripts 両対応
- ✅ **接続テスト**: 自動テストツール実装
- ✅ **React現代化**: カスタムフック + Zustand + 最適化
- ✅ **デバッグ機能**: リアルタイム接続監視

## 🚀 次のステップ

1. **ブラウザアクセス**: http://localhost:3001 または http://localhost:3000
2. **接続確認**: 右上の「🔧 接続テスト」ボタン
3. **開発開始**: 本番データを使用した効率的な開発

**本番環境と同じ条件での開発環境が完成しました！効率的な開発をお楽しみください！** 🎉
