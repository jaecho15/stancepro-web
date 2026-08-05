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
import os
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from typing import Any

import requests

DEFAULT_SUPABASE_URL = "https://ryiitcblrrqvjvxkobpf.supabase.co"
DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_QAigcpa5fpKsYihAaHr-4Q_eW_EwBUk"
# ---- Open-Meteo, commercial plan (2026-08-03) ----
# The free tier is licensed for NON-COMMERCIAL use only and this is a commercial
# product; the provider raised it. Every request now goes to the customer hosts
# with the subscription key.
#
# The host is per-endpoint, not one host with a path — `customer-api` serves the
# forecast, `customer-archive-api` the archive, and so on. Verified live against
# all five on 2026-08-03: forecast, historical-forecast, archive, ensemble and
# seasonal each returned 200 with data. Seasonal was the open question (it is
# absent from the plan's published feature list) and it works.
#
# FAILS CLOSED. `open_meteo_key()` raises when OPENMETEO_API_KEY is unset rather
# than falling back to the free host, because a silent fallback is exactly the
# licence violation this replaces — and an erroring cron is visible where a
# quietly non-compliant one is not. Vercel needs the variable set before the
# next deploy or the snow endpoints will return an error.
OPEN_METEO_HOSTS = {
    "forecast": "https://customer-api.open-meteo.com/v1/forecast",
    "seasonal": "https://customer-seasonal-api.open-meteo.com/v1/seasonal",
    "archive": "https://customer-archive-api.open-meteo.com/v1/archive",
    "ensemble": "https://customer-ensemble-api.open-meteo.com/v1/ensemble",
    "historical_forecast":
        "https://customer-historical-forecast-api.open-meteo.com/v1/forecast",
    "elevation": "https://customer-api.open-meteo.com/v1/elevation",
}


def open_meteo_key() -> str:
    """The subscription key, from the environment or a local .env file."""
    import os
    from pathlib import Path as _Path
    key = os.environ.get("OPENMETEO_API_KEY", "").strip()
    if key:
        return key
    # `.parents[:3]` is a slice, which pathlib rejects on Python 3.9 — the
    # runtime this actually ships on. Indexed explicitly.
    _self = _Path(__file__).resolve()
    roots = [_Path.cwd()] + [_self.parents[i] for i in range(min(3, len(_self.parents)))]
    for candidate in roots:
        env_file = candidate / ".env.local"
        if not env_file.exists():
            continue
        for line in env_file.read_text().splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "OPENMETEO_API_KEY" and value.strip():
                return value.strip().strip('"').strip("'")
    raise RuntimeError(
        "OPENMETEO_API_KEY is not set. Open-Meteo's free tier is licensed for "
        "non-commercial use only, so there is deliberately no fallback — set the "
        "key in the environment (Vercel) or .env.local (local).")


def open_meteo_params(params: dict) -> dict:
    """`params` plus the subscription key. Every call site goes through this."""
    return {**params, "apikey": open_meteo_key()}


FORECAST_URL = OPEN_METEO_HOSTS["forecast"]
SEASONAL_URL = OPEN_METEO_HOSTS["seasonal"]
ARCHIVE_URL = OPEN_METEO_HOSTS["archive"]
REQUEST_TIMEOUT_S = 60
DEFAULT_MODELS = "ecmwf_ifs025,gfs_seamless,icon_seamless,gem_seamless"
QUANTILES = {"p10": 0.10, "p50": 0.50, "p90": 0.90}
SNOW_LEVEL_OFFSET_M = 200.0
# Region lock: no region has a verification score yet, because no region has
# truth yet. Flipped per region once a scored verdict exists; until then every
# row reports region_unverified, which is the honest state and blocks alerts.
REGION_VERIFIED = False
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
    # numpy's _lerp switches formula at frac >= 0.5 for numerical symmetry;
    # replicate it exactly or 1-ulp drift lands on round(x, 1) knife edges
    # (e.g. median of [0.1, 4.2]: naive lerp → 2.1500000000000004 → 2.2,
    # numpy → 2.15 → 2.1 under banker's rounding).
    if frac >= 0.5:
        return xs[hi] - (xs[hi] - xs[lo]) * (1.0 - frac)
    return xs[lo] + (xs[hi] - xs[lo]) * frac


def _median(values: list[float]) -> float:
    # pandas Series.median() routes through np.median = mean-of-middle-two,
    # which is NOT bitwise the same as the _lerp quantile at q=0.5 (1-ulp
    # differences flip round(x, 1) on knife edges). Replicate np.median.
    xs = sorted(float(v) for v in values)
    n = len(xs)
    if n == 0:
        return float("nan")
    mid = n // 2
    if n % 2:
        return xs[mid]
    return (xs[mid - 1] + xs[mid]) / 2.0


def _quantiles(values: list[float]) -> tuple[float, float, float]:
    return (
        round(_quantile(values, QUANTILES["p10"]), 1),
        round(_quantile(values, QUANTILES["p50"]), 1),
        round(_quantile(values, QUANTILES["p90"]), 1),
    )


def _weather_code_mode(codes: list[int]) -> int | None:
    """Most common WMO weather_code; ties break toward the higher (usually more
    severe) code so a mixed clear/overcast block does not read as clear."""
    if not codes:
        return None
    counts = Counter(int(c) for c in codes)
    top = max(counts.values())
    return max(c for c, n in counts.items() if n == top)


# ---- copied verbatim from fetch_short_range_snow.py (no pandas) ----

# A band is only worth computing when it sits far enough from its neighbour to
# forecast differently. At the dry-adiabatic-ish lapse rates these mountains
# see (~0.65 °C/100 m), 100 m is about where the wet-bulb crosses a rain/snow
# decision — below that a "low" band would just restate the base band at extra
# compute cost.
LOW_BAND_MIN_GAP_M = 100.0


