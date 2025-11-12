# Nginxキャッシュ無効化設定 - 緊急対応

## 問題
ブラウザが古いビルドファイル（`index-7019c4ed.js`）を読み込んでいます。
新しいビルドファイル（`index-996eac14.js`）はデプロイ済みですが、Nginxが`index.html`をキャッシュしています。

## 解決方法

### ステップ1: Nginx設定ファイルを編集

```bash
sudo nano /etc/nginx/sites-available/default
```

### ステップ2: `/scheduleboard/` locationブロックを以下のように更新

**現在の設定:**
```nginx
location ^~ /scheduleboard/ {
    alias /var/www/html/scheduleboard/;
    try_files $uri $uri/ /scheduleboard/index.html;
    add_header X-SB "hit" always;
}
```

**更新後の設定:**
```nginx
location ^~ /scheduleboard/ {
    alias /var/www/html/scheduleboard/;
    try_files $uri $uri/ /scheduleboard/index.html;
    add_header X-SB "hit" always;
    
    # index.html は常に最新を取得（キャッシュ無効化）
    location = /scheduleboard/index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate, max-age=0";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }
}
```

### ステップ3: 設定をテストしてリロード

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### ステップ4: 確認

```bash
curl -I https://zatint1991.com/scheduleboard/ | grep -i cache
```

`Cache-Control: no-cache, no-store, must-revalidate, max-age=0` が表示されれば成功です。

## 代替案: 一時的な対応

Nginx設定を変更できない場合、以下のコマンドでNginxのキャッシュをクリアできます：

```bash
# Nginxのキャッシュディレクトリをクリア（もしあれば）
sudo find /var/cache/nginx -type f -delete 2>/dev/null || true

# Nginxをリロード
sudo systemctl reload nginx
```

## ブラウザ側の対応

ユーザーは以下のいずれかでキャッシュをクリアしてください：

1. **ハードリロード**: `Ctrl+Shift+R` (Windows/Linux) または `Cmd+Shift+R` (Mac)
2. **開発者ツール**: F12 → Networkタブ → "Disable cache" にチェック → 再読み込み
3. **ブラウザのキャッシュを完全にクリア**


