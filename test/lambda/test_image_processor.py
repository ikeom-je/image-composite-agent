import sys
import os
import unittest
import json
from unittest.mock import patch, MagicMock
from io import BytesIO
from PIL import Image

# Lambda関数のディレクトリをパスに追加
sys.path.append(os.path.join(os.path.dirname(__file__), '../../lambda/python'))

# Lambda関数をインポート
import image_processor

class TestImageProcessor(unittest.TestCase):
    """画像処理Lambda関数のテスト"""

    def setUp(self):
        """テスト用の環境変数を設定"""
        os.environ['S3_RESOURCES_BUCKET'] = 'test-resources-bucket'
        os.environ['TEST_BUCKET'] = 'test-images-bucket'

        # テスト用の画像を作成
        self.test_image = Image.new('RGBA', (100, 100), (255, 0, 0, 128))
        self.test_image_bytes = BytesIO()
        self.test_image.save(self.test_image_bytes, format='PNG')
        self.test_image_bytes.seek(0)

    @patch('image_fetcher.boto3')
    def test_fetch_image_from_s3(self, mock_boto3):
        """S3からの画像取得をテスト"""
        from image_fetcher import fetch_image_from_s3

        mock_s3 = MagicMock()
        mock_boto3.client.return_value = mock_s3
        mock_body = BytesIO(self.test_image_bytes.getvalue())
        mock_s3.get_object.return_value = {'Body': mock_body}

        result = fetch_image_from_s3('s3://test-bucket/test-key')

        self.assertIsInstance(result, Image.Image)
        self.assertEqual(result.mode, 'RGBA')
        mock_s3.get_object.assert_called_once_with(Bucket='test-bucket', Key='test-key')

    def test_create_composite_image(self):
        """画像合成をテスト"""
        from image_compositor import create_composite_image

        canvas_size = (2000, 1000)
        base_img = Image.new('RGBA', canvas_size, (0, 0, 0, 0))
        image1 = Image.new('RGBA', (100, 100), (255, 0, 0, 128))
        image2 = Image.new('RGBA', (100, 100), (0, 0, 255, 128))

        params = {
            'image1': {'x': 50, 'y': 50, 'width': 100, 'height': 100},
            'image2': {'x': 150, 'y': 50, 'width': 100, 'height': 100},
        }

        result = create_composite_image(base_img, image1, image2, None, params)

        self.assertIsInstance(result, Image.Image)
        self.assertEqual(result.mode, 'RGBA')
        self.assertEqual(result.size, canvas_size)

    @patch('image_processor.fetch_images_parallel')
    @patch('image_compositor.create_composite_image')
    def test_handler_html_format(self, mock_create_composite, mock_fetch_parallel):
        """ハンドラー関数のHTMLフォーマット出力をテスト"""
        mock_fetch_parallel.return_value = {
            'image1': self.test_image,
            'image2': self.test_image,
        }
        mock_create_composite.return_value = self.test_image

        event = {
            'queryStringParameters': {
                'baseImage': 'test',
                'image1': 'test',
                'image2': 'test',
                'format': 'html'
            }
        }

        result = image_processor.handler(event, {})

        self.assertEqual(result['statusCode'], 200)
        self.assertEqual(result['headers']['Content-Type'], 'text/html; charset=utf-8')
        self.assertIn('<!DOCTYPE html>', result['body'])

    @patch('image_processor.fetch_images_parallel')
    @patch('image_compositor.create_composite_image')
    def test_handler_png_format(self, mock_create_composite, mock_fetch_parallel):
        """ハンドラー関数のPNGフォーマット出力をテスト"""
        mock_fetch_parallel.return_value = {
            'image1': self.test_image,
            'image2': self.test_image,
        }
        mock_create_composite.return_value = self.test_image

        event = {
            'queryStringParameters': {
                'baseImage': 'test',
                'image1': 'test',
                'image2': 'test',
                'format': 'png'
            }
        }

        result = image_processor.handler(event, {})

        self.assertEqual(result['statusCode'], 200)
        self.assertEqual(result['headers']['Content-Type'], 'image/png')
        self.assertTrue(result['isBase64Encoded'])
        self.assertTrue(len(result['body']) > 0)

    def test_handler_missing_parameters(self):
        """必須パラメータが不足している場合のエラーハンドリングをテスト"""
        event = {
            'queryStringParameters': {
                'baseImage': 'test'
                # image1が不足
            }
        }

        result = image_processor.handler(event, {})

        self.assertEqual(result['statusCode'], 400)
        body = json.loads(result['body'])
        self.assertIn('error', body)

    @patch('image_processor.fetch_images_parallel')
    @patch('image_processor.create_composite_image')
    def test_handler_non_numeric_base_opacity_falls_back_to_default(
        self, mock_create_composite, mock_fetch_parallel
    ):
        """baseOpacityに非数値が渡された場合、500にせずデフォルト100にフォールバックする (Issue #37)"""
        mock_fetch_parallel.return_value = {'image1': self.test_image}
        mock_create_composite.return_value = self.test_image

        event = {
            'queryStringParameters': {
                'baseImage': 'test',
                'image1': 'test',
                'baseOpacity': 'abc',
                'format': 'png',
            }
        }

        result = image_processor.handler(event, {})

        self.assertEqual(result['statusCode'], 200)
        # create_composite_image が base_opacity=100（デフォルト）で呼ばれていること
        _, kwargs = mock_create_composite.call_args
        self.assertEqual(kwargs.get('base_opacity'), 100)


if __name__ == '__main__':
    unittest.main()
