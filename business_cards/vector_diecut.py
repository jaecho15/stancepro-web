#!/usr/bin/env python3
"""True-vector die-cut sticker SVGs for print vendors (Illustrator / vinyl).

Artwork is SVG paths only — no embedded raster <image>. Crystal mark is
potrace-traced once from the Canva source; hex ring is geometric; wordmark is
outlined polygons from wordmark_stancepro; tagline is Avenir Next Medium outlines.

CutContour is a rounded rectangle around the lockup (0.125 in clearance). The
die is not a snowboard silhouette — "snowboard" names the placement product.
"""
from __future__ import annotations

import math
import re
import subprocess
import tempfile
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from fontTools.misc.transform import Transform
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTCollection
from PIL import Image

import build_michroma_bold_wordmark as B
from brand_logos import LOGO_DARK, LOGO_LIGHT
from build_stancepro_logo_from_crystal import (
    CRYSTAL_SRC,
    HEX_RADIUS_FRAC,
    HEX_STROKE_FRAC,
    SIZE as LOGO_SIZE,
    _hex_vertices,
)

HERE = Path(__file__).resolve().parent
MERCH = HERE / "merch"
ASSETS = MERCH / "assets"
CRYSTAL_TRACE_CACHE = ASSETS / "crystal_traced_path.txt"

DPI = 300
CUT_PAD_IN = 0.125
CUT_RADIUS_IN = 0.1
CUT_STROKE_PT = 0.75  # preview thickness; printers remap to CutContour spot

NAVY = "#1A2E61"
BLUE_LIGHT = "#007AE6"
BLUE_DARK = "#3FA9F5"
WHITE = "#FFFFFF"
CUT_MAGENTA = "#FF00FF"

# Content bbox of stancepro_logo_*_mark_512.png (cropped ink)
LOGO_CONTENT_BOX = (85, 59, 427, 453)  # L,T,R,B in 512 canvas
LOGO_CANVAS = LOGO_SIZE

HORIZONTAL_STICKER_LOGO_SCALE = 0.8
STICKER_WORDMARK_SCALE = 1.0
TAGLINE = "PORTAL TO YOUR WINTER"
AVENIR_TTC = "/System/Library/Fonts/Avenir Next.ttc"
AVENIR_MEDIUM_INDEX = 5


@dataclass(frozen=True)
class DiecutSpec:
    slug: str
    width_in: float
    height_in: float
    kind: str  # "snowboard" | "lockup_tagline"
    dark_ink: bool  # True = white/cyan ink for dark surfaces


DIECUTS: tuple[DiecutSpec, ...] = (
    DiecutSpec("sticker_snowboard_diecut_cutline_6x1.5in", 6.0, 1.5, "snowboard", False),
    DiecutSpec(
        "sticker_snowboard_diecut_cutline_dark_board_6x1.5in",
        6.0,
        1.5,
        "snowboard",
        True,
    ),
    DiecutSpec(
        "sticker_snowboard_diecut_cutline_10x2.5in", 10.0, 2.5, "snowboard", False
    ),
    DiecutSpec(
        "sticker_snowboard_diecut_cutline_dark_board_10x2.5in",
        10.0,
        2.5,
        "snowboard",
        True,
    ),
    DiecutSpec(
        "sticker_lockup_tagline_diecut_cutline_light_5.5x2in",
        5.5,
        2.0,
        "lockup_tagline",
        False,
    ),
    DiecutSpec(
        "sticker_lockup_tagline_diecut_cutline_dark_5.5x2in",
        5.5,
        2.0,
        "lockup_tagline",
        True,
    ),
)


def px(inches: float) -> float:
    return inches * DPI


def poly_to_path_d(pts: list[tuple[float, float]]) -> str:
    if len(pts) < 3:
        return ""
    parts = [f"M {pts[0][0]:.3f} {pts[0][1]:.3f}"]
    for x, y in pts[1:]:
        parts.append(f"L {x:.3f} {y:.3f}")
    parts.append("Z")
    return " ".join(parts)


