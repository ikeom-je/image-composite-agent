"""
画像合成REST API メインハンドラー - v3.2.0

2つまたは3つの画像を合成してPNG形式で出力するLambda関数。
HTML表示とPNG直接ダウンロードの両方に対応。
"""

import json
import base64
import io
import os
import logging
import time
import uuid
import boto3
from datetime import datetime
from typing import Dict, Any, Optional

from PIL import Image
from image_fetcher import fetch_images_parallel
from image_compositor import create_composite_image, parse_image_parameters
from test_image_generator import generate_circle_image, generate_rectangle_image, generate_triangle_image
from video_generator import generate_video_from_image, get_video_mime_type, get_video_extension, VideoGenerationError
from error_handler import (
    handle_image_error, create_error_response, log_request_info, log_response_info,
    ParameterError, ImageFetchError, ImageProcessingError, ValidationError
)

# ログ設定
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# バージョン情報
VERSION = os.environ.get('VERSION', '3.1.1')


def format_response(status_code: int, body: Any, headers: Dict[str, str] = None) -> Dict:
    """
    統一されたレスポンス形式
    
    Args:
        status_code: HTTPステータスコード
        body: レスポンスボディ
        headers: 追加ヘッダー
        
    Returns:
        Dict: API Gateway用のレスポンス
    """
    default_headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Amz-Date, Authorization, X-Api-Key'
    }
    
    if headers:
        default_headers.update(headers)
    
    return {
        'statusCode': status_code,
        'headers': default_headers,
        'body': json.dumps(body) if isinstance(body, (dict, list)) else body
    }


def validate_required_parameters(query_params: Dict[str, str]) -> list:
    """
    必須パラメータの検証
    
    Args:
        query_params: クエリパラメータ
        
    Returns:
        list: エラーメッセージのリスト（空の場合は検証成功）
    """
    errors = []
    
    # image1またはテキストパラメータが必須
    has_text = any(query_params.get(f'text{i}') for i in range(1, 4))
    if not query_params.get('image1') and not has_text:
        errors.append('image1パラメータまたはtext1〜text3パラメータは必須です')
    
    # フォーマットパラメータの検証
    format_param = query_params.get('format', 'png')
    if format_param not in ['png', 'html']:
        errors.append('formatパラメータはpngまたはhtmlである必要があります')
    
    # 動画生成パラメータの検証（オプション）
    generate_video = query_params.get('generate_video', 'false').lower()
    if generate_video == 'true':
        # 動画生成が有効な場合の追加検証
        video_duration = query_params.get('video_duration', '3')
        video_format = query_params.get('video_format', 'XMF')
        
        try:
            duration_int = int(video_duration)
            if duration_int < 1 or duration_int > 30:
                errors.append('video_durationは1から30の間の整数である必要があります')
        except ValueError:
            errors.append('video_durationは整数である必要があります')
        
        supported_formats = ['XMF', 'MP4', 'WEBM', 'AVI']
        if video_format not in supported_formats:
            errors.append(f'video_formatは{", ".join(supported_formats)}のいずれかである必要があります')
    
    return errors


