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

import json
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


# ---- feels-like (2026-08-06) -----------------------------------------------
# Shipped after a measured 8-11.5 C morning miss at the Queenstown resorts.
# On clear, calm winter mornings the cold pool sits in the VALLEY while the
# slopes above it stay near zero; lapse-rate downscaling exports the valley's
# cold uphill, and Open-Meteo's apparent_temperature (Steadman) then subtracts
# its -4.00 constant on top because the dry, calm air zeroes its other terms.
# Served -13.9 C feels at Cardrona mid while sensors at that elevation read
# about 0 C.

def wind_chill_c(temp_c: float, wind_kmh: float | None) -> float:
    """JAG/TI wind chill, the cold-weather feels-like.

    Replaces the Steadman apparent-temperature passthrough, whose -4.00
    constant dominates in cold dry calm air (measured offset -3.6 to -4.6
    across all four models, in full sun included). JAG/TI is the formula built
    for sub-10 C conditions: outside its domain (T > 10 C or wind under
    4.8 km/h) the honest answer is the air temperature itself.
    """
    if wind_kmh is None or wind_kmh < 4.8 or temp_c > 10.0:
        return temp_c
    v = wind_kmh ** 0.16
    return 13.12 + 0.6215 * temp_c - 11.37 * v + 0.3965 * temp_c * v


# ---- band temperature from the pressure-level profile (2026-08-06) ----------
# The displayed band temperature comes from the FREE-AIR profile (temperature
# at pressure levels, interpolated to band elevation by geopotential height),
# not from grid-2m + lapse downscaling. Why: on clear calm winter mornings the
# cold pool sits in the VALLEY while the slopes above it stay near zero;
# downscaling exports the valley's 2m cold uphill. Measured 2026-08-06 across
# all four Queenstown resorts: served morning blocks -8.7 to -11.4 C against
# on-slope sensors at -0.7 to +0.1 C. The freezing-level cold-cap alternative
# was rejected because freezing_level_m is contaminated by the same inversion
# (multiple 0 C crossings — the model said 932 m while sensors held ~0 C at
# 1,620 m), leaving a -5 C residual; profile interpolation re-run over the same
# morning landed within +-0.5 C at the 1,620 m and 1,720 m stations.
#
# Scope: DISPLAY temperature and feels-like only. Snow amounts and phase
# (hybrid Tw) keep reading the 2m series — changing their input is a separate
# validation, not this fix. Scored daily against the Holfuy stations.
#
# Fallback is the 2m value, per hour per model, whenever the profile cannot
# answer: fetch failed, a model lacks the level, or the band sits below the
# lowest level (~750 m at 925 hPa) or above the highest. That floor also means
# valley-floor bands keep their 2m reading — inside the cold pool the cold IS
# the truth. No extrapolation, ever: outside the bracketing levels the profile
# has nothing to say. 600 hPa (~4,200 m) exists for the high Andes bands.
PRESSURE_PROFILE_LEVELS = (925, 900, 850, 800, 700, 600)


def profile_temp_by_stamp(
    profile_hourly: dict[str, Any] | None,
    band_elevation: float | None,
) -> dict[str, dict[str, float]] | None:
    """{time stamp: {model: interpolated temp C at band elevation}}.

    Missing (stamp, model) entries mean "profile has no answer here" — callers
    fall back to the 2m series for exactly that hour, so degradation is
    per-sample,
    never per-resort.
    """
    if not profile_hourly or band_elevation is None:
        return None
    times = profile_hourly.get("time") or []
    if not times:
        return None
    elev = float(band_elevation)
    models: set[str] = set()
    for level in PRESSURE_PROFILE_LEVELS:
        prefix = f"temperature_{level}hPa_"
        for key in profile_hourly:
            if key.startswith(prefix):
                models.add(key[len(prefix):])
    out: dict[str, dict[str, float]] = {}
    for model in models:
        level_pairs = []
        for level in PRESSURE_PROFILE_LEVELS:
            temps = profile_hourly.get(f"temperature_{level}hPa_{model}")
            heights = profile_hourly.get(f"geopotential_height_{level}hPa_{model}")
            if temps and heights:
                level_pairs.append((temps, heights))
        if len(level_pairs) < 2:
            continue
        for index, stamp in enumerate(times):
            points = []
            for temps, heights in level_pairs:
                t = temps[index] if index < len(temps) else None
                h = heights[index] if index < len(heights) else None
                if t is not None and h is not None:
                    points.append((float(h), float(t)))
            points.sort()
            if len(points) < 2 or elev < points[0][0] or elev > points[-1][0]:
                continue
            for (h_lo, t_lo), (h_hi, t_hi) in zip(points, points[1:]):
                if h_lo <= elev <= h_hi:
                    frac = 0.0 if h_hi == h_lo else (elev - h_lo) / (h_hi - h_lo)
                    out.setdefault(stamp, {})[model] = t_lo + frac * (t_hi - t_lo)
                    break
    return out or None


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


# ---- lapse-rate shadow: how much of the phase call is OUR altitude correction? ----
#
# Open-Meteo returns temperature already downscaled to the elevation we requested,
# using a lapse rate that is a FIXED 6.5 C/km. Measured, not assumed: sweeping
# 1000-2600 m at three sites on three continents, four models, 96 hours each, the
# implied rate is exactly 6.500 with zero non-linear hours (1,152 adjacent pairs).
# Relative humidity is NOT adjusted — it comes back byte-identical at every
# elevation — so reconstructing the grid-level state needs only the temperature.
#
# That inversion is what makes this shadow free: no extra upstream call, because
# the grid temperature is recoverable from the band temperature we already have.
OM_DOWNSCALE_LAPSE_C_PER_KM = 6.5

_MODEL_CELLS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_model_cells.json")
_MODEL_CELLS_CACHE: dict[str, Any] | None = None


def model_grid_elevations(resort_id: str | None) -> dict[str, float]:
    """{model: grid elevation m} for a resort, or {} when unmapped.

    Read from a static asset because a serving response never reveals it: the API
    echoes the elevation we ASKED for. Missing entries degrade to no shadow rather
    than to a guess — an unmapped resort must produce no chain, not a chain built
    on an assumed grid height."""
    global _MODEL_CELLS_CACHE
    if not resort_id:
        return {}
    if _MODEL_CELLS_CACHE is None:
        try:
            with open(_MODEL_CELLS_PATH, encoding="utf-8") as handle:
                _MODEL_CELLS_CACHE = json.load(handle).get("cells") or {}
        except Exception:
            _MODEL_CELLS_CACHE = {}
    entry = (_MODEL_CELLS_CACHE or {}).get(str(resort_id)) or {}
    out: dict[str, float] = {}
    for model, cell in entry.items():
        elevation = (cell or {}).get("grid_elevation_m")
        if isinstance(elevation, (int, float)):
            out[model] = float(elevation)
    return out

# The three lapse rates the shadow evaluates. NOT a probability distribution and
# NOT a confidence interval — a SENSITIVITY probe. It answers "how much of this
# snowfall is our altitude assumption?" and nothing else. Storm track, precipitation
# amount and timing uncertainty are separate axes and are not in here.
LAPSE_SHADOW_C_PER_KM = (4.0, 6.5, 8.0)

# Γ=6.5 reproduces what the serving path already computes. It is kept as an
# INVERSION SELF-CONSISTENCY CHECK — if it stops matching, the reconstruction or
# the API's downscaling changed. It is not physical validation of 6.5.
LAPSE_SELF_CHECK_C_PER_KM = 6.5

PHASE_FLIP_SNOW_FRACTION = 0.5   # dominant phase changes across the Γ range
SNOW_EVENT_FLIP_CM = 1.0         # a reportable event appears or vanishes across it
LAPSE_RATIO_FLOOR_CM = 0.1       # below this a max/min ratio is noise, not signal


