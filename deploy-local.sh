#!/bin/bash
# ローカルデプロイスクリプト（sudoで実行）

set -e

echo "🚀 shuke-b ローカルデプロイ"

# shuke-b アプリをデプロイ
echo "📦 shuke-b を /var/www/html/shuke-b にデプロイ中..."
sudo mkdir -p /var/www/html/shuke-b
sudo rsync -av --delete suke/build/ /var/www/html/shuke-b/
sudo chown -R www-data:www-data /var/www/html/shuke-b
sudo chmod -R 755 /var/www/html/shuke-b

echo "✅ shuke-b デプロイ完了"
echo "🌐 URL: http://162.43.86.239/shuke-b/"
echo ""

# nginx設定の確認
echo "📝 nginx設定を確認中..."
if sudo grep -q "location /shuke-b" /etc/nginx/sites-available/default; then
    echo "✅ nginx設定が既に存在します"
else
    echo "⚠️  nginx設定が見つかりません"
    echo ""
    echo "以下を /etc/nginx/sites-available/default に追加してください:"
    echo ""
    cat nginx-shuke-b.conf
    echo ""
    echo "追加後、以下を実行:"
    echo "  sudo nginx -t"
    echo "  sudo systemctl reload nginx"
fi

