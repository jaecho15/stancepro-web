"""Generate StancePro feature-focused posters (A1 portrait).

Themes using App Store screenshots in phone mockups:
  - setup           — snowboard + ski stance & gear setup
  - coaching        — AI video coaching & coach reviews
  - ride_nav        — ride tracker + resort maps

Output: posters/poster_<slug>_preview.png (+ print when GENERATE_PRINT=1)
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import qrcode
from qrcode.constants import ERROR_CORRECT_M
from PIL import Image, ImageDraw, ImageFont

import generate_posters as gp

HERE = Path(__file__).resolve().parent
POSTER_DIR = HERE
OUT_DIR = POSTER_DIR / "posters"
SCREENSHOT_DIR = HERE / "screenshots"

FONT_AVENIR = "/System/Library/Fonts/Avenir Next.ttc"
FONT_AVENIR_COND = "/System/Library/Fonts/Avenir Next Condensed.ttc"
FONT_HELV_NEUE = "/System/Library/Fonts/HelveticaNeue.ttc"

AV_REG = 7
AV_MED = 5
AV_BOLD = 0
AVC_HEAVY = 8
AVC_DEMI = 2

NAVY = (26, 46, 97)
NAVY_DEEP = (15, 28, 64)
WHITE = (255, 255, 255)
BLUE_ACCENT = (63, 169, 245)
MUTED_WHITE = (255, 255, 255, 180)
PHONE_BEZEL = (12, 22, 48)
PHONE_BORDER = (80, 120, 180)

SMART_DOWNLOAD_URL = "https://stance-pro.com/d"
PILLARS_FOOTNOTE = "…and much more on iOS & Android."
DEMO_USER_NAME = "Scottie"
HEADER_BG = (26, 30, 45)
HEADER_MUTED = (131, 134, 140)


@dataclass(frozen=True)
class PhonePlacement:
    screenshot: Path
    center_x_frac: float  # 0–1 across hero width
    center_y_frac: float  # 0–1 within hero band
    height_frac: float    # phone height as fraction of hero band height
    rotation_deg: float = 0.0


@dataclass(frozen=True)
class FeaturePoster:
    slug: str
    headline: str
    subhead: str
    pillars: tuple[tuple[str, str], tuple[str, str], tuple[str, str]]
    phones: tuple[PhonePlacement, ...]
    sanitize_name: bool = False
    extra_margin_ref: int = 0        # adds to margin_x throughout the poster (bleed)
    bottom_margin_extra_ref: int = 0 # adds to margin_x only on the bottom divider line


POSTERS: list[FeaturePoster] = [
    FeaturePoster(
        slug="setup",
        headline="DIAL YOUR SETUP.",
        subhead="Science-backed stance & gear setup in 60 seconds.",
        sanitize_name=True,
        pillars=(
            ("STANCE & GEAR CALCULATOR", "Angles, width and board length — dialled in."),
            ("BOOT & BINDING MATCH", "Keep board, boots and bindings in sync."),
            ("SUITABILITY ANALYSIS", "Check your combo before you hit the hill."),
        ),
        phones=(
            PhonePlacement(
                SCREENSHOT_DIR / "08_stance_gear_setup_1284x2778.png",
                center_x_frac=0.38,
                center_y_frac=0.50,
                height_frac=0.94,
                rotation_deg=-4,
            ),
            PhonePlacement(
                SCREENSHOT_DIR / "09_ski_gear_setup_1284x2778.png",
                center_x_frac=0.66,
                center_y_frac=0.50,
                height_frac=0.94,
                rotation_deg=4,
            ),
        ),
    ),
    FeaturePoster(
        slug="coaching",
        headline="GET COACHED ANYWHERE.",
        subhead="AI analysis + human feedback from one clip.",
        extra_margin_ref=20,
        pillars=(
            ("AI VIDEO COACHING", "Movement analysis from one phone clip."),
            ("SESSION BREAKDOWN", "Spot what to fix — strengths and improvements, frame by frame."),
            ("CERTIFIED COACH REVIEWS", "Improve faster with feedback from certified coaches."),
        ),
        phones=(
            PhonePlacement(
                SCREENSHOT_DIR / "06_pose_analysis_1284x2778.png",
                center_x_frac=0.26,
                center_y_frac=0.52,
                height_frac=0.86,
                rotation_deg=-7,
            ),
            PhonePlacement(
                SCREENSHOT_DIR / "03_session_details_1284x2778.png",
                center_x_frac=0.50,
                center_y_frac=0.48,
                height_frac=0.96,
                rotation_deg=0,
            ),
            PhonePlacement(
                SCREENSHOT_DIR / "05_coaching_rail_1284x2778.png",
                center_x_frac=0.76,
                center_y_frac=0.52,
                height_frac=0.86,
                rotation_deg=7,
            ),
        ),
    ),
    FeaturePoster(
        slug="ride_nav",
        headline="TRACK. NAVIGATE. RIDE.",
        subhead="Every run. Every resort. In your pocket.",
        pillars=(
            ("LIVE RIDE TRACKING", "Speed, vertical, jumps, turns & calories."),
            ("RESORT MAPS & NAV", "Step-by-step routing across the mountain."),
            ("SESSION BREAKDOWN", "Elevation profiles, maps & event replay."),
        ),
        phones=(
            PhonePlacement(
                SCREENSHOT_DIR / "02_ride_stats_1284x2778.png",
                center_x_frac=0.36,
                center_y_frac=0.50,
                height_frac=0.94,
                rotation_deg=-4,
            ),
            PhonePlacement(
                SCREENSHOT_DIR / "01_resort_maps_1284x2778.png",
                center_x_frac=0.66,
                center_y_frac=0.50,
                height_frac=0.94,
                rotation_deg=4,
            ),
        ),
    ),
]


def fnt(path: str, size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size, index=index)


def make_qr(data: str, size_px: int) -> Image.Image:
    qr = qrcode.QRCode(version=None, error_correction=ERROR_CORRECT_M, box_size=10, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color=NAVY, back_color=WHITE).convert("RGBA")
    return img.resize((size_px, size_px), Image.LANCZOS)


def vertical_gradient(w: int, h: int, top_rgba: tuple, bot_rgba: tuple) -> Image.Image:
    grad = Image.new("RGBA", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        r = int(top_rgba[0] * (1 - t) + bot_rgba[0] * t)
        g = int(top_rgba[1] * (1 - t) + bot_rgba[1] * t)
        b = int(top_rgba[2] * (1 - t) + bot_rgba[2] * t)
        a = int(top_rgba[3] * (1 - t) + bot_rgba[3] * t)
        grad.putpixel((0, y), (r, g, b, a))
    return grad.resize((w, h), Image.BILINEAR)


def draw_letterspaced(
    draw: ImageDraw.ImageDraw,
    pos: tuple[int, int],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill,
    extra_spacing_px: int = 4,
) -> None:
    x, y = pos
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += int(font.getlength(ch)) + extra_spacing_px


def _header_text_bands(img: Image.Image) -> list[tuple[int, int, int, int]]:
    """Bright text row clusters in the home header (welcome line, then name line)."""
    w, h = img.size
    px = img.load()
    x_lo, x_hi = int(0.24 * w), int(0.78 * w)
    y_lo, y_hi = int(0.09 * h), int(0.16 * h)

    bright_rows: list[int] = []
    for y in range(y_lo, y_hi):
        hits = 0
        for x in range(x_lo, x_hi, 2):
            r, g, b = px[x, y][:3]
            if r > 200 and g > 200 and b > 200:
                hits += 1
        if hits >= 8:
            bright_rows.append(y)

    if not bright_rows:
        return []

    clusters: list[list[int]] = []
    cluster = [bright_rows[0]]
    for y in bright_rows[1:]:
        if y - cluster[-1] <= 3:
            cluster.append(y)
        else:
            clusters.append(cluster)
            cluster = [y]
    clusters.append(cluster)

    boxes: list[tuple[int, int, int, int]] = []
    for rows in clusters:
        y1 = max(y_lo, min(rows) - 6)
        y2 = min(y_hi, max(rows) + 10)
        xs: list[int] = []
        for y in range(y1, y2):
            for x in range(x_lo, x_hi):
                r, g, b = px[x, y][:3]
                if r > 200 and g > 200 and b > 200:
                    xs.append(x)
        if not xs:
            continue
        x1 = max(0, min(xs) - 8)
        x2 = min(w, max(xs) + 12)
        if (x2 - x1) < int(0.12 * w) or (y2 - y1) < 14:
            continue
        boxes.append((x1, y1, x2, y2))
    boxes.sort(key=lambda b: b[1])
    return boxes


def _name_band(bands: list[tuple[int, int, int, int]]) -> tuple[int, int, int, int] | None:
    """Second substantial text row under 'Welcome back,' (skip icon specks)."""
    if not bands:
        return None
    if len(bands) == 1:
        return bands[0]
    return bands[1]


def _sample_header_bg(img: Image.Image, x1: int, y1: int, x2: int, y2: int) -> tuple[int, int, int]:
    w, h = img.size
    for x, y in (
        (x1 - 6, y1 + 6),
        (x2 + 14, y1 + 8),
        (x1 + 24, y2 + 5),
        (int(0.55 * w), y2 + 8),
    ):
        if 0 <= x < w and 0 <= y < h:
            r, g, b = img.getpixel((x, y))[:3]
            if r + g + b < 360:
                return (r, g, b)
    return HEADER_BG


def apply_demo_welcome_name(img: Image.Image) -> Image.Image:
    """Replace only the second header line (user name) with DEMO_USER_NAME."""
    w, h = img.size
    scale = w / 1284.0
    out = img.copy()
    draw = ImageDraw.Draw(out)

    bands = _header_text_bands(out)
    name_box = _name_band(bands)
    if name_box:
        x1, y1, x2, y2 = name_box
    else:
        x1, x2 = int(0.255 * w), int(0.61 * w)
        y1, y2 = int(0.123 * h), int(0.152 * h)

    bg = _sample_header_bg(out, x1, y1, x2, y2)
    draw.rectangle((x1, y1, x2, y2), fill=bg)

    name_font = fnt(FONT_HELV_NEUE, max(56, int(82 * scale)), 1)
    bbox = draw.textbbox((0, 0), DEMO_USER_NAME, font=name_font)
    text_h = bbox[3] - bbox[1]
    ty = y1 + (y2 - y1 - text_h) // 2 - bbox[1]
    draw.text((x1, ty), DEMO_USER_NAME, font=name_font, fill=WHITE)
    return out


def make_phone_mockup(screenshot: Image.Image, phone_h: int, S: float) -> Image.Image:
    """Rounded phone frame with screenshot inside."""
    bezel = max(6, int(10 * S))
    radius = max(18, int(28 * S))
    aspect = screenshot.width / screenshot.height
    phone_w = int(phone_h * aspect)
    screen_h = phone_h - bezel * 2
    screen_w = phone_w - bezel * 2
    screen = screenshot.resize((screen_w, screen_h), Image.LANCZOS)

    phone = Image.new("RGBA", (phone_w, phone_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(phone)
    draw.rounded_rectangle(
        (0, 0, phone_w - 1, phone_h - 1),
        radius=radius,
        fill=PHONE_BEZEL + (255,),
        outline=PHONE_BORDER + (200,),
        width=max(2, int(2 * S)),
    )
    phone.paste(screen, (bezel, bezel))

    # subtle highlight along top edge
    highlight = Image.new("RGBA", (phone_w, phone_h), (0, 0, 0, 0))
    hdraw = ImageDraw.Draw(highlight)
    hdraw.rounded_rectangle(
        (bezel, bezel, phone_w - bezel, bezel + int(40 * S)),
        radius=max(8, int(12 * S)),
        fill=(255, 255, 255, 28),
    )
    phone = Image.alpha_composite(phone, highlight)
    return phone


def paste_rotated(base: Image.Image, overlay: Image.Image, cx: int, cy: int, angle: float) -> None:
    if angle:
        overlay = overlay.rotate(angle, resample=Image.BICUBIC, expand=True)
    x = cx - overlay.width // 2
    y = cy - overlay.height // 2
    base.paste(overlay, (x, y), overlay)


def paste_v_centered(
    base: Image.Image,
    overlay: Image.Image,
    x: int,
    target_h: int,
    center_y: int,
) -> tuple[int, int, int, int]:
    ow, oh = overlay.size
    new_w = int(ow * (target_h / oh))
    rs = overlay.resize((new_w, target_h), Image.LANCZOS)
    y = center_y - target_h // 2
    base.paste(rs, (x, y), rs)
    return (x, y, x + new_w, y + target_h)


def render_hero_phones(
    canvas: Image.Image,
    spec: FeaturePoster,
    hero_h: int,
    width: int,
    S: float,
    letterhead_h: int = 0,
) -> None:
    """Hero band with phone mockups. letterhead_h extends the navy glow upward."""
    total_h = hero_h + letterhead_h
    hero_bg = Image.new("RGBA", (width, total_h), NAVY_DEEP + (255,))
    glow = vertical_gradient(
        width, total_h,
        top_rgba=(30, 55, 110, 180),
        bot_rgba=NAVY_DEEP + (255,),
    )
    hero_bg = Image.alpha_composite(hero_bg, glow)
    canvas.paste(hero_bg, (0, 0))

    # phones sorted back-to-front: outer tilted first, center last (on top)
    order = sorted(range(len(spec.phones)), key=lambda i: abs(spec.phones[i].rotation_deg))
    for idx in order:
        p = spec.phones[idx]
        shot = Image.open(p.screenshot).convert("RGB")
        if spec.sanitize_name:
            shot = apply_demo_welcome_name(shot)
        phone_h = int(hero_h * p.height_frac)
        phone = make_phone_mockup(shot, phone_h, S)
        cx = int(width * p.center_x_frac)
        cy = letterhead_h + int(hero_h * p.center_y_frac)
        paste_rotated(canvas, phone, cx, cy, p.rotation_deg)

    # fade into content block
    fade_h = int(hero_h * 0.35)
    fade = vertical_gradient(
        width, fade_h,
        top_rgba=(NAVY_DEEP[0], NAVY_DEEP[1], NAVY_DEEP[2], 0),
        bot_rgba=NAVY_DEEP + (255,),
    )
    canvas.paste(fade, (0, letterhead_h + hero_h - fade_h), fade)


def render_feature_poster(spec: FeaturePoster, width: int) -> Image.Image:
    A1_RATIO = 841 / 594
    height = int(round(width * A1_RATIO))
    S = width / 1200.0
    margin_x = int((70 + spec.extra_margin_ref) * S)

    canvas = Image.new("RGBA", (width, height), NAVY_DEEP + (255,))
    draw = ImageDraw.Draw(canvas)

    HERO_H = int(height * 0.40)
    letterhead_h = int(gp.CONTENT_ABOVE_DIVIDER_OFFSET_REF * S)
    render_hero_phones(canvas, spec, HERO_H, width, S, letterhead_h=letterhead_h)

    headline_y = letterhead_h + HERO_H + int(55 * S)
    max_headline_w = width - margin_x * 2
    headline_size = int(148 * S)
    headline_font = fnt(FONT_AVENIR_COND, headline_size, AVC_HEAVY)
    while headline_size > int(72 * S) and draw.textlength(spec.headline, font=headline_font) > max_headline_w:
        headline_size -= int(4 * S)
        headline_font = fnt(FONT_AVENIR_COND, headline_size, AVC_HEAVY)
    draw.text((margin_x, headline_y), spec.headline, font=headline_font, fill=WHITE)

    subhead_y = headline_y + int(headline_size * 1.05 + 20 * S)
    subhead_font = fnt(FONT_AVENIR_COND, int(52 * S), AVC_DEMI)
    draw.text((margin_x, subhead_y), spec.subhead, font=subhead_font, fill=BLUE_ACCENT)

    pillars_y = subhead_y + int(95 * S)
    pillar_title_font = fnt(FONT_AVENIR, int(26 * S), AV_BOLD)
    pillar_body_font = fnt(FONT_AVENIR, int(22 * S), AV_REG)
    rule_h = int(3 * S)
    rule_w = int(56 * S)
    line_gap = int(78 * S)

    for i, (title, body) in enumerate(spec.pillars):
        y = pillars_y + i * line_gap
        draw.rectangle(
            (margin_x, y + int(18 * S), margin_x + rule_w, y + int(18 * S) + rule_h),
            fill=BLUE_ACCENT,
        )
        draw_letterspaced(
            draw,
            (margin_x + rule_w + int(20 * S), y + int(2 * S)),
            title, pillar_title_font, WHITE,
            extra_spacing_px=int(3 * S),
        )
        draw.text(
            (margin_x, y + int(40 * S)),
            body, font=pillar_body_font, fill=(220, 228, 240),
        )

    pillars_end_y = pillars_y + 3 * line_gap + int(16 * S)
    footnote_font = fnt(FONT_AVENIR, int(20 * S), AV_MED)
    draw.text(
        (margin_x, pillars_end_y + int(6 * S)),
        PILLARS_FOOTNOTE, font=footnote_font, fill=MUTED_WHITE,
    )

    bottom = gp.compute_poster_bottom_layout(
        width, height, S,
        compact=True,
        margin_x_ref=70 + spec.extra_margin_ref,
    )
    gp.draw_poster_bottom(canvas, draw, bottom)

    return canvas.convert("RGB")


def main() -> None:
    import os

    PREVIEW_W = 2400
    PRINT_W = 3508

    for spec in POSTERS:
        preview = render_feature_poster(spec, PREVIEW_W)
        preview_path = OUT_DIR / f"poster_{spec.slug}_preview.png"
        preview.save(preview_path, dpi=(150, 150), optimize=True)
        print(f"saved: {preview_path.name} ({preview.size})")

        if os.environ.get("GENERATE_PRINT") == "1":
            printable = render_feature_poster(spec, PRINT_W)
            print_path = OUT_DIR / f"poster_{spec.slug}_print_A1_150dpi.png"
            printable.save(print_path, dpi=(150, 150), optimize=True)
            print(f"saved: {print_path.name} ({printable.size})")


if __name__ == "__main__":
    main()
