#!/bin/bash

# 画像合成REST API - 環境変数設定スクリプト
# デプロイ後にこのスクリプトを実行して環境変数を設定してください

set -e

STACK_NAME="ImageProcessorApiStack"

echo "🔧 CloudFormationスタックから環境変数を取得中..."

# スタックの存在確認
if ! aws cloudformation describe-stacks --stack-name "$STACK_NAME" >/dev/null 2>&1; then
    echo "❌ エラー: スタック '$STACK_NAME' が見つかりません"
    echo "   まずデプロイを実行してください: npm run deploy"
    exit 1
fi

# 環境変数の取得
export API_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text)
export FRONTEND_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`FrontendUrl`].OutputValue' --output text)
export UPLOAD_API_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`UploadApiUrl`].OutputValue' --output text)
export UPLOAD_BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`UploadBucketName`].OutputValue' --output text)
export DASHBOARD_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' --output text)

# 結果の表示
echo ""
echo "✅ 環境変数が設定されました:"
echo "   API_URL: ${API_URL}"
echo "   FRONTEND_URL: ${FRONTEND_URL}"
echo "   UPLOAD_API_URL: ${UPLOAD_API_URL}"
echo "   UPLOAD_BUCKET: ${UPLOAD_BUCKET}"
echo "   DASHBOARD_URL: ${DASHBOARD_URL}"
echo ""

# .env.local ファイルの作成
ENV_FILE=".env.local"
cat > "$ENV_FILE" << EOF
# 画像合成REST API - 環境変数設定
# このファイルは自動生成されました: $(date)

API_URL=${API_URL}
FRONTEND_URL=${FRONTEND_URL}
UPLOAD_API_URL=${UPLOAD_API_URL}
UPLOAD_BUCKET=${UPLOAD_BUCKET}
DASHBOARD_URL=${DASHBOARD_URL}
EOF

echo "📝 環境変数を ${ENV_FILE} に保存しました"
echo ""
echo "🚀 使用例:"
echo "   # フロントエンドにアクセス"
echo "   open \"\${FRONTEND_URL}\""
echo ""
echo "   # API テスト"
echo "   curl \"\${API_URL}?image1=test&image2=test&format=png\" | base64 -d > result.png"
echo ""
echo "💡 このスクリプトを再実行するには:"
echo "   source scripts/setup-env.sh"