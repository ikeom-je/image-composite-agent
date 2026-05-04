"""
Agent Tools のユニットテスト

テスト対象:
- 座標変換ロジック（resolve_position, resolve_size）
- get_help ツール
- _format_size ヘルパー
"""

import json
import unittest
import os
import sys
from unittest.mock import patch, MagicMock

# Lambda関数のパスを追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../lambda/python'))

from agent_prompts import resolve_position, resolve_size, POSITION_MAP, DEFAULT_SIZE

# PILがない環境でもテスト可能にする
with patch.dict('sys.modules', {'PIL': MagicMock(), 'PIL.Image': MagicMock()}):
    import agent_tools
    from agent_tools import get_help, _format_size, generate_video, compose_images

# patch.dict はブロック終了時に sys.modules を復元してしまい、import した
# agent_tools が消えるため、後段の mock.patch('agent_tools.X') が解決できない。
# 明示的に再登録する。
sys.modules['agent_tools'] = agent_tools


class TestResolvePosition(unittest.TestCase):
    """位置解決のテスト"""

    def test_named_positions(self):
        """名前指定の位置を座標に変換できること"""
        self.assertEqual(resolve_position('左上'), (50, 50))
        self.assertEqual(resolve_position('右上'), (1470, 50))
        self.assertEqual(resolve_position('中央'), (710, 290))
        self.assertEqual(resolve_position('左下'), (50, 630))
        self.assertEqual(resolve_position('右下'), (1470, 630))
        self.assertEqual(resolve_position('中央上'), (710, 50))
        self.assertEqual(resolve_position('中央下'), (710, 630))

    def test_coordinate_positions(self):
        """座標指定の位置を解析できること"""
        self.assertEqual(resolve_position('100,200'), (100, 200))
        self.assertEqual(resolve_position('500 300'), (500, 300))
        self.assertEqual(resolve_position(' 100 , 200 '), (100, 200))

    def test_default_position(self):
        """不正な位置指定でデフォルト値が返ること"""
        result = resolve_position('不正な値')
        self.assertEqual(result, POSITION_MAP['中央'])

    def test_whitespace_handling(self):
        """前後の空白が除去されること"""
        self.assertEqual(resolve_position('  左上  '), (50, 50))


class TestResolveSize(unittest.TestCase):
    """サイズ解決のテスト"""

    def test_size_with_x(self):
        """WxH形式を解析できること"""
        self.assertEqual(resolve_size('400x400'), (400, 400))
        self.assertEqual(resolve_size('800X600'), (800, 600))

    def test_size_with_comma(self):
        """W,H形式を解析できること"""
        self.assertEqual(resolve_size('400,300'), (400, 300))

    def test_size_with_space(self):
        """W H形式を解析できること"""
        self.assertEqual(resolve_size('400 300'), (400, 300))

    def test_default_size(self):
        """不正なサイズ指定でデフォルト値が返ること"""
        self.assertEqual(resolve_size('invalid'), DEFAULT_SIZE)
        self.assertEqual(resolve_size(''), DEFAULT_SIZE)


class TestGetHelp(unittest.TestCase):
    """ヘルプツールのテスト"""

    def test_overview_help(self):
        """概要ヘルプが取得できること"""
        result = get_help('')
        self.assertIn('画像合成アシスタント', result)
        self.assertIn('画像合成', result)
        self.assertIn('動画生成', result)

    def test_composition_help(self):
        """画像合成ヘルプが取得できること"""
        result = get_help('画像合成')
        self.assertIn('1920x1080', result)
        self.assertIn('パラメータ', result)

    def test_video_help(self):
        """動画生成ヘルプが取得できること"""
        result = get_help('動画生成')
        self.assertIn('MP4', result)
        self.assertIn('WEBM', result)

    def test_asset_help(self):
        """アセット管理ヘルプが取得できること"""
        result = get_help('アセット管理')
        self.assertIn('一覧', result)
        self.assertIn('削除', result)

    def test_position_help(self):
        """位置指定ヘルプが取得できること"""
        result = get_help('位置指定')
        self.assertIn('左上', result)
        self.assertIn('中央', result)

    def test_source_help(self):
        """画像ソースヘルプが取得できること"""
        result = get_help('画像ソース')
        self.assertIn('test', result)
        self.assertIn('URL', result)

    def test_unknown_topic(self):
        """不明なトピックでエラーメッセージが返ること"""
        result = get_help('存在しないトピック')
        self.assertIn('見つかりませんでした', result)


