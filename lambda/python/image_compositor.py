"""
画像合成エンジン - v3.2.0

2つまたは3つの画像を高品質に合成するエンジン。
アルファチャンネル対応、LANCZOS補間による高品質リサイズ。
"""

from PIL import Image
import logging
from typing import Dict, Any, Optional, Tuple

# ログ設定
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def parse_image_parameters(query_params: Dict[str, str]) -> Dict[str, Dict[str, int]]:
    """
    クエリパラメータから画像配置パラメータを解析する
    
    Args:
        query_params: API Gatewayからのクエリパラメータ
        
    Returns:
        Dict[str, Dict[str, int]]: 解析された画像パラメータ
    """
    def safe_int(value: str, default: int) -> int:
        """文字列を安全に整数に変換"""
        try:
            return int(value) if value else default
        except (ValueError, TypeError):
            return default
    
    # デフォルト値の設定
    defaults = {
        'image1': {'x': 1600, 'y': 20, 'width': 300, 'height': 200},
        'image2': {'x': 1600, 'y': 240, 'width': 300, 'height': 200},
        'image3': {'x': 20, 'y': 20, 'width': 300, 'height': 200}
    }
    
    params = {}
    
    for image_name in ['image1', 'image2', 'image3']:
        params[image_name] = {
            'x': safe_int(query_params.get(f'{image_name}X'), defaults[image_name]['x']),
            'y': safe_int(query_params.get(f'{image_name}Y'), defaults[image_name]['y']),
            'width': safe_int(query_params.get(f'{image_name}Width'), defaults[image_name]['width']),
            'height': safe_int(query_params.get(f'{image_name}Height'), defaults[image_name]['height'])
        }
    
    return params


def parse_text_parameters(query_params: Dict[str, str]) -> Dict[str, Dict[str, Any]]:
    """クエリパラメータからテキスト配置パラメータを解析する"""
    def safe_int(value, default):
        try:
            return int(value) if value else default
        except (ValueError, TypeError):
            return default

    def safe_float(value, default):
        try:
            return float(value) if value else default
        except (ValueError, TypeError):
            return default

    params = {}
    for text_name in ['text1', 'text2', 'text3']:
        text_content = query_params.get(text_name)
        if not text_content:
            continue
        params[text_name] = {
            'text': text_content,
            'x': safe_int(query_params.get(f'{text_name}X'), 0),
            'y': safe_int(query_params.get(f'{text_name}Y'), 0),
            'font_size': safe_int(query_params.get(f'{text_name}FontSize'), 48),
            'font_color': query_params.get(f'{text_name}FontColor', '#FFFFFF'),
            'font_family': query_params.get(f'{text_name}FontFamily', 'NotoSansJP'),
            'bg_color': query_params.get(f'{text_name}BgColor') or None,
            'bg_opacity': safe_float(query_params.get(f'{text_name}BgOpacity'), 0.7),
            'wrap': query_params.get(f'{text_name}Wrap', 'false').lower() == 'true',
            'max_width': safe_int(query_params.get(f'{text_name}MaxWidth'), None),
            'padding': safe_int(query_params.get(f'{text_name}Padding'), 10),
        }
    return params


def validate_text_parameters(params: Dict[str, Dict[str, Any]]) -> list:
    """テキストパラメータの検証"""
    errors = []
    for text_name, tp in params.items():
        if tp['x'] < 0 or tp['y'] < 0:
            errors.append(f'{text_name}の位置座標は0以上である必要があります')
        if tp['font_size'] <= 0:
            errors.append(f'{text_name}のフォントサイズは1以上である必要があります')
        if tp['font_size'] > 500:
            errors.append(f'{text_name}のフォントサイズは500以下である必要があります')
        if tp['wrap'] and tp.get('max_width') is not None and tp['max_width'] <= 0:
            errors.append(f'{text_name}のMaxWidthは1以上である必要があります')
    return errors


def validate_image_parameters(params: Dict[str, Dict[str, int]]) -> list:
    """
    画像パラメータの検証
    
    Args:
        params: 画像パラメータ
        
    Returns:
        list: エラーメッセージのリスト（空の場合は検証成功）
    """
    errors = []
    
    for image_name, image_params in params.items():
        # 位置の検証
        if image_params['x'] < 0 or image_params['y'] < 0:
            errors.append(f'{image_name}の位置座標は0以上である必要があります')
        
        # サイズの検証
        if image_params['width'] <= 0 or image_params['height'] <= 0:
            errors.append(f'{image_name}のサイズは1以上である必要があります')
        
        # 最大サイズの検証
        if image_params['width'] > 5000 or image_params['height'] > 5000:
            errors.append(f'{image_name}のサイズは5000ピクセル以下である必要があります')
        
        # 最大位置の検証（キャンバスサイズを考慮）
        max_canvas_size = 10000
        if (image_params['x'] + image_params['width']) > max_canvas_size:
            errors.append(f'{image_name}がキャンバスの右端を超えています')
        
        if (image_params['y'] + image_params['height']) > max_canvas_size:
            errors.append(f'{image_name}がキャンバスの下端を超えています')
    
    return errors


