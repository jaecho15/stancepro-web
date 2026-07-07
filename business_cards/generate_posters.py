"""Generate StancePro universal posters (A1 portrait).

Hero photo fills the upper region; a deep-navy content block holds the
headline, three value pillars (Stance / AI / Coaching), brand lockup and
the smart-link download QR (https://stance-pro.com/d).

Copy is resort-agnostic — usable at any ski field. Multiple hero-photo
variants are supported (e.g. carve vs powder).

Output sizes:
  preview = 1200 x 1697  (display-friendly, ~A1 ratio)
  print   = 3508 x 4965  (150 DPI of A1 — poster-grade for ~1m viewing)
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import qrcode
from qrcode.constants import ERROR_CORRECT_M
from PIL import Image, ImageDraw, ImageFilter, ImageFont

import wordmark_michroma_v5 as wm_v5
from brand_logos import LOGO_DARK

# ---------------- paths ----------------

HERE = Path(__file__).resolve().parent
POSTER_DIR = HERE
SCREENSHOT_DIR = HERE / "screenshots"
OUT_DIR = POSTER_DIR / "posters"
OUT_DIR.mkdir(parents=True, exist_ok=True)

HERO_CARVE = POSTER_DIR / "poster_hero_carve.png"
HERO_POWDER = POSTER_DIR / "poster_hero_powder.png"

FONT_AVENIR = "/System/Library/Fonts/Avenir Next.ttc"
FONT_AVENIR_COND = "/System/Library/Fonts/Avenir Next Condensed.ttc"
FONT_GOTHIC = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
FONT_HIRAGINO = "/System/Library/Fonts/Hiragino Sans GB.ttc"
FONT_THONBURI = "/System/Library/Fonts/Supplemental/Thonburi.ttc"

# Avenir Next.ttc face indices (verified):
AV_REG = 7
AV_MED = 5
AV_DEMI = 2
AV_BOLD = 0
AV_HEAVY = 8

# Avenir Next Condensed.ttc face indices:
#   typically 0 Bold, 2 DemiBold, 5 Medium, 7 Regular, 8 Heavy  (verify if needed)
AVC_HEAVY = 8
AVC_BOLD = 0
AVC_DEMI = 2

# ---------------- brand ----------------

NAVY = (26, 46, 97)
NAVY_DEEP = (15, 28, 64)
WHITE = (255, 255, 255)
BLUE_ACCENT = (63, 169, 245)
MUTED_WHITE = (255, 255, 255, 180)
PHONE_BEZEL = (12, 22, 48)
PHONE_BORDER = (80, 120, 180)
TEXT_COLUMN_FRAC = 0.54  # leave right column for side phone mockups

BOTTOM_SECTION_RATIO = 0.16
CONTENT_ABOVE_DIVIDER_OFFSET_REF = 50  # shift hero + copy block down (ref @ 1200px width)
QR_SIZE_REF = 150  # 300px @ 2400 preview (S=2)
PLAQUE_PAD_REF = 10  # 20px @ 2400 preview (S=2)
BOTTOM_TOP_GAP_SCALE = 0.5  # halve divider-to-QR/plaque gap in the bottom band
HEX_SIZE_REF = 145
LOCKUP_SCALE = 0.972
LOCKUP_SIZE_SCALE = 0.8  # logo + wordmark 20% smaller
POSTER_LOGO_SIZE_SCALE = 1.1  # poster lockup +10%
POSTER_WORDMARK_SIZE_SCALE = 1.32  # poster wordmark +32% (20% + 10% more)

SMART_DOWNLOAD_URL = "https://stance-pro.com/d"


@dataclass(frozen=True)
class SidePhone:
    screenshot: Path
    center_y_frac: float  # 0–1 within copy block (headline → divider)
    height_frac: float    # phone height as fraction of copy block height
    center_x_frac: float = 0.84
    rotation_deg: float = 0.0


@dataclass(frozen=True)
class HeroVariant:
    slug: str
    hero_path: Path
    # Focal anchor for fit_cover crop: 0.0 = left/top, 1.0 = right/bottom
    hero_anchor_x: float = 0.5
    hero_anchor_y: float = 0.5
    side_phones: tuple[SidePhone, ...] = ()


_DEFAULT_SIDE_PHONES = (
    SidePhone(
        SCREENSHOT_DIR / "08_stance_gear_setup_1284x2778.png",
        center_y_frac=0.34,
        height_frac=0.30,
        center_x_frac=0.80,
        rotation_deg=-6,
    ),
    SidePhone(
        SCREENSHOT_DIR / "06_pose_analysis_1284x2778.png",
        center_y_frac=0.66,
        height_frac=0.34,
        center_x_frac=0.86,
        rotation_deg=5,
    ),
)


VARIANTS = [
    HeroVariant(
        slug="carve",
        hero_path=HERO_CARVE,
        hero_anchor_x=0.55,
        hero_anchor_y=0.62,
        side_phones=_DEFAULT_SIDE_PHONES,
    ),
    HeroVariant(
        slug="powder",
        hero_path=HERO_POWDER,
        hero_anchor_x=0.32,
        hero_anchor_y=0.72,
        side_phones=_DEFAULT_SIDE_PHONES,
    ),
]

# Shared copy — universal across all hero variants.
HEADLINE = "RIDE SMARTER."
SUBHEAD = "Coaching Assistant in your pocket."
PILLARS_FOOTNOTE = "…and much more on iOS & Android."

VALUE_PILLARS = [
    ("STANCE CALCULATION", "Science-backed angles and width in\u00a060\u00a0seconds."),
    ("GEAR ANALYSIS AND RECOMMENDATIONS", "Setup assistant to suit your style."),
    ("VIDEO ANALYSIS BY AI", "Movement analysis from a single clip, frame by frame."),
    ("COACHING BY CERTIFIED INSTRUCTORS", "Improve with feedback from certified instructors anywhere you are."),
]


# ---------------- helpers ----------------

def font(path: str, size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size, index=index)


def font_for_language_label(label: str, size: int) -> ImageFont.FreeTypeFont:
    """Pick a native system UI font per script; Latin stays on Avenir."""
    if any("\u0e00" <= ch <= "\u0e7f" for ch in label):
        return font(FONT_THONBURI, size)
    if any("\uac00" <= ch <= "\ud7a3" for ch in label):
        return font(FONT_GOTHIC, size)
    if any("\u3040" <= ch <= "\u30ff" or "\u4e00" <= ch <= "\u9fff" for ch in label):
        return font(FONT_HIRAGINO, size)
    return font(FONT_AVENIR, size, AV_REG)


def draw_inline_language_list(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    labels: tuple[str, ...],
    size: int,
    fill,
) -> int:
    """Draw native language labels inline; returns x after last glyph."""
    sep_font = font(FONT_AVENIR, size, AV_REG)
    separator = " · "
    for i, label in enumerate(labels):
        if i:
            draw.text((x, y), separator, font=sep_font, fill=fill)
            x += int(sep_font.getlength(separator))
        label_font = font_for_language_label(label, size)
        draw.text((x, y), label, font=label_font, fill=fill)
        x += int(label_font.getlength(label))
    return x


def make_qr(data: str, size_px: int) -> Image.Image:
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color=NAVY, back_color=WHITE).convert("RGBA")
    return img.resize((size_px, size_px), Image.LANCZOS)


def fit_cover(
    img: Image.Image,
    target_w: int,
    target_h: int,
    anchor_x: float = 0.5,
    anchor_y: float = 0.5,
) -> Image.Image:
    """Resize+crop to fill target box (CSS background-size: cover)."""
    src_w, src_h = img.size
    scale = max(target_w / src_w, target_h / src_h)
    new_w, new_h = int(src_w * scale), int(src_h * scale)
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    max_left = max(0, new_w - target_w)
    max_top = max(0, new_h - target_h)
    left = int(max_left * anchor_x)
    top = int(max_top * anchor_y)
    return resized.crop((left, top, left + target_w, top + target_h))


def vertical_gradient(w: int, h: int, top_rgba: tuple, bot_rgba: tuple) -> Image.Image:
    """RGBA gradient image."""
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
    fnt: ImageFont.FreeTypeFont,
    fill,
    extra_spacing_px: int = 4,
) -> int:
    x, y = pos
    start_x = x
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += int(fnt.getlength(ch)) + extra_spacing_px
    return x - start_x


def _letterspaced_width(text: str, fnt: ImageFont.FreeTypeFont, gap: int) -> int:
    return sum(int(fnt.getlength(ch)) + gap for ch in text)


def fit_letterspaced_font_size(
    text: str,
    target_w: int,
    font_path: str,
    index: int,
    *,
    min_size: int = 6,
    max_size: int = 200,
    spacing_ratio: float = 3 / 13,
) -> int:
    """Largest font size where proportional letter-spacing fits within target_w."""
    lo, hi = min_size, max_size
    best = min_size
    while lo <= hi:
        mid = (lo + hi) // 2
        gap = max(1, int(round(mid * spacing_ratio)))
        fnt = font(font_path, mid, index)
        if _letterspaced_width(text, fnt, gap) <= target_w:
            best = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return best


def draw_letterspaced_fit_width(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    text: str,
    target_w: int,
    font_path: str,
    index: int,
    fill,
    font_size: int,
) -> int:
    """Draw letterspaced text spanning exactly target_w pixels."""
    fnt = font(font_path, font_size, index)
    char_widths = [int(fnt.getlength(ch)) for ch in text]
    gaps = len(text)
    total_gap = target_w - sum(char_widths)
    base_gap = total_gap // gaps if gaps else 0
    extra = total_gap % gaps if gaps else 0
    start_x = x
    for i, ch in enumerate(text):
        draw.text((x, y), ch, font=fnt, fill=fill)
        gap = base_gap + (1 if i < extra else 0)
        x += char_widths[i] + gap
    return x - start_x


def _wrap_text(text: str, fnt: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    """Simple word wrap for pillar body lines."""
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        trial = f"{current} {word}"
        if fnt.getlength(trial) <= max_w:
            current = trial
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def draw_pillars_block(
    draw: ImageDraw.ImageDraw,
    *,
    pillars: tuple[tuple[str, str], ...],
    start_y: int,
    margin_x: int,
    S: float,
    compact: bool = False,
) -> int:
    """Draw pillar titles + single-line bodies at the default body size."""
    if compact:
        title_size, body_size = int(26 * S), int(22 * S)
        rule_w = int(56 * S)
        title_x_offset = int(20 * S)
        rule_y_offset = int(18 * S)
        title_y_offset = int(2 * S)
        body_y_offset = int(40 * S)
        title_spacing = int(3 * S)
        body_line_gap = int(26 * S)
        block_gap = int(12 * S)
    else:
        title_size, body_size = int(28 * S), int(24 * S)
        rule_w = int(60 * S)
        title_x_offset = int(24 * S)
        rule_y_offset = int(20 * S)
        title_y_offset = int(4 * S)
        body_y_offset = int(44 * S)
        title_spacing = int(4 * S)
        body_line_gap = int(28 * S)
        block_gap = int(14 * S)

    rule_h = int(3 * S)
    title_font = font(FONT_AVENIR, title_size, AV_BOLD)
    body_font = font(FONT_AVENIR, body_size, AV_REG)
    title_x = margin_x + rule_w + title_x_offset

    y = start_y
    body_color = (220, 228, 240)

    for item in pillars:
        title = item[0]
        body = item[1]
        language_labels = item[2] if len(item) > 2 else None
        draw.rectangle(
            (
                margin_x,
                y + rule_y_offset,
                margin_x + rule_w,
                y + rule_y_offset + rule_h,
            ),
            fill=BLUE_ACCENT,
        )
        draw_letterspaced(
            draw,
            (title_x, y + title_y_offset),
            title,
            title_font,
            WHITE,
            extra_spacing_px=title_spacing,
        )
        body_y = y + body_y_offset
        body_font = font(FONT_AVENIR, body_size, AV_REG)
        if language_labels:
            prefix = f"{body} "
            draw.text((margin_x, body_y), prefix, font=body_font, fill=body_color)
            x = margin_x + int(body_font.getlength(prefix))
            draw_inline_language_list(
                draw, x, body_y, language_labels, body_size, body_color,
            )
        else:
            draw.text((margin_x, body_y), body, font=body_font, fill=body_color)
        y = body_y + body_line_gap + block_gap
    return y


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


def paste_logo_content_left(
    base: Image.Image,
    overlay: Image.Image,
    left_x: int,
    target_content_h: int,
    center_y: int,
) -> tuple[int, int, int, int]:
    """Paste logo mark with opaque content left edge flush to left_x."""
    overlay = overlay.convert("RGBA")
    bbox = overlay.getbbox()
    if not bbox:
        bbox = (0, 0, overlay.width, overlay.height)
    content = overlay.crop(bbox)
    cw, ch = content.size
    new_h = target_content_h
    new_w = max(1, int(round(cw * (new_h / ch))))
    rs = content.resize((new_w, new_h), Image.LANCZOS)
    y = center_y - new_h // 2
    base.paste(rs, (left_x, y), rs)
    return (left_x, y, left_x + new_w, y + new_h)


def make_phone_mockup(screenshot: Image.Image, phone_h: int, S: float) -> Image.Image:
    """Compact rounded phone frame with screenshot inside."""
    bezel = max(4, int(7 * S))
    radius = max(12, int(18 * S))
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
        width=max(1, int(1.5 * S)),
    )
    phone.paste(screen, (bezel, bezel))
    return phone


def paste_rotated(base: Image.Image, overlay: Image.Image, cx: int, cy: int, angle: float) -> None:
    if angle:
        overlay = overlay.rotate(angle, resample=Image.BICUBIC, expand=True)
    x = cx - overlay.width // 2
    y = cy - overlay.height // 2
    base.paste(overlay, (x, y), overlay)


def draw_side_phones(
    canvas: Image.Image,
    phones: tuple[SidePhone, ...],
    *,
    copy_top: int,
    copy_bottom: int,
    width: int,
    S: float,
) -> None:
    """Small phone mockups on the right of the hero poster copy block."""
    if not phones:
        return
    copy_h = max(1, copy_bottom - copy_top)
    order = sorted(range(len(phones)), key=lambda i: abs(phones[i].rotation_deg))
    for idx in order:
        spec = phones[idx]
        if not spec.screenshot.is_file():
            continue
        shot = Image.open(spec.screenshot).convert("RGB")
        phone_h = max(48, int(copy_h * spec.height_frac))
        phone = make_phone_mockup(shot, phone_h, S)
        cx = int(width * spec.center_x_frac)
        cy = copy_top + int(copy_h * spec.center_y_frac)
        paste_rotated(canvas, phone, cx, cy, spec.rotation_deg)


@dataclass(frozen=True)
class PosterBottomLayout:
    margin_x: int
    divider_y: int
    section_h: int
    plaque_x: int
    plaque_y: int
    plaque_w: int
    plaque_h: int
    qr_size: int
    plaque_pad: int
    lockup_center_y: int
    hex_h: int
    wm_h: int
    gap: int
    wm_center_y: int
    cta_y: int
    url_y: int
    by_gap: int
    cta_font_size: int
    url_font_size: int
    by_font_size: int
    plaque_radius: int
    cta_spacing: int
    by_spacing: int


def compute_poster_bottom_layout(
    width: int,
    height: int,
    S: float,
    *,
    compact: bool = False,
    margin_x_ref: int = 70,
) -> PosterBottomLayout:
    """Bottom lockup band anchored to BOTTOM_SECTION_RATIO of poster height."""
    margin_x = int(margin_x_ref * S)
    section_h = int(round(height * BOTTOM_SECTION_RATIO))
    section_top = height - section_h
    divider_y = section_top

    bottom_pad = int(max(14, round(section_h * 0.06)))
    url_font_size = int((18 if compact else 20) * S)
    url_gap = int(max(8, round(section_h * 0.03)))
    cta_gap = int(max(20, round(section_h * 0.08)))
    by_font_size = int((18 if compact else 20) * S)
    by_gap = int((8 if compact else 10) * S)
    by_spacing = int((4 if compact else 5) * S)
    cta_spacing = int(3 * S)
    plaque_radius = int(18 * S)

    url_block = url_font_size + url_gap
    plaque_bottom = height - bottom_pad - url_block

    qr_size = int(round(QR_SIZE_REF * S))
    plaque_pad = int(round(PLAQUE_PAD_REF * S))
    plaque_h = qr_size + 2 * plaque_pad
    plaque_w = plaque_h
    plaque_y = plaque_bottom - plaque_h
    plaque_y -= int(round((plaque_y - divider_y) * (1 - BOTTOM_TOP_GAP_SCALE)))
    plaque_x = width - margin_x - plaque_w

    # 24px ImageFont @ 2400 preview (S=2); scales as 12*S.
    cta_font_size = int(round(12 * S))
    cta_y_offset_ref = 10  # move CTA down toward QR (ref pt @ 1200px width)

    lockup_center_y = plaque_y + plaque_h // 2 - int(10 * S)
    hex_h = int(round(HEX_SIZE_REF * S * LOCKUP_SCALE * LOCKUP_SIZE_SCALE * POSTER_LOGO_SIZE_SCALE))
    wm_h = hex_h  # placeholder; actual height set in draw_poster_bottom from logo metrics
    gap = int(14 * S)
    wm_center_y = lockup_center_y - int(4 * S)
    cta_y = divider_y + max(
        int(8 * S),
        (plaque_y - divider_y - cta_font_size) // 2,
    )
    url_y = plaque_y + plaque_h + url_gap

    return PosterBottomLayout(
        margin_x=margin_x,
        divider_y=divider_y,
        section_h=section_h,
        plaque_x=plaque_x,
        plaque_y=plaque_y,
        plaque_w=plaque_w,
        plaque_h=plaque_h,
        qr_size=qr_size,
        plaque_pad=plaque_pad,
        lockup_center_y=lockup_center_y,
        hex_h=hex_h,
        wm_h=wm_h,
        gap=gap,
        wm_center_y=wm_center_y,
        cta_y=cta_y,
        url_y=url_y,
        by_gap=by_gap,
        cta_font_size=cta_font_size,
        url_font_size=url_font_size,
        by_font_size=by_font_size,
        plaque_radius=plaque_radius,
        cta_spacing=cta_spacing,
        by_spacing=by_spacing,
    )


def draw_poster_bottom(
    canvas: Image.Image,
    draw: ImageDraw.ImageDraw,
    layout: PosterBottomLayout,
) -> tuple[int, int, int, int]:
    """Render divider, QR plaque, CTA, URL, and brand lockup. Returns wordmark bbox."""
    width = canvas.width
    draw.line(
        (layout.margin_x, layout.divider_y, width - layout.margin_x, layout.divider_y),
        fill=(255, 255, 255, 70),
        width=max(1, int(2 * (width / 1200.0))),
    )

    draw.rounded_rectangle(
        (
            layout.plaque_x,
            layout.plaque_y,
            layout.plaque_x + layout.plaque_w,
            layout.plaque_y + layout.plaque_h,
        ),
        radius=layout.plaque_radius,
        fill=WHITE,
    )
    qr_img = make_qr(SMART_DOWNLOAD_URL, layout.qr_size)
    canvas.paste(
        qr_img,
        (layout.plaque_x + layout.plaque_pad, layout.plaque_y + layout.plaque_pad),
        qr_img,
    )

    qr_x = layout.plaque_x + layout.plaque_pad
    cta_font = font(FONT_AVENIR, layout.cta_font_size, AV_BOLD)
    cta_text = "SCAN TO DOWNLOAD"
    cta_w = sum(
        int(cta_font.getlength(c)) + layout.cta_spacing for c in cta_text
    )
    cta_x = qr_x + (layout.qr_size - cta_w) // 2
    draw_letterspaced(
        draw,
        (cta_x, layout.cta_y),
        cta_text,
        cta_font,
        WHITE,
        extra_spacing_px=layout.cta_spacing,
    )

    url_font = font(FONT_AVENIR, layout.url_font_size, AV_MED)
    url_text = "stance-pro.com/d"
    url_w = draw.textlength(url_text, font=url_font)
    draw.text(
        (layout.plaque_x + (layout.plaque_w - int(url_w)) // 2, layout.url_y),
        url_text,
        font=url_font,
        fill=MUTED_WHITE,
    )

    logo = Image.open(LOGO_DARK).convert("RGBA")
    hex_bbox = paste_logo_content_left(
        canvas, logo, layout.margin_x, layout.hex_h, layout.lockup_center_y
    )
    max_wm_w = layout.plaque_x - hex_bbox[2] - layout.gap - 8
    wm_h = int(round(
        wm_v5.wordmark_height_for_hex_bbox(hex_bbox, LOGO_DARK) * POSTER_WORDMARK_SIZE_SCALE
    ))
    wordmark = wm_v5.render_wordmark(
        dark=True, target_h=wm_h, max_w=max_wm_w, supersample=4,
    )
    wm_bbox = wm_v5.paste_wordmark(
        canvas, wordmark, hex_bbox[2] + layout.gap, layout.wm_center_y,
    )
    by_font = font(FONT_AVENIR, layout.by_font_size, AV_MED)
    draw_letterspaced(
        draw,
        (wm_bbox[0], wm_bbox[3] + layout.by_gap),
        "BY JC KRAFT",
        by_font,
        MUTED_WHITE,
        extra_spacing_px=layout.by_spacing,
    )
    return wm_bbox


# ---------------- poster renderer ----------------

def render_poster(variant: HeroVariant, width: int) -> Image.Image:
    """Render A1-ratio poster. width is the horizontal pixel size."""
    A1_RATIO = 841 / 594  # height/width
    height = int(round(width * A1_RATIO))

    # baseline = 1200px width preview; scale all sizes/spacing from this
    S = width / 1200.0
    margin_x = int(70 * S)
    content_y = int(CONTENT_ABOVE_DIVIDER_OFFSET_REF * S)

    canvas = Image.new("RGBA", (width, height), NAVY_DEEP + (255,))
    draw = ImageDraw.Draw(canvas)

    # ----------------- HERO band (top ~38%) -----------------
    HERO_H = int(height * 0.38)
    hero = Image.open(variant.hero_path).convert("RGB")
    # Extend photo upward to fill the letterhead strip above the shifted content block.
    hero_band_h = HERO_H + content_y
    hero_fitted = fit_cover(
        hero,
        width,
        hero_band_h,
        anchor_x=variant.hero_anchor_x,
        anchor_y=variant.hero_anchor_y,
    )
    canvas.paste(hero_fitted, (0, 0))

    # bottom fade into navy
    fade_h = int(HERO_H * 0.45)
    fade = vertical_gradient(
        width, fade_h,
        top_rgba=(NAVY_DEEP[0], NAVY_DEEP[1], NAVY_DEEP[2], 0),
        bot_rgba=NAVY_DEEP + (255,),
    )
    canvas.paste(fade, (0, content_y + HERO_H - fade_h), fade)

    # ----------------- HEADLINE BLOCK -----------------
    bottom = compute_poster_bottom_layout(width, height, S)
    copy_top = content_y + HERO_H + int(70 * S)
    copy_bottom = bottom.divider_y

    # Sits directly below hero. Position is HERO_H + a small breathing gap.
    headline_y = copy_top
    max_headline_w = int(width * 0.78) - margin_x
    headline_size = int(148 * S)
    headline_font = font(FONT_AVENIR_COND, headline_size, AVC_HEAVY)
    while headline_size > int(72 * S) and draw.textlength(HEADLINE, font=headline_font) > max_headline_w:
        headline_size -= int(4 * S)
        headline_font = font(FONT_AVENIR_COND, headline_size, AVC_HEAVY)
    draw.text((margin_x, headline_y), HEADLINE, font=headline_font, fill=WHITE)

    # Subhead — universal across variants
    subhead_y = headline_y + int(headline_size * 1.02 + 25 * S)
    subhead_font = font(FONT_AVENIR_COND, int(58 * S), AVC_DEMI)
    draw.text(
        (margin_x, subhead_y),
        SUBHEAD, font=subhead_font, fill=BLUE_ACCENT,
    )

    # ----------------- VALUE PILLARS -----------------
    pillars_y = subhead_y + int(110 * S)
    pillars_end_y = draw_pillars_block(
        draw,
        pillars=VALUE_PILLARS,
        start_y=pillars_y,
        margin_x=margin_x,
        S=S,
    )

    # Footnote under pillars — same font as pillar bodies
    footnote_font = font(FONT_AVENIR, int(24 * S), AV_REG)
    draw.text(
        (margin_x, pillars_end_y + int(8 * S)),
        PILLARS_FOOTNOTE, font=footnote_font, fill=(220, 228, 240),
    )

    draw_side_phones(
        canvas,
        variant.side_phones,
        copy_top=copy_top,
        copy_bottom=copy_bottom,
        width=width,
        S=S,
    )

    # ----------------- BOTTOM AREA (16% of poster height) -----------------
    draw_poster_bottom(canvas, draw, bottom)

    return canvas.convert("RGB")


# ---------------- main ----------------

def main() -> None:
    PREVIEW_W = 2400
    PRINT_W = 3508  # 150 DPI of A1 width (594mm)

    for v in VARIANTS:
        preview = render_poster(v, width=PREVIEW_W)
        preview_path = OUT_DIR / f"poster_{v.slug}_preview.png"
        preview.save(preview_path, dpi=(150, 150), optimize=True)
        print(f"saved: {preview_path.name} ({preview.size})")

        # Print-ready version — set GENERATE_PRINT=1 env to enable.
        import os
        if os.environ.get("GENERATE_PRINT") == "1":
            printable = render_poster(v, width=PRINT_W)
            print_path = OUT_DIR / f"poster_{v.slug}_print_A1_150dpi.png"
            printable.save(print_path, dpi=(150, 150), optimize=True)
            print(f"saved: {print_path.name} ({printable.size})")


if __name__ == "__main__":
    main()