def elevation_bands(resort: dict[str, Any]) -> dict[str, float | None]:
    """base/mid/top as before, plus an optional `low` band.

    Two different measurements feed this. `base_elevation_m` is the BASE AREA —
    the lodge and bottom station, what a resort publishes. `terrain_min_m` /
    `terrain_max_m` come from the map index polygon: how low and high the
    skiable ground actually reaches. They usually agree; where they don't, each
    is right about its own thing.

    - Terrain running BELOW the base area gets its own `low` band. Cardrona's
      base area is 1670 m but its lifts and pistes reach 1259 m, and a forecast
      that starts at 1670 m says nothing about the 400 m where the rain/snow
      line most often sits.
    - Terrain reaching ABOVE the published top wins, because the published
      figure is often a stale "highest lifted point". The reverse (index lower
      than published) does not win — Las Leñas' polygon misses the whole upper
      Marte sector, 2778 m against an official 3430 m.

    The existing three bands keep their meaning and their values, so nothing
    already computed moves; `low` is additive and only appears where earned.
    """
    base = resort.get("base_elevation_m")
    top = resort.get("top_elevation_m")
    terrain_min = resort.get("terrain_min_m")
    terrain_max = resort.get("terrain_max_m")

    # An override caller supplies the index values directly as base/top; treat
    # them as the terrain extent too so a searched resort behaves the same.
    if not isinstance(terrain_min, (int, float)):
        terrain_min = None
    if not isinstance(terrain_max, (int, float)):
        terrain_max = None

    if isinstance(top, (int, float)) and terrain_max is not None:
        top = max(float(top), float(terrain_max))
    elif terrain_max is not None and not isinstance(top, (int, float)):
        top = float(terrain_max)
    if not isinstance(base, (int, float)) and terrain_min is not None:
        base = float(terrain_min)

    if not isinstance(base, (int, float)) or not isinstance(top, (int, float)) or top <= base:
        return {"mid": None}

    bands: dict[str, float | None] = {
        "base": float(base),
        "mid": round((float(base) + float(top)) / 2.0),
        "top": float(top),
    }
    if terrain_min is not None and float(base) - float(terrain_min) >= LOW_BAND_MIN_GAP_M:
        bands["low"] = float(terrain_min)
    return bands


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


# ---- hybrid wet-bulb phase override (2026-07-28) ----
# NWP models decide rain-vs-snow at the grid cell's mean elevation, and
# Open-Meteo's `elevation` parameter downscales temperature only — so a storm
# whose snow line sits between the grid elevation and the band gets classified
# rain even where the band is well below freezing (Cardrona 2026-07-30: 10-16 mm
# precip, all-day sub-zero bands, native snowfall ≈ 0). The fix keeps the
# model's own phase call as the prior and re-partitions only the contested
# slice by the band's wet-bulb temperature:
#   • rain → snow: the residual rain component (precip − native SWE, hourly, so
#     mixed-phase hours are never double-counted) becomes snow on the Tw ramp,
#     re-booked at OM_SNOW_CM_PER_MM — the SAME density Open-Meteo uses for the
#     native snowfall it is joining. Anything else (the old 7-vs-10:1 split)
#     makes one mm of SWE worth 43 % more cm depending on which model field it
#     landed in, and manufactures a fake elevation gradient out of a temperature
#     threshold: Whakapapa 2026-07-31 had identical 25.1 mm on all three bands
#     yet came out 12.4/19.3/24.3 cm, a ramp neither snow-forecast.com nor
#     MetService shows. Never the 14-17:1 cold tail either — that inflated the
#     old precip×SLR pipeline at high, dry sites.
#   • snow → rain: native snow is kept unless band Tw is clearly warm (shifted
#     ramp, trusting the model through the ambiguous zone) — guards valley-floor
#     bands that sit *below* the grid elevation.
# Hours without relative_humidity fall back to native unchanged.
OM_SNOW_CM_PER_MM = 0.7      # Open-Meteo snowfall convention: 0.7 cm per 1 mm SWE
TW_CONVERT_HI_C = 1.0        # rain→snow ramp: full snow ≤0°C Tw → none ≥+1°C
TW_KEEP_LO_C = 0.5           # snow→rain ramp: native snow kept ≤+0.5°C Tw...
TW_KEEP_HI_C = 1.5           # ...fully rained out ≥+1.5°C Tw


def wet_bulb_stull(temp_c: float, relative_humidity: float) -> float:
    """Wet-bulb temperature (°C) from dry-bulb temp and RH (%), via the Stull
    (2011, J. Appl. Meteor. Climatol.) empirical fit. Assumes ~1013 hPa; at
    altitude it slightly overstates Tw, i.e. errs toward rain (conservative)."""
    rh = min(max(relative_humidity, 5.0), 99.0)
    t = temp_c
    return (
        t * math.atan(0.151977 * math.sqrt(rh + 8.313659))
        + math.atan(t + rh)
        - math.atan(rh - 1.676331)
        + 0.00391838 * (rh ** 1.5) * math.atan(0.023101 * rh)
        - 4.686035
    )


def _tw_convert_fraction(t_wet_c: float) -> float:
    if t_wet_c >= TW_CONVERT_HI_C:
        return 0.0
    if t_wet_c >= 0.0:
        return 1.0 - t_wet_c / TW_CONVERT_HI_C
    return 1.0


def _tw_keep_fraction(t_wet_c: float) -> float:
    if t_wet_c <= TW_KEEP_LO_C:
        return 1.0
    if t_wet_c >= TW_KEEP_HI_C:
        return 0.0
    return (TW_KEEP_HI_C - t_wet_c) / (TW_KEEP_HI_C - TW_KEEP_LO_C)


def hybrid_hourly_snow_cm(
    native_cm: float, precip_mm: float, temp_c: float, rh_pct: float | None,
) -> float:
    """Effective new-snow (cm) for one model-hour at band elevation."""
    if rh_pct is None:
        return native_cm
    t_wet = wet_bulb_stull(temp_c, float(rh_pct))
    rain_mm = precip_mm - native_cm / OM_SNOW_CM_PER_MM
    if rain_mm < 0.0:
        rain_mm = 0.0
    return (
        native_cm * _tw_keep_fraction(t_wet)
        + rain_mm * _tw_convert_fraction(t_wet) * OM_SNOW_CM_PER_MM
    )


def _snow_level_margin(elevation: float | None, freezing: float | None) -> float | None:
    if elevation is None or freezing is None:
        return None
    return round(float(elevation) - (freezing - SNOW_LEVEL_OFFSET_M), 0)


def _rain_risk(elevation: float | None, freezing: float | None) -> bool:
    margin = _snow_level_margin(elevation, freezing)
    return margin is not None and margin < 0