def create_base_image(base_img: Optional[Image.Image], canvas_size: Tuple[int, int] = (2000, 1000)) -> Image.Image:
    """
    ベース画像を準備する
    
    Args:
        base_img: ベース画像（Noneの場合は透明背景を作成）
        canvas_size: キャンバスサイズ
        
    Returns:
        Image.Image: 準備されたベース画像
    """
    if base_img is None:
        # 透明背景の作成
        logger.info(f"Creating transparent base image: {canvas_size}")
        base_img = Image.new('RGBA', canvas_size, (0, 0, 0, 0))
    else:
        # 既存画像をRGBAモードに変換
        if base_img.mode != 'RGBA':
            base_img = base_img.convert('RGBA')
        
        # キャンバスサイズにリサイズ
        if base_img.size != canvas_size:
            logger.info(f"Resizing base image from {base_img.size} to {canvas_size}")
            base_img = base_img.resize(canvas_size, Image.LANCZOS)
    
    return base_img


def apply_base_opacity(base_img: Image.Image, opacity: int) -> Image.Image:
    """
    ベース画像にopacity（透明度）を適用する

    Args:
        base_img: ベース画像（RGBAモード）
        opacity: 透明度（0=完全透明、100=不透明、範囲外は内部で0-100にクランプ）

    Returns:
        Image.Image: opacity適用後のベース画像
    """
    # 範囲外の値を0-100にクランプ（呼び出し側でクランプ不要）
    opacity = max(0, min(100, opacity))

    if opacity >= 100:
        return base_img
    if opacity <= 0:
        return Image.new('RGBA', base_img.size, (0, 0, 0, 0))

    # アルファチャンネルにopacityを乗算
    r, g, b, a = base_img.split()
    a = a.point(lambda x: int(x * opacity / 100))
    base_img = Image.merge('RGBA', (r, g, b, a))
    logger.info(f"Applied base opacity: {opacity}%")
    return base_img


def resize_and_convert_image(image: Image.Image, target_size: Tuple[int, int]) -> Image.Image:
    """
    画像を高品質でリサイズし、RGBAモードに変換する
    
    Args:
        image: 元画像
        target_size: 目標サイズ (width, height)
        
    Returns:
        Image.Image: リサイズ・変換された画像
    """
    # RGBAモードに変換
    if image.mode != 'RGBA':
        image = image.convert('RGBA')
    
    # 高品質リサイズ（LANCZOS補間）
    if image.size != target_size:
        logger.debug(f"Resizing image from {image.size} to {target_size}")
        image = image.resize(target_size, Image.LANCZOS)
    
    return image


def paste_image_with_alpha(base: Image.Image, overlay: Image.Image, position: Tuple[int, int]) -> Image.Image:
    """
    アルファチャンネルを考慮して画像を合成する
    
    Args:
        base: ベース画像
        overlay: 重ねる画像
        position: 配置位置 (x, y)
        
    Returns:
        Image.Image: 合成された画像
    """
    # アルファチャンネルを使用して合成
    base.paste(overlay, position, overlay)
    return base