@lru_cache(maxsize=1)
def crystal_path_d() -> str:
    """Potrace-traced crystal silhouette in source crop coordinates (858×968)."""
    if CRYSTAL_TRACE_CACHE.is_file():
        cached = CRYSTAL_TRACE_CACHE.read_text(encoding="utf-8").strip()
        if cached:
            return cached

    crystal = Image.open(CRYSTAL_SRC).convert("RGBA")
    w, h = crystal.size
    hard = Image.new("L", (w, h), 0)
    sp, hp = crystal.load(), hard.load()
    for y in range(h):
        for x in range(w):
            r, g, b, _ = sp[x, y]
            if r + g + b > 18:
                hp[x, y] = 255
    bbox = hard.getbbox()
    if not bbox:
        raise ValueError("Crystal mask empty")
    cropped = hard.crop(bbox)
    # Black foreground on white for potrace
    bw = cropped.point(lambda v: 0 if v > 128 else 255).convert("1")

    with tempfile.TemporaryDirectory() as tmp:
        pbm = Path(tmp) / "crystal.pbm"
        svg = Path(tmp) / "crystal.svg"
        bw.save(pbm)
        subprocess.run(
            [
                "potrace",
                str(pbm),
                "-s",
                "-o",
                str(svg),
                "--flat",
                "-a",
                "1.0",
                "-O",
                "0.2",
            ],
            check=True,
            capture_output=True,
        )
        text = svg.read_text(encoding="utf-8")

    # potrace wraps paths in g transform="translate(0,H) scale(0.1,-0.1)"
    m = re.search(
        r'<g\s+transform="translate\(0(?:\.0+)?(?:,|\s+)([0-9.]+)\)\s+'
        r'scale\(([0-9.eE+-]+),([0-9.eE+-]+)\)"[^>]*>\s*<path\s+d="([^"]+)"',
        text,
        re.DOTALL,
    )
    if not m:
        raise RuntimeError("Could not parse potrace crystal SVG")
    translate_y = float(m.group(1))
    sx, sy = float(m.group(2)), float(m.group(3))
    raw_d = m.group(4)

    # Bake transform into path via a simple coordinate rewrite is hard for
    # cubic curves; instead keep a nested <g> and store the raw path + params.
    # For callers we return a self-contained path in crop space by asking
    # potrace for numeric absolute coords via --group / re-export.
    # Simpler: store transform + d as a compact token.
    # Header line then path body (path may contain any char except we keep it raw)
    token = f"{translate_y} {sx} {sy}\n{raw_d}"
    ASSETS.mkdir(parents=True, exist_ok=True)
    CRYSTAL_TRACE_CACHE.write_text(token, encoding="utf-8")
    return token


def crystal_svg_group(*, fill: str, x: float, y: float, width: float, height: float) -> str:
    token = crystal_path_d()
    header, raw_d = token.split("\n", 1)
    translate_y_f, sx_f, sy_f = (float(p) for p in header.split())
    # Source crop size from crystal mask (matches potrace viewBox)
    src_w, src_h = 858.0, 968.0
    scale_x = width / src_w
    scale_y = height / src_h
    return (
        f'<g id="Crystal" transform="translate({x:.3f} {y:.3f}) '
        f'scale({scale_x:.6f} {scale_y:.6f}) '
        f'translate(0 {translate_y_f:.3f}) scale({sx_f} {sy_f})" '
        f'fill="{fill}" stroke="none">\n'
        f'  <path fill-rule="evenodd" d="{raw_d}" />\n'
        f"</g>"
    )


def hex_ring_path_d(cx: float, cy: float, outer_r: float, stroke_w: float) -> str:
    inner_r = max(outer_r - stroke_w, outer_r * 0.82)
    outer = _hex_vertices(cx, cy, outer_r)
    inner = list(reversed(_hex_vertices(cx, cy, inner_r)))
    return poly_to_path_d(outer) + " " + poly_to_path_d(inner)