# ---- forecast confidence tier (product policy, 2026-08-02) ----
# PRODUCT POLICY, not calibrated physics. Nothing here changes a forecast value;
# it labels how much weight a display should put on one, and records why.
#
# LEAD IS NO LONGER A DEMOTION — IT IS THE STRATUM
# The first version demoted for lead. That was wrong twice over. It restated
# `layer`, which the payload already carries and the UI already renders as its
# own section; and it flattened D5-16 into one undifferentiated bucket, which is
# the bulk of the product (target horizon D7-D14). Worse, it made `high`
# structurally impossible past lead 4.
#
# Anchors are therefore per lead band, measured from the forecast archive
# (rows with p90 >= 1 cm and p50 >= 0.5 cm), so "wide" means wide FOR THIS LEAD:
#
#     D1-8    n=2324   p50 1.52   p75 2.43   p90 4.32   models 3.9
#     D9-16   n=1134   p50 1.57   p75 1.60   p90 1.64   models 1.9
#
# D8-16 IS DEGENERATE AND IS TREATED AS SUCH
# Its spread barely moves — 1.57 at the median, 1.67 at the 90th. With 2.1
# models the min/max is the gap between two deterministic runs, not a quantile,
# so it is nearly a fixed multiple of the median and separates nothing. Applying
# a spread anchor there would manufacture a distinction out of arithmetic, so
# spread is NOT used as a discriminator in that band. Fixing it needs more
# members (a lagged ensemble, or a real ensemble API), not a different threshold.
#
# WHY THE TIER NO LONGER GATES DISPLAY
# Stratified by lead, the tier does not predict forecast revision: within lead 2,
# `moderate` revised LESS than `high` (0.12 vs 0.21); within lead 3 the order was
# high < low < moderate. The pooled result that looked convincing (0.27 vs 0.50)
# was Simpson's paradox — `high` is over-represented at lead 2, which revises
# less for reasons that have nothing to do with the tier. See TIER_METRIC.md.
# The tier ships as payload metadata and as `reasons` text; the display decision
# is made from the band itself.
TIER_MIN_MODELS_FULL = 4
TIER_SNOW_FLOOR_CM = 0.5        # below this, tiering a rounding artefact is noise
TIER_PRECIP_FLOOR_MM = 1.0      # below this, phase is moot — nothing is falling
TIER_MARGIN_MARGINAL_M = 150.0  # band this close to the snow level is a coin toss

# (p90-p10)/p50 anchors per lead band: (moderate, low). None = do not discriminate.
TIER_SPREAD_ANCHORS = {
    "D1-8": (2.43, 4.32),
    # Still no anchor: measured across 1,281 archive rows the D9+ relative
    # spread runs 1.54-1.59 end to end, which is a fixed multiple of the median
    # rather than information. A threshold there would invent a distinction.
    "D9-16": None,
}

# Wind is NOT a confidence axis. High wind does not make a total wrong, it makes
# it non-local — the snow arrives, just not necessarily where the point forecast
# says. That is a slope-condition statement (transport, loading, scoured faces),
# and mixing it into confidence conflated two different things a rider acts on
# differently. Thresholds remain PROVISIONAL: every other anchor was recomputed
# from 3,458 archive rows, but the archive has no gust column, so these still
# rest on a 240-row live sample.
WIND_TRANSPORT_KMH = 75         # provisional (240-row sample)
WIND_STRONG_TRANSPORT_KMH = 110  # provisional (240-row sample)


def lead_band(day_index: int) -> str:
    """Two zones, per DECISIONS.md #1.

    The boundary is 8 because that is where the forecast stops being the same
    object: `layer` already changes there, the hourly multi-model window ends,
    and model count falls from 4 to about 2. The earlier D5 cut had no such
    basis — it came from a constant asserting skill drops there, and measured
    per lead day the spread actually steps at D3 and again at D5-6, so D5 was
    never a single clean break.
    """
    return "D1-8" if day_index <= 8 else "D9-16"


