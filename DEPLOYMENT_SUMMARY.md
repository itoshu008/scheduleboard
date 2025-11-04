# 🎉 shuke-b アプリケーション デプロイ概要

## ✅ 完了した作業

すべての問題を解決し、デプロイ準備が完了しました！

### 1. 設定ファイルの更新

#### ✅ Vite設定 (`vite.config.ts`)
- `base: '/shuke-b/'` を追加
- ビルド時に正しいベースパスでアセットが生成されます

#### ✅ React Router設定 (`App.tsx`)
- `basename="/shuke-b"` を追加
- アプリ内のルーティングが `/shuke-b` パスで正常に動作します

#### ✅ API設定 (`api.ts`)
- `baseURL: "/api"` (相対パス)
- `/shuke-b` パスからでも正しく `/api` にアクセスできます

### 2. nginx設定

#### ✅ 既存アプリに影響なし
- `/shuke-b` パスのみを追加
- `/api/` は既存の設定をそのまま使用（共有）
- ルートパス `/` は既存アプリ用に残されています

**設定ファイル**: `nginx-shuke-b.conf`

### 3. ビルドとデプロイスクリプト

#### ✅ `build.sh`
- 自動でビルド（react-scripts または Vite）
- 成果物を `suke/build/` または `suke/dist/` に生成

#### ✅ `deploy.sh`
- SSH経由で自動デプロイ
- rsync でファイルを転送
- 権限を自動設定

### 4. ドキュメント

- ✅ **DEPLOY.md**: 詳細なデプロイ手順
- ✅ **nginx-shuke-b.conf**: nginx設定テンプレート
- ✅ **build.sh**: ビルドスクリプト
- ✅ **deploy.sh**: デプロイスクリプト

## 🚀 デプロイ手順（クイックガイド）

### ステップ 1: ビルド

```bash
cd /home/itoshu2/apps/shuke-b/scheduleboard
./build.sh
```

**確認事項**:
- ✅ `suke/build/` ディレクトリが作成される
- ✅ `index.html` に `/shuke-b/` パスが含まれる
- ✅ JS/CSS ファイルが生成される

### ステップ 2: デプロイ

```bash
# 環境変数を設定
export DEPLOY_USER=root
export DEPLOY_HOST=zatint1991.com
export DEPLOY_PATH=/var/www/html/shuke-b

# デプロイ実行
./deploy.sh
```

**確認事項**:
- ✅ ファイルがサーバーに転送される
- ✅ 権限が `www-data:www-data` に設定される
- ✅ `/var/www/html/shuke-b/` にファイルが配置される

### ステップ 3: nginx設定

```bash
# サーバーにログイン
ssh root@zatint1991.com

# nginx設定を編集
sudo nano /etc/nginx/sites-available/default
```

**nginx-shuke-b.conf の内容を追加**:

```nginx
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

**nginx設定をテストして反映**:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### ステップ 4: 動作確認

1. ブラウザで `http://zatint1991.com/shuke-b/` にアクセス
2. アプリケーションが表示されることを確認
3. データが正常に読み込まれることを確認

## 📊 ディレクトリ構成

```
/var/www/html/
├── shuke-b/              ← 新規追加（既存アプリに影響なし）
│   ├── index.html
│   ├── static/
│   │   ├── js/
│   │   │   └── main.*.js
│   │   └── css/
│   │       └── main.*.css
│   └── (アイコン等)
└── (既存のファイル)       ← そのまま残る
```

## 🔍 トラブルシューティング

### 問題: ページが表示されない

```bash
# ファイルの存在確認
ssh root@zatint1991.com "ls -la /var/www/html/shuke-b/"

# nginx エラーログ確認
ssh root@zatint1991.com "tail -f /var/log/nginx/error.log"
```

### 問題: APIが動作しない

```bash
# バックエンドサーバーの確認
ssh root@zatint1991.com "curl http://localhost:8000/api/health"

# プロキシ設定の確認
ssh root@zatint1991.com "sudo nginx -T | grep -A 10 'location /api'"
```

### 問題: 静的ファイルが404

- nginx の `alias` パスを確認
- `try_files` 設定を確認
- ファイル権限を確認: `chmod -R 755 /var/www/html/shuke-b`

## 🔄 更新手順

アプリケーションを更新する場合:

```bash
cd /home/itoshu2/apps/shuke-b/scheduleboard
./build.sh
./deploy.sh
```

nginx設定の変更は不要です。

## 🎯 重要な確認事項

### ✅ 既存アプリへの影響確認

1. 既存アプリが `http://zatint1991.com/` で正常に動作するか
2. 既存アプリのAPIが `/api` で正常に動作するか
3. nginx の他の設定に影響がないか

### ✅ shuke-b アプリの動作確認

1. `http://zatint1991.com/shuke-b/` でアクセス可能
2. ページ遷移が正常に動作
3. API呼び出しが正常に動作
4. データの取得・更新・削除が正常に動作

## 📝 ビルド結果

**ビルド日時**: 2025-11-04  
**ビルド方法**: react-scripts build  
**ベースパス**: `/shuke-b/`  
**ビルドサイズ**: 
- JS: 118.85 kB (gzip圧縮後)
- CSS: 18.7 kB (gzip圧縮後)

## 🔒 セキュリティ

- ✅ ファイル権限: `www-data:www-data`, `755`
- ✅ 静的ファイルのみ配信（セキュリティリスク最小）
- ✅ APIは既存の認証・認可システムを使用
- 🔔 本番環境では必ず HTTPS を使用してください

## 📞 サポート情報

**ログファイル**:
- nginx: `/var/log/nginx/error.log`, `/var/log/nginx/access.log`
- バックエンド: アプリケーション固有のログファイル

**設定ファイル**:
- nginx: `/etc/nginx/sites-available/default`
- アプリ: `/var/www/html/shuke-b/`

## ✨ まとめ

すべての設定が完了し、デプロイ準備が整いました！

**次のステップ**:
1. `./build.sh` でビルド
2. `./deploy.sh` でデプロイ
3. nginx設定を更新
4. ブラウザで動作確認

**既存アプリへの影響**: ゼロ（完全に独立）

問題が発生した場合は、`DEPLOY.md` を参照してください。

