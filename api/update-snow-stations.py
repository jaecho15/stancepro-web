"""Daily measured snow-depth station sync (Vercel cron worker).

GET /api/update-snow-stations

Pulls the latest snow depth from public mountain observation networks and
upserts one row per station into `public.snow_stations`:

  - US SNOTEL (USDA AWDB REST, ~900 stations): one wildcard daily-SNWD call
    covering the last 3 days + one station-metadata call. Inches → cm,
    feet → m.
  - Swiss SLF IMIS (~180 high-alpine stations): one bulk measurements call
    (latest HS per station, cm) + one stations call (lat/lon/elevation).
  - Japan JMA AMeDAS (~300 snow-measuring stations): latest map JSON (all
    stations' current obs; `snow` = depth cm, present only in winter) + the
    station table (deg/min arrays → decimal degrees, alt m).

Each adapter is independent — one network failing (or, like AMeDAS in summer,
reporting nothing) degrades coverage, never the run. The short-range compute
then uses the nearest fresh station as the measured anchor for per-band depth.

Writes require SUPABASE_SECRET_KEY. When Vercel's CRON_SECRET is configured the
endpoint only accepts requests carrying it (cron sends it automatically).
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler

import requests

SUPABASE_URL = (
    os.environ.get("SUPABASE_URL")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    or "https://ryiitcblrrqvjvxkobpf.supabase.co"
)
WRITE_KEY = os.environ.get("SUPABASE_SECRET_KEY")
TABLE = "snow_stations"
TIMEOUT_S = 50

SNOTEL_STATIONS_URL = "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/stations"
SNOTEL_DATA_URL = "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data"
SLF_STATIONS_URL = "https://measurement-api.slf.ch/public/api/imis/stations"
SLF_MEASUREMENTS_URL = "https://measurement-api.slf.ch/public/api/imis/measurements"
JMA_LATEST_TIME_URL = "https://www.jma.go.jp/bosai/amedas/data/latest_time.txt"
JMA_MAP_URL = "https://www.jma.go.jp/bosai/amedas/data/map/{stamp}.json"
JMA_META_URL = "https://www.jma.go.jp/bosai/amedas/const/amedastable.json"


def _rows_snotel() -> list[dict]:
    """All active SNOTEL stations' latest daily snow depth (last 3 days)."""
    meta = requests.get(
        SNOTEL_STATIONS_URL,
        params={"stationTriplets": "*:*:SNTL", "activeOnly": "true"},
        timeout=TIMEOUT_S,
    )
    meta.raise_for_status()
    by_triplet = {
        s["stationTriplet"]: s
        for s in meta.json()
        if s.get("latitude") is not None and s.get("longitude") is not None
    }

    today = datetime.now(tz=timezone.utc).date()
    data = requests.get(
        SNOTEL_DATA_URL,
        params={
            "stationTriplets": "*:*:SNTL",
            "elements": "SNWD",
            "beginDate": (today - timedelta(days=3)).isoformat(),
            "endDate": today.isoformat(),
            "duration": "DAILY",
        },
        timeout=TIMEOUT_S,
    )
    data.raise_for_status()

    rows: list[dict] = []
    for entry in data.json():
        station = by_triplet.get(entry.get("stationTriplet"))
        if not station:
            continue
        values = (entry.get("data") or [{}])[0].get("values") or []
        latest = next((v for v in reversed(values) if v.get("value") is not None), None)
        if latest is None:
            continue
        elevation_ft = station.get("elevation")
        rows.append({
            "station_id": f"sntl:{entry['stationTriplet']}",
            "source": "snotel",
            "name": station.get("name"),
            "lat": float(station["latitude"]),
            "lon": float(station["longitude"]),
            "elevation_m": round(float(elevation_ft) * 0.3048, 1) if elevation_ft is not None else None,
            "depth_cm": round(float(latest["value"]) * 2.54),  # inches → cm
            "asof": f"{latest['date']}T12:00:00Z",             # daily value, nominal midday
        })
    return rows


