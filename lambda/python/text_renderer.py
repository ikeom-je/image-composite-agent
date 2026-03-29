"""
テキスト描画エンジン

Pillow ImageDraw ベースのテキストオーバーレイ描画。
日本語フォント対応、折り返し制御、背景矩形描画をサポート。
"""

import os
import logging
from typing import List, Tuple, Optional
from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

FONT_SEARCH_PATHS = [
    os.path.join(os.path.dirname(__file__), 'fonts'),
    '/opt/fonts',
]

FONT_FILES = {
    'NotoSansJP': 'NotoSansJP-Regular.ttf',
    'NotoSans': 'NotoSansJP-Regular.ttf',
}


def _find_font_path(font_family: str) -> Optional[str]:
    """フォントファイルのパスを検索する"""
    filename = FONT_FILES.get(font_family, FONT_FILES.get('NotoSansJP'))
    for search_path in FONT_SEARCH_PATHS:
        full_path = os.path.join(search_path, filename)
        if os.path.exists(full_path):
            return full_path
    return None


def load_font(font_family: str = 'NotoSansJP', font_size: int = 48) -> ImageFont.FreeTypeFont:
    """指定フォントをロードする。見つからない場合はデフォルトフォントにフォールバック"""
    font_path = _find_font_path(font_family)
    if font_path:
        try:
            return ImageFont.truetype(font_path, font_size)
        except Exception as e:
            logger.warning(f"Failed to load font {font_path}: {e}")
    logger.warning(f"Font '{font_family}' not found, using default")
    try:
        return ImageFont.load_default(size=font_size)
    except TypeError:
        return ImageFont.load_default()


def calculate_text_bbox(text: str, font: ImageFont.FreeTypeFont) -> Tuple[int, int]:
    """テキストのバウンディングボックスサイズ (width, height) を計算する"""
    dummy = Image.new('RGBA', (1, 1))
    draw = ImageDraw.Draw(dummy)
    bbox = draw.textbbox((0, 0), text, font=font)
    return (bbox[2] - bbox[0], bbox[3] - bbox[1])


def wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int) -> List[str]:
    """テキストを指定幅で折り返す（文字単位）"""
    lines = []
    for paragraph in text.split('\n'):
        if not paragraph:
            lines.append('')
            continue
        current_line = ''
        for char in paragraph:
            test_line = current_line + char
            w, _ = calculate_text_bbox(test_line, font)
            if w > max_width and current_line:
                lines.append(current_line)
                current_line = char
            else:
                current_line = test_line
        if current_line:
            lines.append(current_line)
    return lines if lines else ['']


def _parse_color(color_str: str) -> Tuple[int, ...]:
    """カラー文字列（#RRGGBB or #RRGGBBAA）をタプルに変換する"""
    color_str = color_str.strip().lstrip('#')
    if len(color_str) == 6:
        r = int(color_str[0:2], 16)
        g = int(color_str[2:4], 16)
        b = int(color_str[4:6], 16)
        return (r, g, b)
    if len(color_str) == 8:
        r = int(color_str[0:2], 16)
        g = int(color_str[2:4], 16)
        b = int(color_str[4:6], 16)
        a = int(color_str[6:8], 16)
        return (r, g, b, a)
    logger.warning(f"Invalid color format '{color_str}', using white. Accepted: #RRGGBB or #RRGGBBAA")
    return (255, 255, 255)


def render_text_overlay(
    image: Image.Image,
    text: str,
    x: int = 0,
    y: int = 0,
    font_size: int = 48,
    font_color: str = '#FFFFFF',
    font_family: str = 'NotoSansJP',
    bg_color: Optional[str] = None,
    bg_opacity: float = 0.7,
    wrap: bool = False,
    max_width: Optional[int] = None,
    padding: int = 10,
) -> Image.Image:
    """画像にテキストオーバーレイを描画する"""
    if not text:
        return image
    if image.mode != 'RGBA':
        image = image.convert('RGBA')

    font = load_font(font_family, font_size)

    # テキストの行分割
    if wrap and max_width:
        lines = wrap_text(text, font, max_width)
    else:
        lines = text.split('\n')

    # テキスト全体のサイズ計算
    line_sizes = [calculate_text_bbox(line, font) for line in lines]
    total_width = max(w for w, _ in line_sizes) if line_sizes else 0
    line_height = max(h for _, h in line_sizes) if line_sizes else font_size
    total_height = line_height * len(lines)

    # 背景矩形の描画
    if bg_color:
        bg_rgb = _parse_color(bg_color)
        bg_alpha = int(255 * bg_opacity)
        bg_layer = Image.new('RGBA', image.size, (0, 0, 0, 0))
        bg_draw = ImageDraw.Draw(bg_layer)
        bg_draw.rectangle(
            [x - padding, y - padding,
             x + total_width + padding, y + total_height + padding],
            fill=(*bg_rgb[:3], bg_alpha),
        )
        image = Image.alpha_composite(image, bg_layer)

    # テキストの描画
    txt_layer = Image.new('RGBA', image.size, (0, 0, 0, 0))
    txt_draw = ImageDraw.Draw(txt_layer)
    color = _parse_color(font_color)
    if len(color) == 3:
        color = (*color, 255)

    current_y = y
    for line in lines:
        txt_draw.text((x, current_y), line, font=font, fill=color)
        current_y += line_height

    image = Image.alpha_composite(image, txt_layer)
    return image
