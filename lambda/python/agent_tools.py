"""
Strands Agent ツール定義

画像合成、動画生成、アセット管理のツールを @tool デコレータで定義する。
"""

import os
import io
import json
import base64
import logging
from typing import Optional

try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:
    boto3 = None

try:
    from strands import tool
except ImportError:
    # ユニットテスト時のフォールバック
    def tool(fn):
        return fn

from PIL import Image

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# メディアデータの一時保存（Agentのコンテキストウィンドウ超過を防ぐため）
# compose_images/generate_videoの結果をここに保存し、agent_handlerで取得する
_last_media_result = None


def _get_s3_client():
    """S3クライアントを取得"""
    if boto3 is None:
        raise RuntimeError("boto3 is not available")
    return boto3.client('s3')


def _resolve_position(position: str) -> tuple:
    """位置文字列を座標に変換"""
    from agent_prompts import resolve_position
    return resolve_position(position)


def _resolve_size(size: str) -> tuple:
    """サイズ文字列をタプルに変換"""
    from agent_prompts import resolve_size
    return resolve_size(size)


@tool
def compose_images(
    image1: str,
    image1_position: str = "左上",
    image1_size: str = "400x400",
    image2: str = "",
    image2_position: str = "右上",
    image2_size: str = "400x400",
    image3: str = "",
    image3_position: str = "中央下",
    image3_size: str = "400x400",
    base_image: str = "test",
) -> dict:
    """画像を合成します。最大3枚の画像をキャンバス（1920x1080）上に配置して合成します。

    Args:
        image1: 画像1のソース。"test"でテスト画像、アップロード済み画像のファイル名（例: "338b77e1-xxx.jpeg"）、HTTP URLを指定可能。必須。アップロード済み画像を使う場合はlist_uploaded_imagesで取得したfilenameをそのまま指定してください。
        image1_position: 画像1の配置位置。"左上","中央","右下"等の名前、または"x,y"座標。
        image1_size: 画像1のサイズ。"幅x高さ"形式（例: "400x400"）。
        image2: 画像2のソース。空文字で省略。
        image2_position: 画像2の配置位置。
        image2_size: 画像2のサイズ。
        image3: 画像3のソース。空文字で省略。
        image3_position: 画像3の配置位置。
        image3_size: 画像3のサイズ。
        base_image: ベース画像のソース。"test","transparent",S3キー,HTTP URL。
    """
    from image_fetcher import fetch_image
    from image_compositor import create_composite_image

    logger.info(f"compose_images: image1={image1}, image2={image2}, image3={image3}")

    # 位置・サイズの解決
    pos1 = _resolve_position(image1_position)
    sz1 = _resolve_size(image1_size)

    params = {
        'image1': {'x': pos1[0], 'y': pos1[1], 'width': sz1[0], 'height': sz1[1]},
        'image2': {'x': 0, 'y': 0, 'width': 400, 'height': 400},
        'image3': {'x': 0, 'y': 0, 'width': 400, 'height': 400},
    }

    # 画像取得
    img1 = fetch_image(image1, 'image1')

    img2 = None
    if image2:
        pos2 = _resolve_position(image2_position)
        sz2 = _resolve_size(image2_size)
        params['image2'] = {'x': pos2[0], 'y': pos2[1], 'width': sz2[0], 'height': sz2[1]}
        img2 = fetch_image(image2, 'image2')

    img3 = None
    if image3:
        pos3 = _resolve_position(image3_position)
        sz3 = _resolve_size(image3_size)
        params['image3'] = {'x': pos3[0], 'y': pos3[1], 'width': sz3[0], 'height': sz3[1]}
        img3 = fetch_image(image3, 'image3')

    # ベース画像
    base_img = None
    if base_image and base_image != 'transparent':
        base_img = fetch_image(base_image, 'base')

    # 合成実行
    composite = create_composite_image(base_img, img1, img2, img3, params)

    # S3に保存してCloudFront URLを生成
    from datetime import datetime
    buffer = io.BytesIO()
    composite.save(buffer, format='PNG', optimize=True)
    png_data = buffer.getvalue()

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"composite-agent-{timestamp}.png"
    s3_key = f"generated-images/{filename}"

    s3_client = _get_s3_client()
    resources_bucket = os.environ.get('S3_RESOURCES_BUCKET', '')

    s3_client.put_object(
        Bucket=resources_bucket,
        Key=s3_key,
        Body=png_data,
        ContentType='image/png',
        CacheControl='public, max-age=3600',
    )

    cloudfront_domain = os.environ.get('CLOUDFRONT_DOMAIN', '')
    if cloudfront_domain:
        image_url = f"https://{cloudfront_domain}/{s3_key}"
    else:
        image_url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': resources_bucket, 'Key': s3_key},
            ExpiresIn=3600,
        )

    # 使用パラメータのサマリ
    image_count = 1 + (1 if image2 else 0) + (1 if image3 else 0)
    summary_lines = [
        f"画像1: source={image1}, 位置=({params['image1']['x']}, {params['image1']['y']}), サイズ={params['image1']['width']}x{params['image1']['height']}",
    ]
    if image2:
        summary_lines.append(
            f"画像2: source={image2}, 位置=({params['image2']['x']}, {params['image2']['y']}), サイズ={params['image2']['width']}x{params['image2']['height']}"
        )
    if image3:
        summary_lines.append(
            f"画像3: source={image3}, 位置=({params['image3']['x']}, {params['image3']['y']}), サイズ={params['image3']['width']}x{params['image3']['height']}"
        )

    # URLはコンテキストウィンドウ超過を防ぐため、グローバル変数に保存
    global _last_media_result
    _last_media_result = {
        'type': 'image',
        'url': image_url,
    }

    return {
        'success': True,
        'image_generated': True,
        'image_count': image_count,
        'canvas_size': '1920x1080',
        'base_image': base_image,
        'filename': filename,
        'parameters_summary': '\n'.join(summary_lines),
    }


