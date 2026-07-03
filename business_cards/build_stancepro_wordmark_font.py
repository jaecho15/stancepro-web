"""Build a geometric StancePro wordmark font with uniform stroke and angles.

Glyphs are constructed from measured brand proportions (not raw PNG tracing).
Run:
  python3 build_stancepro_wordmark_font.py
"""
from __future__ import annotations

import math
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
WORDMARK_DARK = HERE / "android_drawable_nodpi/loading_wordmark_dark.png"
OUT_DIR = Path(__file__).resolve().parent / "merch" / "fonts"
COMPARE_DIR = Path(__file__).resolve().parent / "merch" / "font_compare"

UNITS = 1000
ASCENDER = 800
DESCENDER = -200

# Measured from loading_wordmark_light.png (128 px canvas, cap y 21–111).
CAP = 91.0
SW = 21.0
R = 10.0
R_IN = 5.0
K = ASCENDER / CAP

NAVY = (26, 46, 97)
BLUE = (63, 169, 245)
WHITE = (255, 255, 255)
LABEL = (80, 80, 90)

# Letter body fits in BODY_W; the remaining LETTER_GAP is always empty space.
BODY_W = 90.0
LETTER_GAP = 14.0
CELL_W = BODY_W + LETTER_GAP
ADVANCE_PX = CELL_W


def fy(y_down: float) -> float:
    return (CAP - y_down) * K


def fx(x: float) -> float:
    return x * K


def _arc_points(
    cx: float,
    cy: float,
    r: float,
    a0: float,
    a1: float,
    steps: int = 6,
) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    for i in range(1, steps + 1):
        t = a0 + (a1 - a0) * (i / steps)
        pts.append((cx + r * math.cos(t), cy + r * math.sin(t)))
    return pts


def rounded_rect_path(
    x: float,
    y: float,
    w: float,
    h: float,
    r: float = R,
) -> list[tuple[float, float]]:
    """Clockwise path in font coords; x/y are top-left in y-down design units."""
    r = min(r, w / 2, h / 2)
    x2, y2 = x + w, y + h

    # Corner centers in y-down, then map each point.
    tl = (x + r, y + r)
    tr = (x2 - r, y + r)
    br = (x2 - r, y2 - r)
    bl = (x + r, y2 - r)

    def mp(px: float, py: float) -> tuple[float, float]:
        return (fx(px), fy(py))

    path: list[tuple[float, float]] = []
    path.append(mp(x + r, y))
    path.append(mp(x2 - r, y))
    path.extend(mp(*p) for p in _arc_points(tr[0], tr[1], r, -math.pi / 2, 0))
    path.append(mp(x2, y + r))
    path.append(mp(x2, y2 - r))
    path.extend(mp(*p) for p in _arc_points(br[0], br[1], r, 0, math.pi / 2))
    path.append(mp(x2 - r, y2))
    path.append(mp(x + r, y2))
    path.extend(mp(*p) for p in _arc_points(bl[0], bl[1], r, math.pi / 2, math.pi))
    path.append(mp(x, y2 - r))
    path.append(mp(x, y + r))
    path.extend(mp(*p) for p in _arc_points(tl[0], tl[1], r, -math.pi / 2, math.pi))
    return path


