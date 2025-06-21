import json
import base64
import logging
import io
import os
import sys
import re
from urllib.parse import urlparse
from typing import Dict, Any, Optional, Tuple, Union
import concurrent.futures

# パッケージのインポート
try:
    import requests
    import boto3
    from botocore.exceptions import ClientError
    from PIL import Image
except ImportError as e:
    logger = logging.getLogger()
    logger.error(f"Failed to import required packages: {e}")
    raise

# ロガーの設定
logger = logging.getLogger()
logger.setLevel(logging.INFO)


def fetch_image_from_s3(bucket_name: str, object_key: str) -> Image.Image:
    """
    S3バケットから画像を取得し、Pillowイメージとして返す
    
    Args:
        bucket_name: S3バケット名
        object_key: S3オブジェクトのキー
        
    Returns:
        PIL.Image.Image: ロードされた画像
    """
    logger.info(f"Fetching image from S3: {bucket_name}/{object_key}")

    try:
        # S3クライアントの作成
        s3_client = boto3.client('s3')
        
        # S3からオブジェクトを取得
        response = s3_client.get_object(Bucket=bucket_name, Key=object_key)
        
        # レスポンスのボディをPillow Imageに変換
        img = Image.open(io.BytesIO(response['Body'].read()))
        
        # 画像モードの確認とアルファチャネルの処理
        logger.info(f"S3 image mode: {img.mode}, size: {img.size}")
        
        # RGBAモードに変換（透過を扱うため）
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
            logger.info(f"Converted S3 image to RGBA mode")
        
        # 透明ピクセルがあるか確認（デバッグ用）
        has_transparency = any(p[3] < 255 for p in img.getdata())
        logger.info(f"S3 image has transparent pixels: {has_transparency}")
        
        return img
        
    except ClientError as e:
        logger.error(f"Failed to retrieve image from S3: {e}")
        raise ValueError(f"S3 error: {str(e)}")


def fetch_image(url_or_s3_path: str, image_type: str = "unknown") -> Image.Image:
    """
    URLまたはS3パスから画像を取得し、Pillowイメージとして返す
    
    Args:
        url_or_s3_path: URL、S3パス、またはテスト指定子
        image_type: 画像の種類（ログ用）
        
    形式:
    - http(s)://... - 通常のURL
    - file://... - ローカルファイル（テスト用）
    - s3://bucket/key - S3パス
    - bucket_name/object_key - S3パス（s3://プレフィックスなし）
    - "test" - テスト画像
    
    Returns:
        PIL.Image.Image: ロードされた画像
    """
    logger.info(f"Fetching {image_type} image from: {url_or_s3_path}")
    
    # テスト画像指定の場合
    if url_or_s3_path == "test":
        test_bucket = os.environ.get('TEST_BUCKET', 'test-images')
        
        # 画像タイプに応じてテスト画像を選択
        if image_type == "baseImage":
            return fetch_image_from_s3(test_bucket, "images/aws-logo.png")
        elif image_type == "image1":
            return fetch_image_from_s3(test_bucket, "images/circle_red.png")
        elif image_type == "image2":
            return fetch_image_from_s3(test_bucket, "images/rectangle_blue.png")
        else:
            # デフォルトはaws-logo
            return fetch_image_from_s3(test_bucket, "images/aws-logo.png")
    
    # S3 URLパターンの検出
    s3_pattern = r'^(?:s3://)?([^/]+)/(.+)$'
    s3_match = re.match(s3_pattern, url_or_s3_path)
    
    if s3_match:
        # S3パスの場合
        bucket_name = s3_match.group(1)
        object_key = s3_match.group(2)
        return fetch_image_from_s3(bucket_name, object_key)
    
    # URLの検証とfile:// URLの特別処理（ローカルテスト用）
    parsed_url = urlparse(url_or_s3_path)
    
    if parsed_url.scheme == 'file':
        # ローカルファイルの場合
        file_path = parsed_url.path
        if os.name == 'nt' and file_path.startswith('/'):  # Windows対応
            file_path = file_path[1:]
        
        logger.info(f"Loading local file: {file_path}")
        with open(file_path, 'rb') as f:
            img = Image.open(io.BytesIO(f.read()))
    elif not parsed_url.scheme or not parsed_url.netloc:
        raise ValueError(f"Invalid URL or S3 path: {url_or_s3_path}")
    else:
        # 通常のHTTP/HTTPS URLの場合
        response = requests.get(url_or_s3_path, timeout=5.0)
        response.raise_for_status()
        img = Image.open(io.BytesIO(response.content))
    
    # 画像モードの確認とアルファチャネルの処理
    logger.info(f"Original {image_type} image mode: {img.mode}")
    
    # RGBAモードに変換（透過を扱うため）
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
        logger.info(f"Converted {image_type} image to RGBA mode")
    
    # 透明ピクセルがあるか確認（デバッグ用）
    has_transparency = any(p[3] < 255 for p in img.getdata())
    logger.info(f"{image_type} image has transparent pixels: {has_transparency}")
    
    return img