def forecast_tier(
    *,
    day_index: int,
    n_models: int | None,
    snow_p10: float | None,
    snow_p50: float | None,
    snow_p90: float | None,
    snow_level_margin_m: float | None,
    wind_gust_kmh: int | None,
    precip_mm: float | None = None,
    region_verified: bool = True,
) -> dict[str, Any]:
    """Confidence metadata for one day-band row.

    Returns tier / reasons / show_point_value, plus the two gate fields
    (`alert_eligible`, `slope_condition`) that a notification feature will read
    when one exists. Nothing here is a forecast value.
    """
    reasons: list[str] = []
    level = 0                                  # 0 high, 1 moderate, 2 low

    def demote(to: int, reason: str) -> None:
        nonlocal level
        if to > level:
            level = to
        reasons.append(reason)

    band = lead_band(day_index)
    upper = snow_p90 if snow_p90 is not None else (snow_p50 or 0.0)
    snow_in_play = upper >= TIER_SNOW_FLOOR_CM
    precip_in_play = (precip_mm or 0.0) >= TIER_PRECIP_FLOOR_MM

    # Model count, judged against what its band normally has. D1-7 runs four;
    # D8-16 runs about two, so demoting D8-16 for "only two" fires on the normal
    # case and says nothing.
    if n_models is not None:
        if band == "D9-16":
            if n_models <= 1:
                demote(1, "single_model")
        elif n_models <= 2:
            demote(2, "few_models")
        elif n_models < TIER_MIN_MODELS_FULL:
            demote(1, "reduced_models")

    anchors = TIER_SPREAD_ANCHORS.get(band)
    if anchors and snow_p50 is not None and snow_p50 >= TIER_SNOW_FLOOR_CM:
        low = snow_p10 if snow_p10 is not None else snow_p50
        high = snow_p90 if snow_p90 is not None else snow_p50
        spread = (high - low) / snow_p50
        if spread >= anchors[1]:
            demote(2, "wide_spread_for_lead")
        elif spread >= anchors[0]:
            demote(1, "moderate_spread_for_lead")

    # Phase. Only meaningful when water is actually falling.
    rain_veto = False
    if snow_level_margin_m is not None and precip_in_play:
        if snow_level_margin_m < 0:
            demote(2, "rain_risk")
            rain_veto = True
        elif snow_level_margin_m < TIER_MARGIN_MARGINAL_M:
            demote(1, "marginal_snow_level")

    # Slope condition, reported separately from confidence.
    slope_condition = None
    if wind_gust_kmh is not None and snow_in_play:
        if wind_gust_kmh >= WIND_STRONG_TRANSPORT_KMH:
            slope_condition = "strong_wind_transport"
        elif wind_gust_kmh >= WIND_TRANSPORT_KMH:
            slope_condition = "wind_transport"

    if not region_verified:
        reasons.append("region_unverified")

    tier = ("high", "moderate", "low")[level]
    return {
        "tier": tier,
        "reasons": reasons,
        # DECISIONS.md #1. D9-16 is range-only: with ~1.9 models its p10-p90 is
        # a min/max of two runs, so a point value there claims a precision that
        # does not exist even by the pipeline's own arithmetic.
        "show_point_value": band == "D1-8",
        "lead_band": band,
        # Gate fields for a notification feature that does not exist yet. Stored
        # now so the day it ships the gate is already populated and auditable,
        # rather than being invented at that moment.
        "alert_eligible": (not rain_veto) and region_verified and snow_in_play,
        "slope_condition": slope_condition,
    }


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
    block_feels: list[dict[str, list[float]]] = [defaultdict(list) for _ in range(n_blocks)]
    day_wind: list[tuple[float, float, float]] = []
    block_wind: list[list[tuple[float, float, float]]] = [[] for _ in range(n_blocks)]
    block_wx: list[list[int]] = [[] for _ in range(n_blocks)]

    for model in models:
        snow_series = hourly.get(f"snowfall_{model}") or []
        precip_series = hourly.get(f"precipitation_{model}") or []
        temp_series = hourly.get(f"temperature_2m_{model}") or []
        rh_series = hourly.get(f"relative_humidity_2m_{model}") or []
        feels_series = hourly.get(f"apparent_temperature_{model}") or []
        wspd_series = hourly.get(f"wind_speed_10m_{model}") or []
        wdir_series = hourly.get(f"wind_direction_10m_{model}") or []
        wgst_series = hourly.get(f"wind_gusts_10m_{model}") or []
        wx_series = hourly.get(f"weather_code_{model}") or []
        for index, stamp in enumerate(times):
            if stamp[:10] != date:
                continue
            precip = precip_series[index] if index < len(precip_series) else None
            temp = temp_series[index] if index < len(temp_series) else None
            if precip is None or temp is None:
                continue
            block_index = int(stamp[11:13]) // 6
            # Native model snowfall (cm) as the phase prior, with the hybrid
            # wet-bulb override re-partitioning the contested slice at band
            # elevation (see hybrid_hourly_snow_cm above). A missing snowfall
            # sample means the prior is unknown, not zero — keep the old
            # "no data → no snow" semantics rather than re-deriving all of
            # the hour's precip.
            snow_hr = snow_series[index] if index < len(snow_series) else None
            rh_hr = rh_series[index] if index < len(rh_series) else None
            if snow_hr is None:
                snow_cm = 0.0
            else:
                snow_cm = hybrid_hourly_snow_cm(
                    float(snow_hr), float(precip), float(temp), rh_hr,
                )
            day_snow[model] += snow_cm
            day_precip[model] += float(precip)
            day_temps[model].append(float(temp))
            block_snow[block_index][model] += snow_cm
            block_precip[block_index][model] += float(precip)
            block_temps[block_index][model].append(float(temp))
            feels = feels_series[index] if index < len(feels_series) else None
            if feels is not None:
                block_feels[block_index][model].append(float(feels))
            wspd = wspd_series[index] if index < len(wspd_series) else None
            wdir = wdir_series[index] if index < len(wdir_series) else None
            if wspd is not None and wdir is not None:
                wgst = wgst_series[index] if index < len(wgst_series) else None
                sample = (float(wspd), float(wdir), float(wgst) if wgst is not None else float(wspd))
                day_wind.append(sample)
                block_wind[block_index].append(sample)
            wx = wx_series[index] if index < len(wx_series) else None
            if wx is not None:
                block_wx[block_index].append(int(wx))

    if not day_snow:
        return [], None

    day_present = sorted(day_snow)
    day_p10, day_p50, day_p90 = _quantiles([day_snow[m] for m in day_present])

    # ---- block p50 reconciliation (2026-08-05) ----
    # Cross-model quantiles are not additive: the day p50 is a quantile of
    # per-model DAY totals while each block p50 is a quantile of per-model
    # BLOCK totals, so a day can honestly read 1 cm while every block median
    # is 0 (two of four models snowing, in different blocks — observed at
    # Cardrona 2026-08-08: the header said 1 cm, the bars drew nothing). The
    # header and the bars must tell one story, so the block snow_cm_p50
    # EMITTED is the day p50 allocated across blocks by the cross-model MEAN
    # share (means, unlike quantiles, are additive; the shares sum to 1),
    # with largest-remainder rounding so the blocks sum to the day p50
    # exactly. Block p10/p90 stay true per-block quantiles (only clamped to
    # bracket the allocated p50), and nothing day-level or weekly moves, so
    # the quantile-of-sums rule for totals is untouched.
    total_snow = sum(day_snow[m] for m in day_present)
    alloc_p50: list[float] | None = None
    if total_snow > 0:
        units = int(round(day_p50 * 10))               # day_p50 is 0.1-rounded
        raw = [units * sum(block_snow[i].values()) / total_snow for i in range(n_blocks)]
        floors = [int(math.floor(r)) for r in raw]
        spare = max(0, units - sum(floors))
        # Ascending (floor - raw) = biggest remainder first; the sort is
        # stable, so remainder ties resolve toward the earlier block.
        for i in sorted(range(n_blocks), key=lambda b: floors[b] - raw[b])[:spare]:
            floors[i] += 1
        alloc_p50 = [f / 10.0 for f in floors]

    blocks: list[dict[str, Any]] = []
    for block_index, (block_key, block_ko, hour_lo, hour_hi) in enumerate(TIME_BLOCKS):
        present = sorted(block_snow[block_index])
        if not present:
            continue
        p10, p50, p90 = _quantiles([block_snow[block_index][m] for m in present])
        if alloc_p50 is not None:
            p50 = alloc_p50[block_index]
            p10 = min(p10, p50)
            p90 = max(p90, p50)
        precip_p50 = round(_median([block_precip[block_index][m] for m in present]), 1)
        temp_means = [sum(block_temps[block_index][m]) / len(block_temps[block_index][m]) for m in present]
        temp_p50 = _median(temp_means)
        feels_models = [m for m in present if block_feels[block_index][m]]
        feels_means = [sum(block_feels[block_index][m]) / len(block_feels[block_index][m]) for m in feels_models]
        feels_p50 = _median(feels_means) if feels_means else None
        # precip_type follows the EMITTED hybrid numbers (snow cm ÷ 0.7 → SWE mm
        # share of the block precip) so a block can never show fresh cm labeled
        # "rain"; dry blocks keep the dry-bulb ladder label.
        if precip_p50 > 0.0:
            snow_fraction = min(1.0, (p50 / OM_SNOW_CM_PER_MM) / precip_p50)
        elif p50 > 0.0:
            snow_fraction = 1.0
        else:
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
                "feels_c_p50": round(feels_p50, 1) if feels_p50 is not None else None,
                "precip_type": "snow" if snow_fraction >= 0.8 else ("mix" if snow_fraction > 0.0 else "rain"),
                "freezing_level_m": round(freezing) if freezing is not None else None,
                "snow_level_margin_m": _snow_level_margin(band_elevation, freezing),
                "rain_risk": _rain_risk(band_elevation, freezing),
                "wind_kmh": wind_kmh,
                "wind_dir_deg": wind_dir_deg,
                "wind_gust_kmh": wind_gust_kmh,
                "weather_code": _weather_code_mode(block_wx[block_index]),
            }
        )

    temp_means = [sum(day_temps[m]) / len(day_temps[m]) for m in day_present]
    day_wind_kmh, day_wind_dir_deg, day_wind_gust_kmh = _wind_aggregate(day_wind)
    day_agg = {
        "n_models": len(day_present),
        "snow_cm_p10": day_p10,
        "snow_cm_p50": day_p50,
        "snow_cm_p90": day_p90,
        "precip_mm_p50": round(_median([day_precip[m] for m in day_present]), 1),
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
                snow = (daily.get(f"snowfall_sum_{model}") or [None] * len(times))[index]
                precip = (daily.get(f"precipitation_sum_{model}") or [None] * len(times))[index]
                tmax = (daily.get(f"temperature_2m_max_{model}") or [None] * len(times))[index]
                tmin = (daily.get(f"temperature_2m_min_{model}") or [None] * len(times))[index]
                if precip is None or tmax is None or tmin is None:
                    continue
                t_mean = (float(tmax) + float(tmin)) / 2.0
                # Native model snowfall (cm), not precip × our SLR ladder.
                per_model_snow.append(float(snow) if snow is not None else 0.0)
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

        weather_codes: list[int] = []
        for model in models:
            series = daily.get(f"weather_code_{model}") or []
            if index < len(series) and series[index] is not None:
                weather_codes.append(int(series[index]))

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
                "weather_code": _weather_code_mode(weather_codes),
                "time_of_day": blocks,
                **forecast_tier(
                    day_index=index + 1,
                    n_models=n_models,
                    snow_p10=snow_p10, snow_p50=snow_p50, snow_p90=snow_p90,
                    snow_level_margin_m=_snow_level_margin(band_elevation, freezing),
                    wind_gust_kmh=wind_gust_kmh, precip_mm=precip_p50,
                    region_verified=REGION_VERIFIED,
                ),
            }
        )
    _attach_rolling_window(rows)
    return rows


