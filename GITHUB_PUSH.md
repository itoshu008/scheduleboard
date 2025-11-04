# GitHubへのプッシュ手順

## 📋 現在の状況

- ✅ リモートリポジトリ設定済み: `https://github.com/itoshu1017/shuke-b.git`
- ✅ 変更をステージング済み
- ⏳ コミット待ち / プッシュ待ち

## 🚀 プッシュ手順

### 方法1: HTTPS（パスワード/トークン認証）

```bash
cd /home/itoshu2/apps/shuke-b/scheduleboard

# 1. コミット（まだの場合）
git commit -m "デプロイ設定とnginx設定を追加"

# 2. プッシュ（GitHubのユーザー名とパスワード/トークンを入力）
git push -u origin master
```

**注意**: GitHubは2021年8月以降、パスワード認証を廃止しています。代わりに**Personal Access Token (PAT)**を使用してください。

### 方法2: SSH認証（推奨）

```bash
# 1. SSH鍵をGitHubに登録（まだの場合）
# https://github.com/settings/keys で公開鍵を登録

# 2. リモートURLをSSHに変更
git remote set-url origin git@github.com:itoshu1017/shuke-b.git

# 3. プッシュ
git push -u origin master
```

### 方法3: GitHub CLI使用

```bash
# GitHub CLIでログイン
gh auth login

# プッシュ
git push -u origin master
```

## 🔑 Personal Access Token (PAT) の作成

1. GitHubにログイン
2. Settings → Developer settings → Personal access tokens → Tokens (classic)
3. "Generate new token" をクリック
4. スコープで `repo` を選択
5. トークンをコピー（一度しか表示されません）

プッシュ時にパスワードの代わりにこのトークンを使用します。

## 📝 コミット内容

以下のファイルが追加/変更されています：

- ✅ デプロイスクリプト（build.sh, deploy.sh, deploy-local.sh）
- ✅ nginx設定ファイル（nginx-shuke-b.conf）
- ✅ デプロイ手順書（DEPLOY.md, DEPLOYMENT_SUMMARY.md等）
- ✅ kintai-backend デプロイ設定
- ✅ その他の設定ファイル

## 🎯 次のステップ

1. コミット（まだの場合）
2. GitHub認証（PATまたはSSH）
3. プッシュ実行

