"""Compose StancePro logo from Canva snow crystal + vector hex outline."""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
MERCH = HERE / "merch"
ASSETS = MERCH / "assets"
CRYSTAL_SRC = ASSETS / "crystal_canva_1024.png"
LOGO_SOURCES = HERE / "AppIconSources"
GOOGLE_PLAY = HERE / "GooglePlayAssets"

SIZE = 512
RENDER = 4  # supersample for smooth hex edges

# Dark logo — outline hex (AppIcon / loading_logo style)
BG_TOP = (20, 32, 63)
BG_BOT = (25, 46, 95)
HEX_STROKE_D = (63, 169, 245)

# Light logo
CREAM = (249, 247, 240)
HEX_STROKE_L = (26, 46, 97)
CRYSTAL_TOP = (92, 206, 255)
CRYSTAL_BOT = (8, 118, 242)

HEX_RADIUS_FRAC = 0.38
HEX_STROKE_FRAC = 0.056  # stroke width relative to canvas size @ 1×


def _lerp(a: tuple, b: tuple, t: float) -> tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _hex_vertices(cx: float, cy: float, radius: float) -> list[tuple[float, float]]:
    """Pointy-top regular hex; radius = center to vertex."""
    return [
        (
            cx + radius * math.cos(math.radians(60 * i - 90)),
            cy + radius * math.sin(math.radians(60 * i - 90)),
        )
        for i in range(6)
    ]


def _point_in_poly(x: float, y: float, poly: list[tuple[float, float]]) -> bool:
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if ((y1 > y) != (y2 > y)) and (
            x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-9) + x1
        ):
            inside = not inside
    return inside


def _vertical_gradient(w: int, h: int, top: tuple, bot: tuple) -> Image.Image:
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        c = _lerp(top, bot, y / max(1, h - 1))
        for x in range(w):
            px[x, y] = c
    return img


def _extract_crystal_mask(src: Image.Image) -> Image.Image:
    """Alpha mask from Canva export (dark crystal on black)."""
    src = src.convert("RGBA")
    w, h = src.size
    hard = Image.new("L", (w, h), 0)
    sp, hp = src.load(), hard.load()
    for y in range(h):
        for x in range(w):
            r, g, b, _ = sp[x, y]
            if r + g + b > 18:
                hp[x, y] = 255
    return hard.filter(ImageFilter.GaussianBlur(radius=1.2))


def _render_crystal(
    mask: Image.Image,
    *,
    solid: tuple[int, int, int] | None = None,
    grad_top: tuple[int, int, int] | None = None,
    grad_bot: tuple[int, int, int] | None = None,
) -> Image.Image:
    w, h = mask.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    mp, op = mask.load(), out.load()
    y0, y1 = mask.getbbox()[1], mask.getbbox()[3]
    for y in range(h):
        t = (y - y0) / max(1, y1 - y0)
        row = solid if solid else _lerp(grad_top or CRYSTAL_TOP, grad_bot or CRYSTAL_BOT, t)
        for x in range(w):
            a = mp[x, y]
            if a:
                op[x, y] = row + (a,)
    return out


def _draw_hex_stroke(
    w: int,
    h: int,
    cx: float,
    cy: float,
    radius: float,
    stroke_w: float,
    color: tuple[int, int, int],
) -> Image.Image:
    """Hex outline only — outer ring between outer and inner hex."""
    outer = _hex_vertices(cx, cy, radius)
    inner = _hex_vertices(cx, cy, max(radius - stroke_w, radius * 0.82))
    xs = [p[0] for p in outer]
    ys = [p[1] for p in outer]
    x0, x1 = max(0, int(min(xs))), min(w, int(max(xs)) + 1)
    y0, y1 = max(0, int(min(ys))), min(h, int(max(ys)) + 1)
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = layer.load()
    for y in range(y0, y1):
        for x in range(x0, x1):
            if _point_in_poly(x + 0.5, y + 0.5, outer) and not _point_in_poly(
                x + 0.5, y + 0.5, inner
            ):
                px[x, y] = color + (255,)
    return layer