# ---- band wind from the free atmosphere -------------------------------------
#
# WHY THE 10 m WIND IS NOT USED FOR A MOUNTAIN BAND
# A global model's 10 m wind belongs to its own smoothed terrain, and that terrain
# is not the resort. Measured at Treble Cone (1791 m, the one alpine station whose
# elevation survives both a DEM check and an independent temperature inversion),
# over 300 hours against the observed sustained wind:
#
#     source                 correlation   observed/forecast   serious misses
#     10 m surface, ECMWF        0.08            4.08           42 / 300
#     10 m surface, GEM          0.34            4.26           45 / 300
#     10 m surface, GFS          0.20            1.94           24 / 300
#     free air at 1791 m, GFS    0.47            1.17            0 / 300
#
# A "serious miss" is observed >= 25 km/h served as < 10 km/h — a real alpine gale
# shown as calm. That is the failure this function exists to remove, and it is the
# one a rider is most exposed to. In the prevailing westerly the free-air
# correlation reaches 0.83-0.86.
#
# WHAT THIS IS NOT
# Free air is NOT the wind at the site. An exposed ridge sees roughly all of it
# (Treble Cone ratio ~1.0 in every sector); a sheltered bowl sees a fraction. We
# have NO verified sheltered alpine station, so no exposure factor is applied and
# none is guessed: TERRAIN_EXPOSURE_FACTOR is 1.0. The known consequence is that
# sheltered terrain will be OVER-forecast, which is the direction we accept while
# the safer direction is unverifiable — but it is a limitation, not a feature.
#
# ECMWF IS DELIBERATELY NOT THE SOURCE
# Not a judgement on ECMWF's forecast skill. Its pressure-level product reaches us
# with 800 and 900 hPa missing, so a mountain band brackets across 850<->700 hPa —
# about 1534 m, against ~483 m for GFS/ICON/GEM. At Treble Cone that produced a
# free-air wind of ~30 km/h where GFS said 17 and the station measured 18.
TERRAIN_EXPOSURE_FACTOR = 1.0

# The bracket must be between levels ADJACENT in PRESSURE_PROFILE_LEVELS — no
# skipped level. This is a data-completeness test, not a thickness test, and the
# difference matters: pressure levels are naturally further apart in metres higher
# up (800<->700 hPa spans about 1000 m over the high Andes), so a thickness limit
# rejects perfectly good high-altitude brackets. Measured: a 900 m cap took
# Farellones at 2770 m from full coverage to zero. What must be excluded is a
# bracket that spans a MISSING level — ECMWF's 850<->700 with 800 absent — and
# adjacency catches exactly that while admitting the Andes.


def band_free_air_wind_series(
    profile_hourly: dict[str, Any] | None, band_elevation: float | None, model: str,
) -> dict[str, tuple[float, float]]:
    """{time stamp: (speed_kmh, direction_deg)} at band elevation, or {}.

    Interpolates u and v SEPARATELY between the two pressure levels bracketing the
    band by geopotential height, then recovers speed and direction. A stamp is
    absent whenever the interpolation would not be valid — never extrapolated,
    never clamped to an end level — so the caller falls back per hour rather than
    per resort, and the reason is recoverable from free_air_fallback_reason."""
    if not profile_hourly or band_elevation is None:
        return {}
    times = profile_hourly.get("time") or []
    if not times:
        return {}
    elev = float(band_elevation)
    out: dict[str, tuple[float, float]] = {}
    for index, stamp in enumerate(times):
        points = []
        for order, level in enumerate(PRESSURE_PROFILE_LEVELS):
            z = (profile_hourly.get(f"geopotential_height_{level}hPa_{model}")
                 or [None] * len(times))[index]
            speed = (profile_hourly.get(f"wind_speed_{level}hPa_{model}")
                     or [None] * len(times))[index]
            direction = (profile_hourly.get(f"wind_direction_{level}hPa_{model}")
                         or [None] * len(times))[index]
            if z is None or speed is None or direction is None:
                continue
            rad = math.radians(float(direction))
            # Meteorological 'from' bearing -> vector the air is moving TOWARDS.
            points.append((float(z), -float(speed) * math.sin(rad),
                           -float(speed) * math.cos(rad), order))
        points.sort()
        if len(points) < 2 or elev < points[0][0] or elev > points[-1][0]:
            continue
        for (z_lo, u_lo, v_lo, o_lo), (z_hi, u_hi, v_hi, o_hi) in zip(points, points[1:]):
            if z_lo <= elev <= z_hi:
                # PRESSURE_PROFILE_LEVELS descends in pressure, so adjacent
                # levels differ by exactly one in the list. Anything else means a
                # level between them was absent from the response.
                if abs(o_hi - o_lo) != 1:
                    break
                frac = 0.0 if z_hi == z_lo else (elev - z_lo) / (z_hi - z_lo)
                u = u_lo + frac * (u_hi - u_lo)
                v = v_lo + frac * (v_hi - v_lo)
                speed = math.hypot(u, v) * TERRAIN_EXPOSURE_FACTOR
                out[stamp] = (speed, (math.degrees(math.atan2(-u, -v)) + 360.0) % 360.0)
                break
    return out


def free_air_fallback_reason(
    profile_hourly: dict[str, Any] | None, band_elevation: float | None, model: str,
    stamp_index: int,
) -> str:
    """Why band_free_air_wind_series had no answer for this hour. Diagnostic only."""
    if not profile_hourly:
        return "missing_pressure_data"
    if band_elevation is None:
        return "missing_band_elevation"
    times = profile_hourly.get("time") or []
    heights = []
    for level in PRESSURE_PROFILE_LEVELS:
        z = (profile_hourly.get(f"geopotential_height_{level}hPa_{model}")
             or [None] * len(times))[stamp_index] if stamp_index < len(times) else None
        speed = (profile_hourly.get(f"wind_speed_{level}hPa_{model}")
                 or [None] * len(times))[stamp_index] if stamp_index < len(times) else None
        if z is not None and speed is not None:
            heights.append(float(z))
    if len(heights) < 2:
        return "missing_pressure_data"
    heights.sort()
    if float(band_elevation) < heights[0]:
        # The band sits below the lowest usable level, i.e. inside the model's own
        # terrain or boundary layer. Extrapolating down there would be inventing
        # an atmosphere under the ground.
        return "below_lowest_pressure_level"
    if float(band_elevation) > heights[-1]:
        return "above_highest_pressure_level"
    return "bracket_too_thick"


