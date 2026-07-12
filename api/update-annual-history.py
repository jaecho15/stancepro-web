"""Per-region annual snowfall history for the seasonal-outlook cards.

GET /api/update-annual-history

Two jobs, both idempotent:

  1. SEED (rare/expensive): for every served climate_region missing or stale
     (> 80 days) in `snow_annual_history`, compute the recent ~35-year record of
     season-total snowfall from ERA5 reanalysis (Open-Meteo archive: daily precip
     + band-downscaled mean temp at the region's curated resorts, snow when the
     day is cold at SLR 10:1 — the SAME budget the depth/SH-status layers use),
     plus a baseline (median + p10/p90). NH seasons are DJF (labelled by the end
     year), SH seasons are JJA. Only a handful of regions are (re)built per run
     so a 60 s cron never blows its budget; the daily cadence finishes the rest.

  2. MERGE (daily/cheap): read every `seasonal_snow_outlooks` row and patch
     payload.history / payload.history_baseline / payload.history_current onto
     it (non-destructively — the rest of the payload is preserved), so the
     seasonal cards can draw a year-by-year curve. history_current is the
     in-progress season's to-date total (free from the SH status block; computed
     for NH only during its Dec–Mar season). Re-runs after the monthly NH refresh
     re-attach the history, so a full-row upsert elsewhere self-heals next day.

MODELED, NOT MEASURED: no open measured snowfall record exists for most regions
(NZ, Andes), so this is a reanalysis estimate — renderers label it "modeled ·
ERA5 reanalysis". Relative comparison (this year vs the record) is robust; the
absolute cm is not a measurement.

Requires SUPABASE_SECRET_KEY; CRON_SECRET (when set) gates the endpoint.
"""
from __future__ import annotations

import json
import os
import statistics
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
TIMEOUT_S = 55

WINDOW_YEARS = 35
POINTS_PER_REGION = 3
SNOW_TMEAN_C = 1.0            # precip counts as snow at/below this daily mean
SLR = 10.0                   # 1 mm water -> 1 cm snow
STALE_DAYS = 80              # rebuild history older than this
MAX_SEED_PER_RUN = 2         # cap rebuilds/run so a 60s cron never times out
                             # (36-yr archive pulls are slow; the daily cadence
                             #  self-heals the rest)
HEADERS_READ = {"apikey": READ_KEY, "Authorization": f"Bearer {READ_KEY}"}

# European regions defined in the subregion geography but absent from the
# seasonal serving list — they have no VALIDATED seasonal forecast signal
# (NAO/AO aren't seasonally predictable; the 43-yr battle found the Alps
# unpredictable), so they get honest TREND-ONLY cards (signal=null, like
# Hokkaido) built from the same ERA5 history this worker computes. No ENSO
# signal is fabricated for them.
EXTRA_TREND_REGIONS = {
    "at_northern_alps": "Austrian Alps",
    "ch_northern_alps": "Swiss Alps",
    "fr_western_alps": "French Alps",
    "it_dolomites": "Dolomites",
    "it_southern_alps": "Italian Alps",
    "ad_pyrenees": "Andorra (Pyrenees)",
    "es_pyrenees": "Spanish Pyrenees",
    "es_sierra_nevada": "Sierra Nevada (Spain)",
    "fi_finnish_lapland": "Finnish Lapland",
    "no_northern_norway": "Northern Norway",
    "no_southern_norway": "Southern Norway",
    "se_scandinavian_mountains": "Swedish Mountains",
}
TREND_ONLY_MODEL_VERSION = "trend_only_v1"
TREND_ONLY_TARGET_SEASON = "2026-DJF"   # matches the NH validated rows' label


def _get_json(url: str, params: dict) -> dict:
    # Short, fail-fast backoff: when the archive's window is exhausted a region
    # gives up in ~7 s (not 45 s) so a bounded run never hangs; the region just
    # retries on the next run/cron.
    import time
    for attempt in range(3):
        response = requests.get(url, params=params, timeout=TIMEOUT_S)
        if response.status_code in (429, 500, 502, 503, 504):
            if attempt == 2:
                response.raise_for_status()
            time.sleep(2.0 + 3.0 * attempt)
            continue
        response.raise_for_status()
        return response.json()
    return {}


