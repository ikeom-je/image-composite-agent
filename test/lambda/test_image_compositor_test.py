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
    parse_text_parameters,
    validate_text_parameters,
    create_base_image,
    apply_base_opacity,
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


class TestTextParameters(unittest.TestCase):
    def test_parse_text_parameters_empty(self):
        params = parse_text_parameters({})
        self.assertEqual(params, {})

    def test_parse_text_parameters_single(self):
        params = parse_text_parameters({'text1': 'Hello'})
        self.assertEqual(params['text1']['text'], 'Hello')
        self.assertEqual(params['text1']['x'], 0)
        self.assertEqual(params['text1']['y'], 0)
        self.assertEqual(params['text1']['font_size'], 48)
        self.assertEqual(params['text1']['font_color'], '#FFFFFF')
        self.assertEqual(params['text1']['font_family'], 'NotoSansJP')
        self.assertIsNone(params['text1']['bg_color'])
        self.assertEqual(params['text1']['bg_opacity'], 0.7)
        self.assertFalse(params['text1']['wrap'])
        self.assertIsNone(params['text1']['max_width'])
        self.assertEqual(params['text1']['padding'], 10)

    def test_parse_text_parameters_custom(self):
        params = parse_text_parameters({
            'text1': 'テスト',
            'text1X': '100', 'text1Y': '200',
            'text1FontSize': '72', 'text1FontColor': '#FF0000',
            'text1BgColor': '#000000', 'text1BgOpacity': '0.5',
            'text1Wrap': 'true', 'text1MaxWidth': '500', 'text1Padding': '20',
        })
        self.assertEqual(params['text1']['x'], 100)
        self.assertEqual(params['text1']['y'], 200)
        self.assertEqual(params['text1']['font_size'], 72)
        self.assertEqual(params['text1']['font_color'], '#FF0000')
        self.assertEqual(params['text1']['bg_color'], '#000000')
        self.assertAlmostEqual(params['text1']['bg_opacity'], 0.5)
        self.assertTrue(params['text1']['wrap'])
        self.assertEqual(params['text1']['max_width'], 500)
        self.assertEqual(params['text1']['padding'], 20)

    def test_parse_text_parameters_multiple(self):
        params = parse_text_parameters({'text1': 'First', 'text2': 'Second', 'text3': 'Third'})
        self.assertIn('text1', params)
        self.assertIn('text2', params)
        self.assertIn('text3', params)

    def test_parse_text_parameters_skip_without_text(self):
        params = parse_text_parameters({'text1X': '100', 'text2': 'Hello'})
        self.assertNotIn('text1', params)
        self.assertIn('text2', params)

    def test_validate_text_parameters_valid(self):
        params = parse_text_parameters({'text1': 'Hello'})
        errors = validate_text_parameters(params)
        self.assertEqual(errors, [])

    def test_validate_text_parameters_negative_position(self):
        params = {'text1': {'text': 'Hi', 'x': -10, 'y': 0, 'font_size': 48,
                            'font_color': '#FFF', 'font_family': 'NotoSansJP',
                            'bg_color': None, 'bg_opacity': 0.7, 'wrap': False,
                            'max_width': None, 'padding': 10}}
        errors = validate_text_parameters(params)
        self.assertGreater(len(errors), 0)

    def test_validate_text_parameters_invalid_font_size(self):
        params = {'text1': {'text': 'Hi', 'x': 0, 'y': 0, 'font_size': 0,
                            'font_color': '#FFF', 'font_family': 'NotoSansJP',
                            'bg_color': None, 'bg_opacity': 0.7, 'wrap': False,
                            'max_width': None, 'padding': 10}}
        errors = validate_text_parameters(params)
        self.assertGreater(len(errors), 0)


