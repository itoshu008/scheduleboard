# Nginx設定追加手順

## 対象
`server_name zatint1991.com;` の server ブロック内に ScheduleBoard の location 設定を追加します。

## 追加する設定内容

```nginx
# === ScheduleBoard (/scheduleboard/) ===
location ^~ /scheduleboard/ {
    alias /var/www/html/scheduleboard/;              # ★末尾 / 必須（alias は特に重要）
    try_files $uri $uri/ /scheduleboard/index.html;  # ★SPA フォールバック
}
# （任意）旧パスからのリダイレクト
# location ^~ /shuke-b/ { return 301 /scheduleboard/; }
```

## 実行手順（管理者）

1. nginx設定ファイルを開く（通常は以下のいずれか）:
   ```bash
   sudo nano /etc/nginx/sites-available/default
   # または
   sudo nano /etc/nginx/sites-available/zatint1991.com
   # または
   sudo nano /etc/nginx/conf.d/zatint1991.com.conf
   ```

2. `server_name zatint1991.com;` がある server ブロック内に、上記の設定を追加

3. 設定をテスト:
   ```bash
   sudo nginx -t
   ```

4. エラーがなければ nginx をリロード:
   ```bash
   sudo systemctl reload nginx
   ```

## 確認方法

設定が正しく追加されたか確認:
```bash
sudo nginx -T | grep -A 5 "/scheduleboard/"
```

## 注意事項

- `alias` の末尾の `/` は必須です（`/var/www/html/scheduleboard/`）
- `try_files` の最後のフォールバックパス（`/scheduleboard/index.html`）も末尾の `/` なしで記述します
- 設定後は必ず `nginx -t` で構文チェックを実行してください

