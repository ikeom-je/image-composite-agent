"""
Agent Tools のユニットテスト

テスト対象:
- 座標変換ロジック（resolve_position, resolve_size）
- get_help ツール
- _format_size ヘルパー
"""

import unittest
import os
import sys
from unittest.mock import patch, MagicMock

# Lambda関数のパスを追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../lambda/python'))

from agent_prompts import resolve_position, resolve_size, POSITION_MAP, DEFAULT_SIZE

# PILがない環境でもテスト可能にする
with patch.dict('sys.modules', {'PIL': MagicMock(), 'PIL.Image': MagicMock()}):
    from agent_tools import get_help, _format_size


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


if __name__ == '__main__':
    unittest.main()
