# shuke-b アプリケーション - デプロイガイド

## 🎯 概要

shuke-b アプリケーションを `/shuke-b` パスでデプロイするための完全なガイドです。
**既存のアプリケーションには一切影響を与えません。**

## 📁 重要なファイル

| ファイル | 説明 |
|---------|------|
| `DEPLOYMENT_SUMMARY.md` | デプロイの概要と手順の詳細 |
| `CHECKLIST.md` | デプロイ作業のチェックリスト |
| `DEPLOY.md` | 詳細なデプロイ手順書 |
| `build.sh` | ビルドスクリプト（自動） |
| `deploy.sh` | デプロイスクリプト（自動） |
| `nginx-shuke-b.conf` | nginx設定テンプレート |

## 🚀 クイックスタート（3ステップ）

### 1. ビルド

```bash
cd /home/itoshu2/apps/shuke-b/scheduleboard
./build.sh
```

### 2. デプロイ

```bash
export DEPLOY_USER=root
export DEPLOY_HOST=zatint1991.com
./deploy.sh
```

### 3. nginx設定

```bash
# サーバーにログイン
ssh root@zatint1991.com

# nginx設定を編集（nginx-shuke-b.confの内容を追加）
sudo nano /etc/nginx/sites-available/default

# テストして反映
sudo nginx -t
sudo systemctl reload nginx
```

### 4. 確認

ブラウザで `http://zatint1991.com/shuke-b/` にアクセス

## ✅ 解決された問題点

- ✅ Vite/React Routerのベースパス設定（`/shuke-b`）
- ✅ API呼び出しパスの設定（`/api`）
- ✅ nginx設定（既存アプリに影響なし）
- ✅ ビルドとデプロイの自動化
- ✅ POST/PUT/DELETEリクエストの動作
- ✅ 静的ファイルのキャッシュ制御
- ✅ SPA routing の正常動作

## 📊 アクセスURL

- **アプリケーション**: `http://zatint1991.com/shuke-b/`
- **API**: `http://zatint1991.com/api/` （既存アプリと共有）

## 🔧 設定内容

### ビルド設定

- **ベースパス**: `/shuke-b/`
- **React Router basename**: `/shuke-b`
- **API baseURL**: `/api` （相対パス）

### デプロイ先

- **サーバー**: zatint1991.com
- **パス**: `/var/www/html/shuke-b/`
- **権限**: `www-data:www-data`, `755`

## 📖 詳細ドキュメント

すべての詳細は以下のドキュメントを参照してください：

1. **DEPLOYMENT_SUMMARY.md** - デプロイの全体像
2. **CHECKLIST.md** - チェックリスト形式の手順
3. **DEPLOY.md** - トラブルシューティング含む詳細手順

## 🆘 トラブルシューティング

### ページが表示されない

```bash
# ファイルの確認
ssh root@zatint1991.com "ls -la /var/www/html/shuke-b/"

# nginx エラーログ
ssh root@zatint1991.com "tail -f /var/log/nginx/error.log"
```

### APIが動作しない

```bash
# バックエンドの確認
ssh root@zatint1991.com "curl http://localhost:8000/api/health"
```

詳細は `DEPLOY.md` の「トラブルシューティング」セクションを参照してください。

## 🔄 更新手順

アプリを更新する場合：

```bash
./build.sh
./deploy.sh
```

nginx設定の変更は不要です。

## 📝 変更履歴

- **2025-11-04**: 初版作成
  - `/shuke-b` パスでのデプロイ設定完了
  - 既存アプリへの影響ゼロを確認
  - 自動ビルド・デプロイスクリプト作成

## 💡 ヒント

- ビルド前に `npm install` を実行
- デプロイ前に必ず `./build.sh` を実行
- nginx設定を変更したら必ず `nginx -t` でテスト
- 既存アプリの動作も確認すること

## ✨ 完了

すべての設定が完了し、デプロイ準備が整っています！
問題が発生した場合は、各ドキュメントを参照してください。

