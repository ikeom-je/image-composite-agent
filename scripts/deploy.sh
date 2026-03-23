#!/bin/bash
# デプロイスクリプト - フロントエンドビルド + CDKデプロイ
# Usage: ./scripts/deploy.sh [all|backend|frontend]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# .env.local読み込み
if [ -f .env.local ]; then
  source .env.local
else
  echo "⚠️  .env.local が見つかりません"
  exit 1
fi

STACK="${1:-all}"

# バックエンドスタックの出力からconfig.jsonを生成
generate_config() {
  echo "📝 config.json 生成中..."
  local API_URL UPLOAD_URL CHAT_URL CF_DOMAIN
  API_URL=$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack \
    --query "Stacks[0].Outputs[?ExportName=='ImageProcessorApiEndpoint'].OutputValue" --output text 2>/dev/null || echo "")
  UPLOAD_URL=$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack \
    --query "Stacks[0].Outputs[?ExportName=='ImageProcessorUploadApiEndpoint'].OutputValue" --output text 2>/dev/null || echo "")
  CHAT_URL=$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack \
    --query "Stacks[0].Outputs[?ExportName=='ImageProcessorChatApiEndpoint'].OutputValue" --output text 2>/dev/null || echo "")
  CF_DOMAIN=$(aws cloudformation describe-stacks --stack-name FrontendStack \
    --query "Stacks[0].Outputs[?OutputKey=='DistributionDomain'].OutputValue" --output text 2>/dev/null || echo "")

  if [ -z "$API_URL" ]; then
    echo "⚠️  ImageProcessorApiStackが未デプロイ。先にバックエンドをデプロイしてください。"
    return 1
  fi

  cat > frontend/dist/config.json <<CONF
{
  "apiUrl": "${API_URL}",
  "uploadApiUrl": "${UPLOAD_URL}",
  "chatApiUrl": "${CHAT_URL}",
  "cloudfrontUrl": "https://${CF_DOMAIN}",
  "version": "$(node -p "require('./package.json').version")",
  "environment": "production",
  "buildTimestamp": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "region": "$(aws configure get region 2>/dev/null || echo 'ap-northeast-1')",
  "features": {
    "enableS3Upload": true,
    "enable3ImageComposition": true,
    "enableDebugMode": false,
    "enableAnalytics": true,
    "enableCaching": true,
    "enableErrorReporting": true
  }
}
CONF
  cp frontend/dist/config.json frontend/dist/config.production.json
  echo "✅ config.json 生成完了"
}

case "$STACK" in
  backend|api)
    echo "🚀 バックエンドのみデプロイ..."
    npx cdk deploy ImageProcessorApiStack --require-approval never
    ;;
  frontend|front)
    echo "🔨 フロントエンドビルド..."
    cd frontend && npm run build && cd "$PROJECT_DIR"
    generate_config
    echo "🚀 フロントエンドデプロイ..."
    npx cdk deploy FrontendStack --require-approval never
    ;;
  all|"")
    echo "🔨 フロントエンドビルド..."
    cd frontend && npm run build && cd "$PROJECT_DIR"
    echo "🚀 バックエンドデプロイ..."
    npx cdk deploy ImageProcessorApiStack --require-approval never
    generate_config
    echo "🚀 フロントエンドデプロイ..."
    npx cdk deploy FrontendStack --require-approval never
    ;;
  *)
    echo "Usage: $0 [all|backend|frontend]"
    exit 1
    ;;
esac

echo ""
echo "✅ デプロイ完了"
echo "🌐 Frontend: $(aws cloudformation describe-stacks --stack-name FrontendStack \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue" --output text 2>/dev/null || echo '(FrontendStack未デプロイ)')"
