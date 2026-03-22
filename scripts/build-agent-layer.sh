#!/bin/bash
# Strands Agent Lambda Layer ビルドスクリプト
# ARM64 + Python 3.11 用のLayer ZIPファイルを作成
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LAYER_DIR="$PROJECT_DIR/lambda/layers/agent-deps"
BUILD_DIR="$LAYER_DIR/build"
OUTPUT_ZIP="$LAYER_DIR/agent-deps-layer.zip"

echo "=== Strands Agent Lambda Layer ビルド開始 ==="

# クリーンアップ
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/python"

echo "--- 依存パッケージをインストール ---"
pip install \
  -r "$LAYER_DIR/requirements.txt" \
  -t "$BUILD_DIR/python" \
  --no-cache-dir \
  --platform manylinux2014_aarch64 \
  --only-binary=:all: \
  --python-version 3.11

echo "--- バンドルサイズを最適化 ---"
find "$BUILD_DIR" -name "*.pyc" -delete
find "$BUILD_DIR" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
find "$BUILD_DIR" -name "*.dist-info" -type d -exec rm -rf {} + 2>/dev/null || true
find "$BUILD_DIR" -name "tests" -type d -exec rm -rf {} + 2>/dev/null || true
find "$BUILD_DIR" -name "test" -type d -exec rm -rf {} + 2>/dev/null || true

echo "--- ZIPファイルを作成 ---"
cd "$BUILD_DIR"
rm -f "$OUTPUT_ZIP"
zip -r "$OUTPUT_ZIP" python/ -x "*.pyc" "*__pycache__*"

LAYER_SIZE=$(du -sh "$OUTPUT_ZIP" | cut -f1)
echo "=== ビルド完了: $OUTPUT_ZIP ($LAYER_SIZE) ==="
