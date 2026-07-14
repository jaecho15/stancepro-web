#!/usr/bin/env python3
"""Copy brand preview PNGs into stancepro-web/public for /internal/brand-review."""
from __future__ import annotations

import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
WEB_PUBLIC = HERE.parent / "public/brand-review"

SRC_CARDS = HERE / "print_ready"
SRC_POSTERS = HERE / "posters"
SRC_MERCH = HERE / "merch"
FONT_COMPARE_SRC = HERE / "merch/font_compare/previews"
DST_CARDS = WEB_PUBLIC / "business_cards"
DST_POSTERS = WEB_PUBLIC / "posters"
DST_MERCH = WEB_PUBLIC / "merch"
DST_FONT_COMPARE = WEB_PUBLIC / "font_compare"

OFFICIAL_POSTER_PREVIEWS = frozenset({
    "poster_carve_preview.png",
    "poster_powder_preview.png",
    "poster_setup_preview.png",
    "poster_coaching_preview.png",
    "poster_ride_nav_preview.png",
})

OFFICIAL_STICKER_PREVIEWS: tuple[tuple[str, str], ...] = (
    ("sticker_snowboard_navy_6x1.5in_preview.png", "Snowboard — navy 6×1.5 in"),
    ("sticker_snowboard_white_6x1.5in_preview.png", "Snowboard — white 6×1.5 in"),
    ("sticker_snowboard_diecut_6x1.5in_preview.png", "Snowboard — die-cut vinyl (light board)"),
    ("sticker_snowboard_diecut_dark_board_6x1.5in_preview.png", "Snowboard — die-cut vinyl (dark board)"),
    ("sticker_helmet_hex_2.5in_preview.png", "Helmet — full-color hex"),
    ("sticker_helmet_white_2.5in_preview.png", "Helmet — white mono"),
    ("sticker_helmet_badge_2.5in_preview.png", "Helmet — badge ring"),
    ("sticker_shop_qr_3x3in_preview.png", "Shop counter QR 3×3 in"),
)

FONT_COMPARE_FILES: tuple[tuple[str, str], ...] = (
    ("michroma_bold_v5/card_jae_light_front.png", "michroma_v5_card.png"),
    ("michroma_bold_v5/poster_carve_preview.png", "michroma_v5_poster.png"),
    ("microgramma_bold/card_jae_light_front.png", "microgramma_card.png"),
    ("microgramma_bold/poster_carve_preview.png", "microgramma_poster.png"),
    ("all_fonts_overview.png", "overview.png"),
)


def copy_card_previews() -> int:
    DST_CARDS.mkdir(parents=True, exist_ok=True)
    count = 0
    for path in sorted(SRC_CARDS.glob("*_preview.png")):
        shutil.copy2(path, DST_CARDS / path.name)
        count += 1
    return count


def copy_poster_previews() -> int:
    DST_POSTERS.mkdir(parents=True, exist_ok=True)
    count = 0
    for name in sorted(OFFICIAL_POSTER_PREVIEWS):
        src = SRC_POSTERS / name
        if not src.is_file():
            raise FileNotFoundError(f"Missing poster preview: {src}")
        shutil.copy2(src, DST_POSTERS / name)
        count += 1
    for path in DST_POSTERS.glob("*.png"):
        if path.name not in OFFICIAL_POSTER_PREVIEWS:
            path.unlink()
    return count


def copy_merch_previews() -> int:
    DST_MERCH.mkdir(parents=True, exist_ok=True)
    official_names = {name for name, _ in OFFICIAL_STICKER_PREVIEWS}
    count = 0
    for filename, _label in OFFICIAL_STICKER_PREVIEWS:
        src = SRC_MERCH / filename
        if not src.is_file():
            raise FileNotFoundError(f"Missing sticker preview: {src}")
        shutil.copy2(src, DST_MERCH / filename)
        count += 1
    for path in DST_MERCH.glob("*.png"):
        if path.name not in official_names:
            path.unlink()
    return count


def copy_font_compare_previews() -> int:
    DST_FONT_COMPARE.mkdir(parents=True, exist_ok=True)
    count = 0
    for rel_src, dest_name in FONT_COMPARE_FILES:
        src = FONT_COMPARE_SRC / rel_src
        if not src.is_file():
            raise FileNotFoundError(f"Missing font compare asset: {src}")
        shutil.copy2(src, DST_FONT_COMPARE / dest_name)
        count += 1
    return count


def main() -> None:
    n_cards = copy_card_previews()
    n_posters = copy_poster_previews()
    n_merch = copy_merch_previews()
    n_fonts = copy_font_compare_previews()
    print(
        f"Synced {n_cards} business card previews + {n_posters} poster previews "
        f"+ {n_merch} sticker previews + {n_fonts} wordmark compare previews"
    )
    print(f"→ {WEB_PUBLIC}")


if __name__ == "__main__":
    main()
