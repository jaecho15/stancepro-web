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


def load_slug_to_osm(map_path: Path | None = None) -> dict[str, str]:
    path = Path(map_path) if map_path else DEFAULT_MAP_PATH
    return dict(_load(str(path.resolve())))


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