def logo_mark_elements(
    *,
    dark: bool,
    x: float,
    y: float,
    height: float,
) -> tuple[str, float, float, tuple[float, float, float, float]]:
    """Vector logo mark (crystal + hex) placed with content top-left at (x,y).

    Returns (svg_snippet, width, height, bbox).
    """
    l, t, r, b = LOGO_CONTENT_BOX
    content_w = r - l
    content_h = b - t
    scale = height / content_h
    width = content_w * scale

    # Full-canvas geometry scaled into content space
    cx_full = LOGO_CANVAS / 2
    cy_full = LOGO_CANVAS / 2
    cx = x + (cx_full - l) * scale
    cy = y + (cy_full - t) * scale
    hex_r = LOGO_CANVAS * HEX_RADIUS_FRAC * scale
    stroke_w = LOGO_CANVAS * HEX_STROKE_FRAC * scale

    # Crystal placement mirrors build_stancepro_logo_from_crystal._compose_logo
    inner_r = hex_r - stroke_w
    target = inner_r * 2 * 0.78
    # Crystal crop aspect 858×968
    crystal_aspect = 858 / 968
    # scale so max side = target (same as compose: target / max(cropped.size))
    # cropped max side was max(858,968)=968 → scale = target/968
    # At vector we set height of crystal image:
    crystal_h = target  # since height was the larger dim after crop... wait
    # compose: scale = target / max(cropped.size); nw = w*scale, nh = h*scale
    # max was 968, so nh = target, nw = 858/968 * target
    crystal_h = target
    crystal_w = crystal_aspect * crystal_h
    crystal_x = cx - crystal_w / 2
    crystal_y = cy - crystal_h / 2

    if dark:
        crystal_fill = WHITE
        hex_fill = BLUE_DARK
    else:
        crystal_fill = BLUE_LIGHT
        hex_fill = NAVY

    crystal = crystal_svg_group(
        fill=crystal_fill, x=crystal_x, y=crystal_y, width=crystal_w, height=crystal_h
    )
    hex_d = hex_ring_path_d(cx, cy, hex_r, stroke_w)
    hex_el = (
        f'<path id="HexRing" fill-rule="evenodd" fill="{hex_fill}" '
        f'stroke="none" d="{hex_d}" />'
    )
    snippet = f'<g id="LogoMark">\n{crystal}\n{hex_el}\n</g>'
    bbox = (x, y, x + width, y + height)
    return snippet, width, height, bbox


def wordmark_elements(
    *,
    dark: bool,
    target_h: float,
    max_w: float | None = None,
    x: float,
    y: float,
) -> tuple[str, float, float, tuple[float, float, float, float]]:
    """Outlined STANCEPRO wordmark; (x,y) is top-left of ink bbox."""
    paths, ink_w, ink_h = _wordmark_ink_geometry()
    scale = target_h / ink_h
    out_w = ink_w * scale
    out_h = target_h
    if max_w and out_w > max_w:
        scale = max_w / ink_w
        out_w = max_w
        out_h = ink_h * scale

    parts: list[str] = ['<g id="Wordmark" fill-rule="evenodd" stroke="none">']
    for ch, polys, is_stance in paths:
        if dark:
            fill = WHITE if is_stance else BLUE_DARK
        else:
            fill = NAVY if is_stance else BLUE_LIGHT
        transformed = [
            [(x + px_ * scale, y + py * scale) for px_, py in poly] for poly in polys
        ]
        d = " ".join(poly_to_path_d(p) for p in transformed if len(p) >= 3)
        if d:
            parts.append(f'  <path id="wm_{ch}" fill="{fill}" d="{d}" />')
    parts.append("</g>")
    bbox = (x, y, x + out_w, y + out_h)
    return "\n".join(parts), out_w, out_h, bbox


@lru_cache(maxsize=1)
def _wordmark_ink_geometry():
    """Normalized wordmark polygons in ink-local coords (top-left origin, Y-down)."""
    from wordmark_stancepro import (
        BOX_GAP,
        TARGET_GAP,
        TUCK_DEPTH,
        WIDTH_OVERRIDE,
        glyph_polys,
        normalize_ink,
        optical_offset,
        set_width_keep_weight,
        silhouettes,
    )

    data = []
    for ch in B.TEXT:
        gp = glyph_polys(ch)
        if ch in WIDTH_OVERRIDE:
            gp = set_width_keep_weight(gp, WIDTH_OVERRIDE[ch])
        polys, w = normalize_ink(gp)
        left, right = silhouettes(polys)
        data.append((ch, polys, w, left, right))

    placed: list[tuple[str, list[list[tuple[float, float]]], bool]] = []
    prev_right_abs = None
    for i, (ch, polys, w, left, right) in enumerate(data):
        if prev_right_abs is None:
            origin = 0.0
        else:
            origin = optical_offset(prev_right_abs, left, TARGET_GAP)
            box_min = max(prev_right_abs.values()) + BOX_GAP
            origin = origin + (1.0 - TUCK_DEPTH) * max(0.0, box_min - origin)
        placed.append(
            (ch, [[(px_ + origin, py) for px_, py in p] for p in polys], i < B.SPLIT)
        )
        prev_right_abs = {yy: right[yy] + origin for yy in right}

    all_pts = [pt for _, polys, _ in placed for p in polys for pt in p]
    min_x = min(p[0] for p in all_pts)
    max_x = max(p[0] for p in all_pts)
    max_y = max(p[1] for p in all_pts)
    min_y = min(p[1] for p in all_pts)
    ink_w = max_x - min_x
    ink_h = max_y - min_y

    normalized = []
    for ch, polys, is_stance in placed:
        flipped = tuple(
            tuple(((px_ - min_x), (max_y - py)) for px_, py in poly) for poly in polys
        )
        normalized.append((ch, flipped, is_stance))
    return tuple(normalized), ink_w, ink_h


