#!/usr/bin/env python3
"""Build Michroma-inspired custom bold STANCEPRO wordmarks (SVG + previews).

Extracts Michroma glyph outlines, applies controlled polygon offsets for three
bold-inspired variants, and generates comparison sheets + brand mockups.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

import pyclipper
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageChops, ImageDraw, ImageFont
from svgpathtools import parse_path

HERE = Path(__file__).resolve().parent
ASSET_DIR = HERE / "android_drawable_nodpi"
COMPARE_ROOT = HERE / "merch" / "font_compare"
FONT_DIR = COMPARE_ROOT / "google_fonts"
MICHROMA = FONT_DIR / "Michroma-Regular.ttf"
EUROSTILE = FONT_DIR / "EurostileExtendedBlack.ttf"
LOGO_LIGHT = ASSET_DIR / "loading_logo_light.png"
LOGO_DARK = ASSET_DIR / "loading_logo_dark.png"
WORDMARK_PNG = ASSET_DIR / "loading_wordmark_light.png"

OUT = COMPARE_ROOT / "michroma_bold_custom"
SVG_DIR = OUT / "svg"
PNG_DIR = OUT / "png"
MOCK_DIR = OUT / "mocks"

NAVY = "#1A2E61"
BLUE_LIGHT = "#007AE6"
BLUE_DARK = "#3FA9F5"
WHITE = "#FFFFFF"
NAVY_BG = "#0F1C40"
LABEL = (80, 80, 90)
TITLE = (40, 40, 50)

CLIP_SCALE = 8
SPLIT = len("STANCE")
TEXT = "STANCEPRO"


@dataclass
class GlyphArt:
    polygons: list[list[tuple[float, float]]]
    fill: str
    x: float


@dataclass(frozen=True)
class Variant:
    slug: str
    label: str
    offset: float
    scale_x: float = 1.0
    scale_y: float = 1.0
    tracking: float = 0.0


VARIANTS = [
    Variant("v1_stem_plus", "V1 Stem+", offset=18, scale_x=1.0, scale_y=1.0, tracking=0.0),
    Variant("v2_structure", "V2 Structure", offset=28, scale_x=1.0, scale_y=1.0, tracking=0.0),
    Variant(
        "v3_premium",
        "V3 Premium",
        offset=22,
        scale_x=1.025,
        scale_y=1.015,
        tracking=-0.012,
    ),
    Variant(
        "v4_heavy",
        "V4 Heavy",
        offset=32,
        scale_x=1.03,
        scale_y=1.02,
        tracking=-0.015,
    ),
    Variant(
        "v5_ultra",
        "V5 Ultra",
        offset=42,
        scale_x=1.032,
        scale_y=1.022,
        tracking=-0.018,
    ),
]

RECOMMENDED = "v3_premium"


def signed_area(pts: list[tuple[float, float]]) -> float:
    area = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        area += x1 * y2 - x2 * y1
    return area / 2.0


def sample_subpath(subpath, step: float = 6.0) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    for seg in subpath:
        n = max(2, int(seg.length() / step) + 1)
        for i in range(n):
            t = i / (n - 1) if n > 1 else 0.0
            z = seg.point(t)
            pts.append((z.real, z.imag))
    return pts


def offset_subpath(subpath, delta: float) -> list[list[tuple[float, float]]]:
    poly = sample_subpath(subpath)
    if len(poly) < 3:
        return []
    area = signed_area(poly)
    is_outer = area < 0
    signed_delta = delta if is_outer else -delta
    subj = [(int(x * CLIP_SCALE), int(y * CLIP_SCALE)) for x, y in poly]
    pc = pyclipper.PyclipperOffset(miter_limit=2.5, arc_tolerance=0.2 * CLIP_SCALE)
    pc.AddPath(subj, pyclipper.JT_ROUND, pyclipper.ET_CLOSEDPOLYGON)
    solution = pc.Execute(signed_delta * CLIP_SCALE)
    out: list[list[tuple[float, float]]] = []
    for s in solution:
        pts = [(x / CLIP_SCALE, y / CLIP_SCALE) for x, y in s]
        if pts and (signed_area(pts) < 0) != is_outer:
            pts = list(reversed(pts))
        out.append(pts)
    return out


def poly_to_path_d(pts: list[tuple[float, float]]) -> str:
    if not pts:
        return ""
    parts = [f"M {pts[0][0]:.2f} {pts[0][1]:.2f}"]
    for x, y in pts[1:]:
        parts.append(f"L {x:.2f} {y:.2f}")
    parts.append("Z")
    return " ".join(parts)


def flatten_glyph_polygons(
    polygons: list[list[tuple[float, float]]],
) -> list[list[tuple[float, float]]]:
    """Union outers and subtract holes so transparent raster has correct counters."""
    outers: list[list[tuple[int, int]]] = []
    holes: list[list[tuple[int, int]]] = []
    for poly in polygons:
        if len(poly) < 3:
            continue
        scaled = [(int(x * CLIP_SCALE), int(y * CLIP_SCALE)) for x, y in poly]
        if signed_area(poly) < 0:
            outers.append(scaled)
        else:
            holes.append(scaled)
    if not outers:
        return []
    pc = pyclipper.Pyclipper()
    pc.AddPaths(outers, pyclipper.PT_SUBJECT, True)
    if holes:
        pc.AddPaths(holes, pyclipper.PT_CLIP, True)
        solution = pc.Execute(
            pyclipper.CT_DIFFERENCE,
            pyclipper.PFT_EVENODD,
            pyclipper.PFT_EVENODD,
        )
    else:
        solution = outers
    return [[(x / CLIP_SCALE, y / CLIP_SCALE) for x, y in s] for s in solution]


def glyph_compound_path_d(polygons: list[list[tuple[float, float]]]) -> str:
    return " ".join(poly_to_path_d(poly) for poly in polygons if len(poly) >= 3)


def offset_glyph_polygons(path_d: str, delta: float) -> list[list[tuple[float, float]]]:
    path = parse_path(path_d)
    polys: list[list[tuple[float, float]]] = []
    for sub in path.continuous_subpaths():
        polys.extend(offset_subpath(sub, delta))
    return polys


def transform_polygons(
    polys: list[list[tuple[float, float]]],
    x_shift: float,
    scale_x: float,
    scale_y: float,
    origin_x: float,
    origin_y: float,
) -> list[list[tuple[float, float]]]:
    out: list[list[tuple[float, float]]] = []
    for poly in polys:
        transformed = []
        for x, y in poly:
            tx = (x + x_shift - origin_x) * scale_x + origin_x
            ty = (y - origin_y) * scale_y + origin_y
            transformed.append((tx, ty))
        out.append(transformed)
    return out


def shift_polygons_x(
    polys: list[list[tuple[float, float]]],
    dx: float,
) -> list[list[tuple[float, float]]]:
    return [[(x + dx, y) for x, y in poly] for poly in polys]


def polygon_bounds(
    glyphs: list[GlyphArt],
) -> tuple[float, float, float, float]:
    xs: list[float] = []
    ys: list[float] = []
    for g in glyphs:
        for poly in g.polygons:
            for x, y in poly:
                xs.append(x)
                ys.append(y)
    if not xs:
        return 0.0, 0.0, 0.0, 0.0
    return min(xs), min(ys), max(xs), max(ys)


def normalize_glyph_layout(
    glyphs: list[GlyphArt],
    pad_x: float,
) -> tuple[list[GlyphArt], float]:
    min_x, _, max_x, _ = polygon_bounds(glyphs)
    shift = pad_x - min_x
    if abs(shift) < 1e-6:
        shift = 0.0
    normalized: list[GlyphArt] = []
    for g in glyphs:
        normalized.append(
            GlyphArt(
                polygons=shift_polygons_x(g.polygons, shift),
                fill=g.fill,
                x=g.x,
            )
        )
    width = (max_x - min_x) + 2 * pad_x
    return normalized, width


def load_michroma() -> TTFont:
    return TTFont(MICHROMA)


def build_wordmark_art(font: TTFont, variant: Variant) -> tuple[list[GlyphArt], float, float, float]:
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    ascender = font["hhea"].ascender
    descender = font["hhea"].descender

    glyphs: list[GlyphArt] = []
    x = 0.0
    for i, ch in enumerate(TEXT):
        gname = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[gname].draw(pen)
        polys = offset_glyph_polygons(pen.getCommands(), variant.offset)
        fill = NAVY if i < SPLIT else BLUE_LIGHT
        glyphs.append(GlyphArt(polygons=polys, fill=fill, x=x))
        x += font["hmtx"][gname][0] * (1.0 + variant.tracking)

    min_x = 0.0
    max_x = x
    width = max_x - min_x
    height = ascender - descender
    origin_x = (min_x + max_x) / 2.0
    origin_y = ascender / 2.0

    transformed: list[GlyphArt] = []
    for g in glyphs:
        tx = g.x - min_x
        polys = transform_polygons(
            g.polygons,
            tx,
            variant.scale_x,
            variant.scale_y,
            origin_x - min_x,
            origin_y,
        )
        transformed.append(GlyphArt(polygons=polys, fill=g.fill, x=0.0))

    pad_x = max(24.0, variant.offset * 1.5)
    normalized, width = normalize_glyph_layout(transformed, pad_x)
    return normalized, width, height, ascender


def make_svg(
    glyphs: list[GlyphArt],
    width: float,
    height: float,
    ascender: float,
    dark: bool = False,
) -> str:
    bg = NAVY_BG if dark else WHITE
    stance = WHITE if dark else NAVY
    pro = BLUE_DARK if dark else BLUE_LIGHT
    paths = []
    for g in glyphs:
        color = stance if g.fill == NAVY else pro
        d = glyph_compound_path_d(g.polygons)
        paths.append(f'    <path fill-rule="evenodd" fill="{color}" d="{d}"/>')
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.2f} {height:.2f}" width="{width:.2f}" height="{height:.2f}">
  <rect width="100%" height="100%" fill="{bg}"/>
  <g transform="scale(1,-1) translate(0,{-ascender:.2f})">
{chr(10).join(paths)}
  </g>
</svg>
"""


