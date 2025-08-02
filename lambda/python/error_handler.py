"""
エラーハンドリングモジュール - v2.4.0

Lambda関数の包括的なエラーハンドリングとログ機能を提供
"""

import json
import logging
import traceback
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, Union
from enum import Enum


class ErrorType(Enum):
    """エラータイプの定義"""
    PARAMETER_ERROR = "parameter_error"
    IMAGE_FETCH_ERROR = "image_fetch_error"
    IMAGE_PROCESSING_ERROR = "image_processing_error"
    S3_ERROR = "s3_error"
    NETWORK_ERROR = "network_error"
    VALIDATION_ERROR = "validation_error"
    INTERNAL_ERROR = "internal_error"
    TIMEOUT_ERROR = "timeout_error"
    MEMORY_ERROR = "memory_error"


class ErrorSeverity(Enum):
    """エラー重要度の定義"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# ログ設定
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class ImageProcessorError(Exception):
    """画像処理専用例外クラス"""
    
    def __init__(
        self,
        message: str,
        error_type: ErrorType = ErrorType.INTERNAL_ERROR,
        severity: ErrorSeverity = ErrorSeverity.MEDIUM,
        details: Optional[Dict[str, Any]] = None,
        original_error: Optional[Exception] = None
    ):
        super().__init__(message)
        self.message = message
        self.error_type = error_type
        self.severity = severity
        self.details = details or {}
        self.original_error = original_error
        self.error_id = str(uuid.uuid4())
        self.timestamp = datetime.utcnow().isoformat()


def handle_image_error(
    error: Exception,
    context: Optional[Dict[str, Any]] = None,
    request_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    画像処理エラーを包括的に処理する
    
    Args:
        error: 発生した例外
        context: エラーコンテキスト情報
        request_id: リクエストID
        
    Returns:
        Dict[str, Any]: 構造化されたエラーレスポンス
    """
    context = context or {}
    request_id = request_id or str(uuid.uuid4())
    
    # ImageProcessorErrorの場合
    if isinstance(error, ImageProcessorError):
        error_response = {
            "error": "画像処理エラー",
            "message": error.message,
            "error_type": error.error_type.value,
            "severity": error.severity.value,
            "error_id": error.error_id,
            "request_id": request_id,
            "timestamp": error.timestamp,
            "details": error.details,
            "version": "2.4.1"
        }
        
        # ログ出力
        log_error(error, context, request_id)
        
        return error_response
    
    # 一般的な例外の場合、適切なImageProcessorErrorに変換
    error_type, severity = classify_error(error)
    
    image_error = ImageProcessorError(
        message=get_user_friendly_message(error, error_type),
        error_type=error_type,
        severity=severity,
        details={
            "original_error_type": type(error).__name__,
            "original_message": str(error),
            **context
        },
        original_error=error
    )
    
    # 再帰的に処理
    return handle_image_error(image_error, context, request_id)


def classify_error(error: Exception) -> tuple[ErrorType, ErrorSeverity]:
    """
    例外を分類してエラータイプと重要度を決定
    
    Args:
        error: 分類する例外
        
    Returns:
        tuple[ErrorType, ErrorSeverity]: エラータイプと重要度
    """
    error_message = str(error).lower()
    error_type_name = type(error).__name__.lower()
    
    # パラメータエラー
    if any(keyword in error_message for keyword in [
        'parameter', 'invalid', 'missing', 'required', 'validation'
    ]):
        return ErrorType.PARAMETER_ERROR, ErrorSeverity.LOW
    
    # 画像取得エラー
    if any(keyword in error_message for keyword in [
        'fetch', 'download', 'url', 'http', 'connection'
    ]):
        return ErrorType.IMAGE_FETCH_ERROR, ErrorSeverity.MEDIUM
    
    # S3エラー
    if any(keyword in error_message for keyword in [
        's3', 'bucket', 'key', 'access denied', 'not found'
    ]) or 'boto' in error_type_name:
        return ErrorType.S3_ERROR, ErrorSeverity.MEDIUM
    
    # 画像処理エラー
    if any(keyword in error_message for keyword in [
        'image', 'pillow', 'pil', 'resize', 'composite', 'format'
    ]):
        return ErrorType.IMAGE_PROCESSING_ERROR, ErrorSeverity.MEDIUM
    
    # ネットワークエラー
    if any(keyword in error_message for keyword in [
        'network', 'timeout', 'connection', 'dns', 'socket'
    ]) or error_type_name in ['connectionerror', 'timeout', 'urlerror']:
        return ErrorType.NETWORK_ERROR, ErrorSeverity.MEDIUM
    
    # タイムアウトエラー
    if 'timeout' in error_message or error_type_name == 'timeouterror':
        return ErrorType.TIMEOUT_ERROR, ErrorSeverity.HIGH
    
    # メモリエラー
    if 'memory' in error_message or error_type_name == 'memoryerror':
        return ErrorType.MEMORY_ERROR, ErrorSeverity.CRITICAL
    
    # デフォルト
    return ErrorType.INTERNAL_ERROR, ErrorSeverity.MEDIUM


