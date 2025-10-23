# バックエンド接続設定ガイド

## 🌐 外部サーバー接続: https://zatint1991.com

### 📋 現在の設定

**フロントエンド**: http://localhost:3000  
**バックエンド**: https://zatint1991.com  
**プロキシ**: `/api` → `https://zatint1991.com/api`

### 🔧 設定ファイル

#### 1. React Scripts プロキシ設定
**ファイル**: `src/setupProxy.js`
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

#### 2. Vite プロキシ設定（将来用）
**ファイル**: `vite.config.ts`
```typescript
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'https://zatint1991.com',
        changeOrigin: true,
        secure: false, // 開発用
        headers: {
          Host: 'zatint1991.com',
          'X-Forwarded-Proto': 'https',
        },
      },
    },
  },
});
```

### 🚀 使用方法

#### 1. アプリケーション起動
```bash
# フロントエンドディレクトリで
cd server/client
npm start
```

#### 2. 接続確認
- ブラウザで http://localhost:3000 にアクセス
- 右上の「🔧 接続テスト」ボタンをクリック
- ブラウザコンソールで接続状況を確認

#### 3. 期待される出力
```
🔧 Proxy Configuration Check:
   Frontend URL: http://localhost:3000
   API Base URL: /api
   Expected Backend: https://zatint1991.com
   Proxy Target: /api -> https://zatint1991.com/api

🔍 Backend Connection Test Starting...
1️⃣ Testing health endpoint...
✅ Health check successful: {message: "OK", ...}
2️⃣ Testing departments endpoint...
✅ Departments data: X items
...
```

### 🔍 トラブルシューティング

#### 接続エラーが発生する場合

**1. CORS エラー**
```
Access to XMLHttpRequest blocked by CORS policy
```
**解決策**: サーバー側でCORS設定を確認
- `Access-Control-Allow-Origin: http://localhost:3000` または `*`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

**2. SSL証明書エラー**
```
SSL certificate problem
```
**解決策**: 
- 開発環境では `secure: false` に設定
- 本番環境では有効な証明書を使用

**3. ネットワーク接続エラー**
```
Network Error / Connection refused
```
**解決策**:
- インターネット接続を確認
- ファイアウォール設定を確認
- サーバーの稼働状況を確認

#### デバッグ方法

**1. 直接API接続テスト**
```bash
curl https://zatint1991.com/api/health
```

**2. ブラウザ開発者ツール**
- Network タブでリクエスト/レスポンスを確認
- Console タブでエラーメッセージを確認

**3. プロキシログ確認**
- `logLevel: 'debug'` でプロキシの詳細ログを確認

### 📊 API エンドポイント

**利用可能なエンドポイント**:
- `GET /api/health` - ヘルスチェック
- `GET /api/departments` - 部署一覧
- `GET /api/employees` - 社員一覧
- `GET /api/equipment` - 設備一覧
- `GET /api/schedules` - スケジュール一覧
- `POST /api/schedules` - スケジュール作成
- `PUT /api/schedules/:id` - スケジュール更新
- `DELETE /api/schedules/:id` - スケジュール削除

### 🔄 環境切り替え

#### ローカル開発環境に切り替える場合
1. `src/setupProxy.js` の target を `http://localhost:4001` に変更
2. `secure: false` に設定
3. headers の Host を削除

#### 本番環境に切り替える場合
1. `src/setupProxy.js` の target を本番サーバーURLに変更
2. `secure: true` に設定
3. 適切なHostヘッダーを設定

### 💡 ベストプラクティス

1. **環境変数の活用**
   ```javascript
   target: process.env.REACT_APP_API_URL || 'https://zatint1991.com'
   ```

2. **エラーハンドリング**
   ```typescript
   try {
     const response = await api.get('/endpoint')
   } catch (error) {
     console.error('API Error:', error.response?.data || error.message)
   }
   ```

3. **接続状態の監視**
   - 定期的なヘルスチェック
   - 接続失敗時の自動リトライ
   - ユーザーへの適切なフィードバック

### 🎯 現在の状態

- ✅ プロキシ設定: https://zatint1991.com 用に設定済み
- ✅ 接続テストツール: 実装済み
- ✅ エラーハンドリング: 改善済み
- ✅ デバッグ機能: 利用可能

**ブラウザで http://localhost:3000 にアクセスして、「🔧 接続テスト」ボタンで接続状況を確認してください！**