def lapse_shadow_chain(
    hourly: dict[str, Any], model: str, date: str,
    band_elevation_m: float | None, grid_elevation_m: float | None,
) -> dict[str, Any] | None:
    """Per-Γ phase chain for one model-day. SHADOW ONLY — never served.

    Reconstructs the model's grid-level temperature from the band-level
    temperature in `hourly`, then re-derives wet bulb, snow fraction and snowfall
    at each Γ in LAPSE_SHADOW_C_PER_KM. Returns None when the inputs are missing;
    a partial chain is worse than none because it would read as a measurement.
    """
    if band_elevation_m is None or grid_elevation_m is None:
        return None
    times = hourly.get("time") or []
    precip = hourly.get(f"precipitation_{model}") or []
    temps = hourly.get(f"temperature_2m_{model}") or []
    rhs = hourly.get(f"relative_humidity_2m_{model}") or []
    snow = hourly.get(f"snowfall_{model}") or []
    if not times or not precip or not temps or not rhs:
        return None
    dz_km = (float(band_elevation_m) - float(grid_elevation_m)) / 1000.0
    per_gamma: dict[str, dict[str, float]] = {}
    hours = 0
    day_precip = 0.0
    for gamma in LAPSE_SHADOW_C_PER_KM:
        snow_cm = 0.0
        tw_min = tw_max = None
        used = 0
        total_p = 0.0
        for index, stamp in enumerate(times):
            if not stamp.startswith(date):
                continue
            p = precip[index] if index < len(precip) else None
            t_band = temps[index] if index < len(temps) else None
            rh = rhs[index] if index < len(rhs) else None
            if p is None or t_band is None or rh is None:
                continue
            used += 1
            total_p += float(p)
            # band -> grid -> band at OUR gamma. RH is carried through unchanged,
            # which is what the API itself does; noting it because holding RH fixed
            # while moving temperature does not conserve vapour pressure.
            t_grid = float(t_band) + OM_DOWNSCALE_LAPSE_C_PER_KM * dz_km
            t_gamma = t_grid - gamma * dz_km
            t_wet = wet_bulb_stull(t_gamma, float(rh))
            tw_min = t_wet if tw_min is None else min(tw_min, t_wet)
            tw_max = t_wet if tw_max is None else max(tw_max, t_wet)
            native_hr = float(snow[index]) if index < len(snow) and snow[index] is not None else 0.0
            snow_cm += hybrid_hourly_snow_cm(native_hr, float(p), t_gamma, float(rh))
        if not used:
            return None
        hours = used
        day_precip = total_p
        liquid_equiv = total_p * OM_SNOW_CM_PER_MM
        per_gamma[f"{gamma:g}"] = {
            "snow_cm": round(snow_cm, 2),
            "tw_min_c": round(tw_min, 2) if tw_min is not None else None,
            "tw_max_c": round(tw_max, 2) if tw_max is not None else None,
            "snow_fraction": round(snow_cm / liquid_equiv, 3) if liquid_equiv > 0.01 else None,
        }
    values = [v["snow_cm"] for v in per_gamma.values()]
    fractions = [v["snow_fraction"] for v in per_gamma.values() if v["snow_fraction"] is not None]
    lo, hi = min(values), max(values)
    return {
        "grid_elevation_m": float(grid_elevation_m),
        "target_elevation_m": float(band_elevation_m),
        "delta_z_m": round(float(band_elevation_m) - float(grid_elevation_m), 1),
        "om_downscale_lapse": OM_DOWNSCALE_LAPSE_C_PER_KM,
        "hours": hours,
        "precip_mm": round(day_precip, 2),
        "per_gamma": per_gamma,
        "snowfall_lapse_min": round(lo, 2),
        "snowfall_lapse_max": round(hi, 2),
        "snowfall_lapse_range": round(hi - lo, 2),
        # NULL, not infinity, when the floor is not cleared: a ratio against a
        # near-zero denominator is an artefact of the denominator.
        "snowfall_lapse_ratio": round(hi / lo, 2) if lo >= LAPSE_RATIO_FLOOR_CM else None,
        # Does the DOMINANT PHASE change across the Γ range — rain-mostly at one
        # end, snow-mostly at the other? This is the qualitative flip that a
        # range in centimetres does not show.
        "phase_flip": (min(fractions) < PHASE_FLIP_SNOW_FRACTION <= max(fractions)) if fractions else None,
        # Does a reportable event appear or vanish? A day that is 0.4 cm at Γ=4
        # and 3 cm at Γ=8 is a different forecast, not a wider one.
        "snow_event_flip": lo < SNOW_EVENT_FLIP_CM <= hi,
    }


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
# (Those two rows are the ORIGINAL measurement, bucketed at the old D1-8/D9-16
# boundary. The buckets are now D1-7/D8-16; the anchors were kept rather than
# rescaled, because moving one lead across a 2,324-row bucket is not something to
# estimate by hand. Re-measure from the archive before quoting these again.)
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


def tier_bucket(day_index: int) -> str:
    """The bucket the TIER anchors were MEASURED in. Deliberately not lead_band().

    These two boundaries were the same value until 2026-08-16, and merging them
    again is tempting and wrong. `lead_band` answers "is this row the same kind of
    object the apps render as a point?" — that is a display question, and it moved
    to day_index<=7 to match the physics gate and what both apps already do.

    This answers "which measured population do the spread anchors and the
    model-count policy come from?", and that population is fixed by history: the
    anchors above were computed over archive rows bucketed D1-8/D9-16.

    Moving day 8 across without re-measuring is not neutral, and it fails in the
    OPTIMISTIC direction, which is the worse one. Measured on the change itself:
    the D9-16 policy deliberately does not discriminate (no spread anchor, demote
    only at n_models<=1) because rows there genuinely run about two models. Day 8
    runs three to four with real spread, so it would inherit an exemption built
    for a different population — tier went low -> high in 5 of 7 realistic cases,
    including the live Temple Basin row (n=3, p10/p50/p90 = 1.3/3.9/13.6).

    To merge them: re-measure the anchors from the forecast archive with day 8 in
    the long bucket, and re-derive the model-count policy from the actual n_models
    distribution per lead. Until then this stays where the measurement is.
    """
    return "D1-8" if day_index <= 8 else "D9-16"

# Wind is NOT a confidence axis. High wind does not make a total wrong, it makes
# it non-local — the snow arrives, just not necessarily where the point forecast
# says. That is a slope-condition statement (transport, loading, scoured faces),
# and mixing it into confidence conflated two different things a rider acts on
# differently. Thresholds remain PROVISIONAL: every other anchor was recomputed
# from 3,458 archive rows, but the archive has no gust column, so these still
# rest on a 240-row live sample.
WIND_TRANSPORT_KMH = 75         # provisional (240-row sample)
WIND_STRONG_TRANSPORT_KMH = 110  # provisional (240-row sample)


# The one place the hourly/wet-bulb window is defined. `band_daily_rows` takes it
# as `time_of_day_days`, `lead_band` derives its boundary from it, and the layer
# label is computed from the same value — so the display zone, the tier zone and
# the physics can no longer drift apart.
#
# They HAD drifted. Until 2026-08-16 `lead_band` returned "D1-8" for day_index<=8
# while the physics gate cut at index<7 (= day_index<=7), so day_index 8 alone was
# labelled a short-range row while being built from the daily snowfall_sum with no
# wet-bulb repartition. The docstring below already claimed the boundary was where
# "`layer` already changes", and the tier comment below already said "D1-7 runs
# four; D8-16 runs about two" — both describe day_index<=7. Only the two literals
# disagreed, and they disagreed silently because nothing compares them.
HOURLY_WINDOW_DAYS = 7

# ---- one calculation for the whole horizon (Snow Phase A) ----
# Inside HOURLY_WINDOW_DAYS a band's snow is built from the model's own hourly
# precipitation and snowfall, re-partitioned by a wet-bulb temperature computed
# AT BAND ELEVATION. Past it, the served number has been the vendor's daily
# snowfall_sum with no phase step at all — and Open-Meteo downscales temperature
# to the requested elevation but NOT snowfall, so out there base/mid/top serve
# byte-identical snow for a 700 m elevation span. That is the discontinuity this
# flag closes: not a better forecast, one forecast.
#
# WHAT IT DOES NOT TOUCH, DELIBERATELY
# Snow, precipitation and temperature only. Wind keeps the D8+ aggregation
# shipped in v3.4 — `day_agg`'s wind is NOT interchangeable with it (day_agg
# pools every model-hour and takes gust from the hourly field; the D8+ branch
# averages per-model daily means and takes gust from the vendor's daily max), so
# adopting day_agg wholesale would silently move the wind baseline that was just
# verified. Model set, weighting and the 0.7 cm/mm density are also unchanged.
#
# WHAT IS PROVISIONAL
# The conversion runs on temperature Open-Meteo downscaled at a fixed 6.5 C/km.
# That rate is verified as Open-Meteo's transform — measured to 6.500 with zero
# non-linear hours — and is NOT verified as this terrain's actual lapse rate.
# It is adopted here for one reason: D1-7 already uses it, so extending it is
# the smallest change that makes the horizon consistent. 4.0 and 8.0 stay in
# lapse_shadow_chain as a sensitivity diagnostic and are not optimised here.
UNIFY_D8_THERMODYNAMICS = True