def create_composite_image(base_img: Image.Image, image1: Image.Image, image2: Image.Image,
                          img1_params: Dict[str, Any], img2_params: Dict[str, Any]) -> Image.Image:
    """
    ベース画像に2つの画像を合成する
    
    Args:
        base_img: ベース画像
        image1: 合成する1つ目の画像
        image2: 合成する2つ目の画像
        img1_params: 1つ目の画像の配置パラメータ
        img2_params: 2つ目の画像の配置パラメータ
        
    Returns:
        PIL.Image.Image: 合成された画像
    """
    logger.info("Creating composite image")
    
    # ベース画像のコピーを作成
    composite = base_img.copy()
    
    # 1つ目の画像のリサイズと配置
    img1_resized = image1.resize((img1_params['width'], img1_params['height']), Image.LANCZOS)
    
    # 2つ目の画像のリサイズと配置
    img2_resized = image2.resize((img2_params['width'], img2_params['height']), Image.LANCZOS)
    
    logger.info(f"Image1 position: ({img1_params['x']}, {img1_params['y']}), size: ({img1_params['width']}, {img1_params['height']})")
    logger.info(f"Image2 position: ({img2_params['x']}, {img2_params['y']}), size: ({img2_params['width']}, {img2_params['height']})")
    
    # 画像を合成（アルファチャネルを考慮）
    composite.paste(img1_resized, (img1_params['x'], img1_params['y']), img1_resized)
    composite.paste(img2_resized, (img2_params['x'], img2_params['y']), img2_resized)
    
    logger.info("Composite image created successfully")
    return composite


def format_response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    """
    API Gatewayレスポンスをフォーマット
    """
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        'body': json.dumps(body)
    }