def get_user_friendly_message(error: Exception, error_type: ErrorType) -> str:
    """
    ユーザーフレンドリーなエラーメッセージを生成
    
    Args:
        error: 元の例外
        error_type: エラータイプ
        
    Returns:
        str: ユーザーフレンドリーなメッセージ
    """
    error_messages = {
        ErrorType.PARAMETER_ERROR: "パラメータエラー",
        ErrorType.IMAGE_FETCH_ERROR: "画像の取得に失敗しました",
        ErrorType.IMAGE_PROCESSING_ERROR: "画像の処理中にエラーが発生しました",
        ErrorType.S3_ERROR: "S3ストレージへのアクセスでエラーが発生しました",
        ErrorType.NETWORK_ERROR: "ネットワークエラーが発生しました",
        ErrorType.VALIDATION_ERROR: "入力値の検証でエラーが発生しました",
        ErrorType.TIMEOUT_ERROR: "処理がタイムアウトしました",
        ErrorType.MEMORY_ERROR: "メモリ不足のため処理を完了できませんでした",
        ErrorType.INTERNAL_ERROR: "内部エラーが発生しました",
    }
    
    base_message = error_messages.get(error_type, "予期しないエラーが発生しました")
    
    # 特定のエラーに対する詳細メッセージ
    error_str = str(error).lower()
    
    if error_type == ErrorType.PARAMETER_ERROR:
        if 'image1' in error_str:
            return "image1パラメータが無効です"
        elif 'image2' in error_str:
            return "image2パラメータが無効です"
        elif 'image3' in error_str:
            return "image3パラメータが無効です"
        elif 'required' in error_str:
            return "必須パラメータが不足しています"
    
    elif error_type == ErrorType.IMAGE_FETCH_ERROR:
        if 'not found' in error_str:
            return "指定された画像が見つかりません"
        elif 'access denied' in error_str:
            return "画像へのアクセスが拒否されました"
        elif 'timeout' in error_str:
            return "画像の取得がタイムアウトしました"
    
    elif error_type == ErrorType.IMAGE_PROCESSING_ERROR:
        if 'format' in error_str:
            return "サポートされていない画像形式です"
        elif 'size' in error_str:
            return "画像サイズが制限を超えています"
        elif 'corrupt' in error_str:
            return "画像ファイルが破損しています"
    
    return base_message


def log_error(
    error: Union[Exception, ImageProcessorError],
    context: Optional[Dict[str, Any]] = None,
    request_id: Optional[str] = None
) -> None:
    """
    エラーを詳細にログ出力
    
    Args:
        error: ログ出力する例外
        context: コンテキスト情報
        request_id: リクエストID
    """
    context = context or {}
    request_id = request_id or "unknown"
    
    if isinstance(error, ImageProcessorError):
        log_data = {
            "request_id": request_id,
            "error_id": error.error_id,
            "error_type": error.error_type.value,
            "severity": error.severity.value,
            "message": error.message,
            "timestamp": error.timestamp,
            "details": error.details,
            "context": context
        }
        
        # 重要度に応じてログレベルを調整
        if error.severity == ErrorSeverity.CRITICAL:
            logger.critical(f"CRITICAL ERROR: {json.dumps(log_data, ensure_ascii=False)}")
        elif error.severity == ErrorSeverity.HIGH:
            logger.error(f"HIGH SEVERITY ERROR: {json.dumps(log_data, ensure_ascii=False)}")
        elif error.severity == ErrorSeverity.MEDIUM:
            logger.warning(f"MEDIUM SEVERITY ERROR: {json.dumps(log_data, ensure_ascii=False)}")
        else:
            logger.info(f"LOW SEVERITY ERROR: {json.dumps(log_data, ensure_ascii=False)}")
        
        # 元の例外のスタックトレースも出力
        if error.original_error:
            logger.debug(f"Original error traceback: {traceback.format_exception(type(error.original_error), error.original_error, error.original_error.__traceback__)}")
    
    else:
        # 一般的な例外の場合
        log_data = {
            "request_id": request_id,
            "error_type": type(error).__name__,
            "message": str(error),
            "timestamp": datetime.utcnow().isoformat(),
            "context": context,
            "traceback": traceback.format_exc()
        }
        
        logger.error(f"UNHANDLED ERROR: {json.dumps(log_data, ensure_ascii=False)}")


