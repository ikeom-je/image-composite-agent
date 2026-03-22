"""
画像取得エンジン - v2.4.0

S3、HTTP/HTTPS、テスト画像から並列処理で高速に画像を取得するモジュール。
"""

try:
    import boto3
except ImportError:
    boto3 = None

try:
    import requests
except ImportError:
    requests = None

from PIL import Image
import io
import os
import re
import logging
import concurrent.futures
from typing import Dict, Optional, Any
from test_image_generator import (
    generate_circle_image,
    generate_rectangle_image,
    generate_triangle_image
)

# ログ設定
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def fetch_image_from_s3(s3_path: str, s3_client=None) -> Image.Image:
    """
    S3から画像を取得する
    
    Args:
        s3_path: S3パス (s3://bucket/key 形式)
        s3_client: boto3 S3クライアント（Noneの場合は新規作成）
        
    Returns:
        PIL.Image.Image: 取得した画像
        
    Raises:
        ValueError: S3パスの形式が無効な場合
        Exception: S3からの取得に失敗した場合
    """
    if boto3 is None:
        raise Exception("boto3 is not available")
    
    if s3_client is None:
        s3_client = boto3.client('s3')
    
    # S3パスを解析
    s3_pattern = r'^(?:s3://)?([^/]+)/(.+)$'
    match = re.match(s3_pattern, s3_path)
    
    if not match:
        raise ValueError(f"Invalid S3 path format: {s3_path}")
    
    bucket_name, object_key = match.groups()
    
    try:
        logger.info(f"Fetching image from S3: s3://{bucket_name}/{object_key}")
        
        # S3からオブジェクトを取得
        response = s3_client.get_object(Bucket=bucket_name, Key=object_key)
        
        # 画像を開く
        image = Image.open(io.BytesIO(response['Body'].read()))
        
        # RGBAモードに変換（透過情報保持）
        if image.mode != 'RGBA':
            image = image.convert('RGBA')
        
        logger.info(f"✅ Successfully loaded image from S3: {image.size} {image.mode}")
        return image
        
    except Exception as e:
        logger.error(f"❌ Failed to fetch image from S3: {e}")
        raise Exception(f"Failed to fetch image from S3 {s3_path}: {str(e)}")


def fetch_image_from_url(url: str, timeout: int = 30) -> Image.Image:
    """
    HTTP/HTTPSのURLから画像を取得する
    
    Args:
        url: 画像のURL
        timeout: タイムアウト時間（秒）
        
    Returns:
        PIL.Image.Image: 取得した画像
        
    Raises:
        Exception: URLからの取得に失敗した場合
    """
    if requests is None:
        raise Exception("requests is not available")
    
    try:
        logger.info(f"Fetching image from URL: {url}")
        
        # HTTPリクエストで画像を取得
        response = requests.get(url, timeout=timeout, stream=True)
        response.raise_for_status()
        
        # 画像を開く
        image = Image.open(io.BytesIO(response.content))
        
        # RGBAモードに変換（透過情報保持）
        if image.mode != 'RGBA':
            image = image.convert('RGBA')
        
        logger.info(f"✅ Successfully loaded image from URL: {image.size} {image.mode}")
        return image
        
    except Exception as e:
        logger.error(f"❌ Failed to fetch image from URL: {e}")
        raise Exception(f"Failed to fetch image from URL {url}: {str(e)}")


def get_test_image(image_type: str) -> Image.Image:
    """
    テスト画像の自動選択（3画像対応）
    
    Args:
        image_type: 画像タイプ ('base', 'baseImage', 'image1', 'image2', 'image3')
        
    Returns:
        PIL.Image.Image: 生成されたテスト画像
        
    Raises:
        Exception: テスト画像の生成に失敗した場合
    """
    try:
        logger.info(f"Generating test image for type: {image_type}")
        
        # 環境変数からテストバケット名を取得
        test_bucket = os.environ.get('TEST_BUCKET')
        
        if test_bucket:
            # S3からテスト画像を取得する場合
            test_image_map = {
                'base': 'images/default-base.png',
                'baseImage': 'images/default-base.png',
                'image1': 'images/circle_red.png',
                'image2': 'images/rectangle_blue.png',
                'image3': 'images/triangle_green.png'
            }

            image_path = test_image_map.get(image_type, 'images/default-base.png')
            s3_path = f"s3://{test_bucket}/{image_path}"
            return fetch_image_from_s3(s3_path)
        
        else:
            # ローカルでテスト画像を生成する場合
            if image_type in ['image1']:
                image = generate_circle_image()
            elif image_type in ['image2']:
                image = generate_rectangle_image()
            elif image_type in ['image3']:
                image = generate_triangle_image()
            else:
                # ベース画像用のデフォルト画像を生成
                image = generate_rectangle_image(size=(400, 200), color=(255, 153, 0))
            
            logger.info(f"✅ Generated test image: {image.size} {image.mode}")
            return image
            
    except Exception as e:
        logger.error(f"❌ Failed to generate test image: {e}")
        raise Exception(f"Failed to generate test image for {image_type}: {str(e)}")


