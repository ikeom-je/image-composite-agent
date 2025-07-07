#!/bin/bash

# 色の定義
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== 画像合成REST API テスト実行スクリプト ===${NC}"

# 現在のディレクトリを保存
CURRENT_DIR=$(pwd)
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$TEST_DIR")"

# プロジェクトルートに移動
cd "$PROJECT_ROOT"

# 仮想環境の作成と依存関係のインストール
echo -e "${YELLOW}Python仮想環境を準備中...${NC}"
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi
source .venv/bin/activate

# 依存関係のインストール
echo -e "${YELLOW}テスト依存関係をインストール中...${NC}"
npm install --no-save @playwright/test
pip install pillow boto3 requests

# Lambda関数のユニットテスト
echo -e "${YELLOW}Lambda関数のユニットテストを実行中...${NC}"
cd "$TEST_DIR/lambda"
python -m unittest test_image_processor.py

if [ $? -ne 0 ]; then
    echo -e "${RED}Lambda関数のテストに失敗しました${NC}"
    cd "$CURRENT_DIR"
    exit 1
else
    echo -e "${GREEN}Lambda関数のテストが成功しました${NC}"
fi

# Playwrightテスト（APIテスト）
echo -e "${YELLOW}APIのE2Eテストを実行中...${NC}"
cd "$PROJECT_ROOT"
npx playwright test --config=test/playwright.config.ts --project=api-tests --reporter=list

if [ $? -ne 0 ]; then
    echo -e "${RED}APIテストに失敗しました${NC}"
    cd "$CURRENT_DIR"
    exit 1
else
    echo -e "${GREEN}APIテストが成功しました${NC}"
fi

# フロントエンドのビルド
echo -e "${YELLOW}フロントエンドをビルド中...${NC}"
cd "$PROJECT_ROOT/frontend"
npm install
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}フロントエンドのビルドに失敗しました${NC}"
    cd "$CURRENT_DIR"
    exit 1
else
    echo -e "${GREEN}フロントエンドのビルドが成功しました${NC}"
fi

# ローカルサーバーを起動してフロントエンドテスト
echo -e "${YELLOW}フロントエンドのE2Eテストを実行中...${NC}"
cd "$PROJECT_ROOT"

# ローカルサーバーを起動（バックグラウンド）
npx http-server frontend/dist -p 8080 &
HTTP_SERVER_PID=$!

# サーバーが起動するまで少し待つ
sleep 2

# フロントエンドテストを実行
FRONTEND_URL=http://localhost:8080 npx playwright test --config=test/playwright.config.ts test/e2e/frontend.spec.ts --reporter=list

FRONTEND_TEST_RESULT=$?

# ローカルサーバーを停止
kill $HTTP_SERVER_PID

if [ $FRONTEND_TEST_RESULT -ne 0 ]; then
    echo -e "${RED}フロントエンドテストに失敗しました${NC}"
    cd "$CURRENT_DIR"
    exit 1
else
    echo -e "${GREEN}フロントエンドテストが成功しました${NC}"
fi

# 仮想環境を終了
deactivate

echo -e "${GREEN}すべてのテストが成功しました！${NC}"
cd "$CURRENT_DIR"
exit 0
