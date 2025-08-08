#!/bin/bash

# ffmpeg Lambda Layer作成スクリプト - v2.6.0
# 動画生成機能のためのffmpegバイナリを含むLambda Layerを作成

set -e

echo "🎬 Creating ffmpeg Lambda Layer for video generation..."

# 作業ディレクトリの作成
LAYER_DIR="lambda-layers/ffmpeg"
mkdir -p "$LAYER_DIR/bin"

# 既存のレイヤーディレクトリをクリーンアップ
if [ -d "$LAYER_DIR" ]; then
    echo "🧹 Cleaning up existing layer directory..."
    rm -rf "$LAYER_DIR"
fi

mkdir -p "$LAYER_DIR/bin"

# ffmpegの静的バイナリをダウンロード
echo "📥 Downloading ffmpeg static binary..."

# Lambda環境（Amazon Linux 2）用のffmpeg静的バイナリをダウンロード
FFMPEG_VERSION="4.4.2"
FFMPEG_URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"

# 一時ディレクトリでダウンロード
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

echo "🔽 Downloading from: $FFMPEG_URL"
curl -L -o ffmpeg-static.tar.xz "$FFMPEG_URL"

echo "📦 Extracting ffmpeg binary..."
tar -xf ffmpeg-static.tar.xz

# ffmpegバイナリを見つけてコピー
FFMPEG_DIR=$(find . -name "ffmpeg-*-amd64-static" -type d | head -1)
if [ -z "$FFMPEG_DIR" ]; then
    echo "❌ Error: ffmpeg directory not found"
    exit 1
fi

# 必要なバイナリをレイヤーディレクトリにコピー
cd "$OLDPWD"
cp "$TEMP_DIR/$FFMPEG_DIR/ffmpeg" "$LAYER_DIR/bin/"
cp "$TEMP_DIR/$FFMPEG_DIR/ffprobe" "$LAYER_DIR/bin/"

# 実行権限を付与
chmod +x "$LAYER_DIR/bin/ffmpeg"
chmod +x "$LAYER_DIR/bin/ffprobe"

# 一時ディレクトリをクリーンアップ
rm -rf "$TEMP_DIR"

echo "✅ ffmpeg binaries copied to $LAYER_DIR/bin/"

# バイナリのサイズを確認
echo "📊 Binary sizes:"
ls -lh "$LAYER_DIR/bin/"

# ffmpegのバージョンを確認
echo "🔍 ffmpeg version:"
"$LAYER_DIR/bin/ffmpeg" -version | head -1

# レイヤー用のZIPファイルを作成
echo "📦 Creating Lambda Layer ZIP file..."
cd "$LAYER_DIR"
zip -r "../ffmpeg-layer.zip" .
cd "$OLDPWD"

echo "✅ Lambda Layer ZIP created: lambda-layers/ffmpeg-layer.zip"
echo "📊 ZIP file size:"
ls -lh "lambda-layers/ffmpeg-layer.zip"

echo ""
echo "🎬 ffmpeg Lambda Layer creation completed!"
echo ""
echo "Next steps:"
echo "1. Upload the ZIP file to AWS Lambda Layers"
echo "2. Update your CDK stack to use this layer"
echo "3. Add the layer to your Lambda function"
echo ""
echo "Layer structure:"
echo "  /opt/bin/ffmpeg"
echo "  /opt/bin/ffprobe"
echo ""
echo "Environment variable to add to Lambda:"
echo "  PATH=/opt/bin:\$PATH"