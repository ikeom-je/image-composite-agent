"""
Lambda関数最適化設定のテスト - v2.4.0
"""

import unittest
import sys
import os
import time
from unittest.mock import Mock, patch
from PIL import Image

# Lambda関数のパスを追加
sys.path.append(os.path.join(os.path.dirname(__file__), '../../lambda/python'))

from image_processor import handler as image_handler
from upload_manager import handler as upload_handler


class TestLambdaOptimization(unittest.TestCase):
    """Lambda関数最適化設定のテストクラス"""
    
    def setUp(self):
        """テスト前の準備"""
        # 環境変数を設定
        os.environ['S3_RESOURCES_BUCKET'] = 'test-resources-bucket'
        os.environ['TEST_BUCKET'] = 'test-images-bucket'
        os.environ['UPLOAD_BUCKET'] = 'test-upload-bucket'
        os.environ['LOG_LEVEL'] = 'INFO'
        os.environ['PYTHONPATH'] = '/var/runtime'
    
    def test_image_processor_memory_efficiency(self):
        """Image Processor Lambda関数のメモリ効率テスト"""
        # メモリ使用量の測定（簡易版）
        import psutil
        import gc
        
        # ガベージコレクションを実行
        gc.collect()
        
        # 初期メモリ使用量
        process = psutil.Process()
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        # テストイベント
        test_event = {
            'queryStringParameters': {
                'image1': 'test',
                'image2': 'test',
                'format': 'html'
            }
        }
        
        try:
            # ハンドラーを実行（モック環境）
            with patch('image_processor.fetch_images_parallel') as mock_fetch:
                with patch('image_processor.create_composite_image') as mock_composite:
                    # テスト画像を作成
                    test_image = Image.new('RGBA', (100, 100), (255, 0, 0, 255))
                    
                    mock_fetch.return_value = {
                        'image1': test_image,
                        'image2': test_image
                    }
                    mock_composite.return_value = test_image
                    
                    result = image_handler(test_event, None)
                    
                    # 成功レスポンスを確認
                    self.assertEqual(result['statusCode'], 200)
        
        except Exception as e:
            # boto3がない環境でのエラーは許容
            if 'boto3' not in str(e):
                raise e
        
        # 最終メモリ使用量
        final_memory = process.memory_info().rss / 1024 / 1024  # MB
        memory_increase = final_memory - initial_memory
        
        # メモリ増加量が合理的な範囲内であることを確認（100MB以下）
        self.assertLess(memory_increase, 100, 
                       f"Memory increase too high: {memory_increase:.2f}MB")
        
        print(f"📊 Memory usage: Initial={initial_memory:.2f}MB, "
              f"Final={final_memory:.2f}MB, Increase={memory_increase:.2f}MB")
    
    def test_image_processor_error_handling(self):
        """Image Processor Lambda関数のエラーハンドリングテスト"""
        # 無効なパラメータでのテスト
        invalid_event = {
            'queryStringParameters': {
                'image1': '',  # 無効な値
                'image2': 'test'
            }
        }
        
        result = image_handler(invalid_event, None)
        
        # 400エラーが返されることを確認
        self.assertEqual(result['statusCode'], 400)
        self.assertIn('error', result['body'])
    
    def test_upload_manager_performance(self):
        """Upload Manager Lambda関数のパフォーマンステスト"""
        # 実行時間の測定
        start_time = time.time()
        
        # テストイベント
        test_event = {
            'httpMethod': 'GET',
            'resource': '/upload/images'
        }
        
        try:
            result = upload_handler(test_event, None)
            execution_time = time.time() - start_time
            
            # 実行時間が合理的な範囲内であることを確認（5秒以下）
            self.assertLess(execution_time, 5.0, 
                           f"Execution time too high: {execution_time:.2f}s")
            
            print(f"⏱️ Upload Manager execution time: {execution_time:.3f}s")
            
        except Exception as e:
            # boto3がない環境でのエラーは許容
            if 'boto3' not in str(e):
                raise e
            else:
                print("⚠️ boto3 not available, skipping performance test")
    
    def test_environment_variables_configuration(self):
        """環境変数設定のテスト"""
        # 必要な環境変数が設定されていることを確認
        required_env_vars = [
            'S3_RESOURCES_BUCKET',
            'TEST_BUCKET',
            'UPLOAD_BUCKET',
            'LOG_LEVEL',
            'PYTHONPATH'
        ]
        
        for env_var in required_env_vars:
            self.assertIn(env_var, os.environ, f"Environment variable {env_var} not set")
            self.assertNotEqual(os.environ[env_var], '', f"Environment variable {env_var} is empty")
        
        print("✅ All required environment variables are configured")
    
    def test_logging_configuration(self):
        """ログ設定のテスト"""
        import logging
        
        # ログレベルが正しく設定されていることを確認
        logger = logging.getLogger('image_processor')
        
        # ログレベルがINFOに設定されていることを確認
        expected_level = logging.INFO
        self.assertEqual(logger.level, expected_level, 
                        f"Log level should be {expected_level}, but got {logger.level}")
        
        print(f"📝 Logging configured correctly: level={logger.level}")
    
    def test_concurrent_request_handling(self):
        """同時リクエスト処理のテスト"""
        import threading
        import queue
        
        # 結果を格納するキュー
        results = queue.Queue()
        
        def worker():
            """ワーカー関数"""
            test_event = {
                'queryStringParameters': {
                    'image1': 'test',
                    'image2': 'test',
                    'format': 'html'
                }
            }
            
            try:
                with patch('image_processor.fetch_images_parallel') as mock_fetch:
                    with patch('image_processor.create_composite_image') as mock_composite:
                        # テスト画像を作成
                        test_image = Image.new('RGBA', (50, 50), (255, 0, 0, 255))
                        
                        mock_fetch.return_value = {
                            'image1': test_image,
                            'image2': test_image
                        }
                        mock_composite.return_value = test_image
                        
                        result = image_handler(test_event, None)
                        results.put(result['statusCode'])
            except Exception as e:
                results.put(str(e))
        
        # 複数のスレッドで同時実行
        threads = []
        num_threads = 3
        
        for _ in range(num_threads):
            thread = threading.Thread(target=worker)
            threads.append(thread)
            thread.start()
        
        # すべてのスレッドの完了を待機
        for thread in threads:
            thread.join()
        
        # 結果を確認
        success_count = 0
        while not results.empty():
            result = results.get()
            if result == 200:
                success_count += 1
        
        # 少なくとも1つのリクエストが成功することを確認
        self.assertGreater(success_count, 0, "No concurrent requests succeeded")
        
        print(f"🔄 Concurrent requests: {success_count}/{num_threads} succeeded")
    
    def test_resource_cleanup(self):
        """リソースクリーンアップのテスト"""
        import gc
        
        # ガベージコレクション前のオブジェクト数
        gc.collect()
        initial_objects = len(gc.get_objects())
        
        # テスト実行
        test_event = {
            'queryStringParameters': {
                'image1': 'test',
                'image2': 'test',
                'format': 'html'
            }
        }
        
        try:
            with patch('image_processor.fetch_images_parallel') as mock_fetch:
                with patch('image_processor.create_composite_image') as mock_composite:
                    # 大きなテスト画像を作成
                    test_image = Image.new('RGBA', (500, 500), (255, 0, 0, 255))
                    
                    mock_fetch.return_value = {
                        'image1': test_image,
                        'image2': test_image
                    }
                    mock_composite.return_value = test_image
                    
                    result = image_handler(test_event, None)
                    
                    # 明示的にオブジェクトを削除
                    del test_image
        
        except Exception as e:
            if 'boto3' not in str(e):
                raise e
        
        # ガベージコレクション実行
        gc.collect()
        final_objects = len(gc.get_objects())
        
        # オブジェクト数の増加が合理的な範囲内であることを確認
        object_increase = final_objects - initial_objects
        self.assertLess(object_increase, 2000,  # 閾値を調整
                       f"Too many objects created: {object_increase}")
        
        print(f"🧹 Resource cleanup: Objects increased by {object_increase}")


if __name__ == '__main__':
    # psutilがインストールされているかチェック
    try:
        import psutil
        unittest.main()
    except ImportError:
        print("⚠️ psutil not available, skipping memory tests")
        # psutilなしでも実行できるテストのみ実行
        suite = unittest.TestSuite()
        suite.addTest(TestLambdaOptimization('test_image_processor_error_handling'))
        suite.addTest(TestLambdaOptimization('test_environment_variables_configuration'))
        suite.addTest(TestLambdaOptimization('test_logging_configuration'))
        suite.addTest(TestLambdaOptimization('test_resource_cleanup'))
        
        runner = unittest.TextTestRunner()
        runner.run(suite)