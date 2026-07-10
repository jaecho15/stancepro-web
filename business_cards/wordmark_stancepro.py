#!/usr/bin/env python3
"""Proportional STANCEPRO with matched stroke weight + tunable per-pair spacing."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pyclipper
from PIL import Image, ImageDraw, ImageChops
import build_michroma_bold_wordmark as B
import wordmark_geometric_sc as RS
from fontTools.pens.svgPathPen import SVGPathPen

# per-letter ink-width override (width changed but vertical-stem weight kept)
WIDTH_OVERRIDE = {"S": 1900.0, "A": 2000.0, "N": 1900.0, "C": 1900.0, "E": 1900.0}
STEM_V = 276.0
_HCLIP = 64
_YF = 64.0


def _hoffset(polys, delta):
    """Horizontal-only outline offset (magnify Y so isotropic offset acts in X)."""
    if abs(delta) < 1e-6:
        return [list(p) for p in polys]
    subj = [[(int(round(x * _HCLIP)), int(round(y * _YF * _HCLIP))) for x, y in p] for p in polys]
    pco = pyclipper.PyclipperOffset(miter_limit=3.0, arc_tolerance=0.25 * _HCLIP)
    for s in subj:
        pco.AddPath(s, pyclipper.JT_ROUND, pyclipper.ET_CLOSEDPOLYGON)
    sol = pco.Execute(delta * _HCLIP)
    out = []
    for s in sol:
        pts = [(x / _HCLIP, y / _HCLIP / _YF) for x, y in s]
        is_outer = pyclipper.Orientation(s)   # preserve holes: outer->area<0, hole->area>0
        if (B.signed_area(pts) < 0) != is_outer:
            pts.reverse()
        out.append(pts)
    return out


def set_width_keep_weight(polys, target_w, stem=STEM_V):
    """Scale X to hit target width, then restore vertical-stem weight."""
    xs = [x for p in polys for x, _ in p]
    W = max(xs) - min(xs); mnx = min(xs)
    s = (target_w - stem) / (W - stem)
    d = stem * (1.0 - s) / 2.0
    scaled = [[((x - mnx) * s + mnx, y) for x, y in p] for p in polys]
    return _hoffset(scaled, d)

OUT = Path(__file__).resolve().parent / "merch" / "wordmark_out"
font = B.load_michroma(); gs = font.getGlyphSet(); cmap = font.getBestCmap()
v5 = next(v for v in B.VARIANTS if v.slug == "v5_ultra")
GEO = {"S": RS.stroke(RS.S_centerline()), "C": RS.stroke(RS.C_centerline())}
Y0, Y1 = -120, 1640
SS = 3

TARGET_GAP = 190.0        # target optical facing distance between adjacent letters (2x)
BOX_GAP = 90.0            # min clearance between bounding boxes, no-tuck (2x)
TUCK_DEPTH = 0.40         # T-A style tuck: 0=cleared, 1=full optical tuck
YLO, YHI, YSTEP = 0, 1578, 12


def glyph_polys(ch):
    if ch in GEO:
        return [list(p) for p in GEO[ch]]
    pen = SVGPathPen(gs); gs[cmap[ord(ch)]].draw(pen)
    return B.offset_glyph_polygons(pen.getCommands(), v5.offset)


def normalize_ink(polys):
    xs = [x for p in polys for x, _ in p]
    mnx = min(xs)
    return [[(x - mnx, y) for x, y in p] for p in polys], (max(xs) - mnx)


def silhouettes(polys):
    """left/right ink silhouette x at each sampled y (None where no ink)."""
    ys = list(range(YLO, YHI + 1, YSTEP))
    left = {}; right = {}
    for y0 in ys:
        xs = []
        for p in polys:
            n = len(p)
            for i in range(n):
                x1, y1 = p[i]; x2, y2 = p[(i + 1) % n]
                if (y1 - y0) * (y2 - y0) <= 0 and y1 != y2:
                    t = (y0 - y1) / (y2 - y1)
                    if 0 <= t <= 1:
                        xs.append(x1 + t * (x2 - x1))
        if xs:
            left[y0] = min(xs); right[y0] = max(xs)
    return left, right


def optical_offset(prev_right, next_left, target, pct=0.97):
    """origin for next letter so the *closest* facing approach == target.

    facing_gap(y) = origin - d(y) where d(y)=prev_right(y)-next_left(y); the tightest
    gap is at max d. Use a high percentile of d (not the max) so a single protruding
    point doesn't over-space, and open letters (C/E) don't nest into each other."""
    common = [y for y in prev_right if y in next_left]
    diffs = sorted(prev_right[y] - next_left[y] for y in common)
    if not diffs:
        return target
    d = diffs[min(len(diffs) - 1, int(pct * len(diffs)))]
    return d + target


def render(target_gap=TARGET_GAP, dark=True, target_w=1600, transparent=False,
           tuck_depth=TUCK_DEPTH):
    data = []
    for ch in B.TEXT:
        gp = glyph_polys(ch)
        if ch in WIDTH_OVERRIDE:
            gp = set_width_keep_weight(gp, WIDTH_OVERRIDE[ch])
        polys, w = normalize_ink(gp)
        L, Rr = silhouettes(polys)
        data.append((ch, polys, w, L, Rr))
    placed = []
    cur = 0.0
    prev_right_abs = None
    for i, (ch, polys, w, L, Rr) in enumerate(data):
        if prev_right_abs is None:
            origin = 0.0
        else:
            origin = optical_offset(prev_right_abs, L, target_gap)
            # tuck_depth blends between no-tuck (0: leftmost ink clears the previous
            # letter's rightmost ink by BOX_GAP) and full optical (1: allows the tuck,
            # e.g. A under the T bar). Only pairs that would tuck are affected.
            box_min = max(prev_right_abs.values()) + BOX_GAP
            origin = origin + (1.0 - tuck_depth) * max(0.0, box_min - origin)
        fill = (255, 255, 255, 255) if i < B.SPLIT else (63, 169, 245, 255)
        if not dark:
            fill = (26, 46, 97, 255) if i < B.SPLIT else (0, 122, 230, 255)
        placed.append(([[(x + origin, y) for x, y in p] for p in polys], fill))
        prev_right_abs = {y: Rr[y] + origin for y in Rr}
        cur = origin + w
    total_w = cur
    if transparent:
        bg = (0, 0, 0, 0)
    else:
        bg = (15, 28, 64, 255) if dark else (255, 255, 255, 255)
    scale = target_w / total_w * SS
    iw, ih = int(total_w * scale), int((Y1 - Y0) * scale)
    img = Image.new("RGBA", (iw, ih), bg)
    for polys, fill in placed:
        mask = Image.new("L", (iw, ih), 0)
        for p in polys:
            pts = [(x * scale, (Y1 - y) * scale) for x, y in p]
            layer = Image.new("L", (iw, ih), 0)
            ImageDraw.Draw(layer).polygon(pts, fill=255)
            mask = ImageChops.lighter(mask, layer) if B.signed_area(p) < 0 else ImageChops.subtract(mask, layer)
        img.paste(Image.new("RGBA", (iw, ih), fill), (0, 0), mask)
    return img.resize((iw // SS, ih // SS), Image.LANCZOS)


def crop_to_ink(img, pad_frac=0.02, min_pad=6):
    bbox = img.getbbox()
    if not bbox:
        return img
    cropped = img.crop(bbox)
    pad = max(min_pad, int(round(cropped.height * pad_frac)))
    out = Image.new("RGBA", (cropped.width + 2 * pad, cropped.height + 2 * pad), (0, 0, 0, 0))
    out.paste(cropped, (pad, pad), cropped)
    return out


def export_production(out_dir, target_gap=TARGET_GAP, target_w=2600):
    """Write transparent dark/light wordmark PNGs for the website. Returns (w,h)."""
    from pathlib import Path as _P
    out_dir = _P(out_dir)
    dims = {}
    for dark in (True, False):
        img = crop_to_ink(render(target_gap=target_gap, dark=dark, target_w=target_w,
                                 transparent=True))
        tag = "dark" if dark else "light"
        path = out_dir / f"logo-title-{tag}.png"
        img.save(path)
        dims[tag] = img.size
        print(f"wrote {path}  {img.size}")
    return dims


if __name__ == "__main__":
    import sys as _sys
    if len(_sys.argv) > 1 and _sys.argv[1] == "export":
        d = export_production(_sys.argv[2] if len(_sys.argv) > 2 else OUT)
        w, h = d["dark"]
        print(f"aspect ratio = {w}/{h} = {w / h:.4f}")
    else:
        tg = float(_sys.argv[1]) if len(_sys.argv) > 1 else TARGET_GAP
        for dark in (True, False):
            img = render(target_gap=tg, dark=dark)
            tag = "dark" if dark else "light"
            img.convert("RGB").save(OUT / f"prop_wm_{tag}.png")
            print(f"wrote prop_wm_{tag}.png {img.size}  (target_gap={tg})")