def _hex_to_rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    h = hex_color.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def glyph_mask(
    polygons: list[list[tuple[float, float]]],
    scale: float,
    ascender: float,
    out_w: int,
    out_h: int,
) -> Image.Image:
    mask = Image.new("L", (out_w, out_h), 0)
    for poly in polygons:
        if len(poly) < 3:
            continue
        pts = [
            (int(round(x * scale)), int(round((ascender - y) * scale)))
            for x, y in poly
        ]
        layer = Image.new("L", (out_w, out_h), 0)
        ImageDraw.Draw(layer).polygon(pts, fill=255)
        if signed_area(poly) < 0:
            mask = ImageChops.lighter(mask, layer)
        else:
            mask = ImageChops.subtract(mask, layer)
    return mask


def pad_transparent_wordmark(img: Image.Image, min_pad_px: int = 6) -> Image.Image:
    """Add even side padding so bold ink is not flush against the PNG edge."""
    bbox = img.getbbox()
    if not bbox:
        return img
    pad = max(min_pad_px, int(round(img.width * 0.006)))
    cropped = img.crop(bbox)
    out = Image.new(
        "RGBA",
        (cropped.width + pad * 2, cropped.height + pad * 2),
        (0, 0, 0, 0),
    )
    out.paste(cropped, (pad, pad))
    return out


