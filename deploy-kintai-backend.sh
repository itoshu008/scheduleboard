#!/bin/bash
# kintai-backend デプロイスクリプト
# サーバー: prod-239 (162.43.86.239)

set -e

# 設定
SERVER_NAME="prod-239"
HOST="162.43.86.239"
PORT="22"
USER="itoshu"
SSH_KEY="$HOME/.ssh/id_ed25519"
APP_DIR="/home/itoshu/apps/kintai-backend"
BRANCH="main"
NODE_VERSION="20"
PM2_APP="kintai-backend"

# カラー出力
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 kintai-backend デプロイ開始${NC}"
echo "サーバー: ${SERVER_NAME} (${HOST})"
echo "ユーザー: ${USER}"
echo "アプリディレクトリ: ${APP_DIR}"
echo ""

# SSH接続テスト
echo -e "${YELLOW}📡 SSH接続をテスト中...${NC}"
if ssh -i "$SSH_KEY" -p "$PORT" -o ConnectTimeout=5 "${USER}@${HOST}" "echo '接続成功'" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ SSH接続成功${NC}"
else
    echo -e "${RED}❌ SSH接続失敗${NC}"
    echo "秘密鍵のパスを確認してください: $SSH_KEY"
    exit 1
fi

# デプロイコマンドを実行
echo -e "${YELLOW}📦 デプロイコマンドを実行中...${NC}"
echo ""

ssh -i "$SSH_KEY" -p "$PORT" "${USER}@${HOST}" /bin/bash << EOF
set -e

echo "🔍 アプリディレクトリに移動: ${APP_DIR}"
cd ${APP_DIR}

echo "📥 Git fetch を実行中..."
git fetch origin ${BRANCH}

echo "🔄 Git reset を実行中..."
git reset --hard origin/${BRANCH}

echo "📌 Node.js バージョンを設定: ${NODE_VERSION}"
export NVM_DIR="\$HOME/.nvm"
[ -s "\$NVM_DIR/nvm.sh" ] && \. "\$NVM_DIR/nvm.sh"
nvm use ${NODE_VERSION}

echo "📦 依存関係をインストール中..."
npm ci

echo "🔨 ビルドを実行中（失敗は許容）..."
npm run build || echo "⚠️  ビルド失敗（続行）"

echo "🔄 PM2でアプリを再起動中..."
pm2 restart ${PM2_APP}

echo "💾 PM2設定を保存中..."
pm2 save

echo "✅ デプロイ完了！"
EOF

echo ""
echo -e "${GREEN}🎉 デプロイが完了しました！${NC}"
echo ""
echo "次のステップ:"
echo "  1. アプリの動作を確認"
echo "  2. ログを確認: ssh ${USER}@${HOST} 'pm2 logs ${PM2_APP}'"
echo "  3. ステータス確認: ssh ${USER}@${HOST} 'pm2 status'"

