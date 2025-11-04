#!/bin/bash
# kintai-backend ローカルデプロイスクリプト

set -e

echo "🚀 kintai-backend ローカルデプロイ"

APP_DIR="/home/itoshu/apps/kintai-backend"

if [ ! -d "$APP_DIR" ]; then
    echo "❌ アプリディレクトリが見つかりません: $APP_DIR"
    exit 1
fi

cd "$APP_DIR"

echo "📥 Git fetch..."
git fetch origin main

echo "🔄 Git reset..."
git reset --hard origin/main

echo "📌 Node.js v20 を使用..."
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 20

echo "📦 npm ci..."
npm ci

echo "🔨 npm run build..."
npm run build || echo "⚠️  ビルド失敗（続行）"

echo "🔄 PM2 restart..."
pm2 restart kintai-backend

echo "💾 PM2 save..."
pm2 save

echo "✅ kintai-backend デプロイ完了"
pm2 status

