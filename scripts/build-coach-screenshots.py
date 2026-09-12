"""Produce the final, privacy-cleaned screenshots used by the /coaches page.

Provenance: the sources are raw iOS simulator captures of the real app. They are
deliberately NOT in this repo — they show a real account's name, certificate
photo, bank details and real riders' names and faces. This script records exactly
what was substituted, so the committed .webp files can be audited:

  * coach / rider names -> "Sam Rivers", "Mia", "Tom"
  * payout account      -> NZ / NZD / SAM RIVERS / ****4417
  * earnings figures    -> sample activity (8 sessions, 4.9 rating, NZD totals)
  * certificate level   -> SBINZ Level 3, with the proof photo blurred
  * a real coach's face -> blurred in the picture-in-picture

The page carries a visible note that these screens use sample data. Re-running
needs the raw captures restored to RAW below.
"""
import os
import sys
sys.path.insert(0, '/tmp')
from retouch import patch_text
from PIL import Image, ImageFilter, ImageDraw


def blur_rounded(im, box, radius, corner):
    """Gaussian-blur a region, keeping its rounded-rectangle silhouette."""
    region = im.crop(box)
    blurred = region.filter(ImageFilter.GaussianBlur(radius))
    mask = Image.new('L', region.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, region.width - 1, region.height - 1],
                                           radius=corner, fill=255)
    im.paste(blurred, (box[0], box[1]), mask)

D = '/Users/jchomba2025/App_Dev/stancepro-web/public/screenshots/coach/'
RAW = ('/private/tmp/claude-501/-Users-jchomba2025-App-Dev/'
       '2c0d0cfb-879c-47f4-9555-2e7fec177c47/scratchpad/coach-raw/')
ANNOT = ('/Users/jchomba2025/App_Dev/_market_strategy/business_cards/'
         'screenshots/04_coaching_annotation_1284x2778.png')

NAVY = (25, 46, 97)
GREY = (142, 142, 147)
BLUE = (0, 122, 229)
ORANGE = (255, 141, 40)
W = (255, 255, 255)


def save(im, name):
    im.save(D + name, optimize=True)
    print('wrote', name, im.size)


# 1. Earnings — demo activity, NZD
im = Image.open(RAW + 'raw-earnings.png').convert('RGB')
patch_text(im, (280, 955, 926, 1080), 'NZD 240.00', 110, 'Bold', NAVY, 'center', W)
patch_text(im, (60, 1248, 372, 1322), 'NZD 0.00', 46, 'Bold', NAVY, 'center', W)
patch_text(im, (450, 1248, 757, 1322), 'NZD 80.00', 46, 'Bold', NAVY, 'center', W)
patch_text(im, (835, 1248, 1142, 1322), 'NZD 240.00', 46, 'Bold', NAVY, 'center', W)
patch_text(im, (840, 1455, 1116, 1528), 'NZD 80.00', 46, 'Bold', ORANGE, 'right', W)
patch_text(im, (1040, 1645, 1116, 1712), '1', 50, 'Regular', GREY, 'right', W)
patch_text(im, (1010, 1775, 1116, 1845), '4.9', 50, 'Regular', GREY, 'right', W)
patch_text(im, (1040, 1910, 1116, 1978), '6', 50, 'Regular', GREY, 'right', W)
patch_text(im, (1000, 2088, 1068, 2158), '8', 50, 'Regular', GREY, 'right', W)
save(im, 'coach-earnings.png')

# 2. Payout account — NZ bank account, fictional holder
im = Image.open(RAW + 'raw-payout-contract.png').convert('RGB')
patch_text(im, (1010, 500, 1068, 555), '8', 50, 'Regular', GREY, 'right', W)
patch_text(im, (950, 1400, 1116, 1510), 'NZ', 46, 'Semibold', NAVY, 'right', W)
patch_text(im, (950, 1525, 1116, 1625), 'NZD', 46, 'Semibold', NAVY, 'right', W)
patch_text(im, (620, 1640, 1116, 1740), 'SAM RIVERS', 46, 'Semibold', NAVY, 'right', W)
patch_text(im, (800, 1755, 1116, 1850), '****4417', 46, 'Semibold', NAVY, 'right', W)
save(im, 'coach-payout.png')

# 3. My coaching sessions — fictional rider + coach names, default avatars
im = Image.open(RAW + 'raw-my-sessions.png').convert('RGB')
im.paste(im.crop((70, 1376, 148, 1454)), (639, 1376))
patch_text(im, (70, 1232, 560, 1308), 'Toe edge chatter', 52, 'Bold', NAVY, 'left', W)
patch_text(im, (152, 1386, 420, 1442), 'Mia', 44, 'Regular', NAVY, 'left', W)
patch_text(im, (722, 1386, 1000, 1442), 'Tom', 44, 'Regular', NAVY, 'left', W)
patch_text(im, (148, 1460, 578, 1510), 'Coached by Sam', 44, 'Regular', BLUE, 'left', W)
patch_text(im, (722, 1460, 1155, 1510), 'Coached by Sam', 44, 'Regular', BLUE, 'left', W)
save(im, 'coach-sessions.png')

# 4. Application — certifications + specialties (level bumped, proof photo obscured)
im = Image.open(RAW + 'raw-application-specialties2.png').convert('RGB')
blur_rounded(im, (97, 578, 297, 772), 14, 20)
patch_text(im, (322, 604, 900, 684), 'SBINZ Level 3 (2026)', 54, 'Medium', NAVY, 'left', W)
save(im, 'coach-application-profile.png')

# 5. Request Status — the dimmed card behind the sheet must match the earnings demo
im = Image.open(RAW + 'raw-request-status.png').convert('RGB')
DIM_BG = (204, 204, 204)
DIM_NAVY = (20, 37, 78)
patch_text(im, (280, 955, 926, 1080), 'NZD 240.00', 110, 'Bold', DIM_NAVY, 'center', DIM_BG)
save(im, 'coach-request-modes.png')

# 6-8. Already free of personal data — copy through
for src, dst in [
    ('raw-cert-level3.png', 'coach-application-certificate.png'),
    ('raw-cert-associations.png', 'coach-application-associations.png'),
    ('raw-application-bio-contract.png', 'coach-application-contract.png'),
]:
    save(Image.open(RAW + src).convert('RGB'), dst)

# 8. Rider entry lanes — crop above the session cards so no rider names appear
im = Image.open(RAW + 'raw-video-analysis-lanes.png').convert('RGB')
save(im.crop((0, 0, 1206, 1150)), 'rider-entry-lanes.png')

# 9. Coach review tools — blur the real coach's face in the picture-in-picture
im = Image.open(ANNOT).convert('RGB')
blur_rounded(im, (200, 745, 438, 1042), 22, 26)
save(im, 'coach-review-tools.png')

# 10. Downscale and encode as WebP — these render at 260px (460px for the lanes
#     strip), so ~2.5x display width is plenty, and WebP cuts the payload ~6x.
TARGET_WIDTH = {'rider-entry-lanes.png': 920}
DEFAULT_WIDTH = 640
for name in sorted(os.listdir(D)):
    if not name.endswith('.png'):
        continue
    im = Image.open(D + name).convert('RGB')
    target = TARGET_WIDTH.get(name, DEFAULT_WIDTH)
    if im.width > target:
        im = im.resize((target, round(im.height * target / im.width)), Image.LANCZOS)
    out = name[:-4] + '.webp'
    im.save(D + out, 'WEBP', quality=86, method=6)
    os.remove(D + name)
    print('encoded', out, im.size)