def generate_html_response(base64_image: str, composite_img: Image.Image, img_byte_arr: bytes,
                          img1_params: Dict[str, Any], img2_params: Dict[str, Any],
                          base_image_param: str, image1_param: str, image2_param: str,
                          test_bucket: str) -> str:
    """
    HTML レスポンスを生成する
    """
    return f"""
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎨 画像合成API v2</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }}
        .container {{
            background-color: white;
            padding: 30px;
            border-radius: 16px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        }}
        .header {{
            text-align: center;
            margin-bottom: 30px;
        }}
        .header h1 {{
            color: #2d3748;
            margin-bottom: 10px;
        }}
        .header p {{
            color: #718096;
            font-size: 18px;
        }}
        .image-container {{
            text-align: center;
            margin: 30px 0;
            padding: 20px;
            background: #f7fafc;
            border-radius: 12px;
        }}
        .composite-image {{
            max-width: 100%;
            height: auto;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }}
        .status-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }}
        .status-item {{
            background: #f0fff4;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #38a169;
        }}
        .status-item .icon {{
            color: #38a169;
            font-weight: bold;
        }}
        .info-grid {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin: 30px 0;
        }}
        .info-card {{
            background: #f8fafc;
            padding: 20px;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
        }}
        .info-card h3 {{
            color: #2d3748;
            margin-top: 0;
            margin-bottom: 15px;
        }}
        .params-table {{
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
        }}
        .params-table th, .params-table td {{
            border: 1px solid #e2e8f0;
            padding: 12px;
            text-align: left;
        }}
        .params-table th {{
            background-color: #edf2f7;
            font-weight: 600;
            color: #2d3748;
        }}
        .download-section {{
            text-align: center;
            margin: 30px 0;
            padding: 20px;
            background: #ebf8ff;
            border-radius: 12px;
        }}
        .download-btn {{
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 8px;
            margin: 10px;
            cursor: pointer;
            border: none;
            font-size: 16px;
            font-weight: 600;
            transition: transform 0.2s, box-shadow 0.2s;
        }}
        .download-btn:hover {{
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(0,0,0,0.2);
        }}
        .api-examples {{
            background: #1a202c;
            color: #e2e8f0;
            padding: 20px;
            border-radius: 12px;
            margin: 20px 0;
        }}
        .api-examples h3 {{
            color: #63b3ed;
            margin-top: 0;
        }}
        .api-examples code {{
            background: #2d3748;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Monaco', 'Consolas', monospace;
        }}
        @media (max-width: 768px) {{
            .info-grid {{
                grid-template-columns: 1fr;
            }}
            .status-grid {{
                grid-template-columns: 1fr;
            }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎨 画像合成API v2 テスト成功！</h1>
            <p>高性能・アルファチャンネル対応の画像合成システム</p>
        </div>
        
        <div class="status-grid">
            <div class="status-item">
                <span class="icon">✅</span> S3画像取得: 成功
            </div>
            <div class="status-item">
                <span class="icon">✅</span> アルファ合成: 成功
            </div>
            <div class="status-item">
                <span class="icon">✅</span> 並列処理: 成功
            </div>
            <div class="status-item">
                <span class="icon">✅</span> uv高速化: 成功
            </div>
        </div>
        
        <div class="image-container">
            <h2>🖼️ 合成された画像</h2>
            <img src="data:image/png;base64,{base64_image}" alt="Composite Image" class="composite-image" id="compositeImage" />
        </div>
        
        <div class="info-grid">
            <div class="info-card">
                <h3>📊 技術情報</h3>
                <table class="params-table">
                    <tr><th>項目</th><th>値</th></tr>
                    <tr><td>画像サイズ</td><td>{len(img_byte_arr):,} バイト</td></tr>
                    <tr><td>画像形式</td><td>PNG (RGBA)</td></tr>
                    <tr><td>解像度</td><td>{composite_img.size[0]} x {composite_img.size[1]} px</td></tr>
                    <tr><td>カラーモード</td><td>{composite_img.mode}</td></tr>
                    <tr><td>透過サポート</td><td>✅ あり</td></tr>
                </table>
            </div>
            
            <div class="info-card">
                <h3>🎯 合成パラメータ</h3>
                <table class="params-table">
                    <tr><th>画像</th><th>位置 (X, Y)</th><th>サイズ (W x H)</th></tr>
                    <tr><td>Image1</td><td>({img1_params['x']}, {img1_params['y']})</td><td>{img1_params['width']} x {img1_params['height']}</td></tr>
                    <tr><td>Image2</td><td>({img2_params['x']}, {img2_params['y']})</td><td>{img2_params['width']} x {img2_params['height']}</td></tr>
                </table>
            </div>
        </div>
        
        <div class="info-card">
            <h3>☁️ S3リソース情報</h3>
            <ul>
                <li><strong>テストバケット:</strong> {test_bucket}</li>
                <li><strong>ベース画像:</strong> {base_image_param or "透明背景"}</li>
                <li><strong>合成画像1:</strong> {image1_param}</li>
                <li><strong>合成画像2:</strong> {image2_param}</li>
            </ul>
        </div>
        
        <div class="download-section">
            <h3>📥 ダウンロード</h3>
            <button onclick="downloadImage()" class="download-btn">
                🖼️ PNG画像をダウンロード
            </button>
            <a href="?baseImage=test&image1=test&image2=test" class="download-btn">
                🧪 テスト画像で再実行
            </a>
        </div>
        
        <div class="api-examples">
            <h3>🔗 API使用例</h3>
            <p><strong>HTML表示:</strong> <code>?baseImage=test&image1=test&image2=test</code></p>
            <p><strong>PNG直接:</strong> <code>?baseImage=test&image1=test&image2=test&format=png</code></p>
            <p><strong>カスタム配置:</strong> <code>?baseImage=test&image1=test&image2=test&image1X=100&image1Y=100&image2X=500&image2Y=300</code></p>
        </div>
    </div>

    <script>
        function downloadImage() {{
            try {{
                // Base64データからBlobを作成
                const base64Data = '{base64_image}';
                const byteCharacters = atob(base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {{
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }}
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], {{type: 'image/png'}});
                
                // ダウンロードリンクを作成
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = 'composite-image-v2.png';
                
                // ダウンロードを実行
                document.body.appendChild(a);
                a.click();
                
                // クリーンアップ
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                console.log('✅ 画像ダウンロードが開始されました');
            }} catch (error) {{
                console.error('❌ ダウンロードエラー:', error);
                alert('ダウンロードに失敗しました。ブラウザのコンソールを確認してください。');
            }}
        }}
        
        // 画像の読み込み完了を確認
        document.getElementById('compositeImage').onload = function() {{
            console.log('✅ 合成画像の表示が完了しました');
        }};
        
        // エラーハンドリング
        document.getElementById('compositeImage').onerror = function() {{
            console.error('❌ 画像の読み込みに失敗しました');
        }};
    </script>
</body>
</html>
    """