def polygon_path(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    return [(fx(x), fy(y)) for x, y in points]


def add_path(pen: TTGlyphPen, points: list[tuple[float, float]], clockwise: bool = True) -> None:
    if len(points) < 3:
        return
    pts = points if clockwise else list(reversed(points))
    pen.moveTo(pts[0])
    for pt in pts[1:]:
        pen.lineTo(pt)
    pen.closePath()


def diag_stroke(
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    sw: float = SW,
) -> list[tuple[float, float]]:
    dx, dy = x1 - x0, y1 - y0
    length = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / length, dx / length
    hw = sw / 2
    return [
        (x0 + nx * hw, y0 + ny * hw),
        (x1 + nx * hw, y1 + ny * hw),
        (x1 - nx * hw, y1 - ny * hw),
        (x0 - nx * hw, y0 - ny * hw),
    ]


def add_rounded_rect(
    pen: TTGlyphPen,
    x: float,
    y: float,
    w: float,
    h: float,
    r: float = R,
    hole: bool = False,
) -> None:
    add_path(pen, rounded_rect_path(x, y, w, h, r), clockwise=not hole)


def add_polygon(pen: TTGlyphPen, points: list[tuple[float, float]], hole: bool = False) -> None:
    add_path(pen, polygon_path(points), clockwise=not hole)


def glyph_t(pen: TTGlyphPen) -> None:
    w = BODY_W
    add_rounded_rect(pen, 0, 0, w, SW)
    add_rounded_rect(pen, (w - SW) / 2, SW, SW, CAP - SW)


def glyph_e(pen: TTGlyphPen) -> None:
    w = BODY_W
    mid_y = (CAP - SW) / 2
    add_rounded_rect(pen, 0, 0, SW, CAP)
    add_rounded_rect(pen, 0, 0, w, SW)
    add_rounded_rect(pen, 0, mid_y, w - SW, SW)
    add_rounded_rect(pen, 0, CAP - SW, w, SW)


def glyph_c(pen: TTGlyphPen) -> None:
    w = BODY_W
    add_rounded_rect(pen, 0, 0, SW, CAP, r=R)
    add_rounded_rect(pen, 0, 0, w, SW, r=R)
    add_rounded_rect(pen, 0, CAP - SW, w, SW, r=R)


def glyph_n(pen: TTGlyphPen) -> None:
    w = BODY_W
    add_rounded_rect(pen, 0, 0, SW, CAP)
    add_rounded_rect(pen, w - SW, 0, SW, CAP)
    add_polygon(pen, diag_stroke(SW, 0, w - SW, CAP))


def glyph_o(pen: TTGlyphPen) -> None:
    w = BODY_W
    add_rounded_rect(pen, 0, 0, w, SW, r=R)
    add_rounded_rect(pen, 0, CAP - SW, w, SW, r=R)
    add_rounded_rect(pen, 0, SW, SW, CAP - 2 * SW, r=R)
    add_rounded_rect(pen, w - SW, SW, SW, CAP - 2 * SW, r=R)


def glyph_p(pen: TTGlyphPen) -> None:
    w = BODY_W
    bowl_h = 55.0
    add_rounded_rect(pen, 0, 0, SW, CAP)
    add_rounded_rect(pen, 0, 0, w, SW)
    add_rounded_rect(pen, w - SW, SW, SW, bowl_h - SW, r=R)
    add_rounded_rect(pen, SW, bowl_h - SW, w - SW, SW, r=R_IN)


def glyph_r(pen: TTGlyphPen) -> None:
    w = BODY_W
    bowl_h = 55.0
    add_rounded_rect(pen, 0, 0, SW, CAP)
    add_rounded_rect(pen, 0, 0, w, SW)
    add_rounded_rect(pen, w - SW, SW, SW, bowl_h - SW, r=R)
    add_rounded_rect(pen, SW, bowl_h - SW, w - SW, SW, r=R_IN)
    add_polygon(pen, diag_stroke(SW, bowl_h, w - SW, CAP))


def glyph_a(pen: TTGlyphPen) -> None:
    w = BODY_W
    hw = SW / 2
    top_w = 56.0 * (BODY_W / 100.0)
    top_x = (w - top_w) / 2
    bar_y = 43.0
    bar_w = 44.0 * (BODY_W / 100.0)
    bar_x = (w - bar_w) / 2
    add_rounded_rect(pen, top_x, 0, top_w, SW)
    add_polygon(pen, diag_stroke(top_x, SW, hw, CAP))
    add_polygon(pen, diag_stroke(top_x + top_w, SW, w - hw, CAP))
    add_rounded_rect(pen, bar_x, bar_y, bar_w, SW)


def glyph_s(pen: TTGlyphPen) -> None:
    w = BODY_W
    mid_y = (CAP - SW) / 2
    left_inset = 18.0 * (BODY_W / 96.0)
    add_rounded_rect(pen, left_inset, 0, w - left_inset, SW, r=R)
    add_rounded_rect(pen, 0, 0, SW, mid_y + SW / 2, r=R)
    add_rounded_rect(pen, 0, mid_y - SW / 2, w - SW, SW, r=R_IN)
    add_rounded_rect(pen, 0, CAP - SW, w, SW, r=R)
    add_rounded_rect(pen, w - SW, mid_y, SW, CAP - mid_y, r=R)


GLYPH_BUILDERS = {
    "S": glyph_s,
    "T": glyph_t,
    "A": glyph_a,
    "N": glyph_n,
    "C": glyph_c,
    "E": glyph_e,
    "P": glyph_p,
    "R": glyph_r,
    "O": glyph_o,
}


def build_glyph(char: str) -> object:
    pen = TTGlyphPen(None)
    GLYPH_BUILDERS[char](pen)
    return pen.glyph()


def build_font(ttf_path: Path) -> Path:
    glyphs = {c: build_glyph(c) for c in "STANCEPRO"}
    glyphs[" "] = TTGlyphPen(None).glyph()

    advance = int(ADVANCE_PX * K)
    advances = {c: advance for c in "STANCEPRO"}
    advances[" "] = int(LETTER_GAP * K)

    glyph_order = [".notdef", " "] + list("STANCEPRO")

    fb = FontBuilder(UNITS, isTTF=True)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap({ord(c): c for c in " STANCEPRO"})

    notdef_pen = TTGlyphPen(None)
    add_rounded_rect(notdef_pen, 50, 50, 120, CAP - 100, r=8)
    glyph_set = {".notdef": notdef_pen.glyph(), " ": glyphs[" "]}
    glyph_set.update(glyphs)
    fb.setupGlyf(glyph_set)

    metrics = {name: (advances.get(name, 600), 0) for name in glyph_order if name != ".notdef"}
    metrics[".notdef"] = (600, 0)
    fb.setupHorizontalMetrics(metrics)

    fb.setupHorizontalHeader(ascent=ASCENDER, descent=DESCENDER)
    fb.setupOS2(
        sTypoAscender=ASCENDER,
        sTypoDescender=DESCENDER,
        usWinAscent=ASCENDER,
        usWinDescent=abs(DESCENDER),
        xAvgCharWidth=int(sum(advances.values()) / len(advances)),
    )
    fb.setupPost()
    fb.setupNameTable(
        {
            "familyName": "StancePro Wordmark",
            "styleName": "Regular",
            "uniqueFontIdentifier": "StanceProWordmark-Regular",
            "fullName": "StancePro Wordmark Regular",
            "psName": "StanceProWordmark-Regular",
            "version": "Version 0.4",
        }
    )

    ttf_path.parent.mkdir(parents=True, exist_ok=True)
    fb.save(ttf_path)
    return ttf_path


def draw_wordmark(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    font: ImageFont.FreeTypeFont,
    stance: str = "STANCE",
    pro: str = "PRO",
) -> int:
    draw.text((x, y), stance, font=font, fill=NAVY)
    bbox = draw.textbbox((x, y), stance, font=font)
    draw.text((bbox[2], y), pro, font=font, fill=BLUE)
    bbox2 = draw.textbbox((bbox[2], y), pro, font=font)
    return bbox2[2]


def render_comparison(ttf_path: Path, out_path: Path) -> None:
    size = 96
    font = ImageFont.truetype(str(ttf_path), size=size)

    src = Image.open(WORDMARK_DARK).convert("RGBA")
    target_h = size
    sw = int(src.width * (target_h / src.height))
    src_scaled = src.resize((sw, target_h), Image.LANCZOS)

    sample_h = target_h + 80
    sample_w = max(sw, 920)
    canvas = Image.new("RGB", (sample_w, sample_h * 3 + 50), WHITE)
    draw = ImageDraw.Draw(canvas)

    y = 24
    draw.text((24, y), "Original PNG", fill=LABEL)
    canvas.paste(src_scaled, (24, y + 30), src_scaled)

    y += sample_h
    draw.text((24, y), "Geometric TTF — uniform width & spacing", fill=LABEL)
    draw_wordmark(draw, 24, y + 30, font)

    y += sample_h
    draw.text((24, y), "Large scale (280px)", fill=LABEL)
    big = 280
    big_font = ImageFont.truetype(str(ttf_path), size=big)
    src_big = src.resize((int(src.width * (big / src.height)), big), Image.LANCZOS)
    row_y = y + 34
    canvas.paste(src_big, (24, row_y), src_big)
    draw_wordmark(draw, 24 + src_big.width + 36, row_y, big_font)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path)


def render_white_preview(ttf_path: Path, out_path: Path) -> None:
    size = 180
    font = ImageFont.truetype(str(ttf_path), size=size)
    canvas = Image.new("RGB", (1600, 320), WHITE)
    draw = ImageDraw.Draw(canvas)
    end_x = draw_wordmark(draw, 50, 80, font)
    canvas = canvas.crop((0, 0, min(end_x + 50, 1600), 320))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path)


def main() -> None:
    ttf_path = OUT_DIR / "StanceProWordmark-Regular.ttf"
    build_font(ttf_path)
    compare_path = COMPARE_DIR / "stancepro_custom_font_compare.png"
    preview_path = COMPARE_DIR / "stancepro_custom_font_white.png"
    render_comparison(ttf_path, compare_path)
    render_white_preview(ttf_path, preview_path)
    print(f"Wrote {ttf_path}")
    print(f"Wrote {compare_path}")
    print(f"Wrote {preview_path}")


if __name__ == "__main__":
    main()
