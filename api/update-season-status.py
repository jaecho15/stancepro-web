"""Southern-hemisphere in-season snow status (Vercel cron worker).

GET /api/update-season-status

The validated seasonal-forecast network covers only NH regions; the SH winter
(JJA) would look empty on the outlook surfaces. This worker serves what CAN be
said honestly about an in-progress season — OBSERVED facts, no unvalidated
probabilities: season-to-date snowfall vs a 35-year climatology percentile,
the last 14 days vs their climatological norm, and the satellite snow-cover
state of the region's served resorts.

One row per SH region is upserted into `seasonal_snow_outlooks` with the same
row shape the validated rows use, so every existing decoder keeps working:
`trend` carries the region's REAL long-term JJA trend (computed here from the
same reanalysis series), `signal` is null (true — no validated forecast) and
`watch` is empty. The new content lives in `payload.status`, and
`payload.mode = "in_season_status"` is the discriminator new renderers key on.
Legacy apps simply render these as trend-only regions.

Data: Open-Meteo archive API (1991–2025 daily precip + band-downscaled mean
temp at each sampled resort's mid elevation) for climatology, and the forecast
API's past_days window (zero lag) for the current season. Snowfall derivation
matches the depth budget: precip counts as snow on days with tmean ≤ +1 °C at
SLR 10:1. Runs May–September (SH season); no-op otherwise.

Requires SUPABASE_SECRET_KEY; CRON_SECRET (when set) gates the endpoint.
"""
from __future__ import annotations

import json
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler

import requests

SUPABASE_URL = (
    os.environ.get("SUPABASE_URL")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    or "https://ryiitcblrrqvjvxkobpf.supabase.co"
)
READ_KEY = (
    os.environ.get("SUPABASE_ANON_KEY")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    or "sb_publishable_QAigcpa5fpKsYihAaHr-4Q_eW_EwBUk"
)
WRITE_KEY = os.environ.get("SUPABASE_SECRET_KEY")

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
TIMEOUT_S = 50

# SH winter regions (subregion-geojson region_ids) → display labels.
SH_REGIONS = {
    "nz_south_island": "NZ South Island",
    "nz_north_island": "NZ North Island (Ruapehu)",
    "au_southeast_alps": "Australian Alps",
    "cl_central_andes": "Chilean Central Andes",
    "cl_southern_andes": "Chilean Southern Andes",
    "ar_mendoza": "Mendoza Andes",
    "ar_northern_patagonia": "Northern Patagonia",
    "ar_southern_patagonia": "Southern Patagonia",
}
SEASON_MONTHS = (6, 7, 8)             # JJA
ACTIVE_MONTHS = range(5, 10)          # worker runs May–September
HIST_START_YEAR = 1991
HIST_END_YEAR = 2025
POINTS_PER_REGION = 3
SNOW_TMEAN_C = 1.0                    # same phase rule as the depth budget
TENDENCY_ABOVE = 1.3                  # last-14d vs its climatological median
TENDENCY_BELOW = 0.7


def _get_json(url: str, params: dict) -> dict:
    """GET with backoff — the archive API throttles bursts of 35-year requests,
    so a fleet run must absorb 429s instead of dying on them."""
    import time
    for attempt in range(4):
        response = requests.get(url, params=params, timeout=TIMEOUT_S)
        if response.status_code in (429, 500, 502, 503, 504):
            time.sleep(3.0 * (2 ** attempt))
            continue
        response.raise_for_status()
        return response.json()
    response.raise_for_status()
    return {}