@tool
def generate_video(
    duration: int = 3,
    video_format: str = "MP4",
    image1: str = "test",
    image1_position: str = "左上",
    image1_size: str = "400x400",
    image2: str = "",
    image2_position: str = "右上",
    image2_size: str = "400x400",
    image3: str = "",
    image3_position: str = "中央下",
    image3_size: str = "400x400",
    base_image: str = "test",
) -> dict:
    """合成画像から動画を生成します。まず画像を合成し、その結果から指定フォーマットの動画を生成します。

    Args:
        duration: 動画の長さ（秒）。1から30の範囲。
        video_format: 動画フォーマット。"MXF","MP4","WEBM","AVI"のいずれか。
        image1: 画像1のソース。
        image1_position: 画像1の配置位置。
        image1_size: 画像1のサイズ。
        image2: 画像2のソース。空文字で省略。
        image2_position: 画像2の配置位置。
        image2_size: 画像2のサイズ。
        image3: 画像3のソース。空文字で省略。
        image3_position: 画像3の配置位置。
        image3_size: 画像3のサイズ。
        base_image: ベース画像のソース。
    """
    logger.info(f"generate_video: duration={duration}, format={video_format}")

    # バリデーション
    duration = max(1, min(30, duration))
    supported_formats = ['MXF', 'MP4', 'WEBM', 'AVI']
    if video_format.upper() not in supported_formats:
        video_format = 'MP4'
    video_format = video_format.upper()

    # 位置・サイズを解決
    pos1 = _resolve_position(image1_position)
    sz1 = _resolve_size(image1_size)

    # ImageProcessor Lambdaにパラメータを組み立て
    invoke_params = {
        'image1': image1,
        'image1_x': str(pos1[0]),
        'image1_y': str(pos1[1]),
        'image1_width': str(sz1[0]),
        'image1_height': str(sz1[1]),
        'base_image': base_image,
        'format': 'png',
        'generate_video': 'true',
        'video_duration': str(duration),
        'video_format': video_format,
    }

    if image2:
        pos2 = _resolve_position(image2_position)
        sz2 = _resolve_size(image2_size)
        invoke_params.update({
            'image2': image2,
            'image2_x': str(pos2[0]),
            'image2_y': str(pos2[1]),
            'image2_width': str(sz2[0]),
            'image2_height': str(sz2[1]),
        })

    if image3:
        pos3 = _resolve_position(image3_position)
        sz3 = _resolve_size(image3_size)
        invoke_params.update({
            'image3': image3,
            'image3_x': str(pos3[0]),
            'image3_y': str(pos3[1]),
            'image3_width': str(sz3[0]),
            'image3_height': str(sz3[1]),
        })

    # ImageProcessor Lambda を呼び出し（ffmpegはそちらに搭載）
    function_name = os.environ.get('IMAGE_PROCESSOR_FUNCTION', '')
    if not function_name:
        return {'success': False, 'error': '動画生成サービスが設定されていません'}

    lambda_client = boto3.client('lambda')
    lambda_payload = {
        'httpMethod': 'GET',
        'path': '/images/composite',
        'queryStringParameters': invoke_params,
    }

    response = lambda_client.invoke(
        FunctionName=function_name,
        InvocationType='RequestResponse',
        Payload=json.dumps(lambda_payload),
    )

    result_payload = json.loads(response['Payload'].read())
    status_code = result_payload.get('statusCode', 0)
    result_body = json.loads(result_payload.get('body', '{}'))

    if status_code != 200:
        error_msg = result_body.get('error', '動画生成に失敗しました')
        return {'success': False, 'error': error_msg}

    video_url = result_body.get('url', '')
    if not video_url:
        return {'success': False, 'error': '動画URLが返却されませんでした'}

    # video_urlはコンテキストウィンドウ超過を防ぐため、グローバル変数に保存
    global _last_media_result
    _last_media_result = {
        'type': 'video',
        'url': video_url,
    }

    return {
        'success': True,
        'video_generated': True,
        'filename': result_body.get('filename', ''),
        'format': video_format,
        'duration': duration,
    }


