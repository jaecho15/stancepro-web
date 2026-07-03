#!/usr/bin/env python3
"""Remove duplicate / obsolete business-card, poster, and font-compare assets.

Canonical sources (regenerate; do not hand-edit):
  print_ready/*_preview.png     → business cards (brand review)
  posters/poster_{slug}_preview.png → active poster slugs only
  merch/font_compare/previews/{michroma_bold_v5,microgramma_bold}/

Deployment copies under stancepro-web/public/brand-review/ are produced by
sync_brand_review_web.py and are intentionally duplicated at deploy time.
"""
from __future__ import annotations

import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB_BRAND_REVIEW = ROOT.parent / "public/brand-review"

OFFICIAL_POSTER_PREVIEWS = frozenset({
    "poster_carve_preview.png",
    "poster_powder_preview.png",
    "poster_setup_preview.png",
    "poster_coaching_preview.png",
    "poster_ride_nav_preview.png",
})
ACTIVE_FONT_PREVIEW_DIRS = frozenset({"michroma_bold_v5", "microgramma_bold"})
LEGACY_POSTER_MARKERS = ("cardrona", "remarkables", "ski_setup", "setup_coaching", "home_hq")


def collect_removals() -> list[Path]:
    removals: list[Path] = []

    posters = ROOT / "posters"
    for path in posters.glob("*.png"):
        if path.name.startswith("_") or "debug" in path.name.lower():
            removals.append(path)
        elif any(marker in path.name for marker in LEGACY_POSTER_MARKERS):
            removals.append(path)

    for path in ROOT.glob("stancepro_business_card_*.png"):
        removals.append(path)

    previews = ROOT / "merch/font_compare/previews"
    if previews.exists():
        for subdir in previews.iterdir():
            if subdir.is_dir() and subdir.name not in ACTIVE_FONT_PREVIEW_DIRS:
                removals.extend(p for p in subdir.rglob("*") if p.is_file())

    mocks = ROOT / "merch/font_compare/michroma_bold_custom/mocks"
    for name in ("card_v3_premium.png", "poster_v3_premium.png"):
        path = mocks / name
        if path.is_file():
            removals.append(path)

    early = ROOT / "merch/font_compare/archive/early_options"
    if early.exists():
        removals.extend(early.glob("*.png"))

    web_posters = WEB_BRAND_REVIEW / "posters"
    if web_posters.exists():
        for path in web_posters.glob("*.png"):
            if any(marker in path.name for marker in LEGACY_POSTER_MARKERS):
                removals.append(path)

    return sorted(set(removals))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Delete files (default: dry-run list only)",
    )
    args = parser.parse_args()

    removals = collect_removals()
    print(f"{'Deleting' if args.apply else 'Would delete'} {len(removals)} file(s)")
    for path in removals:
        rel = path.relative_to(ROOT.parent) if path.is_relative_to(ROOT.parent) else path
        print(f"  {rel}")
        if args.apply:
            path.unlink()

    if args.apply:
        for empty in sorted(ROOT.rglob("*"), reverse=True):
            if empty.is_dir() and not any(empty.iterdir()):
                empty.rmdir()
        print("Done.")


if __name__ == "__main__":
    main()
