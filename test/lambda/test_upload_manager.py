"""
Upload Manager Lambda関数のユニットテスト

テスト対象:
- 署名付きURL生成
- 画像一覧取得
- アップロード完了処理
- サムネイル生成
"""

import unittest
import json
import os
import sys
from unittest.mock import Mock, patch, MagicMock
from io import BytesIO

# Lambda関数のパスを追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../lambda/python'))

import upload_manager

class TestUploadManager(unittest.TestCase):
    
    def setUp(self):
        """テストセットアップ"""
        self.test_bucket = 'test-upload-bucket'
        os.environ['UPLOAD_BUCKET'] = self.test_bucket
        
        # モックイベント
        self.presigned_url_event = {
            'httpMethod': 'POST',
            'path': '/upload/presigned-url',
            'body': json.dumps({
                'fileName': 'test-image.png',
                'fileType': 'image/png',
                'fileSize': 1024000  # 1MB
            })
        }
        
        self.list_images_event = {
            'httpMethod': 'GET',
            'path': '/upload/images',
            'queryStringParameters': {}
        }
        
        self.s3_event = {
            'Records': [{
                's3': {
                    'bucket': {'name': self.test_bucket},
                    'object': {'key': 'uploads/images/test-image.png'}
                }
            }]
        }
    
    def tearDown(self):
        """テストクリーンアップ"""
        if 'UPLOAD_BUCKET' in os.environ:
            del os.environ['UPLOAD_BUCKET']
    
    @patch('upload_manager.s3_client')
    def test_generate_presigned_upload_url_success(self, mock_s3):
        """署名付きURL生成の正常ケース"""
        # モック設定
        mock_s3.generate_presigned_url.return_value = 'https://test-presigned-url.com'
        
        # テスト実行
        result = upload_manager.generate_presigned_upload_url(
            self.presigned_url_event, None
        )
        
        # 検証
        self.assertEqual(result['statusCode'], 200)
        body = json.loads(result['body'])
        self.assertIn('uploadUrl', body)
        self.assertIn('s3Key', body)
        self.assertIn('bucketName', body)
        self.assertEqual(body['bucketName'], self.test_bucket)
        self.assertEqual(body['expiresIn'], 3600)
        
        # S3クライアントの呼び出し検証
        mock_s3.generate_presigned_url.assert_called_once()
        call_args = mock_s3.generate_presigned_url.call_args
        self.assertEqual(call_args[0][0], 'put_object')
        self.assertEqual(call_args[1]['Params']['Bucket'], self.test_bucket)
        self.assertEqual(call_args[1]['Params']['ContentType'], 'image/png')
    
    def test_generate_presigned_upload_url_missing_params(self):
        """署名付きURL生成のパラメータ不足エラー"""
        event = {
            'httpMethod': 'POST',
            'path': '/upload/presigned-url',
            'body': json.dumps({
                'fileName': 'test-image.png'
                # fileType が不足
            })
        }
        
        result = upload_manager.generate_presigned_upload_url(event, None)
        
        self.assertEqual(result['statusCode'], 400)
        body = json.loads(result['body'])
        self.assertIn('error', body)
        self.assertIn('fileName and fileType are required', body['error'])
    
    def test_generate_presigned_upload_url_file_too_large(self):
        """署名付きURL生成のファイルサイズ制限エラー"""
        event = {
            'httpMethod': 'POST',
            'path': '/upload/presigned-url',
            'body': json.dumps({
                'fileName': 'large-image.png',
                'fileType': 'image/png',
                'fileSize': 11 * 1024 * 1024  # 11MB (制限は10MB)
            })
        }
        
        result = upload_manager.generate_presigned_upload_url(event, None)
        
        self.assertEqual(result['statusCode'], 400)
        body = json.loads(result['body'])
        self.assertIn('File size exceeds 10MB limit', body['error'])
    
    def test_generate_presigned_upload_url_unsupported_type(self):
        """署名付きURL生成の非対応ファイル形式エラー"""
        event = {
            'httpMethod': 'POST',
            'path': '/upload/presigned-url',
            'body': json.dumps({
                'fileName': 'document.pdf',
                'fileType': 'application/pdf',
                'fileSize': 1024000
            })
        }
        
        result = upload_manager.generate_presigned_upload_url(event, None)
        
        self.assertEqual(result['statusCode'], 400)
        body = json.loads(result['body'])
        self.assertIn('Unsupported file type', body['error'])
    
    @patch('upload_manager.s3_client')
    def test_list_uploaded_images_success(self, mock_s3):
        """画像一覧取得の正常ケース"""
        # モック設定
        mock_s3.list_objects_v2.return_value = {
            'Contents': [
                {
                    'Key': 'uploads/images/test1.png',
                    'Size': 1024000,
                    'LastModified': '2024-01-01T00:00:00Z'
                },
                {
                    'Key': 'uploads/images/test2.jpg',
                    'Size': 2048000,
                    'LastModified': '2024-01-02T00:00:00Z'
                }
            ]
        }
        
        mock_s3.head_object.return_value = {
            'ContentType': 'image/png'
        }
        
        mock_s3.generate_presigned_url.return_value = 'https://test-thumbnail-url.com'
        
        # テスト実行
        result = upload_manager.list_uploaded_images(self.list_images_event, None)
        
        # 検証
        self.assertEqual(result['statusCode'], 200)
        body = json.loads(result['body'])
        self.assertIn('images', body)
        self.assertIn('count', body)
        self.assertEqual(body['count'], 2)
        
        # 画像データの検証
        images = body['images']
        self.assertEqual(len(images), 2)
        
        first_image = images[0]
        self.assertIn('key', first_image)
        self.assertIn('s3Path', first_image)
        self.assertIn('fileName', first_image)
        self.assertIn('size', first_image)
        self.assertIn('thumbnailUrl', first_image)
        self.assertTrue(first_image['s3Path'].startswith('s3://'))
    
    @patch('upload_manager.s3_client')
    def test_list_uploaded_images_empty(self, mock_s3):
        """画像一覧取得の空リストケース"""
        # モック設定
        mock_s3.list_objects_v2.return_value = {}
        
        # テスト実行
        result = upload_manager.list_uploaded_images(self.list_images_event, None)
        
        # 検証
        self.assertEqual(result['statusCode'], 200)
        body = json.loads(result['body'])
        self.assertEqual(body['count'], 0)
        self.assertEqual(len(body['images']), 0)
    
    @patch('upload_manager.generate_thumbnail')
    def test_handle_upload_completion_success(self, mock_generate_thumbnail):
        """アップロード完了処理の正常ケース"""
        # テスト実行
        result = upload_manager.handle_upload_completion(self.s3_event, None)
        
        # 検証
        self.assertEqual(result['statusCode'], 200)
        mock_generate_thumbnail.assert_called_once_with(
            self.test_bucket, 'uploads/images/test-image.png'
        )
    
    @patch('upload_manager.s3_client')
    @patch('upload_manager.Image')
    def test_generate_thumbnail_success(self, mock_image_class, mock_s3):
        """サムネイル生成の正常ケース"""
        # モック設定
        mock_image = Mock()
        mock_image.mode = 'RGB'
        mock_image.convert.return_value = mock_image
        mock_image.thumbnail = Mock()
        mock_image.save = Mock()
        
        mock_image_class.open.return_value = mock_image
        
        mock_s3.get_object.return_value = {
            'Body': Mock(read=Mock(return_value=b'fake_image_data'))
        }
        
        # テスト実行
        upload_manager.generate_thumbnail(
            self.test_bucket, 'uploads/images/test-image.jpg'
        )
        
        # 検証
        mock_s3.get_object.assert_called_once_with(
            Bucket=self.test_bucket,
            Key='uploads/images/test-image.jpg'
        )
        mock_image.convert.assert_called_once_with('RGBA')
        mock_image.thumbnail.assert_called_once_with((200, 200), mock_image_class.LANCZOS)
        mock_s3.put_object.assert_called_once()
        
        # put_objectの呼び出し引数を検証
        put_call_args = mock_s3.put_object.call_args
        self.assertEqual(put_call_args[1]['Bucket'], self.test_bucket)
        self.assertEqual(put_call_args[1]['ContentType'], 'image/png')
        self.assertTrue(put_call_args[1]['Key'].startswith('thumbnails/'))
        self.assertTrue(put_call_args[1]['Key'].endswith('.png'))
    
    def test_handler_routing_presigned_url(self):
        """ハンドラーのルーティング - 署名付きURL"""
        with patch.object(upload_manager, 'generate_presigned_upload_url') as mock_func:
            mock_func.return_value = {'statusCode': 200, 'body': '{}'}
            
            result = upload_manager.handler(self.presigned_url_event, None)
            
            mock_func.assert_called_once_with(self.presigned_url_event, None)
            self.assertEqual(result['statusCode'], 200)
    
    def test_handler_routing_list_images(self):
        """ハンドラーのルーティング - 画像一覧"""
        with patch.object(upload_manager, 'list_uploaded_images') as mock_func:
            mock_func.return_value = {'statusCode': 200, 'body': '{}'}
            
            result = upload_manager.handler(self.list_images_event, None)
            
            mock_func.assert_called_once_with(self.list_images_event, None)
            self.assertEqual(result['statusCode'], 200)
    
    def test_handler_routing_s3_event(self):
        """ハンドラーのルーティング - S3イベント"""
        with patch.object(upload_manager, 'handle_upload_completion') as mock_func:
            mock_func.return_value = {'statusCode': 200}
            
            result = upload_manager.handler(self.s3_event, None)
            
            mock_func.assert_called_once_with(self.s3_event, None)
            self.assertEqual(result['statusCode'], 200)
    
    def test_handler_routing_not_found(self):
        """ハンドラーのルーティング - 404エラー"""
        invalid_event = {
            'httpMethod': 'GET',
            'path': '/invalid/path'
        }
        
        result = upload_manager.handler(invalid_event, None)
        
        self.assertEqual(result['statusCode'], 404)
        body = json.loads(result['body'])
        self.assertIn('Not found', body['error'])
    
    def test_format_response(self):
        """レスポンス形式のテスト"""
        test_body = {'message': 'test', 'data': [1, 2, 3]}
        
        result = upload_manager.format_response(200, test_body)
        
        self.assertEqual(result['statusCode'], 200)
        self.assertIn('headers', result)
        self.assertIn('body', result)
        
        # ヘッダーの検証
        headers = result['headers']
        self.assertEqual(headers['Content-Type'], 'application/json')
        self.assertEqual(headers['Access-Control-Allow-Origin'], '*')
        
        # ボディの検証
        parsed_body = json.loads(result['body'])
        self.assertEqual(parsed_body, test_body)

if __name__ == '__main__':
    unittest.main()