@tool
def list_uploaded_images() -> dict:
    """アップロード済み画像の一覧を取得します。ファイル名・サイズ・日時を返します。サムネイルURLは応答テキストに含めないでください。"""
    s3_client = _get_s3_client()
    upload_bucket = os.environ.get('S3_UPLOAD_BUCKET', os.environ.get('UPLOAD_BUCKET', ''))

    if not upload_bucket:
        return {'success': False, 'error': 'アップロードバケットが設定されていません'}

    try:
        response = s3_client.list_objects_v2(
            Bucket=upload_bucket,
            Prefix='uploads/images/',
            MaxKeys=50,
        )

        images = []
        if 'Contents' in response:
            for obj in response['Contents']:
                filename = obj['Key'].split('/')[-1]
                if not filename:
                    continue
                images.append({
                    'key': obj['Key'],
                    'filename': filename,
                    'size_bytes': obj['Size'],
                    'size_display': _format_size(obj['Size']),
                    'last_modified': obj['LastModified'].isoformat(),
                })

        # 画像一覧データはグローバル変数に保存（agent_handlerで署名付きURL付与）
        global _last_media_result
        _last_media_result = {
            'type': 'image_list',
            'images': images,
            'count': len(images),
        }

        return {
            'success': True,
            'count': len(images),
            'type': 'image_list',
            'images': [{'filename': img['filename'], 'size_display': img['size_display'], 'last_modified': img['last_modified']} for img in images],
        }
    except Exception as e:
        logger.error(f"Failed to list images: {e}")
        return {'success': False, 'error': str(e)}


@tool
def delete_uploaded_image(image_key: str) -> dict:
    """アップロード済み画像をS3から削除します。

    Args:
        image_key: 削除する画像のS3キー（例: "uploads/images/xxx.png"）。ファイル名のみの場合は自動的にプレフィックスを付与します。
    """
    s3_client = _get_s3_client()
    upload_bucket = os.environ.get('S3_UPLOAD_BUCKET', os.environ.get('UPLOAD_BUCKET', ''))

    if not upload_bucket:
        return {'success': False, 'error': 'アップロードバケットが設定されていません'}

    # ファイル名のみの場合はプレフィックスを付与
    if not image_key.startswith('uploads/images/'):
        image_key = f"uploads/images/{image_key}"

    # パストラバーサル防止
    if '..' in image_key:
        return {'success': False, 'error': '不正なキーです'}

    try:
        # 存在確認
        s3_client.head_object(Bucket=upload_bucket, Key=image_key)

        # 削除
        s3_client.delete_object(Bucket=upload_bucket, Key=image_key)

        # サムネイルも削除
        base_name, _ = os.path.splitext(image_key.replace('uploads/images/', 'thumbnails/'))
        thumbnail_key = f"{base_name}.png"
        try:
            s3_client.delete_object(Bucket=upload_bucket, Key=thumbnail_key)
        except Exception:
            pass

        return {
            'success': True,
            'deleted_key': image_key,
            'message': f'{image_key.split("/")[-1]} を削除しました',
        }
    except ClientError as e:
        if e.response['Error']['Code'] == '404':
            return {'success': False, 'error': f'画像が見つかりません: {image_key}'}
        return {'success': False, 'error': str(e)}
    except Exception as e:
        logger.error(f"Failed to delete image: {e}")
        return {'success': False, 'error': str(e)}


