#!/bin/bash
# 手動デプロイ用スクリプト（パスワード入力対応）

set -e

echo "🚀 shuke-b 手動デプロイ"
echo ""

# デプロイ先の設定
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_HOST="${DEPLOY_HOST:-zatint1991.com}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/html/shuke-b}"

# ビルドディレクトリを確認
if [ -d "suke/dist" ]; then
    BUILD_DIR="suke/dist"
elif [ -d "suke/build" ]; then
    BUILD_DIR="suke/build"
else
    echo "❌ ビルドが見つかりません"
    exit 1
fi

echo "📍 使用するビルド: ${BUILD_DIR}"
echo "📍 デプロイ先: ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"
echo ""

# ステップ1: サーバーにディレクトリを作成
echo "ステップ1: サーバーにディレクトリを作成"
ssh ${DEPLOY_USER}@${DEPLOY_HOST} "mkdir -p ${DEPLOY_PATH}"

# ステップ2: ファイルを転送
echo "ステップ2: ファイルを転送中..."
rsync -avz --delete \
    --exclude='*.map' \
    ${BUILD_DIR}/ \
    ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/

# ステップ3: 権限を設定
echo "ステップ3: 権限を設定中..."
ssh ${DEPLOY_USER}@${DEPLOY_HOST} "chown -R www-data:www-data ${DEPLOY_PATH} && chmod -R 755 ${DEPLOY_PATH}"

echo ""
echo "✅ デプロイ完了！"
echo "🌐 アクセスURL: http://${DEPLOY_HOST}/shuke-b/"

