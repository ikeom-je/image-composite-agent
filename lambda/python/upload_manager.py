"""
Upload Manager Lambda Function
S3画像アップロード機能を管理するLambda関数

機能:
- 署名付きURL生成
- アップロード済み画像一覧取得
- アップロード完了処理
- サムネイル生成
"""

import boto3
import json
import uuid
import os
import io
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List
from PIL import Image

# ログ設定
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# S3クライアント
s3_client = boto3.client('s3')

def format_response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    """
    API Gateway用のレスポンス形式を生成
    """
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Amz-Date, Authorization, X-Api-Key'
        },
        'body': json.dumps(body, ensure_ascii=False, default=str)
    }

def generate_presigned_upload_url(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    画像アップロード用の署名付きURL生成
    
    Args:
        event: API Gateway event
        context: Lambda context
        
    Returns:
        署名付きURLとメタデータを含むレスポンス
    """
    try:
        # リクエストボディの解析
        body = json.loads(event.get('body', '{}'))
        file_name = body.get('fileName')
        file_type = body.get('fileType')
        file_size = body.get('fileSize', 0)
        
        logger.info(f"Generating presigned URL for: {file_name}, type: {file_type}, size: {file_size}")
        
        # パラメータ検証
        if not file_name or not file_type:
            return format_response(400, {'error': 'fileName and fileType are required'})
        
        # ファイルサイズ制限（10MB）
        if file_size > 10 * 1024 * 1024:
            return format_response(400, {'error': 'File size exceeds 10MB limit'})
        
        # 対応ファイル形式の検証（画像のみ）
        allowed_types = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'image/tiff', 'image/x-tga'
        ]
        if file_type not in allowed_types:
            return format_response(400, {'error': f'Unsupported file type: {file_type}'})
        
        # ユニークなファイル名生成
        file_extension = file_name.split('.')[-1] if '.' in file_name else 'png'
        unique_filename = f"{uuid.uuid4()}-{datetime.now().strftime('%Y%m%d_%H%M%S')}.{file_extension}"
        
        # S3キーの生成
        s3_key = f"uploads/images/{unique_filename}"
        
        # 署名付きURL生成
        upload_bucket = os.environ.get('UPLOAD_BUCKET')
        if not upload_bucket:
            return format_response(500, {'error': 'Upload bucket not configured'})
        
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': upload_bucket,
                'Key': s3_key,
                'ContentType': file_type
            },
            ExpiresIn=3600  # 1時間有効
        )
        
        logger.info(f"Generated presigned URL for key: {s3_key}")
        
        return format_response(200, {
            'uploadUrl': presigned_url,
            's3Key': s3_key,
            'bucketName': upload_bucket,
            'expiresIn': 3600,
            'uniqueFilename': unique_filename
        })
        
    except json.JSONDecodeError:
        return format_response(400, {'error': 'Invalid JSON in request body'})
    except Exception as e:
        logger.error(f"Presigned URL generation error: {e}")
        return format_response(500, {'error': str(e)})

def list_uploaded_images(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    アップロードされた画像の一覧取得
    
    Args:
        event: API Gateway event
        context: Lambda context
        
    Returns:
        画像一覧とメタデータを含むレスポンス
    """
    try:
        upload_bucket = os.environ.get('UPLOAD_BUCKET')
        if not upload_bucket:
            return format_response(500, {'error': 'Upload bucket not configured'})
        
        # クエリパラメータの取得
        query_params = event.get('queryStringParameters') or {}
        max_keys = int(query_params.get('maxKeys', 50))
        continuation_token = query_params.get('continuationToken')
        
        logger.info(f"Listing images from bucket: {upload_bucket}")
        
        # S3オブジェクト一覧取得のパラメータ
        list_params = {
            'Bucket': upload_bucket,
            'Prefix': 'uploads/images/',
            'MaxKeys': min(max_keys, 100)  # 最大100件に制限
        }
        
        if continuation_token:
            list_params['ContinuationToken'] = continuation_token
        
        # 画像ファイルのみを取得
        response = s3_client.list_objects_v2(**list_params)
        
        images = []
        if 'Contents' in response:
            for obj in response['Contents']:
                try:
                    # メタデータ取得
                    head_response = s3_client.head_object(
                        Bucket=upload_bucket,
                        Key=obj['Key']
                    )
                    
                    # サムネイルキーの生成
                    thumbnail_key = obj['Key'].replace('uploads/images/', 'thumbnails/').replace(
                        obj['Key'].split('.')[-1], 'png'
                    )
                    
                    # サムネイルURLの生成
                    thumbnail_url = None
                    try:
                        s3_client.head_object(Bucket=upload_bucket, Key=thumbnail_key)
                        thumbnail_url = s3_client.generate_presigned_url(
                            'get_object',
                            Params={'Bucket': upload_bucket, 'Key': thumbnail_key},
                            ExpiresIn=3600
                        )
                    except s3_client.exceptions.NoSuchKey:
                        # サムネイルが存在しない場合は元画像を使用
                        thumbnail_url = s3_client.generate_presigned_url(
                            'get_object',
                            Params={'Bucket': upload_bucket, 'Key': obj['Key']},
                            ExpiresIn=3600
                        )
                    
                    images.append({
                        'key': obj['Key'],
                        's3Path': f"s3://{upload_bucket}/{obj['Key']}",
                        'fileName': obj['Key'].split('/')[-1],
                        'size': obj['Size'],
                        'lastModified': obj['LastModified'].isoformat(),
                        'contentType': head_response.get('ContentType', 'image/jpeg'),
                        'thumbnailUrl': thumbnail_url
                    })
                    
                except Exception as e:
                    logger.warning(f"Error processing object {obj['Key']}: {e}")
                    continue
        
        # レスポンス構築
        result = {
            'images': images,
            'count': len(images),
            'isTruncated': response.get('IsTruncated', False)
        }
        
        if response.get('NextContinuationToken'):
            result['nextContinuationToken'] = response['NextContinuationToken']
        
        logger.info(f"Found {len(images)} images")
        
        return format_response(200, result)
        
    except Exception as e:
        logger.error(f"Image list error: {e}")
        return format_response(500, {'error': str(e)})

def handle_upload_completion(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    S3アップロード完了時の処理（S3イベント経由）
    
    Args:
        event: S3 event
        context: Lambda context
        
    Returns:
        処理結果
    """
    try:
        for record in event['Records']:
            bucket_name = record['s3']['bucket']['name']
            object_key = record['s3']['object']['key']
            
            logger.info(f"Processing upload completion: {object_key}")
            
            # 画像の場合はサムネイル生成
            if object_key.startswith('uploads/images/'):
                generate_thumbnail(bucket_name, object_key)
            
            logger.info(f"Upload completed: {object_key}")
        
        return {'statusCode': 200}
        
    except Exception as e:
        logger.error(f"Upload completion handler error: {e}")
        return {'statusCode': 500}

def generate_thumbnail(bucket_name: str, object_key: str) -> None:
    """
    画像のサムネイル生成（PNG形式で統一）
    
    Args:
        bucket_name: S3バケット名
        object_key: S3オブジェクトキー
    """
    try:
        logger.info(f"Generating thumbnail for: {object_key}")
        
        # 元画像を取得
        response = s3_client.get_object(Bucket=bucket_name, Key=object_key)
        image = Image.open(io.BytesIO(response['Body'].read()))
        
        # RGBAモードに変換（透過情報保持）
        if image.mode != 'RGBA':
            image = image.convert('RGBA')
        
        # サムネイル生成（200x200、アスペクト比保持）
        image.thumbnail((200, 200), Image.LANCZOS)
        
        # PNG形式でサムネイルを保存
        thumbnail_key = object_key.replace('uploads/images/', 'thumbnails/').replace(
            object_key.split('.')[-1], 'png'
        )
        thumbnail_buffer = io.BytesIO()
        image.save(thumbnail_buffer, format='PNG', optimize=True)
        thumbnail_buffer.seek(0)
        
        s3_client.put_object(
            Bucket=bucket_name,
            Key=thumbnail_key,
            Body=thumbnail_buffer.getvalue(),
            ContentType='image/png'
        )
        
        logger.info(f"PNG thumbnail generated: {thumbnail_key}")
        
    except Exception as e:
        logger.error(f"Thumbnail generation error for {object_key}: {e}")

def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    メインハンドラー関数
    
    Args:
        event: Lambda event
        context: Lambda context
        
    Returns:
        処理結果
    """
    try:
        # HTTPメソッドとパスに基づいてルーティング
        http_method = event.get('httpMethod', '').upper()
        path = event.get('path', '')
        
        logger.info(f"Processing request: {http_method} {path}")
        
        if http_method == 'POST' and path.endswith('/presigned-url'):
            return generate_presigned_upload_url(event, context)
        elif http_method == 'GET' and path.endswith('/images'):
            return list_uploaded_images(event, context)
        elif 'Records' in event:
            # S3イベント
            return handle_upload_completion(event, context)
        else:
            return format_response(404, {'error': 'Not found'})
            
    except Exception as e:
        logger.error(f"Handler error: {e}")
        return format_response(500, {'error': str(e)})