# 🌐 デプロイ完了 - URL一覧

## ✅ デプロイ対象アプリケーション

### 1. shuke-b（スケジュール管理アプリ）

**デプロイコマンド**:
```bash
cd /home/itoshu2/apps/shuke-b/scheduleboard
./deploy-local.sh
```

**アクセスURL**:
- **HTTP**: http://162.43.86.239/shuke-b/
- **ドメイン**: http://zatint1991.com/shuke-b/ （DNS設定次第）

**配置先**: `/var/www/html/shuke-b/`

---

### 2. kintai-backend（勤怠管理バックエンド）

**デプロイコマンド**:
```bash
cd /home/itoshu2/apps/shuke-b/scheduleboard
./deploy-kintai-local.sh
```

**API エンドポイント**: 
- http://162.43.86.239/api/ （nginx経由）
- http://localhost:8000/ （直接アクセス）

**アプリディレクトリ**: `/home/itoshu/apps/kintai-backend`

**PM2管理**:
```bash
pm2 status
pm2 logs kintai-backend
pm2 restart kintai-backend
```

---

## 📋 デプロイ手順

### ステップ 1: shuke-b をデプロイ

```bash
cd /home/itoshu2/apps/shuke-b/scheduleboard
./deploy-local.sh
```

このスクリプトは以下を実行します：
1. ビルドファイルを `/var/www/html/shuke-b/` にコピー
2. 権限を設定（www-data:www-data）
3. nginx設定を確認

### ステップ 2: nginx設定を確認（初回のみ）

nginx設定に `/shuke-b` location が含まれているか確認：

```bash
sudo grep "location /shuke-b" /etc/nginx/sites-available/default
```

**設定がない場合**、以下を追加：

```bash
sudo nano /etc/nginx/sites-available/default
```

追加する内容（`nginx-shuke-b.conf` を参照）:

```nginx
    location /shuke-b {
        alias /var/www/html/shuke-b;
        try_files $uri $uri/ /shuke-b/index.html;
        
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
```

設定後、nginxをテスト&リロード：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### ステップ 3: kintai-backend をデプロイ

```bash
cd /home/itoshu2/apps/shuke-b/scheduleboard
./deploy-kintai-local.sh
```

このスクリプトは以下を実行します：
1. Git pull (main ブランチ)
2. npm ci（依存関係インストール）
3. npm run build（失敗は許容）
4. pm2 restart kintai-backend
5. pm2 save

---

## 🔍 動作確認

### shuke-b の確認

```bash
# ファイルの存在確認
ls -la /var/www/html/shuke-b/

# ブラウザでアクセス
# http://162.43.86.239/shuke-b/
```

### kintai-backend の確認

```bash
# PM2ステータス確認
pm2 status

# ログ確認
pm2 logs kintai-backend --lines 50

# API動作確認
curl http://localhost:8000/api/health
```

---

## 🌐 アクセスURL まとめ

| アプリ | URL | 備考 |
|--------|-----|------|
| **shuke-b** | http://162.43.86.239/shuke-b/ | メインアプリ |
| **shuke-b（ドメイン）** | http://zatint1991.com/shuke-b/ | DNS設定次第 |
| **kintai-backend API** | http://162.43.86.239/api/ | nginx経由 |
| **kintai-backend 直接** | http://localhost:8000/ | サーバー内のみ |

---

## 🔄 更新手順

アプリを更新する場合：

### shuke-b の更新

```bash
cd /home/itoshu2/apps/shuke-b/scheduleboard
npm run build  # または ./build.sh
./deploy-local.sh
```

### kintai-backend の更新

```bash
cd /home/itoshu2/apps/shuke-b/scheduleboard
./deploy-kintai-local.sh
```

---

## 📝 作成日

- 2025-11-04
- サーバー: 162.43.86.239 (prod-239)
- 作成者: AI Assistant

