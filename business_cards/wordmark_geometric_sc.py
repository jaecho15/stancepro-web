#!/usr/bin/env python3
"""Clean geometric redesign of S and C: straight strokes + circular-arc corners,
stroked to constant thickness with flat terminal caps."""
import sys, math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import pyclipper

from build_michroma_bold_wordmark import load_michroma, offset_glyph_polygons, signed_area
from fontTools.pens.svgPathPen import SVGPathPen

OUT = Path(__file__).resolve().parent / "merch" / "wordmark_out"
font = load_michroma(); gs = font.getGlyphSet(); cmap = font.getBestCmap()
CLIP = 8

# ---- shared metrics (glyph space, matches offset=42 siblings) ----
# Flat-topped S/C align to FLAT-letter cap metrics (T/E/N: y in [-42, 1578]),
# NOT the round-letter overshoot ([-74, 1610]) which only applies to curved tops.
T = 250.0                 # horizontal stroke thickness (matches Michroma arms 250)
STEM_V = 276.0            # vertical stroke thickness (matches Michroma stems 276)
KX = T / STEM_V           # X-compress factor: round-stroke -> thick verticals on expand
H = T / 2.0
HV = STEM_V / 2.0         # vertical half-thickness (final space)
CAP_TOP = 1578.0          # flat cap height (offset space)
BASELINE = -42.0          # flat baseline (offset space)
Y_TOP = CAP_TOP - H       # top arm centerline
Y_BOT = BASELINE + H      # bottom arm centerline
Y_MID = (Y_TOP + Y_BOT) / 2.0
R = 300.0                 # centerline corner radius
CORNER_TERM = 42.0        # terminal-cap corner rounding (matches Michroma T/E/N ~42)


def arc(cx, cy, r, a0, a1, n=48):
    a0, a1 = math.radians(a0), math.radians(a1)
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / (n - 1)),
             cy + r * math.sin(a0 + (a1 - a0) * i / (n - 1))) for i in range(n)]


def C_centerline(x_left=224.0, x_right=2056.0, r=R):  # x_left: outer 86 = 224 - HV(138)
    xl = x_left
    pts = [(x_right, Y_TOP)]                       # top-right terminal
    pts += [(xl + r, Y_TOP)]
    pts += arc(xl + r, Y_TOP - r, r, 90, 180)      # top-left corner
    pts += [(xl, Y_BOT + r)]
    pts += arc(xl + r, Y_BOT + r, r, 180, 270)     # bottom-left corner
    pts += [(x_right, Y_BOT)]                       # bottom-right terminal
    return pts


def S_centerline(x_left=229.0, x_right=1923.0, x_tr=2061.0, x_bl=91.0, r=R):  # verts: outer 91/2061 = center -/+ HV(138)
    xl, xr = x_left, x_right
    pts = [(x_tr, Y_TOP)]                           # top-right terminal
    pts += [(xl + r, Y_TOP)]
    pts += arc(xl + r, Y_TOP - r, r, 90, 180)       # top-left
    pts += [(xl, Y_MID + r)]
    pts += arc(xl + r, Y_MID + r, r, 180, 270)      # upper-mid (down->right)
    pts += [(xr - r, Y_MID)]
    pts += arc(xr - r, Y_MID - r, r, 90, 0)         # lower-mid (right->down)
    pts += [(xr, Y_BOT + r)]
    pts += arc(xr - r, Y_BOT + r, r, 0, -90)        # bottom-right (down->left)
    pts += [(x_bl, Y_BOT)]                           # bottom-left terminal
    return pts


def _trim_end(p_end, p_next, d):
    """Move p_end toward p_next by distance d (shorten the path at a terminal)."""
    vx, vy = p_next[0] - p_end[0], p_next[1] - p_end[1]
    L = math.hypot(vx, vy)
    if L < 1e-9:
        return p_end
    return (p_end[0] + vx / L * d, p_end[1] + vy / L * d)


def stroke(centerline, thickness=T, corner_r=CORNER_TERM):
    """Stroke the centerline into the glyph outline, matching Michroma's thick/thin:
    vertical strokes STEM_V(276), horizontal strokes thickness(250).

    Achieved by compressing X by KX, stroking with a round pen (isotropic 250) so
    horizontals stay 250 and everything rounds cleanly, then expanding X by 1/KX so
    vertical strokes become 250/KX = 276 and corners take Michroma's slight ellipse.

    Flat terminal caps get corners softened by corner_r via a thin butt-cap stroke
    dilated by corner_r; endpoints are pre-trimmed by corner_r so the caps land flush
    with the verticals after dilation. All of this happens in the compressed X space."""
    centerline = [(x * KX, y) for x, y in centerline]      # compress X
    centerline[0] = _trim_end(centerline[0], centerline[1], corner_r)
    centerline[-1] = _trim_end(centerline[-1], centerline[-2], corner_r)
    subj = [(int(x * CLIP), int(y * CLIP)) for x, y in centerline]
    pco = pyclipper.PyclipperOffset(miter_limit=2.0, arc_tolerance=0.2 * CLIP)
    pco.AddPath(subj, pyclipper.JT_ROUND, pyclipper.ET_OPENBUTT)
    thin = pco.Execute((thickness / 2.0 - corner_r) * CLIP)
    pco2 = pyclipper.PyclipperOffset(miter_limit=2.0, arc_tolerance=0.2 * CLIP)
    for s in thin:
        pco2.AddPath(s, pyclipper.JT_ROUND, pyclipper.ET_CLOSEDPOLYGON)
    sol = pco2.Execute(corner_r * CLIP)
    polys = []
    for s in sol:
        pts = [(x / CLIP / KX, y / CLIP) for x, y in s]   # expand X back
        if signed_area(pts) > 0:      # ensure outer orientation (area < 0)
            pts.reverse()
        polys.append(pts)
    return polys


def sc_glyph(ch):
    """Public entry: return the geometric S or C outline polygons (glyph space)."""
    return stroke(S_centerline() if ch == "S" else C_centerline())
