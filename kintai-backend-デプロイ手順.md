# kintai-backend デプロイ設定と手順

## 📋 サーバー情報

- **サーバー名**: prod-239
- **Host**: 162.43.86.239
- **Port**: 22
- **User**: itoshu
- **認証**: Private key (`C:\Users\itosh\.ssh\id_ed25519`)
- **アプリディレクトリ**: `/home/itoshu/apps/kintai-backend`
- **ブランチ**: main
- **Node.js**: v20 (nvm)
- **PM2アプリ名**: kintai-backend

## 🔧 準備手順

### ステップ 1: SSH秘密鍵のセットアップ

#### 方法A: 自動セットアップ

```bash
cd /home/itoshu2/apps/shuke-b/scheduleboard
./setup-ssh-key.sh
```

#### 方法B: 手動セットアップ

1. SSH ディレクトリを作成

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
```

2. Windows側の秘密鍵をコピー

```bash
# ユーザー名が "itosh" の場合
cp /mnt/c/Users/itosh/.ssh/id_ed25519 ~/.ssh/

# または、実際のユーザー名を確認して
ls /mnt/c/Users/
# 正しいパスでコピー
cp /mnt/c/Users/YOUR_USERNAME/.ssh/id_ed25519 ~/.ssh/
```

3. 権限を設定

```bash
chmod 600 ~/.ssh/id_ed25519
```

4. SSH config を設定

```bash
cat >> ~/.ssh/config << 'EOF'

# prod-239 (kintai-backend)
Host prod-239
    HostName 162.43.86.239
    Port 22
    User itoshu
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
    ServerAliveInterval 60
    ServerAliveCountMax 3
EOF

chmod 600 ~/.ssh/config
```

### ステップ 2: 接続テスト

```bash
cd /home/itoshu2/apps/shuke-b/scheduleboard
./test-deploy-connection.sh
```

このテストで以下を確認します：
1. ✅ SSH秘密鍵の存在
2. ✅ SSH接続
3. ✅ アプリディレクトリの存在
4. ✅ Gitリポジトリ
5. ✅ Node.js/nvm
6. ✅ PM2

## 🚀 デプロイ実行

### 自動デプロイ

```bash
cd /home/itoshu2/apps/shuke-b/scheduleboard
./deploy-kintai-backend.sh
```

### デプロイコマンドの内容

スクリプトは以下の順序で実行されます：

1. **Git fetch/reset**
   ```bash
   cd /home/itoshu/apps/kintai-backend
   git fetch origin main
   git reset --hard origin/main
   ```

2. **依存関係のインストール**
   ```bash
   nvm use 20
   npm ci
   ```

3. **ビルド（失敗は許容）**
   ```bash
   npm run build || echo "ビルド失敗（続行）"
   ```

4. **PM2で再起動**
   ```bash
   pm2 restart kintai-backend
   ```

5. **PM2設定を保存**
   ```bash
   pm2 save
   ```

## 📊 デプロイ後の確認

### ログ確認

```bash
ssh prod-239 "pm2 logs kintai-backend"
```

### ステータス確認

```bash
ssh prod-239 "pm2 status"
```

### アプリの詳細確認

```bash
ssh prod-239 "pm2 describe kintai-backend"
```

## 🔍 トラブルシューティング

### SSH接続エラー

```bash
# 接続テスト
ssh -v prod-239

# 秘密鍵の権限確認
ls -l ~/.ssh/id_ed25519
# 600 でなければ修正
chmod 600 ~/.ssh/id_ed25519
```

### ビルドエラー

ビルドは失敗しても続行されますが、手動で確認する場合：

```bash
ssh prod-239
cd /home/itoshu/apps/kintai-backend
nvm use 20
npm run build
```

### PM2エラー

```bash
# PM2ログを確認
ssh prod-239 "pm2 logs kintai-backend --lines 50"

# PM2を完全に再起動
ssh prod-239 "pm2 restart kintai-backend --update-env"

# PM2プロセスを削除して再作成
ssh prod-239 "cd /home/itoshu/apps/kintai-backend && pm2 delete kintai-backend && pm2 start ecosystem.config.js"
```

## 📝 ファイル一覧

| ファイル | 説明 |
|---------|------|
| `deploy-kintai-backend.sh` | メインデプロイスクリプト |
| `setup-ssh-key.sh` | SSH鍵セットアップスクリプト |
| `test-deploy-connection.sh` | 接続テストスクリプト |
| `ssh-config-prod-239` | SSH設定ファイルテンプレート |
| `kintai-backend-デプロイ手順.md` | このファイル |

## 🎯 クイックリファレンス

```bash
# 初回セットアップ
./setup-ssh-key.sh

# 接続テスト
./test-deploy-connection.sh

# デプロイ実行
./deploy-kintai-backend.sh

# ログ確認
ssh prod-239 "pm2 logs kintai-backend"

# ステータス確認
ssh prod-239 "pm2 status"
```

## ⚡ ワンライナー

SSH設定が完了している場合、以下のコマンドで直接デプロイできます：

```bash
ssh prod-239 'cd /home/itoshu/apps/kintai-backend && git fetch origin main && git reset --hard origin/main && export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && nvm use 20 && npm ci && (npm run build || true) && pm2 restart kintai-backend && pm2 save'
```