# ---- input QC: which bands may use the unified path at all ----
# Two INDEPENDENT reasons a band is held back, and they are not the same failure:
#
#   invalid_resort_elevation  the declared band is above the terrain the resort
#                             actually owns, confirmed against BOTH the boundary
#                             polygon and a buffered version of it. One source
#                             alone is not enough — an OSM polygon can under-map
#                             an upper sector, so it reads too low; the earlier
#                             point-centred box samples a different mountain
#                             whenever the coordinate itself is wrong, and
#                             measured against the polygon pair it produced 11
#                             flags of which 1 survived.
#
#   coordinate_qc_fail        the resort point lies kilometres outside its own
#                             polygon. Every band elevation here is fine; what is
#                             wrong is the LOCATION, and resort lat/lon is the
#                             query coordinate for every upstream request with
#                             cell_selection=nearest pinning the grid cell to it.
#                             The unified path reads that grid cell's hourly
#                             series far more finely than the daily path does, so
#                             it is held back until the coordinate is fixed —
#                             which is a separate track, not something to correct
#                             silently inside a snow change.
#
# This is input QC, not a terrain correction: nothing here adjusts a forecast, it
# only decides whether the new calculation is allowed to run on this input. A
# blocked band keeps the existing production path and says so in snow_source.
_BAND_QC_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "_band_elevation_qc.json")
_BAND_QC_CACHE: dict[str, Any] | None = None


def _band_qc() -> dict[str, Any]:
    global _BAND_QC_CACHE
    if _BAND_QC_CACHE is None:
        try:
            with open(_BAND_QC_PATH, "r", encoding="utf-8") as fh:
                _BAND_QC_CACHE = (json.load(fh) or {}).get("resorts") or {}
        except (OSError, ValueError):
            # Absent or unreadable asset must not block serving. It degrades to
            # "no resort is quarantined", which is exactly today's behaviour.
            _BAND_QC_CACHE = {}
    return _BAND_QC_CACHE


def unified_block_reason(resort_id: str | None, band: str) -> str | None:
    """Why this (resort, band) may not use the unified path, or None.

    Elevation is checked per BAND and coordinate per RESORT, because that is how
    each failure actually scopes: one bad `top` does not invalidate `base`, while
    a coordinate 20 km from the polygon invalidates every band at once.
    """
    row = _band_qc().get(resort_id or "")
    if not row:
        return None
    if band in (row.get("quarantined_bands") or {}):
        return "invalid_resort_elevation"
    return row.get("unified_fallback") or None



