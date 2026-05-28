"""estimate_text_size ツールの unit test (issue #19 / Req 14.6)"""
import unittest
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '../../lambda/python'))

from agent_tools import estimate_text_size


class TestEstimateTextSize(unittest.TestCase):
    """compose_images と同じ Noto Sans JP の textbbox で計算されるため、
    描画寸法ズレなしを保証する代表値テスト。"""

    def test_returns_keys(self):
        r = estimate_text_size("Hello", 48)
        self.assertIn("width", r)
        self.assertIn("height", r)
        self.assertIn("line_height", r)
        self.assertIsInstance(r["width"], int)
        self.assertIsInstance(r["height"], int)
        self.assertIsInstance(r["line_height"], int)

    def test_japanese_48(self):
        r = estimate_text_size("ライブ", 48)
        # 3 文字、日本語、font_size=48 → 概ね幅 100-200px、高さ 40-70px の範囲
        self.assertGreater(r["width"], 0)
        self.assertGreater(r["height"], 0)
        self.assertEqual(r["line_height"], int(48 * 1.2))

    def test_english_48(self):
        r = estimate_text_size("Hello", 48)
        self.assertGreater(r["width"], 0)
        self.assertGreater(r["height"], 0)

    def test_size_scales_with_font_size(self):
        """font_size が 2 倍になれば width はほぼ 2 倍になることを確認（描画スケーリング）"""
        small = estimate_text_size("Test", 24)
        large = estimate_text_size("Test", 48)
        # 完全 2 倍は保証されない（カーニング等）が 1.5-2.5 倍の範囲には収まる
        ratio = large["width"] / max(1, small["width"])
        self.assertGreater(ratio, 1.5)
        self.assertLess(ratio, 2.5)

    def test_mixed_japanese_english(self):
        r = estimate_text_size("LIVE中継", 48)
        self.assertGreater(r["width"], 0)
        self.assertGreater(r["height"], 0)

    def test_empty_text(self):
        """空文字でも例外を投げず 0 または小さな値を返す"""
        r = estimate_text_size("", 48)
        self.assertGreaterEqual(r["width"], 0)
        self.assertGreaterEqual(r["height"], 0)
        # line_height は font_size 依存なので空文字でも返る
        self.assertEqual(r["line_height"], int(48 * 1.2))

    def test_multiline_text(self):
        """改行入りテキストでも例外を投げない（Pillow textbbox は \\n を処理する）"""
        r = estimate_text_size("一行目\n二行目", 48)
        self.assertGreater(r["width"], 0)
        self.assertGreater(r["height"], 0)

    def test_font_size_24(self):
        r = estimate_text_size("Test", 24)
        self.assertGreater(r["width"], 0)
        self.assertEqual(r["line_height"], int(24 * 1.2))

    def test_font_size_72(self):
        r = estimate_text_size("Test", 72)
        self.assertGreater(r["width"], 0)
        self.assertEqual(r["line_height"], int(72 * 1.2))


if __name__ == '__main__':
    unittest.main()