# ---- D9-16 ensemble quantiles (DECISIONS.md #1, step 2) ----
# The 3-day window below is an approximation: it SUMS daily quantiles, which
# assumes the days are perfectly correlated and therefore overstates width. The
# fix is real members, and the ensemble API has them — 51 (ECMWF) + 40 (ICON) +
# 31 (GFS) + 21 (GEM) = 143 over the full 16 days in one request, measured
# 2026-08-02 at 25 KB and 1.8 s.
#
# Emitted as PARALLEL `ens_*` fields rather than replacing snow_cm_*: the two
# are different quantities under the same name. snow_cm_p10/p90 is a min/max of
# four deterministic runs; ens_cm_p10/p90 is a real quantile of 143 members.
# Overwriting one with the other would put a discontinuity through the archive
# that no config_version bump could untangle after the fact.
#
# Member count falls with lead — 143 to about 21 — because models reach their
# horizons at different points, so the last days can be a single model's
# ensemble rather than multi-model agreement. `ens_members` travels on every row
# so that is visible rather than implied.
ENSEMBLE_URL = OPEN_METEO_HOSTS["ensemble"]
ENSEMBLE_MODELS = "ecmwf_ifs025,gfs025,icon_global,gem_global"
ENSEMBLE_MIN_MEMBERS = 10


def fetch_ensemble_daily(
    lat: float, lon: float, elevation_m: float | None,
) -> dict[str, tuple[float, float, float, int]]:
    """{date: (p10, p50, p90, members)} of daily snowfall, or {} on any failure.

    Best-effort by construction: the ensemble is an enrichment on top of a
    forecast that already exists, so a failure here must degrade to the 3-day
    window rather than fail the compute.
    """
    params: dict[str, Any] = {
        "latitude": lat, "longitude": lon,
        "daily": "snowfall_sum", "models": ENSEMBLE_MODELS,
        "forecast_days": 16, "timezone": "UTC", "cell_selection": "nearest",
    }
    if elevation_m is not None:
        params["elevation"] = round(float(elevation_m))
    try:
        response = requests.get(ENSEMBLE_URL, params=open_meteo_params(params),
                                timeout=REQUEST_TIMEOUT_S)
        response.raise_for_status()
        daily = response.json().get("daily") or {}
    except Exception:  # noqa: BLE001 — enrichment must never sink the forecast
        return {}

    times = daily.get("time") or []
    members = [k for k in daily if k.startswith("snowfall_sum")]
    out: dict[str, tuple[float, float, float, int]] = {}
    for index, date in enumerate(times):
        values = [daily[k][index] for k in members
                  if index < len(daily[k]) and daily[k][index] is not None]
        # Below this a "quantile" is a handful of runs wearing the word, which is
        # the very problem the ensemble is here to fix.
        if len(values) < ENSEMBLE_MIN_MEMBERS:
            continue
        out[date] = (
            round(_quantile(values, 0.10), 1),
            round(_quantile(values, 0.50), 1),
            round(_quantile(values, 0.90), 1),
            len(values),
        )
    return out


# CONFIG_VERSION IS NOT BUMPED FOR THIS, DELIBERATELY
# The survey flagged that adopting the ensemble breaks `short_range_forecast_archive`
# and needs a version bump. It does not, because `attach_ensemble` writes only the
# parallel `ens_*` keys and never touches `cm_p10/p50/p90` — the archived series keeps
# one definition end to end, and CONFIG_VERSION stamps the physics, which did not
# change.
#
# What DID change is what a viewer sees at D9-16: a min/max over about two
# deterministic runs became a quantile over real members, on 2026-08-02. A scorer
# reading the archive's `cm_*` columns may cross that date freely. A scorer asking
# "how good was the band we displayed" may not, and nothing in the schema will warn
# them — hence this comment rather than a silent no-op.


def attach_ensemble(rows: list[dict[str, Any]],
                    ensemble: dict[str, tuple[float, float, float, int]]) -> None:
    """Attach ens_* to D9-16 rows, in place. D1-8 is untouched — it already has
    four models hour by hour, which is a better-resolved answer than a daily
    ensemble sum at that range."""
    if not ensemble:
        return
    for row in rows:
        if (row.get("day_index") or 0) < ROLLING_FROM_DAY_INDEX:
            continue
        found = ensemble.get(row.get("date"))
        if not found:
            continue
        p10, p50, p90, members = found
        row["ens_cm_p10"], row["ens_cm_p50"] = p10, p50
        row["ens_cm_p90"], row["ens_members"] = p90, members


# ---- D9-16 episode view (DECISIONS.md #1, step 1) ----
# D9-16 is band-only, and on its own the daily band there is close to empty:
# measured on a live payload, five of eight days had p10 = p50 = p90 = 0 and one
# more was a single model, so only two days carried any width at all. A viewer
# sees a flat line.
#
# That is a real property of the forecast, not a rendering bug — at ten days out
# a model places a storm within a few days, not on a day. Summing a centred
# 3-day window says the thing that is actually knowable: "roughly this much,
# somewhere around here". A storm on the 15th then also lifts the 14th and 16th
# instead of leaving them empty.
#
# Quantiles are summed across the window rather than re-derived, which is an
# APPROXIMATION and overstates width: it implicitly assumes the days are
# perfectly correlated, so a true 3-day p90 would be narrower than this sum.
# Recorded here because the alternative — re-quantiling from members — needs the
# ensemble API, which is step 2 of the same decision.
ROLLING_WINDOW_DAYS = 3
ROLLING_FROM_DAY_INDEX = 9