def lead_band(day_index: int) -> str:
    """Two zones, per DECISIONS.md #1.

    The boundary is HOURLY_WINDOW_DAYS because that is where the forecast stops
    being the same object: `layer` changes there, the hourly multi-model window
    ends, and model count falls from 4 to about 2. The earlier D5 cut had no such
    basis — it came from a constant asserting skill drops there, and measured
    per lead day the spread actually steps at D3 and again at D5-6, so D5 was
    never a single clean break.

    Both apps already split on this boundary, not on the old one: iOS
    `isQuantitative` is `layer == "D1-7"` and its second section filters
    dayIndex 8...16; Android filters `layer == "D1-7"`. Neither reads
    `show_point_value`, and neither compares against "D1-8"/"D9-16" — which is
    why the drift never surfaced as a visible bug.
    """
    return "D1-7" if day_index <= HOURLY_WINDOW_DAYS else "D8-16"


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

    band = lead_band(day_index)          # display zone, emitted in the payload
    bucket = tier_bucket(day_index)      # measured zone, drives the thresholds only
    upper = snow_p90 if snow_p90 is not None else (snow_p50 or 0.0)
    snow_in_play = upper >= TIER_SNOW_FLOOR_CM
    precip_in_play = (precip_mm or 0.0) >= TIER_PRECIP_FLOOR_MM

    # Model count, judged against what its band normally has. D1-7 runs four;
    # D8-16 runs about two, so demoting D8-16 for "only two" fires on the normal
    # case and says nothing.
    if n_models is not None:
        if bucket == "D9-16":
            if n_models <= 1:
                demote(1, "single_model")
        elif n_models <= 2:
            demote(2, "few_models")
        elif n_models < TIER_MIN_MODELS_FULL:
            demote(1, "reduced_models")

    anchors = TIER_SPREAD_ANCHORS.get(bucket)
    # The floor CLAMPS the denominator; it does not skip the check. Skipping it
    # exempted exactly the rows that need it most: a phase or regime split drives
    # p50 toward zero while p90 stays large, so the most-disagreeing days fell
    # below the floor and kept a `high` tier. Measured on the archive, 8,182
    # D1-8 rows had p50 < 0.5 while p90 >= 0.5, and 5,584 of them reported
    # `high`; the worst implied spread was 263x. Temple Basin 2026-08-23 flipped
    # from `low` to `high` between two cycles while its p90 barely moved (16.5 ->
    # 15.2), purely because p50 crossed 0.5 downward.
    #
    # The floor's PURPOSE — do not tier a rounding artefact, and do not divide by
    # something near zero — is kept: clamping bounds the ratio, and rows whose
    # p90 is itself trivial still fail to reach the anchors. Note that
    # snow_in_play above already uses p90 for exactly this judgement; only this
    # test was keyed off p50.
    #
    # Verified: rows already above the floor are unchanged (max(p50, floor) is
    # p50 there), so this can only affect the previously-exempt set.
    if anchors and snow_p50 is not None:
        low = snow_p10 if snow_p10 is not None else snow_p50
        high = snow_p90 if snow_p90 is not None else snow_p50
        spread = (high - low) / max(snow_p50, TIER_SNOW_FLOOR_CM)
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
        # DECISIONS.md #1. The long band is range-only: with ~1.9 models its
        # p10-p90 is a min/max of two runs, so a point value there claims a
        # precision that does not exist even by the pipeline's own arithmetic.
        #
        # NOTE: neither app reads this field (verified by grep across both repos,
        # 2026-08-16); both branch on `layer` instead. It is payload metadata and
        # an audit record, not the display gate its name suggests.
        "show_point_value": band == "D1-7",
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
    profile_temps: dict[str, dict[str, float]] | None = None,
    free_air_wind: dict[str, dict[str, tuple[float, float]]] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    times = hourly.get("time") or []
    models = hourly_model_names(hourly)
    n_blocks = len(TIME_BLOCKS)
    day_snow: dict[str, float] = defaultdict(float)
    day_precip: dict[str, float] = defaultdict(float)
    day_temps: dict[str, list[float]] = defaultdict(list)
    # Per-model hybrid accounting, for forecast_diagnostics. Definitions come
    # from 20260729010000_forecast_diagnostics.sql:
    #   rain_candidate_mm  = sum of max(0, precip - native_cm/0.7) per hour
    #   contributing_hours = hours that survived the precip/temp gate
    #   hybrid_hours       = hours where the wet-bulb step actually ran
    # hybrid_applied is CONSERVATIVE: false if ANY contributing hour fell back.
    day_rain_candidate: dict[str, float] = defaultdict(float)
    day_hours: dict[str, int] = defaultdict(int)
    day_hybrid_hours: dict[str, int] = defaultdict(int)
    # Provenance of the DISPLAY temperature, per model per day: total hours and
    # how many of them fell back from the pressure profile to the 2 m series.
    day_temp_profile_hours: dict[str, int] = defaultdict(int)
    day_temp_fallback_hours: dict[str, int] = defaultdict(int)
    day_fallback: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    block_snow: list[dict[str, float]] = [defaultdict(float) for _ in range(n_blocks)]
    block_precip: list[dict[str, float]] = [defaultdict(float) for _ in range(n_blocks)]
    # DISPLAY temperature at band elevation: the profile-interpolated value
    # when available, the 2m series otherwise (see PRESSURE_PROFILE_LEVELS).
    # Snow/phase physics reads `temp` directly and never these arrays.
    block_temps: list[dict[str, list[float]]] = [defaultdict(list) for _ in range(n_blocks)]
    day_wind: list[tuple[float, float, float]] = []
    # Which wind source actually fed each model-day, so a served value is always
    # traceable to free air or to the 10 m fallback.
    day_free_air_hours: dict[str, int] = defaultdict(int)
    day_surface_fallback_hours: dict[str, int] = defaultdict(int)
    block_wind: list[list[tuple[float, float, float]]] = [[] for _ in range(n_blocks)]
    block_wx: list[list[int]] = [[] for _ in range(n_blocks)]

    for model in models:
        snow_series = hourly.get(f"snowfall_{model}") or []
        precip_series = hourly.get(f"precipitation_{model}") or []
        temp_series = hourly.get(f"temperature_2m_{model}") or []
        rh_series = hourly.get(f"relative_humidity_2m_{model}") or []
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
            day_hours[model] += 1
            if snow_hr is None:
                snow_cm = 0.0
                # No native prior, so no wet-bulb re-partition happened. Weight
                # the reason by precipitation, per the table's rule: the reason
                # recorded is the one covering the most contributing precip.
                day_fallback[model]["missing_snowfall"] += float(precip)
            else:
                if rh_hr is None:
                    day_fallback[model]["missing_rh"] += float(precip)
                else:
                    day_hybrid_hours[model] += 1
                snow_cm = hybrid_hourly_snow_cm(
                    float(snow_hr), float(precip), float(temp), rh_hr,
                )
                # Precip the hybrid could re-book as rain, at the SAME density
                # Open-Meteo uses for the native snowfall it is joining.
                rain_mm = float(precip) - float(snow_hr) / OM_SNOW_CM_PER_MM
                if rain_mm > 0.0:
                    day_rain_candidate[model] += rain_mm
            day_snow[model] += snow_cm
            day_precip[model] += float(precip)
            block_snow[block_index][model] += snow_cm
            block_precip[block_index][model] += float(precip)
            disp_temp = None
            if profile_temps is not None:
                disp_temp = profile_temps.get(stamp, {}).get(model)
            if disp_temp is None:
                disp_temp = float(temp)
                # Counted, not just used. The two sources differ by up to ~10 C
                # in a valley inversion — that gap is why v3 exists — so a day
                # that silently mixed them must not be archived as if it were a
                # clean profile day. Feeds temp_source in the day aggregate.
                day_temp_fallback_hours[model] += 1
            day_temp_profile_hours[model] += 1
            day_temps[model].append(disp_temp)
            block_temps[block_index][model].append(disp_temp)
            # SPEED and DIRECTION come from the free atmosphere at band
            # elevation where that is valid; the 10 m surface value is the
            # per-hour fallback, not a per-resort one. GUST is always the native
            # field — sustained and gust fail differently by model and must not
            # share a correction (measured: ECMWF sustained 4x low with gust
            # ~1.2x, GFS sustained 1.9x low with gust 4.2x low and nearly
            # constant). Changing gust is a separate, unstarted piece of work.
            fa = (free_air_wind or {}).get(model, {}).get(stamp)
            if fa is not None:
                wspd, wdir = fa[0], fa[1]
                day_free_air_hours[model] += 1
            else:
                wspd = wspd_series[index] if index < len(wspd_series) else None
                wdir = wdir_series[index] if index < len(wdir_series) else None
                day_surface_fallback_hours[model] += 1
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
        wind_kmh, wind_dir_deg, wind_gust_kmh = _wind_aggregate(block_wind[block_index])
        feels_p50 = wind_chill_c(temp_p50, wind_kmh)
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
                "feels_c_p50": round(feels_p50, 1),
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
    # Per-member values carried out alongside the aggregate, keyed by MODEL
    # NAME. `day_present` is the hourly path's member set; the caller persists
    # these before the p10/p50/p90 below discard which model said what. These
    # snow totals are POST-hybrid (hybrid_hourly_snow_cm ran per hour), which
    # is what the served quantiles are built from — so they are the right
    # thing to score, and `native_snow_cm` is not recoverable here.
    day_members = []
    for model in day_present:
        contributing = day_hours[model]
        hybrid_hours = day_hybrid_hours[model]
        reasons = day_fallback[model]
        # CONSERVATIVE, per the table's own rule: applied only when NO
        # contributing hour fell back. The reason reported is the one covering
        # the most contributing precipitation; ties resolve by name so the
        # value is stable across runs.
        applied = contributing > 0 and hybrid_hours == contributing
        reason = None
        if not applied:
            reason = (max(sorted(reasons), key=lambda r: reasons[r])
                      if reasons else "missing_snowfall")
        day_members.append({
            "model": model,
            "snow_cm": round(day_snow[model], 2),
            "precip_mm": round(day_precip[model], 2),
            "tmean_c": round(sum(day_temps[model]) / len(day_temps[model]), 2),
            "rain_candidate_mm": round(day_rain_candidate[model], 2),
            "contributing_hours": contributing,
            "hybrid_hours": hybrid_hours,
            "hybrid_applied": applied,
            "fallback_reason": reason,
        })
    # Extremes of the SAME series tmean_c_p50 is built from, so the triple is
    # always internally coherent. Deliberately NOT the vendor's daily
    # temperature_2m_min/max: those are 2 m values, and mixing them with a
    # profile-derived mean would let tmean fall outside [tmin, tmax] by the full
    # inversion gap (~10 C in the case that motivated v3). The cost is that the
    # D8-16 path below uses the vendor dailies instead, so the definition
    # changes at the window boundary — hence temp_source, which labels it rather
    # than hiding it. Hourly sampling also understates a true daily extreme
    # slightly; temp_source identifies those rows too.
    _fallback_hours = sum(day_temp_fallback_hours[m] for m in day_present)
    _profile_hours = sum(day_temp_profile_hours[m] for m in day_present)
    day_agg = {
        "members": day_members,
        "n_models": len(day_present),
        "snow_cm_p10": day_p10,
        "snow_cm_p50": day_p50,
        "snow_cm_p90": day_p90,
        "precip_mm_p50": round(_median([day_precip[m] for m in day_present]), 1),
        "tmean_c_p50": round(_median(temp_means), 1),
        "tmin_c_p50": round(_median([min(day_temps[m]) for m in day_present]), 1),
        "tmax_c_p50": round(_median([max(day_temps[m]) for m in day_present]), 1),
        "temp_source": ("profile_hourly" if _fallback_hours == 0
                        else "surface_hourly" if _fallback_hours == _profile_hours
                        else "mixed_hourly"),
        "wind_kmh": day_wind_kmh,
        "wind_dir_deg": day_wind_dir_deg,
        "wind_gust_kmh": day_wind_gust_kmh,
        "wind_free_air_hours": sum(day_free_air_hours.values()),
        "wind_surface_fallback_hours": sum(day_surface_fallback_hours.values()),
    }
    return blocks, day_agg