def _region_resorts() -> dict[str, list[dict]]:
    """Curated resorts per SH region, up to POINTS_PER_REGION spread by latitude."""
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/snow_outlook_resorts",
        params={
            "select": "resort_id,region_id,lat,lon,base_elevation_m,top_elevation_m",
            "region_id": f"in.({','.join(SH_REGIONS)})",
            "base_elevation_m": "not.is.null",
        },
        headers={"apikey": READ_KEY, "Authorization": f"Bearer {READ_KEY}"},
        timeout=30,
    )
    response.raise_for_status()
    by_region: dict[str, list[dict]] = {}
    for row in response.json():
        by_region.setdefault(row["region_id"], []).append(row)
    out: dict[str, dict] = {}
    for region, rows in by_region.items():
        rows.sort(key=lambda r: float(r["lat"]))
        sampled = rows if len(rows) <= POINTS_PER_REGION else \
            [rows[0], rows[len(rows) // 2], rows[-1]]   # first/middle/last = spread
        out[region] = {"sampled": sampled, "all_ids": [r["resort_id"] for r in rows]}
    return out


def _daily_snow_cm(precip: list, tmean: list) -> list[float]:
    return [
        float(p or 0.0) if (t is not None and float(t) <= SNOW_TMEAN_C) else 0.0
        for p, t in zip(precip, tmean)
    ]


def _point_series(resort: dict) -> dict | None:
    """Historical (1991–2025) and current-season daily snowfall at the resort's
    mid elevation, keyed by ISO date."""
    mid = round((float(resort["base_elevation_m"]) + float(resort["top_elevation_m"])) / 2)
    base_params = {
        "latitude": f"{float(resort['lat']):.5f}",
        "longitude": f"{float(resort['lon']):.5f}",
        "daily": "precipitation_sum,temperature_2m_mean",
        "elevation": str(mid),
        "timezone": "auto",
    }
    try:
        hist = _get_json(ARCHIVE_URL, dict(base_params,
                                           start_date=f"{HIST_START_YEAR}-05-01",
                                           end_date=f"{HIST_END_YEAR}-09-30"))
        cur = _get_json(FORECAST_URL, dict(base_params, past_days=92, forecast_days=1,
                                           models="ecmwf_ifs025"))
    except Exception:
        return None
    out = {}
    for tag, payload in (("hist", hist), ("cur", cur)):
        daily = payload.get("daily") or {}
        dates = daily.get("time") or []
        snow = _daily_snow_cm(daily.get("precipitation_sum") or [],
                              daily.get("temperature_2m_mean") or [])
        out[tag] = dict(zip(dates, snow))
    return out


def _window_sum(series: dict[str, float], start: date, end: date) -> float:
    """Σ snowfall over [start, end) from an ISO-date-keyed daily series."""
    total, day = 0.0, start
    while day < end:
        total += series.get(day.isoformat(), 0.0)
        day += timedelta(days=1)
    return total


def _percentile(value: float, history: list[float]) -> int:
    if not history:
        return 50
    below = sum(1 for h in history if h < value)
    ties = sum(1 for h in history if h == value)
    return round((below + 0.5 * ties) / len(history) * 100)


def _trend(full_season_totals: list[tuple[int, float]]) -> dict:
    """OLS trend of full-JJA totals as % of mean per decade, SIGNIFICANCE-GATED
    at ~2 SE (p<0.05): a short high-variance snowfall series (and ERA5 precip's
    inhomogeneities) make an ungated slope noise-dominated, so a direction is
    only claimed when the slope clears zero at the standard climate bar. Matches
    the annual-history worker's gate."""
    n = len(full_season_totals)
    if n < 10:
        return {"direction": "stable", "pct_per_decade": 0.0}
    xs = [float(y) for y, _ in full_season_totals]
    ys = [float(v) for _, v in full_season_totals]
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx <= 0 or my <= 1e-9:
        return {"direction": "stable", "pct_per_decade": 0.0}
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    intercept = my - slope * mx
    sse = sum((y - (intercept + slope * x)) ** 2 for x, y in zip(xs, ys))
    se_slope = (sse / (n - 2) / sxx) ** 0.5 if n > 2 else float("inf")
    pct = slope * 10.0 / my * 100.0
    significant = se_slope > 0 and abs(slope) > 2.0 * se_slope
    direction = ("increasing" if pct > 0 else "decreasing") if (significant and abs(pct) >= 3) else "stable"
    return {"direction": direction, "pct_per_decade": round(pct, 1)}


def _snow_cover(resort_ids: list[str]) -> dict | None:
    """Satellite read counts for the region's resorts (snow_snowlines)."""
    if not resort_ids:
        return None
    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/snow_snowlines",
            params={"select": "resort_id,status",
                    "resort_id": f"in.({','.join(resort_ids)})"},
            headers={"apikey": READ_KEY, "Authorization": f"Bearer {READ_KEY}"},
            timeout=15,
        )
        response.raise_for_status()
        rows = response.json()
    except Exception:
        return None
    if not rows:
        return None
    counts = {"covered": 0, "partial": 0, "bare": 0}
    for row in rows:
        status = row.get("status")
        if status == "all_snow":
            counts["covered"] += 1
        elif status == "snowline":
            counts["partial"] += 1
        elif status == "all_bare":
            counts["bare"] += 1
    return counts


def _current_enso() -> dict:
    """Reuse the shared ENSO state from any existing validated row."""
    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/seasonal_snow_outlooks",
            params={"select": "enso_state", "limit": 1},
            headers={"apikey": READ_KEY, "Authorization": f"Bearer {READ_KEY}"},
            timeout=15,
        )
        response.raise_for_status()
        rows = response.json()
        if rows and rows[0].get("enso_state"):
            return rows[0]["enso_state"]
    except Exception:
        pass
    return {"nino34": 0.0, "state": "neutral", "strength": "none", "latest_season": None}


