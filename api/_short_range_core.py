#!/usr/bin/env python3
"""Self-contained, **pandas-free** short-range snow compute core.

This is the exact base-config compute from fetch_short_range_snow.py, with the
only pandas dependency (`Series.quantile` / `Series.median`) replaced by a pure
`_quantile` that reproduces pandas' default LINEAR interpolation bit-for-bit.
Everything else (SLR ladder, per-model hour-by-hour accumulation, elevation
bands, freezing/rain-risk, tendency, summary) is copied verbatim.

Purpose: run inside a Vercel Python serverless function (stdlib + requests only,
no pandas → small cold-start bundle) as the on-demand compute endpoint. Parity
with the batch pipeline is proven by scripts/test_short_range_core.py (feeds the
same Open-Meteo payloads to both and asserts identical output).

Keep this in lockstep with fetch_short_range_snow.py's base path.
"""
from __future__ import annotations

import math
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any

import requests

DEFAULT_SUPABASE_URL = "https://ryiitcblrrqvjvxkobpf.supabase.co"
DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_QAigcpa5fpKsYihAaHr-4Q_eW_EwBUk"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
SEASONAL_URL = "https://seasonal-api.open-meteo.com/v1/seasonal"
REQUEST_TIMEOUT_S = 60
DEFAULT_MODELS = "ecmwf_ifs025,gfs_seamless,icon_seamless,gem_seamless"
QUANTILES = {"p10": 0.10, "p50": 0.50, "p90": 0.90}
SNOW_LEVEL_OFFSET_M = 200.0
TIME_BLOCKS = (
    ("dawn", "새벽", 0, 6),
    ("morning", "오전", 6, 12),
    ("afternoon", "오후", 12, 18),
    ("night", "밤", 18, 24),
)


# ---- pure-Python quantile (matches pandas Series.quantile default 'linear') ----

def _quantile(values: list[float], q: float) -> float:
    xs = sorted(float(v) for v in values)
    n = len(xs)
    if n == 0:
        return float("nan")
    if n == 1:
        return xs[0]
    pos = q * (n - 1)
    lo = int(math.floor(pos))
    hi = min(lo + 1, n - 1)
    frac = pos - lo
    return xs[lo] + frac * (xs[hi] - xs[lo])


def _median(values: list[float]) -> float:
    return _quantile(values, 0.5)


def _quantiles(values: list[float]) -> tuple[float, float, float]:
    return (
        round(_quantile(values, QUANTILES["p10"]), 1),
        round(_quantile(values, QUANTILES["p50"]), 1),
        round(_quantile(values, QUANTILES["p90"]), 1),
    )


# ---- copied verbatim from fetch_short_range_snow.py (no pandas) ----

def elevation_bands(resort: dict[str, Any]) -> dict[str, float | None]:
    base = resort.get("base_elevation_m")
    top = resort.get("top_elevation_m")
    if not isinstance(base, (int, float)) or not isinstance(top, (int, float)) or top <= base:
        return {"mid": None}
    return {"base": float(base), "mid": round((float(base) + float(top)) / 2.0), "top": float(top)}


def slr_and_snow_fraction(t_mean_c: float) -> tuple[float, float]:
    if t_mean_c >= 1.0:
        return 0.0, 0.0
    if t_mean_c >= 0.0:
        return 7.0, 1.0 - t_mean_c
    if t_mean_c >= -2.0:
        return 7.0, 1.0
    if t_mean_c >= -7.0:
        return 10.0, 1.0
    if t_mean_c >= -12.0:
        return 14.0, 1.0
    return 17.0, 1.0


def _snow_level_margin(elevation: float | None, freezing: float | None) -> float | None:
    if elevation is None or freezing is None:
        return None
    return round(float(elevation) - (freezing - SNOW_LEVEL_OFFSET_M), 0)


def _rain_risk(elevation: float | None, freezing: float | None) -> bool:
    margin = _snow_level_margin(elevation, freezing)
    return margin is not None and margin < 0


def _wind_aggregate(
    samples: list[tuple[float, float, float]],
) -> tuple[int | None, int | None, int | None]:
    """Aggregate (speed, direction, gust) wind samples to (speed_kmh,
    dir_deg, gust_kmh), all rounded ints; (None, None, None) if empty.

    Speed is the scalar mean; gust is the max; direction is the SPEED-WEIGHTED
    vector mean of the meteorological 'from' bearings (naive degree averaging
    is wrong across the 0/360 seam, e.g. 350° and 10° must average to 0°, not
    180°). Pure Python — matches fetch_short_range_snow.py exactly."""
    if not samples:
        return None, None, None
    speeds = [s for s, _, _ in samples]
    mean_speed = sum(speeds) / len(speeds)
    u = sum(s * math.sin(math.radians(d)) for s, d, _ in samples)
    v = sum(s * math.cos(math.radians(d)) for s, d, _ in samples)
    mean_dir = math.degrees(math.atan2(u, v)) % 360.0
    max_gust = max(g for _, _, g in samples)
    return round(mean_speed), round(mean_dir) % 360, round(max_gust)