def band_daily_rows(
    payload: dict[str, Any],
    band: str,
    elevation_m: float | None,
    freezing_by_date: dict[str, float],
    freezing_by_block: dict[tuple[str, int], float],
    time_of_day_days: int,
    profile_hourly: dict[str, Any] | None = None,
    members_out: list[dict[str, Any]] | None = None,
    grid_elevations: dict[str, float] | None = None,
    unified_block: str | None = None,
) -> list[dict[str, Any]]:
    """`members_out`, when given, collects one PER-MODEL row per (band, day)
    BEFORE the quantile reduction below folds the members away.

    The reduction is lossy in a way nothing downstream can undo: p10/p50/p90
    keep the order statistics and discard which model said what, so questions
    like "is one model systematically the member we zero out?" are unanswerable
    from the 134k rows already archived. Collecting here costs one dict per
    (model, band, day) and changes no served value — every number below is
    computed exactly as before.
    """
    daily = payload.get("daily") or {}
    times = daily.get("time") or []
    hourly = payload.get("hourly") or {}
    models = daily_model_names(daily)
    used_elevation = payload.get("elevation")
    band_elevation = elevation_m if elevation_m is not None else used_elevation
    profile_temps = profile_temp_by_stamp(profile_hourly, band_elevation)
    # Once per band, for the full 16-day horizon: one wind source end to end, so
    # there is no D7->D8 source cliff. Empty per model where the profile cannot
    # answer, which makes the fallback per HOUR rather than per resort.
    free_air_wind = {
        model: band_free_air_wind_series(profile_hourly, band_elevation, model)
        for model in hourly_model_names(payload.get("hourly") or {})
    }
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
        # SHADOW ONLY, never served. Past the hourly window the served row is
        # built from the vendor's daily snowfall_sum with no wet-bulb step, and
        # whether that step SHOULD run out here is an open question this
        # pipeline has no way to answer: there is no southern-hemisphere truth,
        # so the counterfactual can be sized but not scored.
        #
        # Sizing it is still worth doing, and it cannot be done from one resort
        # on one cycle. Measured at Temple Basin, running the hybrid at D+8
        # collapses the ECMWF/GEM spread from 25.4x to 2.4x and separates three
        # bands that currently serve byte-identical snow — but one lead further
        # out, GFS carries 113.5 mm and the hybrid turns it into 69.8 cm at the
        # mid band, taking p90 from 13.1 to 58.0. Both of those are the same
        # change. Which one is typical is a fleet question over many cycles.
        #
        # So: compute it, persist it next to the native value, serve neither.
        # `shadow_agg` must never reach `day_agg` — that assignment is the whole
        # difference between recording a counterfactual and shipping it.
        shadow_by_model: dict[str, dict[str, Any]] = {}
        lapse_by_model: dict[str, dict[str, Any]] = {}
        shadow_agg: dict[str, Any] | None = None
        if index < time_of_day_days:
            blocks, day_agg = hourly_band_day(hourly, band_elevation, date, freezing_by_block,
                                              profile_temps, free_air_wind)
        elif members_out is not None or UNIFY_D8_THERMODYNAMICS:
            # Gated on members_out because this is pure cost with no served
            # effect: if nobody is persisting diagnostics, nobody can read it.
            _, shadow_agg = hourly_band_day(hourly, band_elevation, date, freezing_by_block,
                                            profile_temps, free_air_wind)
            for member in (shadow_agg or {}).get("members") or []:
                shadow_by_model[member["model"]] = member
            for model_name in models:
                chain = lapse_shadow_chain(
                    hourly, model_name, date, band_elevation,
                    (grid_elevations or {}).get(model_name))
                if chain is not None:
                    lapse_by_model[model_name] = chain

        if day_agg:
            snow_method = "band_thermodynamic"
            if members_out is not None:
                for member in day_agg.get("members") or []:
                    members_out.append({
                        "band": band, "date": date, "model": member["model"],
                        "layer": "D1-7",
                        "band_elevation_m": band_elevation,
                        "snow_cm": member["snow_cm"],
                        "precip_mm": member["precip_mm"],
                        "tmean_c": member["tmean_c"],
                        # Hourly path applies the wet-bulb override per hour, so
                        # the vendor's untouched snowfall is not reconstructible
                        # from the day total. Left null rather than guessed.
                        "native_snow_cm": None,
                        "rain_candidate_mm": member["rain_candidate_mm"],
                        "contributing_hours": member["contributing_hours"],
                        "hybrid_hours": member["hybrid_hours"],
                        # Null by definition here: inside the window the
                        # hybrid is not a counterfactual, it is what snow_cm
                        # already is. A non-null shadow on a D1-7 row would mean
                        # the two paths had diverged.
                        "shadow_hybrid_snow_cm": None,
                        "phase_lapse_chain": None,
                        "hybrid_applied": member["hybrid_applied"],
                        "fallback_reason": member["fallback_reason"],
                        "included": True,
                    })
            snow_p10 = day_agg["snow_cm_p10"]
            snow_p50 = day_agg["snow_cm_p50"]
            snow_p90 = day_agg["snow_cm_p90"]
            precip_p50 = day_agg["precip_mm_p50"]
            temp_p50 = day_agg["tmean_c_p50"]
            tmin_p50 = day_agg["tmin_c_p50"]
            tmax_p50 = day_agg["tmax_c_p50"]
            temp_source = day_agg["temp_source"]
            n_models = day_agg["n_models"]
            wind_kmh = day_agg["wind_kmh"]
            wind_free_air_hours = day_agg["wind_free_air_hours"]
            wind_surface_fallback_hours = day_agg["wind_surface_fallback_hours"]
            wind_dir_deg = day_agg["wind_dir_deg"]
            wind_gust_kmh = day_agg["wind_gust_kmh"]
        else:
            per_model_snow: list[float] = []
            per_model_precip: list[float] = []
            per_model_tmean: list[float] = []
            per_model_tmin: list[float] = []
            per_model_tmax: list[float] = []
            for model in models:
                snow = (daily.get(f"snowfall_sum_{model}") or [None] * len(times))[index]
                precip = (daily.get(f"precipitation_sum_{model}") or [None] * len(times))[index]
                tmax = (daily.get(f"temperature_2m_max_{model}") or [None] * len(times))[index]
                tmin = (daily.get(f"temperature_2m_min_{model}") or [None] * len(times))[index]
                if precip is None or tmax is None or tmin is None:
                    # NOTE: this `continue` is why the member lists CANNOT be
                    # zipped back to `models` by position afterwards — the
                    # dropped model leaves no gap. The name is recorded here,
                    # with its own values, precisely so nobody has to.
                    if members_out is not None:
                        members_out.append({
                            "band": band, "date": date, "model": model,
                            "layer": "D1-7" if index < time_of_day_days else "D8-16",
                            "band_elevation_m": band_elevation,
                            "snow_cm": None, "precip_mm": None, "tmean_c": None,
                            "native_snow_cm": float(snow) if snow is not None else None,
                            "rain_candidate_mm": None,
                            "contributing_hours": None,
                            "hybrid_hours": None,
                            "hybrid_applied": False,
                            # The model contributed nothing usable: this is the
                            # one case 'model_unavailable' genuinely describes.
                            "shadow_hybrid_snow_cm": None,
                            "phase_lapse_chain": None,
                            "fallback_reason": "model_unavailable",
                            "included": False,
                        })
                    continue
                t_mean = (float(tmax) + float(tmin)) / 2.0
                # Native model snowfall (cm), not precip × our SLR ladder.
                snow_member = float(snow) if snow is not None else 0.0
                per_model_snow.append(snow_member)
                per_model_precip.append(float(precip))
                per_model_tmean.append(t_mean)
                # The vendor's own daily extremes, 2 m downscaled. Unlike the
                # D1-7 branch there is no pressure profile out here
                # (fetch_pressure_profile stops at 7 days), so tmean is the
                # midpoint of exactly these two and the triple is coherent by
                # construction — just on a different series than D1-7's.
                per_model_tmin.append(float(tmin))
                per_model_tmax.append(float(tmax))
                if members_out is not None:
                    shadow = shadow_by_model.get(model)
                    members_out.append({
                        "band": band, "date": date, "model": model,
                        "layer": "D8-16",
                        "band_elevation_m": band_elevation,
                        "snow_cm": snow_member,
                        "precip_mm": float(precip),
                        "tmean_c": t_mean,
                        # None (not 0.0) when the vendor gave no snowfall: the
                        # member votes 0 in the quantile but the distinction
                        # between "no snow" and "no data" must survive here.
                        "native_snow_cm": float(snow) if snow is not None else None,
                        # No hourly window past time_of_day_days, so no wet-bulb
                        # step exists. This is OUR code gate — never
                        # 'model_unavailable', which would blame the upstream.
                        # From the SHADOW run, not from anything served. These
                        # describe a wet-bulb pass that did happen in memory and
                        # was then discarded; hybrid_applied stays False because
                        # the served number is still the native daily value
                        # above. A reader that treats these as evidence the
                        # hybrid ran for the user has misread the row.
                        "rain_candidate_mm": (shadow or {}).get("rain_candidate_mm"),
                        "contributing_hours": (shadow or {}).get("contributing_hours"),
                        "hybrid_hours": (shadow or {}).get("hybrid_hours"),
                        # What the wet-bulb repartition WOULD have produced at
                        # this band elevation. None when the model had no usable
                        # hourly data out here — ICON, for instance, returns 1 of
                        # 24 hours at D+8 and 0 of 24 at D+9, so its shadow is
                        # absent rather than zero. Never compare a null here
                        # against a 0.0; check contributing_hours first.
                        "shadow_hybrid_snow_cm": (shadow or {}).get("snow_cm"),
                        # Lapse-rate sensitivity probe, shadow only. See
                        # lapse_shadow_chain: this is the altitude/phase axis of
                        # uncertainty in isolation, NOT a confidence interval and
                        # NOT a distribution over Γ.
                        "phase_lapse_chain": lapse_by_model.get(model),
                        "hybrid_applied": False,
                        "fallback_reason": "outside_hourly_window",
                        "included": True,
                    })
            if not per_model_snow:
                continue
            snow_p10 = round(_quantile(per_model_snow, QUANTILES["p10"]), 1)
            snow_p50 = round(_quantile(per_model_snow, QUANTILES["p50"]), 1)
            snow_p90 = round(_quantile(per_model_snow, QUANTILES["p90"]), 1)
            precip_p50 = round(_median(per_model_precip), 1)
            temp_p50 = round(_median(per_model_tmean), 1)
            tmin_p50 = round(_median(per_model_tmin), 1)
            tmax_p50 = round(_median(per_model_tmax), 1)
            temp_source = "vendor_daily"
            n_models = len(per_model_snow)
            snow_method = "vendor_daily"
            # ---- one calculation for the whole horizon (see UNIFY_D8_THERMODYNAMICS) ----
            # The wet-bulb pass over this date's hourly data has ALREADY run a few
            # lines above — it was computed and discarded as a shadow. Adopting it
            # is therefore not a new physics path, it is the same function the
            # D1-7 rows are built from, stopping being thrown away.
            #
            # Snow, precipitation and temperature move together or not at all:
            # taking snow from the band calculation while leaving precip_mm_p50 and
            # tmean_c_p50 on the vendor dailies would put a row on the card whose
            # own fields disagree — 0 cm beside 12 mm at -4 C.
            #
            # The member set can differ from the daily one, and that is not a bug
            # to hide: a model with no usable hourly data at this lead is absent
            # here while still voting in the vendor-daily quantile. n_models
            # follows the calculation that produced the number, so a reader can
            # see it. Falls back untouched when the hour path returns nothing.
            if unified_block:
                # Held back by input QC. The served numbers below are exactly
                # what production serves today; only the label changes, so a
                # reader can tell a quarantined row from an ordinary one
                # instead of inferring it from a resort list somewhere else.
                snow_method = unified_block
            elif UNIFY_D8_THERMODYNAMICS and shadow_agg is not None:
                snow_p10 = shadow_agg["snow_cm_p10"]
                snow_p50 = shadow_agg["snow_cm_p50"]
                snow_p90 = shadow_agg["snow_cm_p90"]
                precip_p50 = shadow_agg["precip_mm_p50"]
                temp_p50 = shadow_agg["tmean_c_p50"]
                tmin_p50 = shadow_agg["tmin_c_p50"]
                tmax_p50 = shadow_agg["tmax_c_p50"]
                temp_source = shadow_agg["temp_source"]
                n_models = shadow_agg["n_models"]
                snow_method = "band_thermodynamic"
            # Wind past the hourly window uses the SAME free-air calculation as
            # inside it, aggregated from the hourly profile over this date. That
            # removes a D7->D8 cliff which would otherwise be two cliffs at once:
            # the source changing (free air -> 10 m) AND the statistic changing
            # (hourly mean -> vendor daily MAX). Both are gone; the whole horizon
            # is now one hourly mean of one source.
            #
            # The daily max/dominant fields remain the fallback for a band the
            # profile cannot bracket, and gust still comes from the native daily
            # max in every case — sustained and gust are not corrected together.
            wind_samples: list[tuple[float, float, float]] = []
            fa_hours = 0
            for model in models:
                gust_daily = (daily.get(f"wind_gusts_10m_max_{model}")
                              or [None] * len(times))[index]
                series = (free_air_wind or {}).get(model, {})
                hours = [(sp, dr) for stamp, (sp, dr) in series.items()
                         if stamp.startswith(date)]
                if hours:
                    fa_hours += len(hours)
                    mean_speed = sum(sp for sp, _ in hours) / len(hours)
                    u = sum(sp * math.sin(math.radians(dr)) for sp, dr in hours)
                    v = sum(sp * math.cos(math.radians(dr)) for sp, dr in hours)
                    wind_samples.append((
                        mean_speed, math.degrees(math.atan2(u, v)) % 360.0,
                        float(gust_daily) if gust_daily is not None else mean_speed,
                    ))
                    continue
                wspd = (daily.get(f"wind_speed_10m_max_{model}") or [None] * len(times))[index]
                wdir = (daily.get(f"wind_direction_10m_dominant_{model}")
                        or [None] * len(times))[index]
                if wspd is not None and wdir is not None:
                    wind_samples.append((
                        float(wspd), float(wdir),
                        float(gust_daily) if gust_daily is not None else float(wspd),
                    ))
            wind_kmh, wind_dir_deg, wind_gust_kmh = _wind_aggregate(wind_samples)
            wind_free_air_hours = fa_hours
            wind_surface_fallback_hours = 0 if fa_hours else len(wind_samples)

        # Day-level sky code (2026-08-06): within the hourly window the day's
        # code is the MODE OF ITS OWN BLOCK CODES, not Open-Meteo's daily
        # weather_code. The daily variable is each model's WORST HOUR of the
        # day, and the cross-model tie-break leans severe — measured at
        # Cardrona 2026-08-06: models read [3,3,1,1] off ~2 overcast hours in
        # an ~80%-clear day, serving an overcast header over four clear blocks.
        # Deriving the header from the blocks makes that contradiction
        # impossible by construction (same principle as the block p50
        # reconciliation). D8-16 has no blocks, so the daily variable stands.
        block_wx = [b["weather_code"] for b in blocks if b.get("weather_code") is not None]
        if block_wx:
            day_weather_code = _weather_code_mode(block_wx)
        else:
            weather_codes: list[int] = []
            for model in models:
                series = daily.get(f"weather_code_{model}") or []
                if index < len(series) and series[index] is not None:
                    weather_codes.append(int(series[index]))
            day_weather_code = _weather_code_mode(weather_codes)

        rows.append(
            {
                "date": date,
                "day_index": index + 1,
                "band": band,
                "elevation_m": band_elevation,
                "layer": "D1-7" if index < HOURLY_WINDOW_DAYS else "D8-16",
                "n_models": n_models,
                "snow_cm_p10": snow_p10,
                "snow_cm_p50": snow_p50,
                "snow_cm_p90": snow_p90,
                "snow_cm_model_native": snow_native,
                # Which calculation produced snow_cm_p*. Additive; both apps
                # decode by key. band_thermodynamic = the model's hourly precip
                # and snowfall re-partitioned by wet-bulb AT BAND ELEVATION;
                # vendor_daily = the vendor's daily snowfall_sum at ITS OWN grid
                # cell, which carries no band elevation and is identical across
                # base/mid/top. Pairs with temp_source, and the two can disagree.
                "snow_source": snow_method,
                "precip_mm_p50": precip_p50,
                "tmean_c_p50": temp_p50,
                # Additive only — both apps decode by key, so a new field is
                # safe where changing an existing int to a float would not be.
                # Read temp_source before comparing tmin/tmax across the D1-7 /
                # D8-16 boundary: the series changes there.
                "tmin_c_p50": tmin_p50,
                "tmax_c_p50": tmax_p50,
                "temp_source": temp_source,
                "freezing_level_m": round(freezing) if freezing is not None else None,
                "snow_level_margin_m": _snow_level_margin(band_elevation, freezing),
                "rain_risk": _rain_risk(band_elevation, freezing),
                "wind_kmh": wind_kmh,
                # Which source produced the sustained wind. Additive field; both
                # apps decode by key so an unknown one is ignored. free_air =
                # pressure levels interpolated to band elevation; surface_10m =
                # the model's own smoothed-terrain wind, used only where the
                # profile could not bracket the band; mixed = some hours each,
                # normal near a level boundary.
                "wind_source": ("free_air" if wind_surface_fallback_hours == 0
                                else "surface_10m" if wind_free_air_hours == 0
                                else "mixed"),
                "wind_dir_deg": wind_dir_deg,
                "wind_gust_kmh": wind_gust_kmh,
                "weather_code": day_weather_code,
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
        # timezone=auto, NOT UTC: fetch_band_forecast aggregates on the resort's
        # LOCAL day and attach_ensemble joins the two purely on the date string.
        # With UTC here, a New Zealand row carried snow_cm_* and ens_cm_* for the
        # same printed date describing windows 12 h apart. Measured on the
        # Temple Basin case, aligning the window moved the ECMWF ensemble median
        # from 5.11 to 3.57 cm — not cosmetic. This is an internal-consistency
        # fix, NOT an accuracy claim: there is no truth to say which 24 h window
        # is closer to reality, only that the two series must describe the same one.
        "forecast_days": 16, "timezone": "auto", "cell_selection": "nearest",
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


# Two different questions, so two different constants. They were one until
# 2026-08-16 and that silently starved day 8.
#
# ENSEMBLE_FROM_DAY_INDEX answers "where does the deterministic member set stop
# being a usable spread?" Past the hourly window a row is 2-4 raw daily values,
# and its p10-p90 is a min/max of runs rather than a quantile — the same
# objection this file already records for D9-16 applies verbatim at day 8, which
# runs 3-4 members. The ensemble is already fetched to forecast_days=16, so
# extending it costs nothing upstream.
#
# ROLLING_FROM_DAY_INDEX answers a different question: "where is the daily band
# so sparse that a single day says nothing?" That was measured at D9+ (five of
# eight days had p10=p50=p90=0). Day 8 is not in that state — it carries real
# spread — and the 3-day sum assumes perfect day-to-day correlation, so it
# OVERSTATES width. Smearing a day that does not need smearing is a loss, not a
# gain. It stays at 9.
ENSEMBLE_FROM_DAY_INDEX = 8


def attach_ensemble(rows: list[dict[str, Any]],
                    ensemble: dict[str, tuple[float, float, float, int]]) -> None:
    """Attach ens_* from ENSEMBLE_FROM_DAY_INDEX onward, in place. Earlier days
    are untouched: inside the hourly window they have four models hour by hour
    with the wet-bulb phase step applied, which is a better-resolved answer than
    a daily ensemble sum."""
    if not ensemble:
        return
    for row in rows:
        if (row.get("day_index") or 0) < ENSEMBLE_FROM_DAY_INDEX:
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
    # No apparent_temperature: feels-like is computed (wind_chill_c) from the
    # band temperature, not read from Open-Meteo's Steadman formula.
    hourly_vars = (
        "temperature_2m,relative_humidity_2m,precipitation,"
        "snowfall,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m"
    )
    if include_freezing_level:
        hourly_vars += ",freezing_level_height"
    params["hourly"] = hourly_vars
    # Current snowpack depth (metres) → the "current depth" layer served in the
    # same payload (FATMAP-style live depth). Single value across models.
    params["current"] = "snow_depth"
    return polite_get(FORECAST_URL, params)


def fetch_pressure_profile(resort: dict[str, Any], models: str) -> dict[str, Any]:
    """Free-air temperature/height at the pressure levels, one call per RESORT.

    Per resort and not per band: pressure-level values describe the air column
    above the grid cell, so every band interpolates from the same payload
    (profile_temp_by_stamp). The horizon is HOURLY_WINDOW_DAYS, not a literal —
    D8-16 rows are daily-var only and keep their 2 m tmean.

    That binding is load-bearing, not tidiness. If this horizon were ever left
    behind while the hourly window moved out (the obvious next change: run the
    wet-bulb repartition one day further), hourly_band_day would still run for
    the new day, profile_temps would have no stamp for it, and disp_temp would
    fall back to the 2 m series with no error and no log. The band temperature
    for that day alone would silently revert to pre-v3 behaviour — the failure
    that served -8.7 to -11.4 C across the Queenstown resorts where the slope
    sensors read -0.7 to +0.1 C. Equal literals in two files cannot express
    "these must move together"; one constant can.

    (If it does happen anyway, temp_source in the archive now records it: those
    rows land as mixed_hourly or surface_hourly instead of profile_hourly.)
    """
    params: dict[str, Any] = {
        "latitude": f"{float(resort['lat']):.5f}",
        "longitude": f"{float(resort['lon']):.5f}",
        # Wind joins temperature here rather than in fetch_band_forecast because
        # a pressure level is a property of the air column, not of a band: one
        # call per resort serves every band. Speed AND direction, because the
        # interpolation must be done on u/v components — interpolating a scalar
        # speed across a directional shear understates the result.
        "hourly": ",".join(
            f"temperature_{level}hPa,geopotential_height_{level}hPa,"
            f"wind_speed_{level}hPa,wind_direction_{level}hPa"
            for level in PRESSURE_PROFILE_LEVELS
        ),
        "models": models,
        # 16, not HOURLY_WINDOW_DAYS. The temperature use is still gated to the
        # hourly window by its caller, but band wind now runs the full horizon so
        # D1-16 has ONE source and there is no D7->D8 cliff. Measured: GFS serves
        # all six levels for 384/384 hours. Setting this to the maximum horizon
        # also permanently removes the drift hazard that binding it to the window
        # was guarding against — 16 is >= any window this pipeline can have.
        "forecast_days": 16,
        "timezone": "auto",
        # Same pin as fetch_band_forecast so profile and band describe the
        # same grid column (no elevation param — the column has no elevation).
        "cell_selection": "nearest",
    }
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
        # Free-air profile for the displayed band temperature (one per resort,
        # every band interpolates from it). Failure degrades to the 2m path.
        profile_future = pool.submit(fetch_pressure_profile, resort, models)
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
        try:
            profile_hourly = (profile_future.result() or {}).get("hourly")
        except Exception:
            profile_hourly = None  # display temps fall back to the 2m path

    freezing_by_date, freezing_by_block = freezing_level_by_date_block(band_payloads["mid"])
    daily_rows: list[dict[str, Any]] = []
    # Per-model members, captured before the quantile reduction. Carried out
    # under a leading underscore so the serving path can strip it: this is
    # audit data, not part of the client payload contract.
    members: list[dict[str, Any]] = []
    # Static per-model grid cells for the lapse shadow. Empty when the resort is
    # unmapped, which suppresses the chain rather than assuming a grid height.
    grid_cells = model_grid_elevations(resort.get("resort_id"))
    for band in sorted(band_payloads, key=lambda name: name != "mid"):
        band_rows = band_daily_rows(band_payloads[band], band, bands[band],
                                    freezing_by_date, freezing_by_block,
                                    HOURLY_WINDOW_DAYS,
                                    profile_hourly, members_out=members,
                                    grid_elevations=grid_cells,
                                    unified_block=unified_block_reason(
                                        resort.get("resort_id"), band))
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
        # Audit only — the serving path pops this before storing or returning
        # the payload, so it never reaches a client and never enters the
        # payload jsonb the apps decode.
        "_members": members,
    }
