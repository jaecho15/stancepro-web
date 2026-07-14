"""Generate StancePro merch print files: snowboard sticker, helmet sticker, t-shirt chest.

Output: StancePro_Docs/business_cards/merch/

Run:
  python3 generate_merch.py
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

import qrcode
from qrcode.constants import ERROR_CORRECT_M

import wordmark_michroma_v5 as wm_v5
from brand_logos import LOGO_DARK, LOGO_LIGHT

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE / "merch"
OUT_DIR.mkdir(parents=True, exist_ok=True)

DPI = 300

SMART_DOWNLOAD_URL = "https://stance-pro.com/d"

FONT_AVENIR = "/System/Library/Fonts/Avenir Next.ttc"
FONT_AVENIR_COND = "/System/Library/Fonts/Avenir Next Condensed.ttc"

AV_REG = 7
AV_MED = 5
AV_DEMI = 2
AV_BOLD = 0
AV_HEAVY = 8
AVC_HEAVY = 8
AVC_DEMI = 2

NAVY = (26, 46, 97)
NAVY_DEEP = (15, 28, 64)
WHITE = (255, 255, 255)
BLUE_ACCENT = (63, 169, 245)
BLUE_LIGHT = (0, 122, 230)
MUTED_WHITE = (255, 255, 255, 190)

HORIZONTAL_STICKER_LOGO_SCALE = 0.8
STICKER_WORDMARK_SCALE = 1.0  # wordmark ink height = hexagon side length


def fnt(path: str, size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size, index=index)


def paste_fit(
    base: Image.Image,
    overlay: Image.Image,
    x: int,
    y: int,
    target_h: int,
) -> tuple[int, int, int, int]:
    ow, oh = overlay.size
    new_w = int(ow * (target_h / oh))
    resized = overlay.resize((new_w, target_h), Image.LANCZOS)
    base.paste(resized, (x, y), resized)
    return (x, y, x + new_w, y + target_h)


def paste_centered_v(
    base: Image.Image,
    overlay: Image.Image,
    x: int,
    target_h: int,
    center_y: int,
) -> tuple[int, int, int, int]:
    y = center_y - target_h // 2
    return paste_fit(base, overlay, x, y, target_h)


def _logo_content(logo: Image.Image) -> Image.Image:
    logo = logo.convert("RGBA")
    bbox = logo.getbbox()
    if not bbox:
        return logo
    return logo.crop(bbox)


def paste_logo_content(
    base: Image.Image,
    logo: Image.Image,
    x: int,
    y: int,
    target_content_h: int,
) -> tuple[int, int, int, int]:
    """Paste cropped logo mark scaled to target content height."""
    content = _logo_content(logo)
    cw, ch = content.size
    new_h = target_content_h
    new_w = max(1, int(round(cw * (new_h / ch))))
    rs = content.resize((new_w, new_h), Image.LANCZOS)
    base.paste(rs, (x, y), rs)
    return (x, y, x + new_w, y + new_h)


def paste_logo_content_centered_v(
    base: Image.Image,
    logo: Image.Image,
    left_x: int,
    target_content_h: int,
    center_y: int,
) -> tuple[int, int, int, int]:
    y = center_y - target_content_h // 2
    return paste_logo_content(base, logo, left_x, y, target_content_h)


def load_wordmark(on_dark: bool, target_h: int, max_w: int | None = None) -> Image.Image:
    return wm_v5.render_wordmark(dark=on_dark, target_h=target_h, max_w=max_w)


def paste_wordmark_centered_v(
    base: Image.Image,
    x: int,
    target_h: int,
    center_y: int,
    *,
    on_dark: bool,
) -> tuple[int, int, int, int]:
    wordmark = load_wordmark(on_dark, target_h)
    y = center_y - wordmark.height // 2
    base.paste(wordmark, (x, y), wordmark)
    return (x, y, x + wordmark.width, y + wordmark.height)


def paste_wordmark_centered_h(
    base: Image.Image,
    center_x: int,
    y: int,
    target_h: int,
    *,
    on_dark: bool,
) -> tuple[int, int, int, int]:
    wordmark = load_wordmark(on_dark, target_h)
    x = center_x - wordmark.width // 2
    base.paste(wordmark, (x, y), wordmark)
    return (x, y, x + wordmark.width, y + wordmark.height)


@dataclass(frozen=True)
class MerchSpec:
    slug: str
    width_in: float
    height_in: float
    label: str


SPECS = {
    "snowboard": MerchSpec("sticker_snowboard", 6.0, 2.0, "Snowboard sticker"),
    "helmet": MerchSpec("sticker_helmet", 2.5, 2.5, "Helmet sticker"),
    "shop_qr": MerchSpec("sticker_shop_qr", 3.0, 3.0, "Shop counter QR"),
    "tee": MerchSpec("tee_chest", 11.0, 14.0, "T-shirt chest print"),
}


def px(inches: float) -> int:
    return int(round(inches * DPI))


def save(img: Image.Image, name: str) -> Path:
    path = OUT_DIR / name
    img.save(path, dpi=(DPI, DPI))
    print(f"saved: {path.name} ({img.size[0]}×{img.size[1]} @ {DPI}dpi)")
    return path


def draw_rounded_rect(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    radius: int,
    fill,
    outline=None,
    width: int = 1,
) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


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


def paste_sticker_lockup(
    canvas: Image.Image,
    *,
    on_dark: bool,
    hex_h_ratio: float = 0.62,
    gap_in: float = 0.12,
    lockup_scale: float = 1.0,
    safe_margin_in: float = 0.16,
) -> None:
    """Centered hex + STANCEPRO lockup for snowboard stickers."""
    logo_path = LOGO_DARK if on_dark else LOGO_LIGHT
    logo = Image.open(logo_path).convert("RGBA")
    h, w = canvas.height, canvas.width
    cy = h // 2
    base_hex_h = int(h * hex_h_ratio)
    content = _logo_content(logo)
    hex_h = int(round(base_hex_h * HORIZONTAL_STICKER_LOGO_SCALE * lockup_scale))
    gap = px(gap_in)

    def build_lockup(target_hex_h: int) -> tuple[int, Image.Image]:
        target_hex_w = max(1, int(round(content.width * (target_hex_h / content.height))))
        target_wm_h = int(round(
            wm_v5.wordmark_height_for_hex_bbox(
                (0, 0, target_hex_w, target_hex_h), logo_path
            )
            * STICKER_WORDMARK_SCALE
        ))
        return target_hex_w, load_wordmark(on_dark, target_wm_h)

    hex_w, wordmark = build_lockup(hex_h)
    available_w = w - 2 * px(safe_margin_in)
    total_w = hex_w + gap + wordmark.width
    if total_w > available_w:
        scale = (available_w - gap) / (hex_w + wordmark.width)
        hex_h = max(1, int(hex_h * scale))
        hex_w, wordmark = build_lockup(hex_h)
        total_w = hex_w + gap + wordmark.width
        while total_w > available_w and hex_h > 1:
            hex_h -= 1
            hex_w, wordmark = build_lockup(hex_h)
            total_w = hex_w + gap + wordmark.width

    hex_x = (w - total_w) // 2
    hex_bbox = paste_logo_content_centered_v(canvas, logo, hex_x, hex_h, cy)
    wm_v5.paste_wordmark(canvas, wordmark, hex_bbox[2] + gap, cy)


def render_shop_qr_sticker() -> Image.Image:
    """Square counter sticker — scan to download (shop POS / fitting desk)."""
    spec = SPECS["shop_qr"]
    size = px(spec.width_in)
    canvas = Image.new("RGBA", (size, size), NAVY_DEEP + (255,))
    draw = ImageDraw.Draw(canvas)

    pad = px(0.2)
    draw_rounded_rect(
        draw,
        (pad, pad, size - pad, size - pad),
        radius=px(0.15),
        fill=NAVY + (255,),
        outline=BLUE_ACCENT + (140,),
        width=2,
    )

    logo = Image.open(LOGO_DARK).convert("RGBA")
    logo_h = int(size * 0.14)
    content = _logo_content(logo)
    lockup_cy = int(size * 0.17)
    lockup_gap = int(size * 0.022)

    def build_lockup(target_logo_h: int) -> tuple[int, Image.Image]:
        target_logo_w = max(
            1, int(round(content.width * (target_logo_h / content.height)))
        )
        target_wm_h = int(round(
            wm_v5.wordmark_height_for_hex_bbox(
                (0, 0, target_logo_w, target_logo_h), LOGO_DARK
            )
            * STICKER_WORDMARK_SCALE
        ))
        return target_logo_w, load_wordmark(True, target_wm_h)

    logo_w, wordmark = build_lockup(logo_h)
    lockup_w = logo_w + lockup_gap + wordmark.width
    available_w = size - 2 * (pad + int(size * 0.02))
    if lockup_w > available_w:
        scale = (available_w - lockup_gap) / (logo_w + wordmark.width)
        logo_h = max(1, int(logo_h * scale))
        logo_w, wordmark = build_lockup(logo_h)
        lockup_w = logo_w + lockup_gap + wordmark.width
        while lockup_w > available_w and logo_h > 1:
            logo_h -= 1
            logo_w, wordmark = build_lockup(logo_h)
            lockup_w = logo_w + lockup_gap + wordmark.width

    logo_x = (size - lockup_w) // 2
    logo_bbox = paste_logo_content_centered_v(canvas, logo, logo_x, logo_h, lockup_cy)
    wm_v5.paste_wordmark(canvas, wordmark, logo_bbox[2] + lockup_gap, lockup_cy)

    cta_font = fnt(FONT_AVENIR, int(size * 0.042), AV_BOLD)
    cta = "SCAN TO DIAL YOUR SETUP"
    cw = draw.textlength(cta, font=cta_font)
    cta_y = max(logo_bbox[3], lockup_cy + wordmark.height // 2) + int(size * 0.03)
    draw.text(((size - cw) // 2, cta_y), cta, font=cta_font, fill=WHITE)

    qr_size = int(size * 0.38)
    qr = make_qr(SMART_DOWNLOAD_URL, qr_size)
    qr_x = (size - qr_size) // 2
    qr_y = int(size * 0.38)
    plaque_pad = int(size * 0.025)
    draw.rounded_rectangle(
        (qr_x - plaque_pad, qr_y - plaque_pad, qr_x + qr_size + plaque_pad, qr_y + qr_size + plaque_pad),
        radius=px(0.08),
        fill=WHITE + (255,),
    )
    canvas.paste(qr, (qr_x, qr_y), qr)

    url_font = fnt(FONT_AVENIR, int(size * 0.045), AV_MED)
    url = "stance-pro.com/d"
    uw = draw.textlength(url, font=url_font)
    draw.text(((size - uw) // 2, qr_y + qr_size + int(size * 0.04)), url, font=url_font, fill=MUTED_WHITE)
    return canvas


def render_snowboard_sticker_navy() -> Image.Image:
    spec = SPECS["snowboard"]
    w, h = px(spec.width_in), px(spec.height_in)
    canvas = Image.new("RGBA", (w, h), NAVY + (255,))
    draw = ImageDraw.Draw(canvas)

    margin = px(0.18)
    draw_rounded_rect(
        draw,
        (margin, margin, w - margin, h - margin),
        radius=px(0.12),
        fill=NAVY_DEEP + (255,),
        outline=BLUE_ACCENT + (120,),
        width=2,
    )

    paste_sticker_lockup(
        canvas, on_dark=True, lockup_scale=0.9, safe_margin_in=0.22
    )
    return canvas


def render_snowboard_sticker_white() -> Image.Image:
    spec = SPECS["snowboard"]
    w, h = px(spec.width_in), px(spec.height_in)
    canvas = Image.new("RGBA", (w, h), WHITE + (255,))
    draw = ImageDraw.Draw(canvas)

    margin = px(0.18)
    draw_rounded_rect(
        draw,
        (margin, margin, w - margin, h - margin),
        radius=px(0.12),
        fill=WHITE + (255,),
        outline=NAVY + (80,),
        width=2,
    )

    paste_sticker_lockup(
        canvas, on_dark=False, lockup_scale=0.9, safe_margin_in=0.22
    )
    return canvas


def render_snowboard_sticker_diecut(*, dark_board: bool = False) -> Image.Image:
    """Transparent background for vinyl on boards; light ink variant reads on dark boards."""
    spec = SPECS["snowboard"]
    w, h = px(spec.width_in), px(spec.height_in)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    paste_sticker_lockup(canvas, on_dark=dark_board, hex_h_ratio=0.68, gap_in=0.1)

    # Cut contour hint (magenta hairline — hide when printing)
    bbox = canvas.getbbox()
    if bbox:
        pad = px(0.08)
        draw.rounded_rectangle(
            (bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad),
            radius=px(0.1),
            outline=(255, 0, 255, 180),
            width=1,
        )
    return canvas


def render_helmet_sticker_hex() -> Image.Image:
    """Full-color hex logo — transparent, for light helmets / visors."""
    spec = SPECS["helmet"]
    size = px(spec.width_in)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    logo = Image.open(LOGO_LIGHT).convert("RGBA")
    target_h = int(size * 0.88)
    content = _logo_content(logo)
    target_w = max(1, int(round(content.width * (target_h / content.height))))
    hex_x = (size - target_w) // 2
    paste_logo_content_centered_v(canvas, logo, hex_x, target_h, size // 2)
    return canvas


def render_helmet_sticker_white() -> Image.Image:
    """White mono hex — for dark helmets."""
    spec = SPECS["helmet"]
    size = px(spec.width_in)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    logo = Image.open(LOGO_DARK).convert("RGBA")
    target_h = int(size * 0.88)
    content = _logo_content(logo)
    target_w = max(1, int(round(content.width * (target_h / content.height))))
    hex_x = (size - target_w) // 2
    paste_logo_content_centered_v(canvas, logo, hex_x, target_h, size // 2)
    return canvas


def render_helmet_sticker_badge() -> Image.Image:
    """Hex + ring badge — reads well at small size."""
    spec = SPECS["helmet"]
    size = px(spec.width_in)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    cx, cy = size // 2, size // 2
    outer = int(size * 0.46)
    inner = int(size * 0.40)
    draw.ellipse(
        (cx - outer, cy - outer, cx + outer, cy + outer),
        fill=NAVY + (255,),
        outline=BLUE_ACCENT + (255,),
        width=max(2, size // 80),
    )
    draw.ellipse(
        (cx - inner, cy - inner, cx + inner, cy + inner),
        outline=WHITE + (60,),
        width=1,
    )
    logo = Image.open(LOGO_DARK).convert("RGBA")
    target_h = int(size * 0.52)
    content = _logo_content(logo)
    target_w = max(1, int(round(content.width * (target_h / content.height))))
    hex_x = cx - target_w // 2
    paste_logo_content_centered_v(canvas, logo, hex_x, target_h, cy)
    return canvas


def render_tee(dark_ink: bool) -> Image.Image:
    """Chest print art on transparent: mark with width-matched wordmark."""
    spec = SPECS["tee"]
    w, h = px(spec.width_in), px(spec.height_in)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    logo_path = LOGO_LIGHT if dark_ink else LOGO_DARK

    logo = Image.open(logo_path).convert("RGBA")
    logo_h = int(w * 0.56 * 0.52)
    content = _logo_content(logo)
    logo_w = max(1, int(round(content.width * (logo_h / content.height))))
    logo_x = (w - logo_w) // 2
    logo_y = int(h * 0.13)
    logo_bbox = paste_logo_content(canvas, logo, logo_x, logo_y, logo_h)

    wm_h = int(round(wm_v5.wordmark_height_for_hex_bbox(logo_bbox, logo_path) * 0.82))
    wordmark = load_wordmark(not dark_ink, wm_h, max_w=logo_w)
    wm_x = (w - wordmark.width) // 2
    wm_y = logo_bbox[3] + int(h * 0.018)
    canvas.paste(wordmark, (wm_x, wm_y), wordmark)
    return canvas


def render_tee_mockup(light_shirt: bool) -> Image.Image:
    """Simple shirt mockup showing the chest print in context."""
    mw, mh = 1400, 1600
    bg = (244, 246, 250)
    shirt = (248, 247, 242) if light_shirt else (18, 31, 66)
    seam = (205, 211, 222) if light_shirt else (48, 68, 116)
    canvas = Image.new("RGBA", (mw, mh), bg + (255,))
    draw = ImageDraw.Draw(canvas)

    body = (390, 420, 1010, 1500)
    draw.polygon(
        [(390, 430), (245, 545), (335, 790), (390, 750)],
        fill=shirt + (255,),
        outline=seam + (255,),
    )
    draw.polygon(
        [(1010, 430), (1155, 545), (1065, 790), (1010, 750)],
        fill=shirt + (255,),
        outline=seam + (255,),
    )
    draw.rounded_rectangle(body, radius=70, fill=shirt + (255,), outline=seam + (255,), width=3)
    draw.ellipse((555, 315, 845, 565), fill=bg + (255,))
    draw.arc((555, 315, 845, 565), 20, 160, fill=seam + (255,), width=6)

    print_art = render_tee(dark_ink=light_shirt)
    bbox = print_art.getbbox()
    if bbox:
        print_art = print_art.crop(bbox)
        body_w = body[2] - body[0]
        target_w = int(body_w * 0.42 / 2)
        target_h = max(1, int(round(print_art.height * (target_w / print_art.width))))
        print_art = print_art.resize((target_w, target_h), Image.LANCZOS)
        x = body[0] + int(body_w * 0.73) - target_w // 2
        y = 610
        canvas.paste(print_art, (x, y), print_art)

    return canvas


def render_preview(img: Image.Image, max_w: int = 1200) -> Image.Image:
    if img.width <= max_w:
        return img.copy()
    nh = int(img.height * (max_w / img.width))
    return img.resize((max_w, nh), Image.LANCZOS)


def _has_transparency(img: Image.Image) -> bool:
    return img.mode == "RGBA" and img.getextrema()[3][0] < 255


def _draw_checkerboard(w: int, h: int, cell: int = 20) -> Image.Image:
    light = (232, 234, 238)
    dark = (208, 211, 218)
    mat = Image.new("RGB", (w, h), light)
    draw = ImageDraw.Draw(mat)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if ((x // cell) + (y // cell)) % 2:
                draw.rectangle((x, y, x + cell, y + cell), fill=dark)
    return mat


def render_checkerboard_preview(img: Image.Image, max_w: int = 1200) -> Image.Image:
    """Brand-review preview with checkerboard mat for transparent stickers."""
    scaled = render_preview(img, max_w)
    pad = max(24, int(scaled.width * 0.05))
    mat = _draw_checkerboard(scaled.width + pad * 2, scaled.height + pad * 2)
    mat.paste(scaled, (pad, pad), scaled)
    return mat


def _preview_on_mat(img: Image.Image, target_w: int, label: str) -> Image.Image:
    """Scale sticker onto cream mat with title for review sheet."""
    scale = min(target_w / img.width, 1.0)
    sw, sh = int(img.width * scale), int(img.height * scale)
    sticker = img.resize((sw, sh), Image.LANCZOS)
    label_h = 36
    pad = 24
    mat_h = sh + label_h + pad * 2
    mat = Image.new("RGBA", (target_w, mat_h), (249, 247, 240, 255))
    draw = ImageDraw.Draw(mat)
    x = (target_w - sw) // 2
    if _has_transparency(img):
        checker = _draw_checkerboard(sw, sh)
        mat.paste(checker, (x, pad))
    mat.paste(sticker, (x, pad), sticker)
    title_font = fnt(FONT_AVENIR, 18, AV_DEMI)
    tw = draw.textlength(label, font=title_font)
    draw.text(((target_w - tw) // 2, pad + sh + 8), label, font=title_font, fill=NAVY)
    return mat


def build_sticker_preview_sheet() -> Image.Image:
    """Composite all sticker variants for brand review (2-column layout)."""
    items: list[tuple[str, Image.Image]] = [
        ("Snowboard — navy 6×2 in", render_snowboard_sticker_navy()),
        ("Snowboard — white 6×2 in", render_snowboard_sticker_white()),
        ("Snowboard — die-cut vinyl (light board)", render_snowboard_sticker_diecut()),
        ("Snowboard — die-cut vinyl (dark board)", render_snowboard_sticker_diecut(dark_board=True)),
        ("Helmet — full-color hex", render_helmet_sticker_hex()),
        ("Helmet — white mono", render_helmet_sticker_white()),
        ("Helmet — badge ring", render_helmet_sticker_badge()),
        ("Shop counter QR 3×3 in", render_shop_qr_sticker()),
    ]
    col_w = 520
    cols = 2
    mats = [_preview_on_mat(img, col_w, label) for label, img in items]
    gap = 16
    header_h = 80
    row_h = max(mats[i].height for i in range(0, len(mats), cols))
    rows = (len(mats) + cols - 1) // cols
    body_h = rows * row_h + gap * (rows - 1)
    sheet_w = 40 * 2 + cols * col_w + gap * (cols - 1)
    sheet_h = header_h + body_h + 40
    sheet = Image.new("RGBA", (sheet_w, sheet_h), NAVY_DEEP + (255,))
    draw = ImageDraw.Draw(sheet)
    title_font = fnt(FONT_AVENIR_COND, 34, AVC_HEAVY)
    sub_font = fnt(FONT_AVENIR, 15, AV_MED)
    draw.text((40, 22), "STANCEPRO STICKERS", font=title_font, fill=WHITE)
    draw.text((40, 58), "Canva crystal + outline hex · Michroma v5 lockup @ 300dpi", font=sub_font, fill=BLUE_ACCENT)
    y = header_h
    for i, mat in enumerate(mats):
        col = i % cols
        row = i // cols
        x = 40 + col * (col_w + gap)
        my = y + row * (row_h + gap) + (row_h - mat.height) // 2
        sheet.paste(mat, (x, my), mat)
    return sheet


def main() -> None:
    outputs = [
        ("sticker_snowboard_navy_6x2in_300dpi.png", render_snowboard_sticker_navy()),
        ("sticker_snowboard_white_6x2in_300dpi.png", render_snowboard_sticker_white()),
        ("sticker_snowboard_diecut_6x2in_300dpi.png", render_snowboard_sticker_diecut()),
        ("sticker_snowboard_diecut_dark_board_6x2in_300dpi.png", render_snowboard_sticker_diecut(dark_board=True)),
        ("sticker_helmet_hex_2.5in_300dpi.png", render_helmet_sticker_hex()),
        ("sticker_helmet_white_2.5in_300dpi.png", render_helmet_sticker_white()),
        ("sticker_helmet_badge_2.5in_300dpi.png", render_helmet_sticker_badge()),
        ("sticker_shop_qr_3x3in_300dpi.png", render_shop_qr_sticker()),
        ("tee_chest_dark_ink_11x14in_300dpi.png", render_tee(dark_ink=True)),
        ("tee_chest_light_ink_11x14in_300dpi.png", render_tee(dark_ink=False)),
    ]

    for name, img in outputs:
        save(img, name)
        if _has_transparency(img):
            prev = render_checkerboard_preview(img)
        else:
            prev = render_preview(img)
        save(prev, name.replace("_300dpi", "_preview"))

    sheet = build_sticker_preview_sheet()
    save(sheet, "sticker_preview_sheet.png")
    save(render_preview(sheet, max_w=1400), "sticker_preview_sheet_web.png")

    save(render_tee_mockup(light_shirt=True), "tee_mockup_light_shirt_preview.png")
    save(render_tee_mockup(light_shirt=False), "tee_mockup_dark_shirt_preview.png")

    print(f"\nDone — {len(outputs) * 2 + 4} files in {OUT_DIR}")


if __name__ == "__main__":
    main()
