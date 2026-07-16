"""On-demand short-range snow forecast (Vercel Python serverless function).

GET /api/short-range-snow?resort_id=<id>[&max_age_s=10800][&refresh=1]

Flow (on-demand + cache):
  1. Look up the serving table `public.short_range_forecasts` for this resort.
  2. Fresh row (younger than max_age_s) and no ?refresh → return it (cache hit,
     no compute).
  3. Otherwise fetch the resort's metadata, compute the base-config forecast with
     the SAME pandas-free core as the batch pipeline (parity proven by
     StancePro/scripts/test_short_range_core.py), upsert it into the table so the
     next reader (this device or anyone else) gets a cache hit, and return it.

Response 200:
  { resort_id, cached, config_version, generated_at, age_seconds, payload, summary }
  `payload` is exactly the jsonb the table stores and the iOS app already decodes
  (ShortRangeSnowRepository reads the `payload` column with convertFromSnakeCase).

Writes require SUPABASE_SECRET_KEY in the environment. If it is absent the
endpoint still computes and returns a fresh forecast — it just cannot populate
the cache (degraded, not broken).
"""
from __future__ import annotations

import json
import math
import os
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _short_range_core as core  # noqa: E402
import _snow_outlook_slug_map as slug_map  # noqa: E402

TABLE = "short_range_forecasts"
DEFAULT_MAX_AGE_S = 3 * 60 * 60  # 3h — matches the app's TTL and NWP cadence
CONFIG_VERSION = "base"

SUPABASE_URL = (
    os.environ.get("SUPABASE_URL")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    or core.DEFAULT_SUPABASE_URL
).rstrip("/")
READ_KEY = (
    os.environ.get("SUPABASE_ANON_KEY")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    or core.DEFAULT_SUPABASE_PUBLISHABLE_KEY
)
WRITE_KEY = os.environ.get("SUPABASE_SECRET_KEY")  # required only for caching


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        text = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(text)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _parse_float(value: str | None) -> float | None:
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


# The map ski-resort index (~3,466 OSM/manual resorts) published to Storage —
# the SAME catalog these coordinate-override requests originate from, and where
# each resort's country was already resolved (accurate polygon reverse-geocode
# at build time). We reuse it, keyed by resort_id, to backfill country_code when
# the caller omits ?country=. Cached across warm invocations. This is the
# authoritative source (not the 314-row curated seed in snow_outlook_resorts).
STORAGE_BASE = f"{SUPABASE_URL}/storage/v1/object/public/ride-tracker-static/ski-resorts"
_RESORT_INDEX_CACHE: tuple[dict[str, str], list[tuple[float, float, str]]] | None = None


def _load_resort_index() -> tuple[dict[str, str], list[tuple[float, float, str]]]:
    """(by_id, geo) where by_id maps resort_id→country and geo is a list of
    (lat, lon, country) used as a nearest-neighbour fallback."""
    global _RESORT_INDEX_CACHE
    if _RESORT_INDEX_CACHE is not None:
        return _RESORT_INDEX_CACHE
    by_id: dict[str, str] = {}
    geo: list[tuple[float, float, str]] = []
    try:
        manifest = requests.get(f"{STORAGE_BASE}/manifest.json", timeout=15)
        manifest.raise_for_status()
        index_file = (manifest.json() or {}).get("file")
        if index_file:
            index = requests.get(f"{STORAGE_BASE}/{index_file}", timeout=20)
            index.raise_for_status()
            for entry in (index.json() or {}).get("resorts", []):
                code = entry.get("country")
                rid = entry.get("id")
                if not code:
                    continue
                if rid:
                    by_id[str(rid)] = str(code)
                lat = _parse_float(entry.get("lat"))
                lon = _parse_float(entry.get("lon"))
                if lat is not None and lon is not None:
                    geo.append((lat, lon, str(code)))
    except requests.RequestException:
        by_id, geo = {}, []
    _RESORT_INDEX_CACHE = (by_id, geo)
    return _RESORT_INDEX_CACHE


def _resolve_country(resort_id: str, weather_id: str, lat: float, lon: float) -> str | None:
    """Country for a coordinate-override resort: exact resort_id hit in the map
    index first (authoritative), else the nearest resort in that same index."""
    by_id, geo = _load_resort_index()
    for key in (resort_id, weather_id):
        code = by_id.get(key)
        if code:
            return code
    if not geo:
        return None
    lat_rad = math.radians(lat)
    best_code: str | None = None
    best_dist = float("inf")
    for r_lat, r_lon, code in geo:
        dlat = r_lat - lat
        dlon = (r_lon - lon) * math.cos(lat_rad)
        dist = dlat * dlat + dlon * dlon
        if dist < best_dist:
            best_dist = dist
            best_code = code
    return best_code


def _read_cache(resort_id: str) -> dict | None:
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/{TABLE}",
        params={
            "resort_id": f"eq.{resort_id}",
            "select": "payload,summary,generated_at,config_version",
            "limit": 1,
        },
        headers={"apikey": READ_KEY, "Authorization": f"Bearer {READ_KEY}"},
        timeout=15,
    )
    response.raise_for_status()
    rows = response.json()
    return rows[0] if rows else None


