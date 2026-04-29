#!/bin/bash
# デプロイスクリプト - フロントエンドビルド + CDKデプロイ
# Usage: ./scripts/deploy.sh [all|backend|frontend] [dev|staging|production]
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
ENV="${2:-${ENVIRONMENT:-dev}}"

# 環境サフィックス計算
case "$ENV" in
  production) SUFFIX="" ;;
  staging)    SUFFIX="-Staging" ;;
  dev)        SUFFIX="-Dev" ;;
  *)          echo "❌ 無効な環境: $ENV (dev|staging|production)"; exit 1 ;;
esac

API_STACK="ImageProcessorApiStack${SUFFIX}"
FRONT_STACK="FrontendStack${SUFFIX}"
CDK_CONTEXT="-c environment=${ENV}"

echo "🌍 環境: ${ENV} (スタック: ${API_STACK}, ${FRONT_STACK})"

# Lambda環境変数のCLOUDFRONT_DOMAINをFrontendStackのドメインに更新
update_lambda_cloudfront_domain() {
  local CF_DOMAIN
  CF_DOMAIN=$(aws cloudformation describe-stacks --stack-name "$FRONT_STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='DistributionDomain'].OutputValue" --output text 2>/dev/null || echo "")
  if [ -z "$CF_DOMAIN" ]; then
    echo "⚠️  ${FRONT_STACK}のドメイン取得失敗。CLOUDFRONT_DOMAIN更新をスキップ"
    return
  fi
  echo "🔄 Lambda CLOUDFRONT_DOMAIN → ${CF_DOMAIN}"
  for FUNC_NAME in $(aws lambda list-functions --query "Functions[?starts_with(FunctionName, '${API_STACK}-ImageProcessor') || starts_with(FunctionName, '${API_STACK}-AgentFunction')].FunctionName" --output text); do
    local CURRENT_ENV
    CURRENT_ENV=$(aws lambda get-function-configuration --function-name "$FUNC_NAME" --query "Environment.Variables" --output json)
    local UPDATED_ENV
    UPDATED_ENV=$(echo "$CURRENT_ENV" | python3 -c "import sys,json; d=json.load(sys.stdin); d['CLOUDFRONT_DOMAIN']='${CF_DOMAIN}'; print(json.dumps({'Variables':d}))")
    aws lambda update-function-configuration --function-name "$FUNC_NAME" --environment "$UPDATED_ENV" --no-cli-pager > /dev/null
    echo "  ✅ $(echo $FUNC_NAME | sed "s/${API_STACK}-//")"
  done
}

# バックエンドスタックの出力からconfig.jsonを生成
generate_config() {
  echo "📝 config.json 生成中..."
  local API_URL UPLOAD_URL CHAT_URL CF_DOMAIN
  API_URL=$(aws cloudformation describe-stacks --stack-name "$API_STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text 2>/dev/null || echo "")
  UPLOAD_URL=$(aws cloudformation describe-stacks --stack-name "$API_STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='UploadApiUrl'].OutputValue" --output text 2>/dev/null || echo "")
  CHAT_URL=$(aws cloudformation describe-stacks --stack-name "$API_STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='ChatApiUrl'].OutputValue" --output text 2>/dev/null || echo "")
  CF_DOMAIN=$(aws cloudformation describe-stacks --stack-name "$FRONT_STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='DistributionDomain'].OutputValue" --output text 2>/dev/null || echo "")

  if [ -z "$API_URL" ]; then
    echo "⚠️  ${API_STACK}が未デプロイ。先にバックエンドをデプロイしてください。"
    return 1
  fi

  local BUILD_HASH
  BUILD_HASH=$(cat frontend/dist/.build-hash 2>/dev/null || echo "unknown")
  local DEBUG=$( [ "$ENV" = "production" ] && echo "false" || echo "true" )

  # frontend/public/ に配置 → Viteビルドでdist/にコピーされる
  cat > frontend/public/config.json <<CONF
{
  "apiUrl": "${API_URL}",
  "uploadApiUrl": "${UPLOAD_URL}",
  "chatApiUrl": "${CHAT_URL}",
  "cloudfrontUrl": "https://${CF_DOMAIN}",
  "version": "$(node -p "require('./package.json').version")",
  "buildHash": "${BUILD_HASH}",
  "environment": "${ENV}",
  "buildTimestamp": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "region": "$(aws configure get region 2>/dev/null || echo 'ap-northeast-1')",
  "features": {
    "enableS3Upload": true,
    "enable3ImageComposition": true,
    "enableDebugMode": ${DEBUG},
    "enableAnalytics": true,
    "enableCaching": true,
    "enableErrorReporting": true
  }
}
CONF
  echo "✅ config.json 生成完了 (frontend/public/config.json)"
}

case "$STACK" in
  backend|api)
    echo "🚀 バックエンドのみデプロイ..."
    npx cdk deploy "$API_STACK" $CDK_CONTEXT --require-approval never
    update_lambda_cloudfront_domain
    ;;
  frontend|front)
    generate_config
    echo "🔨 フロントエンドビルド..."
    cd frontend && npm run build && cd "$PROJECT_DIR"
    echo "🚀 フロントエンドデプロイ..."
    npx cdk deploy "$FRONT_STACK" $CDK_CONTEXT --require-approval never
    update_lambda_cloudfront_domain
    ;;
  all|"")
    echo "🚀 バックエンドデプロイ..."
    npx cdk deploy "$API_STACK" $CDK_CONTEXT --require-approval never
    generate_config
    echo "🔨 フロントエンドビルド..."
    cd frontend && npm run build && cd "$PROJECT_DIR"
    echo "🚀 フロントエンドデプロイ..."
    npx cdk deploy "$FRONT_STACK" $CDK_CONTEXT --require-approval never
    update_lambda_cloudfront_domain
    ;;
  *)
    echo "Usage: $0 [all|backend|frontend] [dev|staging|production]"
    exit 1
    ;;
esac

echo ""
echo "✅ デプロイ完了 (${ENV})"
echo "🌐 Frontend: $(aws cloudformation describe-stacks --stack-name "$FRONT_STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue" --output text 2>/dev/null || echo "(${FRONT_STACK}未デプロイ)")"