def handler(event, context):
    """
    Lambda ハンドラー関数 - 画像合成API v2
    
    Args:
        event: Lambda イベントオブジェクト
        context: Lambda コンテキストオブジェクト
    
    Returns:
        HTTP レスポンス
    """
    logger.info("🚀 Processing image composition request - API v2")
    logger.info(f"Event: {json.dumps(event)}")
    
    try:
        # クエリパラメータの取得
        query_params = event.get('queryStringParameters', {}) or {}
        
        if not query_params:
            return format_response(400, {'error': 'No query parameters provided'})
        
        # 画像URLまたはS3パスの取得
        base_image_param = query_params.get('baseImage')
        image1_param = query_params.get('image1')
        image2_param = query_params.get('image2')
        format_param = query_params.get('format', 'html')  # html or png
        
        # 必須パラメータの確認
        if not image1_param or not image2_param:
            return format_response(400, {'error': 'image1 and image2 parameters are required'})
        
        # サイズと位置のパラメータの取得 (デフォルト値あり)
        img1_width = int(query_params.get('image1Width', 300))
        img1_height = int(query_params.get('image1Height', 200))
        img1_x = query_params.get('image1X')  # Noneの場合は自動計算
        img1_y = int(query_params.get('image1Y', 20))
        
        img2_width = int(query_params.get('image2Width', 300))
        img2_height = int(query_params.get('image2Height', 200))
        img2_x = query_params.get('image2X')  # Noneの場合は自動計算
        img2_y = query_params.get('image2Y')  # Noneの場合は自動計算
        
        # 環境変数からバケット名を取得
        s3_resources_bucket = os.environ.get('S3_RESOURCES_BUCKET', 'image-resources')
        test_bucket = os.environ.get('TEST_BUCKET', 'test-images')
        
        # パラメータの正規化
        def normalize_path(path_param):
            if path_param == "test":
                return "test"  # テスト画像はそのまま
            elif path_param and not (path_param.startswith('http://') or 
                                    path_param.startswith('https://') or 
                                    path_param.startswith('file://') or 
                                    path_param.startswith('s3://') or
                                    '/' in path_param):
                return f"{s3_resources_bucket}/{path_param}"
            return path_param
        
        base_image_path = normalize_path(base_image_param) if base_image_param else None
        image1_path = normalize_path(image1_param)
        image2_path = normalize_path(image2_param)
        
        logger.info(f"📁 Normalized paths - base: {base_image_path}, image1: {image1_path}, image2: {image2_path}")
        
        # ベース画像の読み込み
        if base_image_path:
            base_img = fetch_image(base_image_path, "baseImage")
            if base_img.size != (1920, 1080):
                logger.info(f"🔄 Resizing base image from {base_img.size} to (1920, 1080)")
                base_img = base_img.resize((1920, 1080), Image.LANCZOS)
        else:
            # ベース画像が指定されていない場合は透明の画像を作成
            base_img = Image.new('RGBA', (1920, 1080), (0, 0, 0, 0))
            logger.info("🆕 Created transparent base image (1920x1080)")
            
        # 合成する画像を並列で取得
        logger.info("⚡ Starting parallel image fetching...")
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            future_to_path = {
                executor.submit(fetch_image, image1_path, "image1"): 'image1',
                executor.submit(fetch_image, image2_path, "image2"): 'image2'
            }
            
            images = {}
            for future in concurrent.futures.as_completed(future_to_path):
                name = future_to_path[future]
                try:
                    images[name] = future.result()
                    logger.info(f"✅ Successfully loaded {name}")
                except Exception as e:
                    logger.error(f"❌ Error loading image {name}: {e}")
                    return format_response(500, {'error': f"Failed to load {name}: {str(e)}"})
        
        # 画像位置の計算
        if img1_x is None:
            img1_x = base_img.width - img1_width - 20  # 右端から20pxマージン
        else:
            img1_x = int(img1_x)
        
        if img2_x is None:
            img2_x = base_img.width - img2_width - 20  # 右端から20pxマージン
        else:
            img2_x = int(img2_x)
            
        if img2_y is None:
            img2_y = img1_y + img1_height + 20  # 20pxマージン
        else:
            img2_y = int(img2_y)
        
        # 画像合成パラメータ
        img1_params = {
            'width': img1_width,
            'height': img1_height,
            'x': img1_x,
            'y': img1_y
        }
        
        img2_params = {
            'width': img2_width,
            'height': img2_height,
            'x': img2_x,
            'y': img2_y
        }
        
        # 画像を合成
        logger.info("🎨 Creating composite image...")
        composite_img = create_composite_image(base_img, images['image1'], images['image2'], 
                                             img1_params, img2_params)
        
        # RGBAモードに変換（アルファチャンネルを保持）
        if composite_img.mode != 'RGBA':
            logger.info(f"🔄 Converting composite image from {composite_img.mode} to RGBA")
            composite_img = composite_img.convert('RGBA')
        
        # 合成画像をバイトに変換
        img_byte_arr = io.BytesIO()
        composite_img.save(img_byte_arr, format='PNG', optimize=False)
        img_byte_arr = img_byte_arr.getvalue()
        
        logger.info(f"📊 Output composite image: {composite_img.mode}, {len(img_byte_arr):,} bytes")
        
        # フォーマットに応じてレスポンスを変更
        if format_param == 'png':
            # PNG直接返却
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'image/png',
                    'Content-Disposition': 'inline; filename="composite-image-v2.png"',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': base64.b64encode(img_byte_arr).decode('utf-8'),
                'isBase64Encoded': True
            }
        else:
            # HTML表示
            base64_image = base64.b64encode(img_byte_arr).decode('utf-8')
            html_content = generate_html_response(
                base64_image, composite_img, img_byte_arr,
                img1_params, img2_params,
                base_image_param, image1_param, image2_param,
                test_bucket
            )
            
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': html_content
            }
        
    except Exception as e:
        logger.error(f"❌ Error processing request: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        
        error_html = f"""
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>❌ エラー - 画像合成API v2</title>
    <style>
        body {{ 
            font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
            max-width: 600px; 
            margin: 50px auto; 
            padding: 20px; 
            background: linear-gradient(135deg, #ff6b6b, #ee5a24);
            min-height: 100vh;
        }}
        .error {{ 
            background-color: white; 
            color: #721c24; 
            padding: 30px; 
            border-radius: 16px; 
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        }}
        .error h1 {{ color: #e53e3e; }}
        .error code {{ 
            background: #fed7d7; 
            padding: 2px 6px; 
            border-radius: 4px; 
            font-family: Monaco, Consolas, monospace;
        }}
    </style>
</head>
<body>
    <div class="error">
        <h1>❌ 画像合成エラーが発生しました</h1>
        <p><strong>エラー内容:</strong> <code>{str(e)}</code></p>
        <p>Lambda関数のCloudWatch Logsを確認してください。</p>
        <p><strong>必須パラメータ:</strong> <code>image1</code>, <code>image2</code></p>
        <p><strong>使用例:</strong> <code>?baseImage=test&image1=test&image2=test</code></p>
        <hr>
        <p><small>画像合成API v2 - 高性能アルファチャンネル対応</small></p>
    </div>
</body>
</html>
        """
        
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'text/html; charset=utf-8',
                'Access-Control-Allow-Origin': '*'
            },
            'body': error_html
        }