def daily_model_names(daily: dict[str, Any]) -> list[str]:
    prefix = "precipitation_sum_"
    return sorted(k[len(prefix):] for k in daily if k.startswith(prefix))


def hourly_model_names(hourly: dict[str, Any]) -> list[str]:
    prefix = "precipitation_"
    return sorted(
        k[len(prefix):]
        for k in hourly
        if k.startswith(prefix) and not k.startswith("precipitation_probability")
    )


def freezing_level_by_date_block(payload: dict[str, Any]) -> tuple[dict[str, float], dict[tuple[str, int], float]]:
    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    by_date: dict[str, list[float]] = defaultdict(list)
    by_block: dict[tuple[str, int], list[float]] = defaultdict(list)
    for key, values in hourly.items():
        if not key.startswith("freezing_level_height"):
            continue
        for index, stamp in enumerate(times):
            value = values[index] if index < len(values) else None
            if value is None:
                continue
            date = stamp[:10]
            block = int(stamp[11:13]) // 6
            by_date[date].append(float(value))
            by_block[(date, block)].append(float(value))
    return (
        {date: sum(vals) / len(vals) for date, vals in by_date.items()},
        {key: sum(vals) / len(vals) for key, vals in by_block.items()},
    )


def hourly_band_day(
    hourly: dict[str, Any],
    band_elevation: float | None,
    date: str,
    freezing_block: dict[tuple[str, int], float],
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    times = hourly.get("time") or []
    models = hourly_model_names(hourly)
    n_blocks = len(TIME_BLOCKS)
    day_snow: dict[str, float] = defaultdict(float)
    day_precip: dict[str, float] = defaultdict(float)
    day_temps: dict[str, list[float]] = defaultdict(list)
    block_snow: list[dict[str, float]] = [defaultdict(float) for _ in range(n_blocks)]
    block_precip: list[dict[str, float]] = [defaultdict(float) for _ in range(n_blocks)]
    block_temps: list[dict[str, list[float]]] = [defaultdict(list) for _ in range(n_blocks)]
    day_wind: list[tuple[float, float, float]] = []
    block_wind: list[list[tuple[float, float, float]]] = [[] for _ in range(n_blocks)]

    for model in models:
        precip_series = hourly.get(f"precipitation_{model}") or []
        temp_series = hourly.get(f"temperature_2m_{model}") or []
        wspd_series = hourly.get(f"wind_speed_10m_{model}") or []
        wdir_series = hourly.get(f"wind_direction_10m_{model}") or []
        wgst_series = hourly.get(f"wind_gusts_10m_{model}") or []
        for index, stamp in enumerate(times):
            if stamp[:10] != date:
                continue
            precip = precip_series[index] if index < len(precip_series) else None
            temp = temp_series[index] if index < len(temp_series) else None
            if precip is None or temp is None:
                continue
            block_index = int(stamp[11:13]) // 6
            slr, snow_fraction = slr_and_snow_fraction(float(temp))
            snow_cm = float(precip) * snow_fraction * slr / 10.0
            day_snow[model] += snow_cm
            day_precip[model] += float(precip)
            day_temps[model].append(float(temp))
            block_snow[block_index][model] += snow_cm
            block_precip[block_index][model] += float(precip)
            block_temps[block_index][model].append(float(temp))
            wspd = wspd_series[index] if index < len(wspd_series) else None
            wdir = wdir_series[index] if index < len(wdir_series) else None
            if wspd is not None and wdir is not None:
                wgst = wgst_series[index] if index < len(wgst_series) else None
                sample = (float(wspd), float(wdir), float(wgst) if wgst is not None else float(wspd))
                day_wind.append(sample)
                block_wind[block_index].append(sample)

    if not day_snow:
        return [], None

    blocks: list[dict[str, Any]] = []
    for block_index, (block_key, block_ko, hour_lo, hour_hi) in enumerate(TIME_BLOCKS):
        present = sorted(block_snow[block_index])
        if not present:
            continue
        p10, p50, p90 = _quantiles([block_snow[block_index][m] for m in present])
        precip_p50 = round(_median([block_precip[block_index][m] for m in present]), 1)
        temp_means = [sum(block_temps[block_index][m]) / len(block_temps[block_index][m]) for m in present]
        temp_p50 = _median(temp_means)
        _, snow_fraction = slr_and_snow_fraction(temp_p50)
        freezing = freezing_block.get((date, block_index))
        wind_kmh, wind_dir_deg, wind_gust_kmh = _wind_aggregate(block_wind[block_index])
        blocks.append(
            {
                "block": block_key,
                "block_ko": block_ko,
                "hours": f"{hour_lo:02d}-{hour_hi:02d}",
                "n_models": len(present),
                "snow_cm_p10": p10,
                "snow_cm_p50": p50,
                "snow_cm_p90": p90,
                "precip_mm_p50": precip_p50,
                "temp_c_p50": round(temp_p50, 1),
                "precip_type": "snow" if snow_fraction >= 0.8 else ("mix" if snow_fraction > 0.0 else "rain"),
                "freezing_level_m": round(freezing) if freezing is not None else None,
                "snow_level_margin_m": _snow_level_margin(band_elevation, freezing),
                "rain_risk": _rain_risk(band_elevation, freezing),
                "wind_kmh": wind_kmh,
                "wind_dir_deg": wind_dir_deg,
                "wind_gust_kmh": wind_gust_kmh,
            }
        )

    present = sorted(day_snow)
    p10, p50, p90 = _quantiles([day_snow[m] for m in present])
    temp_means = [sum(day_temps[m]) / len(day_temps[m]) for m in present]
    day_wind_kmh, day_wind_dir_deg, day_wind_gust_kmh = _wind_aggregate(day_wind)
    day_agg = {
        "n_models": len(present),
        "snow_cm_p10": p10,
        "snow_cm_p50": p50,
        "snow_cm_p90": p90,
        "precip_mm_p50": round(_median([day_precip[m] for m in present]), 1),
        "tmean_c_p50": round(_median(temp_means), 1),
        "wind_kmh": day_wind_kmh,
        "wind_dir_deg": day_wind_dir_deg,
        "wind_gust_kmh": day_wind_gust_kmh,
    }
    return blocks, day_agg


def band_daily_rows(
    payload: dict[str, Any],
    band: str,
    elevation_m: float | None,
    freezing_by_date: dict[str, float],
    freezing_by_block: dict[tuple[str, int], float],
    time_of_day_days: int,
) -> list[dict[str, Any]]:
    daily = payload.get("daily") or {}
    times = daily.get("time") or []
    hourly = payload.get("hourly") or {}
    models = daily_model_names(daily)
    used_elevation = payload.get("elevation")
    band_elevation = elevation_m if elevation_m is not None else used_elevation
    rows: list[dict[str, Any]] = []
    for index, date in enumerate(times):
        native_values = [
            (daily.get(f"snowfall_sum_{model}") or [None] * len(times))[index]
            for model in models
        ]
        native_values = [float(v) for v in native_values if v is not None]
        snow_native = round(sum(native_values) / len(native_values), 1) if native_values else None
        freezing = freezing_by_date.get(date)

        blocks: list[dict[str, Any]] = []
        day_agg: dict[str, Any] | None = None
        if index < time_of_day_days:
            blocks, day_agg = hourly_band_day(hourly, band_elevation, date, freezing_by_block)

        if day_agg:
            snow_p10 = day_agg["snow_cm_p10"]
            snow_p50 = day_agg["snow_cm_p50"]
            snow_p90 = day_agg["snow_cm_p90"]
            precip_p50 = day_agg["precip_mm_p50"]
            temp_p50 = day_agg["tmean_c_p50"]
            n_models = day_agg["n_models"]
            wind_kmh = day_agg["wind_kmh"]
            wind_dir_deg = day_agg["wind_dir_deg"]
            wind_gust_kmh = day_agg["wind_gust_kmh"]
        else:
            per_model_snow: list[float] = []
            per_model_precip: list[float] = []
            per_model_tmean: list[float] = []
            for model in models:
                precip = (daily.get(f"precipitation_sum_{model}") or [None] * len(times))[index]
                tmax = (daily.get(f"temperature_2m_max_{model}") or [None] * len(times))[index]
                tmin = (daily.get(f"temperature_2m_min_{model}") or [None] * len(times))[index]
                if precip is None or tmax is None or tmin is None:
                    continue
                t_mean = (float(tmax) + float(tmin)) / 2.0
                slr, snow_fraction = slr_and_snow_fraction(t_mean)
                per_model_snow.append(float(precip) * snow_fraction * slr / 10.0)
                per_model_precip.append(float(precip))
                per_model_tmean.append(t_mean)
            if not per_model_snow:
                continue
            snow_p10 = round(_quantile(per_model_snow, QUANTILES["p10"]), 1)
            snow_p50 = round(_quantile(per_model_snow, QUANTILES["p50"]), 1)
            snow_p90 = round(_quantile(per_model_snow, QUANTILES["p90"]), 1)
            precip_p50 = round(_median(per_model_precip), 1)
            temp_p50 = round(_median(per_model_tmean), 1)
            n_models = len(per_model_snow)
            wind_samples: list[tuple[float, float, float]] = []
            for model in models:
                wspd = (daily.get(f"wind_speed_10m_max_{model}") or [None] * len(times))[index]
                wdir = (daily.get(f"wind_direction_10m_dominant_{model}") or [None] * len(times))[index]
                wgst = (daily.get(f"wind_gusts_10m_max_{model}") or [None] * len(times))[index]
                if wspd is not None and wdir is not None:
                    wind_samples.append(
                        (float(wspd), float(wdir), float(wgst) if wgst is not None else float(wspd))
                    )
            wind_kmh, wind_dir_deg, wind_gust_kmh = _wind_aggregate(wind_samples)

        rows.append(
            {
                "date": date,
                "day_index": index + 1,
                "band": band,
                "elevation_m": band_elevation,
                "layer": "D1-7" if index < 7 else "D8-16",
                "n_models": n_models,
                "snow_cm_p10": snow_p10,
                "snow_cm_p50": snow_p50,
                "snow_cm_p90": snow_p90,
                "snow_cm_model_native": snow_native,
                "precip_mm_p50": precip_p50,
                "tmean_c_p50": temp_p50,
                "freezing_level_m": round(freezing) if freezing is not None else None,
                "snow_level_margin_m": _snow_level_margin(band_elevation, freezing),
                "rain_risk": _rain_risk(band_elevation, freezing),
                "wind_kmh": wind_kmh,
                "wind_dir_deg": wind_dir_deg,
                "wind_gust_kmh": wind_gust_kmh,
                "time_of_day": blocks,
            }
        )
    return rows


def tendency_from_payload(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """The aggregation half of the seasonal tendency (no fetch), so the diff
    test can feed the same seasonal payload to core and reference."""
    daily = payload.get("daily") or {}
    times = daily.get("time") or []
    members = [""] + [f"_member{index:02d}" for index in range(1, 51)]
    weekly: list[dict[str, Any]] = []
    # Anchored at D17, right after the D1-16 daily horizon (no D15-16 overlap).
    for week_start in range(16, 44, 7):
        week_end = min(week_start + 7, len(times))
        if week_end - week_start < 7:
            break
        member_snow: list[float] = []
        member_tmean: list[float] = []
        for suffix in members:
            precip = daily.get(f"precipitation_sum{suffix}")
            tmax = daily.get(f"temperature_2m_max{suffix}")
            tmin = daily.get(f"temperature_2m_min{suffix}")
            if not precip or not tmax or not tmin:
                continue
            snow_total = 0.0
            temps: list[float] = []
            valid = True
            for index in range(week_start, week_end):
                if precip[index] is None or tmax[index] is None or tmin[index] is None:
                    valid = False
                    break
                t_mean = (float(tmax[index]) + float(tmin[index])) / 2.0
                slr, snow_fraction = slr_and_snow_fraction(t_mean)
                snow_total += float(precip[index]) * snow_fraction * slr / 10.0
                temps.append(t_mean)
            if valid and temps:
                member_snow.append(snow_total)
                member_tmean.append(sum(temps) / len(temps))
        if len(member_snow) < 10:
            continue
        p10 = _quantile(member_snow, 0.10)
        p50 = _quantile(member_snow, 0.50)
        p90 = _quantile(member_snow, 0.90)
        spread_ratio = (p90 - p10) / max(p50, 1.0)
        confidence = "high" if spread_ratio < 1.0 else ("medium" if spread_ratio < 2.5 else "low")
        weekly.append(
            {
                "week": f"D{week_start + 1}-D{week_end}",
                "date_start": times[week_start],
                "date_end": times[week_end - 1],
                "n_members": len(member_snow),
                "snow_cm_p10": round(p10, 1),
                "snow_cm_p50": round(p50, 1),
                "snow_cm_p90": round(p90, 1),
                "prob_snow_ge_10cm": round(sum(1 for s in member_snow if s >= 10.0) / len(member_snow), 2),
                "prob_snow_ge_30cm": round(sum(1 for s in member_snow if s >= 30.0) / len(member_snow), 2),
                "tmean_c_p50": round(_median(member_tmean), 1),
                "confidence": confidence,
                "vs_normal": None,
            }
        )
    return weekly


# ---- HTTP + orchestration (on-demand: one resort) ----

def polite_get(url: str, params: dict[str, Any]) -> dict[str, Any]:
    """No success-sleep (on-demand serves one resort, not a batch). Short
    backoff on transient errors — this runs in a serverless request, so the
    worst case (0.5+1.0+2.0 = 3.5s) must stay well inside the function timeout."""
    for attempt in range(3):
        response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT_S)
        if response.status_code == 200:
            return response.json()
        if response.status_code in (429, 500, 502, 503, 504):
            import time
            time.sleep(0.5 * (2 ** attempt))
            continue
        response.raise_for_status()
    raise RuntimeError(f"Open-Meteo request kept failing: {url}")


def fetch_band_forecast(
    resort: dict[str, Any], elevation_m: float | None, models: str,
    forecast_days: int, include_freezing_level: bool,
) -> dict[str, Any]:
    params: dict[str, Any] = {
        "latitude": f"{float(resort['lat']):.5f}",
        "longitude": f"{float(resort['lon']):.5f}",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,"
        "wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant",
        "models": models,
        "forecast_days": forecast_days,
        "timezone": "auto",
    }
    if elevation_m is not None and math.isfinite(elevation_m):
        params["elevation"] = f"{elevation_m:.0f}"
    hourly_vars = "temperature_2m,precipitation,snowfall,wind_speed_10m,wind_direction_10m,wind_gusts_10m"
    if include_freezing_level:
        hourly_vars += ",freezing_level_height"
    params["hourly"] = hourly_vars
    # Current snowpack depth (metres) → the "current depth" layer served in the
    # same payload (FATMAP-style live depth). Single value across models.
    params["current"] = "snow_depth"
    return polite_get(FORECAST_URL, params)


def fetch_tendency(resort: dict[str, Any], elevation_m: float | None) -> list[dict[str, Any]]:
    params: dict[str, Any] = {
        "latitude": f"{float(resort['lat']):.5f}",
        "longitude": f"{float(resort['lon']):.5f}",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum",
        "models": "ecmwf_ec46",
        "forecast_days": 46,
        "timezone": "auto",
    }
    if elevation_m is not None and math.isfinite(elevation_m):
        params["elevation"] = f"{elevation_m:.0f}"
    return tendency_from_payload(polite_get(SEASONAL_URL, params))


def build_summary(payload: dict[str, Any]) -> dict[str, Any]:
    daily = payload.get("daily") or []
    bands: dict[str, dict[str, Any]] = {}
    best: dict[str, Any] | None = None
    for row in daily:
        if row.get("day_index", 99) > 7:
            continue
        band = row["band"]
        entry = bands.setdefault(band, {"elevation_m": row.get("elevation_m"), "snow_7d_p50": 0.0})
        entry["snow_7d_p50"] = round(entry["snow_7d_p50"] + float(row.get("snow_cm_p50") or 0.0), 1)
        if best is None or float(row.get("snow_cm_p50") or 0.0) > best["snow_cm_p50"]:
            best = {
                "date": row["date"], "day_index": row["day_index"], "band": band,
                "snow_cm_p50": float(row.get("snow_cm_p50") or 0.0),
                "snow_cm_p10": float(row.get("snow_cm_p10") or 0.0),
                "snow_cm_p90": float(row.get("snow_cm_p90") or 0.0),
            }
    return {"generated_utc": payload.get("generated_utc"), "models": payload.get("models"),
            "bands": bands, "best_day": best}


def fetch_resort(resort_id: str) -> dict[str, Any] | None:
    response = requests.get(
        f"{DEFAULT_SUPABASE_URL}/rest/v1/snow_outlook_resorts",
        params={"select": "resort_id,region_id,country_code,lat,lon,base_elevation_m,top_elevation_m",
                "resort_id": f"eq.{resort_id}", "limit": 1},
        headers={"apikey": DEFAULT_SUPABASE_PUBLISHABLE_KEY,
                 "Authorization": f"Bearer {DEFAULT_SUPABASE_PUBLISHABLE_KEY}"},
        timeout=30,
    )
    response.raise_for_status()
    rows = response.json()
    return rows[0] if rows else None


def _current_depth_cm(band_payload: dict[str, Any]) -> int | None:
    """Current snowpack depth (cm, rounded) from a band's Open-Meteo `current`
    block. Open-Meteo returns snow_depth in metres."""
    value = (band_payload.get("current") or {}).get("snow_depth")
    if isinstance(value, (int, float)) and math.isfinite(value):
        return round(float(value) * 100.0)
    return None


# --- Per-band depth estimate -------------------------------------------------
# Open-Meteo's `snow_depth` is a grid-cell state: it does NOT respond to the
# `elevation` downscaling parameter, so fetching it per band returns the same
# number three times. Temperature DOES downscale (past days included), so we
# build the elevation structure ourselves: a season-to-date snow budget per band
# (precip falls as snow when the band's daily mean is cold, minus degree-day
# melt) and use the budgets only as RATIOS to distribute the trusted grid
# snow_depth across bands. Absolute level stays anchored to the model analysis;
# only the vertical gradient comes from the budget. Crude by design (fixed SLR,
# fixed melt factor, no settling/wind) — ratios cancel most of that, and the
# payload already carries estimate=true.

HISTORY_PAST_DAYS = 92          # Open-Meteo max; covers a season half from mid-season
BUDGET_SNOW_TMEAN_C = 1.0       # daily mean at/below this → precip counted as snow
BUDGET_SLR = 10.0               # fresh-snow ratio: 1 mm water → 1 cm snow
BUDGET_MELT_CM_PER_DEGDAY = 1.5 # depth melt per positive degree-day
BUDGET_MIN_REF_CM = 3.0         # denominator floor: below this, ratios are noise
BUDGET_MAX_RATIO = 25.0         # sanity cap for valley-cell anchors

# Measured anchor: when a public snow station (snow_stations table — SNOTEL /
# SLF IMIS / JMA AMeDAS, cron-synced daily) sits close enough to the resort,
# its measured depth replaces the model grid value as the anchor. The band
# ratios still come from the season budget — only the absolute level changes.
# Multi-band resorts only: single-band resorts carry no elevations, so a
# station can't be matched vertically and the grid value stays.
STATION_MAX_DISTANCE_KM = 15.0
STATION_MAX_AGE_H = 48.0
STATION_ELEV_MARGIN_M = 250.0   # station must sit within [base-250, top+250]

# Satellite snowline gating: the snow_snowlines table (VIIRS 375 m NDSI,
# elevation-regressed by the daily update-snowlines cron) tells us where snow
# actually exists. Bands clearly below the observed snowline serve depth 0 —
# the budget model's biggest failure mode (imagining base snow that melted or
# fell as rain) gets corrected by observation. Applies to multi-band resorts
# only (single-band carries no elevation to compare).
SNOWLINE_MAX_AGE_DAYS = 5       # older reads are stale — don't gate
SNOWLINE_MARGIN_M = 100.0       # band must sit this far below the line to zero


def fetch_band_history(resort: dict[str, Any], elevation_m: float | None) -> dict[str, Any]:
    """Small daily-only fetch of the past HISTORY_PAST_DAYS: precip + the band's
    downscaled daily mean temperature. Single model — the budget feeds a depth
    estimate, not a quantile forecast. When elevation_m is None the grid's own
    (native) elevation is used — that run anchors the ratios."""
    params: dict[str, Any] = {
        "latitude": f"{float(resort['lat']):.5f}",
        "longitude": f"{float(resort['lon']):.5f}",
        "daily": "precipitation_sum,temperature_2m_mean",
        "models": "ecmwf_ifs025",
        "past_days": HISTORY_PAST_DAYS,
        "forecast_days": 1,
        "timezone": "auto",
    }
    if elevation_m is not None and math.isfinite(elevation_m):
        params["elevation"] = f"{elevation_m:.0f}"
    return polite_get(FORECAST_URL, params)


def _season_budget_cm(history_payload: dict[str, Any]) -> float:
    """Season-to-date snowpack budget (cm) from a band's daily history: run the
    days in order, add snow when the band is cold, melt by positive degree-days,
    floor at zero (bare ground can't go negative)."""
    daily = history_payload.get("daily") or {}
    precip = daily.get("precipitation_sum") or []
    tmean = daily.get("temperature_2m_mean") or []
    depth = 0.0
    for rain_mm, t_c in zip(precip, tmean):
        if t_c is None:
            continue
        snow_cm = float(rain_mm or 0.0) * BUDGET_SLR / 10.0 if t_c <= BUDGET_SNOW_TMEAN_C else 0.0
        melt_cm = BUDGET_MELT_CM_PER_DEGDAY * max(float(t_c), 0.0)
        depth = max(0.0, depth + snow_cm - melt_cm)
    return depth


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    rlat1, rlat2 = math.radians(lat1), math.radians(lat2)
    dlat = rlat2 - rlat1
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(a))


