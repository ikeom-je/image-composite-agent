#!/bin/bash

# 包括的APIテスト実行スクリプト
# 全てのAPIテストを順次実行し、結果をレポート

set -e

echo "🚀 包括的APIテスト実行開始"
echo "=================================="

# 環境変数チェック
if [ -z "$API_URL" ]; then
    echo "⚠️  警告: API_URL環境変数が設定されていません"
    echo "   デフォルトURLを使用します"
    export API_URL="http://localhost:3000"
fi

echo "📍 テスト対象API: $API_URL"
echo ""

# テスト結果を格納する変数
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# テスト実行関数
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    echo "🧪 実行中: $test_name"
    echo "   コマンド: $test_command"
    
    if eval "$test_command"; then
        echo "✅ 成功: $test_name"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo "❌ 失敗: $test_name"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo ""
}

# 1. 基本API検証テスト
run_test "基本API検証テスト" "npm run test:api-validation"

# 2. アップロードAPI基本テスト
run_test "アップロードAPI基本テスト" "npm run test:upload-api"

# 3. 包括的アップロードテスト
run_test "包括的アップロードテスト" "npm run test:upload-comprehensive"

# 4. 画像選択機能テスト
run_test "画像選択機能テスト" "npm run test:image-selection"

# 5. 統合E2Eテスト
run_test "統合E2Eテスト" "npm run test:integration-e2e"

# 結果サマリー
echo "📊 テスト結果サマリー"
echo "=================================="
echo "総テスト数: $TOTAL_TESTS"
echo "成功: $PASSED_TESTS"
echo "失敗: $FAILED_TESTS"

if [ $FAILED_TESTS -eq 0 ]; then
    echo "🎉 全てのテストが成功しました！"
    exit 0
else
    echo "💥 $FAILED_TESTS 個のテストが失敗しました"
    exit 1
fi