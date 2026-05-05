"""
画像合成デフォルト値の一元管理ユーティリティ（Issue #58 / Requirement 21）

frontend/public/composite-default.json を CDK ビルド時に同梱した
lambda/python/composite_defaults.json から読み込み、API 側のデフォルト値解決に使う。

詳細仕様は .kiro/specs/image-composition/design.md §6 を参照。
"""

import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# JSON 読み込み失敗時のハードコードフォールバック値（design §6.9）
# 注: フォールバック時の baseImage は AC 21.8 の新仕様 #000000 ではなく既存挙動の
#     transparent を維持する。これは「JSON配信が壊れた状態で API を呼ぶ既存利用者の
#     結果画像が突然変わる」リスクを避けるための意図的な差異。詳細は design §6.9。
HARDCODED_FALLBACK: Dict[str, Any] = {
    "version": "1.0",
    "system_default": {
        "canvas": {"width": 1920, "height": 1080},
        "baseImage": "transparent",
        "baseOpacity": 100,
        "image_placement": {
            "single": {
                "image1": {"x": 1700, "y": 96, "width": 200, "height": 200}
            },
            "double": {
                "image1": {"x": 1700, "y": 96, "width": 200, "height": 200},
                "image2": {"x": 600, "y": 400, "width": 300, "height": 300}
            },
            "triple": {
                "image1": {"x": 1700, "y": 96, "width": 200, "height": 200},
                "image2": {"x": 600, "y": 400, "width": 300, "height": 300},
                "image3": {"x": 1520, "y": 700, "width": 300, "height": 300}
            }
        },
        "text_placeholders": {
            "text1": {"placeholder": "", "x": 0, "y": 0, "font_size": 48},
            "text2": {"placeholder": "", "x": 0, "y": 0, "font_size": 48},
            "text3": {"placeholder": "", "x": 0, "y": 0, "font_size": 48}
        },
        "video": {"format": "MP4", "duration": 3}
    },
    "presets": {}
}

_CACHED_DEFAULTS: Optional[Dict[str, Any]] = None


def _get_defaults_path() -> Path:
    return Path(__file__).parent / 'composite_defaults.json'


def load_defaults() -> Dict[str, Any]:
    """composite_defaults.json を読み込む。モジュールレベルキャッシュあり。
    読み込み失敗時は HARDCODED_FALLBACK を返す。
    """
    global _CACHED_DEFAULTS
    if _CACHED_DEFAULTS is not None:
        return _CACHED_DEFAULTS

    try:
        path = _get_defaults_path()
        with open(path, 'r', encoding='utf-8') as f:
            _CACHED_DEFAULTS = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError) as e:
        logger.warning(f"composite_defaults.json読み込み失敗、ハードコード値使用: {e}")
        _CACHED_DEFAULTS = HARDCODED_FALLBACK

    return _CACHED_DEFAULTS


def reset_cache() -> None:
    """テスト用にキャッシュをリセット。"""
    global _CACHED_DEFAULTS
    _CACHED_DEFAULTS = None


def determine_image_mode(query_params: Dict[str, Any]) -> str:
    """image2 / image3 の有無のみから mode を判定（design §6.5）。
    テキスト有無は判定に影響しない。

    Returns: 'single' | 'double' | 'triple'
    """
    has_image2 = bool(query_params.get('image2'))
    has_image3 = bool(query_params.get('image3'))

    if has_image3:
        return 'triple'
    elif has_image2:
        return 'double'
    else:
        return 'single'


def get_image_default(mode: str, image_key: str) -> Dict[str, int]:
    """指定 mode / image_key のデフォルト座標 dict を返す。

    Args:
        mode: 'single' | 'double' | 'triple'
        image_key: 'image1' | 'image2' | 'image3'
    """
    sd = load_defaults()['system_default']
    return sd['image_placement'][mode][image_key]


def get_base_image_default() -> str:
    return load_defaults()['system_default']['baseImage']


def get_base_opacity_default() -> int:
    return load_defaults()['system_default']['baseOpacity']


def get_video_format_default() -> str:
    return load_defaults()['system_default']['video']['format']


def get_video_duration_default() -> int:
    return load_defaults()['system_default']['video']['duration']


def get_text_placeholder(text_key: str) -> Dict[str, Any]:
    """text_key ('text1' / 'text2' / 'text3') の placeholder と座標初期値を返す。"""
    return load_defaults()['system_default']['text_placeholders'][text_key]


def get_canvas_default() -> Dict[str, int]:
    return load_defaults()['system_default']['canvas']