def _write_cache(resort: dict, payload: dict, summary: dict) -> bool:
    if not WRITE_KEY:
        return False
    now = datetime.now(tz=timezone.utc)
    row = {
        "resort_id": resort["resort_id"],
        "country_code": resort.get("country_code"),
        "region_id": resort.get("region_id"),
        "payload": payload,
        "summary": summary,
        "cycle": now.strftime("%Y%m%d"),
        "config_version": CONFIG_VERSION,
        "generated_at": payload.get("generated_utc") or now.isoformat(),
        "updated_at": now.isoformat(),
    }
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/{TABLE}",
        params={"on_conflict": "resort_id"},
        headers={
            "apikey": WRITE_KEY,
            "Authorization": f"Bearer {WRITE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        data=json.dumps([row]),
        timeout=20,
    )
    response.raise_for_status()
    return True


def _fetch_resort_metadata(requested_id: str, weather_id: str) -> dict | None:
    """Resolve elev/country metadata from snow_outlook_resorts (still slug-keyed)."""
    if not (requested_id.startswith("osm-") or requested_id.startswith("manual-")):
        return core.fetch_resort(requested_id)
    # OSM/manual request: reverse map to curated slug when available.
    reverse = {osm: slug for slug, osm in slug_map.load_slug_to_osm().items()}
    slug = reverse.get(weather_id)
    return core.fetch_resort(slug) if slug else None


def _build(resort_id: str, max_age_s: int, refresh: bool,
           resort_override: dict | None = None) -> tuple[int, dict]:
    now = datetime.now(tz=timezone.utc)
    # Serving + cache keys are weather identity (OSM/manual), not curated slugs.
    weather_id = slug_map.canonical_weather_id(resort_id)

    if not refresh:
        try:
            cached = _read_cache(weather_id)
        except requests.RequestException:
            cached = None
        if cached:
            generated = _parse_iso(cached.get("generated_at"))
            age = (now - generated).total_seconds() if generated else None
            if age is not None and age <= max_age_s:
                return 200, {
                    "resort_id": weather_id,
                    "cached": True,
                    "config_version": cached.get("config_version") or CONFIG_VERSION,
                    "generated_at": cached.get("generated_at"),
                    "age_seconds": round(age),
                    "payload": cached.get("payload"),
                    "summary": cached.get("summary"),
                }

    # An override (lat/lon supplied by the caller — e.g. the map ski-resort
    # index) skips the DB lookup and computes straight from the coordinates.
    resort = resort_override or _fetch_resort_metadata(resort_id, weather_id)
    if not resort:
        return 404, {"error": "resort_not_found", "resort_id": resort_id}

    resort = {**resort, "resort_id": weather_id}
    payload = core.compute_forecast(resort)
    if isinstance(payload, dict):
        payload = {**payload, "resort_id": weather_id}
    summary = core.build_summary(payload)
    try:
        wrote = _write_cache(resort, payload, summary)
    except requests.RequestException:
        wrote = False

    return 200, {
        "resort_id": weather_id,
        "cached": False,
        "cache_written": wrote,
        "config_version": CONFIG_VERSION,
        "generated_at": payload.get("generated_utc"),
        "age_seconds": 0,
        "payload": payload,
        "summary": summary,
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 (Vercel/BaseHTTPRequestHandler contract)
        query = parse_qs(urlparse(self.path).query)
        resort_id = (query.get("resort_id") or query.get("resortId") or [""])[0].strip()
        if not resort_id:
            return self._send(400, {"error": "missing_resort_id"})

        try:
            max_age_s = int((query.get("max_age_s") or [DEFAULT_MAX_AGE_S])[0])
        except ValueError:
            max_age_s = DEFAULT_MAX_AGE_S
        refresh = (query.get("refresh") or ["0"])[0] not in ("0", "", "false")

        # Optional coordinate override: when lat+lon are supplied (the map index's
        # OSM resorts, absent from snow_outlook_resorts), compute straight from
        # them. resort_id-only calls keep the existing DB-lookup path (curated 314).
        lat = _parse_float((query.get("lat") or [None])[0])
        lon = _parse_float((query.get("lon") or [None])[0])
        resort_override = None
        if lat is not None and lon is not None:
            country = (query.get("country") or [None])[0]
            country = country.strip() if country else None
            # Fallback so on-demand map-index resorts never persist a NULL
            # country_code (which would drop them from country-scoped queries).
            if not country:
                weather_id = slug_map.canonical_weather_id(resort_id)
                country = _resolve_country(resort_id, weather_id, lat, lon)
            resort_override = {
                "resort_id": resort_id,
                "lat": lat,
                "lon": lon,
                "base_elevation_m": _parse_float((query.get("base_m") or [None])[0]),
                "top_elevation_m": _parse_float((query.get("top_m") or [None])[0]),
                "country_code": country,
                "region_id": None,
            }

        try:
            status, body = _build(resort_id, max_age_s, refresh, resort_override)
        except Exception as exc:  # noqa: BLE001 — surface as JSON, never 500 HTML
            return self._send(502, {"error": "compute_failed", "detail": str(exc)})
        return self._send(status, body)

    def _send(self, status: int, body: dict):
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        # D1-16 is stale in hours; let a CDN/proxy hold it briefly, allow stale.
        self.send_header("Cache-Control", "public, max-age=300, stale-while-revalidate=3600")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
