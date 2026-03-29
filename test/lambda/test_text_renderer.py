"""テキスト描画エンジンのユニットテスト"""
import unittest
import sys
import os
from PIL import Image

sys.path.append(os.path.join(os.path.dirname(__file__), '../../lambda/python'))

from text_renderer import (
    load_font,
    calculate_text_bbox,
    render_text_overlay,
    wrap_text,
)


class TestTextRenderer(unittest.TestCase):
    def setUp(self):
        self.canvas = Image.new('RGBA', (1920, 1080), (0, 0, 0, 0))

    def test_load_font_default(self):
        font = load_font('NotoSansJP', 48)
        self.assertIsNotNone(font)

    def test_load_font_fallback(self):
        font = load_font('NonExistentFont', 48)
        self.assertIsNotNone(font)

    def test_calculate_text_bbox(self):
        font = load_font('NotoSansJP', 48)
        bbox = calculate_text_bbox("Hello", font)
        self.assertGreater(bbox[0], 0)
        self.assertGreater(bbox[1], 0)

    def test_calculate_text_bbox_japanese(self):
        font = load_font('NotoSansJP', 48)
        bbox = calculate_text_bbox("こんにちは", font)
        self.assertGreater(bbox[0], 0)
        self.assertGreater(bbox[1], 0)

    def test_render_text_no_background(self):
        result = render_text_overlay(
            self.canvas.copy(), text="Hello World",
            x=100, y=100, font_size=48, font_color="#FFFFFF",
        )
        self.assertEqual(result.size, (1920, 1080))
        self.assertEqual(result.mode, 'RGBA')

    def test_render_text_with_background(self):
        result = render_text_overlay(
            self.canvas.copy(), text="テロップ",
            x=100, y=100, font_size=48, font_color="#FFFFFF",
            bg_color="#000000", bg_opacity=0.7, padding=10,
        )
        self.assertEqual(result.size, (1920, 1080))

    def test_render_text_wrap(self):
        result = render_text_overlay(
            self.canvas.copy(),
            text="これは非常に長いテキストで折り返しが必要なケースのテストです",
            x=100, y=100, font_size=48, font_color="#FFFFFF",
            wrap=True, max_width=400,
        )
        self.assertEqual(result.size, (1920, 1080))

    def test_render_text_no_wrap(self):
        result = render_text_overlay(
            self.canvas.copy(), text="1行テキスト",
            x=100, y=100, font_size=48, font_color="#FFFFFF", wrap=False,
        )
        self.assertEqual(result.size, (1920, 1080))

    def test_wrap_text(self):
        font = load_font('NotoSansJP', 48)
        lines = wrap_text("ABCDEFGHIJ KLMNOPQRSTUVWXYZ", font, 200)
        self.assertGreater(len(lines), 1)

    def test_wrap_text_short(self):
        font = load_font('NotoSansJP', 48)
        lines = wrap_text("AB", font, 1000)
        self.assertEqual(len(lines), 1)

    def test_render_text_font_color(self):
        result = render_text_overlay(
            self.canvas.copy(), text="Red Text",
            x=100, y=100, font_size=48, font_color="#FF0000",
        )
        self.assertEqual(result.mode, 'RGBA')

    def test_render_empty_text(self):
        result = render_text_overlay(
            self.canvas.copy(), text="",
            x=100, y=100, font_size=48, font_color="#FFFFFF",
        )
        self.assertEqual(result.size, (1920, 1080))


if __name__ == '__main__':
    unittest.main()