def _compose_logo(
    crystal: Image.Image,
    *,
    hex_stroke: tuple[int, int, int],
    crystal_mode: str,
    bg_top: tuple | None = None,
    bg_bot: tuple | None = None,
) -> Image.Image:
    s = SIZE * RENDER
    if bg_top is not None:
        canvas = _vertical_gradient(s, s, bg_top, bg_bot or bg_top).convert("RGBA")
    else:
        canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    cx = cy = s / 2
    hex_r = s * HEX_RADIUS_FRAC
    stroke_w = s * HEX_STROKE_FRAC

    mask = _extract_crystal_mask(crystal)
    bbox = mask.getbbox()
    if not bbox:
        raise ValueError("Crystal mask empty")
    cropped = mask.crop(bbox)
    inner_r = hex_r - stroke_w
    target = int(inner_r * 2 * 0.78)
    scale = target / max(cropped.size)
    nw = max(1, int(cropped.width * scale))
    nh = max(1, int(cropped.height * scale))
    mask_rs = cropped.resize((nw, nh), Image.LANCZOS)

    if crystal_mode == "white":
        crystal_rs = _render_crystal(mask_rs, solid=(255, 255, 255))
    else:
        crystal_rs = _render_crystal(mask_rs, grad_top=CRYSTAL_TOP, grad_bot=CRYSTAL_BOT)

    x = int(cx - nw / 2)
    y = int(cy - nh / 2)
    canvas.paste(crystal_rs, (x, y), crystal_rs)
    hex_layer = _draw_hex_stroke(s, s, cx, cy, hex_r, stroke_w, hex_stroke)
    canvas = Image.alpha_composite(canvas, hex_layer)
    return canvas.resize((SIZE, SIZE), Image.LANCZOS).convert("RGBA")


def build_dark(crystal: Image.Image) -> Image.Image:
    return _compose_logo(
        crystal,
        bg_top=BG_TOP,
        bg_bot=BG_BOT,
        hex_stroke=HEX_STROKE_D,
        crystal_mode="white",
    )


def build_light(crystal: Image.Image) -> Image.Image:
    return _compose_logo(
        crystal,
        bg_top=CREAM,
        bg_bot=CREAM,
        hex_stroke=HEX_STROKE_L,
        crystal_mode="gradient",
    )


def build_dark_mark(crystal: Image.Image) -> Image.Image:
    """Transparent mark for navy/dark backgrounds (cards, posters)."""
    return _compose_logo(
        crystal,
        hex_stroke=HEX_STROKE_D,
        crystal_mode="white",
    )


def build_light_mark(crystal: Image.Image) -> Image.Image:
    """Transparent mark for white/cream backgrounds."""
    return _compose_logo(
        crystal,
        hex_stroke=HEX_STROKE_L,
        crystal_mode="gradient",
    )


