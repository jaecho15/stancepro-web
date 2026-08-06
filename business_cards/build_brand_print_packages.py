#!/usr/bin/env python3
"""Build downloadable print packages for the internal brand review portal."""
from __future__ import annotations

import base64
import shutil
import zipfile
from pathlib import Path

from PIL import Image

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

- PNG artwork is 300 dpi (transparent for die-cuts).
- Light die-cuts: navy (#1A2E61) ink on transparency — for light surfaces.
- Dark die-cuts: white ink on transparency — for dark surfaces (view against a
  dark board or checkerboard preview; SVG has no forced background fill).
- Rectangular navy/white snowboard and lockup stickers keep filled faces; those
  are separate products from die-cuts.
- Die-cut SVG files embed the matching artwork PNG plus a magenta CutContour
  path (id=\"CutContour\"). No CSS background-color is set on the root <svg>
  (print stays transparent; browser default is white).
- Contour clearance is 0.125 in around the artwork.
- Ask the printer to convert the SVG stroke to its required CutContour spot color.
""",
}


def copy_files(source: Path, names: tuple[str, ...], destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    for name in names:
        src = source / name
        if not src.is_file():
            raise FileNotFoundError(f"Missing print asset: {src}")
        shutil.copy2(src, destination / name)


def write_cutline_svg(
    artwork_path: Path,
    destination: Path,
) -> None:
    """Write SVG with embedded artwork + magenta CutContour (printer + preview).

    No CSS background-color on the root <svg> — print stays transparent ink only;
    browsers show the default (white) page behind the artwork.
    """
    with Image.open(artwork_path).convert("RGBA") as artwork:
        bbox = artwork.getbbox()
        if not bbox:
            raise ValueError(f"Artwork has no visible pixels: {artwork_path}")
        width, height = artwork.size

    pad = DPI * 0.125
    x = bbox[0] - pad
    y = bbox[1] - pad
    contour_width = bbox[2] - bbox[0] + pad * 2
    contour_height = bbox[3] - bbox[1] + pad * 2
    radius = DPI * 0.1
    # Thicker on-screen stroke so the contour is visible in browser preview;
    # printers rematch CutContour to their spot color / plot stroke.
    stroke_width = max(2.0, DPI / 72 * 0.75)
    png_b64 = base64.b64encode(artwork_path.read_bytes()).decode("ascii")
    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  width="{width / DPI:g}in" height="{height / DPI:g}in"
  viewBox="0 0 {width} {height}">
  <!-- Artwork is a transparent PNG; no forced SVG background fill. -->
  <image id="Artwork" x="0" y="0" width="{width}" height="{height}"
    preserveAspectRatio="none"
    xlink:href="data:image/png;base64,{png_b64}" />
  <rect id="CutContour" x="{x:g}" y="{y:g}"
    width="{contour_width:g}" height="{contour_height:g}"
    rx="{radius:g}" ry="{radius:g}" fill="none"
    stroke="#FF00FF" stroke-width="{stroke_width:g}" />
</svg>
"""
    destination.write_text(svg, encoding="utf-8")


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
    if PUBLIC_ROOT.exists():
        shutil.rmtree(PUBLIC_ROOT)
    PUBLIC_ROOT.mkdir(parents=True)

    poster_dir = PUBLIC_ROOT / "posters"
    card_dir = PUBLIC_ROOT / "business-cards"
    sticker_dir = PUBLIC_ROOT / "stickers"
    copy_files(POSTER_SRC, POSTERS, poster_dir)
    copy_files(CARD_SRC, BUSINESS_CARDS, card_dir)
    copy_files(STICKER_SRC, STICKERS, sticker_dir)

    # Die-cuts: transparent ink only (navy or white). No SVG background-color.
    write_cutline_svg(
        sticker_dir / "sticker_snowboard_diecut_6x1.5in_300dpi.png",
        sticker_dir / "sticker_snowboard_diecut_cutline_6x1.5in.svg",
    )
    write_cutline_svg(
        sticker_dir / "sticker_snowboard_diecut_10x2.5in_300dpi.png",
        sticker_dir / "sticker_snowboard_diecut_cutline_10x2.5in.svg",
    )
    write_cutline_svg(
        sticker_dir / "sticker_lockup_tagline_diecut_light_5.5x2in_300dpi.png",
        sticker_dir / "sticker_lockup_tagline_diecut_cutline_light_5.5x2in.svg",
    )
    write_cutline_svg(
        sticker_dir / "sticker_snowboard_diecut_dark_board_6x1.5in_300dpi.png",
        sticker_dir / "sticker_snowboard_diecut_cutline_dark_board_6x1.5in.svg",
    )
    write_cutline_svg(
        sticker_dir / "sticker_snowboard_diecut_dark_board_10x2.5in_300dpi.png",
        sticker_dir / "sticker_snowboard_diecut_cutline_dark_board_10x2.5in.svg",
    )
    write_cutline_svg(
        sticker_dir / "sticker_lockup_tagline_diecut_dark_5.5x2in_300dpi.png",
        sticker_dir / "sticker_lockup_tagline_diecut_cutline_dark_5.5x2in.svg",
    )

    for category, text in CATEGORY_READMES.items():
        (PUBLIC_ROOT / category / "README.txt").write_text(text, encoding="utf-8")

    root_readme = """StancePro brand print package

Folders:
- posters: A1 poster PNGs
- business-cards: named fronts and shared backs
- stickers: 300 dpi PNG artwork and separate SVG die-cut contours

Always confirm bleed, trim, color profile, and CutContour naming with the selected printer.
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
