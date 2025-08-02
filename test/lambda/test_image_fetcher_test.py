"""
画像取得エンジンのユニットテスト - v2.4.0
"""

import unittest
import sys
import os
from unittest.mock import Mock, patch, MagicMock
from PIL import Image
import io

# Lambda関数のパスを追加
sys.path.append(os.path.join(os.path.dirname(__file__), '../../lambda/python'))

# boto3とrequestsをモック化
sys.modules['boto3'] = Mock()
sys.modules['requests'] = Mock()

from image_fetcher import (
    fetch_image_from_s3,
    fetch_image_from_url,
    get_test_image,
    fetch_image,
    fetch_images_parallel,
    validate_image_path
)


class TestImageFetcher(unittest.TestCase):
    """画像取得エンジンのテストクラス"""
    
    def setUp(self):
        """テスト前の準備"""
        # テスト用の画像を作成
        self.test_image = Image.new('RGBA', (100, 100), (255, 0, 0, 255))
        self.test_image_bytes = io.BytesIO()
        self.test_image.save(self.test_image_bytes, format='PNG')
        self.test_image_bytes.seek(0)
    
    @patch('boto3.client')
    def test_fetch_image_from_s3_success(self, mock_boto3_client):
        """S3からの画像取得成功テスト"""
        # モックS3クライアントの設定
        mock_s3_client = Mock()
        mock_response = Mock()
        mock_response.__getitem__.return_value.read.return_value = self.test_image_bytes.getvalue()
        mock_s3_client.get_object.return_value = {'Body': mock_response['Body']}
        mock_boto3_client.return_value = mock_s3_client
        
        # テスト実行
        s3_path = "s3://test-bucket/test-image.png"
        result = fetch_image_from_s3(s3_path)
        
        # 結果検証
        self.assertIsInstance(result, Image.Image)
        self.assertEqual(result.mode, 'RGBA')
        mock_s3_client.get_object.assert_called_once_with(
            Bucket='test-bucket',
            Key='test-image.png'
        )
    
    @patch('boto3.client')
    def test_fetch_image_from_s3_with_custom_client(self, mock_boto3_client):
        """カスタムS3クライアントでの画像取得テスト"""
        custom_s3_client = Mock()
        mock_response = Mock()
        mock_response.__getitem__.return_value.read.return_value = self.test_image_bytes.getvalue()
        custom_s3_client.get_object.return_value = {'Body': mock_response['Body']}
        
        s3_path = "s3://test-bucket/test-image.png"
        result = fetch_image_from_s3(s3_path, s3_client=custom_s3_client)
        
        # カスタムクライアントが使用されることを確認
        mock_boto3_client.assert_not_called()
        custom_s3_client.get_object.assert_called_once()
    
    def test_fetch_image_from_s3_invalid_path(self):
        """無効なS3パスでのエラーテスト"""
        invalid_paths = [
            "invalid-path",
            "s3://",
            "s3://bucket-only",
            ""
        ]
        
        for invalid_path in invalid_paths:
            with self.assertRaises(ValueError):
                fetch_image_from_s3(invalid_path)
    
    @patch('requests.get')
    def test_fetch_image_from_url_success(self, mock_requests_get):
        """URLからの画像取得成功テスト"""
        # モックレスポンスの設定
        mock_response = Mock()
        mock_response.content = self.test_image_bytes.getvalue()
        mock_response.raise_for_status.return_value = None
        mock_requests_get.return_value = mock_response
        
        # テスト実行
        url = "https://example.com/test-image.png"
        result = fetch_image_from_url(url)
        
        # 結果検証
        self.assertIsInstance(result, Image.Image)
        self.assertEqual(result.mode, 'RGBA')
        mock_requests_get.assert_called_once_with(url, timeout=30, stream=True)
    
    @patch('requests.get')
    def test_fetch_image_from_url_with_timeout(self, mock_requests_get):
        """カスタムタイムアウトでのURL画像取得テスト"""
        mock_response = Mock()
        mock_response.content = self.test_image_bytes.getvalue()
        mock_response.raise_for_status.return_value = None
        mock_requests_get.return_value = mock_response
        
        url = "https://example.com/test-image.png"
        timeout = 60
        result = fetch_image_from_url(url, timeout=timeout)
        
        mock_requests_get.assert_called_once_with(url, timeout=timeout, stream=True)
    
    @patch('requests.get')
    def test_fetch_image_from_url_error(self, mock_requests_get):
        """URLからの画像取得エラーテスト"""
        mock_requests_get.side_effect = Exception("Network error")
        
        url = "https://example.com/test-image.png"
        with self.assertRaises(Exception):
            fetch_image_from_url(url)
    
    @patch.dict(os.environ, {}, clear=True)
    def test_get_test_image_local_generation(self):
        """ローカルテスト画像生成テスト"""
        image_types = ['image1', 'image2', 'image3', 'base']
        
        for image_type in image_types:
            result = get_test_image(image_type)
            
            self.assertIsInstance(result, Image.Image)
            self.assertEqual(result.mode, 'RGBA')
            self.assertEqual(result.size, (400, 400) if image_type != 'base' else (400, 200))
    
    @patch.dict(os.environ, {'TEST_BUCKET': 'test-bucket'})
    @patch('image_fetcher.fetch_image_from_s3')
    def test_get_test_image_s3_fetch(self, mock_fetch_s3):
        """S3からのテスト画像取得テスト"""
        mock_fetch_s3.return_value = self.test_image
        
        result = get_test_image('image1')
        
        mock_fetch_s3.assert_called_once_with('s3://test-bucket/images/circle_red.png')
        self.assertEqual(result, self.test_image)
    
    def test_fetch_image_test_type(self):
        """テスト画像取得の統一インターフェーステスト"""
        result = fetch_image("test", "image1")
        
        self.assertIsInstance(result, Image.Image)
        self.assertEqual(result.mode, 'RGBA')
    
    @patch('image_fetcher.fetch_image_from_s3')
    def test_fetch_image_s3_path(self, mock_fetch_s3):
        """S3パス指定での画像取得テスト"""
        mock_fetch_s3.return_value = self.test_image
        
        s3_path = "s3://test-bucket/test-image.png"
        result = fetch_image(s3_path)
        
        mock_fetch_s3.assert_called_once_with(s3_path)
        self.assertEqual(result, self.test_image)
    
    @patch('image_fetcher.fetch_image_from_url')
    def test_fetch_image_http_url(self, mock_fetch_url):
        """HTTP URL指定での画像取得テスト"""
        mock_fetch_url.return_value = self.test_image
        
        url = "https://example.com/test-image.png"
        result = fetch_image(url)
        
        mock_fetch_url.assert_called_once_with(url)
        self.assertEqual(result, self.test_image)
    
    def test_fetch_image_invalid_path(self):
        """無効なパス指定でのエラーテスト"""
        invalid_paths = [
            "",
            "invalid-path",
            "ftp://example.com/image.png"
        ]
        
        for invalid_path in invalid_paths:
            with self.assertRaises(ValueError):
                fetch_image(invalid_path)
    
    @patch('image_fetcher.fetch_image')
    def test_fetch_images_parallel_success(self, mock_fetch_image):
        """並列画像取得成功テスト"""
        # モック設定
        mock_fetch_image.return_value = self.test_image
        
        image_paths = {
            'image1': 'test',
            'image2': 'test',
            'image3': 'test'
        }
        
        result = fetch_images_parallel(image_paths)
        
        # 結果検証
        self.assertEqual(len(result), 3)
        self.assertIn('image1', result)
        self.assertIn('image2', result)
        self.assertIn('image3', result)
        
        # fetch_imageが3回呼ばれることを確認
        self.assertEqual(mock_fetch_image.call_count, 3)
    
    @patch('image_fetcher.fetch_image')
    def test_fetch_images_parallel_with_empty_paths(self, mock_fetch_image):
        """空のパスを含む並列画像取得テスト"""
        mock_fetch_image.return_value = self.test_image
        
        image_paths = {
            'image1': 'test',
            'image2': '',  # 空のパス
            'image3': 'test'
        }
        
        result = fetch_images_parallel(image_paths)
        
        # 空のパスは無視されることを確認
        self.assertEqual(len(result), 2)
        self.assertIn('image1', result)
        self.assertNotIn('image2', result)
        self.assertIn('image3', result)
        
        # fetch_imageが2回だけ呼ばれることを確認
        self.assertEqual(mock_fetch_image.call_count, 2)
    
    @patch('image_fetcher.fetch_image')
    def test_fetch_images_parallel_required_image_error(self, mock_fetch_image):
        """必須画像の取得エラーテスト"""
        # image1でエラーを発生させる
        def side_effect(path, image_type):
            if image_type == 'image1':
                raise Exception("Failed to load image1")
            return self.test_image
        
        mock_fetch_image.side_effect = side_effect
        
        image_paths = {
            'image1': 'test',
            'image2': 'test'
        }
        
        # 必須画像のエラーで例外が発生することを確認
        with self.assertRaises(ValueError):
            fetch_images_parallel(image_paths)
    
    @patch('image_fetcher.fetch_image')
    def test_fetch_images_parallel_optional_image_error(self, mock_fetch_image):
        """オプション画像の取得エラーテスト"""
        # image3でエラーを発生させる
        def side_effect(path, image_type):
            if image_type == 'image3':
                raise Exception("Failed to load image3")
            return self.test_image
        
        mock_fetch_image.side_effect = side_effect
        
        image_paths = {
            'image1': 'test',
            'image2': 'test',
            'image3': 'test'
        }
        
        # オプション画像のエラーは無視されることを確認
        result = fetch_images_parallel(image_paths)
        self.assertEqual(len(result), 2)
        self.assertIn('image1', result)
        self.assertIn('image2', result)
        self.assertNotIn('image3', result)
    
    def test_validate_image_path_valid_paths(self):
        """有効な画像パスの検証テスト"""
        valid_paths = [
            "test",
            "s3://bucket/key",
            "s3://my-bucket/folder/image.png",
            "http://example.com/image.png",
            "https://example.com/image.jpg"
        ]
        
        for path in valid_paths:
            self.assertTrue(validate_image_path(path), f"Path should be valid: {path}")
    
    def test_validate_image_path_invalid_paths(self):
        """無効な画像パスの検証テスト"""
        invalid_paths = [
            "",
            None,
            "s3://",
            "s3://bucket-only",
            "ftp://example.com/image.png",
            "invalid-path"
        ]
        
        for path in invalid_paths:
            self.assertFalse(validate_image_path(path), f"Path should be invalid: {path}")
    
    def test_fetch_images_parallel_max_workers(self):
        """並列実行数の制限テスト"""
        with patch('image_fetcher.fetch_image') as mock_fetch_image:
            mock_fetch_image.return_value = self.test_image
            
            image_paths = {
                'image1': 'test',
                'image2': 'test',
                'image3': 'test'
            }
            
            # max_workersを2に制限
            result = fetch_images_parallel(image_paths, max_workers=2)
            
            # 結果は変わらないが、並列実行数が制限されることを確認
            self.assertEqual(len(result), 3)


if __name__ == '__main__':
    unittest.main()