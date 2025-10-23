# 本番環境と同じ条件でのローカル開発環境

## 🎯 開発環境の概要

**フロントエンド**: ローカル開発環境（http://localhost:3000）  
**バックエンド**: 本番サーバー（https://zatint1991.com）  
**利点**: 本番データとAPIを使用した開発・テスト

## 🔧 現在の設定

### プロキシ設定（`src/setupProxy.js`）
```javascript
module.exports = function (app) {
  app.use('/api', createProxyMiddleware({
    target: 'https://zatint1991.com',  // 本番APIサーバー
    changeOrigin: true,                // Host ヘッダー調整
    secure: true,                      // SSL証明書検証
    headers: { 
      Host: 'zatint1991.com',          // vhost設定
      'X-Forwarded-Proto': 'https',    // プロトコル転送
    },
  }));
};
```

### API設定（`src/lib/api.ts`）
```typescript
const api = axios.create({
  baseURL: '/api',        // プロキシ経由でアクセス
  timeout: 10000,         // 10秒タイムアウト
  withCredentials: true,  // 認証情報を含める
});
```

## 🚀 開発環境の起動

### 1. 依存関係のインストール
```bash
cd server/client
npm install
```

### 2. 開発サーバー起動
```bash
npm start
```

### 3. アクセス確認
- ブラウザで http://localhost:3000 にアクセス
- 右上の「🔧 接続テスト」ボタンで接続確認

## 🌐 接続フロー

```
ローカル開発環境                     本番サーバー
┌─────────────────┐                ┌─────────────────┐
│ React App       │                │ zatint1991.com  │
│ localhost:3000  │   /api/*       │ (本番API)       │
│                 │ ──────────────→│                 │
│ - UI開発        │   HTTPS        │ - 本番データ    │
│ - デバッグ      │ ←──────────────│ - 認証機能      │
│ - テスト        │   Response     │ - ビジネス      │
└─────────────────┘                │   ロジック      │
                                   └─────────────────┘
```

## 🛠️ 開発ワークフロー

### 1. 通常の開発作業
```bash
# フロントエンド開発
cd server/client
npm start

# コード編集
# → ホットリロードで即座に反映
# → 本番APIでデータ取得・更新
```

### 2. API接続確認
```bash
# ブラウザコンソールで実行
testBackendConnection()

# 期待される出力
✅ Health check successful
✅ Departments data: X items
✅ Employees data: Y items
...
```

### 3. デバッグ作業
- **Network タブ**: API リクエスト/レスポンス確認
- **Console タブ**: エラーメッセージとログ確認
- **接続テストボタン**: リアルタイム接続状況確認

## 🔍 トラブルシューティング

### よくある問題と解決策

#### 1. プロキシ接続エラー
**症状**: `curl http://localhost:3000/api/health` が失敗
**原因**: React Scripts サーバーの起動が完了していない
**解決策**: 
```bash
# サーバー完全起動まで待機（通常30-60秒）
# ブラウザで http://localhost:3000 を開いて確認
```

#### 2. CORS エラー
**症状**: ブラウザコンソールで CORS エラー
**原因**: 本番サーバーのCORS設定
**解決策**: 
- サーバー側で `localhost:3000` を許可
- または開発環境では `Access-Control-Allow-Origin: *`

#### 3. SSL証明書エラー
**症状**: SSL certificate エラー
**解決策**: 
```javascript
// 開発環境のみ証明書検証を無効化
secure: false  // setupProxy.js で設定
```

#### 4. 認証エラー
**症状**: 401 Unauthorized
**解決策**: 
- 本番環境の認証トークンを確認
- `withCredentials: true` の設定確認

## 📊 パフォーマンス最適化

### 開発環境での最適化
```javascript
// キャッシュ設定
api.defaults.headers.common['Cache-Control'] = 'no-cache';

// タイムアウト調整
api.defaults.timeout = 15000; // 本番接続用に延長
```

### ネットワーク最適化
```javascript
// リクエスト圧縮
api.defaults.headers.common['Accept-Encoding'] = 'gzip, deflate, br';

// 接続Keep-Alive
api.defaults.headers.common['Connection'] = 'keep-alive';
```

## 🎯 開発環境の利点

### ✅ 本番データでの開発
- 実際のデータ構造で開発
- 本番環境と同じAPIレスポンス
- 実際のパフォーマンス特性を体験

### ✅ 安全な開発
- フロントエンドのみローカル
- 本番データの直接操作なし
- バックエンドは安定した本番環境

### ✅ 効率的なデバッグ
- 本番バグの再現が容易
- 実際のユーザー環境に近い条件
- API仕様の確認が簡単

## 🔄 環境切り替え

### 本番環境への切り替え
```bash
# ビルド
npm run build

# 本番サーバーにデプロイ
# → 同じAPIサーバーを使用するため設定変更不要
```

### ローカルバックエンドへの切り替え（必要時）
```javascript
// setupProxy.js を変更
target: 'http://localhost:4001'
secure: false
```

## 📝 開発ガイドライン

### 1. データの取り扱い
- **本番データ**: 慎重に取り扱う
- **テストデータ**: 専用のテスト環境を推奨
- **機密情報**: ログに出力しない

### 2. API使用
- **READ操作**: 自由に実行可能
- **WRITE操作**: 慎重に実行
- **DELETE操作**: 特に注意が必要

### 3. エラーハンドリング
```typescript
try {
  const response = await api.get('/endpoint')
  // 成功処理
} catch (error) {
  if (error.response?.status === 401) {
    // 認証エラー処理
  } else if (error.response?.status >= 500) {
    // サーバーエラー処理
  } else {
    // その他のエラー処理
  }
}
```

## 🎉 現在の状態

- ✅ **フロントエンド**: React 18 + TypeScript + Zustand
- ✅ **バックエンド**: 本番サーバー（https://zatint1991.com）
- ✅ **プロキシ**: 正しく設定済み
- ✅ **接続テスト**: デバッグツール利用可能
- ✅ **開発体験**: ホットリロード + 本番API

**ブラウザで http://localhost:3000 にアクセスして、本番環境と同じ条件での開発をお楽しみください！** 🚀