def fetch_nearby_station(resort: dict[str, Any],
                         bands: dict[str, float | None]) -> dict[str, Any] | None:
    """Nearest fresh measured-depth station usable as the depth anchor, or None.
    Best-effort: the measured anchor is an upgrade, never a dependency — any
    failure just keeps the model grid anchor."""
    elevations = [e for e in bands.values() if isinstance(e, (int, float))]
    if len(elevations) < 2:
        return None                       # single-band: no vertical match possible
    lat, lon = float(resort["lat"]), float(resort["lon"])
    dlat = 0.2                            # ~22 km; haversine below trims to 15
    dlon = 0.2 / max(math.cos(math.radians(lat)), 0.2)
    try:
        response = requests.get(
            f"{DEFAULT_SUPABASE_URL}/rest/v1/snow_stations",
            params=[
                ("select", "station_id,source,name,lat,lon,elevation_m,depth_cm,asof"),
                ("lat", f"gte.{lat - dlat}"), ("lat", f"lte.{lat + dlat}"),
                ("lon", f"gte.{lon - dlon}"), ("lon", f"lte.{lon + dlon}"),
                ("depth_cm", "not.is.null"),
            ],
            headers={"apikey": DEFAULT_SUPABASE_PUBLISHABLE_KEY,
                     "Authorization": f"Bearer {DEFAULT_SUPABASE_PUBLISHABLE_KEY}"},
            timeout=15,
        )
        response.raise_for_status()
        rows = response.json()
    except Exception:
        return None
    lo = min(elevations) - STATION_ELEV_MARGIN_M
    hi = max(elevations) + STATION_ELEV_MARGIN_M
    now = datetime.now(tz=timezone.utc)
    best: dict[str, Any] | None = None
    for row in rows:
        elev = row.get("elevation_m")
        if not isinstance(elev, (int, float)) or not lo <= elev <= hi:
            continue
        asof_raw = row.get("asof")
        try:
            asof = datetime.fromisoformat(str(asof_raw).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            continue
        if (now - asof).total_seconds() > STATION_MAX_AGE_H * 3600:
            continue
        distance = _haversine_km(lat, lon, float(row["lat"]), float(row["lon"]))
        if distance > STATION_MAX_DISTANCE_KM:
            continue
        if best is None or distance < best["distance_km"]:
            best = dict(row, distance_km=round(distance, 1))
    return best


def fetch_snowline(resort: dict[str, Any]) -> dict[str, Any] | None:
    """The resort's latest confident satellite snowline read, or None. Fresh
    (≤ SNOWLINE_MAX_AGE_DAYS) rows only. Best-effort — gating is an upgrade,
    never a dependency."""
    try:
        response = requests.get(
            f"{DEFAULT_SUPABASE_URL}/rest/v1/snow_snowlines",
            params={"resort_id": f"eq.{resort['resort_id']}",
                    "select": "status,snowline_m,sampled_max_m,obs_date", "limit": 1},
            headers={"apikey": DEFAULT_SUPABASE_PUBLISHABLE_KEY,
                     "Authorization": f"Bearer {DEFAULT_SUPABASE_PUBLISHABLE_KEY}"},
            timeout=15,
        )
        response.raise_for_status()
        rows = response.json()
    except Exception:
        return None
    if not rows:
        return None
    row = rows[0]
    try:
        obs = datetime.strptime(str(row.get("obs_date")), "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None
    if (datetime.now(tz=timezone.utc) - obs).days > SNOWLINE_MAX_AGE_DAYS:
        return None
    return row


def _apply_snowline_gate(banded: dict[str, int | None],
                         bands: dict[str, float | None],
                         snowline: dict[str, Any]) -> dict[str, int | None]:
    """Zero the depth of bands the satellite saw as bare. `all_bare` only zeros
    bands inside the elevation span the grid actually sampled — never
    extrapolates above it."""
    status = snowline.get("status")
    out = dict(banded)
    for band, depth_cm in banded.items():
        elevation = bands.get(band)
        if depth_cm is None or not isinstance(elevation, (int, float)):
            continue
        if status == "snowline" and isinstance(snowline.get("snowline_m"), (int, float)):
            if elevation < float(snowline["snowline_m"]) - SNOWLINE_MARGIN_M:
                out[band] = 0
        elif status == "all_bare" and isinstance(snowline.get("sampled_max_m"), (int, float)):
            if elevation <= float(snowline["sampled_max_m"]):
                out[band] = 0
    return out


def _budget_at_elevation(band_budgets: dict[str, float],
                         bands: dict[str, float | None],
                         elevation_m: float) -> float | None:
    """Season budget linearly interpolated to an arbitrary elevation (clamped to
    the band range) — evaluates the budget curve at a station's altitude."""
    points = sorted(
        (float(bands[band]), budget)
        for band, budget in band_budgets.items()
        if isinstance(bands.get(band), (int, float))
    )
    if not points:
        return None
    if elevation_m <= points[0][0]:
        return points[0][1]
    if elevation_m >= points[-1][0]:
        return points[-1][1]
    for (e0, b0), (e1, b1) in zip(points, points[1:]):
        if e0 <= elevation_m <= e1:
            t = (elevation_m - e0) / (e1 - e0) if e1 > e0 else 0.0
            return b0 + (b1 - b0) * t
    return points[-1][1]


def _banded_depth_cm(grid_depth_cm: int | None,
                     band_budgets: dict[str, float],
                     ref_budget: float) -> dict[str, int | None]:
    """Distribute the grid snow_depth across bands by budget ratio. Falls back to
    the uniform grid value when the reference budget is too small to divide by
    (ratios would be noise)."""
    out: dict[str, int | None] = {}
    for band, budget in band_budgets.items():
        if grid_depth_cm is None:
            out[band] = None
        elif ref_budget >= BUDGET_MIN_REF_CM:
            ratio = min(budget / ref_budget, BUDGET_MAX_RATIO)
            out[band] = round(grid_depth_cm * ratio)
        else:
            out[band] = grid_depth_cm
    return out


def compute_forecast(resort: dict[str, Any], models: str = DEFAULT_MODELS,
                     forecast_days: int = 16, with_tendency: bool = True) -> dict[str, Any]:
    """Full base-config forecast for one resort (on-demand).

    All Open-Meteo requests (each band + the seasonal tendency) run in parallel
    — requests releases the GIL during network I/O — so wall time is one
    round-trip, not the sum. The mid band carries freezing_level_height and is
    the freezing source for every band's rain-risk, so aggregation waits for all
    fetches, then runs (fast, CPU-only)."""
    bands = elevation_bands(resort)
    multi_band = len(bands) > 1
    with ThreadPoolExecutor(max_workers=2 * len(bands) + 2) as pool:
        band_futures = {
            band: pool.submit(fetch_band_forecast, resort, bands[band], models,
                              forecast_days, band == "mid")
            for band in bands
        }
        tendency_future = pool.submit(fetch_tendency, resort, bands.get("mid")) if with_tendency else None
        # Per-band depth needs the season-budget history per band + one run at
        # the grid's native elevation (no elevation param) as the anchor. Only
        # worth the calls when there is more than one band to differentiate.
        history_futures = (
            {band: pool.submit(fetch_band_history, resort, bands[band]) for band in bands}
            if multi_band else {}
        )
        ref_history_future = pool.submit(fetch_band_history, resort, None) if multi_band else None
        station_future = pool.submit(fetch_nearby_station, resort, bands) if multi_band else None
        snowline_future = pool.submit(fetch_snowline, resort) if multi_band else None
        band_payloads = {band: future.result() for band, future in band_futures.items()}
        tendency = tendency_future.result() if tendency_future else []
        band_budgets = {band: _season_budget_cm(future.result())
                        for band, future in history_futures.items()}
        ref_budget = _season_budget_cm(ref_history_future.result()) if ref_history_future else 0.0
        station = station_future.result() if station_future else None
        snowline = snowline_future.result() if snowline_future else None

    freezing_by_date, freezing_by_block = freezing_level_by_date_block(band_payloads["mid"])
    daily_rows: list[dict[str, Any]] = []
    for band in sorted(band_payloads, key=lambda name: name != "mid"):
        daily_rows.extend(band_daily_rows(band_payloads[band], band, bands[band],
                                          freezing_by_date, freezing_by_block, 7))
    for row in daily_rows:
        row["resort_id"] = resort["resort_id"]
    # Current snowpack depth per band. The model grid value is identical across
    # bands (snow_depth ignores elevation downscaling), so multi-band resorts
    # distribute an ANCHOR by season-budget ratio. The anchor is a nearby
    # measured station when one qualifies (better absolute level), else the
    # model grid value.
    grid_depth_cm = next(
        (cm for cm in (_current_depth_cm(bp) for bp in band_payloads.values()) if cm is not None),
        None,
    )
    anchor_depth_cm = grid_depth_cm
    anchor_budget = ref_budget
    depth_source = "model"
    if station is not None:
        station_budget = _budget_at_elevation(band_budgets, bands, float(station["elevation_m"]))
        if station_budget is not None:
            anchor_depth_cm = int(station["depth_cm"])
            anchor_budget = station_budget
            depth_source = "station"
    if multi_band:
        banded = _banded_depth_cm(anchor_depth_cm, band_budgets, anchor_budget)
        if snowline is not None:
            banded = _apply_snowline_gate(banded, bands, snowline)
    else:
        banded = {band: anchor_depth_cm for band in band_payloads}
    depth = {
        "base_cm": banded.get("base"),
        "mid_cm": banded.get("mid"),
        "top_cm": banded.get("top"),
        "asof": next(
            (cur.get("time") for cur in ((bp.get("current") or {}) for bp in band_payloads.values())
             if cur.get("time")),
            None,
        ),
        "estimate": True,
        "source": depth_source,
    }
    if depth_source == "station":
        depth["station"] = {
            "id": station.get("station_id"),
            "name": station.get("name"),
            "network": station.get("source"),
            "distance_km": station.get("distance_km"),
            "elevation_m": station.get("elevation_m"),
            "asof": station.get("asof"),
        }
    if snowline is not None:
        # transparency: what the satellite saw, even when nothing was gated
        depth["snowline"] = {
            "status": snowline.get("status"),
            "snowline_m": snowline.get("snowline_m"),
            "obs_date": snowline.get("obs_date"),
        }
    return {
        "resort_id": resort["resort_id"],
        "country_code": resort.get("country_code"),
        "region_id": resort.get("region_id"),
        "lat": resort["lat"],
        "lon": resort["lon"],
        "bands": bands,
        "models": models.split(","),
        "generated_utc": datetime.now(tz=timezone.utc).isoformat(),
        "daily": daily_rows,
        "depth": depth,
        "tendency_weekly": tendency,
    }
