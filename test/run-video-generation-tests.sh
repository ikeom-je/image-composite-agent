#!/bin/bash

# 動画生成機能テスト実行スクリプト - v2.5.5
# 動画生成機能の包括的なテストを実行する

set -e

echo "🎬 動画生成機能テストを開始します..."

# 環境変数の設定
export NODE_ENV=test
export PLAYWRIGHT_BROWSERS_PATH=0

# テスト結果ディレクトリの作成
mkdir -p test/test-results/video-generation

# 現在の日時を取得
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="test/test-results/video-generation/test-log-${TIMESTAMP}.log"

echo "📝 テストログ: ${LOG_FILE}"

# ログファイルにヘッダーを書き込み
cat > "${LOG_FILE}" << EOF
動画生成機能テスト実行ログ
実行日時: $(date)
Node.js バージョン: $(node --version)
npm バージョン: $(npm --version)

=== 環境変数 ===
NODE_ENV: ${NODE_ENV}
API_URL: ${API_URL:-"未設定"}
FRONTEND_URL: ${FRONTEND_URL:-"未設定"}

=== テスト開始 ===
EOF

# テスト実行関数
run_test() {
    local test_name="$1"
    local test_file="$2"
    local description="$3"
    
    echo ""
    echo "🧪 ${description}を実行中..."
    echo "   ファイル: ${test_file}"
    
    # ログファイルにテスト開始を記録
    echo "" >> "${LOG_FILE}"
    echo "=== ${test_name} ===" >> "${LOG_FILE}"
    echo "開始時刻: $(date)" >> "${LOG_FILE}"
    
    # テスト実行
    if npx playwright test "${test_file}" --reporter=list 2>&1 | tee -a "${LOG_FILE}"; then
        echo "✅ ${description}が完了しました"
        echo "完了時刻: $(date)" >> "${LOG_FILE}"
        echo "結果: 成功" >> "${LOG_FILE}"
        return 0
    else
        echo "❌ ${description}が失敗しました"
        echo "完了時刻: $(date)" >> "${LOG_FILE}"
        echo "結果: 失敗" >> "${LOG_FILE}"
        return 1
    fi
}

# テスト実行カウンター
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# 1. 動画生成機能のE2Eテスト
TOTAL_TESTS=$((TOTAL_TESTS + 1))
if run_test "VIDEO_E2E" "test/e2e/video-generation.spec.ts" "動画生成機能のE2Eテスト"; then
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi

# 2. 動画生成機能のAPIテスト
TOTAL_TESTS=$((TOTAL_TESTS + 1))
if run_test "VIDEO_API" "test/e2e/video-generation.api.spec.ts" "動画生成機能のAPIテスト"; then
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi

# テスト結果の集計
echo ""
echo "📊 動画生成機能テスト結果:"
echo "   総テスト数: ${TOTAL_TESTS}"
echo "   成功: ${PASSED_TESTS}"
echo "   失敗: ${FAILED_TESTS}"
echo "   成功率: $(( PASSED_TESTS * 100 / TOTAL_TESTS ))%"

# ログファイルに結果を記録
cat >> "${LOG_FILE}" << EOF

=== テスト結果サマリー ===
総テスト数: ${TOTAL_TESTS}
成功: ${PASSED_TESTS}
失敗: ${FAILED_TESTS}
成功率: $(( PASSED_TESTS * 100 / TOTAL_TESTS ))%
完了時刻: $(date)
EOF

# 生成された動画ファイルの一覧を表示
echo ""
echo "📁 生成された動画ファイル:"
if ls test/test-results/*.mp4 test/test-results/*.webm test/test-results/*.avi 2>/dev/null; then
    echo "   動画ファイルが生成されました"
    ls -lh test/test-results/*.mp4 test/test-results/*.webm test/test-results/*.avi 2>/dev/null | head -10
else
    echo "   動画ファイルは生成されませんでした"
fi

# HTMLレポートの生成
echo ""
echo "📄 HTMLレポートを生成中..."
if npx playwright show-report --host=0.0.0.0 --port=9323 > /dev/null 2>&1 &; then
    REPORT_PID=$!
    echo "   HTMLレポートが http://localhost:9323 で利用可能です"
    echo "   レポートを停止するには: kill ${REPORT_PID}"
else
    echo "   HTMLレポートの生成に失敗しました"
fi

# 終了コードの設定
if [ ${FAILED_TESTS} -eq 0 ]; then
    echo ""
    echo "🎉 すべての動画生成機能テストが成功しました！"
    exit 0
else
    echo ""
    echo "⚠️ 一部の動画生成機能テストが失敗しました"
    echo "   詳細はログファイルを確認してください: ${LOG_FILE}"
    exit 1
fi