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
import os
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _short_range_core as core  # noqa: E402

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


def _build(resort_id: str, max_age_s: int, refresh: bool) -> tuple[int, dict]:
    now = datetime.now(tz=timezone.utc)

    if not refresh:
        try:
            cached = _read_cache(resort_id)
        except requests.RequestException:
            cached = None
        if cached:
            generated = _parse_iso(cached.get("generated_at"))
            age = (now - generated).total_seconds() if generated else None
            if age is not None and age <= max_age_s:
                return 200, {
                    "resort_id": resort_id,
                    "cached": True,
                    "config_version": cached.get("config_version") or CONFIG_VERSION,
                    "generated_at": cached.get("generated_at"),
                    "age_seconds": round(age),
                    "payload": cached.get("payload"),
                    "summary": cached.get("summary"),
                }

    resort = core.fetch_resort(resort_id)
    if not resort:
        return 404, {"error": "resort_not_found", "resort_id": resort_id}

    payload = core.compute_forecast(resort)
    summary = core.build_summary(payload)
    try:
        wrote = _write_cache(resort, payload, summary)
    except requests.RequestException:
        wrote = False

    return 200, {
        "resort_id": resort_id,
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

        try:
            status, body = _build(resort_id, max_age_s, refresh)
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