@lru_cache(maxsize=1)
def _avenir_medium():
    return TTCollection(AVENIR_TTC).fonts[AVENIR_MEDIUM_INDEX]


def tagline_elements(
    *,
    text: str,
    fill: str,
    font_size_px: float,
    tracking_px: float,
    x: float,
    y: float,
) -> tuple[str, float, float, tuple[float, float, float, float]]:
    """Outline tagline; (x,y) is top-left of ink (approx ascent box)."""
    font = _avenir_medium()
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    units_per_em = font["head"].unitsPerEm
    scale = font_size_px / units_per_em
    ascender = font["hhea"].ascent * scale
    # y is top of text block; baseline = y + ascender offset from ink top
    # Measure ink first
    glyphs = []
    cursor = 0.0
    for i, ch in enumerate(text):
        gname = cmap.get(ord(ch))
        if gname is None:
            continue
        pen = SVGPathPen(gs)
        gs[gname].draw(pen)
        advance = gs[gname].width * scale
        glyphs.append((ch, pen.getCommands(), cursor, advance))
        cursor += advance
        if i < len(text) - 1:
            cursor += tracking_px

    # Transform each glyph: scale, flip Y (font Y-up), place at baseline
    # Baseline at y + ascender so visual top ≈ y for caps
    baseline = y + ascender
    parts = [f'<g id="Tagline" fill="{fill}" stroke="none">']
    min_x = min_y = float("inf")
    max_x = max_y = float("-inf")
    for ch, path_d, ox, _adv in glyphs:
        if not path_d:
            continue
        # Parse roughly via TransformPen redraw
        gname = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        # fontTools Transform: xx,xy,yx,yy,dx,dy — Y flip: yy=-scale
        tp = TransformPen(
            pen,
            Transform(scale, 0, 0, -scale, x + ox, baseline),
        )
        gs[gname].draw(tp)
        d = pen.getCommands()
        if d:
            parts.append(f'  <path d="{d}" />')
            # rough bbox from advance
            min_x = min(min_x, x + ox)
            max_x = max(max_x, x + ox + _adv)
    parts.append("</g>")
    # Use font metrics for height
    descender = abs(font["hhea"].descent) * scale
    out_h = ascender + descender
    out_w = cursor
    bbox = (x, y, x + out_w, y + out_h)
    return "\n".join(parts), out_w, out_h, bbox


def wordmark_height_for_hex(hex_w: float, hex_h: float) -> float:
    side_from_h = hex_h / 2.0
    side_from_w = hex_w / math.sqrt(3)
    return max(1.0, min(side_from_h, side_from_w) * STICKER_WORDMARK_SCALE)


