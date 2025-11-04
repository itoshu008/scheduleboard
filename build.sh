#!/bin/bash
# shuke-b アプリケーション ビルドスクリプト

set -e  # エラーが発生したら即座に終了

echo "🚀 shuke-b ビルド開始..."

# カレントディレクトリを確認
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# suke ディレクトリに移動してビルド
echo "📦 フロントエンドをビルド中..."
cd suke

# Vite または react-scripts でビルド
if [ -f "node_modules/.bin/vite" ] && [ -x "node_modules/.bin/vite" ]; then
    echo "ℹ️ Using Vite build..."
    npm run build:vite
    BUILD_DIR="dist"
else
    echo "ℹ️ Using react-scripts build..."
    # PUBLIC_URL を設定して react-scripts build を実行
    PUBLIC_URL=/shuke-b npm run build
    BUILD_DIR="build"
fi

echo "✅ ビルド完了！"
echo "📍 成果物: suke/${BUILD_DIR}/"
echo ""
echo "次のステップ:"
echo "  1. サーバーにデプロイ: DEPLOY_USER=root DEPLOY_HOST=zatint1991.com ./deploy.sh"
echo "  2. 手動デプロイ: scp -r suke/${BUILD_DIR}/* user@server:/var/www/html/shuke-b/"

