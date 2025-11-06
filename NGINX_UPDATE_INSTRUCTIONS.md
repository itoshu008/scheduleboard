# Nginx設定追加手順（管理者向け）

## ⚠️ 重要: 勤怠アプリに影響を与えない

この設定は **ScheduleBoard専用** です。
既存の `/api/` ロケーション（勤怠アプリ用）には**絶対に触れないでください**。

## 追加する設定

以下の設定を、`zatint1991.com` の `server {}` ブロック内に追加してください：

```nginx
# ScheduleBoard専用API (勤怠アプリとは完全に分離)
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
```

## 手順

1. nginx設定ファイルを開く:
```bash
sudo nano /etc/nginx/sites-available/default
# または
sudo nano /etc/nginx/conf.d/zatint1991.com.conf
```

2. `server_name zatint1991.com;` があるserverブロックを見つける

3. **既存の `/api/` ロケーションには触れず**、上記の設定を追加

4. 設定をテスト:
```bash
sudo nginx -t
```

5. エラーがなければリロード:
```bash
sudo systemctl reload nginx
```

## 確認

設定後、以下のコマンドで動作確認:

```bash
curl https://zatint1991.com/api/scheduleboard/health
# 期待する結果: {"ok":true,"service":"scheduleboard",...}

curl https://zatint1991.com/api/scheduleboard/admin/departments
# 期待する結果: JSON配列 []
```

## ⚠️ 絶対にやってはいけないこと

- ❌ 既存の `location /api/` ブロックを変更・削除
- ❌ 勤怠アプリ（kintai-backend）のポート8000への設定を変更
- ❌ `/api/` を `/api/scheduleboard/` にリダイレクト

## 設定の分離を確認

設定後、以下を確認してください：

```bash
sudo nginx -T | grep -A 5 "location /api"
```

以下の2つのブロックが表示されるはずです：
1. `location /api/` - 勤怠アプリ用（ポート8000）
2. `location /api/scheduleboard/` - ScheduleBoard用（ポート3000）

## トラブルシューティング

### 404エラーが出る
- nginx設定が正しく追加されているか確認
- `sudo nginx -t` でエラーがないか確認
- `sudo systemctl reload nginx` を実行

### 勤怠アプリが動かなくなった
- **すぐに既存の `/api/` 設定を復元**
- `/api/scheduleboard/` 設定のみを追加し、他には触れないでください

## 作成日
2025-11-06