def rasterize_glyphs(
    glyphs: list[GlyphArt],
    width: float,
    height: float,
    ascender: float,
    dark: bool,
    out_w: int,
    transparent: bool = False,
) -> Image.Image:
    scale = out_w / width
    out_h = max(1, int(round(height * scale)))
    if transparent:
        img = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
    else:
        bg = NAVY_BG if dark else WHITE
        img = Image.new("RGBA", (out_w, out_h), _hex_to_rgba(bg))

    stance = WHITE if dark else NAVY
    pro = BLUE_DARK if dark else BLUE_LIGHT
    for g in glyphs:
        color = stance if g.fill == NAVY else pro
        mask = glyph_mask(g.polygons, scale, ascender, out_w, out_h)
        rgba = _hex_to_rgba(color)
        layer = Image.new("RGBA", (out_w, out_h), rgba)
        layer.putalpha(mask)
        img = Image.alpha_composite(img, layer)

    if transparent:
        img = pad_transparent_wordmark(img)
    return img


def render_font_wordmark_png(
    font_path: Path,
    out_w: int,
    dark: bool,
) -> Image.Image:
    stance = (255, 255, 255) if dark else (26, 46, 97)
    pro = (63, 169, 245) if dark else (0, 122, 230)
    lo, hi = 10, 360
    best = lo
    while lo <= hi:
        mid = (lo + hi) // 2
        fnt = ImageFont.truetype(str(font_path), mid)
        if fnt.getlength(TEXT) <= out_w:
            best = mid
            lo = mid + 1
        else:
            hi = mid - 1
    fnt = ImageFont.truetype(str(font_path), best)
    tmp = Image.new("RGBA", (out_w + 40, 300), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tmp)
    y = 0
    draw.text((0, y), "STANCE", font=fnt, fill=stance + (255,))
    bb1 = draw.textbbox((0, y), "STANCE", font=fnt)
    draw.text((bb1[2], y), "PRO", font=fnt, fill=pro + (255,))
    bbox = tmp.getbbox()
    if not bbox:
        return tmp
    cropped = tmp.crop(bbox)
    scale = out_w / cropped.width
    new_h = max(1, int(cropped.height * scale))
    return cropped.resize((out_w, new_h), Image.LANCZOS)


