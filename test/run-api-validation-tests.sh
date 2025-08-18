#!/bin/bash

# 画像合成API検証テスト実行スクリプト
# Usage: ./run-api-validation-tests.sh [environment]

set -e

echo "🧪 画像合成API検証テスト実行スクリプト"
echo "=================================================="

# 環境設定
ENVIRONMENT="${1:-production}"
echo "📋 テスト環境: $ENVIRONMENT"

# AWS設定確認
echo "👤 AWS Profile: ${AWS_PROFILE:-default}"
echo "🌏 AWS Region: ${AWS_DEFAULT_REGION:-ap-northeast-1}"

# API URLの取得
echo "🔍 API URLを取得中..."
API_URL=$(aws cloudformation describe-stacks \
    --stack-name ImageProcessorApiStack \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$API_URL" ] || [ "$API_URL" = "None" ]; then
    echo "❌ エラー: API URLを取得できませんでした"
    echo "💡 ImageProcessorApiStackがデプロイされているか確認してください"
    exit 1
fi

echo "✅ API URL: $API_URL"

# フロントエンドURLの取得
FRONTEND_URL=$(aws cloudformation describe-stacks \
    --stack-name ImageProcessorApiStack \
    --query 'Stacks[0].Outputs[?OutputKey==`FrontendUrl`].OutputValue' \
    --output text 2>/dev/null)

if [ -n "$FRONTEND_URL" ] && [ "$FRONTEND_URL" != "None" ]; then
    echo "✅ Frontend URL: $FRONTEND_URL"
fi

# 環境変数の設定
export API_URL="$API_URL"
export FRONTEND_URL="$FRONTEND_URL"

# テスト実行
echo ""
echo "🚀 API検証テストを実行中..."

# 画像合成API検証テスト
echo "📸 画像合成API検証テスト"
npx playwright test --config=test/playwright.config.ts test/e2e/api-validation.api.spec.ts --reporter=list

# S3アップロードAPI検証テスト
echo "📤 S3アップロードAPI検証テスト"
npx playwright test --config=test/playwright.config.ts test/e2e/upload-api-validation.api.spec.ts --reporter=list

echo ""
echo "🎉 全てのAPI検証テストが完了しました！"
echo ""
echo "📊 テスト結果:"
echo "   - 画像合成API: 基本機能、エラーハンドリング、パフォーマンス"
echo "   - S3アップロードAPI: 署名付きURL生成、画像一覧取得"
echo "   - 統合テスト: S3画像を使用した画像合成"
echo ""
echo "💡 詳細なテスト結果は test-results/ ディレクトリを確認してください"