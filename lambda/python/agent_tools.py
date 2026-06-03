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
    base_opacity: int = 100,
    text1: str = "",
    text1_position: str = "左下",
    text1_font_size: int = 48,
    text1_font_color: str = "#FFFFFF",
    text1_bg_color: str = "",
    text1_bg_opacity: float = 0.7,
    text1_wrap: bool = False,
    text1_max_width: int = 0,
    text1_padding: int = 10,
    text2: str = "",
    text2_position: str = "中央下",
    text2_font_size: int = 48,
    text2_font_color: str = "#FFFFFF",
    text2_bg_color: str = "",
    text2_bg_opacity: float = 0.7,
    text2_wrap: bool = False,
    text2_max_width: int = 0,
    text2_padding: int = 10,
    text3: str = "",
    text3_position: str = "右下",
    text3_font_size: int = 48,
    text3_font_color: str = "#FFFFFF",
    text3_bg_color: str = "",
    text3_bg_opacity: float = 0.7,
    text3_wrap: bool = False,
    text3_max_width: int = 0,
    text3_padding: int = 10,
) -> dict:
    """画像を合成します。最大3枚の画像をキャンバス（1920x1080）上に配置して合成します。

    呼び出し前の必須手順（相対配置・サイズ指示が含まれる場合）:
      ① テキスト寸法に依存するなら estimate_text_size を呼び実寸を取得
      ② **必ず calculate_relative_position(ref_*, direction, target_*) を呼んで (x, y) を取得**
         （LLM 自身で算術しない。Nova 等の暗算ミスを回避する設計）
      ③ ②で得た x, y を image*_position / text*_position に "x,y" 形式で渡す
      ④ ヒューリスティックな推定（「下 ≈ y を少し増やす」等）は禁止

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
        base_image: ベース画像のソース。"test","transparent","white","#RRGGBB","#RRGGBBAA",S3キー,HTTP URL。
        base_opacity: ベース画像の透明度（0-100）。0=完全透明、100=不透明。デフォルト100。
        text1: テキスト1の内容。空文字で省略。
        text1_position: テキスト1の配置位置。"左上","中央"等の名前、または"x,y"座標。
        text1_font_size: テキスト1のフォントサイズ(px)。
        text1_font_color: テキスト1の文字色（"#FFFFFF"等のCSS形式）。
        text1_bg_color: テキスト1の背景色（省略で背景なし）。
        text1_bg_opacity: テキスト1の背景不透明度（0.0-1.0）。
        text1_wrap: テキスト1の折り返し有効化。
        text1_max_width: テキスト1の最大幅（0で制限なし）。
        text1_padding: テキスト1の余白(px)。
        text2: テキスト2の内容。空文字で省略。
        text2_position: テキスト2の配置位置。
        text2_font_size: テキスト2のフォントサイズ(px)。
        text2_font_color: テキスト2の文字色。
        text2_bg_color: テキスト2の背景色。
        text2_bg_opacity: テキスト2の背景不透明度。
        text2_wrap: テキスト2の折り返し有効化。
        text2_max_width: テキスト2の最大幅。
        text2_padding: テキスト2の余白(px)。
        text3: テキスト3の内容。空文字で省略。
        text3_position: テキスト3の配置位置。
        text3_font_size: テキスト3のフォントサイズ(px)。
        text3_font_color: テキスト3の文字色。
        text3_bg_color: テキスト3の背景色。
        text3_bg_opacity: テキスト3の背景不透明度。
        text3_wrap: テキスト3の折り返し有効化。
        text3_max_width: テキスト3の最大幅。
        text3_padding: テキスト3の余白(px)。
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
    if base_image and base_image not in ('transparent',):
        if base_image == 'white':
            base_img = Image.new('RGBA', (2000, 1000), (255, 255, 255, 255))
        elif base_image.startswith('#'):
            from text_renderer import _parse_color
            color = _parse_color(base_image)
            if len(color) == 3:
                color = (*color, 255)
            base_img = Image.new('RGBA', (2000, 1000), color)
        else:
            base_img = fetch_image(base_image, 'base')

    # テキストパラメータの構築
    text_params = {}
    for i, (txt, pos, fsz, fcol, bgcol, bgop, wrp, mw, pad) in enumerate([
        (text1, text1_position, text1_font_size, text1_font_color, text1_bg_color, text1_bg_opacity, text1_wrap, text1_max_width, text1_padding),
        (text2, text2_position, text2_font_size, text2_font_color, text2_bg_color, text2_bg_opacity, text2_wrap, text2_max_width, text2_padding),
        (text3, text3_position, text3_font_size, text3_font_color, text3_bg_color, text3_bg_opacity, text3_wrap, text3_max_width, text3_padding),
    ], 1):
        if txt:
            tpos = _resolve_position(pos)
            text_params[f'text{i}'] = {
                'text': txt,
                'x': tpos[0], 'y': tpos[1],
                'font_size': fsz,
                'font_color': fcol,
                'font_family': 'NotoSansJP',
                'bg_color': bgcol if bgcol else None,
                'bg_opacity': bgop,
                'wrap': wrp,
                'max_width': mw if mw > 0 else None,
                'padding': pad,
            }

    # 合成実行（クランプは apply_base_opacity 側に集約 - Issue #39）
    composite = create_composite_image(base_img, img1, img2, img3, params,
                                       text_params=text_params if text_params else None,
                                       base_opacity=base_opacity)

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
    for i in range(1, 4):
        key = f'text{i}'
        if key in text_params:
            tp = text_params[key]
            summary_lines.append(
                f"テキスト{i}: \"{tp['text']}\", 位置=({tp['x']}, {tp['y']}), サイズ={tp['font_size']}px"
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
    base_opacity: int = 100,
    text1: str = "",
    text1_position: str = "左下",
    text1_font_size: int = 48,
    text1_font_color: str = "#FFFFFF",
    text1_bg_color: str = "",
    text1_bg_opacity: float = 0.7,
    text1_wrap: bool = False,
    text1_max_width: int = 0,
    text1_padding: int = 10,
    text2: str = "",
    text2_position: str = "中央下",
    text2_font_size: int = 48,
    text2_font_color: str = "#FFFFFF",
    text2_bg_color: str = "",
    text2_bg_opacity: float = 0.7,
    text2_wrap: bool = False,
    text2_max_width: int = 0,
    text2_padding: int = 10,
    text3: str = "",
    text3_position: str = "右下",
    text3_font_size: int = 48,
    text3_font_color: str = "#FFFFFF",
    text3_bg_color: str = "",
    text3_bg_opacity: float = 0.7,
    text3_wrap: bool = False,
    text3_max_width: int = 0,
    text3_padding: int = 10,
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
        base_image: ベース画像のソース。"test","transparent","white","#RRGGBB","#RRGGBBAA",S3キー,HTTP URL。
        base_opacity: ベース画像の透明度（0-100）。0=完全透明、100=不透明。デフォルト100。
        text1: テキスト1の内容。空文字で省略。
        text1_position: テキスト1の配置位置。
        text1_font_size: テキスト1のフォントサイズ(px)。
        text1_font_color: テキスト1の文字色。
        text1_bg_color: テキスト1の背景色。
        text1_bg_opacity: テキスト1の背景不透明度。
        text1_wrap: テキスト1の折り返し有効化。
        text1_max_width: テキスト1の最大幅。
        text1_padding: テキスト1の余白(px)。
        text2: テキスト2の内容。空文字で省略。
        text2_position: テキスト2の配置位置。
        text2_font_size: テキスト2のフォントサイズ(px)。
        text2_font_color: テキスト2の文字色。
        text2_bg_color: テキスト2の背景色。
        text2_bg_opacity: テキスト2の背景不透明度。
        text2_wrap: テキスト2の折り返し有効化。
        text2_max_width: テキスト2の最大幅。
        text2_padding: テキスト2の余白(px)。
        text3: テキスト3の内容。空文字で省略。
        text3_position: テキスト3の配置位置。
        text3_font_size: テキスト3のフォントサイズ(px)。
        text3_font_color: テキスト3の文字色。
        text3_bg_color: テキスト3の背景色。
        text3_bg_opacity: テキスト3の背景不透明度。
        text3_wrap: テキスト3の折り返し有効化。
        text3_max_width: テキスト3の最大幅。
        text3_padding: テキスト3の余白(px)。
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
    # キー名は image_processor.parse_image_parameters が期待する camelCase に揃える (Issue #41)
    invoke_params = {
        'image1': image1,
        'image1X': str(pos1[0]),
        'image1Y': str(pos1[1]),
        'image1Width': str(sz1[0]),
        'image1Height': str(sz1[1]),
        'baseImage': base_image,
        # クランプは image_processor 経由で apply_base_opacity 側に集約 (Issue #39)
        'baseOpacity': str(base_opacity),
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
            'image2X': str(pos2[0]),
            'image2Y': str(pos2[1]),
            'image2Width': str(sz2[0]),
            'image2Height': str(sz2[1]),
        })

    if image3:
        pos3 = _resolve_position(image3_position)
        sz3 = _resolve_size(image3_size)
        invoke_params.update({
            'image3': image3,
            'image3X': str(pos3[0]),
            'image3Y': str(pos3[1]),
            'image3Width': str(sz3[0]),
            'image3Height': str(sz3[1]),
        })

    # テキストパラメータをinvoke_paramsに追加
    for i, (txt, pos, fsz, fcol, bgcol, bgop, wrp, mw, pad) in enumerate([
        (text1, text1_position, text1_font_size, text1_font_color, text1_bg_color, text1_bg_opacity, text1_wrap, text1_max_width, text1_padding),
        (text2, text2_position, text2_font_size, text2_font_color, text2_bg_color, text2_bg_opacity, text2_wrap, text2_max_width, text2_padding),
        (text3, text3_position, text3_font_size, text3_font_color, text3_bg_color, text3_bg_opacity, text3_wrap, text3_max_width, text3_padding),
    ], 1):
        if txt:
            tpos = _resolve_position(pos)
            invoke_params[f'text{i}'] = txt
            invoke_params[f'text{i}X'] = str(tpos[0])
            invoke_params[f'text{i}Y'] = str(tpos[1])
            invoke_params[f'text{i}FontSize'] = str(fsz)
            invoke_params[f'text{i}FontColor'] = fcol
            if bgcol:
                invoke_params[f'text{i}BgColor'] = bgcol
                invoke_params[f'text{i}BgOpacity'] = str(bgop)
            if wrp:
                invoke_params[f'text{i}Wrap'] = 'true'
                if mw > 0:
                    invoke_params[f'text{i}MaxWidth'] = str(mw)
            invoke_params[f'text{i}Padding'] = str(pad)

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


_RELATIVE_DIRECTION_ALIASES = {
    '下': '下', '下部': '下', '真下': '下', '下に': '下',
    '上': '上', '上部': '上', '真上': '上', '上に': '上',
    '右': '右', '右側': '右', '右に': '右',
    '左': '左', '左側': '左', '左に': '左',
    '横並び': '横並び', '横に並べて': '横並び', '横に並べる': '横並び',
    '縦並び': '縦並び', '縦に並べて': '縦並び', '縦に並べる': '縦並び',
    '中央': '中央', '中心': '中央',
    '真下中央': '真下中央', '下中央': '真下中央',
    '真上中央': '真上中央', '上中央': '真上中央',
    'x揃え': 'x揃え', 'X揃え': 'x揃え', '左端揃え': 'x揃え',
    'y揃え': 'y揃え', 'Y揃え': 'y揃え', '上端揃え': 'y揃え',
}


@tool
def calculate_relative_position(
    ref_x: int,
    ref_y: int,
    ref_width: int,
    ref_height: int,
    direction: str,
    target_width: int = 0,
    target_height: int = 0,
    margin: int = 20,
) -> dict:
    """参照要素 A を基準に配置対象 B の (x, y) を確定的に計算する。

    LLM の暗算ミスを避けるため相対配置の算術をツール側で実行する。
    compose_images / generate_video の image*_position / text*_position に
    渡す "x,y" 文字列の元になる値を返す。

    direction:
      - "下" / "下部" / "真下" → y = ref_y + ref_height + margin, x = ref_x
      - "真下中央" → y = ref_y + ref_height + margin, x = ref_x + ref_width//2 - target_width//2
      - "上" / "上部" / "真上" → y = ref_y - target_height - margin, x = ref_x
      - "真上中央" → y = ref_y - target_height - margin, x = ref_x + ref_width//2 - target_width//2
      - "右" / "右側" → x = ref_x + ref_width + margin, y = ref_y
      - "左" / "左側" → x = ref_x - target_width - margin, y = ref_y
      - "横並び" → y = ref_y, x = ref_x + ref_width + margin（A の右に水平整列）
      - "縦並び" → x = ref_x, y = ref_y + ref_height + margin（A の下に垂直整列）
      - "中央" → A の中心に B 中央を合わせる
      - "x揃え" → x = ref_x（左端揃えのみ、y は ref_y を返すが通常別途指定）
      - "y揃え" → y = ref_y

    target_width / target_height は中央揃え系・「上」「左」など B の寸法が
    計算に必要な direction のときに指定する。それ以外は 0 でよい。

    Args:
        ref_x, ref_y, ref_width, ref_height: 参照要素 A のサイズ・位置
        direction: 上記いずれかの相対位置キーワード
        target_width: 配置対象 B の幅（中央揃え系・「左」で必須）
        target_height: 配置対象 B の高さ（「上」「真上中央」で必須）
        margin: 隣接マージン px、デフォルト 20

    Returns:
        {"x": int, "y": int}: 配置対象 B の左上座標。
        座標がキャンバス (1920x1080) からはみ出る場合も生値で返す
        （compose_images 側で clamp する）。
    """
    key = _RELATIVE_DIRECTION_ALIASES.get(direction.strip())
    if key is None:
        return {"error": f"unknown direction: {direction!r}", "x": ref_x, "y": ref_y}

    if key == '下':
        return {"x": int(ref_x), "y": int(ref_y + ref_height + margin)}
    if key == '真下中央':
        return {"x": int(ref_x + ref_width // 2 - target_width // 2),
                "y": int(ref_y + ref_height + margin)}
    if key == '上':
        return {"x": int(ref_x), "y": int(ref_y - target_height - margin)}
    if key == '真上中央':
        return {"x": int(ref_x + ref_width // 2 - target_width // 2),
                "y": int(ref_y - target_height - margin)}
    if key == '右':
        return {"x": int(ref_x + ref_width + margin), "y": int(ref_y)}
    if key == '左':
        return {"x": int(ref_x - target_width - margin), "y": int(ref_y)}
    if key == '横並び':
        return {"x": int(ref_x + ref_width + margin), "y": int(ref_y)}
    if key == '縦並び':
        return {"x": int(ref_x), "y": int(ref_y + ref_height + margin)}
    if key == '中央':
        return {"x": int(ref_x + ref_width // 2 - target_width // 2),
                "y": int(ref_y + ref_height // 2 - target_height // 2)}
    if key == 'x揃え':
        return {"x": int(ref_x), "y": int(ref_y)}
    if key == 'y揃え':
        return {"x": int(ref_x), "y": int(ref_y)}
    return {"error": "unreachable", "x": ref_x, "y": ref_y}


@tool
def estimate_text_size(text: str, font_size: int = 48) -> dict:
    """テキストの描画サイズ (width, height, line_height) を Noto Sans JP の実測 textbbox で推定する。

    用途: 「テキスト幅と同じサイズの画像」「テキストの下に画像」のような
    要素間の相対指示でテキストの描画寸法に依存する場合、compose_images 呼び出し
    **前**にこのツールを呼び出してテキストの実寸を取得する。
    compose_images と同じフォントの textbbox 計算なので合成時の描画ズレなし。

    呼び出し条件:
      - 「テキスト幅と同じ画像」: 画像 width = 戻り値["width"]
      - 「テキストの下に画像」: 画像 Y = テキスト Y + 戻り値["height"] + マージン
      - 「テキスト B を画像 A の下に中央揃え」: B の絶対 X 計算に B.width が必要
      - 名前位置（「左上」等）や絶対座標で直接配置するだけの時は **不要**

    Args:
        text: 計測対象のテキスト（空文字 / 改行入り可）
        font_size: フォントサイズ px（デフォルト 48、compose_images の text*_font_size と同値を渡す）

    Returns:
        {"width": int, "height": int, "line_height": int}
        - width / height: textbbox の実描画範囲（px）
        - line_height: font_size × 1.2（CSS 慣例、複数行配置時の参考）
    """
    from text_renderer import load_font, calculate_text_bbox
    font = load_font(font_family='NotoSansJP', font_size=font_size)
    w, h = calculate_text_bbox(text, font)
    return {"width": int(w), "height": int(h), "line_height": int(font_size * 1.2)}


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