def _save_compare_sheet(
    path: Path,
    *,
    title: str,
    subtitle: str,
    dark: Image.Image,
    light: Image.Image,
    dark_label: str,
    light_label: str,
) -> None:
    font = "/System/Library/Fonts/Avenir Next.ttc"
    navy_deep = (15, 28, 64)
    cell, pad, label_h = 300, 36, 48
    sheet = Image.new("RGBA", (pad * 3 + cell * 2, 96 + pad + cell + label_h + pad), navy_deep + (255,))
    draw = ImageDraw.Draw(sheet)
    title_f = ImageFont.truetype(font, size=26, index=8)
    sub_f = ImageFont.truetype(font, size=12, index=5)
    label_f = ImageFont.truetype(font, size=15, index=2)
    draw.text((pad, 20), title, font=title_f, fill=(255, 255, 255))
    draw.text((pad, 54), subtitle, font=sub_f, fill=(63, 169, 245))
    for i, (label, img, mat_bg) in enumerate(
        [(dark_label, dark, (24, 36, 72)), (light_label, light, CREAM)]
    ):
        x = pad + i * (cell + pad)
        y = 96 + pad
        rs = img.resize((280, 280), Image.LANCZOS)
        mat = Image.new("RGBA", (cell, cell + label_h), mat_bg + (255,))
        mdraw = ImageDraw.Draw(mat)
        mat.paste(rs, ((cell - rs.width) // 2, 10), rs)
        tw = mdraw.textlength(label, font=label_f)
        mdraw.text(
            ((cell - tw) // 2, cell + 12),
            label,
            font=label_f,
            fill=(255, 255, 255) if i == 0 else (26, 46, 97),
        )
        sheet.paste(mat, (x, y), mat)
    sheet.convert("RGB").save(path, dpi=(144, 144))


def save_outputs(crystal_path: Path = CRYSTAL_SRC) -> dict[str, Path]:
    MERCH.mkdir(parents=True, exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)
    LOGO_SOURCES.mkdir(parents=True, exist_ok=True)
    GOOGLE_PLAY.mkdir(parents=True, exist_ok=True)
    crystal = Image.open(crystal_path)
    if crystal_path != CRYSTAL_SRC:
        crystal.save(CRYSTAL_SRC)

    dark = build_dark(crystal)
    light = build_light(crystal)
    dark_mark = build_dark_mark(crystal)
    light_mark = build_light_mark(crystal)

    logo_dark = MERCH / "stancepro_logo_dark_512.png"
    logo_light = MERCH / "stancepro_logo_light_512.png"
    logo_compare = MERCH / "stancepro_logo_dark_light_compare.png"
    mark_dark = MERCH / "stancepro_logo_dark_mark_512.png"
    mark_light = MERCH / "stancepro_logo_light_mark_512.png"
    play_dark = MERCH / "google_play_icon_dark_512.png"
    play_light = MERCH / "google_play_icon_light_512.png"
    play_compare = MERCH / "google_play_icon_dark_light_compare.png"

    dark.save(logo_dark)
    light.save(logo_light)
    dark_mark.save(mark_dark)
    light_mark.save(mark_light)
    dark.save(LOGO_SOURCES / "StancePro-Logo-dark-512.png")
    light.save(LOGO_SOURCES / "StancePro-Logo-light-512.png")

    dark.save(play_dark)
    light.save(play_light)
    light.save(GOOGLE_PLAY / "google-play-icon-light-512.png")

    _save_compare_sheet(
        logo_compare,
        title="STANCEPRO LOGO — DARK vs LIGHT",
        subtitle="Canva crystal + hex outline only",
        dark=dark,
        light=light,
        dark_label="Dark — navy bg",
        light_label="Light — cream bg",
    )
    _save_compare_sheet(
        play_compare,
        title="GOOGLE PLAY MARK — DARK vs LIGHT",
        subtitle="Canva crystal + hex outline only · Play Store",
        dark=dark,
        light=light,
        dark_label="Dark — Play Store",
        light_label="Light — cream bg",
    )

    return {
        "logo_dark": logo_dark,
        "logo_light": logo_light,
        "logo_compare": logo_compare,
        "mark_dark": mark_dark,
        "mark_light": mark_light,
        "play_dark": play_dark,
        "play_light": play_light,
        "play_compare": play_compare,
    }


if __name__ == "__main__":
    import shutil
    import sys

    src = Path(
        "/Users/jchomba2025/.cursor/projects/Users-jchomba2025-App-Dev/assets/"
        "StancePro_Logo_snow__2000_x_2000_px_-26b2ed51-23ff-4c1b-aacf-144c0f239d2d.png"
    )
    if len(sys.argv) > 1:
        src = Path(sys.argv[1])
    ASSETS.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, CRYSTAL_SRC)
    paths = save_outputs(CRYSTAL_SRC)
    for key, path in paths.items():
        print(f"{key}: {path.name}")
    print("copied: StancePro-Logo-dark-512.png, StancePro-Logo-light-512.png")
    print("copied: GooglePlayAssets/google-play-icon-light-512.png")