def _daily_snow_cm(precip: list, tmean: list) -> list[float]:
    return [
        float(p or 0.0) if (t is not None and float(t) <= SNOW_TMEAN_C) else 0.0
        for p, t in zip(precip, tmean)
    ]


# --- Serving state ------------------------------------------------------------

def _seasonal_rows() -> list[dict]:
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/seasonal_snow_outlooks",
        params={"select": "climate_region,label,region_ids,resort_ids,payload,"
                          "enso_state,target_season,model_version,generated_at"},
        headers=HEADERS_READ, timeout=30)
    response.raise_for_status()
    return response.json()


def _resorts_by_region(region_ids: list[str]) -> dict[str, list[dict]]:
    """Curated resorts (with elevation) grouped by region_id — for regions that
    have no seasonal row yet (Europe), so we can sample them like the rest."""
    if not region_ids:
        return {}
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/snow_outlook_resorts",
        params={"select": "resort_id,region_id,lat,lon,base_elevation_m,top_elevation_m",
                "region_id": f"in.({','.join(region_ids)})",
                "base_elevation_m": "not.is.null"},
        headers=HEADERS_READ, timeout=30)
    response.raise_for_status()
    out: dict[str, list[dict]] = {}
    for row in response.json():
        out.setdefault(row["region_id"], []).append(row)
    return out


def _shared_enso(rows: list[dict]) -> dict:
    """The network-wide ENSO state carried on the existing rows (context only —
    trend-only cards don't use it, but the column is NOT NULL)."""
    for row in rows:
        if row.get("enso_state"):
            return row["enso_state"]
    return {"nino34": 0.0, "state": "neutral", "strength": "none", "latest_season": None}


def _trend(points: list[tuple[int, float]]) -> dict:
    """OLS trend of season totals as % of mean per decade, SIGNIFICANCE-GATED:
    a direction is only claimed when the slope stands ~1.7 standard errors clear
    of zero (~p<0.10) AND exceeds 3%/decade. Season-total snowfall is a short,
    high-variance series (and ERA5 precip trends are inhomogeneity-prone), so an
    ungated OLS slope is noise-dominated — reporting it as "increasing" would be
    a false claim. pct_per_decade is still returned for transparency."""
    n = len(points)
    if n < 10:
        return {"direction": "stable", "pct_per_decade": 0.0}
    xs = [float(y) for y, _ in points]
    ys = [float(v) for _, v in points]
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx <= 0 or my <= 1e-9:
        return {"direction": "stable", "pct_per_decade": 0.0}
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    intercept = my - slope * mx
    sse = sum((y - (intercept + slope * x)) ** 2 for x, y in zip(xs, ys))
    se_slope = (sse / (n - 2) / sxx) ** 0.5 if n > 2 else float("inf")
    pct = slope * 10.0 / my * 100.0
    # ~2 SE ≈ p<0.05, the standard climate-trend bar (kept conservative because
    # ERA5 winter-precip trends are inhomogeneity-prone — a lenient gate would
    # surface artefacts as "increasing").
    significant = se_slope > 0 and abs(slope) > 2.0 * se_slope
    direction = ("increasing" if pct > 0 else "decreasing") if (significant and abs(pct) >= 3) else "stable"
    return {"direction": direction, "pct_per_decade": round(pct, 1)}


def _resorts_by_id(resort_ids: list[str]) -> dict[str, dict]:
    if not resort_ids:
        return {}
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/snow_outlook_resorts",
        params={"select": "resort_id,lat,lon,base_elevation_m,top_elevation_m",
                "resort_id": f"in.({','.join(resort_ids)})",
                "base_elevation_m": "not.is.null"},
        headers=HEADERS_READ, timeout=30)
    response.raise_for_status()
    return {r["resort_id"]: r for r in response.json()}


def _existing_history() -> dict[str, dict]:
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/snow_annual_history",
        params={"select": "region_id,hemisphere,history,baseline,updated_at"},
        headers=HEADERS_READ, timeout=30)
    response.raise_for_status()
    return {r["region_id"]: r for r in response.json()}


