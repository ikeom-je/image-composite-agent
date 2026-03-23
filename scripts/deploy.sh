#!/bin/bash
# デプロイスクリプト - フロントエンドビルド + CDKデプロイ
# 使用方法: ./scripts/deploy.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# .env.local読み込み
if [ -f .env.local ]; then
  echo "📦 .env.local を読み込み中..."
  source .env.local
else
  echo "⚠️  .env.local が見つかりません"
  exit 1
fi

# フロントエンドビルド
echo "🔨 フロントエンドをビルド中..."
cd frontend
npm run build
cd "$PROJECT_DIR"

# CDKデプロイ（BucketDeploymentがフロントエンド+CloudFront invalidationを処理）
echo "🚀 CDKデプロイ中..."
npx cdk deploy ImageProcessorApiStack --require-approval never

# デプロイ確認
echo ""
echo "✅ デプロイ完了"
echo "🌐 Frontend: https://$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack --query "Stacks[0].Outputs[?OutputKey=='CloudFrontURL'].OutputValue" --output text 2>/dev/null || echo 'd1apj9glns7l6g.cloudfront.net')"
