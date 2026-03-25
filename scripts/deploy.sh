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

# Lambda環境変数のCLOUDFRONT_DOMAINをFrontendStackのドメインに更新
update_lambda_cloudfront_domain() {
  local CF_DOMAIN
  CF_DOMAIN=$(aws cloudformation describe-stacks --stack-name FrontendStack \
    --query "Stacks[0].Outputs[?OutputKey=='DistributionDomain'].OutputValue" --output text 2>/dev/null || echo "")
  if [ -z "$CF_DOMAIN" ]; then
    echo "⚠️  FrontendStackのドメイン取得失敗。CLOUDFRONT_DOMAIN更新をスキップ"
    return
  fi
  echo "🔄 Lambda CLOUDFRONT_DOMAIN → ${CF_DOMAIN}"
  for FUNC_NAME in $(aws lambda list-functions --query "Functions[?starts_with(FunctionName, 'ImageProcessorApiStack-ImageProcessor') || starts_with(FunctionName, 'ImageProcessorApiStack-AgentFunction')].FunctionName" --output text); do
    local CURRENT_ENV
    CURRENT_ENV=$(aws lambda get-function-configuration --function-name "$FUNC_NAME" --query "Environment.Variables" --output json)
    local UPDATED_ENV
    UPDATED_ENV=$(echo "$CURRENT_ENV" | python3 -c "import sys,json; d=json.load(sys.stdin); d['CLOUDFRONT_DOMAIN']='${CF_DOMAIN}'; print(json.dumps({'Variables':d}))")
    aws lambda update-function-configuration --function-name "$FUNC_NAME" --environment "$UPDATED_ENV" --no-cli-pager > /dev/null
    echo "  ✅ $(echo $FUNC_NAME | sed 's/ImageProcessorApiStack-//')"
  done
}

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

  local BUILD_HASH
  BUILD_HASH=$(cat frontend/dist/.build-hash 2>/dev/null || echo "unknown")

  cat > frontend/dist/config.json <<CONF
{
  "apiUrl": "${API_URL}",
  "uploadApiUrl": "${UPLOAD_URL}",
  "chatApiUrl": "${CHAT_URL}",
  "cloudfrontUrl": "https://${CF_DOMAIN}",
  "version": "$(node -p "require('./package.json').version")",
  "buildHash": "${BUILD_HASH}",
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
    update_lambda_cloudfront_domain
    ;;
  all|"")
    echo "🔨 フロントエンドビルド..."
    cd frontend && npm run build && cd "$PROJECT_DIR"
    echo "🚀 バックエンドデプロイ..."
    npx cdk deploy ImageProcessorApiStack --require-approval never
    generate_config
    echo "🚀 フロントエンドデプロイ..."
    npx cdk deploy FrontendStack --require-approval never
    update_lambda_cloudfront_domain
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
