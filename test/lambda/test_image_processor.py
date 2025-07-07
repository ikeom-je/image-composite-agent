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
        
    @patch('boto3.client')
    def test_fetch_image_from_s3(self, mock_boto3_client):
        """S3からの画像取得をテスト"""
        # S3クライアントのモック
        mock_s3 = MagicMock()
        mock_boto3_client.return_value = mock_s3
        
        # get_objectのレスポンスをモック
        mock_s3.get_object.return_value = {
            'Body': MagicMock(read=lambda: self.test_image_bytes.getvalue())
        }
        
        # 関数を実行
        result = image_processor.fetch_image_from_s3('test-bucket', 'test-key')
        
        # 結果を検証
        self.assertIsInstance(result, Image.Image)
        self.assertEqual(result.mode, 'RGBA')
        self.assertEqual(result.size, (100, 100))
        
        # S3クライアントが正しく呼び出されたことを確認
        mock_boto3_client.assert_called_once_with('s3')
        mock_s3.get_object.assert_called_once_with(Bucket='test-bucket', Key='test-key')
    
    def test_create_composite_image(self):
        """画像合成をテスト"""
        # テスト用の画像を作成
        base_img = Image.new('RGBA', (300, 200), (0, 0, 0, 0))
        image1 = Image.new('RGBA', (100, 100), (255, 0, 0, 128))
        image2 = Image.new('RGBA', (100, 100), (0, 0, 255, 128))
        
        # 画像配置パラメータ
        img1_params = {'x': 50, 'y': 50, 'width': 100, 'height': 100}
        img2_params = {'x': 150, 'y': 50, 'width': 100, 'height': 100}
        
        # 関数を実行
        result = image_processor.create_composite_image(base_img, image1, image2, img1_params, img2_params)
        
        # 結果を検証
        self.assertIsInstance(result, Image.Image)
        self.assertEqual(result.mode, 'RGBA')
        self.assertEqual(result.size, (300, 200))
        
        # 合成された画像の特定の位置のピクセルをチェック
        # 画像1の位置 - アルファ値が128なので赤は128
        pixel1 = result.getpixel((75, 75))
        self.assertEqual(pixel1[0], 128)  # 赤
        
        # 画像2の位置 - アルファ値が128なので青は128
        pixel2 = result.getpixel((175, 75))
        self.assertEqual(pixel2[2], 128)  # 青
    
    @patch('image_processor.fetch_image_from_s3')
    @patch('image_processor.create_composite_image')
    def test_handler_html_format(self, mock_create_composite, mock_fetch_image):
        """ハンドラー関数のHTMLフォーマット出力をテスト"""
        # モックの設定
        mock_fetch_image.return_value = self.test_image
        mock_create_composite.return_value = self.test_image
        
        # テストイベント
        event = {
            'queryStringParameters': {
                'baseImage': 'test',
                'image1': 'test',
                'image2': 'test',
                'format': 'html'
            }
        }
        
        # 関数を実行
        result = image_processor.handler(event, {})
        
        # 結果を検証
        self.assertEqual(result['statusCode'], 200)
        self.assertEqual(result['headers']['Content-Type'], 'text/html; charset=utf-8')
        self.assertIn('<!DOCTYPE html>', result['body'])
        self.assertIn('<img src="data:image/png;base64,', result['body'])
    
    @patch('image_processor.fetch_image_from_s3')
    @patch('image_processor.create_composite_image')
    def test_handler_png_format(self, mock_create_composite, mock_fetch_image):
        """ハンドラー関数のPNGフォーマット出力をテスト"""
        # モックの設定
        mock_fetch_image.return_value = self.test_image
        mock_create_composite.return_value = self.test_image
        
        # テストイベント
        event = {
            'queryStringParameters': {
                'baseImage': 'test',
                'image1': 'test',
                'image2': 'test',
                'format': 'png'
            }
        }
        
        # 関数を実行
        result = image_processor.handler(event, {})
        
        # 結果を検証
        self.assertEqual(result['statusCode'], 200)
        self.assertEqual(result['headers']['Content-Type'], 'image/png')
        self.assertTrue(result['isBase64Encoded'])
        self.assertTrue(len(result['body']) > 0)
    
    def test_handler_missing_parameters(self):
        """必須パラメータが不足している場合のエラーハンドリングをテスト"""
        # テストイベント（image2パラメータが不足）
        event = {
            'queryStringParameters': {
                'baseImage': 'test',
                'image1': 'test'
            }
        }
        
        # 関数を実行
        result = image_processor.handler(event, {})
        
        # 結果を検証
        self.assertEqual(result['statusCode'], 400)
        body = json.loads(result['body'])
        self.assertIn('error', body)
        self.assertIn('image1 and image2 parameters are required', body['error'])

if __name__ == '__main__':
    unittest.main()