def paste_lockup(
    canvas: Image.Image,
    wordmark: Image.Image,
    dark: bool,
    left_x: int,
    center_y: int,
    logo_h: int,
    gap: int,
) -> None:
    logo_path = LOGO_DARK if dark else LOGO_LIGHT
    logo = Image.open(logo_path).convert("RGBA")
    ow, oh = logo.size
    lw = int(ow * (logo_h / oh))
    logo_rs = logo.resize((lw, logo_h), Image.LANCZOS)
    ly = center_y - logo_h // 2
    canvas.paste(logo_rs, (left_x, ly), logo_rs)
    wx = left_x + lw + gap
    wy = center_y - wordmark.height // 2
    canvas.paste(wordmark, (wx, wy), wordmark)


def build_variant_assets(font: TTFont, variant: Variant) -> dict[str, Path]:
    glyphs, width, height, ascender = build_wordmark_art(font, variant)
    outputs: dict[str, Path] = {}

    for dark in (False, True):
        tag = "dark" if dark else "light"
        svg = make_svg(glyphs, width, height, ascender, dark=dark)
        svg_path = SVG_DIR / f"{variant.slug}_{tag}.svg"
        svg_path.write_text(svg, encoding="utf-8")
        outputs[f"svg_{tag}"] = svg_path

        png = rasterize_glyphs(glyphs, width, height, ascender, dark=dark, out_w=1400)
        png_path = PNG_DIR / f"{variant.slug}_{tag}.png"
        png.save(png_path)
        outputs[f"png_{tag}"] = png_path

    wordmark_only_light = rasterize_glyphs(
        glyphs, width, height, ascender, dark=False, out_w=1200, transparent=True
    )
    wordmark_only_dark = rasterize_glyphs(
        glyphs, width, height, ascender, dark=True, out_w=1200, transparent=True
    )
    outputs["wm_light"] = PNG_DIR / f"{variant.slug}_wordmark_light.png"
    outputs["wm_dark"] = PNG_DIR / f"{variant.slug}_wordmark_dark.png"
    wordmark_only_light.save(outputs["wm_light"])
    wordmark_only_dark.save(outputs["wm_dark"])
    return outputs