def layout_snowboard(
    *,
    width_in: float,
    height_in: float,
    dark: bool,
) -> tuple[str, tuple[float, float, float, float]]:
    w, h = px(width_in), px(height_in)
    # Match generate_merch.paste_sticker_lockup
    logo_path = LOGO_DARK if dark else LOGO_LIGHT
    content = Image.open(logo_path).convert("RGBA")
    cb = content.getbbox() or (0, 0, content.width, content.height)
    content_aspect = (cb[2] - cb[0]) / (cb[3] - cb[1])

    hex_h_ratio = 0.68
    gap = px(0.1)
    safe = px(0.30)
    base_hex_h = h * hex_h_ratio
    hex_h = base_hex_h * HORIZONTAL_STICKER_LOGO_SCALE
    hex_w = hex_h * content_aspect

    wm_h = wordmark_height_for_hex(hex_w, hex_h)
    # Measure wordmark width at this height
    _, wm_w, wm_h_actual, _ = wordmark_elements(
        dark=dark, target_h=wm_h, x=0, y=0
    )

    available_w = w - 2 * safe
    total_w = hex_w + gap + wm_w
    if total_w > available_w:
        scale = (available_w - gap) / (hex_w + wm_w)
        hex_h *= scale
        hex_w = hex_h * content_aspect
        wm_h = wordmark_height_for_hex(hex_w, hex_h)
        _, wm_w, wm_h_actual, _ = wordmark_elements(
            dark=dark, target_h=wm_h, x=0, y=0
        )
        total_w = hex_w + gap + wm_w
        while total_w > available_w and hex_h > 1:
            hex_h -= 1
            hex_w = hex_h * content_aspect
            wm_h = wordmark_height_for_hex(hex_w, hex_h)
            _, wm_w, wm_h_actual, _ = wordmark_elements(
                dark=dark, target_h=wm_h, x=0, y=0
            )
            total_w = hex_w + gap + wm_w

    cy = h / 2
    hex_x = (w - total_w) / 2
    hex_y = cy - hex_h / 2
    logo_svg, hex_w, hex_h, hex_bbox = logo_mark_elements(
        dark=dark, x=hex_x, y=hex_y, height=hex_h
    )
    wm_x = hex_bbox[2] + gap
    wm_y = cy - wm_h_actual / 2
    wm_svg, wm_w, wm_h_actual, wm_bbox = wordmark_elements(
        dark=dark, target_h=wm_h, x=wm_x, y=wm_y
    )

    art_bbox = (
        min(hex_bbox[0], wm_bbox[0]),
        min(hex_bbox[1], wm_bbox[1]),
        max(hex_bbox[2], wm_bbox[2]),
        max(hex_bbox[3], wm_bbox[3]),
    )
    body = f'<g id="Artwork">\n{logo_svg}\n{wm_svg}\n</g>'
    return body, art_bbox


def layout_lockup_tagline(
    *,
    width_in: float,
    height_in: float,
    dark: bool,
) -> tuple[str, tuple[float, float, float, float]]:
    w, h = px(width_in), px(height_in)
    logo_path = LOGO_DARK if dark else LOGO_LIGHT
    content = Image.open(logo_path).convert("RGBA")
    cb = content.getbbox() or (0, 0, content.width, content.height)
    content_aspect = (cb[2] - cb[0]) / (cb[3] - cb[1])

    safe = px(0.28)
    gap = px(0.10)
    available_w = w - 2 * safe
    hex_h = h * 0.55 * HORIZONTAL_STICKER_LOGO_SCALE
    stack_gap = max(4.0, hex_h * 0.08)
    wm_share = 0.62
    wm_h = max(12.0, hex_h * wm_share)
    tagline_h = max(10.0, hex_h - wm_h - stack_gap)

    hex_w = hex_h * content_aspect
    _, wm_w, wm_ink_h, _ = wordmark_elements(dark=dark, target_h=wm_h, x=0, y=0)

    total_w = hex_w + gap + wm_w
    if total_w > available_w:
        scale = (available_w - gap) / (hex_w + wm_w)
        hex_h *= scale
        stack_gap = max(4.0, hex_h * 0.08)
        wm_h = max(12.0, hex_h * wm_share)
        tagline_h = max(10.0, hex_h - wm_h - stack_gap)
        hex_w = hex_h * content_aspect
        _, wm_w, wm_ink_h, _ = wordmark_elements(dark=dark, target_h=wm_h, x=0, y=0)
        total_w = hex_w + gap + wm_w
        while total_w > available_w and hex_h > 1:
            hex_h -= 1
            stack_gap = max(4.0, hex_h * 0.08)
            wm_h = max(12.0, hex_h * wm_share)
            tagline_h = max(10.0, hex_h - wm_h - stack_gap)
            hex_w = hex_h * content_aspect
            _, wm_w, wm_ink_h, _ = wordmark_elements(
                dark=dark, target_h=wm_h, x=0, y=0
            )
            total_w = hex_w + gap + wm_w

    # Solid spot-friendly fills for print (not muted alpha)
    tag_fill = WHITE if dark else NAVY
    tracking = max(1.0, hex_h * 0.012)
    tag_font = max(10.0, min(tagline_h, tagline_h))
    while tag_font > 10 and tag_font > tagline_h + 1:
        tag_font -= 1
    # Prefer adjusting stack_gap so stack ≈ hex_h
    stack_gap = max(2.0, hex_h - wm_ink_h - tag_font * 0.85)

    cy = h / 2
    hex_top = cy - hex_h / 2
    hex_x = (w - total_w) / 2
    logo_svg, hex_w, hex_h, hex_bbox = logo_mark_elements(
        dark=dark, x=hex_x, y=hex_top, height=hex_h
    )
    text_left = hex_bbox[2] + gap
    wm_svg, wm_w, wm_ink_h, wm_bbox = wordmark_elements(
        dark=dark, target_h=wm_h, x=text_left, y=hex_top
    )
    tag_y = hex_top + wm_ink_h + stack_gap
    tag_svg, tag_w, tag_h, tag_bbox = tagline_elements(
        text=TAGLINE,
        fill=tag_fill,
        font_size_px=tag_font,
        tracking_px=tracking,
        x=text_left,
        y=tag_y,
    )

    art_bbox = (
        min(hex_bbox[0], wm_bbox[0], tag_bbox[0]),
        min(hex_bbox[1], wm_bbox[1], tag_bbox[1]),
        max(hex_bbox[2], wm_bbox[2], tag_bbox[2]),
        max(hex_bbox[3], wm_bbox[3], tag_bbox[3]),
    )
    body = f'<g id="Artwork">\n{logo_svg}\n{wm_svg}\n{tag_svg}\n</g>'
    return body, art_bbox


