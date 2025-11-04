# shuke-b アプリケーション デプロイ手順書

## 📋 概要

このドキュメントは、shuke-b アプリケーションを `/shuke-b` パスでデプロイする手順を説明します。
**既存のアプリケーションには一切影響しません**。

## 🎯 デプロイ後のアクセスURL

- **アプリケーション**: `http://your-domain.com/shuke-b/`
- **API**: `http://your-domain.com/api/` (既存アプリと共有)

## 📦 前提条件

- Node.js と npm がインストール済み
- サーバーへのSSHアクセス権限
- nginx がインストール済み
- バックエンドサーバーがポート 8000 で稼働中

## 🚀 デプロイ手順

### ステップ 1: ローカルでビルド

```bash
cd /home/itoshu2/apps/shuke-b/scheduleboard
./build.sh
```

このスクリプトは以下を実行します：
- `suke/` ディレクトリで `npm run build:vite` を実行
- ビルド成果物を `suke/dist/` に生成

### ステップ 2: デプロイ

#### 方法A: 自動デプロイスクリプト使用（推奨）

```bash
# 環境変数を設定（必要に応じて）
export DEPLOY_USER=root
export DEPLOY_HOST=zatint1991.com
export DEPLOY_PATH=/var/www/html/shuke-b

# デプロイ実行
./deploy.sh
```

#### 方法B: 手動デプロイ

```bash
# サーバーにディレクトリを作成
ssh user@your-server "mkdir -p /var/www/html/shuke-b"

# ファイルを転送
scp -r suke/dist/* user@your-server:/var/www/html/shuke-b/

# 権限を設定
ssh user@your-server "chown -R www-data:www-data /var/www/html/shuke-b"
ssh user@your-server "chmod -R 755 /var/www/html/shuke-b"
```

### ステップ 3: nginx設定

#### 3-1. 設定ファイルを確認

```bash
# ローカルの nginx 設定を確認
cat nginx-shuke-b.conf
```

#### 3-2. サーバーの nginx 設定を編集

**重要**: 既存のアプリに影響しないよう、慎重に追加してください。

```bash
# サーバーにログイン
ssh user@your-server

# nginx 設定ファイルを編集
sudo nano /etc/nginx/sites-available/default
```

**追加する内容** (`nginx-shuke-b.conf` の内容を参考に):

```nginx
# 既存の server { ... } ブロック内に以下を追加:

    # shuke-b アプリケーション用のパス
    location /shuke-b {
        alias /var/www/html/shuke-b;
        try_files $uri $uri/ /shuke-b/index.html;
        
        # キャッシュ制御
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
```

**注意**: `/api/` の設定が既にある場合は、そのまま使用してください。なければ `nginx-shuke-b.conf` を参照して追加してください。

#### 3-3. nginx 設定をテスト

```bash
sudo nginx -t
```

#### 3-4. nginx をリロード

```bash
sudo systemctl reload nginx
```

### ステップ 4: 動作確認

1. ブラウザで `http://your-domain.com/shuke-b/` にアクセス
2. アプリケーションが正常に表示されることを確認
3. データの読み込みが正常に動作することを確認

#### トラブルシューティング

**問題: ページが表示されない**
```bash
# ファイルが正しく配置されているか確認
ls -la /var/www/html/shuke-b/

# nginx エラーログを確認
sudo tail -f /var/nginx/error.log
```

**問題: APIが動作しない**
```bash
# バックエンドサーバーが稼働しているか確認
curl http://localhost:8000/api/health

# nginx のプロキシ設定を確認
sudo nginx -T | grep -A 10 "location /api"
```

**問題: 404 エラー**
- nginx の `try_files` 設定を確認
- `alias` パスが正しいか確認

## 🔄 更新手順

アプリケーションを更新する場合：

```bash
# ローカルで
cd /home/itoshu2/apps/shuke-b/scheduleboard
./build.sh
./deploy.sh
```

nginx 設定の変更は不要です（静的ファイルのみが更新されます）。

## 🔒 セキュリティ考慮事項

1. **ファイル権限**: `www-data` ユーザーで実行
2. **HTTPS**: 本番環境では必ず HTTPS を使用してください
3. **API アクセス**: 必要に応じて API にアクセス制限を追加

## 📊 ディレクトリ構成

```
/var/www/html/
├── shuke-b/              ← 新規追加（既存アプリに影響なし）
│   ├── index.html
│   ├── assets/
│   │   ├── index-*.js
│   │   └── index-*.css
│   └── ...
└── (既存のファイル)       ← そのまま残る
```

## 🆘 サポート

問題が発生した場合：

1. nginx エラーログを確認: `sudo tail -f /var/log/nginx/error.log`
2. バックエンドログを確認: アプリケーションのログファイル
3. ブラウザの開発者ツールでネットワークタブを確認

## 📝 変更履歴

- 2025-11-04: 初版作成

