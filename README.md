# 🎨 Image Compositor

## 機能概要

**課題**: 映像制作・放送現場では画像の合成やテロップ挿入が頻繁に必要ですが、従来のツールは専門知識や複雑なパラメータ指定が求められ、ノンエンジニアには敷居が高い状況でした。

**ねらい**: REST API による直接指定と、自然言語で指示できる AI Chat Agent の2通りのアプローチを提供し、エンジニアからノンエンジニアまで直感的に高品質な画像・動画を合成できるようにします。

| 機能 | 概要 | 対象ユーザー |
|------|------|------------|
| **画像合成 API** | パラメータで画像・テキストを精密に合成。プログラムから直接呼び出せる REST エンドポイント | エンジニア・自動化ワークフロー |
| **AI Chat Agent** | 「左上に画像を置いて」など自然言語で合成を指示。Strands Agents SDK + AWS Bedrock（Claude）で動作 | ノンエンジニア・対話的制作 |
| **動画生成** | 合成結果から MP4・WEBM・AVI 動画を生成。Chat Agent からも呼び出し可能 | 映像制作・放送 |

## ✨ 主な特徴

- **🎨 3画像同時合成**: 最大3つの画像を同時に合成（2画像との後方互換性完全保持）
- **📝 テキストオーバーレイ**: 最大3つのテキストテロップを画像上に配置（日本語対応・折り返し・背景矩形）
- **🤖 Chat Agent**: 自然言語で画像合成・動画生成を指示（Strands Agents SDK + AWS Bedrock マルチモデル対応）
- **📁 画像アップロード機能**: ドラッグ&ドロップによる直接 S3 アップロード
- **🎯 アルファチャンネル対応**: 透過情報を保持した高品質な画像合成
- **🔧 柔軟な画像指定**: HTTP URL・S3 パス・テスト画像・アップロード画像に対応

## 🏗️ アーキテクチャ

```
┌──────────────────┐    ┌───────────────────┐    ┌─────────────────┐
│   API Gateway    │───▶│ Image Processor   │───▶│   Amazon S3     │
│                  │    │ Lambda (Py 3.12)  │    │  (画像/動画)     │
│ /images/composite│    │ + Pillow + boto3  │    └────────┬────────┘
│ /upload          │    └───────────────────┘             │
│ /chat            │    ┌───────────────────┐    ┌────────▼────────┐
│                  │───▶│ Agent Lambda      │───▶│  CloudFront     │
└──────────────────┘    │ (Py 3.12, ARM64)  │    │  Distribution   │
                        │ Strands Agent SDK │    └────────┬────────┘
        ┌───────────────┤                   │             │
        │               └───────────────────┘    ┌────────▼────────┐
        ▼                        │               │   S3 Bucket     │
┌───────────────┐       ┌───────▼───────┐       │  Vue.js 3       │
│   DynamoDB    │       │  AWS Bedrock  │       │  フロントエンド   │
│ ChatHistory   │       │ Claude 4.5    │       └─────────────────┘
└───────────────┘       └───────────────┘
```

## 🚀 前提条件

- AWS CLI 設定済み（`aws configure` で認証情報・リージョンを設定）
- Node.js 22 以上
- Docker（CDK バンドリング用）

## 📦 デプロイ

```bash
# 1. 依存関係のインストール
npm install

# 2. CDK ブートストラップ（初回のみ）
cdk bootstrap

# 3. スタックのデプロイ
npm run deploy

# 4. 環境変数の設定
npm run setup-env

# 5. テスト画像のアップロード（任意）
cd scripts && ./upload-test-images.sh auto
```

デプロイ後、`npm run setup-env` で出力される `FRONTEND_URL` にブラウザでアクセスするとフロントエンドを利用できます。

## 🎯 API 使用例

```bash
# API エンドポイントを取得
export API_URL=$(aws cloudformation describe-stacks \
  --stack-name ImageProcessorApiStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text)

# 2画像合成（後方互換性）
curl "${API_URL}?image1=test&image2=test&format=png" | base64 -d > result.png

# 3画像合成
curl "${API_URL}?image1=test&image2=test&image3=test&format=png" | base64 -d > result_3images.png

# カスタム配置
curl "${API_URL}?image1=test&image2=test&image3=test&image1X=100&image1Y=100&image1Width=400&image1Height=300&format=png" | base64 -d > custom.png
```

### S3 画像の使用

```bash
export UPLOAD_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name ImageProcessorApiStack \
  --query 'Stacks[0].Outputs[?OutputKey==`UploadBucketName`].OutputValue' \
  --output text)

curl "${API_URL}?image1=s3://${UPLOAD_BUCKET}/uploads/images/base.png&image2=s3://${UPLOAD_BUCKET}/uploads/images/overlay.png&format=png" | base64 -d > s3_result.png
```

## 📖 API 仕様

### エンドポイント

```
GET /images/composite
```

### パラメータ（画像指定）

`image1`・`image2` を省略してテキストのみのリクエストも可能です。

| パラメータ | 説明 | 例 |
|-----------|------|-----|
| `image1` | 1つ目の画像 | `test`, `s3://bucket/key`, `https://example.com/img.png` |
| `image2` | 2つ目の画像 | `test`, `s3://bucket/key`, `https://example.com/img.png` |
| `image3` | 3つ目の画像（省略可） | `test`, `s3://bucket/key`, `https://example.com/img.png` |

