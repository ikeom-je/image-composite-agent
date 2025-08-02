"""
テスト画像生成関数のユニットテスト - v2.4.0
"""

import unittest
import sys
import os
from unittest.mock import Mock, patch, MagicMock
from PIL import Image
import io

# Lambda関数のパスを追加
sys.path.append(os.path.join(os.path.dirname(__file__), '../../lambda/python'))

from test_image_generator import (
    generate_circle_image,
    generate_rectangle_image,
    generate_triangle_image,
    save_test_images_to_s3
)


class TestImageGenerator(unittest.TestCase):
    """テスト画像生成関数のテストクラス"""
    
    def test_generate_circle_image_default(self):
        """デフォルトパラメータでの円形画像生成テスト"""
        image = generate_circle_image()
        
        # 基本的な画像プロパティをチェック
        self.assertEqual(image.size, (400, 400))
        self.assertEqual(image.mode, 'RGBA')
        
        # 透過背景をチェック（角の部分は透明であるべき）
        corner_pixel = image.getpixel((0, 0))
        self.assertEqual(corner_pixel[3], 0)  # アルファ値が0（透明）
        
        # 中央部分は赤色であるべき
        center_pixel = image.getpixel((200, 200))
        self.assertEqual(center_pixel[:3], (239, 68, 68))  # RGB値
        self.assertEqual(center_pixel[3], 255)  # アルファ値が255（不透明）
    
    def test_generate_circle_image_custom_size(self):
        """カスタムサイズでの円形画像生成テスト"""
        custom_size = (300, 300)
        image = generate_circle_image(size=custom_size)
        
        self.assertEqual(image.size, custom_size)
        self.assertEqual(image.mode, 'RGBA')
    
    def test_generate_circle_image_custom_color(self):
        """カスタム色での円形画像生成テスト"""
        custom_color = (255, 0, 0)  # 純粋な赤
        image = generate_circle_image(color=custom_color)
        
        # 中央部分の色をチェック
        center_pixel = image.getpixel((200, 200))
        self.assertEqual(center_pixel[:3], custom_color)
    
    def test_generate_rectangle_image_default(self):
        """デフォルトパラメータでの四角形画像生成テスト"""
        image = generate_rectangle_image()
        
        # 基本的な画像プロパティをチェック
        self.assertEqual(image.size, (400, 400))
        self.assertEqual(image.mode, 'RGBA')
        
        # 透過背景をチェック（角の部分は透明であるべき）
        corner_pixel = image.getpixel((0, 0))
        self.assertEqual(corner_pixel[3], 0)  # アルファ値が0（透明）
        
        # 中央部分は青色であるべき
        center_pixel = image.getpixel((200, 200))
        self.assertEqual(center_pixel[:3], (59, 130, 246))  # RGB値
        self.assertEqual(center_pixel[3], 255)  # アルファ値が255（不透明）
    
    def test_generate_rectangle_image_custom_parameters(self):
        """カスタムパラメータでの四角形画像生成テスト"""
        custom_size = (200, 300)
        custom_color = (0, 255, 0)  # 純粋な緑
        image = generate_rectangle_image(size=custom_size, color=custom_color)
        
        self.assertEqual(image.size, custom_size)
        
        # 中央部分の色をチェック
        center_pixel = image.getpixel((100, 150))
        self.assertEqual(center_pixel[:3], custom_color)
    
    def test_generate_triangle_image_default(self):
        """デフォルトパラメータでの三角形画像生成テスト"""
        image = generate_triangle_image()
        
        # 基本的な画像プロパティをチェック
        self.assertEqual(image.size, (400, 400))
        self.assertEqual(image.mode, 'RGBA')
        
        # 透過背景をチェック（角の部分は透明であるべき）
        corner_pixel = image.getpixel((0, 0))
        self.assertEqual(corner_pixel[3], 0)  # アルファ値が0（透明）
        
        # 三角形の中央部分は緑色であるべき
        center_pixel = image.getpixel((200, 250))  # 三角形の重心付近
        self.assertEqual(center_pixel[:3], (34, 197, 94))  # RGB値
        self.assertEqual(center_pixel[3], 255)  # アルファ値が255（不透明）
    
    def test_generate_triangle_image_custom_parameters(self):
        """カスタムパラメータでの三角形画像生成テスト"""
        custom_size = (600, 600)
        custom_color = (255, 255, 0)  # 黄色
        image = generate_triangle_image(size=custom_size, color=custom_color)
        
        self.assertEqual(image.size, custom_size)
        
        # 三角形の中央部分の色をチェック
        center_pixel = image.getpixel((300, 375))  # 三角形の重心付近
        self.assertEqual(center_pixel[:3], custom_color)
    
    def test_all_images_have_transparency(self):
        """すべての画像が透過背景を持つことをテスト"""
        images = [
            generate_circle_image(),
            generate_rectangle_image(),
            generate_triangle_image()
        ]
        
        for image in images:
            # RGBAモードであることを確認
            self.assertEqual(image.mode, 'RGBA')
            
            # 角の部分が透明であることを確認
            corner_pixels = [
                image.getpixel((0, 0)),
                image.getpixel((0, image.height - 1)),
                image.getpixel((image.width - 1, 0)),
                image.getpixel((image.width - 1, image.height - 1))
            ]
            
            # 少なくとも一つの角が透明であることを確認
            has_transparent_corner = any(pixel[3] == 0 for pixel in corner_pixels)
            self.assertTrue(has_transparent_corner)
    
    @patch('boto3.client')
    def test_save_test_images_to_s3_success(self, mock_boto3_client):
        """S3への画像保存成功テスト"""
        # モックS3クライアントの設定
        mock_s3_client = Mock()
        mock_boto3_client.return_value = mock_s3_client
        
        bucket_name = 'test-bucket'
        result = save_test_images_to_s3(bucket_name)
        
        # 3つの画像がすべて成功していることを確認
        self.assertEqual(len(result), 3)
        
        expected_files = ['circle_red.png', 'rectangle_blue.png', 'triangle_green.png']
        for filename in expected_files:
            self.assertIn(filename, result)
            self.assertEqual(result[filename]['status'], 'success')
            self.assertIn('s3_key', result[filename])
            self.assertIn('size', result[filename])
        
        # S3クライアントのput_objectが3回呼ばれることを確認
        self.assertEqual(mock_s3_client.put_object.call_count, 3)
    
    @patch('boto3.client')
    def test_save_test_images_to_s3_with_custom_client(self, mock_boto3_client):
        """カスタムS3クライアントでの画像保存テスト"""
        custom_s3_client = Mock()
        bucket_name = 'test-bucket'
        
        result = save_test_images_to_s3(bucket_name, s3_client=custom_s3_client)
        
        # カスタムクライアントが使用されることを確認
        mock_boto3_client.assert_not_called()
        self.assertEqual(custom_s3_client.put_object.call_count, 3)
    
    @patch('boto3.client')
    def test_save_test_images_to_s3_error_handling(self, mock_boto3_client):
        """S3への画像保存エラーハンドリングテスト"""
        # モックS3クライアントでエラーを発生させる
        mock_s3_client = Mock()
        mock_s3_client.put_object.side_effect = Exception("S3 upload failed")
        mock_boto3_client.return_value = mock_s3_client
        
        bucket_name = 'test-bucket'
        result = save_test_images_to_s3(bucket_name)
        
        # すべての画像でエラーが記録されることを確認
        for filename in result:
            self.assertEqual(result[filename]['status'], 'error')
            self.assertIn('error', result[filename])
    
    def test_image_quality_and_format(self):
        """画像品質とフォーマットのテスト"""
        images = {
            'circle': generate_circle_image(),
            'rectangle': generate_rectangle_image(),
            'triangle': generate_triangle_image()
        }
        
        for name, image in images.items():
            # PNG形式で保存できることを確認
            buffer = io.BytesIO()
            image.save(buffer, format='PNG')
            buffer.seek(0)
            
            # 保存されたデータが有効であることを確認
            self.assertGreater(len(buffer.getvalue()), 0)
            
            # 保存された画像を再読み込みして確認
            buffer.seek(0)
            reloaded_image = Image.open(buffer)
            self.assertEqual(reloaded_image.size, image.size)
            self.assertEqual(reloaded_image.mode, 'RGBA')


if __name__ == '__main__':
    unittest.main()