def _attach_rolling_window(rows: list[dict[str, Any]]) -> None:
    """Add centred 3-day rolling sums to D9-16 rows, in place."""
    ordered = sorted(rows, key=lambda r: r.get("day_index") or 0)
    half = ROLLING_WINDOW_DAYS // 2
    for position, row in enumerate(ordered):
        if (row.get("day_index") or 0) < ROLLING_FROM_DAY_INDEX:
            continue
        lo = max(0, position - half)
        hi = min(len(ordered), position + half + 1)
        window = ordered[lo:hi]
        row["roll3_days"] = len(window)
        row["roll3_date_start"] = window[0]["date"]
        row["roll3_date_end"] = window[-1]["date"]
        for key, source in (("roll3_cm_p10", "snow_cm_p10"),
                            ("roll3_cm_p50", "snow_cm_p50"),
                            ("roll3_cm_p90", "snow_cm_p90")):
            row[key] = round(sum(float(w.get(source) or 0.0) for w in window), 1)


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
            snowfall = daily.get(f"snowfall_sum{suffix}")
            tmax = daily.get(f"temperature_2m_max{suffix}")
            tmin = daily.get(f"temperature_2m_min{suffix}")
            if not snowfall or not tmax or not tmin:
                continue
            snow_total = 0.0
            temps: list[float] = []
            valid = True
            for index in range(week_start, week_end):
                if snowfall[index] is None or tmax[index] is None or tmin[index] is None:
                    valid = False
                    break
                t_mean = (float(tmax[index]) + float(tmin[index])) / 2.0
                snow_total += float(snowfall[index])       # native model snowfall (cm), no SLR
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
    # Every caller of this is an Open-Meteo endpoint, so the subscription key
    # is attached here rather than at each site — one place to be wrong instead
    # of five, and it fails closed if the key is absent.
    params = open_meteo_params(params)
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
        "weather_code,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant",
        "models": models,
        "forecast_days": forecast_days,
        "timezone": "auto",
        # Pin the model grid cell. Without this Open-Meteo's default
        # (cell_selection=land, "a land cell at a similar elevation") re-picks
        # the cell from the `elevation` we send, so each band can read a
        # DIFFERENT grid column. Measured across the serving fleet 2026-07-29:
        # 24 of 55 resorts had bands on different cells, concentrated in the
        # Andes, with differences big enough to look like orography — Vallecitos
        # ECMWF read 22.7 / 74.5 / 114.0 mm base/mid/top. That is not a vertical
        # gradient, it is three different places. Pinning takes it to 0 of 55.
        # It is invisible from the response: a multi-model call returns one
        # lat/lon, and the `elevation` field only echoes what we asked for.
        "cell_selection": "nearest",
    }
    if elevation_m is not None and math.isfinite(elevation_m):
        params["elevation"] = f"{elevation_m:.0f}"
    hourly_vars = (
        "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,"
        "snowfall,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m"
    )
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
        "daily": "temperature_2m_max,temperature_2m_min,snowfall_sum",
        "models": "ecmwf_ec46",
        "forecast_days": 46,
        "timezone": "auto",
            # See fetch_band_forecast: pin the cell so the whole payload for
            # one resort describes one place.
            "cell_selection": "nearest",
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


# --- Per-band depth model (season-to-date, from a known-zero baseline) --------
# Standard low-data snow modelling (temperature-index / degree-day, SNOW-17,
# plus SWE→depth densification à la SWE2HS): run the whole season day-by-day
# from a melt-out baseline of 0, accumulating SWE when the band is cold, melting
# by positive degree-days, and converting SWE→depth with bulk settling toward a
# max density. Two outputs per band:
#   • season_snowfall_cm — the models' OWN native season snowfall total, band-
#     scaled by snow-phase ratio (no SLR re-inflation); the honest "how much has
#     fallen" number, unbounded (full season, not a 90-day window).
#   • current_depth_cm  — modelled snow ON THE GROUND now (accum − melt − settle).
# The daily driver series is Open-Meteo ARCHIVE (ERA5, season start → today−5,
# no 92-day cap) stitched with the FORECAST past-days tail. One grid fetch per
# resort; bands come from a temperature lapse (colder up high → less melt, more
# snow-phase → a physically-based vertical gradient). Archive's own snow_depth
# is coarse/overestimated (per Open-Meteo docs) so it is NOT used — we model it.
# Baseline 0 holds for temperate resorts that melt out each summer; glacier/
# perennial-snow firn is not counted (resorts report seasonal snow over ice).

# Season anchor months (climatological melt-out): NH Sep 1, SH Mar 1.
SEASON_ANCHOR_MONTH_NH = 9
SEASON_ANCHOR_MONTH_SH = 3
TEMP_LAPSE_C_PER_M = 0.0065     # band temperature downscale from the grid cell
SNOW_TMEAN_C = 1.0             # daily mean at/below this → precip (partly) snow
TAU_SETTLE_DAYS = 20.0        # e-folding time of bulk-density settling
NEW_SNOW_RHO_KG_M3 = 100.0    # fresh-snow density (settles toward RHO_MAX)
RHO_MAX_KG_M3 = 450.0         # max seasonal snow density (settled pack)
DDF_SWE_MM_PER_DEGDAY = 4.0   # degree-day melt factor in SWE (mm w.e. / +°C / d)
ARCHIVE_LAG_DAYS = 5          # ERA5 latency; forecast past-days covers the tail
BAND_SNOW_RATIO_MAX = 2.5     # cap on band/grid snow-phase redistribution ratio
                              # (a warm grid cell with snow_frac→0 must not blow
                              #  the ratio up to tens of metres of season snow)

# Measured override: when a public snow station (snow_stations table — SNOTEL /
# SLF IMIS / JMA AMeDAS, cron-synced daily) sits close enough, the modelled
# depth profile is SCALED so it matches that measured depth at the station's
# elevation (measured magnitude, modelled vertical shape); source becomes
# "station". Multi-band resorts only: single-band resorts carry no elevations,
# so a station can't be matched vertically and the modelled value stays.
STATION_MAX_DISTANCE_KM = 15.0
STATION_MAX_AGE_H = 48.0
STATION_ELEV_MARGIN_M = 250.0   # station must sit within [base-250, top+250]

# Satellite snowline gating: the snow_snowlines table (VIIRS 375 m NDSI,
# elevation-regressed by the daily update-snowlines cron) tells us where snow
# actually exists. Bands clearly below the observed snowline serve depth 0 —
# the budget model's biggest failure mode (imagining base snow that melted or
# fell as rain) gets corrected by observation. Applies to multi-band resorts
# only (single-band carries no elevation to compare).
SNOWLINE_MAX_AGE_DAYS = 5       # older reads are too stale to gate depths
SNOWLINE_DISPLAY_MAX_AGE_DAYS = 14  # still surface on the depth card with as-of
SNOWLINE_MARGIN_M = 100.0       # band must sit this far below the line to zero