### オプションパラメータ（配置・形式）

| パラメータ | 説明 | デフォルト |
|-----------|------|-----------|
| `baseImage` | ベース画像（`test`, `transparent`, `white`, `#RRGGBB`, `#RRGGBBAA`） | `#000000`（黒） |
| `baseOpacity` | ベース画像の透明度（0〜100） | `100` |
| `format` | 出力形式（`html` or `png`） | `html` |
| `image1Width` | 1つ目の画像の幅 | 200 |
| `image1Height` | 1つ目の画像の高さ | 200 |
| `image1X` | 1つ目の画像の X 座標 | 1700 |
| `image1Y` | 1つ目の画像の Y 座標 | 96 |
| `image2Width` | 2つ目の画像の幅 | 300 |
| `image2Height` | 2つ目の画像の高さ | 300 |
| `image2X` | 2つ目の画像の X 座標 | 600 |
| `image2Y` | 2つ目の画像の Y 座標 | 400 |
| `image3Width` | 3つ目の画像の幅 | 300 |
| `image3Height` | 3つ目の画像の高さ | 300 |
| `image3X` | 3つ目の画像の X 座標 | 1520 |
| `image3Y` | 3つ目の画像の Y 座標 | 700 |

### オプションパラメータ（テキストオーバーレイ）

`text1`〜`text3` まで最大3つのテキストレイヤーを指定可能:

| パラメータ | 説明 | デフォルト |
|-----------|------|-----------|
| `text1` | テキスト内容（指定時に描画有効） | - |
| `text1X` | X 座標 | 0 |
| `text1Y` | Y 座標 | 0 |
| `text1FontSize` | フォントサイズ (px) | 48 |
| `text1FontColor` | 文字色（`#RRGGBB`） | `#FFFFFF` |
| `text1FontFamily` | フォント名 | `NotoSansJP` |
| `text1BgColor` | テロップ背景色（省略時は背景なし） | - |
| `text1BgOpacity` | 背景の不透明度（0.0〜1.0） | 0.7 |
| `text1Wrap` | 折り返し改行の有無（`true`/`false`） | `false` |
| `text1MaxWidth` | 折り返し時の最大幅 (px) | - |
| `text1Padding` | 背景のパディング (px) | 10 |

> `text2`, `text3` も同じパラメータ体系です。

## 📁 S3 画像アップロード

```bash
export UPLOAD_API_URL=$(aws cloudformation describe-stacks \
  --stack-name ImageProcessorApiStack \
  --query 'Stacks[0].Outputs[?OutputKey==`UploadApiUrl`].OutputValue' \
  --output text)

# 署名付き URL を生成してアップロード
curl -X POST "${UPLOAD_API_URL}/presigned-url" \
  -H "Content-Type: application/json" \
  -d '{"fileName":"my-image.png","fileType":"image/png","fileSize":1024000}'

# アップロード済み画像の一覧
curl "${UPLOAD_API_URL}/images?maxKeys=20"
```

## 🤖 Chat Agent

自然言語で画像合成・動画生成を指示できます。AWS Bedrock の Claude（Sonnet 4.5 / Haiku 4.5）をバックエンドに使用し、会話履歴を DynamoDB で管理します。

```bash
export CHAT_API_URL=$(aws cloudformation describe-stacks \
  --stack-name ImageProcessorApiStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ChatApiUrl`].OutputValue' \
  --output text)

# メッセージを送信（画像合成を自然言語で指示）
curl -X POST "${CHAT_API_URL}" \
  -H "Content-Type: application/json" \
  -d '{"message": "テスト画像を左上と右下に配置して合成してください", "sessionId": "my-session-001"}'

# モデルを指定して送信（デフォルト: Claude Sonnet 4.5）
curl -X POST "${CHAT_API_URL}" \
  -H "Content-Type: application/json" \
  -d '{"message": "動画を30秒で生成して", "sessionId": "my-session-001", "modelId": "us.anthropic.claude-haiku-4-5-20251001-v1:0"}'

# 会話履歴を取得
curl "${CHAT_API_URL}/history/my-session-001"

# 会話履歴を削除
curl -X DELETE "${CHAT_API_URL}/history/my-session-001"

# 利用可能モデル一覧を取得
curl "${CHAT_API_URL}/models"
```

> フロントエンド（`FRONTEND_URL`）の **Chat** タブからブラウザで対話的に利用することもできます。

## 🚨 トラブルシューティング

### AWS 認証エラー

```
Unable to locate credentials
```

→ `aws configure` で認証情報を設定してください。

### S3 バケット権限エラー

```
Access Denied
```

→ IAM ポリシーで S3 の読み書き権限が付与されているか確認してください。

### Lambda タイムアウト

```
Task timed out after 90.00 seconds
```

→ 大きな画像を使用している場合は、画像サイズを縮小するか解像度を下げてください。

### ログ確認

```bash
aws logs tail /aws/lambda/ImageProcessorApiStack-ImageProcessorFunction --follow
```

## 🤝 貢献

プロジェクトへの貢献を歓迎します：

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 ライセンス

このプロジェクトは MIT ライセンスの下で公開されています。

## 🆘 サポート

問題や質問は [GitHub Issues](../../issues) からご報告ください。

---

**Image Compositor** - 高性能画像合成 + AI チャットエージェント 🎨🤖
