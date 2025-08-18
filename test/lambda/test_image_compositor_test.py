"""
画像合成エンジンのユニットテスト - v2.4.0
"""

import unittest
import sys
import os
from PIL import Image

# Lambda関数のパスを追加
sys.path.append(os.path.join(os.path.dirname(__file__), '../../lambda/python'))

from image_compositor import (
    parse_image_parameters,
    validate_image_parameters,
    create_base_image,
    resize_and_convert_image,
    paste_image_with_alpha,
    create_composite_image,
    optimize_composite_image,
    has_transparency
)


class TestImageCompositor(unittest.TestCase):
    """画像合成エンジンのテストクラス"""
    
    def setUp(self):
        """テスト前の準備"""
        # テスト用の画像を作成
        self.test_image1 = Image.new('RGBA', (100, 100), (255, 0, 0, 255))  # 赤
        self.test_image2 = Image.new('RGBA', (100, 100), (0, 255, 0, 255))  # 緑
        self.test_image3 = Image.new('RGBA', (100, 100), (0, 0, 255, 255))  # 青
        self.transparent_image = Image.new('RGBA', (100, 100), (255, 255, 255, 128))  # 半透明白
    
    def test_parse_image_parameters_default(self):
        """デフォルトパラメータの解析テスト"""
        params = parse_image_parameters({})
        
        # デフォルト値の確認
        self.assertEqual(params['image1']['x'], 1600)
        self.assertEqual(params['image1']['y'], 20)
        self.assertEqual(params['image1']['width'], 300)
        self.assertEqual(params['image1']['height'], 200)
        
        self.assertEqual(params['image2']['x'], 1600)
        self.assertEqual(params['image2']['y'], 240)
        
        self.assertEqual(params['image3']['x'], 20)
        self.assertEqual(params['image3']['y'], 20)
    
    def test_parse_image_parameters_custom(self):
        """カスタムパラメータの解析テスト"""
        query_params = {
            'image1X': '100',
            'image1Y': '200',
            'image1Width': '400',
            'image1Height': '300',
            'image2X': '500',
            'image3Y': '600'
        }
        
        params = parse_image_parameters(query_params)
        
        # カスタム値の確認
        self.assertEqual(params['image1']['x'], 100)
        self.assertEqual(params['image1']['y'], 200)
        self.assertEqual(params['image1']['width'], 400)
        self.assertEqual(params['image1']['height'], 300)
        self.assertEqual(params['image2']['x'], 500)
        self.assertEqual(params['image3']['y'], 600)
        
        # 指定されていない値はデフォルト
        self.assertEqual(params['image2']['y'], 240)  # デフォルト値
    
    def test_parse_image_parameters_invalid_values(self):
        """無効な値の解析テスト"""
        query_params = {
            'image1X': 'invalid',
            'image1Y': '',
            'image1Width': 'abc',
            'image1Height': None
        }
        
        params = parse_image_parameters(query_params)
        
        # 無効な値はデフォルトに戻る
        self.assertEqual(params['image1']['x'], 1600)  # デフォルト値
        self.assertEqual(params['image1']['y'], 20)    # デフォルト値
        self.assertEqual(params['image1']['width'], 300)  # デフォルト値
        self.assertEqual(params['image1']['height'], 200) # デフォルト値
    
    def test_validate_image_parameters_valid(self):
        """有効なパラメータの検証テスト"""
        valid_params = {
            'image1': {'x': 100, 'y': 100, 'width': 300, 'height': 200},
            'image2': {'x': 500, 'y': 300, 'width': 400, 'height': 250},
            'image3': {'x': 0, 'y': 0, 'width': 100, 'height': 100}
        }
        
        errors = validate_image_parameters(valid_params)
        self.assertEqual(len(errors), 0)
    
    def test_validate_image_parameters_invalid_position(self):
        """無効な位置パラメータの検証テスト"""
        invalid_params = {
            'image1': {'x': -10, 'y': 100, 'width': 300, 'height': 200},
            'image2': {'x': 100, 'y': -5, 'width': 400, 'height': 250}
        }
        
        errors = validate_image_parameters(invalid_params)
        self.assertGreater(len(errors), 0)
        self.assertTrue(any('位置座標は0以上' in error for error in errors))
    
    def test_validate_image_parameters_invalid_size(self):
        """無効なサイズパラメータの検証テスト"""
        invalid_params = {
            'image1': {'x': 100, 'y': 100, 'width': 0, 'height': 200},
            'image2': {'x': 100, 'y': 100, 'width': 300, 'height': -10}
        }
        
        errors = validate_image_parameters(invalid_params)
        self.assertGreater(len(errors), 0)
        self.assertTrue(any('サイズは1以上' in error for error in errors))
    
    def test_validate_image_parameters_too_large(self):
        """サイズが大きすぎるパラメータの検証テスト"""
        invalid_params = {
            'image1': {'x': 100, 'y': 100, 'width': 6000, 'height': 200},
            'image2': {'x': 100, 'y': 100, 'width': 300, 'height': 5500}
        }
        
        errors = validate_image_parameters(invalid_params)
        self.assertGreater(len(errors), 0)
        self.assertTrue(any('5000ピクセル以下' in error for error in errors))
    
    def test_create_base_image_transparent(self):
        """透明ベース画像の作成テスト"""
        base = create_base_image(None)
        
        self.assertEqual(base.size, (2000, 1000))
        self.assertEqual(base.mode, 'RGBA')
        
        # 透明であることを確認
        pixel = base.getpixel((0, 0))
        self.assertEqual(pixel[3], 0)  # アルファ値が0（透明）
    
    def test_create_base_image_custom_size(self):
        """カスタムサイズのベース画像作成テスト"""
        custom_size = (800, 600)
        base = create_base_image(None, canvas_size=custom_size)
        
        self.assertEqual(base.size, custom_size)
        self.assertEqual(base.mode, 'RGBA')
    
    def test_create_base_image_existing(self):
        """既存画像からのベース画像作成テスト"""
        existing_image = Image.new('RGB', (500, 300), (255, 255, 255))
        base = create_base_image(existing_image)
        
        self.assertEqual(base.size, (2000, 1000))  # リサイズされる
        self.assertEqual(base.mode, 'RGBA')  # RGBAに変換される
    
    def test_resize_and_convert_image(self):
        """画像リサイズ・変換テスト"""
        # RGB画像をテスト
        rgb_image = Image.new('RGB', (200, 200), (255, 0, 0))
        result = resize_and_convert_image(rgb_image, (100, 100))
        
        self.assertEqual(result.size, (100, 100))
        self.assertEqual(result.mode, 'RGBA')
    
    def test_resize_and_convert_image_same_size(self):
        """同じサイズでの画像変換テスト"""
        rgba_image = Image.new('RGBA', (100, 100), (255, 0, 0, 255))
        result = resize_and_convert_image(rgba_image, (100, 100))
        
        self.assertEqual(result.size, (100, 100))
        self.assertEqual(result.mode, 'RGBA')
        self.assertEqual(result, rgba_image)  # 同じ画像オブジェクト
    
    def test_paste_image_with_alpha(self):
        """アルファチャンネル合成テスト"""
        base = Image.new('RGBA', (200, 200), (255, 255, 255, 255))  # 白背景
        overlay = Image.new('RGBA', (100, 100), (255, 0, 0, 128))   # 半透明赤
        
        result = paste_image_with_alpha(base, overlay, (50, 50))
        
        # 合成位置の色をチェック（半透明なので混合される）
        pixel = result.getpixel((100, 100))
        self.assertNotEqual(pixel[:3], (255, 255, 255))  # 白ではない
        self.assertNotEqual(pixel[:3], (255, 0, 0))      # 純粋な赤でもない
    
    def test_create_composite_image_2_images(self):
        """2画像合成テスト"""
        params = parse_image_parameters({
            'image1X': '50', 'image1Y': '50', 'image1Width': '100', 'image1Height': '100',
            'image2X': '150', 'image2Y': '150', 'image2Width': '100', 'image2Height': '100'
        })
        
        result = create_composite_image(None, self.test_image1, self.test_image2, None, params)
        
        self.assertEqual(result.size, (2000, 1000))
        self.assertEqual(result.mode, 'RGBA')
    
    def test_create_composite_image_3_images(self):
        """3画像合成テスト"""
        params = parse_image_parameters({
            'image1X': '50', 'image1Y': '50', 'image1Width': '100', 'image1Height': '100',
            'image2X': '150', 'image2Y': '150', 'image2Width': '100', 'image2Height': '100',
            'image3X': '250', 'image3Y': '250', 'image3Width': '100', 'image3Height': '100'
        })
        
        result = create_composite_image(
            None, self.test_image1, self.test_image2, self.test_image3, params
        )
        
        self.assertEqual(result.size, (2000, 1000))
        self.assertEqual(result.mode, 'RGBA')
    
    def test_create_composite_image_with_base(self):
        """ベース画像ありの合成テスト"""
        base_image = Image.new('RGBA', (1000, 500), (128, 128, 128, 255))  # グレー背景
        params = parse_image_parameters({})
        
        result = create_composite_image(
            base_image, self.test_image1, self.test_image2, None, params
        )
        
        self.assertEqual(result.size, (2000, 1000))  # キャンバスサイズにリサイズ
        self.assertEqual(result.mode, 'RGBA')
    
    def test_create_composite_image_invalid_params(self):
        """無効なパラメータでの合成エラーテスト"""
        invalid_params = {
            'image1': {'x': -10, 'y': 100, 'width': 300, 'height': 200},
            'image2': {'x': 100, 'y': 100, 'width': 400, 'height': 250}
        }
        
        with self.assertRaises(Exception):  # ValueErrorがExceptionでラップされる
            create_composite_image(None, self.test_image1, self.test_image2, None, invalid_params)
    
    def test_has_transparency_true(self):
        """透明部分ありの画像テスト"""
        transparent_image = Image.new('RGBA', (100, 100), (255, 255, 255, 128))
        self.assertTrue(has_transparency(transparent_image))
    
    def test_has_transparency_false(self):
        """透明部分なしの画像テスト"""
        opaque_image = Image.new('RGBA', (100, 100), (255, 255, 255, 255))
        self.assertFalse(has_transparency(opaque_image))
    
    def test_has_transparency_rgb_mode(self):
        """RGBモード画像の透明度テスト"""
        rgb_image = Image.new('RGB', (100, 100), (255, 255, 255))
        self.assertFalse(has_transparency(rgb_image))
    
    def test_optimize_composite_image(self):
        """合成画像最適化テスト"""
        test_image = Image.new('RGBA', (100, 100), (255, 0, 0, 255))
        result = optimize_composite_image(test_image)
        
        # 基本的には同じ画像が返される（現在の実装では）
        self.assertEqual(result.size, test_image.size)
        self.assertEqual(result.mode, test_image.mode)
    
    def test_composite_layering_order(self):
        """画像の重ね順テスト"""
        # 異なる色の画像を同じ位置に配置
        red_image = Image.new('RGBA', (100, 100), (255, 0, 0, 255))
        green_image = Image.new('RGBA', (100, 100), (0, 255, 0, 255))
        blue_image = Image.new('RGBA', (100, 100), (0, 0, 255, 255))
        
        params = {
            'image1': {'x': 100, 'y': 100, 'width': 100, 'height': 100},
            'image2': {'x': 100, 'y': 100, 'width': 100, 'height': 100},  # 同じ位置
            'image3': {'x': 100, 'y': 100, 'width': 100, 'height': 100}   # 同じ位置
        }
        
        result = create_composite_image(None, red_image, green_image, blue_image, params)
        
        # 最後に描画された画像（image3 = 青）が最前面に来るはず
        pixel = result.getpixel((150, 150))  # 重なった部分
        self.assertEqual(pixel[:3], (0, 0, 255))  # 青色


if __name__ == '__main__':
    unittest.main()