def sheet_row(
    canvas: Image.Image,
    draw: ImageDraw.ImageDraw,
    y: int,
    label: str,
    wordmark: Image.Image,
    logo_h: int = 72,
    left: int = 34,
) -> int:
    draw.text((left, y), label, fill=LABEL)
    content_y = y + 30
    row_h = max(logo_h, wordmark.height)
    paste_lockup(canvas, wordmark, dark=False, left_x=left, center_y=content_y + row_h // 2, logo_h=logo_h, gap=24)
    return content_y + row_h + 28


def build_compare_sheets(font: TTFont, variant_paths: dict[str, dict[str, Path]]) -> None:
    import generate_cards as gc

    target_w = 760
    michroma_wm = render_font_wordmark_png(MICHROMA, target_w, dark=False)
    eurostile_wm = render_font_wordmark_png(EUROSTILE, target_w, dark=False)
    rec_wm = Image.open(variant_paths[RECOMMENDED]["wm_light"]).convert("RGBA")
    rec_wm = rec_wm.resize(
        (target_w, int(rec_wm.height * (target_w / rec_wm.width))),
        Image.LANCZOS,
    )

    row_h = 150
    pad = 34
    title_h = 44
    canvas = Image.new("RGB", (1280, pad + title_h + row_h * 3 + pad), (248, 250, 255))
    draw = ImageDraw.Draw(canvas)
    title_font = ImageFont.truetype(gc.FONT_AVENIR, 22, index=gc.AV_DEMI)
    draw.text((pad, pad), "Brand wordmark comparison", font=title_font, fill=TITLE)
    y = pad + title_h
    y = sheet_row(canvas, draw, y, "Original Michroma Regular", michroma_wm)
    y = sheet_row(canvas, draw, y, f"Custom Michroma Bold-inspired ({RECOMMENDED})", rec_wm)
    sheet_row(canvas, draw, y, "Eurostile Extended Bold (reference)", eurostile_wm)
    out = OUT / "compare_brand_sheet.png"
    canvas.save(out, optimize=True)

    variants_canvas_h = pad + title_h + row_h * len(VARIANTS) + pad
    vcanvas = Image.new("RGB", (1280, variants_canvas_h), (248, 250, 255))
    vdraw = ImageDraw.Draw(vcanvas)
    vdraw.text((pad, pad), "Michroma bold-inspired variants", font=title_font, fill=TITLE)
    vy = pad + title_h
    for variant in VARIANTS:
        wm = Image.open(variant_paths[variant.slug]["wm_light"]).convert("RGBA")
        wm = wm.resize((target_w, int(wm.height * (target_w / wm.width))), Image.LANCZOS)
        vy = sheet_row(vcanvas, vdraw, vy, variant.label, wm)
    vcanvas.save(OUT / "compare_variants.png", optimize=True)


def build_background_mocks(variant_paths: dict[str, dict[str, Path]]) -> None:
    pad = 48
    logo_h = 88
    wm_w = 520
    row_h = 130
    canvas_w = 1100
    canvas_h = pad + row_h * len(VARIANTS) + pad

    for dark in (False, True):
        bg = (15, 28, 64, 255) if dark else (255, 255, 255, 255)
        canvas = Image.new("RGBA", (canvas_w, canvas_h), bg)
        y = pad
        for variant in VARIANTS:
            wm = Image.open(variant_paths[variant.slug]["wm_dark" if dark else "wm_light"]).convert("RGBA")
            wm = wm.resize((wm_w, int(wm.height * (wm_w / wm.width))), Image.LANCZOS)
            paste_lockup(
                canvas,
                wm,
                dark=dark,
                left_x=pad,
                center_y=y + row_h // 2,
                logo_h=logo_h,
                gap=28,
            )
            y += row_h
        tag = "dark" if dark else "light"
        canvas.save(MOCK_DIR / f"backgrounds_{tag}.png")

    rec_wm_light = Image.open(variant_paths[RECOMMENDED]["wm_light"]).convert("RGBA")
    rec_wm_dark = Image.open(variant_paths[RECOMMENDED]["wm_dark"]).convert("RGBA")
    for dark, wm, bg in (
        (False, rec_wm_light, (255, 255, 255, 255)),
        (True, rec_wm_dark, (15, 28, 64, 255)),
    ):
        wm_rs = wm.resize((720, int(wm.height * (720 / wm.width))), Image.LANCZOS)
        canvas = Image.new("RGBA", (980, 260), bg)
        paste_lockup(canvas, wm_rs, dark=dark, left_x=80, center_y=130, logo_h=110, gap=32)
        tag = "dark" if dark else "light"
        canvas.save(MOCK_DIR / f"lockup_{tag}.png")


def replace_wordmark_in_image(
    base: Image.Image,
    wm_light: Image.Image,
    wm_bbox: tuple[int, int, int, int],
    wm_center_y: int,
    bg_rgb: tuple[int, int, int],
) -> Image.Image:
    img = base.convert("RGBA")
    wm_w = wm_bbox[2] - wm_bbox[0]
    wm = wm_light.resize(
        (wm_w, int(wm_light.height * (wm_w / wm_light.width))),
        Image.LANCZOS,
    )
    draw = ImageDraw.Draw(img)
    clear_h = 40
    draw.rectangle(
        (wm_bbox[0], wm_bbox[1], max(wm_bbox[2], wm_bbox[0] + wm.width), wm_bbox[3] + clear_h),
        fill=bg_rgb + (255,),
    )
    wy = wm_center_y - wm.height // 2
    img.paste(wm, (wm_bbox[0], wy), wm)
    return img.convert("RGB")


def build_card_poster_mocks(variant_paths: dict[str, dict[str, Path]]) -> None:
    import generate_cards as gc
    import generate_posters as gp

    from preview_orbitron_assets import card_front_lockup, poster_lockup

    person = gc.PEOPLE[0]
    card_base = gc.render_front(person, dark=False)
    wm_bbox, wm_center_y = card_front_lockup(False)

    poster_w = 1200
    poster_base = gp.render_poster(gp.VARIANTS[0], width=poster_w)
    p_bbox, p_center_y, _ = poster_lockup(poster_w)

    for variant in VARIANTS:
        wm = Image.open(variant_paths[variant.slug]["wm_light"]).convert("RGBA")
        card = replace_wordmark_in_image(card_base, wm, wm_bbox, wm_center_y, (255, 255, 255))
        card.save(MOCK_DIR / f"card_{variant.slug}.png", dpi=(gc.DPI, gc.DPI))

        wm_dark = Image.open(variant_paths[variant.slug]["wm_dark"]).convert("RGBA")
        poster = replace_wordmark_in_image(
            poster_base, wm_dark, p_bbox, p_center_y, gp.NAVY_DEEP
        )
        poster.save(MOCK_DIR / f"poster_{variant.slug}.png", dpi=(150, 150), optimize=True)

    rec = RECOMMENDED
    wm = Image.open(variant_paths[rec]["wm_light"]).convert("RGBA")
    card = replace_wordmark_in_image(card_base, wm, wm_bbox, wm_center_y, (255, 255, 255))
    card.save(MOCK_DIR / f"card_recommended_{rec}.png", dpi=(gc.DPI, gc.DPI))
    wm_dark = Image.open(variant_paths[rec]["wm_dark"]).convert("RGBA")
    poster = replace_wordmark_in_image(poster_base, wm_dark, p_bbox, p_center_y, gp.NAVY_DEEP)
    poster.save(MOCK_DIR / f"poster_recommended_{rec}.png", dpi=(150, 150), optimize=True)


def write_recommendation() -> None:
    text = f"""StancePro Michroma Bold-inspired custom wordmark
==========================================

Recommended: {RECOMMENDED} (V3 Premium)

Why V3 Premium:
- Keeps Michroma's rounded geometric language without esports/crypto heaviness
- Offset (+22 UPM) thickens stems evenly; outer/hole contours handled separately
- Subtle scale (1.025 x / 1.015 y) adds presence without bloating curves
- Slight negative tracking (-1.2%) tightens the lockup for premium sports-tech use
- Best legibility on card + poster footer at print scale

Variants:
- v1_stem_plus: conservative stem thickening (+18 UPM) — safest, closest to Regular
- v2_structure: stronger offset (+28 UPM) — boldest, can feel slightly heavy at small sizes
- v3_premium: balanced custom bold — recommended for brand rollout
- v4_heavy: thicker stroke (+32 UPM) with tighter tracking — heaviest premium option
- v5_ultra: +8% heavier than V4 (+42 UPM) — maximum custom bold weight

Outputs:
- svg/          vector wordmarks (light + dark)
- png/          raster exports
- compare_brand_sheet.png
- compare_variants.png
- mocks/        card, poster, background lockups
"""
    (OUT / "RECOMMENDATION.txt").write_text(text, encoding="utf-8")


def main() -> None:
    for d in (OUT, SVG_DIR, PNG_DIR, MOCK_DIR):
        d.mkdir(parents=True, exist_ok=True)

    font = load_michroma()
    variant_paths: dict[str, dict[str, Path]] = {}
    for variant in VARIANTS:
        print(f"building {variant.slug}...")
        variant_paths[variant.slug] = build_variant_assets(font, variant)

    print("comparison sheets...")
    build_compare_sheets(font, variant_paths)
    print("background mocks...")
    build_background_mocks(variant_paths)
    print("card/poster mocks...")
    build_card_poster_mocks(variant_paths)
    write_recommendation()
    print(f"done -> {OUT}")
    print(f"recommended: {RECOMMENDED}")


if __name__ == "__main__":
    main()
