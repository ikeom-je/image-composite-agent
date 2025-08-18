"""
動画生成モジュールのユニットテスト - v2.6.0

video_generator.pyの各機能をテストする。
"""

import unittest
import tempfile
import os
from unittest.mock import patch, MagicMock
from PIL import Image
import io

# テスト対象のモジュールをインポート
from video_generator import (
    validate_video_parameters,
    check_ffmpeg_availability,
    generate_video_from_image,
    build_ffmpeg_command,
    get_video_mime_type,
    get_video_extension,
    VideoGenerationError,
    SUPPORTED_VIDEO_FORMATS,
    DEFAULT_DURATION,
    DEFAULT_FORMAT
)


class TestVideoGenerator(unittest.TestCase):
    """動画生成モジュールのテストクラス"""

    def setUp(self):
        """テストセットアップ"""
        # テスト用の画像を作成
        self.test_image = Image.new('RGBA', (400, 300), (255, 0, 0, 255))
        
    def test_validate_video_parameters_valid(self):
        """有効なパラメータの検証テスト"""
        # 有効なパラメータ
        is_valid, errors = validate_video_parameters(3, 'XMF')
        self.assertTrue(is_valid)
        self.assertEqual(len(errors), 0)
        
        # 境界値テスト
        is_valid, errors = validate_video_parameters(1, 'MP4')
        self.assertTrue(is_valid)
        self.assertEqual(len(errors), 0)
        
        is_valid, errors = validate_video_parameters(30, 'WEBM')
        self.assertTrue(is_valid)
        self.assertEqual(len(errors), 0)

    def test_validate_video_parameters_invalid_duration(self):
        """無効な動画長さの検証テスト"""
        # 0秒
        is_valid, errors = validate_video_parameters(0, 'XMF')
        self.assertFalse(is_valid)
        self.assertIn("動画の長さは1秒以上の整数である必要があります", errors[0])
        
        # 負の値
        is_valid, errors = validate_video_parameters(-1, 'XMF')
        self.assertFalse(is_valid)
        self.assertIn("動画の長さは1秒以上の整数である必要があります", errors[0])
        
        # 31秒（上限超過）
        is_valid, errors = validate_video_parameters(31, 'XMF')
        self.assertFalse(is_valid)
        self.assertIn("動画の長さは30秒以下である必要があります", errors[0])

    def test_validate_video_parameters_invalid_format(self):
        """無効なフォーマットの検証テスト"""
        is_valid, errors = validate_video_parameters(3, 'INVALID_FORMAT')
        self.assertFalse(is_valid)
        self.assertIn("サポートされていない動画フォーマットです", errors[0])
        self.assertIn("サポートされているフォーマット", errors[1])

    @patch('video_generator.subprocess.run')
    def test_check_ffmpeg_availability_success(self, mock_run):
        """ffmpeg利用可能性チェック（成功）のテスト"""
        # ffmpegが利用可能な場合
        mock_run.return_value.returncode = 0
        result = check_ffmpeg_availability()
        self.assertTrue(result)
        mock_run.assert_called_once()

    @patch('video_generator.subprocess.run')
    def test_check_ffmpeg_availability_failure(self, mock_run):
        """ffmpeg利用可能性チェック（失敗）のテスト"""
        # ffmpegが利用できない場合
        mock_run.side_effect = FileNotFoundError()
        result = check_ffmpeg_availability()
        self.assertFalse(result)

    def test_build_ffmpeg_command_xmf_high_quality(self):
        """ffmpegコマンド構築テスト（XMF高品質）"""
        format_config = SUPPORTED_VIDEO_FORMATS['XMF']
        cmd = build_ffmpeg_command(
            '/input/test.png',
            '/output/test.mp4',
            3,
            30,
            format_config,
            'high'
        )
        
        expected_elements = [
            'ffmpeg',
            '-y',
            '-loop', '1',
            '-i', '/input/test.png',
            '-c:v', 'libx264',
            '-t', '3',
            '-r', '30',
            '-pix_fmt', 'yuv420p',
            '-crf', '18',
            '/output/test.mp4'
        ]
        
        self.assertEqual(cmd, expected_elements)

    def test_build_ffmpeg_command_webm_medium_quality(self):
        """ffmpegコマンド構築テスト（WEBM中品質）"""
        format_config = SUPPORTED_VIDEO_FORMATS['WEBM']
        cmd = build_ffmpeg_command(
            '/input/test.png',
            '/output/test.webm',
            5,
            24,
            format_config,
            'medium'
        )
        
        expected_elements = [
            'ffmpeg',
            '-y',
            '-loop', '1',
            '-i', '/input/test.png',
            '-c:v', 'libvpx-vp9',
            '-t', '5',
            '-r', '24',
            '-pix_fmt', 'yuv420p',
            '-crf', '35',
            '-b:v', '0',
            '/output/test.webm'
        ]
        
        self.assertEqual(cmd, expected_elements)

    def test_get_video_mime_type(self):
        """動画MIMEタイプ取得テスト"""
        self.assertEqual(get_video_mime_type('XMF'), 'video/mp4')
        self.assertEqual(get_video_mime_type('MP4'), 'video/mp4')
        self.assertEqual(get_video_mime_type('WEBM'), 'video/webm')
        self.assertEqual(get_video_mime_type('AVI'), 'video/x-msvideo')
        
        # 存在しないフォーマット
        self.assertEqual(get_video_mime_type('UNKNOWN'), 'video/mp4')

    def test_get_video_extension(self):
        """動画拡張子取得テスト"""
        self.assertEqual(get_video_extension('XMF'), 'mp4')
        self.assertEqual(get_video_extension('MP4'), 'mp4')
        self.assertEqual(get_video_extension('WEBM'), 'webm')
        self.assertEqual(get_video_extension('AVI'), 'avi')
        
        # 存在しないフォーマット
        self.assertEqual(get_video_extension('UNKNOWN'), 'mp4')

    @patch('video_generator.check_ffmpeg_availability')
    def test_generate_video_from_image_ffmpeg_not_available(self, mock_check):
        """ffmpeg利用不可時の動画生成テスト"""
        mock_check.return_value = False
        
        with self.assertRaises(VideoGenerationError) as context:
            generate_video_from_image(self.test_image)
        
        self.assertIn("ffmpegが利用できません", str(context.exception))

    @patch('video_generator.check_ffmpeg_availability')
    def test_generate_video_from_image_invalid_parameters(self, mock_check):
        """無効なパラメータでの動画生成テスト"""
        mock_check.return_value = True
        
        with self.assertRaises(VideoGenerationError) as context:
            generate_video_from_image(self.test_image, duration=0)
        
        self.assertIn("動画生成パラメータが無効です", str(context.exception))

    @patch('video_generator.check_ffmpeg_availability')
    @patch('video_generator.subprocess.run')
    @patch('video_generator.tempfile.TemporaryDirectory')
    def test_generate_video_from_image_ffmpeg_failure(self, mock_tempdir, mock_run, mock_check):
        """ffmpeg実行失敗時の動画生成テスト"""
        mock_check.return_value = True
        
        # 一時ディレクトリのモック
        temp_dir = tempfile.mkdtemp()
        mock_tempdir.return_value.__enter__.return_value = temp_dir
        
        # ffmpeg実行失敗をシミュレート
        mock_run.return_value.returncode = 1
        mock_run.return_value.stderr = "ffmpeg error"
        mock_run.return_value.stdout = ""
        
        with self.assertRaises(VideoGenerationError) as context:
            generate_video_from_image(self.test_image)
        
        self.assertIn("ffmpegによる動画生成に失敗しました", str(context.exception))
        
        # 一時ディレクトリをクリーンアップ
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)

    @patch('video_generator.check_ffmpeg_availability')
    @patch('video_generator.subprocess.run')
    @patch('video_generator.tempfile.TemporaryDirectory')
    @patch('video_generator.os.path.exists')
    def test_generate_video_from_image_output_not_created(self, mock_exists, mock_tempdir, mock_run, mock_check):
        """出力ファイル未作成時の動画生成テスト"""
        mock_check.return_value = True
        
        # 一時ディレクトリのモック
        temp_dir = tempfile.mkdtemp()
        mock_tempdir.return_value.__enter__.return_value = temp_dir
        
        # ffmpeg実行成功だが出力ファイルが存在しない
        mock_run.return_value.returncode = 0
        mock_exists.return_value = False
        
        with self.assertRaises(VideoGenerationError) as context:
            generate_video_from_image(self.test_image)
        
        self.assertIn("動画ファイルが生成されませんでした", str(context.exception))
        
        # 一時ディレクトリをクリーンアップ
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)

    @patch('video_generator.check_ffmpeg_availability')
    @patch('video_generator.subprocess.run')
    @patch('video_generator.tempfile.TemporaryDirectory')
    @patch('video_generator.os.path.exists')
    @patch('builtins.open', create=True)
    def test_generate_video_from_image_success(self, mock_open, mock_exists, mock_tempdir, mock_run, mock_check):
        """動画生成成功テスト"""
        mock_check.return_value = True
        
        # 一時ディレクトリのモック
        temp_dir = tempfile.mkdtemp()
        mock_tempdir.return_value.__enter__.return_value = temp_dir
        
        # ffmpeg実行成功
        mock_run.return_value.returncode = 0
        mock_exists.return_value = True
        
        # ファイル読み込みのモック
        mock_video_data = b'fake_video_data'
        mock_file = MagicMock()
        mock_file.read.return_value = mock_video_data
        mock_open.return_value.__enter__.return_value = mock_file
        
        result = generate_video_from_image(self.test_image, duration=3, format_name='XMF')
        
        self.assertEqual(result, mock_video_data)
        mock_check.assert_called_once()
        mock_run.assert_called_once()
        
        # 一時ディレクトリをクリーンアップ
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_supported_video_formats_structure(self):
        """サポートされている動画フォーマットの構造テスト"""
        for format_name, config in SUPPORTED_VIDEO_FORMATS.items():
            self.assertIn('extension', config)
            self.assertIn('codec', config)
            self.assertIn('container', config)
            self.assertIn('mime_type', config)
            
            # 各値が文字列であることを確認
            self.assertIsInstance(config['extension'], str)
            self.assertIsInstance(config['codec'], str)
            self.assertIsInstance(config['container'], str)
            self.assertIsInstance(config['mime_type'], str)

    def test_default_values(self):
        """デフォルト値のテスト"""
        self.assertEqual(DEFAULT_DURATION, 3)
        self.assertEqual(DEFAULT_FORMAT, 'XMF')
        self.assertIn(DEFAULT_FORMAT, SUPPORTED_VIDEO_FORMATS)