class TestFormatSize(unittest.TestCase):
    """ファイルサイズフォーマットのテスト"""

    def test_bytes(self):
        self.assertEqual(_format_size(512), '512B')

    def test_kilobytes(self):
        self.assertEqual(_format_size(1536), '1.5KB')

    def test_megabytes(self):
        self.assertEqual(_format_size(2 * 1024 * 1024), '2.0MB')


class TestGenerateVideoInvokeParams(unittest.TestCase):
    """generate_video が image_processor へ送信する invoke_params のキー名検証 (Issue #41)"""

    def test_invoke_params_use_camelcase_keys_for_image_processor(self):
        """generate_video は image_processor が期待するキー名（image{n}X/Y/Width/Height, baseImage）で送信する"""
        mock_lambda_client = MagicMock()
        mock_lambda_client.invoke.return_value = {
            'Payload': MagicMock(read=lambda: json.dumps({
                'statusCode': 200,
                'body': json.dumps({
                    'url': 'https://example.com/v.mp4',
                    'filename': 'v.mp4',
                }),
            }).encode())
        }

        with patch.dict(os.environ, {'IMAGE_PROCESSOR_FUNCTION': 'test-fn'}), \
             patch('agent_tools.boto3') as mock_boto3:
            mock_boto3.client.return_value = mock_lambda_client
            generate_video(
                duration=3,
                video_format='MP4',
                image1='test',
                image1_position='100,200',
                image1_size='400x300',
                base_image='white',
            )

        # invoke の Payload から queryStringParameters を取り出す
        kwargs = mock_lambda_client.invoke.call_args.kwargs
        payload = json.loads(kwargs['Payload'])
        params = payload['queryStringParameters']

        # image_processor.parse_image_parameters が期待する camelCase キー
        self.assertEqual(params.get('image1X'), '100')
        self.assertEqual(params.get('image1Y'), '200')
        self.assertEqual(params.get('image1Width'), '400')
        self.assertEqual(params.get('image1Height'), '300')
        self.assertEqual(params.get('baseImage'), 'white')

        # 旧 snake_case キーは送信されない（受信側で無視されデフォルト値で上書きされる原因）
        self.assertNotIn('image1_x', params)
        self.assertNotIn('image1_y', params)
        self.assertNotIn('image1_width', params)
        self.assertNotIn('image1_height', params)
        self.assertNotIn('base_image', params)


class TestComposeImagesBaseOpacity(unittest.TestCase):
    """compose_images が base_opacity を create_composite_image に透過するテスト (Issue #40)"""

    def test_compose_images_passes_base_opacity_through(self):
        """compose_images の base_opacity 引数が create_composite_image(base_opacity=...) まで透過する"""
        # compose_images 内部でインライン import されるため image_fetcher / image_compositor に patch する
        import image_fetcher
        import image_compositor

        mock_image = MagicMock()
        mock_image.size = (2000, 1000)

        composite_mock = MagicMock()
        composite_mock.save = MagicMock()

        with patch.object(image_fetcher, 'fetch_image', return_value=mock_image), \
             patch.object(image_compositor, 'create_composite_image', return_value=composite_mock) as mock_create_composite, \
             patch('agent_tools._get_s3_client') as mock_s3_factory, \
             patch.dict(os.environ, {'S3_RESOURCES_BUCKET': 'test-bucket', 'CLOUDFRONT_DOMAIN': 'cdn.test'}):
            mock_s3_factory.return_value = MagicMock()

            compose_images(
                image1='test',
                image1_position='中央',
                image1_size='400x400',
                base_image='white',
                base_opacity=42,
            )

            # create_composite_image が base_opacity=42 を受け取って呼ばれていること
            self.assertTrue(mock_create_composite.called)
            _, kwargs = mock_create_composite.call_args
            self.assertEqual(kwargs.get('base_opacity'), 42)


if __name__ == '__main__':
    unittest.main()