def _season_start_iso(lat: float) -> str:
    """Most recent climatological melt-out date for the hemisphere (ISO date).
    Snowpack is ~0 here, so the season model can run from a known-zero baseline."""
    today = datetime.now(tz=timezone.utc).date()
    anchor = SEASON_ANCHOR_MONTH_NH if lat >= 0 else SEASON_ANCHOR_MONTH_SH
    year = today.year if today.month >= anchor else today.year - 1
    return date(year, anchor, 1).isoformat()


def fetch_season_series(resort: dict[str, Any]) -> tuple[dict[str, tuple[float, float, float]], float]:
    """Daily grid series {iso_date: (precip_mm, tmean_c, snowfall_cm)} from season
    start to today, plus the grid cell elevation (m). `snowfall_cm` is the model's
    OWN native snowfall (grid elevation). ARCHIVE (ERA5, no 92-day cap) covers
    season start → today−ARCHIVE_LAG_DAYS; the FORECAST past-days tail fills the
    recent gap and today (overwriting any overlap). One grid fetch each; bands are
    derived later via a temperature lapse, so no `elevation` param here."""
    lat, lon = float(resort["lat"]), float(resort["lon"])
    start = date.fromisoformat(_season_start_iso(lat))
    today = datetime.now(tz=timezone.utc).date()
    series: dict[str, tuple[float, float, float]] = {}
    grid_elev: float | None = None

    def _ingest(payload: dict[str, Any]) -> None:
        nonlocal grid_elev
        if grid_elev is None and isinstance(payload.get("elevation"), (int, float)):
            grid_elev = float(payload["elevation"])
        daily = payload.get("daily") or {}
        times = daily.get("time") or []
        precs = daily.get("precipitation_sum") or []
        tmeans = daily.get("temperature_2m_mean") or []
        snows = daily.get("snowfall_sum") or []
        for i, t in enumerate(times):
            tm = tmeans[i] if i < len(tmeans) else None
            if tm is None:
                continue
            p = precs[i] if i < len(precs) else 0.0
            sf = snows[i] if i < len(snows) else 0.0
            series[t] = (float(p or 0.0), float(tm), float(sf or 0.0))

    arch_end = today - timedelta(days=ARCHIVE_LAG_DAYS)
    if arch_end > start:
        try:
            _ingest(polite_get(ARCHIVE_URL, {
                "latitude": f"{lat:.5f}", "longitude": f"{lon:.5f}",
                "start_date": start.isoformat(), "end_date": arch_end.isoformat(),
                "daily": "precipitation_sum,temperature_2m_mean,snowfall_sum", "timezone": "auto",
                "cell_selection": "nearest",
            }))
        except Exception:
            pass                                  # best-effort: forecast tail still runs
    try:
        _ingest(polite_get(FORECAST_URL, {
            "latitude": f"{lat:.5f}", "longitude": f"{lon:.5f}",
            "daily": "precipitation_sum,temperature_2m_mean,snowfall_sum",
            "models": "ecmwf_ifs025", "past_days": 15, "forecast_days": 1, "timezone": "auto",
            "cell_selection": "nearest",
        }))
    except Exception:
        pass
    return series, (grid_elev if grid_elev is not None else 0.0)


def season_band_metrics(series: dict[str, tuple[float, float, float]],
                        grid_elev: float,
                        band_elev: float | None) -> tuple[int, int]:
    """(season_snowfall_cm, current_depth_cm) for one band, run day-by-day from a
    zero baseline.

    Both outputs are driven by the SAME quantity — the model's OWN native snowfall
    (`snowfall_sum`) redistributed to this band — so the season total and the depth
    on the ground can never contradict each other (the previous split, native
    snowfall vs a precip×snow-fraction depth budget, produced impossible pairs like
    357 cm of snow on the ground from 0 cm of season snowfall).

    Band native snowfall per day = the grid's native snowfall scaled by the
    band-vs-grid snow-phase ratio, CLAMPED by BAND_SNOW_RATIO_MAX (a warm grid cell
    whose snow fraction →0 must not inflate the ratio to tens of metres). When the
    grid cell was too warm to log any native snow the colder band would still have
    received, we fall back to the band's own snow-phase precip. current_depth_cm:
    that native snowfall as SWE (fresh NEW_SNOW_RHO settling toward RHO_MAX),
    ablated by degree-day melt in SWE. No SLR re-inflation."""
    target_elev = band_elev if isinstance(band_elev, (int, float)) else grid_elev
    swe_mm = 0.0
    depth_cm = 0.0
    season_snow_cm = 0.0
    for t in sorted(series):
        precip_mm, tmean_grid, snow_grid_cm = series[t]
        tmean = tmean_grid - TEMP_LAPSE_C_PER_M * (target_elev - grid_elev)
        _, snow_frac_band = slr_and_snow_fraction(tmean)
        _, snow_frac_grid = slr_and_snow_fraction(tmean_grid)
        # Band native snowfall (fresh cm): redistribute the grid's native snowfall
        # by the band/grid snow-phase ratio (clamped); if the grid was too warm to
        # log snow that the colder band would still get, synthesize from precip.
        if snow_grid_cm > 0.0 and snow_frac_grid > 0.05:
            band_snow_cm = snow_grid_cm * min(snow_frac_band / snow_frac_grid,
                                              BAND_SNOW_RATIO_MAX)
        elif snow_frac_band > 0.0:
            band_snow_cm = precip_mm * snow_frac_band       # rho-100 fresh: 1 mm w.e. ≈ 1 cm
        else:
            band_snow_cm = 0.0
        if band_snow_cm > 0.0:                              # fresh snow → depth + SWE
            depth_cm += band_snow_cm
            swe_mm += band_snow_cm * NEW_SNOW_RHO_KG_M3 / 100.0
            season_snow_cm += band_snow_cm
        if depth_cm > 0 and swe_mm > 0:                     # settle toward RHO_MAX
            rho = 100.0 * swe_mm / depth_cm
            rho2 = RHO_MAX_KG_M3 - (RHO_MAX_KG_M3 - rho) * math.exp(-1.0 / TAU_SETTLE_DAYS)
            if rho2 > rho:
                depth_cm = 100.0 * swe_mm / rho2
        melt_mm = DDF_SWE_MM_PER_DEGDAY * max(tmean, 0.0)   # ablation
        if melt_mm > 0 and swe_mm > 0:
            melt_mm = min(melt_mm, swe_mm)
            frac_left = (swe_mm - melt_mm) / swe_mm
            swe_mm -= melt_mm
            depth_cm *= frac_left
            if swe_mm <= 0.01:
                swe_mm = 0.0
                depth_cm = 0.0
    return round(season_snow_cm), round(depth_cm)


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


