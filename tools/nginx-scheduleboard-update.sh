#!/bin/bash
# Nginx設定を更新して、index.htmlのキャッシュを無効化するスクリプト

set -e

NGINX_CONF="/etc/nginx/sites-available/default"
BACKUP_CONF="${NGINX_CONF}.backup.$(date +%Y%m%d_%H%M%S)"

echo "Nginx設定を更新します..."

# バックアップを作成
sudo cp "$NGINX_CONF" "$BACKUP_CONF"
echo "✅ バックアップ作成: $BACKUP_CONF"

# 既存のscheduleboard locationブロックを確認
if sudo grep -q "location.*scheduleboard" "$NGINX_CONF"; then
    echo "✅ scheduleboard locationブロックが見つかりました"
    
    # index.htmlのキャッシュ無効化設定を追加
    # 既存の設定の後に、index.html用のlocationブロックを追加
    sudo sed -i '/location.*scheduleboard/,/^[[:space:]]*}/ {
        /^[[:space:]]*}/ i\
    # index.html は常に最新を取得（キャッシュ無効化）\
    location = /scheduleboard/index.html {\
        add_header Cache-Control "no-cache, no-store, must-revalidate, max-age=0";\
        add_header Pragma "no-cache";\
        add_header Expires "0";\
    }
    }' "$NGINX_CONF"
    
    echo "✅ index.htmlのキャッシュ無効化設定を追加しました"
else
    echo "❌ scheduleboard locationブロックが見つかりませんでした"
    exit 1
fi

# 設定をテスト
if sudo nginx -t; then
    echo "✅ Nginx設定のテストに成功しました"
    sudo systemctl reload nginx
    echo "✅ Nginxをリロードしました"
else
    echo "❌ Nginx設定のテストに失敗しました。バックアップから復元してください:"
    echo "   sudo cp $BACKUP_CONF $NGINX_CONF"
    exit 1
fi

echo "✅ 完了しました！"




