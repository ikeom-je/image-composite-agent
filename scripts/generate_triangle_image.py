#!/usr/bin/env python3
"""
三角形テスト画像生成スクリプト

このスクリプトは第3画像合成機能用の三角形テスト画像を生成します。
- サイズ: 400x400ピクセル
- 色: 緑色 (#22c55e / RGB: 34, 197, 94)
- 背景: 透明（アルファチャンネル = 0）
- 形状: 正三角形（上向き）
- 保存形式: PNG
- 保存先: lambda/python/images/triangle_green.png
"""

import os
import sys
from PIL import Image, ImageDraw

def generate_triangle_image():
    """三角形テスト画像を生成する"""
    
    # 画像設定
    size = (400, 400)
    color = (34, 197, 94)  # 緑色 (Tailwind green-500: #22c55e)
    
    print("🎨 三角形テスト画像を生成中...")
    print(f"   サイズ: {size[0]}x{size[1]}ピクセル")
    print(f"   色: RGB{color} (緑色)")
    print(f"   背景: 透明")
    
    # RGBA画像を作成（透過背景）
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 三角形の頂点を計算（上向きの正三角形）
    width, height = size
    triangle_points = [
        (width // 2, height // 4),      # 上の頂点 (200, 100)
        (width // 4, height * 3 // 4),  # 左下の頂点 (100, 300)
        (width * 3 // 4, height * 3 // 4)  # 右下の頂点 (300, 300)
    ]
    
    print(f"   三角形の頂点: {triangle_points}")
    
    # 三角形を描画（アンチエイリアス対応）
    draw.polygon(triangle_points, fill=(*color, 255))
    
    # 保存先ディレクトリの作成
    output_path = 'lambda/python/images/triangle_green.png'
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # PNG形式で保存
    img.save(output_path, 'PNG')
    
    # 生成結果の確認
    file_size = os.path.getsize(output_path)
    
    print(f"✅ 三角形画像を生成しました:")
    print(f"   保存先: {output_path}")
    print(f"   ファイルサイズ: {file_size:,} バイト")
    print(f"   画像モード: {img.mode}")
    
    # 透明ピクセルの確認
    transparent_pixels = sum(1 for p in img.getdata() if p[3] == 0)
    total_pixels = img.width * img.height
    transparency_ratio = (transparent_pixels / total_pixels) * 100
    
    print(f"   透明ピクセル: {transparent_pixels:,}/{total_pixels:,} ({transparency_ratio:.1f}%)")
    
    return output_path

def verify_existing_images():
    """既存のテスト画像の存在確認"""
    images_dir = 'lambda/python/images'
    existing_images = [
        'default-base.png',
        'circle_red.png', 
        'rectangle_blue.png'
    ]
    
    print("📁 既存のテスト画像を確認中...")
    
    for image_name in existing_images:
        image_path = os.path.join(images_dir, image_name)
        if os.path.exists(image_path):
            file_size = os.path.getsize(image_path)
            print(f"   ✅ {image_name}: {file_size:,} バイト")
        else:
            print(f"   ❌ {image_name}: 見つかりません")
    
    return all(os.path.exists(os.path.join(images_dir, img)) for img in existing_images)

def main():
    """メイン処理"""
    print("🚀 三角形テスト画像生成スクリプトを開始")
    print("=" * 50)
    
    try:
        # 既存画像の確認
        existing_ok = verify_existing_images()
        if not existing_ok:
            print("⚠️  一部の既存テスト画像が見つかりません")
        
        print()
        
        # 三角形画像の生成
        output_path = generate_triangle_image()
        
        print()
        print("🎉 三角形テスト画像の生成が完了しました！")
        print(f"   次のステップ: {output_path} をS3にアップロードしてください")
        print("   コマンド例: cd scripts && ./upload-test-images.sh")
        
        return 0
        
    except Exception as e:
        print(f"❌ エラーが発生しました: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())