@tool
def get_help(topic: str = "") -> str:
    """画像合成システムの使い方やヘルプ情報を取得します。

    Args:
        topic: ヘルプトピック。"画像合成","動画生成","アセット管理","位置指定","画像ソース"等。空文字で概要を表示。
    """
    if not topic or topic == '概要':
        return """## 画像合成アシスタント ヘルプ

このアシスタントは以下の機能を提供します:

1. **画像合成**: 最大3枚の画像をキャンバス(1920x1080)に配置して合成
2. **動画生成**: 合成画像からMXF/MP4/WEBM/AVI形式の動画を生成
3. **アセット管理**: アップロード画像の一覧表示・削除

### 使用例
- 「テスト画像を3枚使って合成して」
- 「画像1を左上、画像2を右下に配置して合成」
- 「さっきの結果をMP4で5秒の動画にして」
- 「アップロードした画像を見せて」

詳しくは各トピックを聞いてください: 画像合成, 動画生成, アセット管理, 位置指定, 画像ソース"""

    topic = topic.strip()

    if '画像合成' in topic or '合成' in topic:
        return """## 画像合成

最大3枚の画像をキャンバス(1920x1080)に配置して合成します。

### パラメータ
- **画像ソース**: "test"(テスト画像), S3画像名, HTTP URL
- **位置**: "左上","中央","右下"等、または (x, y) 座標
- **サイズ**: "幅x高さ"形式（例: 400x400）
- **ベース画像**: "test"(テスト画像), "transparent"(透明), S3/URL

### 例
- 「テスト画像を左上に小さめで配置して」
- 「logo.pngを中央に800x600で配置して」
- 「3枚のテスト画像をバランスよく配置して」"""

    if '動画' in topic:
        return """## 動画生成

合成画像から動画ファイルを生成します。

### 対応フォーマット
- **MP4**: 最も一般的。ブラウザ再生可能
- **WEBM**: Web向け。軽量
- **MXF**: 放送用途
- **AVI**: レガシー互換

### パラメータ
- 長さ: 1〜30秒（デフォルト: 3秒）
- フォーマット: MP4/WEBM/MXF/AVI（デフォルト: MP4）

### 例
- 「MP4で5秒の動画にして」
- 「テスト画像で動画を作って」"""

    if 'アセット' in topic or '管理' in topic or 'アップロード' in topic:
        return """## アセット管理

S3にアップロードされた画像を管理します。

### 機能
- **一覧表示**: アップロード済み画像のリスト
- **削除**: 不要な画像の削除
- **合成で使用**: アップロード画像を合成に利用

### 例
- 「アップロードした画像の一覧を見せて」
- 「logo.pngを削除して」
- 「アップロードしたbackground.jpgをベース画像にして合成」"""

    if '位置' in topic:
        return """## 位置指定

キャンバス(1920x1080)上の位置を指定する方法:

### 名前指定
左上(50,50) | 中央上(710,50) | 右上(1470,50)
左中央(50,290) | 中央(710,290) | 右中央(1470,290)
左下(50,630) | 中央下(710,630) | 右下(1470,630)

### 座標指定
"x,y" 形式で直接指定（例: "500,300"）"""

    if '画像ソース' in topic or 'ソース' in topic:
        return """## 画像ソース

### テスト画像
- "test" と指定すると、画像番号に応じたテスト画像を使用
  - 画像1: 赤い円
  - 画像2: 青い矩形
  - 画像3: 緑の三角形

### S3アップロード画像
- ファイル名で指定（例: "logo.png"）
- アップロードした画像を使用

### HTTP URL
- 外部画像のURLを直接指定
- HTTPS推奨"""

    return f"'{topic}' に関するヘルプは見つかりませんでした。利用可能なトピック: 画像合成, 動画生成, アセット管理, 位置指定, 画像ソース"


def _format_size(size_bytes: int) -> str:
    """バイト数を読みやすい形式に変換"""
    if size_bytes < 1024:
        return f"{size_bytes}B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f}KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f}MB"