def generate_html_response(composite_img: Image.Image, query_params: Dict[str, str]) -> str:
    """
    HTML形式のレスポンスを生成
    
    Args:
        composite_img: 合成画像
        query_params: クエリパラメータ
        
    Returns:
        str: HTMLコンテンツ
    """
    # 画像をBase64エンコード
    img_buffer = io.BytesIO()
    composite_img.save(img_buffer, format='PNG', optimize=True)
    img_base64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
    
    # 使用された画像の情報
    image_info = []
    for i in range(1, 4):
        image_param = query_params.get(f'image{i}')
        if image_param:
            image_info.append({
                'name': f'image{i}',
                'source': image_param,
                'x': query_params.get(f'image{i}X', 'デフォルト'),
                'y': query_params.get(f'image{i}Y', 'デフォルト'),
                'width': query_params.get(f'image{i}Width', 'デフォルト'),
                'height': query_params.get(f'image{i}Height', 'デフォルト')
            })
    
    # HTMLテンプレート
    html_content = f"""
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>画像合成結果 - v{VERSION}</title>
    <style>
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }}
        .container {{
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }}
        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }}
        .header h1 {{
            margin: 0;
            font-size: 2.5em;
            font-weight: 300;
        }}
        .version {{
            opacity: 0.8;
            font-size: 0.9em;
            margin-top: 10px;
        }}
        .content {{
            padding: 30px;
        }}
        .image-container {{
            text-align: center;
            margin: 30px 0;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 10px;
        }}
        .composite-image {{
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }}
        .info-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }}
        .info-card {{
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            border-left: 4px solid #667eea;
        }}
        .info-card h3 {{
            margin: 0 0 15px 0;
            color: #667eea;
            font-size: 1.2em;
        }}
        .param-table {{
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }}
        .param-table th, .param-table td {{
            padding: 8px 12px;
            text-align: left;
            border-bottom: 1px solid #dee2e6;
        }}
        .param-table th {{
            background: #e9ecef;
            font-weight: 600;
        }}
        .download-section {{
            text-align: center;
            margin: 30px 0;
            padding: 20px;
            background: #e8f4fd;
            border-radius: 10px;
        }}
        .download-btn {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 25px;
            font-size: 1.1em;
            cursor: pointer;
            transition: transform 0.2s;
            margin: 10px;
        }}
        .download-btn:hover {{
            transform: translateY(-2px);
        }}
        .tech-info {{
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            margin-top: 20px;
        }}
        .footer {{
            text-align: center;
            padding: 20px;
            background: #f8f9fa;
            color: #666;
            font-size: 0.9em;
        }}
        @media (max-width: 768px) {{
            .container {{
                margin: 10px;
                border-radius: 10px;
            }}
            .header {{
                padding: 20px;
            }}
            .header h1 {{
                font-size: 2em;
            }}
            .content {{
                padding: 20px;
            }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎨 画像合成完了</h1>
            <div class="version">Version {VERSION} - 高性能・アルファチャンネル対応</div>
        </div>
        
        <div class="content">
            <div class="image-container">
                <img src="data:image/png;base64,{img_base64}" alt="合成画像" class="composite-image" id="compositeImage">
            </div>
            
            <div class="download-section">
                <h3>📥 画像ダウンロード</h3>
                <button class="download-btn" onclick="downloadImage()">
                    🖼️ PNG画像をダウンロード
                </button>
                <button class="download-btn" onclick="copyImageData()">
                    📋 画像データをコピー
                </button>
            </div>
            
            <div class="info-grid">
                <div class="info-card">
                    <h3>📊 合成情報</h3>
                    <table class="param-table">
                        <tr><th>項目</th><th>値</th></tr>
                        <tr><td>画像サイズ</td><td>{composite_img.size[0]} × {composite_img.size[1]} px</td></tr>
                        <tr><td>カラーモード</td><td>{composite_img.mode}</td></tr>
                        <tr><td>合成画像数</td><td>{len(image_info)}枚</td></tr>
                        <tr><td>処理時刻</td><td>{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</td></tr>
                    </table>
                </div>
                
                <div class="info-card">
                    <h3>🎯 使用画像</h3>
                    <table class="param-table">
                        <tr><th>画像</th><th>ソース</th><th>位置</th><th>サイズ</th></tr>
                        {''.join([f'<tr><td>{img["name"]}</td><td>{img["source"]}</td><td>({img["x"]}, {img["y"]})</td><td>{img["width"]}×{img["height"]}</td></tr>' for img in image_info])}
                    </table>
                </div>
            </div>
            
            <div class="tech-info">
                <h3>🔧 技術情報</h3>
                <p><strong>API バージョン:</strong> {VERSION}</p>
                <p><strong>処理エンジン:</strong> Python + Pillow (LANCZOS補間)</p>
                <p><strong>アルファチャンネル:</strong> 完全対応</p>
                <p><strong>並列処理:</strong> ThreadPoolExecutor使用</p>
                <p><strong>出力形式:</strong> PNG (最適化済み)</p>
            </div>
        </div>
        
        <div class="footer">
            <p>🎨 画像合成REST API v{VERSION} - 高性能・アルファチャンネル対応</p>
            <p>Powered by AWS Lambda + Python + Pillow</p>
        </div>
    </div>

    <script>
        function downloadImage() {{
            const base64Data = '{img_base64}';
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            
            for (let i = 0; i < byteCharacters.length; i++) {{
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }}
            
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], {{type: 'image/png'}});
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'composite-image-v{VERSION}-{datetime.now().strftime("%Y%m%d_%H%M%S")}.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            console.log('✅ 画像ダウンロード完了');
        }}
        
        function copyImageData() {{
            const imageData = 'data:image/png;base64,{img_base64}';
            navigator.clipboard.writeText(imageData).then(() => {{
                alert('📋 画像データをクリップボードにコピーしました');
            }}).catch(err => {{
                console.error('コピーに失敗しました:', err);
                alert('❌ コピーに失敗しました');
            }});
        }}
        
        // 画像読み込みエラー時の処理
        document.getElementById('compositeImage').onerror = function() {{
            this.alt = '画像の読み込みに失敗しました';
            this.style.background = '#f8f9fa';
            this.style.border = '2px dashed #dee2e6';
            this.style.padding = '50px';
        }};
        
        console.log('🎨 画像合成REST API v{VERSION}');
        console.log('📊 合成画像サイズ: {composite_img.size[0]} × {composite_img.size[1]} px');
        console.log('🎯 使用画像数: {len(image_info)}枚');
    </script>
</body>
</html>
    """
    
    return html_content.strip()