def _rows_slf() -> list[dict]:
    """All SLF IMIS snow stations' latest HS (cm), joined to station metadata."""
    stations = requests.get(SLF_STATIONS_URL, timeout=TIMEOUT_S)
    stations.raise_for_status()
    meta = {s["code"]: s for s in stations.json() if s.get("lat") and s.get("lon")}

    measurements = requests.get(SLF_MEASUREMENTS_URL, timeout=TIMEOUT_S)
    measurements.raise_for_status()
    latest: dict[str, dict] = {}
    for row in measurements.json():
        if row.get("HS") is None:
            continue
        code = row.get("station_code")
        stamp = row.get("measure_date") or ""
        if code and (code not in latest or stamp > (latest[code].get("measure_date") or "")):
            latest[code] = row

    rows: list[dict] = []
    for code, row in latest.items():
        station = meta.get(code)
        if not station:
            continue
        rows.append({
            "station_id": f"imis:{code}",
            "source": "imis",
            "name": station.get("label"),
            "lat": float(station["lat"]),
            "lon": float(station["lon"]),
            "elevation_m": station.get("elevation"),
            "depth_cm": round(float(row["HS"])),               # HS already cm
            "asof": row.get("measure_date"),
        })
    return rows


def _rows_amedas() -> list[dict]:
    """JMA AMeDAS stations currently reporting snow depth (winter only —
    off-season the map JSON simply has no `snow` fields and this returns [])."""
    stamp_text = requests.get(JMA_LATEST_TIME_URL, timeout=TIMEOUT_S)
    stamp_text.raise_for_status()
    stamp = datetime.fromisoformat(stamp_text.text.strip()).strftime("%Y%m%d%H%M%S")

    obs = requests.get(JMA_MAP_URL.format(stamp=stamp), timeout=TIMEOUT_S)
    obs.raise_for_status()
    meta = requests.get(JMA_META_URL, timeout=TIMEOUT_S)
    meta.raise_for_status()
    meta_by_id = meta.json()

    asof = datetime.fromisoformat(stamp_text.text.strip()).astimezone(timezone.utc).isoformat()
    rows: list[dict] = []
    for station_id, ob in obs.json().items():
        snow = (ob or {}).get("snow")
        if not isinstance(snow, list) or not snow or snow[0] is None:
            continue
        station = meta_by_id.get(station_id)
        if not station:
            continue
        lat_dm, lon_dm = station.get("lat"), station.get("lon")
        if not lat_dm or not lon_dm:
            continue
        rows.append({
            "station_id": f"amedas:{station_id}",
            "source": "amedas",
            "name": station.get("kjName") or station.get("enName"),
            "lat": lat_dm[0] + lat_dm[1] / 60.0,
            "lon": lon_dm[0] + lon_dm[1] / 60.0,
            "elevation_m": station.get("alt"),
            "depth_cm": round(float(snow[0])),                 # cm
            "asof": asof,
        })
    return rows


def collect() -> tuple[list[dict], dict[str, str]]:
    """Run every adapter; a failure records the error and skips that network."""
    rows: list[dict] = []
    errors: dict[str, str] = {}
    for name, adapter in (("snotel", _rows_snotel), ("imis", _rows_slf), ("amedas", _rows_amedas)):
        try:
            rows.extend(adapter())
        except Exception as exc:  # noqa: BLE001 — one network must not sink the run
            errors[name] = f"{type(exc).__name__}: {exc}"
    return rows, errors


def upsert(rows: list[dict]) -> int:
    if not rows or not WRITE_KEY:
        return 0
    now = datetime.now(tz=timezone.utc).isoformat()
    for row in rows:
        row["updated_at"] = now
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/{TABLE}",
        params={"on_conflict": "station_id"},
        headers={
            "apikey": WRITE_KEY,
            "Authorization": f"Bearer {WRITE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        data=json.dumps(rows),
        timeout=30,
    )
    response.raise_for_status()
    return len(rows)


class handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 (Vercel/BaseHTTPRequestHandler contract)
        cron_secret = os.environ.get("CRON_SECRET")
        if cron_secret and self.headers.get("Authorization") != f"Bearer {cron_secret}":
            self._send(401, {"error": "unauthorized"})
            return
        rows, errors = collect()
        try:
            written = upsert(rows)
        except Exception as exc:  # noqa: BLE001
            self._send(500, {"error": f"upsert failed: {exc}", "collected": len(rows),
                             "adapter_errors": errors})
            return
        counts: dict[str, int] = {}
        for row in rows:
            counts[row["source"]] = counts.get(row["source"], 0) + 1
        self._send(200, {
            "collected": len(rows),
            "written": written,
            "by_source": counts,
            "adapter_errors": errors,
            "write_key_present": bool(WRITE_KEY),
        })

    def _send(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