def build_rows() -> tuple[list[dict], dict]:
    """Build + UPSERT one region at a time: a cron run that hits the archive
    API's rate limit (or Vercel's time budget) still lands the regions it
    finished — the daily cadence fills the rest."""
    today = datetime.now(tz=timezone.utc).date()
    season_year = today.year
    season_start = date(season_year, 6, 1)
    window_end = today                                  # [Jun 1, today)
    if window_end <= season_start:                      # May: season not started
        window_end = season_start + timedelta(days=1)   # serve a near-zero baseline
    errors: dict[str, str] = {}

    regions = _region_resorts()
    enso = _current_enso()
    rows: list[dict] = []
    for region, label in SH_REGIONS.items():
        entry = regions.get(region)
        if not entry:
            errors[region] = "no curated resorts"
            continue
        resorts = entry["sampled"]
        with ThreadPoolExecutor(max_workers=len(resorts)) as pool:
            series = [s for s in pool.map(_point_series, resorts) if s]
        if not series:
            errors[region] = "no reanalysis data"
            continue

        window_days = (window_end - season_start).days
        std_now, last14_now = [], []
        hist_std: dict[int, list[float]] = {}
        hist_last14: dict[int, list[float]] = {}
        hist_full: dict[int, list[float]] = {}
        for s in series:
            std_now.append(_window_sum(s["cur"], season_start, window_end))
            last14_now.append(_window_sum(s["cur"], window_end - timedelta(days=14), window_end))
            for year in range(HIST_START_YEAR, HIST_END_YEAR + 1):
                y_start = date(year, 6, 1)
                hist_std.setdefault(year, []).append(
                    _window_sum(s["hist"], y_start, y_start + timedelta(days=window_days)))
                y_end = y_start + timedelta(days=window_days)
                hist_last14.setdefault(year, []).append(
                    _window_sum(s["hist"], y_end - timedelta(days=14), y_end))
                hist_full.setdefault(year, []).append(
                    _window_sum(s["hist"], y_start, date(year, 9, 1)))

        def region_mean(values: list[float]) -> float:
            return sum(values) / len(values)

        std_2026 = region_mean(std_now)
        last14_2026 = region_mean(last14_now)
        hist_std_means = sorted(region_mean(v) for v in hist_std.values())
        hist_last14_means = sorted(region_mean(v) for v in hist_last14.values())
        median_std = hist_std_means[len(hist_std_means) // 2]
        median_last14 = hist_last14_means[len(hist_last14_means) // 2]
        ratio = last14_2026 / median_last14 if median_last14 >= 3 else None
        tendency = ("above" if ratio and ratio > TENDENCY_ABOVE
                    else "below" if ratio and ratio < TENDENCY_BELOW
                    else "near")

        status = {
            "season": f"{season_year}-JJA",
            "asof": today.isoformat(),
            "season_to_date_cm": round(std_2026),
            "climatology_median_cm": round(median_std),
            "percentile": _percentile(std_2026, hist_std_means),
            "last14d_cm": round(last14_2026),
            "last14d_median_cm": round(median_last14),
            "tendency": tendency,
            "points": len(series),
        }
        cover = _snow_cover(entry["all_ids"])
        if cover:
            status["snow_cover"] = cover

        now = datetime.now(tz=timezone.utc).isoformat()
        row = {
            "climate_region": region,
            "label": label,
            "region_ids": [region],
            "resort_ids": entry["all_ids"],
            "target_season": f"{season_year}-JJA",
            "enso_state": enso,
            "model_version": "in_season_status_v1",
            "generated_at": now,
            "updated_at": now,
            "payload": {
                "region": region,
                "label": label,
                "mode": "in_season_status",
                "trend": _trend([(y, region_mean(v)) for y, v in sorted(hist_full.items())]),
                "signal": None,
                "watch": [],
                "status": status,
            },
        }
        try:
            upsert([row])                     # land each region as it completes
            rows.append(row)
        except Exception as exc:  # noqa: BLE001
            errors[region] = f"upsert: {exc}"
    return rows, errors


def upsert(rows: list[dict]) -> int:
    if not rows or not WRITE_KEY:
        return 0
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/seasonal_snow_outlooks",
        params={"on_conflict": "climate_region"},
        headers={"apikey": WRITE_KEY, "Authorization": f"Bearer {WRITE_KEY}",
                 "Content-Type": "application/json",
                 "Prefer": "resolution=merge-duplicates,return=minimal"},
        data=json.dumps(rows), timeout=30,
    )
    response.raise_for_status()
    return len(rows)


class handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 (Vercel/BaseHTTPRequestHandler contract)
        cron_secret = os.environ.get("CRON_SECRET")
        if cron_secret and self.headers.get("Authorization") != f"Bearer {cron_secret}":
            self._send(401, {"error": "unauthorized"})
            return
        if datetime.now(tz=timezone.utc).month not in ACTIVE_MONTHS:
            self._send(200, {"note": "outside SH season window (May-Sep) — no-op"})
            return
        try:
            rows, errors = build_rows()       # upserts per region as it goes
            self._send(200, {"regions": len(rows), "written": len(rows),
                             "errors": errors, "write_key_present": bool(WRITE_KEY)})
        except Exception as exc:  # noqa: BLE001
            self._send(500, {"error": f"{type(exc).__name__}: {exc}"})

    def _send(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