def log_request_info(
    request_id: str,
    event: Dict[str, Any],
    context_info: Optional[Dict[str, Any]] = None
) -> None:
    """
    リクエスト情報をログ出力
    
    Args:
        request_id: リクエストID
        event: Lambdaイベント
        context_info: 追加のコンテキスト情報
    """
    context_info = context_info or {}
    
    log_data = {
        "request_id": request_id,
        "timestamp": datetime.utcnow().isoformat(),
        "event_type": "request_start",
        "query_parameters": event.get("queryStringParameters", {}),
        "headers": event.get("headers", {}),
        "context": context_info,
        "version": "2.4.1"
    }
    
    logger.info(f"REQUEST START: {json.dumps(log_data, ensure_ascii=False)}")


def log_response_info(
    request_id: str,
    response: Dict[str, Any],
    processing_time: Optional[float] = None
) -> None:
    """
    レスポンス情報をログ出力
    
    Args:
        request_id: リクエストID
        response: レスポンス情報
        processing_time: 処理時間（秒）
    """
    log_data = {
        "request_id": request_id,
        "timestamp": datetime.utcnow().isoformat(),
        "event_type": "request_end",
        "status_code": response.get("statusCode"),
        "processing_time": processing_time,
        "response_size": len(str(response.get("body", ""))),
        "version": "2.4.1"
    }
    
    logger.info(f"REQUEST END: {json.dumps(log_data, ensure_ascii=False)}")


def create_error_response(
    error: Union[Exception, ImageProcessorError],
    status_code: int = 500,
    context: Optional[Dict[str, Any]] = None,
    request_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    エラーレスポンスを作成
    
    Args:
        error: 例外オブジェクト
        status_code: HTTPステータスコード
        context: エラーコンテキスト
        request_id: リクエストID
        
    Returns:
        Dict[str, Any]: Lambda用のレスポンス
    """
    error_data = handle_image_error(error, context, request_id)
    
    # ステータスコードを調整
    if isinstance(error, ImageProcessorError):
        if error.error_type == ErrorType.PARAMETER_ERROR:
            status_code = 400
        elif error.error_type == ErrorType.VALIDATION_ERROR:
            status_code = 400
        elif error.error_type in [ErrorType.IMAGE_FETCH_ERROR, ErrorType.S3_ERROR]:
            status_code = 404
        elif error.error_type == ErrorType.TIMEOUT_ERROR:
            status_code = 408
        elif error.error_type == ErrorType.MEMORY_ERROR:
            status_code = 507
    
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "X-Request-ID": request_id or "unknown",
            "X-Error-ID": error_data.get("error_id", "unknown")
        },
        "body": json.dumps(error_data, ensure_ascii=False)
    }


# 便利な例外クラス
class ParameterError(ImageProcessorError):
    """パラメータエラー"""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            error_type=ErrorType.PARAMETER_ERROR,
            severity=ErrorSeverity.LOW,
            details=details
        )


class ImageFetchError(ImageProcessorError):
    """画像取得エラー"""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            error_type=ErrorType.IMAGE_FETCH_ERROR,
            severity=ErrorSeverity.MEDIUM,
            details=details
        )


class ImageProcessingError(ImageProcessorError):
    """画像処理エラー"""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            error_type=ErrorType.IMAGE_PROCESSING_ERROR,
            severity=ErrorSeverity.MEDIUM,
            details=details
        )


class ValidationError(ImageProcessorError):
    """バリデーションエラー"""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            error_type=ErrorType.VALIDATION_ERROR,
            severity=ErrorSeverity.LOW,
            details=details
        )