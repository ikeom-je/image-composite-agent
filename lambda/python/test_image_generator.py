"""
テスト画像生成モジュール - v2.4.0

高品質なテスト画像（円・四角・三角）を生成するモジュール。
アルファチャンネル対応で透過背景をサポート。
"""

from PIL import Image, ImageDraw
from typing import Tuple
import io


def generate_circle_image(size: Tuple[int, int] = (400, 400), 
                         color: Tuple[int, int, int] = (239, 68, 68)) -> Image.Image:
    """
    赤色の円形画像を生成する
    
    Args:
        size: 画像サイズ (width, height)
        color: RGB色値 (デフォルト: 赤色 #EF4444)
        
    Returns:
        PIL.Image.Image: 透過背景の円形画像
    """
    # RGBA画像を作成（透過背景）
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 円の描画
    width, height = size
    margin = min(width, height) // 8
    draw.ellipse([margin, margin, width - margin, height - margin], 
                 fill=(*color, 255))
    
    return img


def generate_rectangle_image(size: Tuple[int, int] = (400, 400), 
                           color: Tuple[int, int, int] = (59, 130, 246)) -> Image.Image:
    """
    青色の四角形画像を生成する
    
    Args:
        size: 画像サイズ (width, height)
        color: RGB色値 (デフォルト: 青色 #3B82F6)
        
    Returns:
        PIL.Image.Image: 透過背景の四角形画像
    """
    # RGBA画像を作成（透過背景）
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 四角形の描画
    width, height = size
    margin = min(width, height) // 8
    draw.rectangle([margin, margin, width - margin, height - margin], 
                   fill=(*color, 255))
    
    return img


def generate_triangle_image(size: Tuple[int, int] = (400, 400), 
                          color: Tuple[int, int, int] = (34, 197, 94)) -> Image.Image:
    """
    緑色の三角形画像を生成する
    
    Args:
        size: 画像サイズ (width, height)
        color: RGB色値 (デフォルト: 緑色 #22C55E)
        
    Returns:
        PIL.Image.Image: 透過背景の三角形画像
    """
    # RGBA画像を作成（透過背景）
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 三角形の頂点を計算
    width, height = size
    triangle_points = [
        (width // 2, height // 4),      # 上の頂点
        (width // 4, height * 3 // 4),  # 左下の頂点
        (width * 3 // 4, height * 3 // 4)  # 右下の頂点
    ]
    
    # 三角形を描画（アンチエイリアス対応）
    draw.polygon(triangle_points, fill=(*color, 255))
    
    return img


def save_test_images_to_s3(bucket_name: str, s3_client=None) -> dict:
    """
    テスト画像を生成してS3に保存する
    
    Args:
        bucket_name: S3バケット名
        s3_client: boto3 S3クライアント（Noneの場合は新規作成）
        
    Returns:
        dict: 保存結果の辞書
    """
    import boto3
    
    if s3_client is None:
        s3_client = boto3.client('s3')
    
    results = {}
    
    # 各テスト画像を生成・保存
    test_images = {
        'circle_red.png': generate_circle_image(),
        'rectangle_blue.png': generate_rectangle_image(),
        'triangle_green.png': generate_triangle_image()
    }
    
    for filename, image in test_images.items():
        try:
            # PNG形式でバイト配列に変換
            img_buffer = io.BytesIO()
            image.save(img_buffer, format='PNG', optimize=True)
            img_buffer.seek(0)
            
            # S3にアップロード
            s3_key = f"images/{filename}"
            s3_client.put_object(
                Bucket=bucket_name,
                Key=s3_key,
                Body=img_buffer.getvalue(),
                ContentType='image/png'
            )
            
            results[filename] = {
                'status': 'success',
                's3_key': s3_key,
                'size': len(img_buffer.getvalue())
            }
            
        except Exception as e:
            results[filename] = {
                'status': 'error',
                'error': str(e)
            }
    
    return results


if __name__ == "__main__":
    # テスト実行用
    print("テスト画像生成テスト")
    
    # 各画像を生成してローカルに保存
    circle = generate_circle_image()
    rectangle = generate_rectangle_image()
    triangle = generate_triangle_image()
    
    circle.save("test_circle.png")
    rectangle.save("test_rectangle.png")
    triangle.save("test_triangle.png")
    
    print("✅ テスト画像生成完了")
    print("- test_circle.png (赤い円)")
    print("- test_rectangle.png (青い四角)")
    print("- test_triangle.png (緑い三角)")