def fetch_image(url_or_s3_path: str, image_type: str = "unknown") -> Image.Image:
    """
    画像取得の統一インターフェース
    
    Args:
        url_or_s3_path: 画像のパス（S3パス、HTTP URL、または"test"）
        image_type: 画像タイプ（テスト画像生成時に使用）
        
    Returns:
        PIL.Image.Image: 取得した画像
        
    Raises:
        ValueError: サポートされていないパス形式の場合
        Exception: 画像取得に失敗した場合
    """
    if not url_or_s3_path:
        raise ValueError("Image path cannot be empty")
    
    # テスト画像指定の場合
    if url_or_s3_path == "test":
        return get_test_image(image_type)
    
    # S3パスの場合
    if url_or_s3_path.startswith('s3://'):
        return fetch_image_from_s3(url_or_s3_path)
    
    # HTTP/HTTPSの場合
    if url_or_s3_path.startswith(('http://', 'https://')):
        return fetch_image_from_url(url_or_s3_path)

    # アップロード済み画像（ファイル名またはS3キー）
    upload_bucket = os.environ.get('S3_UPLOAD_BUCKET', os.environ.get('UPLOAD_BUCKET', ''))
    if upload_bucket and boto3 is not None:
        # S3キー形式（uploads/images/...）の場合はそのまま使用
        if url_or_s3_path.startswith('uploads/'):
            s3_key = url_or_s3_path
        else:
            # ファイル名のみの場合はプレフィックスを付与
            s3_key = f"uploads/images/{url_or_s3_path}"

        logger.info(f"Fetching uploaded image: s3://{upload_bucket}/{s3_key}")
        return fetch_image_from_s3(f"s3://{upload_bucket}/{s3_key}")

    raise ValueError(f"Unsupported image path format: {url_or_s3_path}")


def fetch_images_parallel(image_paths: Dict[str, str], max_workers: int = 4) -> Dict[str, Image.Image]:
    """
    複数画像の並列取得（高速化）
    
    Args:
        image_paths: 画像パスの辞書 {'name': 'path'}
        max_workers: 最大並列実行数
        
    Returns:
        Dict[str, Image.Image]: 取得した画像の辞書
        
    Raises:
        ValueError: 必須画像の取得に失敗した場合
    """
    logger.info(f"Starting parallel image fetch for {len(image_paths)} images")
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_path = {}
        
        # 各画像の取得タスクを並列実行
        for name, path in image_paths.items():
            if path:  # パスが指定されている場合のみ
                future = executor.submit(fetch_image, path, name)
                future_to_path[future] = name
        
        images = {}
        errors = {}
        
        # 結果を収集
        for future in concurrent.futures.as_completed(future_to_path):
            name = future_to_path[future]
            try:
                images[name] = future.result()
                logger.info(f"✅ Successfully loaded {name}")
            except Exception as e:
                error_msg = str(e)
                errors[name] = error_msg
                logger.error(f"❌ Error loading image {name}: {error_msg}")
        
        # エラーハンドリング
        if errors:
            # 必須画像（image1, image2）でエラーがある場合は例外を発生
            required_images = ['image1', 'image2']
            for required in required_images:
                if required in errors:
                    raise ValueError(f"Failed to load required image {required}: {errors[required]}")
            
            # オプション画像のエラーは警告として記録
            for name, error in errors.items():
                logger.warning(f"Optional image {name} failed to load: {error}")
        
        logger.info(f"Parallel image fetch completed: {len(images)} images loaded")
        return images


def validate_image_path(path: str) -> bool:
    """
    画像パスの形式を検証する
    
    Args:
        path: 検証する画像パス
        
    Returns:
        bool: 有効な形式の場合True
    """
    if not path:
        return False
    
    # テスト画像
    if path == "test":
        return True
    
    # S3パス
    if path.startswith('s3://'):
        s3_pattern = r'^s3://[^/]+/.+$'
        return bool(re.match(s3_pattern, path))
    
    # HTTP/HTTPS URL
    if path.startswith(('http://', 'https://')):
        url_pattern = r'^https?://[^\s/$.?#].[^\s]*$'
        return bool(re.match(url_pattern, path))

    # アップロード済み画像（ファイル名またはS3キー）
    if path.startswith('uploads/') or '.' in path:
        return True

    return False


if __name__ == "__main__":
    # テスト実行用
    print("画像取得エンジンテスト")
    
    # テスト画像の取得テスト
    try:
        test_images = {
            'image1': 'test',
            'image2': 'test',
            'image3': 'test'
        }
        
        images = fetch_images_parallel(test_images)
        
        print(f"✅ 並列画像取得テスト完了: {len(images)}個の画像を取得")
        for name, image in images.items():
            print(f"  - {name}: {image.size} {image.mode}")
        
        # パス検証テスト
        print("\n📋 パス検証テスト:")
        test_paths = [
            "test",
            "s3://bucket/key",
            "https://example.com/image.png",
            "invalid-path"
        ]
        
        for path in test_paths:
            is_valid = validate_image_path(path)
            status = "✅" if is_valid else "❌"
            print(f"  {status} {path}: {'有効' if is_valid else '無効'}")
            
    except Exception as e:
        print(f"❌ テストエラー: {e}")