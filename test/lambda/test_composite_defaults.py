"""
composite_defaults モジュールのユニットテスト（Issue #58 / Requirement 21）
"""

import unittest
import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

sys.path.append(os.path.join(os.path.dirname(__file__), '../../lambda/python'))

import composite_defaults
from composite_defaults import (
    load_defaults,
    reset_cache,
    determine_image_mode,
    get_image_default,
    get_base_image_default,
    get_base_opacity_default,
    get_video_format_default,
    get_video_duration_default,
    get_text_placeholder,
    get_canvas_default,
    HARDCODED_FALLBACK,
)


SAMPLE_JSON = {
    "version": "1.0",
    "system_default": {
        "canvas": {"width": 1920, "height": 1080},
        "baseImage": "#000000",
        "baseOpacity": 100,
        "image_placement": {
            "single": {"image1": {"x": 1700, "y": 96, "width": 200, "height": 200}},
            "double": {
                "image1": {"x": 1700, "y": 96, "width": 200, "height": 200},
                "image2": {"x": 600, "y": 400, "width": 300, "height": 300},
            },
            "triple": {
                "image1": {"x": 1700, "y": 96, "width": 200, "height": 200},
                "image2": {"x": 600, "y": 400, "width": 300, "height": 300},
                "image3": {"x": 1520, "y": 700, "width": 300, "height": 300},
            },
        },
        "text_placeholders": {
            "text1": {"placeholder": "LIVE", "x": 1800, "y": 300, "font_size": 40},
            "text2": {"placeholder": "Telop text on the bottom", "x": 300, "y": 900, "font_size": 50},
            "text3": {"placeholder": "message for the program", "x": 300, "y": 100, "font_size": 40},
        },
        "video": {"format": "MP4", "duration": 3},
    },
    "presets": {},
}


class TestLoadDefaults(unittest.TestCase):
    def setUp(self):
        reset_cache()

    def tearDown(self):
        reset_cache()

    def _patch_path(self, json_path):
        return patch.object(composite_defaults, '_get_defaults_path', return_value=Path(json_path))

    def test_load_success_returns_json_content(self):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8') as f:
            json.dump(SAMPLE_JSON, f)
            tmp = f.name
        try:
            with self._patch_path(tmp):
                result = load_defaults()
            self.assertEqual(result['system_default']['baseImage'], '#000000')
            self.assertEqual(result['system_default']['video']['format'], 'MP4')
        finally:
            os.unlink(tmp)

    def test_load_caches_result(self):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8') as f:
            json.dump(SAMPLE_JSON, f)
            tmp = f.name
        try:
            with self._patch_path(tmp) as p:
                load_defaults()
                load_defaults()
                load_defaults()
                self.assertEqual(p.call_count, 1)
        finally:
            os.unlink(tmp)

    def test_load_file_not_found_falls_back(self):
        with self._patch_path('/nonexistent/path/composite_defaults.json'):
            result = load_defaults()
        self.assertIs(result, HARDCODED_FALLBACK)
        self.assertEqual(result['system_default']['baseImage'], 'transparent',
                         'フォールバック時は既存挙動 (transparent) を維持する（design §6.9）')

    def test_load_invalid_json_falls_back(self):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8') as f:
            f.write('{ invalid json content')
            tmp = f.name
        try:
            with self._patch_path(tmp):
                result = load_defaults()
            self.assertIs(result, HARDCODED_FALLBACK)
        finally:
            os.unlink(tmp)


class TestDetermineImageMode(unittest.TestCase):
    def test_only_image1_returns_single(self):
        self.assertEqual(determine_image_mode({'image1': 'test'}), 'single')

    def test_image1_and_image2_returns_double(self):
        self.assertEqual(determine_image_mode({'image1': 'a', 'image2': 'b'}), 'double')

    def test_all_three_returns_triple(self):
        self.assertEqual(determine_image_mode({'image1': 'a', 'image2': 'b', 'image3': 'c'}), 'triple')

    def test_text_presence_does_not_affect_mode(self):
        params = {'image1': 'a', 'text1': 'LIVE'}
        self.assertEqual(determine_image_mode(params), 'single',
                         'テキスト有無は image_placement モード判定に影響しない（AC 21.3）')

    def test_empty_image2_treated_as_absent(self):
        self.assertEqual(determine_image_mode({'image1': 'a', 'image2': ''}), 'single')

    def test_image3_only_returns_triple(self):
        self.assertEqual(determine_image_mode({'image3': 'c'}), 'triple')


class TestGetterFunctions(unittest.TestCase):
    def setUp(self):
        reset_cache()
        self._tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8')
        json.dump(SAMPLE_JSON, self._tmp)
        self._tmp.close()
        self._patcher = patch.object(composite_defaults, '_get_defaults_path', return_value=Path(self._tmp.name))
        self._patcher.start()

    def tearDown(self):
        self._patcher.stop()
        os.unlink(self._tmp.name)
        reset_cache()

    def test_get_image_default_single_image1(self):
        result = get_image_default('single', 'image1')
        self.assertEqual(result, {"x": 1700, "y": 96, "width": 200, "height": 200})

    def test_get_image_default_triple_image3(self):
        result = get_image_default('triple', 'image3')
        self.assertEqual(result, {"x": 1520, "y": 700, "width": 300, "height": 300})

    def test_get_base_image_default(self):
        self.assertEqual(get_base_image_default(), '#000000')

    def test_get_base_opacity_default(self):
        self.assertEqual(get_base_opacity_default(), 100)

    def test_get_video_format_default(self):
        self.assertEqual(get_video_format_default(), 'MP4')

    def test_get_video_duration_default(self):
        self.assertEqual(get_video_duration_default(), 3)

    def test_get_text_placeholder_text1(self):
        result = get_text_placeholder('text1')
        self.assertEqual(result['placeholder'], 'LIVE')
        self.assertEqual(result['x'], 1800)
        self.assertEqual(result['font_size'], 40)

    def test_get_canvas_default(self):
        self.assertEqual(get_canvas_default(), {"width": 1920, "height": 1080})


class TestHardcodedFallbackShape(unittest.TestCase):
    """フォールバック値が consumer コードと構造的に互換であることを保証（design §6.9）"""

    def test_fallback_has_all_required_top_keys(self):
        for key in ['version', 'system_default', 'presets']:
            self.assertIn(key, HARDCODED_FALLBACK)

    def test_fallback_image_placement_has_all_modes(self):
        ip = HARDCODED_FALLBACK['system_default']['image_placement']
        for mode in ['single', 'double', 'triple']:
            self.assertIn(mode, ip)

    def test_fallback_text_placeholders_keep_keys(self):
        tp = HARDCODED_FALLBACK['system_default']['text_placeholders']
        for key in ['text1', 'text2', 'text3']:
            self.assertIn(key, tp)
            self.assertIn('placeholder', tp[key])
            self.assertIn('x', tp[key])
            self.assertIn('y', tp[key])
            self.assertIn('font_size', tp[key])

    def test_fallback_baseImage_is_transparent_not_black(self):
        self.assertEqual(HARDCODED_FALLBACK['system_default']['baseImage'], 'transparent',
                         '意図的に既存挙動を維持（design §6.9）')


if __name__ == '__main__':
    unittest.main()
