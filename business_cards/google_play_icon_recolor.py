"""Build light Google Play mark from dark 512px source (same geometry, recolored)."""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
PLAY_DARK = HERE / "GooglePlayAssets/google-play-icon-512.png"
PLAY_ASSETS = HERE / "GooglePlayAssets"
MERCH_DIR = HERE / "merch"

CREAM = (249, 247, 240)
NAVY_HEX_TOP = (34, 58, 112)
NAVY_HEX_BOT = (20, 36, 78)
CRYSTAL_TOP = (92, 206, 255)
CRYSTAL_BOT = (8, 118, 242)
WHITE = (255, 255, 255)
UPSCALE = 6
OUT_SIZE = 512


def _lerp(a: tuple, b: tuple, t: float) -> tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _dist(a, b) -> float:
    return math.sqrt(sum((float(x) - float(y)) ** 2 for x, y in zip(a[:3], b[:3])))


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def _bg_at(y: int, xf: float, edge_l, edge_r) -> tuple[float, float, float]:
    l, r = edge_l[y], edge_r[y]
    return tuple(l[i] * (1 - xf) + r[i] * xf for i in range(3))


def _interpolate_rows(values: list[tuple | None]) -> list[tuple]:
    out: list[tuple | None] = values[:]
    known = [i for i, v in enumerate(out) if v is not None]
    if not known:
        return [(70.0, 130.0, 200.0)] * len(values)
    first = out[known[0]]
    for i in range(known[0]):
        out[i] = first
    for a, b in zip(known, known[1:]):
        va, vb = out[a], out[b]
        for i in range(a + 1, b):
            t = (i - a) / (b - a)
            out[i] = tuple(va[j] + (vb[j] - va[j]) * t for j in range(3))
    last = out[known[-1]]
    for i in range(known[-1] + 1, len(out)):
        out[i] = last
    return [tuple(int(round(c)) for c in v) for v in out]  # type: ignore[arg-type]


def _hex_profile(img: Image.Image) -> list[tuple[int, int, int]]:
    w, h = img.size
    px = img.load()
    edge_l = [px[0, y] for y in range(h)]
    edge_r = [px[w - 1, y] for y in range(h)]
    rows: list[tuple | None] = []
    for y in range(h):
        samples = []
        for x in range(w):
            r, g, b = px[x, y]
            if _dist((r, g, b), _bg_at(y, x / (w - 1), edge_l, edge_r)) < 28:
                continue
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            if lum > 205:
                continue
            samples.append((r, g, b))
        if samples:
            rows.append(tuple(sum(c[i] for c in samples) // len(samples) for i in range(3)))
        else:
            rows.append(None)
    return _interpolate_rows(rows)


def _solve_weights(px, bg, href, snow=WHITE) -> tuple[float, float, float]:
    p = [float(v) for v in px]
    lum_p = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]
    lum_h = 0.299 * href[0] + 0.587 * href[1] + 0.114 * href[2]
    lum_s = 0.299 * snow[0] + 0.587 * snow[1] + 0.114 * snow[2]

    d_bg = _dist(p, bg)
    d_h = _dist(p, href)
    d_s = _dist(p, snow)
    inv_bg = 1.0 / (d_bg + 1.5)
    inv_h = 1.0 / (d_h + 1.5)
    inv_s = 1.0 / (d_s + 1.5)
    s = inv_bg + inv_h + inv_s
    w0, w1, w2 = inv_bg / s, inv_h / s, inv_s / s
    mark = w1 + w2
    if mark > 1e-9:
        t = _clamp01((lum_p - lum_h) / max(1.0, lum_s - lum_h))
        w2 = mark * t
        w1 = mark * (1.0 - t)
    return w0, w1, w2


def build_light_from_dark(src: Image.Image, *, upscale: int = UPSCALE) -> Image.Image:
    """Same filled-hex design as dark Play icon; cream + navy hex + blue crystal."""
    hi = src.convert("RGB").resize(
        (src.width * upscale, src.height * upscale), Image.LANCZOS
    )
    w, h = hi.size
    px = hi.load()
    edge_l = [px[0, y] for y in range(h)]
    edge_r = [px[w - 1, y] for y in range(h)]
    hex_ref = _hex_profile(hi)

    out = Image.new("RGB", (w, h))
    op = out.load()
    for y in range(h):
        yn = y / max(1, h - 1)
        navy = _lerp(NAVY_HEX_TOP, NAVY_HEX_BOT, yn)
        crystal = _lerp(CRYSTAL_TOP, CRYSTAL_BOT, yn)
        href = hex_ref[y]
        for x in range(w):
            p = px[x, y]
            bg = _bg_at(y, x / (w - 1), edge_l, edge_r)
            w0, w1, w2 = _solve_weights(p, bg, href)
            op[x, y] = tuple(
                int(CREAM[i] * w0 + navy[i] * w1 + crystal[i] * w2) for i in range(3)
            )
    return out.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)


def save_compare(out_dir: Path = MERCH_DIR) -> tuple[Path, Path, Path]:
    from PIL import ImageDraw, ImageFont

    out_dir.mkdir(parents=True, exist_ok=True)
    dark = Image.open(PLAY_DARK).convert("RGBA")
    light = build_light_from_dark(dark).convert("RGBA")

    dark_path = out_dir / "google_play_icon_dark_512.png"
    light_path = out_dir / "google_play_icon_light_512.png"
    compare_path = out_dir / "google_play_icon_dark_light_compare.png"
    dark.save(dark_path)
    light.save(light_path)
    light.save(PLAY_ASSETS / "google-play-icon-light-512.png")

    font = "/System/Library/Fonts/Avenir Next.ttc"
    navy_deep = (15, 28, 64)
    cell, pad, label_h = 300, 36, 48
    sheet = Image.new("RGBA", (pad * 3 + cell * 2, 96 + pad + cell + label_h + pad), navy_deep + (255,))
    draw = ImageDraw.Draw(sheet)
    title = ImageFont.truetype(font, size=26, index=8)
    sub = ImageFont.truetype(font, size=12, index=5)
    label_f = ImageFont.truetype(font, size=15, index=2)
    draw.text((pad, 20), "GOOGLE PLAY MARK — DARK vs LIGHT", font=title, fill=(255, 255, 255))
    draw.text((pad, 54), "Same design · 3-color unmix preserves anti-aliasing", font=sub, fill=(63, 169, 245))
    for i, (label, img, mat_bg) in enumerate(
        [("Dark — Play Store", dark, (24, 36, 72)), ("Light — cream bg", light, CREAM)]
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
    sheet.convert("RGB").save(compare_path, dpi=(144, 144))
    return dark_path, light_path, compare_path


if __name__ == "__main__":
    d, l, c = save_compare()
    print(f"saved: {d.name}, {l.name}, {c.name}")
