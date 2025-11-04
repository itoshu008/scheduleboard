#!/bin/bash
# サーバー上で実行するデプロイスクリプト
# shuke-b-deploy.tar.gz をサーバーにアップロード後、このスクリプトを実行

set -e

echo "🚀 shuke-b サーバー側デプロイ"

# デプロイ先
DEPLOY_PATH="/var/www/html/shuke-b"

# アーカイブファイルの場所（必要に応じて変更）
ARCHIVE="$HOME/shuke-b-deploy.tar.gz"

if [ ! -f "$ARCHIVE" ]; then
    echo "❌ アーカイブが見つかりません: $ARCHIVE"
    echo "shuke-b-deploy.tar.gz をサーバーにアップロードしてください"
    exit 1
fi

echo "📦 アーカイブを展開中..."
mkdir -p "$DEPLOY_PATH"
cd "$DEPLOY_PATH"
tar -xzf "$ARCHIVE" --strip-components=1

echo "🔧 権限を設定中..."
chown -R www-data:www-data "$DEPLOY_PATH"
chmod -R 755 "$DEPLOY_PATH"

echo "✅ デプロイ完了！"
echo "🌐 アクセスURL: http://$(hostname -f)/shuke-b/"
echo ""
echo "次のステップ:"
echo "1. nginx設定を確認"
echo "2. nginx -t でテスト"
echo "3. systemctl reload nginx で反映"

