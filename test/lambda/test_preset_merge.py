"""compose_images の preset 引数 + merge ロジックの unit test (issue #59 / Req)

α 方針: ユーザー明示引数が常に勝つ。preset は default のフィールドだけを埋める。
未知 preset 名はエラー dict を返してフォールバック。
"""
import json
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.append(os.path.join(os.path.dirname(__file__), '../../lambda/python'))

from agent_tools import (
    _preset_to_compose_kwargs,
    _resolve_preset,
    _COMPOSE_FUNCTION_DEFAULTS,
    list_presets,
)


SAMPLE_PRESETS = {
    "live": {
        "description": "ライブ配信用",
        "baseImage": "#000000",
        "baseOpacity": 100,
        "image_placement": {
            "image1": {"x": 760, "y": 290, "width": 400, "height": 400}
        },
        "text_overlays": {
            "text1": {
                "text": "LIVE",
                "position": "1800,80",
                "font_size": 56,
                "font_color": "#FF0000",
                "bg_color": None,
            }
        },
    },
    "subtitle": {
        "description": "字幕オンリー",
        "baseImage": "transparent",
        "baseOpacity": 100,
        "image_placement": {},
        "text_overlays": {
            "text1": {
                "text": "字幕テキスト",
                "position": "中央下",
                "font_size": 48,
                "font_color": "#FFFFFF",
                "bg_color": "#000000",
                "bg_opacity": 0.7,
            }
        },
    },
}


class TestPresetToComposeKwargs(unittest.TestCase):
    def test_live_preset_conversion(self):
        kw = _preset_to_compose_kwargs(SAMPLE_PRESETS["live"])
        self.assertEqual(kw["base_image"], "#000000")
        self.assertEqual(kw["base_opacity"], 100)
        self.assertEqual(kw["image1_position"], "760,290")
        self.assertEqual(kw["image1_size"], "400x400")
        self.assertEqual(kw["text1"], "LIVE")
        self.assertEqual(kw["text1_position"], "1800,80")
        self.assertEqual(kw["text1_font_size"], 56)
        self.assertEqual(kw["text1_font_color"], "#FF0000")
        # bg_color is None → should not be in kwargs
        self.assertNotIn("text1_bg_color", kw)

    def test_subtitle_preset_with_bg(self):
        kw = _preset_to_compose_kwargs(SAMPLE_PRESETS["subtitle"])
        self.assertEqual(kw["text1_bg_color"], "#000000")
        self.assertEqual(kw["text1_bg_opacity"], 0.7)
        # No image1 in placement → no image1_position
        self.assertNotIn("image1_position", kw)


def _mock_defaults(presets_dict):
    """_load_composite_defaults() をモックしてカスタム presets を返す"""
    return {"presets": presets_dict}


class TestResolvePreset(unittest.TestCase):
    def _current_defaults(self, **overrides):
        """compose_images の関数 default をベースに current dict を作る"""
        return {**_COMPOSE_FUNCTION_DEFAULTS, **overrides}

    def test_no_preset_returns_unchanged(self):
        current = self._current_defaults()
        r = _resolve_preset("", current)
        self.assertTrue(r["ok"])
        self.assertEqual(r["merged"], current)

    @patch("agent_tools._load_composite_defaults")
    def test_unknown_preset_error(self, mock_load):
        mock_load.return_value = _mock_defaults(SAMPLE_PRESETS)
        r = _resolve_preset("nonexistent", self._current_defaults())
        self.assertFalse(r["ok"])
        self.assertIn("unknown preset", r["error"])
        self.assertIn("live", r["error"])
        self.assertIn("subtitle", r["error"])

    @patch("agent_tools._load_composite_defaults")
    def test_live_preset_fills_defaults(self, mock_load):
        mock_load.return_value = _mock_defaults(SAMPLE_PRESETS)
        # user provides image1 explicitly but leaves other params at default
        current = self._current_defaults()
        r = _resolve_preset("live", current)
        self.assertTrue(r["ok"])
        m = r["merged"]
        self.assertEqual(m["base_image"], "#000000")   # preset から
        self.assertEqual(m["image1_position"], "760,290")  # preset から
        self.assertEqual(m["image1_size"], "400x400")  # preset と default が同じ値
        self.assertEqual(m["text1"], "LIVE")            # preset から
        self.assertEqual(m["text1_font_size"], 56)      # preset から（default 48）

    @patch("agent_tools._load_composite_defaults")
    def test_user_override_wins_alpha_policy(self, mock_load):
        """α 方針: user が明示した値は preset 値より優先される"""
        mock_load.return_value = _mock_defaults(SAMPLE_PRESETS)
        # user が text1 を明示的に「緊急」と設定 → preset の "LIVE" を上書きせず維持
        current = self._current_defaults()
        current["text1"] = "緊急"  # user explicit
        current["image1_position"] = "100,200"  # user explicit
        r = _resolve_preset("live", current)
        m = r["merged"]
        self.assertEqual(m["text1"], "緊急")            # user 値が勝つ
        self.assertEqual(m["image1_position"], "100,200")  # user 値が勝つ
        # 一方 user が触っていない base_image は preset 値で埋まる
        self.assertEqual(m["base_image"], "#000000")

    @patch("agent_tools._load_composite_defaults")
    def test_subtitle_preset_no_image_placement(self, mock_load):
        """字幕 preset は image_placement が空 → image1 系は default のまま"""
        mock_load.return_value = _mock_defaults(SAMPLE_PRESETS)
        r = _resolve_preset("subtitle", self._current_defaults())
        m = r["merged"]
        self.assertEqual(m["base_image"], "transparent")
        self.assertEqual(m["text1"], "字幕テキスト")
        self.assertEqual(m["text1_bg_color"], "#000000")
        # image1_position は default 維持
        self.assertEqual(m["image1_position"], "左上")


class TestListPresets(unittest.TestCase):
    @patch("agent_tools._load_composite_defaults")
    def test_returns_name_and_description(self, mock_load):
        mock_load.return_value = _mock_defaults(SAMPLE_PRESETS)
        r = list_presets()
        names = [p["name"] for p in r["presets"]]
        self.assertIn("live", names)
        self.assertIn("subtitle", names)
        live = next(p for p in r["presets"] if p["name"] == "live")
        self.assertEqual(live["description"], "ライブ配信用")

    @patch("agent_tools._load_composite_defaults")
    def test_empty_presets(self, mock_load):
        mock_load.return_value = {"presets": {}}
        r = list_presets()
        self.assertEqual(r["presets"], [])


if __name__ == "__main__":
    unittest.main()