class TestCompositeWithText(unittest.TestCase):
    def setUp(self):
        self.test_image1 = Image.new('RGBA', (100, 100), (255, 0, 0, 255))
        self.default_params = parse_image_parameters({})

    def test_composite_with_text(self):
        """画像+テキストの合成"""
        text_params = {'text1': {
            'text': 'Hello World', 'x': 100, 'y': 100,
            'font_size': 48, 'font_color': '#FFFFFF',
            'font_family': 'NotoSansJP', 'bg_color': None,
            'bg_opacity': 0.7, 'wrap': False, 'max_width': None, 'padding': 10,
        }}
        result = create_composite_image(
            None, self.test_image1, None, None,
            self.default_params, text_params=text_params
        )
        self.assertEqual(result.size, (2000, 1000))
        self.assertEqual(result.mode, 'RGBA')

    def test_composite_text_only(self):
        """テキストのみ（画像なし相当）の合成 - image1は1x1透明"""
        text_params = {'text1': {
            'text': 'テキストのみ', 'x': 100, 'y': 100,
            'font_size': 48, 'font_color': '#FFFFFF',
            'font_family': 'NotoSansJP', 'bg_color': '#000000',
            'bg_opacity': 0.7, 'wrap': False, 'max_width': None, 'padding': 10,
        }}
        result = create_composite_image(
            None, self.test_image1, None, None,
            self.default_params, text_params=text_params
        )
        self.assertIsNotNone(result)

    def test_composite_with_multiple_texts(self):
        """複数テキストの合成"""
        text_params = {
            'text1': {'text': 'First', 'x': 50, 'y': 50,
                      'font_size': 48, 'font_color': '#FFFFFF',
                      'font_family': 'NotoSansJP', 'bg_color': None,
                      'bg_opacity': 0.7, 'wrap': False, 'max_width': None, 'padding': 10},
            'text2': {'text': 'Second', 'x': 50, 'y': 200,
                      'font_size': 36, 'font_color': '#FF0000',
                      'font_family': 'NotoSansJP', 'bg_color': '#000000',
                      'bg_opacity': 0.5, 'wrap': False, 'max_width': None, 'padding': 10},
        }
        result = create_composite_image(
            None, self.test_image1, None, None,
            self.default_params, text_params=text_params
        )
        self.assertIsNotNone(result)

    def test_composite_without_text_params_backward_compatible(self):
        """text_params省略時に既存動作が変わらない"""
        result = create_composite_image(
            None, self.test_image1, None, None,
            self.default_params
        )
        self.assertIsNotNone(result)

    def test_composite_with_japanese_text(self):
        """日本語テキスト+画像の合成"""
        text_params = {'text1': {
            'text': 'こんにちは世界', 'x': 100, 'y': 500,
            'font_size': 64, 'font_color': '#FFFF00',
            'font_family': 'NotoSansJP', 'bg_color': '#333333',
            'bg_opacity': 0.8, 'wrap': False, 'max_width': None, 'padding': 15,
        }}
        result = create_composite_image(
            None, self.test_image1, None, None,
            self.default_params, text_params=text_params
        )
        self.assertEqual(result.mode, 'RGBA')


class TestBaseImageColors(unittest.TestCase):
    """白背景・カスタム色ベース画像のテスト"""

    def test_create_white_base_image(self):
        """白背景のベース画像が正しく作成される"""
        white_base = Image.new('RGBA', (2000, 1000), (255, 255, 255, 255))
        result = create_base_image(white_base)
        self.assertEqual(result.mode, 'RGBA')
        # 中央ピクセルが白であることを確認
        pixel = result.getpixel((1000, 500))
        self.assertEqual(pixel, (255, 255, 255, 255))

    def test_create_custom_color_base_image(self):
        """カスタム色（赤）のベース画像が正しく作成される"""
        red_base = Image.new('RGBA', (2000, 1000), (255, 0, 0, 255))
        result = create_base_image(red_base)
        pixel = result.getpixel((1000, 500))
        self.assertEqual(pixel, (255, 0, 0, 255))

    def test_create_custom_color_with_alpha(self):
        """半透明カスタム色のベース画像が正しく作成される"""
        semi_transparent = Image.new('RGBA', (2000, 1000), (0, 255, 0, 128))
        result = create_base_image(semi_transparent)
        pixel = result.getpixel((1000, 500))
        self.assertEqual(pixel, (0, 255, 0, 128))

    def test_transparent_base_is_default(self):
        """None指定で透明背景が作成される"""
        result = create_base_image(None)
        pixel = result.getpixel((1000, 500))
        self.assertEqual(pixel, (0, 0, 0, 0))

    def test_white_base_composite_with_image(self):
        """白背景にimage1を合成できる"""
        white_base = Image.new('RGBA', (2000, 1000), (255, 255, 255, 255))
        test_image = Image.new('RGBA', (100, 100), (255, 0, 0, 255))
        params = {
            'image1': {'x': 50, 'y': 50, 'width': 100, 'height': 100},
            'image2': {'x': 0, 'y': 0, 'width': 100, 'height': 100},
            'image3': {'x': 0, 'y': 0, 'width': 100, 'height': 100},
        }
        result = create_composite_image(white_base, test_image, None, None, params)
        self.assertEqual(result.mode, 'RGBA')
        # 画像が配置されていない領域は白であること
        pixel = result.getpixel((0, 0))
        self.assertEqual(pixel, (255, 255, 255, 255))
        # 画像が配置された領域は赤であること
        pixel = result.getpixel((100, 100))
        self.assertEqual(pixel, (255, 0, 0, 255))


