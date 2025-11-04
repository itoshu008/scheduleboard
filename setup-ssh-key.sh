#!/bin/bash
# SSH秘密鍵のセットアップスクリプト

set -e

echo "🔑 SSH秘密鍵のセットアップ"
echo ""

# SSH ディレクトリを作成
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Windows側の秘密鍵パスを探す
WIN_KEY_PATHS=(
    "/mnt/c/Users/itosh/.ssh/id_ed25519"
    "/mnt/c/Users/${USER}/.ssh/id_ed25519"
    "/mnt/c/Users/itoshu2/.ssh/id_ed25519"
)

FOUND=false
for path in "${WIN_KEY_PATHS[@]}"; do
    if [ -f "$path" ]; then
        echo "✅ Windows側の秘密鍵が見つかりました: $path"
        echo ""
        echo "秘密鍵をコピー中..."
        cp "$path" ~/.ssh/id_ed25519
        cp "${path}.pub" ~/.ssh/id_ed25519.pub 2>/dev/null || echo "公開鍵が見つかりません（オプション）"
        
        # 権限を設定
        chmod 600 ~/.ssh/id_ed25519
        [ -f ~/.ssh/id_ed25519.pub ] && chmod 644 ~/.ssh/id_ed25519.pub
        
        echo "✅ 秘密鍵をコピーしました: ~/.ssh/id_ed25519"
        FOUND=true
        break
    fi
done

if [ "$FOUND" = false ]; then
    echo "❌ Windows側の秘密鍵が見つかりません"
    echo ""
    echo "手動でコピーしてください:"
    echo "  1. Windowsのエクスプローラーで C:\\Users\\itosh\\.ssh\\id_ed25519 を開く"
    echo "  2. WSLのターミナルで以下を実行:"
    echo "     mkdir -p ~/.ssh"
    echo "     cp /mnt/c/Users/itosh/.ssh/id_ed25519 ~/.ssh/"
    echo "     chmod 600 ~/.ssh/id_ed25519"
    exit 1
fi

echo ""
echo "SSH設定ファイルを更新中..."
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

echo "✅ SSH設定を追加しました"
echo ""
echo "🧪 接続テストを実行中..."
if ssh -o ConnectTimeout=5 -o BatchMode=yes prod-239 "echo '接続成功'" 2>/dev/null; then
    echo "✅ SSH接続テスト成功！"
else
    echo "⚠️  SSH接続テスト失敗"
    echo ""
    echo "手動でテストしてください:"
    echo "  ssh prod-239"
fi

echo ""
echo "✅ セットアップ完了"