def create_composite_image(base_img: Optional[Image.Image],
                          image1: Image.Image,
                          image2: Optional[Image.Image],
                          image3: Optional[Image.Image],
                          params: Dict[str, Dict[str, int]],
                          text_params: Optional[Dict[str, Dict[str, Any]]] = None,
                          base_opacity: int = 100) -> Image.Image:
    """
    1つ、2つ、または3つの画像を合成する（image1のみ必須）

    Args:
        base_img: ベース画像（Noneの場合は透明背景）
        image1: 合成する1つ目の画像（必須）
        image2: 合成する2つ目の画像（オプション）
        image3: 合成する3つ目の画像（オプション）
        params: 各画像の配置パラメータ
        text_params: テキスト描画パラメータ（オプション）
        base_opacity: ベース画像の透明度（0-100、デフォルト100=不透明）

    Returns:
        Image.Image: 合成された画像

    Raises:
        ValueError: パラメータが無効な場合
        Exception: 合成処理に失敗した場合
    """
    try:
        # パラメータ検証
        validation_errors = validate_image_parameters(params)
        if validation_errors:
            raise ValueError(f"Invalid parameters: {', '.join(validation_errors)}")

        # 画像数をカウント
        image_count = 1  # image1は必須
        if image2: image_count += 1
        if image3: image_count += 1
        logger.info(f"Creating composite with {image_count} images")

        # ベース画像の準備
        composite = create_base_image(base_img)

        # ベース画像にopacityを適用
        composite = apply_base_opacity(composite, base_opacity)
        
        # 画像1の合成（必須）
        logger.info(f"Compositing image1 at ({params['image1']['x']}, {params['image1']['y']})")
        img1_resized = resize_and_convert_image(
            image1, 
            (params['image1']['width'], params['image1']['height'])
        )
        composite = paste_image_with_alpha(
            composite, 
            img1_resized, 
            (params['image1']['x'], params['image1']['y'])
        )
        
        # 画像2の合成（オプション）
        if image2 and 'image2' in params:
            logger.info(f"Compositing image2 at ({params['image2']['x']}, {params['image2']['y']})")
            img2_resized = resize_and_convert_image(
                image2, 
                (params['image2']['width'], params['image2']['height'])
            )
            composite = paste_image_with_alpha(
                composite, 
                img2_resized, 
                (params['image2']['x'], params['image2']['y'])
            )
        
        # 画像3の合成（オプション）
        if image3 and 'image3' in params:
            logger.info(f"Compositing image3 at ({params['image3']['x']}, {params['image3']['y']})")
            img3_resized = resize_and_convert_image(
                image3, 
                (params['image3']['width'], params['image3']['height'])
            )
            composite = paste_image_with_alpha(
                composite, 
                img3_resized, 
                (params['image3']['x'], params['image3']['y'])
            )
        
        # 画像合成後にテキストを描画（Z-order: 画像→テキスト）
        if text_params:
            from text_renderer import render_text_overlay
            text_errors = validate_text_parameters(text_params)
            if text_errors:
                raise ValueError(f"Invalid text parameters: {', '.join(text_errors)}")

            for text_name in ['text1', 'text2', 'text3']:
                if text_name not in text_params:
                    continue
                tp = text_params[text_name]
                composite = render_text_overlay(
                    composite,
                    text=tp['text'],
                    x=tp['x'], y=tp['y'],
                    font_size=tp['font_size'],
                    font_color=tp['font_color'],
                    font_family=tp['font_family'],
                    bg_color=tp.get('bg_color'),
                    bg_opacity=tp.get('bg_opacity', 0.7),
                    wrap=tp.get('wrap', False),
                    max_width=tp.get('max_width'),
                    padding=tp.get('padding', 10),
                )
                logger.info(f"Text '{text_name}' rendered at ({tp['x']}, {tp['y']})")

        logger.info(f"✅ Composite image created successfully: {composite.size} {composite.mode}")
        return composite
        
    except Exception as e:
        logger.error(f"❌ Failed to create composite image: {e}")
        raise Exception(f"Failed to create composite image: {str(e)}")


def optimize_composite_image(image: Image.Image, quality: int = 95) -> Image.Image:
    """
    合成画像を最適化する
    
    Args:
        image: 合成画像
        quality: 品質（1-100）
        
    Returns:
        Image.Image: 最適化された画像
    """
    # 不要な透明部分をトリミング（オプション）
    # bbox = image.getbbox()
    # if bbox:
    #     image = image.crop(bbox)
    
    # 色数の最適化（必要に応じて）
    # if image.mode == 'RGBA' and not has_transparency(image):
    #     image = image.convert('RGB')
    
    return image


def has_transparency(image: Image.Image) -> bool:
    """
    画像に透明部分があるかチェックする
    
    Args:
        image: チェックする画像
        
    Returns:
        bool: 透明部分がある場合True
    """
    if image.mode != 'RGBA':
        return False
    
    # アルファチャンネルをチェック
    alpha = image.split()[-1]
    return alpha.getextrema()[0] < 255


if __name__ == "__main__":
    # テスト実行用
    print("画像合成エンジンテスト")
    
    try:
        # テスト画像を生成
        from test_image_generator import (
            generate_circle_image,
            generate_rectangle_image,
            generate_triangle_image
        )
        
        # テスト画像の作成
        circle = generate_circle_image()
        rectangle = generate_rectangle_image()
        triangle = generate_triangle_image()
        
        # デフォルトパラメータでテスト
        test_params = parse_image_parameters({})
        
        print("📋 パラメータ検証テスト:")
        validation_errors = validate_image_parameters(test_params)
        if validation_errors:
            print(f"❌ 検証エラー: {validation_errors}")
        else:
            print("✅ パラメータ検証成功")
        
        # 2画像合成テスト
        print("\n🎨 2画像合成テスト:")
        composite_2 = create_composite_image(None, circle, rectangle, None, test_params)
        print(f"✅ 2画像合成完了: {composite_2.size} {composite_2.mode}")
        
        # 3画像合成テスト
        print("\n🎨 3画像合成テスト:")
        composite_3 = create_composite_image(None, circle, rectangle, triangle, test_params)
        print(f"✅ 3画像合成完了: {composite_3.size} {composite_3.mode}")
        
        # 透明度チェック
        print(f"\n🔍 透明度チェック:")
        print(f"  - 2画像合成: {'透明部分あり' if has_transparency(composite_2) else '透明部分なし'}")
        print(f"  - 3画像合成: {'透明部分あり' if has_transparency(composite_3) else '透明部分なし'}")
        
        # テスト画像を保存
        composite_2.save("test_composite_2.png")
        composite_3.save("test_composite_3.png")
        print(f"\n💾 テスト画像保存完了:")
        print(f"  - test_composite_2.png")
        print(f"  - test_composite_3.png")
        
    except Exception as e:
        print(f"❌ テストエラー: {e}")