#!/usr/bin/env python3
"""Build downloadable print packages for the internal brand review portal."""
from __future__ import annotations

import shutil
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
PUBLIC_ROOT = HERE.parent / "public/brand-review/downloads/print"
POSTER_SRC = HERE / "posters"
CARD_SRC = HERE / "print_ready"
STICKER_SRC = HERE / "merch"
DPI = 300

POSTERS = (
    "poster_carve_print_A1_150dpi.png",
    "poster_powder_print_A1_150dpi.png",
    "poster_setup_print_A1_150dpi.png",
    "poster_coaching_print_A1_150dpi.png",
    "poster_ride_nav_print_A1_150dpi.png",
    "poster_home_hq_print_A1_150dpi.png",
)

BUSINESS_CARDS = (
    "jae_light_front.png",
    "jae_dark_front.png",
    "richie_light_front.png",
    "richie_dark_front.png",
    "dan_light_front.png",
    "dan_dark_front.png",
    "back_light.png",
    "back_dark.png",
)

STICKERS = (
    "sticker_snowboard_navy_6x1.5in_300dpi.png",
    "sticker_snowboard_white_6x1.5in_300dpi.png",
    "sticker_lockup_tagline_navy_5.5x2in_300dpi.png",
    "sticker_lockup_tagline_white_5.5x2in_300dpi.png",
    "sticker_lockup_tagline_diecut_light_5.5x2in_300dpi.png",
    "sticker_lockup_tagline_diecut_dark_5.5x2in_300dpi.png",
    "sticker_snowboard_diecut_6x1.5in_300dpi.png",
    "sticker_snowboard_diecut_dark_board_6x1.5in_300dpi.png",
    "sticker_snowboard_diecut_10x2.5in_300dpi.png",
    "sticker_snowboard_diecut_dark_board_10x2.5in_300dpi.png",
    "sticker_helmet_hex_2.5in_300dpi.png",
    "sticker_helmet_white_2.5in_300dpi.png",
    "sticker_helmet_badge_2.5in_300dpi.png",
    "sticker_shop_qr_3x3in_300dpi.png",
)

CATEGORY_READMES = {
    "posters": """StancePro poster print files

- A1 portrait PNG
- 150 dpi
- Confirm the printer's bleed and color-profile requirements before production.
- poster_home_hq is included in this package even though it is not shown in Brand Review.
""",
    "business-cards": """StancePro business card print files

- 1050 x 600 px PNG at 300 dpi
- Finished size: 3.5 x 2 in
- Pair each named front with back_light or back_dark.
- Confirm bleed, trim, and CMYK conversion with the printer.
""",
    "stickers": """StancePro sticker print files

PNG (web / proof):
- 300 dpi artwork. Die-cuts are transparent (navy or white ink only).
- Rectangular navy/white snowboard and lockup stickers keep filled faces.

Die-cut SVG (send these to the print shop):
- True vector paths for logo mark + wordmark (+ tagline where applicable).
- No embedded PNG / <image> raster artwork.
- Light = navy + blue ink; dark = white + cyan ink. Transparent — no background fill.
- Magenta path id=\"CutContour\" is the die line (rounded rect, 0.125 in clearance).
- Ask the printer to convert that stroke to their required CutContour spot color.
- \"Snowboard\" names the placement product; the die shape is a rounded rectangle
  around the lockup (not a snowboard silhouette).
""",
}


def copy_files(source: Path, names: tuple[str, ...], destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    for name in names:
        src = source / name
        if not src.is_file():
            raise FileNotFoundError(f"Missing print asset: {src}")
        shutil.copy2(src, destination / name)


def write_zip(zip_path: Path, root: Path, members: tuple[str, ...]) -> None:
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for member in members:
            path = root / member
            if path.is_dir():
                for child in sorted(path.rglob("*")):
                    if child.is_file():
                        archive.write(child, child.relative_to(root))
            else:
                archive.write(path, path.relative_to(root))


def main() -> None:
    from vector_diecut import write_all_diecut_svgs

    if PUBLIC_ROOT.exists():
        shutil.rmtree(PUBLIC_ROOT)
    PUBLIC_ROOT.mkdir(parents=True)

    poster_dir = PUBLIC_ROOT / "posters"
    card_dir = PUBLIC_ROOT / "business-cards"
    sticker_dir = PUBLIC_ROOT / "stickers"
    copy_files(POSTER_SRC, POSTERS, poster_dir)
    copy_files(CARD_SRC, BUSINESS_CARDS, card_dir)
    copy_files(STICKER_SRC, STICKERS, sticker_dir)

    # True-vector die-cut SVGs (paths only — no raster embeds)
    write_all_diecut_svgs(sticker_dir)

    for category, text in CATEGORY_READMES.items():
        (PUBLIC_ROOT / category / "README.txt").write_text(text, encoding="utf-8")

    root_readme = """StancePro brand print package

Folders:
- posters: A1 poster PNGs
- business-cards: named fronts and shared backs
- stickers: 300 dpi PNG proofs + true-vector die-cut SVGs (CutContour included)

For die-cut stickers, send the *.svg files to the printer (not the PNG proofs).
Always confirm bleed, trim, color profile, and CutContour naming with the printer.
"""
    (PUBLIC_ROOT / "README.txt").write_text(root_readme, encoding="utf-8")

    for category in ("posters", "business-cards", "stickers"):
        write_zip(
            PUBLIC_ROOT / f"stancepro-{category}-print.zip",
            PUBLIC_ROOT,
            (category,),
        )
    write_zip(
        PUBLIC_ROOT / "stancepro-all-brand-print.zip",
        PUBLIC_ROOT,
        ("README.txt", "posters", "business-cards", "stickers"),
    )
    print(f"Built print downloads at {PUBLIC_ROOT}")


if __name__ == "__main__":
    main()
