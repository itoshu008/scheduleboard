#!/bin/bash
# デプロイ接続テストスクリプト

set -e

# 設定
HOST="162.43.86.239"
PORT="22"
USER="itoshu"
SSH_KEY="$HOME/.ssh/id_ed25519"
APP_DIR="/home/itoshu/apps/kintai-backend"

# カラー出力
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🧪 デプロイ接続テスト${NC}"
echo ""

# 1. SSH鍵の確認
echo -e "${YELLOW}1️⃣ SSH秘密鍵の確認${NC}"
if [ -f "$SSH_KEY" ]; then
    echo -e "${GREEN}✅ SSH秘密鍵が存在します: $SSH_KEY${NC}"
    ls -lh "$SSH_KEY"
else
    echo -e "${RED}❌ SSH秘密鍵が見つかりません: $SSH_KEY${NC}"
    echo ""
    echo "セットアップを実行してください:"
    echo "  ./setup-ssh-key.sh"
    exit 1
fi

echo ""

# 2. SSH接続テスト
echo -e "${YELLOW}2️⃣ SSH接続テスト${NC}"
if ssh -i "$SSH_KEY" -p "$PORT" -o ConnectTimeout=5 "${USER}@${HOST}" "echo 'SSH接続成功'" 2>&1; then
    echo -e "${GREEN}✅ SSH接続成功${NC}"
else
    echo -e "${RED}❌ SSH接続失敗${NC}"
    exit 1
fi

echo ""

# 3. アプリディレクトリの確認
echo -e "${YELLOW}3️⃣ アプリディレクトリの確認${NC}"
if ssh -i "$SSH_KEY" -p "$PORT" "${USER}@${HOST}" "[ -d ${APP_DIR} ] && echo 'ディレクトリ存在'" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ アプリディレクトリが存在します: ${APP_DIR}${NC}"
    ssh -i "$SSH_KEY" -p "$PORT" "${USER}@${HOST}" "ls -lah ${APP_DIR}" | head -10
else
    echo -e "${RED}❌ アプリディレクトリが見つかりません: ${APP_DIR}${NC}"
    exit 1
fi

echo ""

# 4. Git リポジトリの確認
echo -e "${YELLOW}4️⃣ Git リポジトリの確認${NC}"
ssh -i "$SSH_KEY" -p "$PORT" "${USER}@${HOST}" << EOF
cd ${APP_DIR}
if [ -d .git ]; then
    echo "✅ Gitリポジトリです"
    echo "現在のブランチ: \$(git branch --show-current)"
    echo "最新コミット: \$(git log -1 --oneline)"
else
    echo "❌ Gitリポジトリではありません"
    exit 1
fi
EOF

echo ""

# 5. Node.js/nvm の確認
echo -e "${YELLOW}5️⃣ Node.js/nvm の確認${NC}"
ssh -i "$SSH_KEY" -p "$PORT" "${USER}@${HOST}" << 'EOF'
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
if command -v nvm > /dev/null 2>&1; then
    echo "✅ nvm がインストールされています"
    nvm --version
    echo "Node.js バージョン:"
    nvm use 20 && node --version
else
    echo "❌ nvm が見つかりません"
    exit 1
fi
EOF

echo ""

# 6. PM2の確認
echo -e "${YELLOW}6️⃣ PM2の確認${NC}"
ssh -i "$SSH_KEY" -p "$PORT" "${USER}@${HOST}" << 'EOF'
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 20
if command -v pm2 > /dev/null 2>&1; then
    echo "✅ PM2がインストールされています"
    pm2 --version
    echo ""
    echo "PM2アプリ一覧:"
    pm2 list
else
    echo "❌ PM2が見つかりません"
    exit 1
fi
EOF

echo ""
echo -e "${GREEN}🎉 すべてのテストが完了しました！${NC}"
echo ""
echo "デプロイを実行できます:"
echo "  ./deploy-kintai-backend.sh"