def handler(event, context):
    """
    Lambda ハンドラー関数 - v3.2.0 (テキストオーバーレイ対応版)
    2つまたは3つの画像を合成してPNG形式で出力
    
    Args:
        event: API Gatewayイベント
        context: Lambda実行コンテキスト
        
    Returns:
        Dict: API Gateway用のレスポンス
    """
    # リクエストIDを生成
    request_id = str(uuid.uuid4())
    start_time = time.time()
    
    try:
        # リクエスト開始ログ
        log_request_info(request_id, event, {
            "lambda_request_id": context.aws_request_id if context else "unknown",
            "function_name": context.function_name if context else "unknown",
            "memory_limit": context.memory_limit_in_mb if context else "unknown"
        })
        
        logger.info(f"🚀 Image composition started - v{VERSION} [Request ID: {request_id}]")
        
        # パラメータ解析（POST bodyまたはGETクエリパラメータ）
        http_method = event.get('httpMethod', 'GET')
        if http_method == 'POST':
            # POSTの場合はbodyからJSONパラメータを取得
            body = event.get('body', '{}') or '{}'
            if event.get('isBase64Encoded', False):
                body = base64.b64decode(body).decode('utf-8')
            try:
                body_params = json.loads(body)
            except (json.JSONDecodeError, TypeError):
                body_params = {}
            # bodyの値をすべて文字列に変換（クエリパラメータとの互換性のため）
            query_params = {k: str(v) for k, v in body_params.items()}
        else:
            query_params = event.get('queryStringParameters', {}) or {}
        logger.info(f"📋 [{http_method}] Parameters: {query_params} [Request ID: {request_id}]")
        
        # 必須パラメータの検証
        validation_errors = validate_required_parameters(query_params)
        if validation_errors:
            raise ParameterError(
                "必須パラメータが不足しています",
                details={
                    "validation_errors": validation_errors,
                    "provided_params": list(query_params.keys())
                }
            )
        
        # パラメータ取得
        image1_param = query_params.get('image1')
        image2_param = query_params.get('image2')
        image3_param = query_params.get('image3')  # オプション
        base_image_param = query_params.get('baseImage')
        format_param = query_params.get('format', 'png')
        
        # 動画生成パラメータ
        generate_video = query_params.get('generate_video', 'false').lower() == 'true'
        video_duration = int(query_params.get('video_duration', '3'))
        video_format = query_params.get('video_format', 'XMF')
        
        logger.info(f"🎯 Images to process: image1={image1_param}, image2={image2_param}, image3={image3_param} [Request ID: {request_id}]")
        logger.info(f"🎬 Video generation: enabled={generate_video}, duration={video_duration}s, format={video_format} [Request ID: {request_id}]")
        
        # 画像パラメータの解析
        try:
            img_params = parse_image_parameters(query_params)
            logger.info(f"📐 Image parameters parsed successfully [Request ID: {request_id}]")
        except Exception as e:
            raise ParameterError(
                "画像パラメータの解析に失敗しました",
                details={
                    "original_error": str(e),
                    "query_params": query_params
                }
            )
        
        # テキストパラメータの解析
        from image_compositor import parse_text_parameters, validate_text_parameters
        text_params = parse_text_parameters(query_params)
        if text_params:
            text_errors = validate_text_parameters(text_params)
            if text_errors:
                raise ParameterError(
                    "テキストパラメータが無効です",
                    details={"validation_errors": text_errors}
                )
            logger.info(f"📝 Text parameters: {list(text_params.keys())} [Request ID: {request_id}]")

        # images初期化（テキストのみモード時のUnboundLocalError防止）
        images = {}

        from PIL import Image as PILImage

        # ベース画像の特殊値処理（white / #RRGGBB / #RRGGBBAA）
        base_is_special = False
        if base_image_param:
            if base_image_param == 'white':
                images['base'] = PILImage.new('RGBA', (2000, 1000), (255, 255, 255, 255))
                base_is_special = True
                logger.info(f"🎨 White base image created [Request ID: {request_id}]")
            elif base_image_param.startswith('#'):
                from text_renderer import _parse_color
                color = _parse_color(base_image_param)
                if len(color) == 3:
                    color = (*color, 255)
                images['base'] = PILImage.new('RGBA', (2000, 1000), color)
                base_is_special = True
                logger.info(f"🎨 Custom color base image created: {base_image_param} [Request ID: {request_id}]")
            elif base_image_param == 'transparent':
                base_is_special = True
                logger.info(f"🎨 Transparent base image [Request ID: {request_id}]")

        # テキストのみリクエスト時のimage1省略対応
        if not image1_param and text_params:
            images['image1'] = PILImage.new('RGBA', (1, 1), (0, 0, 0, 0))
            img_params['image1'] = {'x': 0, 'y': 0, 'width': 1, 'height': 1}
            logger.info(f"📝 Text-only mode: using transparent 1x1 image [Request ID: {request_id}]")

        # 画像の並列取得（指定された画像のみ、テキストのみモード時はスキップ）
        if image1_param:
            logger.info(f"📥 Starting parallel image fetch... [Request ID: {request_id}]")
            image_paths = {
                'image1': image1_param,  # 必須
            }

            # ベース画像（特殊値でない場合のみ取得）
            if base_image_param and not base_is_special:
                image_paths['base'] = base_image_param

            # オプション画像を追加
            if image2_param:
                image_paths['image2'] = image2_param
            if image3_param:
                image_paths['image3'] = image3_param

            try:
                images.update(fetch_images_parallel(image_paths))
                logger.info(f"✅ Images fetched: {list(images.keys())} [Request ID: {request_id}]")
            except Exception as e:
                raise ImageFetchError(
                    "画像の取得に失敗しました",
                    details={
                        "image_paths": image_paths,
                        "original_error": str(e)
                    }
                )
        
        # 画像合成処理
        logger.info(f"🎨 Starting image composition... [Request ID: {request_id}]")
        try:
            composite_img = create_composite_image(
                images.get('base'),
                images['image1'],  # 必須
                images.get('image2'),  # オプション
                images.get('image3'),  # オプション
                img_params,
                text_params=text_params if text_params else None
            )
        except Exception as e:
            raise ImageProcessingError(
                "画像の合成処理に失敗しました",
                details={
                    "image_count": len([img for img in images.values() if img is not None]),
                    "img_params": img_params,
                    "original_error": str(e)
                }
            )
        
        # 処理時間計算
        processing_time = time.time() - start_time
        logger.info(f"⏱️ Processing completed in {processing_time:.2f} seconds [Request ID: {request_id}]")
        
        # レスポンス生成
        try:
            # 動画生成が有効な場合
            if generate_video:
                logger.info(f"🎬 Generating video response: duration={video_duration}s, format={video_format} [Request ID: {request_id}]")
                try:
                    # 動画生成
                    video_data = generate_video_from_image(
                        composite_img,
                        duration=video_duration,
                        format_name=video_format
                    )
                    
                    # ファイル名を生成
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    video_extension = get_video_extension(video_format)
                    filename = f"composite-video-v{VERSION}-{timestamp}.{video_extension}"
                    
                    # 動画をS3にアップロードしてURLを返す（バイナリレスポンスの問題を回避）
                    try:
                        # S3に動画をアップロード
                        s3_key = f"generated-videos/{filename}"
                        s3_client = boto3.client('s3')
                        s3_client.put_object(
                            Bucket=os.environ.get('S3_RESOURCES_BUCKET', 'default-bucket'),
                            Key=s3_key,
                            Body=video_data,
                            ContentType=get_video_mime_type(video_format),
                            ContentDisposition=f'attachment; filename="{filename}"',
                            CacheControl='public, max-age=3600'
                        )
                        
                        # CloudFrontのURLを生成（パブリックアクセス）
                        cloudfront_domain = os.environ.get('CLOUDFRONT_DOMAIN', '')
                        if cloudfront_domain:
                            video_url = f"https://{cloudfront_domain}/{s3_key}"
                        else:
                            # フォールバック: 署名付きURLを生成（1時間有効）
                            video_url = s3_client.generate_presigned_url(
                                'get_object',
                                Params={'Bucket': os.environ.get('S3_RESOURCES_BUCKET', 'default-bucket'), 'Key': s3_key},
                                ExpiresIn=3600
                            )
                        
                        # JSONレスポンスで動画URLを返す
                        response = {
                            'statusCode': 200,
                            'headers': {
                                'Content-Type': 'application/json',
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                                'Access-Control-Allow-Headers': 'Content-Type, X-Amz-Date, Authorization, X-Api-Key',
                                'Cache-Control': 'public, max-age=300',  # 5分キャッシュ
                                'X-Request-ID': request_id
                            },
                            'body': json.dumps({
                                'type': 'video',
                                'url': video_url,
                                'filename': filename,
                                'format': video_format,
                                'duration': video_duration,
                                'size': len(video_data),
                                'mime_type': get_video_mime_type(video_format),
                                'generated_at': timestamp
                            }),
                            'isBase64Encoded': False
                        }
                        
                        logger.info(f"📊 Video uploaded to S3 and URL generated: {len(video_data)} bytes [Request ID: {request_id}]")
                        
                    except Exception as s3_error:
                        logger.error(f"❌ Failed to upload video to S3: {s3_error} [Request ID: {request_id}]")
                        # S3アップロードに失敗した場合は、Base64エンコードで直接返す
                        response = {
                            'statusCode': 200,
                            'headers': {
                                'Content-Type': get_video_mime_type(video_format),
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                                'Access-Control-Allow-Headers': 'Content-Type, X-Amz-Date, Authorization, X-Api-Key',
                                'Cache-Control': 'public, max-age=3600',
                                'Content-Length': str(len(video_data)),
                                'Content-Disposition': f'attachment; filename="{filename}"',
                                'X-Content-Type-Options': 'nosniff',
                                'X-Request-ID': request_id,
                                'Accept-Ranges': 'bytes'
                            },
                            'body': base64.b64encode(video_data).decode('utf-8'),
                            'isBase64Encoded': True
                        }
                    
                    logger.info(f"📊 Video response generated: {len(video_data)} bytes [Request ID: {request_id}]")
                    
                except VideoGenerationError as ve:
                    # 動画生成に失敗した場合は静止画像にフォールバック
                    logger.warning(f"⚠️ Video generation failed, falling back to static image: {ve.message} [Request ID: {request_id}]")
                    generate_video = False  # フォールバック処理のため
                
            # 静止画像レスポンス（PNG形式またはHTML形式）
            if not generate_video:
                if format_param == 'html':
                    logger.info(f"📤 Generating HTML response [Request ID: {request_id}]")
                    html_content = generate_html_response(composite_img, query_params)
                    
                    response = {
                        'statusCode': 200,
                        'headers': {
                            'Content-Type': 'text/html; charset=utf-8',
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                            'Access-Control-Allow-Headers': 'Content-Type, X-Amz-Date, Authorization, X-Api-Key',
                            'Cache-Control': 'public, max-age=3600',
                            'X-Request-ID': request_id
                        },
                        'body': html_content
                    }
                    
                    logger.info(f"📊 HTML response generated: {len(html_content)} characters [Request ID: {request_id}]")
                    
                else:  # PNG形式
                    logger.info(f"📤 Generating PNG binary response [Request ID: {request_id}]")
                    # PNG形式でバイナリデータを返す
                    img_buffer = io.BytesIO()
                    composite_img.save(
                        img_buffer, 
                        format='PNG', 
                        optimize=True, 
                        compress_level=6,
                        pnginfo=None  # メタデータを削除してファイルサイズを最適化
                    )
                    img_bytes = img_buffer.getvalue()
                    
                    # ファイル名を生成
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    filename = f"composite-image-v{VERSION}-{timestamp}.png"
                    
                    # バイナリPNGデータを返す（API Gateway経由でBase64エンコード）
                    response = {
                        'statusCode': 200,
                        'headers': {
                            'Content-Type': 'image/png',
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                            'Access-Control-Allow-Headers': 'Content-Type, X-Amz-Date, Authorization, X-Api-Key',
                            'Cache-Control': 'public, max-age=3600',
                            'Content-Length': str(len(img_bytes)),
                            'Content-Disposition': f'inline; filename="{filename}"',
                            'X-Content-Type-Options': 'nosniff',
                            'X-Request-ID': request_id,
                            'Accept-Ranges': 'bytes'
                        },
                        'body': base64.b64encode(img_bytes).decode('utf-8'),
                        'isBase64Encoded': True
                    }
                    
                    logger.info(f"📊 PNG binary response generated: {len(img_bytes)} bytes [Request ID: {request_id}]")
            
            # レスポンス完了ログ
            log_response_info(request_id, response, processing_time)
            
            return response
            
        except Exception as e:
            raise ImageProcessingError(
                "レスポンスの生成に失敗しました",
                details={
                    "format": format_param,
                    "generate_video": generate_video,
                    "original_error": str(e)
                }
            )
        
    except (ParameterError, ImageFetchError, ImageProcessingError, ValidationError, VideoGenerationError) as e:
        # 既知のエラータイプの場合
        logger.warning(f"❌ Known error occurred: {e.message} [Request ID: {request_id}]")
        response = create_error_response(e, context={"query_params": query_params}, request_id=request_id)
        log_response_info(request_id, response, time.time() - start_time)
        return response
        
    except Exception as e:
        # 予期しないエラーの場合
        logger.error(f"❌ Unexpected error: {e} [Request ID: {request_id}]")
        response = create_error_response(
            e, 
            context={
                "query_params": query_params,
                "lambda_context": {
                    "function_name": context.function_name if context else "unknown",
                    "memory_limit": context.memory_limit_in_mb if context else "unknown",
                    "remaining_time": context.get_remaining_time_in_millis() if context else "unknown"
                }
            }, 
            request_id=request_id
        )
        log_response_info(request_id, response, time.time() - start_time)
        return response


if __name__ == "__main__":
    # ローカルテスト用
    print(f"🎨 画像合成REST API v{VERSION} - ローカルテスト")
    
    # テストイベントの作成
    test_event = {
        'queryStringParameters': {
            'image1': 'test',
            'image2': 'test',
            'image3': 'test',
            'format': 'html'
        }
    }
    
    # ハンドラーを実行
    try:
        result = handler(test_event, None)
        print(f"✅ テスト成功: ステータスコード {result['statusCode']}")
        print(f"📊 レスポンスヘッダー: {result['headers']}")
        
        if result['headers'].get('Content-Type') == 'text/html; charset=utf-8':
            print("🌐 HTML レスポンス生成完了")
            # HTMLファイルとして保存
            with open('test_response.html', 'w', encoding='utf-8') as f:
                f.write(result['body'])
            print("💾 test_response.html に保存しました")
        
    except Exception as e:
        print(f"❌ テストエラー: {e}")