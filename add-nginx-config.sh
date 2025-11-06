#!/bin/bash
# ScheduleBoard API プロキシ設定を追加するスクリプト
# 勤怠アプリには一切影響を与えません

echo "⚠️  このスクリプトは管理者権限が必要です"
echo "既存の /api/ 設定（勤怠アプリ用）には触れません"
echo ""
echo "追加する設定:"
echo "---"
cat << 'NGINX_CONF'

    # ScheduleBoard API (勤怠アプリとは完全に分離)
    location /api/scheduleboard/ {
        proxy_pass http://localhost:3000/api/scheduleboard/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

NGINX_CONF
echo "---"
echo ""
echo "この設定を /etc/nginx/sites-available/default の server {} ブロック内に追加します"
echo ""
read -p "続行しますか？ (y/N): " confirm

if [[ $confirm != [yY] && $confirm != [yY][eE][sS] ]]; then
    echo "キャンセルしました"
    exit 1
fi

echo ""
echo "📝 管理者として以下のコマンドを実行してください:"
echo ""
echo "sudo nano /etc/nginx/sites-available/default"
echo ""
echo "または自動で追加する場合:"
echo ""
echo "sudo sed -i '/server_name.*zatint1991.com/a\\n    # ScheduleBoard API (勤怠アプリとは完全に分離)\\n    location /api/scheduleboard/ {\\n        proxy_pass http://localhost:3000/api/scheduleboard/;\\n        proxy_http_version 1.1;\\n        proxy_set_header Upgrade \$http_upgrade;\\n        proxy_set_header Connection '"'"'upgrade'"'"';\\n        proxy_set_header Host \$host;\\n        proxy_set_header X-Real-IP \$remote_addr;\\n        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;\\n        proxy_set_header X-Forwarded-Proto \$scheme;\\n        proxy_cache_bypass \$http_upgrade;\\n    }' /etc/nginx/sites-available/default"
echo ""
echo "sudo nginx -t"
echo "sudo systemctl reload nginx"
echo ""