class TestVideoGeneratorIntegration(unittest.TestCase):
    """動画生成モジュールの統合テスト"""

    def setUp(self):
        """統合テストセットアップ"""
        # より大きなテスト画像を作成
        self.test_image = Image.new('RGBA', (800, 600), (0, 255, 0, 255))
        
        # 画像に簡単な図形を描画
        from PIL import ImageDraw
        draw = ImageDraw.Draw(self.test_image)
        draw.rectangle([100, 100, 700, 500], fill=(255, 255, 0, 255))
        draw.ellipse([200, 200, 600, 400], fill=(0, 0, 255, 255))

    @patch('video_generator.check_ffmpeg_availability')
    def test_video_generation_workflow_ffmpeg_unavailable(self, mock_check):
        """ffmpeg利用不可時のワークフローテスト"""
        mock_check.return_value = False
        
        # パラメータ検証は成功するが、ffmpegチェックで失敗
        is_valid, errors = validate_video_parameters(5, 'MP4')
        self.assertTrue(is_valid)
        
        with self.assertRaises(VideoGenerationError):
            generate_video_from_image(self.test_image, duration=5, format_name='MP4')

    def test_all_supported_formats_have_valid_config(self):
        """すべてのサポートフォーマットが有効な設定を持つことのテスト"""
        for format_name in SUPPORTED_VIDEO_FORMATS.keys():
            # パラメータ検証が成功することを確認
            is_valid, errors = validate_video_parameters(3, format_name)
            self.assertTrue(is_valid, f"Format {format_name} should be valid")
            
            # MIMEタイプと拡張子が取得できることを確認
            mime_type = get_video_mime_type(format_name)
            extension = get_video_extension(format_name)
            
            self.assertIsInstance(mime_type, str)
            self.assertIsInstance(extension, str)
            self.assertTrue(len(mime_type) > 0)
            self.assertTrue(len(extension) > 0)


if __name__ == '__main__':
    # テストスイートの実行
    unittest.main(verbosity=2)