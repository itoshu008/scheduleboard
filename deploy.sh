#!/bin/bash
# shuke-b アプリケーション デプロイスクリプト

set -e  # エラーが発生したら即座に終了

echo "🚀 shuke-b デプロイ開始..."

# カレントディレクトリを確認
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# デプロイ先の設定（環境に応じて変更してください）
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_HOST="${DEPLOY_HOST:-zatint1991.com}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/html/shuke-b}"

echo "📦 ビルドを確認中..."
# dist または build ディレクトリを探す
if [ -d "suke/dist" ]; then
    BUILD_DIR="suke/dist"
elif [ -d "suke/build" ]; then
    BUILD_DIR="suke/build"
else
    echo "❌ ビルドが見つかりません。先にビルドを実行してください:"
    echo "   ./build.sh"
    exit 1
fi
echo "📍 使用するビルド: ${BUILD_DIR}"

echo "🔍 デプロイ先情報:"
echo "  ホスト: $DEPLOY_HOST"
echo "  ユーザー: $DEPLOY_USER"
echo "  パス: $DEPLOY_PATH"
echo ""

# 確認
read -p "デプロイを実行しますか？ (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ デプロイをキャンセルしました"
    exit 1
fi

echo "📤 ファイルを転送中..."

# デプロイ先ディレクトリを作成（存在しない場合）
ssh "${DEPLOY_USER}@${DEPLOY_HOST}" "mkdir -p ${DEPLOY_PATH}"

# ファイルを転送
rsync -avz --delete \
    --exclude='*.map' \
    ${BUILD_DIR}/ \
    "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/"

echo "🔧 権限を設定中..."
ssh "${DEPLOY_USER}@${DEPLOY_HOST}" "chown -R www-data:www-data ${DEPLOY_PATH}"
ssh "${DEPLOY_USER}@${DEPLOY_HOST}" "chmod -R 755 ${DEPLOY_PATH}"

echo "✅ デプロイ完了！"
echo "🌐 アクセスURL: http://${DEPLOY_HOST}/shuke-b/"
echo ""
echo "📝 nginx設定を確認してください:"
echo "   1. shuke.txt の内容を /etc/nginx/sites-available/default にマージ"
echo "   2. nginx -t で設定をテスト"
echo "   3. systemctl reload nginx で反映"

