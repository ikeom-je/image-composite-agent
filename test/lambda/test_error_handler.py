"""
エラーハンドリングモジュールのテスト - v2.4.0
"""

import unittest
import json
from unittest.mock import patch, MagicMock
import sys
import os

# テスト対象モジュールのパスを追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../lambda/python'))

from error_handler import (
    ErrorType, ErrorSeverity, ImageProcessorError,
    handle_image_error, classify_error, get_user_friendly_message,
    create_error_response, log_error, log_request_info, log_response_info,
    ParameterError, ImageFetchError, ImageProcessingError, ValidationError
)


class TestErrorHandler(unittest.TestCase):
    """エラーハンドリングのテストクラス"""

    def setUp(self):
        """テストセットアップ"""
        self.test_context = {
            "test_param": "test_value",
            "request_source": "unit_test"
        }
        self.test_request_id = "test-request-123"

    def test_image_processor_error_creation(self):
        """ImageProcessorErrorの作成をテスト"""
        error = ImageProcessorError(
            message="テストエラー",
            error_type=ErrorType.PARAMETER_ERROR,
            severity=ErrorSeverity.LOW,
            details={"param": "test"}
        )
        
        self.assertEqual(error.message, "テストエラー")
        self.assertEqual(error.error_type, ErrorType.PARAMETER_ERROR)
        self.assertEqual(error.severity, ErrorSeverity.LOW)
        self.assertEqual(error.details["param"], "test")
        self.assertIsNotNone(error.error_id)
        self.assertIsNotNone(error.timestamp)

    def test_parameter_error_creation(self):
        """ParameterErrorの作成をテスト"""
        error = ParameterError("パラメータが無効です", {"param": "image1"})
        
        self.assertEqual(error.message, "パラメータが無効です")
        self.assertEqual(error.error_type, ErrorType.PARAMETER_ERROR)
        self.assertEqual(error.severity, ErrorSeverity.LOW)
        self.assertEqual(error.details["param"], "image1")

    def test_image_fetch_error_creation(self):
        """ImageFetchErrorの作成をテスト"""
        error = ImageFetchError("画像の取得に失敗しました", {"url": "http://example.com/image.png"})
        
        self.assertEqual(error.message, "画像の取得に失敗しました")
        self.assertEqual(error.error_type, ErrorType.IMAGE_FETCH_ERROR)
        self.assertEqual(error.severity, ErrorSeverity.MEDIUM)

    def test_image_processing_error_creation(self):
        """ImageProcessingErrorの作成をテスト"""
        error = ImageProcessingError("画像処理に失敗しました", {"operation": "resize"})
        
        self.assertEqual(error.message, "画像処理に失敗しました")
        self.assertEqual(error.error_type, ErrorType.IMAGE_PROCESSING_ERROR)
        self.assertEqual(error.severity, ErrorSeverity.MEDIUM)

    def test_validation_error_creation(self):
        """ValidationErrorの作成をテスト"""
        error = ValidationError("バリデーションエラー", {"field": "width"})
        
        self.assertEqual(error.message, "バリデーションエラー")
        self.assertEqual(error.error_type, ErrorType.VALIDATION_ERROR)
        self.assertEqual(error.severity, ErrorSeverity.LOW)

    def test_classify_error_parameter(self):
        """パラメータエラーの分類をテスト"""
        error = ValueError("Invalid parameter value")
        error_type, severity = classify_error(error)
        
        self.assertEqual(error_type, ErrorType.PARAMETER_ERROR)
        self.assertEqual(severity, ErrorSeverity.LOW)

    def test_classify_error_image_fetch(self):
        """画像取得エラーの分類をテスト"""
        error = Exception("Failed to fetch image from URL")
        error_type, severity = classify_error(error)
        
        self.assertEqual(error_type, ErrorType.IMAGE_FETCH_ERROR)
        self.assertEqual(severity, ErrorSeverity.MEDIUM)

    def test_classify_error_s3(self):
        """S3エラーの分類をテスト"""
        error = Exception("S3 bucket not found")
        error_type, severity = classify_error(error)
        
        self.assertEqual(error_type, ErrorType.S3_ERROR)
        self.assertEqual(severity, ErrorSeverity.MEDIUM)

    def test_classify_error_image_processing(self):
        """画像処理エラーの分類をテスト"""
        error = Exception("PIL image format error")
        error_type, severity = classify_error(error)
        
        self.assertEqual(error_type, ErrorType.IMAGE_PROCESSING_ERROR)
        self.assertEqual(severity, ErrorSeverity.MEDIUM)

    def test_classify_error_timeout(self):
        """タイムアウトエラーの分類をテスト"""
        error = TimeoutError("Request timeout")
        error_type, severity = classify_error(error)
        
        self.assertEqual(error_type, ErrorType.TIMEOUT_ERROR)
        self.assertEqual(severity, ErrorSeverity.HIGH)

    def test_classify_error_memory(self):
        """メモリエラーの分類をテスト"""
        error = MemoryError("Out of memory")
        error_type, severity = classify_error(error)
        
        self.assertEqual(error_type, ErrorType.MEMORY_ERROR)
        self.assertEqual(severity, ErrorSeverity.CRITICAL)

    def test_classify_error_default(self):
        """デフォルトエラー分類をテスト"""
        error = Exception("Unknown error")
        error_type, severity = classify_error(error)
        
        self.assertEqual(error_type, ErrorType.INTERNAL_ERROR)
        self.assertEqual(severity, ErrorSeverity.MEDIUM)

    def test_get_user_friendly_message_parameter(self):
        """パラメータエラーのユーザーフレンドリーメッセージをテスト"""
        error = ValueError("image1 is required")
        message = get_user_friendly_message(error, ErrorType.PARAMETER_ERROR)
        
        self.assertEqual(message, "image1パラメータが無効です")

    def test_get_user_friendly_message_image_fetch(self):
        """画像取得エラーのユーザーフレンドリーメッセージをテスト"""
        error = Exception("Image not found")
        message = get_user_friendly_message(error, ErrorType.IMAGE_FETCH_ERROR)
        
        self.assertEqual(message, "指定された画像が見つかりません")

    def test_get_user_friendly_message_image_processing(self):
        """画像処理エラーのユーザーフレンドリーメッセージをテスト"""
        error = Exception("Unsupported image format")
        message = get_user_friendly_message(error, ErrorType.IMAGE_PROCESSING_ERROR)
        
        self.assertEqual(message, "サポートされていない画像形式です")

    def test_handle_image_error_with_image_processor_error(self):
        """ImageProcessorErrorのハンドリングをテスト"""
        original_error = ParameterError("テストエラー", {"param": "test"})
        
        result = handle_image_error(original_error, self.test_context, self.test_request_id)
        
        self.assertEqual(result["error"], "画像処理エラー")
        self.assertEqual(result["message"], "テストエラー")
        self.assertEqual(result["error_type"], ErrorType.PARAMETER_ERROR.value)
        self.assertEqual(result["severity"], ErrorSeverity.LOW.value)
        self.assertEqual(result["request_id"], self.test_request_id)
        self.assertEqual(result["version"], "2.4.0")
        self.assertIn("error_id", result)
        self.assertIn("timestamp", result)

    def test_handle_image_error_with_generic_exception(self):
        """一般的な例外のハンドリングをテスト"""
        original_error = ValueError("Invalid parameter")
        
        result = handle_image_error(original_error, self.test_context, self.test_request_id)
        
        self.assertEqual(result["error"], "画像処理エラー")
        self.assertEqual(result["error_type"], ErrorType.PARAMETER_ERROR.value)
        self.assertEqual(result["severity"], ErrorSeverity.LOW.value)
        self.assertEqual(result["request_id"], self.test_request_id)
        self.assertIn("details", result)
        self.assertEqual(result["details"]["original_error_type"], "ValueError")

    def test_create_error_response_parameter_error(self):
        """パラメータエラーのレスポンス作成をテスト"""
        error = ParameterError("パラメータが無効です")
        
        response = create_error_response(error, request_id=self.test_request_id)
        
        self.assertEqual(response["statusCode"], 400)
        self.assertIn("Content-Type", response["headers"])
        self.assertEqual(response["headers"]["Content-Type"], "application/json")
        self.assertEqual(response["headers"]["X-Request-ID"], self.test_request_id)
        
        body = json.loads(response["body"])
        self.assertEqual(body["message"], "パラメータが無効です")

    def test_create_error_response_image_fetch_error(self):
        """画像取得エラーのレスポンス作成をテスト"""
        error = ImageFetchError("画像が見つかりません")
        
        response = create_error_response(error, request_id=self.test_request_id)
        
        self.assertEqual(response["statusCode"], 404)

    def test_create_error_response_timeout_error(self):
        """タイムアウトエラーのレスポンス作成をテスト"""
        error = ImageProcessorError(
            "処理がタイムアウトしました",
            error_type=ErrorType.TIMEOUT_ERROR,
            severity=ErrorSeverity.HIGH
        )
        
        response = create_error_response(error, request_id=self.test_request_id)
        
        self.assertEqual(response["statusCode"], 408)

    def test_create_error_response_memory_error(self):
        """メモリエラーのレスポンス作成をテスト"""
        error = ImageProcessorError(
            "メモリ不足です",
            error_type=ErrorType.MEMORY_ERROR,
            severity=ErrorSeverity.CRITICAL
        )
        
        response = create_error_response(error, request_id=self.test_request_id)
        
        self.assertEqual(response["statusCode"], 507)

    @patch('error_handler.logger')
    def test_log_error_with_image_processor_error(self, mock_logger):
        """ImageProcessorErrorのログ出力をテスト"""
        error = ParameterError("テストエラー", {"param": "test"})
        
        log_error(error, self.test_context, self.test_request_id)
        
        # ログが呼び出されたことを確認
        mock_logger.info.assert_called()

    @patch('error_handler.logger')
    def test_log_error_with_generic_exception(self, mock_logger):
        """一般的な例外のログ出力をテスト"""
        error = ValueError("テストエラー")
        
        log_error(error, self.test_context, self.test_request_id)
        
        # ログが呼び出されたことを確認
        mock_logger.error.assert_called()

    @patch('error_handler.logger')
    def test_log_request_info(self, mock_logger):
        """リクエスト情報のログ出力をテスト"""
        event = {
            "queryStringParameters": {"image1": "test", "image2": "test"},
            "headers": {"User-Agent": "test-agent"}
        }
        
        log_request_info(self.test_request_id, event, {"test": "context"})
        
        # ログが呼び出されたことを確認
        mock_logger.info.assert_called()
        
        # ログ内容を確認
        call_args = mock_logger.info.call_args[0][0]
        self.assertIn("REQUEST START", call_args)
        self.assertIn(self.test_request_id, call_args)

    @patch('error_handler.logger')
    def test_log_response_info(self, mock_logger):
        """レスポンス情報のログ出力をテスト"""
        response = {
            "statusCode": 200,
            "body": "test response body"
        }
        processing_time = 1.5
        
        log_response_info(self.test_request_id, response, processing_time)
        
        # ログが呼び出されたことを確認
        mock_logger.info.assert_called()
        
        # ログ内容を確認
        call_args = mock_logger.info.call_args[0][0]
        self.assertIn("REQUEST END", call_args)
        self.assertIn(self.test_request_id, call_args)
        self.assertIn("1.5", call_args)

    def test_error_severity_levels(self):
        """エラー重要度レベルをテスト"""
        # LOW severity
        low_error = ParameterError("低重要度エラー")
        self.assertEqual(low_error.severity, ErrorSeverity.LOW)
        
        # MEDIUM severity
        medium_error = ImageFetchError("中重要度エラー")
        self.assertEqual(medium_error.severity, ErrorSeverity.MEDIUM)
        
        # HIGH severity
        high_error = ImageProcessorError(
            "高重要度エラー",
            error_type=ErrorType.TIMEOUT_ERROR,
            severity=ErrorSeverity.HIGH
        )
        self.assertEqual(high_error.severity, ErrorSeverity.HIGH)
        
        # CRITICAL severity
        critical_error = ImageProcessorError(
            "クリティカルエラー",
            error_type=ErrorType.MEMORY_ERROR,
            severity=ErrorSeverity.CRITICAL
        )
        self.assertEqual(critical_error.severity, ErrorSeverity.CRITICAL)

    def test_error_details_preservation(self):
        """エラー詳細情報の保持をテスト"""
        details = {
            "image_path": "s3://bucket/image.png",
            "operation": "resize",
            "parameters": {"width": 800, "height": 600}
        }
        
        error = ImageProcessingError("処理エラー", details)
        
        self.assertEqual(error.details, details)
        self.assertEqual(error.details["image_path"], "s3://bucket/image.png")
        self.assertEqual(error.details["operation"], "resize")
        self.assertEqual(error.details["parameters"]["width"], 800)

    def test_original_error_preservation(self):
        """元の例外の保持をテスト"""
        original = ValueError("元のエラー")
        error = ImageProcessorError(
            "ラップされたエラー",
            original_error=original
        )
        
        self.assertEqual(error.original_error, original)
        self.assertEqual(str(error.original_error), "元のエラー")


if __name__ == '__main__':
    unittest.main()