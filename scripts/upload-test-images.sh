#!/bin/bash

# 画像合成API - テスト画像アップロードスクリプト（defaultプロファイル対応）
# Usage: ./upload-test-images.sh [bucket-name]

set -e

echo "🚀 テスト画像アップロードスクリプト（defaultプロファイル対応）"
echo "=================================================="

# パラメータの取得
BUCKET_NAME="$1"

# 既存スタックから情報を取得
if [ "$BUCKET_NAME" = "auto" ] || [ -z "$BUCKET_NAME" ]; then
    echo "📋 既存スタックからバケット名を取得中..."
    
    # 既存のImageProcessorApiStackから取得（defaultプロファイル使用）
    BUCKET_NAME=$(aws cloudformation describe-stacks \
        --stack-name ImageProcessorApiStack \
        --query 'Stacks[0].Outputs[?OutputKey==`TestImagesBucketName`].OutputValue' \
        --output text 2>/dev/null)
    
    if [ -z "$BUCKET_NAME" ] || [ "$BUCKET_NAME" = "None" ]; then
        echo "❌ エラー: 既存スタックからバケット名を取得できませんでした"
        echo "💡 スタック名: ImageProcessorApiStack"
        echo "💡 AWS CLI defaultプロファイルを使用"
        echo "💡 AWS_DEFAULT_REGIONまたは--regionオプションでリージョンを指定してください"
        exit 1
    fi
    echo "✅ バケット名: $BUCKET_NAME"
fi

# AWS設定情報の表示
echo "👤 AWS Profile: default"
echo "🌏 AWS Region: \${AWS_DEFAULT_REGION:-default}"

# 画像ファイルの存在確認
IMAGE_DIR="../lambda/python/images"
if [ ! -d "$IMAGE_DIR" ]; then
    echo "❌ エラー: 画像ディレクトリが見つかりません: $IMAGE_DIR"
    exit 1
fi

# 各画像ファイルの確認とアップロード
declare -a images=("aws-logo.png" "circle_red.png" "rectangle_blue.png")
declare -a descriptions=("AWS Logo (ベース画像)" "赤い円 (合成画像1)" "青い四角形 (合成画像2)")

echo ""
echo "📤 画像アップロード開始..."

for i in "${!images[@]}"; do
    image="${images[$i]}"
    description="${descriptions[$i]}"
    local_path="$IMAGE_DIR/$image"
    s3_path="s3://$BUCKET_NAME/images/$image"
    
    if [ ! -f "$local_path" ]; then
        echo "⚠️  警告: $local_path が見つかりません"
        continue
    fi
    
    echo "📸 $description をアップロード中..."
    echo "   ローカル: $local_path"
    echo "   S3: $s3_path"
    
    if aws s3 cp "$local_path" "$s3_path"; then
        echo "✅ アップロード成功"
    else
        echo "❌ アップロード失敗"
        exit 1
    fi
    echo ""
done

echo "🎉 全ての画像のアップロードが完了しました！"
echo ""
echo "📋 アップロードされた画像:"
aws s3 ls "s3://$BUCKET_NAME/images/"

echo ""
echo "🔗 既存APIエンドポイント:"
API_URL=$(aws cloudformation describe-stacks \
    --stack-name ImageProcessorApiStack \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
    --output text 2>/dev/null)

if [ -n "$API_URL" ] && [ "$API_URL" != "None" ]; then
    echo "   API URL: $API_URL"
    echo "   テスト: $API_URL?baseImage=test&image1=test&image2=test"
else
    echo "   ⚠️ API URLを取得できませんでした"
fi

echo ""
echo "✨ 既存の画像合成API との整合が完了しました！"
echo ""
echo "💡 注意: defaultプロファイルとAWS_DEFAULT_REGIONを使用しています"
echo "   必要に応じて環境変数を設定してください："
echo "   export AWS_DEFAULT_REGION=ap-northeast-1"
