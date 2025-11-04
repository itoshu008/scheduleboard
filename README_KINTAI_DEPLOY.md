# kintai-backend デプロイ設定 - セットアップガイド

## ✅ 作成完了したファイル

| ファイル | 説明 |
|---------|------|
| `deploy-kintai-backend.sh` | **メインデプロイスクリプト** |
| `test-deploy-connection.sh` | 接続テストスクリプト（Test機能） |
| `setup-ssh-key.sh` | SSH鍵自動セットアップ |
| `ssh-config-prod-239` | SSH設定テンプレート |
| `kintai-backend-デプロイ手順.md` | 詳細マニュアル |

## 🚀 クイックスタート（3ステップ）

### ステップ 1: SSH秘密鍵を見つける

Windows側で秘密鍵の場所を確認してください：

```powershell
# PowerShellで実行
dir C:\Users\*\.ssh\id_ed25519
```

または、Windowsエクスプローラーで確認：
```
C:\Users\<あなたのユーザー名>\.ssh\id_ed25519
```

### ステップ 2: 秘密鍵をWSLにコピー

**実際のWindowsユーザー名を確認**:

```bash
ls /mnt/c/Users/
```

**秘密鍵をコピー**:

```bash
# 実際のユーザー名に置き換えてください
mkdir -p ~/.ssh
cp /mnt/c/Users/<実際のユーザー名>/.ssh/id_ed25519 ~/.ssh/
chmod 600 ~/.ssh/id_ed25519

# SSH設定を追加
cat >> ~/.ssh/config << 'EOF'

Host prod-239
    HostName 162.43.86.239
    Port 22
    User itoshu
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
EOF

chmod 600 ~/.ssh/config
```

### ステップ 3: Test（接続テスト）

```bash
cd /home/itoshu2/apps/shuke-b/scheduleboard
./test-deploy-connection.sh
```

**テスト項目**:
- ✅ SSH秘密鍵の存在
- ✅ SSH接続成功
- ✅ アプリディレクトリ確認
- ✅ Git リポジトリ確認
- ✅ Node.js/nvm確認
- ✅ PM2確認

### ステップ 4: Run（デプロイ実行）

テストが成功したら、デプロイを実行：

```bash
./deploy-kintai-backend.sh
```

## 📋 デプロイ処理の内容

スクリプトは以下を自動実行します：

1. **Git fetch/reset** - 最新のmainブランチを取得
2. **npm ci** - 依存関係をクリーンインストール
3. **npm run build** - ビルド実行（失敗は許容）
4. **pm2 restart kintai-backend** - アプリを再起動
5. **pm2 save** - PM2設定を保存

## 🔍 現在の状態

```
❌ SSH秘密鍵: 未設定
   → ステップ2でコピーが必要

⏳ 接続テスト: 未実行
   → ステップ3で実行

⏳ デプロイ: 準備中
   → テスト完了後に実行可能
```

## 🛠️ 代替方法（秘密鍵が見つからない場合）

### A. 新しいSSH鍵を生成

```bash
ssh-keygen -t ed25519 -C "itoshu@prod-239"
# パスを確認: ~/.ssh/id_ed25519

# 公開鍵をサーバーに追加
ssh-copy-id -i ~/.ssh/id_ed25519.pub itoshu@162.43.86.239
```

### B. パスワード認証を使用

秘密鍵なしでパスワード認証を使う場合：

```bash
# deploy-kintai-backend.sh の SSH_KEY 行をコメントアウトし、
# ssh コマンドから -i オプションを削除
```

## 📞 サポート

### Windowsユーザー名を確認

```bash
ls /mnt/c/Users/
```

### SSH鍵の権限を確認

```bash
ls -l ~/.ssh/id_ed25519
# 期待される出力: -rw------- (600)
```

### 手動SSH接続テスト

```bash
ssh itoshu@162.43.86.239
```

## 🎯 次のアクション

1. **ステップ2を実行**: 秘密鍵をコピー
2. **ステップ3を実行**: `./test-deploy-connection.sh`
3. **ステップ4を実行**: `./deploy-kintai-backend.sh`

詳細は `kintai-backend-デプロイ手順.md` を参照してください。

