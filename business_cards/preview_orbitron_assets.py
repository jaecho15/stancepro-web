#!/usr/bin/env python3
"""One-off previews: business card + poster with alternate wordmark fonts."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import generate_cards as gc
import generate_posters as gp

COMPARE_ROOT = HERE / "merch/font_compare"
FONT_DIR = COMPARE_ROOT / "google_fonts"
PREVIEW_ROOT = COMPARE_ROOT / "previews"
FONTS: dict[str, tuple[Path, int | None]] = {
    "microgramma": (FONT_DIR / "MicrogrammaDExtendedBold.otf", None),
}
FONT_FILE_TAGS = {
    "microgramma": "microgramma_bold",
}
PNG_WORDMARKS: dict[str, dict[str, Path | str]] = {
    "michroma_bold_custom": {
        "tag": "michroma_bold_custom",
        "label": "Michroma Bold Custom (v3)",
        "card": COMPARE_ROOT / "michroma_bold_custom/png/v3_premium_wordmark_light.png",
        "poster": COMPARE_ROOT / "michroma_bold_custom/png/v3_premium_wordmark_dark.png",
    },
    "michroma_bold_v4": {
        "tag": "michroma_bold_v4",
        "label": "Michroma Bold Custom (v4)",
        "card": COMPARE_ROOT / "michroma_bold_custom/png/v4_heavy_wordmark_light.png",
        "poster": COMPARE_ROOT / "michroma_bold_custom/png/v4_heavy_wordmark_dark.png",
    },
    "michroma_bold_v5": {
        "tag": "michroma_bold_v5",
        "label": "Michroma Bold Custom (v5)",
        "card": COMPARE_ROOT / "michroma_bold_custom/png/v5_ultra_wordmark_light.png",
        "poster": COMPARE_ROOT / "michroma_bold_custom/png/v5_ultra_wordmark_dark.png",
    },
}
OVERVIEW_ROWS = [
    ("Michroma Bold Custom (v5)", "michroma_bold_v5"),
    ("Microgramma Bold", "microgramma_bold"),
]
OUT_DIR = COMPARE_ROOT
OUT_DIR.mkdir(parents=True, exist_ok=True)


def preview_dir_for(tag: str) -> Path:
    path = PREVIEW_ROOT / tag
    path.mkdir(parents=True, exist_ok=True)
    return path


def load_font(font_path: Path, size: int, wght: int | None = None) -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(str(font_path), size)
    if wght is not None and hasattr(font, "set_variation_by_axes"):
        font.set_variation_by_axes([wght])
    return font


def fit_font_size(font_path: Path, max_w: int, wght: int | None = None) -> int:
    """Match font-compare sheets: largest size whose natural width fits max_w."""
    lo, hi = 12, 360
    best = lo
    while lo <= hi:
        mid = (lo + hi) // 2
        fnt = load_font(font_path, mid, wght)
        if fnt.getlength("STANCEPRO") <= max_w:
            best = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return best


def render_font_wordmark(
    font_path: Path,
    size: int,
    stance: tuple[int, int, int],
    pro: tuple[int, int, int],
    wght: int | None = None,
) -> Image.Image:
    """Render STANCEPRO at natural aspect ratio (no horizontal squash/stretch)."""
    fnt = load_font(font_path, size, wght)
    tmp = Image.new("RGBA", (2000, 400), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tmp)
    y = 0
    draw.text((0, y), "STANCE", font=fnt, fill=stance + (255,))
    bb1 = draw.textbbox((0, y), "STANCE", font=fnt)
    draw.text((bb1[2], y), "PRO", font=fnt, fill=pro + (255,))
    bb2 = draw.textbbox((bb1[2], y), "PRO", font=fnt)
    bbox = (0, min(bb1[1], bb2[1]), bb2[2], max(bb1[3], bb2[3]))
    return tmp.crop(bbox)


def fit_png_wordmark(wm_path: Path, max_w: int) -> Image.Image:
    """Resize a transparent PNG wordmark to fit max_w at natural aspect ratio."""
    wm = Image.open(wm_path).convert("RGBA")
    if wm.width <= max_w:
        return wm
    scale = max_w / wm.width
    new_h = max(1, int(round(wm.height * scale)))
    return wm.resize((max_w, new_h), Image.LANCZOS)


def replace_card_front_png_wordmark(
    card: Image.Image,
    dark: bool,
    wm_path: Path,
) -> Image.Image:
    card = card.convert("RGBA")
    wm_bbox, wm_center_y = card_front_lockup(dark)
    bg = gc.NAVY if dark else gc.WHITE
    muted = gc.MUTED_WHITE if dark else gc.MUTED_NAVY
    png_w = wm_bbox[2] - wm_bbox[0]
    wm = fit_png_wordmark(wm_path, png_w)

    draw = ImageDraw.Draw(card)
    new_bbox = (
        wm_bbox[0],
        wm_center_y - wm.height // 2,
        wm_bbox[0] + wm.width,
        wm_center_y - wm.height // 2 + wm.height,
    )
    clear_wordmark_area(draw, wm_bbox, new_bbox, bg + (255,), 34)
    new_bbox = paste_wordmark_vcentered(card, wm, wm_bbox[0], wm_center_y)

    by_font = gc.load_font(gc.FONT_AVENIR, 18, gc.AV_MED)
    gc.draw_letterspaced(
        draw, (wm_bbox[0], new_bbox[3] + 6), "BY JC KRAFT", by_font, muted, extra_spacing_px=4
    )
    return card.convert("RGB")


def replace_poster_png_wordmark(
    poster: Image.Image,
    width: int,
    wm_path: Path,
) -> Image.Image:
    poster = poster.convert("RGBA")
    wm_bbox, wm_center_y, s = poster_lockup(width)
    png_w = wm_bbox[2] - wm_bbox[0]
    wm = fit_png_wordmark(wm_path, png_w)

    draw = ImageDraw.Draw(poster)
    new_bbox = (
        wm_bbox[0],
        wm_center_y - wm.height // 2,
        wm_bbox[0] + wm.width,
        wm_center_y - wm.height // 2 + wm.height,
    )
    clear_wordmark_area(draw, wm_bbox, new_bbox, gp.NAVY_DEEP + (255,), int(40 * s))
    new_bbox = paste_wordmark_vcentered(poster, wm, wm_bbox[0], wm_center_y)

    by_font = gp.font(gp.FONT_AVENIR, int(20 * s), gp.AV_MED)
    gp.draw_letterspaced(
        draw,
        (wm_bbox[0], new_bbox[3] + int(10 * s)),
        "BY JC KRAFT",
        by_font,
        gp.MUTED_WHITE,
        extra_spacing_px=int(5 * s),
    )
    return poster.convert("RGB")


def paste_wordmark_vcentered(
    base: Image.Image,
    overlay: Image.Image,
    left_x: int,
    center_y: int,
) -> tuple[int, int, int, int]:
    y = center_y - overlay.height // 2
    base.paste(overlay, (left_x, y), overlay)
    return (left_x, y, left_x + overlay.width, y + overlay.height)


def card_front_lockup(dark: bool) -> tuple[tuple[int, int, int, int], int]:
    lockup_center_y = gc.MARGIN + 80
    hex_h = 150
    wordmark_h = int(hex_h * 0.55)
    gap = 28
    logo_path = gc.LOGO_DARK if dark else gc.LOGO_LIGHT
    wordmark_path = gc.WORDMARK_DARK if dark else gc.WORDMARK_LIGHT
    logo = Image.open(logo_path).convert("RGBA")
    wordmark = Image.open(wordmark_path).convert("RGBA")
    tmp = Image.new("RGBA", (gc.CARD_W, gc.CARD_H), (0, 0, 0, 0))
    hex_bbox = gc.paste_centered_v(tmp, logo, gc.MARGIN, hex_h, lockup_center_y)
    wm_bbox = gc.paste_centered_v(
        tmp, wordmark, hex_bbox[2] + gap, wordmark_h, lockup_center_y - 6
    )
    return wm_bbox, lockup_center_y - 6


def poster_lockup(width: int) -> tuple[tuple[int, int, int, int], int, float]:
    s = width / 1200.0
    a1_ratio = 841 / 594
    height = int(round(width * a1_ratio))
    bottom = gp.compute_poster_bottom_layout(width, height, s)

    logo = Image.open(gp.LOGO_DARK).convert("RGBA")
    tmp = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    hex_bbox = gp.paste_v_centered(
        tmp, logo, bottom.margin_x, bottom.hex_h, bottom.lockup_center_y
    )
    wordmark = Image.open(gp.WORDMARK_DARK).convert("RGBA")
    wm_bbox = gp.paste_v_centered(
        tmp, wordmark, hex_bbox[2] + bottom.gap, bottom.wm_h, bottom.wm_center_y
    )
    return wm_bbox, bottom.wm_center_y, s


def clear_wordmark_area(
    draw: ImageDraw.ImageDraw,
    png_bbox: tuple[int, int, int, int],
    new_bbox: tuple[int, int, int, int],
    fill: tuple[int, int, int, int],
    by_clear_h: int,
) -> None:
    x0 = min(png_bbox[0], new_bbox[0])
    y0 = min(png_bbox[1], new_bbox[1])
    x1 = max(png_bbox[2], new_bbox[2])
    y1 = max(png_bbox[3], new_bbox[3]) + by_clear_h
    draw.rectangle((x0, y0, x1, y1), fill=fill)


def replace_card_front_wordmark(
    card: Image.Image,
    dark: bool,
    font_path: Path,
    wght: int | None,
) -> Image.Image:
    card = card.convert("RGBA")
    wm_bbox, wm_center_y = card_front_lockup(dark)
    bg = gc.NAVY if dark else gc.WHITE
    muted = gc.MUTED_WHITE if dark else gc.MUTED_NAVY
    png_w = wm_bbox[2] - wm_bbox[0]

    size = fit_font_size(font_path, png_w, wght)
    stance = gc.WHITE if dark else gc.NAVY
    pro = gc.BLUE_DARK_ACCENT if dark else gc.BLUE_LIGHT_ACCENT
    wm = render_font_wordmark(font_path, size, stance, pro, wght)

    draw = ImageDraw.Draw(card)
    new_bbox = (
        wm_bbox[0],
        wm_center_y - wm.height // 2,
        wm_bbox[0] + wm.width,
        wm_center_y - wm.height // 2 + wm.height,
    )
    clear_wordmark_area(draw, wm_bbox, new_bbox, bg + (255,), 34)
    new_bbox = paste_wordmark_vcentered(card, wm, wm_bbox[0], wm_center_y)

    by_font = gc.load_font(gc.FONT_AVENIR, 18, gc.AV_MED)
    gc.draw_letterspaced(
        draw, (wm_bbox[0], new_bbox[3] + 6), "BY JC KRAFT", by_font, muted, extra_spacing_px=4
    )
    return card.convert("RGB")


def replace_poster_wordmark(
    poster: Image.Image,
    width: int,
    font_path: Path,
    wght: int | None,
) -> Image.Image:
    poster = poster.convert("RGBA")
    wm_bbox, wm_center_y, s = poster_lockup(width)
    png_w = wm_bbox[2] - wm_bbox[0]

    size = fit_font_size(font_path, png_w, wght)
    wm = render_font_wordmark(font_path, size, gp.WHITE, gp.BLUE_ACCENT, wght)

    draw = ImageDraw.Draw(poster)
    new_bbox = (
        wm_bbox[0],
        wm_center_y - wm.height // 2,
        wm_bbox[0] + wm.width,
        wm_center_y - wm.height // 2 + wm.height,
    )
    clear_wordmark_area(draw, wm_bbox, new_bbox, gp.NAVY_DEEP + (255,), int(40 * s))
    new_bbox = paste_wordmark_vcentered(poster, wm, wm_bbox[0], wm_center_y)

    by_font = gp.font(gp.FONT_AVENIR, int(20 * s), gp.AV_MED)
    gp.draw_letterspaced(
        draw,
        (wm_bbox[0], new_bbox[3] + int(10 * s)),
        "BY JC KRAFT",
        by_font,
        gp.MUTED_WHITE,
        extra_spacing_px=int(5 * s),
    )
    return poster.convert("RGB")


def render_font_preview(font_key: str) -> tuple[Path, Path]:
    font_path, wght = FONTS[font_key]
    tag = FONT_FILE_TAGS[font_key]
    out_dir = preview_dir_for(tag)

    person = gc.PEOPLE[0]  # Jae
    card = gc.render_front(person, dark=False)
    card_preview = replace_card_front_wordmark(card, dark=False, font_path=font_path, wght=wght)
    card_path = out_dir / "card_jae_light_front.png"
    card_preview.save(card_path, dpi=(gc.DPI, gc.DPI))

    variant = gp.VARIANTS[0]  # carve
    width = 1200
    poster = gp.render_poster(variant, width=width)
    poster_preview = replace_poster_wordmark(poster, width=width, font_path=font_path, wght=wght)
    poster_path = out_dir / "poster_carve_preview.png"
    poster_preview.save(poster_path, dpi=(150, 150), optimize=True)
    return card_path, poster_path


def render_png_wordmark_preview(png_key: str) -> tuple[Path, Path]:
    entry = PNG_WORDMARKS[png_key]
    tag = str(entry["tag"])
    out_dir = preview_dir_for(tag)

    person = gc.PEOPLE[0]
    card = gc.render_front(person, dark=False)
    card_preview = replace_card_front_png_wordmark(card, dark=False, wm_path=Path(entry["card"]))
    card_path = out_dir / "card_jae_light_front.png"
    card_preview.save(card_path, dpi=(gc.DPI, gc.DPI))

    variant = gp.VARIANTS[0]
    width = 1200
    poster = gp.render_poster(variant, width=width)
    poster_preview = replace_poster_png_wordmark(poster, width=width, wm_path=Path(entry["poster"]))
    poster_path = out_dir / "poster_carve_preview.png"
    poster_preview.save(poster_path, dpi=(150, 150), optimize=True)
    return card_path, poster_path


def render_preview(preview_key: str) -> tuple[Path, Path]:
    if preview_key in FONTS:
        return render_font_preview(preview_key)
    if preview_key in PNG_WORDMARKS:
        return render_png_wordmark_preview(preview_key)
    raise KeyError(preview_key)


def build_overview_sheet() -> Path:
    """Grid: rows = fonts, cols = card + poster."""
    card_w, card_h = 525, 300
    poster_w, poster_h = 420, 594
    pad = 28
    label_h = 28
    row_h = label_h + max(card_h, poster_h) + 20
    title_h = 44
    canvas_w = pad * 3 + card_w + poster_w
    canvas_h = pad * 2 + title_h + row_h * len(OVERVIEW_ROWS)
    canvas = Image.new("RGB", (canvas_w, canvas_h), (248, 250, 255))
    draw = ImageDraw.Draw(canvas)
    title_font = gc.load_font(gc.FONT_AVENIR, 22, gc.AV_DEMI)
    label_font = gc.load_font(gc.FONT_AVENIR, 16, gc.AV_MED)
    draw.text((pad, pad), "Card + Poster previews (Jae light / Carve)", font=title_font, fill=(50, 50, 60))

    for i, (label, tag) in enumerate(OVERVIEW_ROWS):
        row_y = pad + title_h + i * row_h
        draw.text((pad, row_y), label, font=label_font, fill=(90, 90, 100))
        content_y = row_y + label_h + 8
        font_dir = preview_dir_for(tag)
        card = Image.open(font_dir / "card_jae_light_front.png").convert("RGB")
        poster = Image.open(font_dir / "poster_carve_preview.png").convert("RGB")
        card_rs = card.resize((card_w, card_h), Image.LANCZOS)
        poster_rs = poster.resize((poster_w, poster_h), Image.LANCZOS)
        canvas.paste(card_rs, (pad, content_y))
        canvas.paste(poster_rs, (pad * 2 + card_w, content_y))

    out_path = PREVIEW_ROOT / "all_fonts_overview.png"
    PREVIEW_ROOT.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path, optimize=True)
    return out_path


def all_preview_keys() -> list[str]:
    return sorted(FONTS) + sorted(PNG_WORDMARKS)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--font",
        choices=[*all_preview_keys(), "all"],
        default="all",
        help="wordmark font to preview (default: all)",
    )
    args = parser.parse_args()
    preview_keys = all_preview_keys() if args.font == "all" else [args.font]

    for preview_key in preview_keys:
        card_path, poster_path = render_preview(preview_key)
        print(f"saved: {card_path}")
        print(f"saved: {poster_path}")

    overview = build_overview_sheet()
    print(f"saved: {overview}")


if __name__ == "__main__":
    main()
