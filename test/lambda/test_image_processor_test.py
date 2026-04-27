"""
メインLambdaハンドラーのユニットテスト - v2.4.0
"""

import unittest
import sys
import os
import json
import base64
from unittest.mock import Mock, patch
from PIL import Image
from io import BytesIO

# Lambda関数のパスを追加
sys.path.append(os.path.join(os.path.dirname(__file__), '../../lambda/python'))

from image_processor import (
    format_response,
    validate_required_parameters,
    generate_html_response,
    handler,
    VERSION
)


class TestImageProcessor(unittest.TestCase):
    """メインLambdaハンドラーのテストクラス"""

    def setUp(self):
        """テスト前の準備"""
        self.test_image = Image.new('RGBA', (100, 100), (255, 0, 0, 255))

    def test_format_response_json(self):
        """JSON形式のレスポンス生成テスト"""
        body = {'message': 'test', 'status': 'success'}
        result = format_response(200, body)

        self.assertEqual(result['statusCode'], 200)
        self.assertEqual(result['headers']['Content-Type'], 'application/json')
        self.assertIn('Access-Control-Allow-Origin', result['headers'])
        self.assertEqual(json.loads(result['body']), body)

    def test_format_response_string(self):
        """文字列形式のレスポンス生成テスト"""
        body = "test response"
        result = format_response(200, body)

        self.assertEqual(result['statusCode'], 200)
        self.assertEqual(result['body'], body)

    def test_format_response_custom_headers(self):
        """カスタムヘッダー付きレスポンス生成テスト"""
        body = {'test': 'data'}
        custom_headers = {'Content-Type': 'text/html', 'Custom-Header': 'value'}
        result = format_response(200, body, headers=custom_headers)

        self.assertEqual(result['headers']['Content-Type'], 'text/html')
        self.assertEqual(result['headers']['Custom-Header'], 'value')
        self.assertIn('Access-Control-Allow-Origin', result['headers'])

    def test_validate_required_parameters_valid(self):
        """有効な必須パラメータの検証テスト"""
        valid_params = {
            'image1': 'test',
            'image2': 'test',
            'format': 'html'
        }

        errors = validate_required_parameters(valid_params)
        self.assertEqual(len(errors), 0)

    def test_validate_required_parameters_missing_image1(self):
        """image1欠如の検証テスト"""
        invalid_params = {
            'image2': 'test'
        }

        errors = validate_required_parameters(invalid_params)
        self.assertGreater(len(errors), 0)

    def test_validate_required_parameters_image1_only(self):
        """image1のみでも有効であることの検証テスト"""
        params = {
            'image1': 'test'
        }

        errors = validate_required_parameters(params)
        self.assertEqual(len(errors), 0)

    def test_validate_required_parameters_invalid_format(self):
        """無効なフォーマットパラメータの検証テスト"""
        invalid_params = {
            'image1': 'test',
            'image2': 'test',
            'format': 'invalid'
        }

        errors = validate_required_parameters(invalid_params)
        self.assertGreater(len(errors), 0)
        self.assertTrue(any('format' in error for error in errors))

    def test_generate_html_response(self):
        """HTML レスポンス生成テスト"""
        query_params = {
            'image1': 'test',
            'image2': 'test',
            'image3': 'test',
            'image1X': '100',
            'image1Y': '200'
        }

        html_content = generate_html_response(self.test_image, query_params)

        self.assertIn('<!DOCTYPE html>', html_content)
        self.assertIn('<html lang="ja">', html_content)
        self.assertIn(f'Version {VERSION}', html_content)
        self.assertIn('data:image/png;base64,', html_content)
        self.assertIn('downloadImage()', html_content)
        self.assertIn('100 × 100 px', html_content)
        self.assertIn('RGBA', html_content)

    @patch('image_processor.fetch_images_parallel')
    @patch('image_processor.create_composite_image')
    def test_handler_html_success(self, mock_create_composite, mock_fetch_images):
        """ハンドラーHTML成功テスト"""
        mock_fetch_images.return_value = {
            'image1': self.test_image,
            'image2': self.test_image
        }
        mock_create_composite.return_value = self.test_image

        event = {
            'queryStringParameters': {
                'image1': 'test',
                'image2': 'test',
                'format': 'html'
            }
        }

        result = handler(event, None)

        self.assertEqual(result['statusCode'], 200)
        self.assertEqual(result['headers']['Content-Type'], 'text/html; charset=utf-8')
        self.assertIn('<!DOCTYPE html>', result['body'])

    @patch('image_processor.fetch_images_parallel')
    @patch('image_processor.create_composite_image')
    def test_handler_png_success(self, mock_create_composite, mock_fetch_images):
        """ハンドラーPNG成功テスト"""
        mock_fetch_images.return_value = {
            'image1': self.test_image,
            'image2': self.test_image
        }
        mock_create_composite.return_value = self.test_image

        event = {
            'queryStringParameters': {
                'image1': 'test',
                'image2': 'test',
                'format': 'png'
            }
        }

        result = handler(event, None)

        self.assertEqual(result['statusCode'], 200)
        self.assertEqual(result['headers']['Content-Type'], 'image/png')
        self.assertTrue(result['isBase64Encoded'])

    @patch('image_processor.fetch_images_parallel')
    @patch('image_processor.create_composite_image')
    def test_handler_3_images_success(self, mock_create_composite, mock_fetch_images):
        """ハンドラー3画像合成成功テスト"""
        mock_fetch_images.return_value = {
            'image1': self.test_image,
            'image2': self.test_image,
            'image3': self.test_image
        }
        mock_create_composite.return_value = self.test_image

        event = {
            'queryStringParameters': {
                'image1': 'test',
                'image2': 'test',
                'image3': 'test',
                'format': 'html'
            }
        }

        result = handler(event, None)

        self.assertEqual(result['statusCode'], 200)
        mock_fetch_images.assert_called_once()
        mock_create_composite.assert_called_once()

    def test_handler_missing_parameters(self):
        """ハンドラー必須パラメータ欠如テスト"""
        event = {
            'queryStringParameters': {
                'image2': 'test'
            }
        }

        result = handler(event, None)

        self.assertEqual(result['statusCode'], 400)
        response_body = json.loads(result['body'])
        self.assertIn('error', response_body)

    def test_handler_no_query_parameters(self):
        """ハンドラークエリパラメータなしテスト"""
        event = {}

        result = handler(event, None)

        self.assertEqual(result['statusCode'], 400)
        response_body = json.loads(result['body'])
        self.assertIn('error', response_body)

    def test_handler_null_query_parameters(self):
        """ハンドラーnullクエリパラメータテスト"""
        event = {
            'queryStringParameters': None
        }

        result = handler(event, None)

        self.assertEqual(result['statusCode'], 400)

    @patch('image_processor.fetch_images_parallel')
    def test_handler_fetch_error(self, mock_fetch_images):
        """ハンドラー画像取得エラーテスト"""
        mock_fetch_images.side_effect = Exception("Failed to fetch images")

        event = {
            'queryStringParameters': {
                'image1': 'test',
                'image2': 'test'
            }
        }

        result = handler(event, None)

        self.assertIn(result['statusCode'], [404, 500])

    @patch('image_processor.fetch_images_parallel')
    @patch('image_processor.create_composite_image')
    def test_handler_composition_error(self, mock_create_composite, mock_fetch_images):
        """ハンドラー画像合成エラーテスト"""
        mock_fetch_images.return_value = {
            'image1': self.test_image,
            'image2': self.test_image
        }
        mock_create_composite.side_effect = ValueError("Invalid parameters")

        event = {
            'queryStringParameters': {
                'image1': 'test',
                'image2': 'test'
            }
        }

        result = handler(event, None)

        self.assertIn(result['statusCode'], [400, 500])

    def test_version_consistency(self):
        """バージョン一貫性テスト"""
        html_content = generate_html_response(self.test_image, {})
        self.assertIn(f'Version {VERSION}', html_content)

    def test_cors_headers(self):
        """CORSヘッダーテスト"""
        json_response = format_response(200, {'test': 'data'})
        self.assertEqual(json_response['headers']['Access-Control-Allow-Origin'], '*')
        self.assertIn('Access-Control-Allow-Methods', json_response['headers'])
        self.assertIn('Access-Control-Allow-Headers', json_response['headers'])


if __name__ == '__main__':
    unittest.main()
