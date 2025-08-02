#!/bin/bash
set -e

# 設定
BUCKET_NAME="image-processor-frontend-test"

# ビルド
echo "Viteでフロントエンドをビルドしています..."
npm run build

# デプロイ
echo "S3バケット $BUCKET_NAME にデプロイしています..."
aws s3 sync dist/ s3://$BUCKET_NAME/ --delete

# バケットをウェブサイトとして設定
echo "S3バケットをウェブサイトとして設定しています..."
aws s3 website s3://$BUCKET_NAME --index-document index.html --error-document index.html

# パブリックアクセスを許可
echo "バケットポリシーを設定しています..."
aws s3api put-bucket-policy --bucket $BUCKET_NAME --policy '{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::'$BUCKET_NAME'/*"
    }
  ]
}'

echo "デプロイが完了しました！"
echo "ウェブサイトURL: http://$BUCKET_NAME.s3-website-ap-northeast-1.amazonaws.com/"