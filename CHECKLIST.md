# ✅ shuke-b デプロイチェックリスト

このチェックリストを使用して、デプロイ作業を確実に完了させてください。

## 📦 デプロイ前の準備

### ローカル環境

- [ ] ソースコードが最新版に更新されている
- [ ] 依存関係がインストールされている (`npm install`)
- [ ] ビルドスクリプトに実行権限がある (`chmod +x build.sh deploy.sh`)

### サーバー環境

- [ ] サーバーへのSSHアクセスが可能
- [ ] バックエンドサーバーがポート8000で稼働中
- [ ] `/var/www/html/` に書き込み権限がある

## 🔨 ビルド

### ビルド実行

```bash
cd /home/itoshu2/apps/shuke-b/scheduleboard
./build.sh
```

### ビルド成果物の確認

- [ ] `suke/build/` ディレクトリが存在する
- [ ] `suke/build/index.html` が存在する
- [ ] `suke/build/static/js/` にJSファイルがある
- [ ] `suke/build/static/css/` にCSSファイルがある

### ビルド内容の確認

```bash
head -20 suke/build/index.html | grep "/shuke-b/"
```

- [ ] index.html に `/shuke-b/` パスが含まれている
- [ ] JS/CSSファイルのパスが `/shuke-b/static/` で始まっている

## 🚀 デプロイ

### デプロイ実行

```bash
export DEPLOY_USER=root
export DEPLOY_HOST=zatint1991.com
export DEPLOY_PATH=/var/www/html/shuke-b
./deploy.sh
```

### デプロイ確認

- [ ] デプロイスクリプトがエラーなく完了した
- [ ] ファイル転送が成功した

### サーバー側の確認

```bash
ssh root@zatint1991.com "ls -la /var/www/html/shuke-b/"
```

- [ ] `/var/www/html/shuke-b/index.html` が存在する
- [ ] ファイルの所有者が `www-data:www-data` である
- [ ] ファイルのパーミッションが `755` である

## 🔧 nginx設定

### 設定ファイルの確認

```bash
cat nginx-shuke-b.conf
```

- [ ] nginx-shuke-b.conf の内容を確認した

### nginx設定の更新

```bash
ssh root@zatint1991.com
sudo nano /etc/nginx/sites-available/default
```

- [ ] `/shuke-b` location ブロックを追加した
- [ ] `/api/` location が存在する（既存または新規追加）
- [ ] 既存の設定を変更していない

### nginx設定のテスト

```bash
sudo nginx -t
```

- [ ] nginx設定テストが成功した (`test is successful`)

### nginx再読み込み

```bash
sudo systemctl reload nginx
```

- [ ] nginx再読み込みが成功した
- [ ] エラーメッセージが表示されていない

## ✅ 動作確認

### 基本アクセス確認

- [ ] ブラウザで `http://zatint1991.com/shuke-b/` にアクセスできる
- [ ] アプリケーションが表示される
- [ ] JavaScriptエラーが発生していない（F12開発者ツールで確認）

### ページ遷移確認

- [ ] スケジュール表示ページが動作する
- [ ] 管理画面が動作する
- [ ] ページ遷移が正常に動作する

### API動作確認

- [ ] データが読み込まれる（部署、社員、設備、スケジュール）
- [ ] データの作成ができる
- [ ] データの更新ができる
- [ ] データの削除ができる

### ブラウザコンソール確認

- [ ] エラーメッセージがない
- [ ] 404エラーがない
- [ ] CORS エラーがない

## 🔍 既存アプリへの影響確認

### 既存アプリの動作確認

- [ ] `http://zatint1991.com/` で既存アプリが表示される
- [ ] 既存アプリが正常に動作する
- [ ] 既存アプリのAPIが正常に動作する

### nginx設定の確認

```bash
ssh root@zatint1991.com "sudo nginx -T" | grep "location /"
```

- [ ] ルートパス `/` の設定が残っている
- [ ] `/shuke-b` と `/` が共存している

## 🧪 追加テスト

### 静的ファイルのキャッシュ確認

```bash
curl -I http://zatint1991.com/shuke-b/static/js/main.*.js
```

- [ ] `Cache-Control` ヘッダーが設定されている

### エラーページの確認

- [ ] 存在しないパス `/shuke-b/nonexistent` でも index.html が返される（SPA動作）
- [ ] 404ページがアプリ内で表示される

## 📊 最終確認

### ディレクトリ構造

```bash
ssh root@zatint1991.com "tree -L 2 /var/www/html/shuke-b/"
```

- [ ] ディレクトリ構造が正しい

### ログの確認

```bash
ssh root@zatint1991.com "tail -100 /var/log/nginx/error.log"
```

- [ ] nginx エラーログに異常がない

### パフォーマンス確認

- [ ] ページの読み込み速度が許容範囲内
- [ ] アセットファイルが正しく圧縮されている

## 🎯 完了

すべてのチェック項目が完了したら、デプロイ成功です！

### 最終報告

- デプロイ完了日時: __________________
- デプロイ担当者: __________________
- 確認者: __________________

### 問題が発生した場合

1. `DEPLOY.md` を参照
2. エラーログを確認
3. 設定を見直し

---

**次回のデプロイ時も、このチェックリストを使用してください。**