def _sample_resorts(resort_ids: list[str], by_id: dict[str, dict]) -> list[dict]:
    rows = [by_id[rid] for rid in resort_ids if rid in by_id]
    rows.sort(key=lambda r: float(r["lat"]))
    if len(rows) <= POINTS_PER_REGION:
        return rows
    return [rows[0], rows[len(rows) // 2], rows[-1]]     # first / middle / last


# --- History builder ----------------------------------------------------------

def _season_windows(hemisphere: str, year: int) -> tuple[date, date]:
    """[start, end) of season labelled `year`. SH = JJA(year); NH = DJF ending in
    `year` (Dec year-1 .. Mar 1 year)."""
    if hemisphere == "sh":
        return date(year, 6, 1), date(year, 9, 1)
    return date(year - 1, 12, 1), date(year, 3, 1)


def _annual_totals(resort: dict, hemisphere: str,
                   window_start: int, window_end: int) -> dict[int, float]:
    """Season-total snowfall per year at the resort's mid elevation, ERA5 budget."""
    import time
    mid = round((float(resort["base_elevation_m"]) + float(resort["top_elevation_m"])) / 2)
    # The archive lags ~5 days and rejects future end dates — clamp so the NH
    # window (end year's DJF finishes in Feb, well before now) still fetches.
    fetch_end = min(date(window_end, 12, 31),
                    datetime.now(tz=timezone.utc).date() - timedelta(days=6))
    payload = _get_json(ARCHIVE_URL, {
        "latitude": f"{float(resort['lat']):.5f}",
        "longitude": f"{float(resort['lon']):.5f}",
        "daily": "precipitation_sum,temperature_2m_mean",
        "elevation": str(mid),
        "timezone": "auto",
        "start_date": f"{window_start - 1}-01-01",
        "end_date": fetch_end.isoformat(),
    })
    time.sleep(0.6)                          # pace: the archive throttles bursts
    daily = payload.get("daily") or {}
    dates = daily.get("time") or []
    snow = _daily_snow_cm(daily.get("precipitation_sum") or [],
                         daily.get("temperature_2m_mean") or [])
    by_date = dict(zip(dates, snow))
    totals: dict[int, float] = {}
    for year in range(window_start, window_end + 1):
        start, end = _season_windows(hemisphere, year)
        total, day = 0.0, start
        while day < end:
            total += by_date.get(day.isoformat(), 0.0)
            day += timedelta(days=1)
        totals[year] = total
    return totals


def build_region_history(region: str, label: str, hemisphere: str,
                         resorts: list[dict], window_start: int, window_end: int) -> dict:
    # Serial (not concurrent) — 36-year archive pulls are heavy and the free
    # tier throttles bursts; per-region seeding is already bounded per run.
    per_resort = [_annual_totals(r, hemisphere, window_start, window_end) for r in resorts]
    history = []
    for year in range(window_start, window_end + 1):
        vals = [t[year] for t in per_resort if year in t]
        if vals:
            history.append({"year": year, "snow_cm": round(sum(vals) / len(vals))})
    values = [h["snow_cm"] for h in history]
    baseline = {
        "median_cm": round(statistics.median(values)) if values else None,
        "p10_cm": round(_quantile(values, 0.10)) if values else None,
        "p90_cm": round(_quantile(values, 0.90)) if values else None,
    }
    return {
        "region_id": region,
        "label": label,
        "hemisphere": hemisphere,
        "season_window": "JJA" if hemisphere == "sh" else "DJF",
        "window_start": window_start,
        "window_end": window_end,
        "history": history,
        "baseline": baseline,
        "points": len(resorts),
        "updated_at": datetime.now(tz=timezone.utc).isoformat(),
    }


def _quantile(sorted_input: list[float], q: float) -> float:
    s = sorted(sorted_input)
    if not s:
        return 0.0
    idx = q * (len(s) - 1)
    lo = int(idx)
    frac = idx - lo
    return s[lo] if lo + 1 >= len(s) else s[lo] + (s[lo + 1] - s[lo]) * frac


def _windows_for(hemisphere: str, today: date) -> tuple[int, int]:
    """Last completed season year + 35-year start. SH JJA completes end Aug; NH
    DJF completes end Feb."""
    if hemisphere == "sh":
        end = today.year if today.month >= 9 else today.year - 1
    else:
        end = today.year if today.month >= 3 else today.year - 1
    return end - (WINDOW_YEARS - 1), end


# --- current-season point -----------------------------------------------------

def _current_point(row: dict, hemisphere: str, resorts: list[dict], today: date) -> dict | None:
    """In-progress season's to-date total. Free from the SH status block; computed
    for NH only during Dec–Mar. None off-season."""
    status = (row.get("payload") or {}).get("status") or {}
    if isinstance(status.get("season_to_date_cm"), (int, float)):
        year = today.year if today.month >= 6 else today.year   # SH JJA = this year
        return {"year": year, "snow_cm": round(status["season_to_date_cm"]), "partial": True}
    if hemisphere == "nh" and today.month in (12, 1, 2, 3):
        season_year = today.year if today.month <= 3 else today.year + 1
        start = date(season_year - 1, 12, 1)
        totals = []
        for resort in resorts:
            mid = round((float(resort["base_elevation_m"]) + float(resort["top_elevation_m"])) / 2)
            payload = _get_json(FORECAST_URL, {
                "latitude": f"{float(resort['lat']):.5f}", "longitude": f"{float(resort['lon']):.5f}",
                "daily": "precipitation_sum,temperature_2m_mean", "elevation": str(mid),
                "timezone": "auto", "past_days": min((today - start).days, 92), "forecast_days": 1,
                "models": "ecmwf_ifs025"})
            daily = payload.get("daily") or {}
            totals.append(sum(_daily_snow_cm(daily.get("precipitation_sum") or [],
                                             daily.get("temperature_2m_mean") or [])))
        if totals:
            return {"year": season_year, "snow_cm": round(sum(totals) / len(totals)), "partial": True}
    return None


# --- upserts ------------------------------------------------------------------

def _upsert(table: str, rows: list[dict], conflict: str) -> None:
    if not rows:
        return
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        params={"on_conflict": conflict},
        headers={"apikey": WRITE_KEY, "Authorization": f"Bearer {WRITE_KEY}",
                 "Content-Type": "application/json",
                 "Prefer": "resolution=merge-duplicates,return=minimal"},
        data=json.dumps(rows), timeout=30)
    response.raise_for_status()


def run(seed_limit: int = MAX_SEED_PER_RUN) -> dict:
    if not WRITE_KEY:
        return {"error": "SUPABASE_SECRET_KEY not set"}
    today = datetime.now(tz=timezone.utc).date()
    rows = _seasonal_rows()
    served = {r["climate_region"] for r in rows}
    all_ids = sorted({rid for r in rows for rid in (r.get("resort_ids") or [])})
    resorts_by_id = _resorts_by_id(all_ids)
    existing = _existing_history()
    enso = _shared_enso(rows)

    # Unified targets: existing seasonal regions (patch history) + Europe extras
    # not yet served (create a trend-only row + history).
    europe_ids = [rid for rid in EXTRA_TREND_REGIONS if rid not in served]
    europe_resorts = _resorts_by_region(europe_ids) if europe_ids else {}
    targets: list[dict] = []
    for row in rows:
        targets.append({
            "region": row["climate_region"], "label": row.get("label") or row["climate_region"],
            "region_ids": row.get("region_ids") or [row["climate_region"]],
            "resort_ids": row.get("resort_ids") or [],
            "sampled": _sample_resorts(row.get("resort_ids") or [], resorts_by_id),
            "existing": row,
        })
    for rid in europe_ids:
        by_id = {r["resort_id"]: r for r in (europe_resorts.get(rid) or [])}
        targets.append({
            "region": rid, "label": EXTRA_TREND_REGIONS[rid],
            "region_ids": [rid], "resort_ids": sorted(by_id.keys()),
            "sampled": _sample_resorts(sorted(by_id.keys()), by_id),
            "existing": None,
        })

    # 1) SEED missing / stale regions (bounded).
    seeded, seed_errors = [], {}
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=STALE_DAYS)
    for target in targets:
        region = target["region"]
        if len(seeded) >= seed_limit:
            break
        prior = existing.get(region)
        if prior:
            try:
                if datetime.fromisoformat(str(prior["updated_at"]).replace("Z", "+00:00")) >= cutoff:
                    continue
            except (TypeError, ValueError):
                pass
        sampled = target["sampled"]
        if not sampled:
            seed_errors[region] = "no curated resorts with elevation"
            continue
        hemisphere = "sh" if float(sampled[0]["lat"]) < 0 else "nh"
        window_start, window_end = _windows_for(hemisphere, today)
        try:
            built = build_region_history(region, target["label"], hemisphere, sampled,
                                         window_start, window_end)
            _upsert("snow_annual_history", [built], "region_id")
            existing[region] = built
            seeded.append(region)
        except Exception as exc:  # noqa: BLE001
            seed_errors[region] = f"{type(exc).__name__}: {exc}"

    # 2) MERGE onto existing rows / CREATE trend-only rows for Europe.
    merged, created, merge_errors = 0, 0, {}
    now = datetime.now(tz=timezone.utc).isoformat()
    for target in targets:
        region = target["region"]
        hist = existing.get(region)
        if not hist:
            continue
        hemisphere = hist.get("hemisphere") or (
            "sh" if target["sampled"] and float(target["sampled"][0]["lat"]) < 0 else "nh")
        existing_row = target["existing"]
        if existing_row is not None:
            payload = dict(existing_row.get("payload") or {})
            payload["history"] = hist["history"]
            payload["history_baseline"] = hist["baseline"]
            # For OUR trend-only rows (Europe), keep the trend in sync with the
            # gated method + latest history. Never touch trend on rows whose trend
            # comes from another source (NH battle, SH status).
            if existing_row.get("model_version") == TREND_ONLY_MODEL_VERSION:
                payload["trend"] = _trend([(h["year"], h["snow_cm"]) for h in hist["history"]])
            try:
                current = _current_point(existing_row, hemisphere, target["sampled"], today)
            except Exception:  # noqa: BLE001 — best-effort
                current = None
            if current:
                payload["history_current"] = current
            else:
                payload.pop("history_current", None)
            out = {
                "climate_region": region, "label": existing_row["label"],
                "region_ids": existing_row["region_ids"], "resort_ids": existing_row["resort_ids"],
                "payload": payload, "enso_state": existing_row["enso_state"],
                "target_season": existing_row["target_season"],
                "model_version": existing_row.get("model_version") or "seasonal",
                "generated_at": existing_row.get("generated_at") or now, "updated_at": now,
            }
            try:
                _upsert("seasonal_snow_outlooks", [out], "climate_region")
                merged += 1
            except Exception as exc:  # noqa: BLE001
                merge_errors[region] = f"{type(exc).__name__}: {exc}"
        else:
            # Europe: honest trend-only card — real ERA5 trend, no fabricated
            # signal, no in-season status (off-season). History rides along.
            trend = _trend([(h["year"], h["snow_cm"]) for h in hist["history"]])
            payload = {
                "region": region, "label": target["label"],
                "trend": trend, "signal": None, "watch": [],
                "history": hist["history"], "history_baseline": hist["baseline"],
            }
            out = {
                "climate_region": region, "label": target["label"],
                "region_ids": target["region_ids"], "resort_ids": target["resort_ids"],
                "payload": payload, "enso_state": enso,
                "target_season": TREND_ONLY_TARGET_SEASON,
                "model_version": TREND_ONLY_MODEL_VERSION,
                "generated_at": now, "updated_at": now,
            }
            try:
                _upsert("seasonal_snow_outlooks", [out], "climate_region")
                created += 1
            except Exception as exc:  # noqa: BLE001
                merge_errors[region] = f"{type(exc).__name__}: {exc}"

    return {"seeded": seeded, "seed_errors": seed_errors,
            "merged": merged, "created_trend_only": created, "merge_errors": merge_errors,
            "regions_total": len(targets), "history_ready": len(existing)}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 (Vercel/BaseHTTPRequestHandler contract)
        cron_secret = os.environ.get("CRON_SECRET")
        if cron_secret and self.headers.get("Authorization") != f"Bearer {cron_secret}":
            self._send(401, {"error": "unauthorized"})
            return
        try:
            self._send(200, run())
        except Exception as exc:  # noqa: BLE001
            self._send(500, {"error": f"{type(exc).__name__}: {exc}"})

    def _send(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
