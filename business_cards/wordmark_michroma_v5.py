"""StancePro lockup wordmark — Michroma Bold Custom v5 (equal STANCE/PRO sizing)."""
from __future__ import annotations

import math
from functools import lru_cache
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent

# Brand colors (match generate_cards / generate_posters)
NAVY = (26, 46, 97)
WHITE = (255, 255, 255)
BLUE_LIGHT = (0, 122, 230)
BLUE_DARK = (63, 169, 245)


@lru_cache(maxsize=4)
def _logo_content_box(logo_path: str) -> tuple[int, int, int, int]:
    """Return (native_h, native_w, content_h, content_w)."""
    img = Image.open(logo_path)
    native_h, native_w = img.height, img.width
    bbox = img.getbbox()
    if not bbox:
        return native_h, native_w, native_h, native_w
    return native_h, native_w, bbox[3] - bbox[1], bbox[2] - bbox[0]


def wordmark_height_for_hex_bbox(
    hex_bbox: tuple[int, int, int, int],
    logo_path: Path,
) -> int:
    """Wordmark cap-height = hex side length for the rendered logo bbox."""
    native_h, native_w, content_h, content_w = _logo_content_box(str(logo_path))
    rendered_h = hex_bbox[3] - hex_bbox[1]
    rendered_w = hex_bbox[2] - hex_bbox[0]
    scale_h = rendered_h / native_h
    scale_w = rendered_w / native_w
    body_h = content_h * scale_h
    body_w = content_w * scale_w
    # Pointy-top regular hex: height = 2s, width = sqrt(3)*s
    side_from_h = body_h / 2.0
    side_from_w = body_w / math.sqrt(3)
    hex_side = min(side_from_h, side_from_w)
    return max(1, int(round(hex_side)))


def wordmark_height_for_hex(rendered_hex_h: int, logo_path: Path) -> int:
    """Convenience when only logo height is known (square scaled logo)."""
    img = Image.open(logo_path)
    rendered_w = int(round(img.width * rendered_hex_h / img.height))
    return wordmark_height_for_hex_bbox((0, 0, rendered_w, rendered_hex_h), logo_path)


@lru_cache(maxsize=1)
def _v5_art() -> tuple:
    from build_michroma_bold_wordmark import VARIANTS, build_wordmark_art, load_michroma

    v5 = next(v for v in VARIANTS if v.slug == "v5_ultra")
    font = load_michroma()
    return build_wordmark_art(font, v5)


def _scale_ink_to_height(
    wm: Image.Image,
    target_h: int,
    max_w: int | None,
) -> Image.Image:
    """Crop to ink bbox and scale so cap-height equals target_h."""
    bbox = wm.getbbox()
    if not bbox:
        return wm
    wm = wm.crop(bbox)
    scale = target_h / wm.height
    new_w = max(1, int(round(wm.width * scale)))
    new_h = target_h
    if max_w and new_w > max_w:
        scale = max_w / wm.width
        new_w = max_w
        new_h = max(1, int(round(wm.height * scale)))
    return wm.resize((new_w, new_h), Image.LANCZOS)


def render_wordmark(
    *,
    dark: bool,
    target_h: int,
    max_w: int | None = None,
    supersample: int = 2,
) -> Image.Image:
    """Render the geometric STANCEPRO wordmark (business_cards/wordmark_stancepro.py),
    transparent, scaled so the ink height == target_h (bounded by max_w)."""
    import wordmark_stancepro as ws

    ss = max(1, supersample)
    internal_h = max(1, target_h * ss)
    internal_max_w = max_w * ss if max_w else None

    wm = ws.render(dark=dark, target_w=2600, transparent=True)
    wm = _scale_ink_to_height(wm, internal_h, internal_max_w)
    if ss > 1:
        wm = _scale_ink_to_height(wm, target_h, max_w)
    return wm


def paste_wordmark(
    base: Image.Image,
    wordmark: Image.Image,
    left_x: int,
    center_y: int,
) -> tuple[int, int, int, int]:
    """Paste pre-sized wordmark without re-scaling."""
    y = center_y - wordmark.height // 2
    base.paste(wordmark, (left_x, y), wordmark)
    return (left_x, y, left_x + wordmark.width, y + wordmark.height)