def cutcontour_rect(
    bbox: tuple[float, float, float, float],
) -> str:
    pad = px(CUT_PAD_IN)
    radius = px(CUT_RADIUS_IN)
    x = bbox[0] - pad
    y = bbox[1] - pad
    cw = bbox[2] - bbox[0] + pad * 2
    ch = bbox[3] - bbox[1] + pad * 2
    stroke_w = max(2.0, DPI / 72 * CUT_STROKE_PT)
    return (
        f'<rect id="CutContour" x="{x:.3f}" y="{y:.3f}" '
        f'width="{cw:.3f}" height="{ch:.3f}" '
        f'rx="{radius:.3f}" ry="{radius:.3f}" fill="none" '
        f'stroke="{CUT_MAGENTA}" stroke-width="{stroke_w:.3f}" />'
    )


def write_diecut_svg(spec: DiecutSpec, destination: Path) -> Path:
    w, h = px(spec.width_in), px(spec.height_in)
    if spec.kind == "snowboard":
        artwork, art_bbox = layout_snowboard(
            width_in=spec.width_in,
            height_in=spec.height_in,
            dark=spec.dark_ink,
        )
    else:
        artwork, art_bbox = layout_lockup_tagline(
            width_in=spec.width_in,
            height_in=spec.height_in,
            dark=spec.dark_ink,
        )
    cut = cutcontour_rect(art_bbox)
    ink_note = (
        "white + cyan ink (dark surfaces)"
        if spec.dark_ink
        else "navy + blue ink (light surfaces)"
    )
    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
  width="{spec.width_in:g}in" height="{spec.height_in:g}in"
  viewBox="0 0 {w:g} {h:g}">
  <!-- True vector die-cut: paths only (no embedded raster). Transparent — no background fill. -->
  <!-- Ink: {ink_note}. Magenta CutContour = die line (remap to printer spot color). -->
  {artwork}
  {cut}
</svg>
"""
    destination.write_text(svg, encoding="utf-8")
    return destination


def write_all_diecut_svgs(destination_dir: Path) -> list[Path]:
    destination_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for spec in DIECUTS:
        path = destination_dir / f"{spec.slug}.svg"
        write_diecut_svg(spec, path)
        written.append(path)
        # Sanity: no embedded images
        text = path.read_text(encoding="utf-8")
        if "<image" in text.lower() or "data:image" in text:
            raise RuntimeError(f"Vector SVG still contains raster embed: {path}")
        print(f"vector diecut: {path.name}")
    return written


if __name__ == "__main__":
    out = MERCH / "vector_diecut"
    write_all_diecut_svgs(out)
    print(f"Wrote {len(DIECUTS)} SVGs → {out}")