def _snowline_candidate_ids(resort: dict[str, Any]) -> list[str]:
    """IDs to try against snow_snowlines: weather id first, then curated slug.

    Serving table keys are OSM/manual weather ids; snow_snowlines historically
    used snow_outlook slugs (mt_hutt, caviahue, …). Try both."""
    rid = str(resort.get("resort_id") or "").strip()
    ids: list[str] = []
    if rid:
        ids.append(rid)
    slug = None
    try:
        try:
            from _snow_outlook_slug_map import curated_slug_for_weather_id
        except ImportError:
            from snow_outlook_slug_map import curated_slug_for_weather_id
        slug = curated_slug_for_weather_id(rid)
    except Exception:
        slug = None
    if slug and slug not in ids:
        ids.append(slug)
    return ids


def fetch_snowline(resort: dict[str, Any]) -> dict[str, Any] | None:
    """The resort's latest confident satellite snowline read, or None.

    Attaches reads up to SNOWLINE_DISPLAY_MAX_AGE_DAYS for the depth-card UI.
    Depth gating itself still uses SNOWLINE_MAX_AGE_DAYS (see
    `_snowline_fresh_enough_to_gate`). Best-effort — never a dependency."""
    headers = {"apikey": DEFAULT_SUPABASE_PUBLISHABLE_KEY,
               "Authorization": f"Bearer {DEFAULT_SUPABASE_PUBLISHABLE_KEY}"}
    row = None
    for candidate in _snowline_candidate_ids(resort):
        try:
            response = requests.get(
                f"{DEFAULT_SUPABASE_URL}/rest/v1/snow_snowlines",
                params={"resort_id": f"eq.{candidate}",
                        "select": "status,snowline_m,sampled_max_m,obs_date",
                        "limit": 1},
                headers=headers,
                timeout=15,
            )
            response.raise_for_status()
            rows = response.json()
        except Exception:
            continue
        if rows:
            row = rows[0]
            break
    if row is None:
        return None
    try:
        obs = datetime.strptime(str(row.get("obs_date")), "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None
    age_days = (datetime.now(tz=timezone.utc) - obs).days
    if age_days > SNOWLINE_DISPLAY_MAX_AGE_DAYS:
        return None
    return row


def _snowline_fresh_enough_to_gate(snowline: dict[str, Any]) -> bool:
    try:
        obs = datetime.strptime(str(snowline.get("obs_date")), "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return False
    return (datetime.now(tz=timezone.utc) - obs).days <= SNOWLINE_MAX_AGE_DAYS


def _apply_snowline_gate(banded: dict[str, int | None],
                         bands: dict[str, float | None],
                         snowline: dict[str, Any]) -> dict[str, int | None]:
    """Zero the depth of bands the satellite saw as bare. `all_bare` only zeros
    bands inside the elevation span the grid actually sampled — never
    extrapolates above it. Stale reads (past SNOWLINE_MAX_AGE_DAYS) are ignored
    for gating but may still be shown on the card."""
    if not _snowline_fresh_enough_to_gate(snowline):
        return dict(banded)
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
        # Depth model: one grid fetch (archive season history + forecast tail)
        # drives every band via a temperature lapse — see season_band_metrics.
        season_future = pool.submit(fetch_season_series, resort)
        station_future = pool.submit(fetch_nearby_station, resort, bands) if multi_band else None
        # Always try snowline — even single-band cards show the satellite read.
        snowline_future = pool.submit(fetch_snowline, resort)
        # One ensemble request per band, in the same round-trip as everything
        # else. Per band and not per resort because it accepts `elevation` and
        # the answer genuinely differs — measured 2026-08-02 at Chillan, the
        # 16-day member total moved 12,066 -> 14,992 cm between the grid height
        # and 2,500 m.
        ensemble_futures = {
            band: pool.submit(fetch_ensemble_daily,
                              float(resort["lat"]), float(resort["lon"]), bands[band])
            for band in bands
        }
        band_payloads = {band: future.result() for band, future in band_futures.items()}
        ensembles = {band: future.result() for band, future in ensemble_futures.items()}
        tendency = tendency_future.result() if tendency_future else []
        season_series, grid_elev = season_future.result()
        station = station_future.result() if station_future else None
        snowline = snowline_future.result() if snowline_future else None

    freezing_by_date, freezing_by_block = freezing_level_by_date_block(band_payloads["mid"])
    daily_rows: list[dict[str, Any]] = []
    for band in sorted(band_payloads, key=lambda name: name != "mid"):
        band_rows = band_daily_rows(band_payloads[band], band, bands[band],
                                    freezing_by_date, freezing_by_block, 7)
        attach_ensemble(band_rows, ensembles.get(band) or {})
        daily_rows.extend(band_rows)
    for row in daily_rows:
        row["resort_id"] = resort["resort_id"]
    # Season-to-date depth model (see season_band_metrics): current snow on the
    # ground plus total season snowfall, per band, run from a melt-out baseline of
    # zero. When a nearby snow station qualifies, the modelled profile is scaled so
    # it matches the measured depth at the station's elevation (measured magnitude,
    # modelled vertical shape); otherwise it is the pure model estimate.
    season_start = _season_start_iso(float(resort["lat"]))
    modeled_depth: dict[str, int | None] = {}
    season_snow: dict[str, int | None] = {}
    for band, elev in bands.items():
        snow_cm, depth_cm = season_band_metrics(season_series, grid_elev, elev)
        modeled_depth[band] = depth_cm
        season_snow[band] = snow_cm

    depth_source = "model"
    if station is not None:
        modeled_at_station = _budget_at_elevation(
            {b: float(v) for b, v in modeled_depth.items() if v is not None},
            bands, float(station["elevation_m"]))
        if modeled_at_station and modeled_at_station > 0:
            scale = float(station["depth_cm"]) / modeled_at_station
            modeled_depth = {b: (round(v * scale) if v is not None else None)
                             for b, v in modeled_depth.items()}
            depth_source = "station"

    if multi_band and snowline is not None:
        modeled_depth = _apply_snowline_gate(modeled_depth, bands, snowline)

    depth = {
        "base_cm": modeled_depth.get("base"),
        "mid_cm": modeled_depth.get("mid"),
        "top_cm": modeled_depth.get("top"),
        "asof": (max(season_series) if season_series else None),
        "estimate": True,
        "source": depth_source,
        "season_start": season_start,
        "season_snowfall": {
            "base_cm": season_snow.get("base"),
            "mid_cm": season_snow.get("mid"),
            "top_cm": season_snow.get("top"),
        },
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
