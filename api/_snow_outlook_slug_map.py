"""Resolve snow_outlook curated slugs to OSM / gapfill weather ids (Vercel copy)."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

DEFAULT_MAP_PATH = Path(__file__).resolve().parent / "data" / "snow_outlook_slug_to_osm.json"


@lru_cache(maxsize=4)
def _load(path: str) -> dict[str, str]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    by_slug = payload.get("by_slug") or {}
    out: dict[str, str] = {}
    for slug, entry in by_slug.items():
        if isinstance(entry, dict) and isinstance(entry.get("osm_id"), str):
            out[str(slug)] = entry["osm_id"]
    return out


@lru_cache(maxsize=4)
def _load_osm_to_slug(path: str) -> dict[str, str]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    by_osm = payload.get("by_osm_id") or {}
    out: dict[str, str] = {}
    for osm_id, entries in by_osm.items():
        if not isinstance(entries, list) or not entries:
            continue
        first = entries[0]
        if isinstance(first, dict) and isinstance(first.get("slug"), str):
            out[str(osm_id)] = first["slug"]
    # Fallback: invert by_slug when by_osm_id is missing an entry.
    for slug, entry in (payload.get("by_slug") or {}).items():
        if isinstance(entry, dict) and isinstance(entry.get("osm_id"), str):
            out.setdefault(str(entry["osm_id"]), str(slug))
    return out


def load_slug_to_osm(map_path: Path | None = None) -> dict[str, str]:
    path = Path(map_path) if map_path else DEFAULT_MAP_PATH
    return dict(_load(str(path.resolve())))


def load_osm_to_slug(map_path: Path | None = None) -> dict[str, str]:
    path = Path(map_path) if map_path else DEFAULT_MAP_PATH
    return dict(_load_osm_to_slug(str(path.resolve())))


def curated_slug_for_weather_id(resort_id: str, map_path: Path | None = None) -> str | None:
    """OSM/manual weather id → curated snow_outlook slug (for snow_snowlines etc.).

    Passes a slug through unchanged; returns None when no curated slug maps."""
    rid = (resort_id or "").strip()
    if not rid:
        return None
    if not (rid.startswith("osm-") or rid.startswith("manual-")):
        return rid  # already a slug
    return load_osm_to_slug(map_path).get(rid)


def canonical_weather_id(resort_id: str, map_path: Path | None = None) -> str:
    rid = (resort_id or "").strip()
    if not rid:
        return rid
    if rid.startswith("osm-") or rid.startswith("manual-"):
        return rid
    return load_slug_to_osm(map_path).get(rid, rid)


def apply_weather_id(payload: dict, map_path: Path | None = None) -> dict:
    out = dict(payload)
    weather_id = canonical_weather_id(str(out.get("resort_id") or ""), map_path)
    out["resort_id"] = weather_id
    return out