class TestParseColorForBase(unittest.TestCase):
    """_parse_colorのベース画像用テスト"""

    def test_parse_hex_6digit(self):
        """#RRGGBB形式のパース"""
        from text_renderer import _parse_color
        self.assertEqual(_parse_color('#FF0000'), (255, 0, 0))
        self.assertEqual(_parse_color('#00FF00'), (0, 255, 0))
        self.assertEqual(_parse_color('#0000FF'), (0, 0, 255))

    def test_parse_hex_8digit(self):
        """#RRGGBBAA形式のパース"""
        from text_renderer import _parse_color
        self.assertEqual(_parse_color('#FF000080'), (255, 0, 0, 128))
        self.assertEqual(_parse_color('#00FF00FF'), (0, 255, 0, 255))

    def test_parse_invalid_returns_white(self):
        """無効なカラー文字列は白を返す"""
        from text_renderer import _parse_color
        self.assertEqual(_parse_color('invalid'), (255, 255, 255))


class TestBaseOpacity(unittest.TestCase):
    """ベース画像透明度のテスト"""

    def test_opacity_100_unchanged(self):
        """opacity=100でベース画像が変更されない"""
        base = Image.new('RGBA', (100, 100), (255, 255, 255, 255))
        result = apply_base_opacity(base, 100)
        self.assertEqual(result.getpixel((50, 50)), (255, 255, 255, 255))

    def test_opacity_0_fully_transparent(self):
        """opacity=0で完全透明になる"""
        base = Image.new('RGBA', (100, 100), (255, 255, 255, 255))
        result = apply_base_opacity(base, 0)
        self.assertEqual(result.getpixel((50, 50)), (0, 0, 0, 0))

    def test_opacity_50_half_transparent(self):
        """opacity=50でアルファが約半分になる"""
        base = Image.new('RGBA', (100, 100), (255, 0, 0, 255))
        result = apply_base_opacity(base, 50)
        pixel = result.getpixel((50, 50))
        self.assertEqual(pixel[0], 255)  # R保持
        self.assertEqual(pixel[1], 0)    # G保持
        self.assertEqual(pixel[2], 0)    # B保持
        self.assertAlmostEqual(pixel[3], 127, delta=2)  # alpha ≈ 127

    def test_opacity_clamp_over_100(self):
        """100超の値でも画像が返される（create_composite_imageがクランプ）"""
        base = Image.new('RGBA', (100, 100), (255, 255, 255, 255))
        result = apply_base_opacity(base, 150)
        self.assertEqual(result.getpixel((50, 50)), (255, 255, 255, 255))

    def test_opacity_clamp_negative(self):
        """負の値で完全透明になる"""
        base = Image.new('RGBA', (100, 100), (255, 255, 255, 255))
        result = apply_base_opacity(base, -10)
        self.assertEqual(result.getpixel((50, 50)), (0, 0, 0, 0))

    def test_composite_with_opacity(self):
        """create_composite_imageにbase_opacityを渡して動作する"""
        white_base = Image.new('RGBA', (2000, 1000), (255, 255, 255, 255))
        test_image = Image.new('RGBA', (100, 100), (255, 0, 0, 255))
        params = {
            'image1': {'x': 50, 'y': 50, 'width': 100, 'height': 100},
            'image2': {'x': 0, 'y': 0, 'width': 100, 'height': 100},
            'image3': {'x': 0, 'y': 0, 'width': 100, 'height': 100},
        }
        result = create_composite_image(white_base, test_image, None, None, params, base_opacity=50)
        self.assertEqual(result.mode, 'RGBA')
        # 画像が配置されていない領域は半透明白
        pixel = result.getpixel((0, 0))
        self.assertAlmostEqual(pixel[3], 127, delta=2)

    def test_composite_default_opacity(self):
        """base_opacity省略時はデフォルト100（不透明）"""
        white_base = Image.new('RGBA', (2000, 1000), (255, 255, 255, 255))
        test_image = Image.new('RGBA', (100, 100), (255, 0, 0, 255))
        params = {
            'image1': {'x': 50, 'y': 50, 'width': 100, 'height': 100},
            'image2': {'x': 0, 'y': 0, 'width': 100, 'height': 100},
            'image3': {'x': 0, 'y': 0, 'width': 100, 'height': 100},
        }
        result = create_composite_image(white_base, test_image, None, None, params)
        pixel = result.getpixel((0, 0))
        self.assertEqual(pixel, (255, 255, 255, 255))


if __name__ == '__main__':
    unittest.main()