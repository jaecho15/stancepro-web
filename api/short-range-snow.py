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
ARCHIVE_TABLE = "short_range_forecast_archive"
DIAGNOSTICS_TABLE = "forecast_diagnostics"
DEFAULT_MAX_AGE_S = 3 * 60 * 60  # 3h — matches the app's TTL and NWP cadence
# v3 (2026-08-06): displayed band temp from the pressure-level profile (2m
# lapse downscaling exported valley-inversion cold uphill — measured -8.7 to
# -11.4 C served vs -0.7 to +0.1 C on-slope across the Queenstown resorts) and
# feels-like from JAG/TI wind chill instead of Steadman's flat -4. Snow/phase
# physics unchanged from v2.
# v3.1: D1-7 day weather_code = mode of its own block codes (the daily
# variable is each model's worst hour — served an overcast header over four
# clear blocks, Cardrona 2026-08-06). Numeric fields untouched from v3.
# v3.2 (2026-08-16): lead_band boundary moved off its own literal onto
# short_range_core.HOURLY_WINDOW_DAYS, so the display zone, the layer label and
# the wet-bulb physics gate can no longer drift. They HAD drifted: day_index 8
# alone was labelled "D1-8" while being built from the daily snowfall_sum with
# no wet-bulb repartition. Two payload fields move and NOTHING numeric does —
# `lead_band` is now "D1-7"/"D8-16" (was "D1-8"/"D9-16") on every row, and
# `show_point_value` is false at day_index 8 (was true). Verified across 4,480
# input combinations: tier and alert_eligible are byte-identical to v3.1.
#
# Bumped even though no number changed, because the archive keys on this string
# and would otherwise mix two lead_band conventions inside one series with no
# way to tell them apart after the fact.
# v3.3 (2026-08-16): three archive-visible rule changes, no physics.
# (a) the ensemble is fetched on the resort's LOCAL day instead of UTC, so
#     ens_cm_* and snow_cm_* under one date finally describe the same 24 h — in
#     NZ they were 12 h apart, worth 5.11 -> 3.57 cm on the Temple Basin median.
# (b) ens_* now attaches from day_index 8 rather than 9 (ENSEMBLE_FROM_DAY_INDEX),
#     because day 8 sits past the wet-bulb window and its p10-p90 was a min/max
#     over 3-4 raw runs. The 3-day rolling window deliberately stays at 9.
# (c) the tier spread test CLAMPS its denominator to TIER_SNOW_FLOOR_CM instead
#     of skipping when p50 is below it. Skipping exempted the rows that need it
#     most: a phase split drives p50 toward zero while p90 stays large, so
#     8,182 archive rows had p50 < 0.5 with p90 >= 0.5 and 5,584 of those
#     reported `high`. Worst implied spread 263x.
# snow_cm_*, precip, temperature and freezing level are byte-identical to v3.2
# (verified by replay against frozen upstream responses). Bumped because `tier`
# and `ens_*` are archived and their RULE changed: a scorer crossing this
# boundary without splitting on config_version compares two different rules.
CONFIG_VERSION = "hybrid-tw-v3.3-spread-gate"

# Archive cycle bucket. Deliberately equal to the serving TTL above: a refresh
# that happens inside one TTL window is the same forecast, so it must land on
# the same run_init_time and collapse via the primary key.
ARCHIVE_CYCLE_H = 3
ARCHIVE_TIMEOUT_S = 10   # bounds the latency the archive can add to a serve
# Summit to valley. `low` exists only where the map-index polygon shows
# terrain below the published base area (5 of 58 resorts) — the band the
# rain/snow line most often sits in, which is why it is worth recording.
# Kept in step with the CHECK in
# supabase/migrations/20260816010000_verification_tables_allow_low_band.sql.
ARCHIVE_BANDS = ("low", "base", "mid", "top")  # table CHECK constraint

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


# ---------------------------------------------------------------------------
# Credential-safe logging
# ---------------------------------------------------------------------------
# A key stored with stray whitespace — a trailing newline is the routine
# copy-paste slip when pasting into a Vercel env var — makes the HTTP stack
# raise with the offending header value, i.e. the CREDENTIAL, verbatim in the
# message (verified against requests 2.32.3):
#   "<key>\n"    -> ValueError("Invalid header value b'Bearer <key>\n'")
#                   raised by http.client; NOT a requests.RequestException, so
#                   it escapes every narrow `except requests.RequestException`
#                   in this file and reaches the generic 502 responder.
#   "<key>\r\n"  -> requests.exceptions.InvalidHeader("... in header value:
#                   'Bearer <key>\r\n'")  (is a RequestException)
# So: no raw exception text may reach a log line OR a response body. Every
# such path in this file goes through _safe_detail() / _scrub().
_SECRET_ENV_VARS = (
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
)
_MIN_SECRET_LEN = 8  # a blank/short env var must never become a global blanker


def _secret_values() -> list[str]:
    """Every credential string currently worth redacting, longest first.

    Re-read from os.environ on EVERY call rather than captured once at import:
    if a key is rotated mid-process the module-level constants go stale, and a
    redaction pinned to the old value would pass the NEW key straight through.
    Both the raw and the stripped form are registered, because the whitespace
    variant is precisely what ends up quoted inside the exception message.
    """
    values: set[str] = set()
    candidates: list[object] = [WRITE_KEY, READ_KEY]
    candidates += [os.environ.get(name) for name in _SECRET_ENV_VARS]
    for candidate in candidates:
        if not isinstance(candidate, str):
            continue
        for variant in (candidate, candidate.strip()):
            if len(variant) >= _MIN_SECRET_LEN:
                values.add(variant)
    return sorted(values, key=len, reverse=True)


def _scrub(text: object) -> str:
    """Remove any configured credential from `text`. Defence in depth only —
    the primary rule is to emit type(exc).__name__ + a fixed description and
    not exception text at all."""
    out = str(text)
    for secret in _secret_values():
        out = out.replace(secret, "[redacted]")
    return out


def _is_credential_bearing(exc: BaseException) -> bool:
    """True for the header-validation errors that quote the Authorization /
    apikey VALUE in their message. Those are never echoed at all, scrubbed or
    not — the scrubber is the second line of defence, not the first."""
    try:
        return isinstance(exc, ValueError) and "header value" in str(exc).lower()
    except Exception:  # noqa: BLE001 — a hostile __str__ must not break logging
        return True


def _safe_detail(exc: BaseException, limit: int = 300) -> str:
    """Exception type plus a scrubbed, truncated message — never the raw one."""
    name = type(exc).__name__
    if _is_credential_bearing(exc):
        return (f"{name}: message withheld (it can embed a credential); check "
                "the Supabase *_KEY env vars for stray whitespace/newline")
    return f"{name}: {_scrub(exc)}"[:limit]


def _safe_label(value: object, limit: int = 64) -> str:
    """A caller-supplied identifier, safe to place in a single stderr line:
    scrubbed, control characters flattened (no forged log lines), truncated."""
    text = _scrub(value)
    text = "".join(ch if ch.isprintable() else " " for ch in text).strip()
    return text[:limit] or "<unknown>"


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
_RESORT_INDEX_CACHE: tuple[dict[str, str], list[tuple[float, float, str]],
                          dict[str, tuple[float, float]]] | None = None


def _load_resort_index() -> tuple[dict[str, str], list[tuple[float, float, str]],
                                  dict[str, tuple[float, float]]]:
    """(by_id, geo, elev_by_id): by_id maps resort_id→country, geo is a list of
    (lat, lon, country) used as a nearest-neighbour fallback, and elev_by_id
    maps resort_id→(terrain_min_m, terrain_max_m)."""
    global _RESORT_INDEX_CACHE
    if _RESORT_INDEX_CACHE is not None:
        return _RESORT_INDEX_CACHE
    by_id: dict[str, str] = {}
    geo: list[tuple[float, float, str]] = []
    # Terrain extent per resort, from the SAME index: these are the polygon's
    # own min/max, i.e. how low and high the skiable ground actually goes —
    # a different measurement from the curated seed's "base area elevation",
    # which is where the lodge and the bottom lift station sit. Cardrona is the
    # clearest case: base area 1670 m, but pistes and a lift reach 1259 m.
    # See _terrain_extent for what each is used for.
    elev_by_id: dict[str, tuple[float, float]] = {}
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
                if rid:
                    tmin = _parse_float(entry.get("base_elevation_m"))
                    tmax = _parse_float(entry.get("top_elevation_m"))
                    if tmin is not None and tmax is not None and tmax > tmin:
                        elev_by_id[str(rid)] = (tmin, tmax)
                if not code:
                    continue
                if rid:
                    by_id[str(rid)] = str(code)
                lat = _parse_float(entry.get("lat"))
                lon = _parse_float(entry.get("lon"))
                if lat is not None and lon is not None:
                    geo.append((lat, lon, str(code)))
    except requests.RequestException:
        by_id, geo, elev_by_id = {}, [], {}
    _RESORT_INDEX_CACHE = (by_id, geo, elev_by_id)
    return _RESORT_INDEX_CACHE


def _resolve_country(resort_id: str, weather_id: str, lat: float, lon: float) -> str | None:
    """Country for a coordinate-override resort: exact resort_id hit in the map
    index first (authoritative), else the nearest resort in that same index."""
    by_id, geo, _ = _load_resort_index()
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


def _single_band(payload: dict) -> bool:
    """A payload whose bands lack base/top — what elevation_bands() returns
    ({"mid": None}) when the resort has no usable elevations.

    Refusing to persist these is the one guard that actually closes the class:
    the upsert below replaces the whole payload, so a single-band write both
    flattens a healthy three-band row and mints one nothing can repair — the
    apps decode `bands` as non-null numbers so the row stops decoding, and the
    sweep's own 404 fallback reads the band elevations back out of that very
    payload, recomputing single-band forever. Four writers reach this function
    (two apps, the web client, the sweep); guarding each of them still leaves
    the next one to get it wrong.
    """
    if not isinstance(payload, dict):
        return True
    bands = payload.get("bands")
    if not isinstance(bands, dict):
        return True
    base = bands.get("base")
    top = bands.get("top")
    return not isinstance(base, (int, float)) or not isinstance(top, (int, float))


def _write_cache(resort: dict, payload: dict, summary: dict) -> bool:
    if not WRITE_KEY:
        return False
    if _single_band(payload):
        print(
            f"[short-range] refusing single-band write for "
            f"{resort.get('resort_id')}: bands={payload.get('bands')}"
        )
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


# ---------------------------------------------------------------------------
# Forecast archive (append-only history of what we actually served)
# ---------------------------------------------------------------------------
# `short_range_forecasts` above is a SNAPSHOT keyed by resort_id: the three-days-
# out forecast is overwritten by the one-day-out forecast, so "what did we
# predict for this storm three days out?" is unanswerable from it. This writer
# appends one row per (band, forecast day) per cycle into
# public.short_range_forecast_archive so lead-time skill can be scored later.
#
# It is TELEMETRY: every failure path here returns quietly and the serve
# continues. Nothing in this section may raise into the response path, and
# nothing here may change the forecast or what the snapshot table receives.
#
# KNOWN LIMITATION — COVERAGE IS DRIVEN BY USER TRAFFIC (not fixed here; the
# fix is an operational one, a scheduled sweep, not a code change in this
# handler). This writer only fires on the FRESH-COMPUTE branch of _build(), and
# no cron calls this endpoint. Therefore *which* resorts and *which* 3h cycles
# appear in the archive is a function of who opened the app and when:
#   - a resort nobody views in a given cycle has no row for that cycle;
#   - a resort viewed once at 02:59 and again at 03:01 gets two cycles;
#   - popular resorts are over-represented relative to quiet ones.
# The archive is therefore an unbiased record of WHAT WE SERVED, but a biased
# sample of the resort fleet. Any fleet-wide skill score computed from it must
# be reported per-resort (or re-weighted), never as a single pooled number, and
# gaps must be read as "not served" rather than "no forecast existed".


def _small_int(value: object) -> int | None:
    """Int or None, for the smallint archive columns. Same contract as _num:
    a missing value stays missing. Rejects bool (a Python bool IS an int, and
    True would silently archive as 1) and rejects floats rather than truncating
    — a weather_code that arrived as 71.0 means the producer changed, and that
    should surface as a NULL to investigate, not as a rounded code."""
    if value is None or isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


def _num(value: object) -> float | None:
    """Finite float or None. Never coerces a missing value into 0."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _archive_cycle(payload: dict, now: datetime) -> str:
    """The pipeline CYCLE this compute belongs to, as an ISO timestamp.

    run_init_time is a cycle, not the serve instant — Open-Meteo exposes no
    model init hour, and if every refresh minted its own run_init_time the table
    would fill with near-duplicate rows (one per user who opened the app). The
    compute time is truncated DOWN to a 3-hour UTC boundary (00,03,06,...),
    which is the serving cache TTL, so all refreshes inside one window share a
    cycle and the primary key + ignore-duplicates keeps exactly one row per band
    per forecast day.
    """
    stamp = _parse_iso(payload.get("generated_utc")) or now
    stamp = stamp.astimezone(timezone.utc)
    return stamp.replace(
        hour=stamp.hour - (stamp.hour % ARCHIVE_CYCLE_H),
        minute=0, second=0, microsecond=0,
    ).isoformat()


def _archive_rows(resort_id: str, payload: dict, run_init_time: str) -> tuple[list[dict], int]:
    """(rows, skipped). Rows the archive cannot key or trust are dropped, never
    patched with an invented value — a skipped row is a known hole, a fabricated
    one is a silent lie in the verification series."""
    rows: list[dict] = []
    seen: set[tuple[str, str]] = set()
    skipped = 0
    daily = payload.get("daily")
    daily = daily if isinstance(daily, list) else []  # a str/dict would "iterate"
    if not resort_id:  # NOT NULL primary-key column, and never fabricable
        return rows, len(daily)
    for day in daily:
        if not isinstance(day, dict):
            skipped += 1
            continue
        date = day.get("date")
        band = day.get("band")
        # date and band are primary-key / CHECK columns: no source value, no row.
        if not date or band not in ARCHIVE_BANDS:
            skipped += 1
            continue
        # lead is an INDEX into the resort-LOCAL day sequence (timezone=auto).
        # Never derive it by subtracting dates — a UTC delta is off by one for
        # roughly half the fleet. The payload's day_index is 1-based.
        try:
            lead = int(day["day_index"]) - 1
        except (KeyError, TypeError, ValueError):
            skipped += 1
            continue
        if not 0 <= lead <= 45:  # table CHECK
            skipped += 1
            continue
        key = (band, str(date))
        if key in seen:  # defensive: one row per band per forecast day
            skipped += 1
            continue

        low = _num(day.get("snow_cm_p10"))
        median = _num(day.get("snow_cm_p50"))
        high = _num(day.get("snow_cm_p90"))
        ordered = [v for v in (low, median, high) if v is not None]
        # The table CHECKs non-negative and low <= median <= high. Order
        # statistics always satisfy both; if a payload ever does not, drop that
        # single row rather than let it abort the whole batch (or reorder it,
        # which would silently rewrite the forecast we served).
        if any(v < 0 for v in ordered) or ordered != sorted(ordered):
            skipped += 1
            continue

        seen.add(key)
        rain_risk = day.get("rain_risk")
        n_models = day.get("n_models")
        rows.append({
            "resort_id": resort_id,
            "band": band,
            "valid_date": date,
            "run_init_time": run_init_time,
            # KNOWN LIMITATION — lead_time_days IS NOT UNIQUE per
            # (resort_id, band, run_init_time), and it is NOT part of the
            # primary key. `lead` is the index into the resort-LOCAL day
            # sequence, but the 3h cycle bucket is UTC. When resort-local
            # midnight falls inside a cycle, two computes in the SAME cycle
            # label the SAME valid_date with different leads (the later one
            # smaller), and each also emits one extra day at the tail:
            #   03:10 UTC compute -> valid_date D labelled lead 2
            #   05:50 UTC compute -> valid_date D labelled lead 1  (local rollover)
            # Both carry run_init_time 03:00, so the PK collides and
            # `resolution=ignore-duplicates` keeps the FIRST write — i.e. the
            # STALER (larger) lead label — while the extra tail row inserts
            # cleanly. A schema change (putting the lead in the key, or storing
            # the resort-local anchor date) is out of scope here.
            # => ANY lead-time skill analysis MUST recompute the lead from
            #    run_init_time and the resort-LOCAL date of valid_date, and must
            #    NOT trust this stored label. It is retained as a debugging hint
            #    only. Note also the tail asymmetry: the last valid_date of a
            #    band can exist for some cycles and not others.
            "lead_time_days": lead,
            "band_elevation_m": _num(day.get("elevation_m")),
            "config_version": CONFIG_VERSION,   # NOT NULL — the physics stamp
            "snow_cm_low": low,                 # payload p10: order statistic,
            "snow_cm_median": median,           # not a calibrated quantile —
            "snow_cm_high": high,               # hence low/median/high here
            "snow_cm_native": _num(day.get("snow_cm_model_native")),
            "precip_mm": _num(day.get("precip_mm_p50")),
            "tmean_c": _num(day.get("tmean_c_p50")),
            "freezing_level_m": _num(day.get("freezing_level_m")),
            "rain_risk": bool(rain_risk) if isinstance(rain_risk, bool) else None,
            "n_models": int(n_models) if isinstance(n_models, int) and not isinstance(n_models, bool) else None,
            # Stored as issued, not recomputed later: the tier uses inputs this
            # table does not otherwise carry, so a recomputation is a different
            # function on a subset. NULL on rows written before the columns
            # existed, which must read as "not recorded" and never as a tier.
            "tier": day.get("tier"),
            "tier_reasons": day.get("reasons"),
            "wind_gust_kmh": int(gust) if isinstance((gust := day.get("wind_gust_kmh")), int) and not isinstance(gust, bool) else None,
            # The sky header AS SERVED. Nothing in this database recorded it
            # before 2026-08-16, so v3.1's D1-7 header fix could never be
            # checked on a past date. At D8-16 this is still
            # _weather_code_mode over each model's DAILY code, which ties
            # 1-1-1 with 3-4 models and breaks toward the MAXIMUM — read it as
            # "most severe code any one model produced in any one hour".
            "weather_code": _small_int(day.get("weather_code")),
            # The signed margin that PRODUCED rain_risk and the phase tier
            # demotions. Only the boolean survived before, so a rain/snow miss
            # could not be traced back to the margin that caused it.
            "snow_level_margin_m": _num(day.get("snow_level_margin_m")),
            # Extremes of the SAME series tmean_c came from, so the triple is
            # coherent — but that series changes at the D1-7/D8-16 boundary, so
            # temp_source travels with them and is not optional. An analysis
            # that compares tmin across leads without splitting on it will see a
            # step at day 8 that is a definition change, not weather.
            "tmin_c": _num(day.get("tmin_c_p50")),
            "tmax_c": _num(day.get("tmax_c_p50")),
            "temp_source": day.get("temp_source") or None,
            # Ensemble quantiles over ~103 members. NULL at D1-8 by
            # construction (attach_ensemble starts at ROLLING_FROM_DAY_INDEX)
            # and NULL wherever no ensemble was attached — never 0.0, because
            # "no ensemble" and "an ensemble forecasting no snow" are
            # different facts and _num keeps them apart.
            "ens_cm_p10": _num(day.get("ens_cm_p10")),
            "ens_cm_p50": _num(day.get("ens_cm_p50")),
            "ens_cm_p90": _num(day.get("ens_cm_p90")),
            # Read this before comparing ens_* across rows: the member count
            # moves with lead and with which systems reach that day.
            "ens_members": _small_int(day.get("ens_members")),
            # Only a FRESH compute reaches this writer; a cache hit is the same
            # forecast already recorded.
            "served_cached": False,
        })
    return rows, skipped


def _write_member_diagnostics(payload: object, members: list, fallback_resort_id: str,
                              now: datetime) -> dict:
    """Persist the PER-MODEL members behind each served quantile.

    `short_range_forecast_archive` records what we served; this records what the
    individual models said before p10/p50/p90 folded them together. Without it,
    "which model is systematically the one we zero out?" is unanswerable — and
    unlike observations, a forecast cannot be bought back after the fact.

    Same posture as _write_archive: TELEMETRY. Every failure path returns
    quietly, nothing here may raise into the response, and nothing here may
    change the forecast.
    """
    result: dict = {"status": "error", "rows_submitted": 0, "rows_skipped": 0}
    resort_label = "<unknown>"
    try:
        data = payload if isinstance(payload, dict) else {}
        resort_id = str(data.get("resort_id") or fallback_resort_id or "")
        resort_label = _safe_label(resort_id)
        if not resort_id:  # NOT NULL primary-key column, never fabricable
            result["status"] = "no_rows"
            return result
        if not members:
            result["status"] = "no_rows"
            return result
        if not WRITE_KEY:
            result["status"] = "disabled_no_write_key"
            print("[diagnostics] DISABLED: SUPABASE_SECRET_KEY is not set — per-model "
                  "members are NOT being recorded and cannot be backfilled later "
                  f"(resort {resort_label}, table {DIAGNOSTICS_TABLE})",
                  file=sys.stderr)
            return result

        run_init_time = _archive_cycle(data, now)
        lat = data.get("lat")
        lon = data.get("lon")
        fetched = now.isoformat()
        # Lead label taken from the SAME source the archive uses (day_index - 1),
        # not recomputed from dates. The two tables must agree or they cannot be
        # joined; the caveat documented at _archive_rows (lead is not unique per
        # cycle and must be recomputed for any skill analysis) applies verbatim
        # here too.
        lead_by_key = {
            (str(day.get("band")), str(day.get("date"))): int(day["day_index"]) - 1
            for day in (data.get("daily") or [])
            if isinstance(day, dict) and day.get("day_index") is not None
        }
        rows = []
        skipped = 0
        seen_keys: set = set()
        lat = _num(lat)
        lon = _num(lon)
        if lat is None or lon is None:
            # requested_lat/lon are NOT NULL and never fabricable.
            result["status"] = "no_rows"
            result["rows_skipped"] = len(members)
            return result
        for member in members:
            valid_date = str(member.get("date") or "")
            band_id = str(member.get("band") or "")
            model = member.get("model")
            if not valid_date or not band_id or model is None:
                skipped += 1
                continue
            # ONE row violating the band CHECK makes PostgREST reject the WHOLE
            # batch, so an unknown band must be dropped here rather than cost us
            # every other member for that resort. ARCHIVE_BANDS is the single
            # source of truth and must stay in step with the table CHECK; the
            # skipped count is surfaced, never swallowed, so a band we stop
            # recording shows up instead of quietly vanishing.
            if band_id not in ARCHIVE_BANDS:
                skipped += 1
                continue
            lead = lead_by_key.get((band_id, valid_date))
            if lead is None or not (0 <= lead <= 46):
                skipped += 1
                continue
            # The PK is (run_init_time, resort_id, band_id, model, lead) and
            # ignore-duplicates keeps the FIRST row, so a duplicate inside one
            # batch would silently drop the later member. Dedupe here instead.
            pk = (band_id, model, lead)
            if pk in seen_keys:
                skipped += 1
                continue
            seen_keys.add(pk)
            # NaN/inf serialise to bare NaN/Infinity, which is not valid JSON —
            # PostgREST rejects the WHOLE batch, so one poisoned member would
            # cost every other member in the request. Coerce here, drop the row
            # if the NOT NULL columns cannot be made finite.
            precip = _num(member.get("precip_mm"))
            snow = _num(member.get("snow_cm"))
            native = _num(member.get("native_snow_cm"))
            elev = _num(member.get("band_elevation_m"))
            rain = _num(member.get("rain_candidate_mm"))
            contributing = member.get("contributing_hours")
            hybrid_hours = member.get("hybrid_hours")
            # The counterfactual, not a forecast. Clamped like the served
            # values: a negative here would mean the repartition produced
            # nonsense, and a null records that better than a negative does.
            shadow = _num(member.get("shadow_hybrid_snow_cm"))
            if shadow is not None and shadow < 0:
                shadow = None
            if rain is not None and rain < 0:
                rain = None
            if snow is not None and snow < 0:
                snow = None            # CHECK hybrid_snow_cm >= 0
            if native is not None and native < 0:
                native = None          # CHECK native_snowfall_cm IS NULL OR >= 0
            if precip is not None and precip < 0:
                precip = None          # CHECK precipitation_mm_total >= 0
            # hybrid_applied / fallback_reason are decided in the core, where
            # the hourly loop can actually see whether the wet-bulb step ran.
            # The table CHECKs (fallback_reason IS NULL) = hybrid_applied, so
            # these two travel together and are never re-derived here.
            applied = bool(member.get("hybrid_applied"))
            reason = member.get("fallback_reason")
            if applied != (reason is None):
                # Defensive: a member that cannot satisfy the CHECK is dropped
                # rather than allowed to fail the whole batch.
                skipped += 1
                continue
            rows.append({
                "run_init_time": run_init_time,
                "resort_id": resort_id,
                "band_id": band_id,
                "model": model,
                "lead_time_days": lead,
                "fetched_at": fetched,
                "band_elevation_m": elev,
                "requested_lat": lat,
                "requested_lon": lon,
                # NEVER served. What the wet-bulb repartition would have given
                # past the hourly window, recorded so the question "should the
                # window move out?" can eventually be answered from fleet data
                # instead of from one resort. hybrid_applied stays false and
                # hybrid_snow_cm below still holds what the user actually saw.
                "shadow_hybrid_snow_cm": shadow,
                # NOT NULL columns. An excluded member has no precip of its own
                # to record, so it lands as 0.0 with the reason in
                # fallback_reason — `hybrid_applied=false` plus a reason string
                # is how a non-contributing member is distinguished from a
                # contributing one that genuinely forecast nothing.
                "precipitation_mm_total": precip if precip is not None else 0.0,
                # The SANITISED local, not member[...]: the finiteness coercion
                # and the negative clamp above are the whole point, and a raw
                # NaN here would make PostgREST reject the entire batch.
                "native_snowfall_cm": native,
                # Measured in the hourly loop. NOT NULL, so the daily layer —
                # which has no hourly window to measure — lands 0.0 alongside
                # fallback_reason='outside_hourly_window', which is what says
                # "not measured" rather than "measured as zero".
                "rain_candidate_mm": rain if rain is not None else 0.0,
                "hybrid_hours": hybrid_hours,
                "contributing_hours": contributing,
                "hybrid_snow_cm": float(snow) if snow is not None else 0.0,
                # The table CHECKs (fallback_reason IS NULL) = hybrid_applied,
                # so these two are one decision, not two. hybrid_applied is TRUE
                # only on the D1-7 hourly path, where hybrid_hourly_snow_cm
                # actually ran; every other row must carry a reason, and the
                # reason must be one of the three the table allows
                # (missing_rh / missing_snowfall / model_unavailable).
                "hybrid_applied": applied,
                "fallback_reason": reason,
                # tw_c is the hourly path's wet-bulb. The daily path has no
                # wet-bulb — writing the daily mean temperature here would put a
                # different physical quantity in the column.
                "tw_c": None,
            })
        result["rows_skipped"] = skipped
        if skipped:
            print(f"[diagnostics] {resort_label}: skipped {skipped} member row(s)",
                  file=sys.stderr)
        if not rows:
            result["status"] = "no_rows"
            return result
        response = requests.post(
            f"{SUPABASE_URL}/rest/v1/{DIAGNOSTICS_TABLE}",
            params={"on_conflict": "run_init_time,resort_id,band_id,model,lead_time_days"},
            headers={
                "apikey": WRITE_KEY,
                "Authorization": f"Bearer {WRITE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=ignore-duplicates,return=minimal",
            },
            data=json.dumps(rows),
            timeout=ARCHIVE_TIMEOUT_S,
        )
        response.raise_for_status()
        result["status"] = "ok"
        result["rows_submitted"] = len(rows)
        return result
    except Exception as exc:  # noqa: BLE001 — telemetry must never break a serve
        print(f"[diagnostics] {resort_label}: {_scrub(type(exc).__name__)}", file=sys.stderr)
        return result


def _write_archive(payload: object, fallback_resort_id: str, now: datetime) -> dict:
    """Best-effort append into the forecast archive. NEVER raises — the serve
    must not depend on telemetry.

    Returns a status dict, reported verbatim in the response body:
      status         "ok" | "no_rows" | "disabled_no_write_key" | "error"
      rows_submitted rows SENT to PostgREST. NOT an insert count — see below.
      rows_skipped   daily entries the archive refused to key or trust.

    ROWS_SUBMITTED IS NOT ROWS INSERTED. The request below carries
    `Prefer: resolution=ignore-duplicates,return=minimal`, so PostgREST replies
    201 with an empty body whether it inserted every row or none of them: a
    second FRESH compute inside the same 3h cycle re-sends its full row set,
    inserts nothing (PK collision -> DO NOTHING), and would still report its
    full count. The field is therefore NAMED for what it measures rather than
    made exact — chosen deliberately over adding `count=exact`, because the
    claim "PostgREST's exact count on an ON CONFLICT DO NOTHING insert equals
    rows actually inserted" cannot be verified from here without writing to the
    live database. Treat this number as "the writer ran and submitted N rows",
    i.e. a liveness signal, never as archive growth. Real insert counts come
    from counting rows in short_range_forecast_archive itself.
    """
    result: dict = {"status": "error", "rows_submitted": 0, "rows_skipped": 0}
    resort_label = "<unknown>"
    try:
        # Resolved INSIDE the guard on purpose: the caller passes the raw
        # payload, and a payload that is not a dict (or lacks resort_id) must
        # degrade to a quiet telemetry miss, never raise into the response path.
        data = payload if isinstance(payload, dict) else {}
        resort_id = str(data.get("resort_id") or fallback_resort_id or "")
        resort_label = _safe_label(resort_id)

        if not WRITE_KEY:
            # Serving stays degraded-not-broken (same posture as _write_cache),
            # but this must NOT be silent: lost history is unrecoverable, so a
            # writer disabled by a renamed/rotated/unset key is the one failure
            # mode this pipeline cannot afford to hide. One clear line per
            # fresh compute, and the same signal in the response body.
            result["status"] = "disabled_no_write_key"
            print("[archive] DISABLED: SUPABASE_SECRET_KEY is not set — forecast "
                  "history is NOT being recorded and cannot be backfilled later "
                  f"(resort {resort_label}, table {ARCHIVE_TABLE})",
                  file=sys.stderr)
            return result

        run_init_time = _archive_cycle(data, now)
        rows, skipped = _archive_rows(resort_id, data, run_init_time)
        result["rows_skipped"] = skipped
        if skipped:
            print(f"[archive] {resort_label}: skipped {skipped} unusable daily row(s)",
                  file=sys.stderr)
        if not rows:
            result["status"] = "no_rows"
            return result
        response = requests.post(
            f"{SUPABASE_URL}/rest/v1/{ARCHIVE_TABLE}",
            # Append-only: a second refresh in the same cycle is a no-op, it does
            # not overwrite the row that recorded what we first served.
            params={"on_conflict": "resort_id,band,valid_date,run_init_time"},
            headers={
                "apikey": WRITE_KEY,
                "Authorization": f"Bearer {WRITE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=ignore-duplicates,return=minimal",
            },
            data=json.dumps(rows),
            timeout=ARCHIVE_TIMEOUT_S,
        )
        response.raise_for_status()
        result["status"] = "ok"
        result["rows_submitted"] = len(rows)
        return result
    except Exception as exc:  # noqa: BLE001 — telemetry must never break a serve
        # NEVER interpolate the exception itself. A credential carrying a
        # trailing newline makes the HTTP stack raise with the key VERBATIM in
        # the message; _safe_detail() drops that class of message entirely and
        # scrubs whatever else it lets through against the CURRENT env values.
        result["status"] = "error"
        print(f"[archive] write failed for {resort_label}: {_safe_detail(exc)}",
              file=sys.stderr)
        return result


def _fetch_resort_metadata(requested_id: str, weather_id: str) -> dict | None:
    """Resolve elev/country metadata from snow_outlook_resorts (still slug-keyed)."""
    if not (requested_id.startswith("osm-") or requested_id.startswith("manual-")):
        return core.fetch_resort(requested_id)
    # OSM/manual request: reverse map to curated slug(s). Several slugs can
    # point at the same OSM id (cardrona AND cardrona_alpine_resort →
    # osm-way-482928467); the old `{osm: slug}` comprehension silently kept
    # whichever slug iterated last, so which curated row answered depended on
    # JSON file order. Resolve the collision on data, deterministically: fetch
    # every candidate and keep the row with the HIGHEST base_elevation_m.
    # Duplicate rows disagree precisely because one of them recorded the
    # terrain minimum as its "base" (cardrona: 1260 ≈ polygon min, against the
    # 1670 m base area) — and a base AREA is never below the terrain minimum.
    # Ties keep the alphabetically first slug. Collisions are rare, so the
    # extra fetch happens on almost no resort.
    candidates = sorted(
        slug for slug, osm in slug_map.load_slug_to_osm().items() if osm == weather_id
    )
    best: dict | None = None
    best_base = float("-inf")
    for slug in candidates:
        row = core.fetch_resort(slug)
        if not row:
            continue
        base = row.get("base_elevation_m")
        base_val = float(base) if isinstance(base, (int, float)) else float("-inf")
        if best is None or base_val > best_base:
            best, best_base = row, base_val
    return best


def _terrain_extent(weather_id: str) -> dict:
    """How low and high the skiable ground actually goes, from the map index —
    every one of its 3,466 resorts carries it, so this works for a resort the
    user just searched as well as for a curated one.

    Kept separate from the curated seed's base/top because they measure
    different things: the seed's base is the BASE AREA (lodge, bottom station),
    the index's is the polygon's lowest ground. Where a resort's terrain runs
    well below its base area — Cardrona: base area 1670 m, lifts and pistes
    down to 1259 m — a forecast built only from the base area silently drops
    the band where the rain/snow line most often sits.

    Returns {} when the index has nothing for this id, which leaves the
    existing three-band behaviour exactly as it was.
    """
    _, _, elev_by_id = _load_resort_index()
    pair = elev_by_id.get(weather_id)
    if not pair:
        return {}
    return {"terrain_min_m": pair[0], "terrain_max_m": pair[1]}


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

    if resort_override:
        # The override's base_m is the map index's figure, which for some
        # resorts IS the terrain minimum (Cardrona: 1259 m, the lowest piste,
        # against a 1670 m base area) — and with base == terrain_min the `low`
        # band can never trigger, no matter how far the terrain runs below the
        # real base area. When a curated row exists for this weather id and
        # publishes a HIGHER base, adopt it as the base area; coordinates and
        # top stay the caller's. Max, not replace: some curated rows carry the
        # polygon minimum as their base (treble_cone: 1260 against the index's
        # 1400), and lowering the base would cost that resort its low band.
        curated = _fetch_resort_metadata(weather_id, weather_id)
        curated_base = (curated or {}).get("base_elevation_m")
        override_base = resort.get("base_elevation_m")
        override_top = resort.get("top_elevation_m")
        if (
            isinstance(curated_base, (int, float))
            and isinstance(override_base, (int, float))
            and float(curated_base) > float(override_base)
            and (not isinstance(override_top, (int, float))
                 or float(curated_base) < float(override_top))
        ):
            resort = {**resort, "base_elevation_m": float(curated_base)}

    resort = {**resort, "resort_id": weather_id, **_terrain_extent(weather_id)}
    payload = core.compute_forecast(resort)
    # Split the per-model audit rows off IMMEDIATELY. Everything downstream —
    # summary, cache write, archive write, HTTP response — sees the payload it
    # has always seen; `_members` must never reach the payload jsonb the apps
    # decode, and must never widen the client contract.
    members: list = []
    if isinstance(payload, dict):
        payload = {**payload, "resort_id": weather_id}
        members = payload.pop("_members", None) or []
    summary = core.build_summary(payload)
    try:
        wrote = _write_cache(resort, payload, summary)
    except requests.RequestException:
        wrote = False

    # Fresh compute only — append it to the history table before returning. This
    # is the branch a cache hit never reaches, which is exactly right: a cache
    # hit is the same forecast this write already recorded. Best-effort by
    # construction: _write_archive swallows everything, including the resolution
    # of the archive key from `payload`, which is why the raw payload (not
    # payload.get(...)) is what crosses into it.
    archive = _write_archive(payload, weather_id, now)
    diagnostics = _write_member_diagnostics(payload, members, weather_id, now)

    return 200, {
        "resort_id": weather_id,
        "cached": False,
        "cache_written": wrote,
        # SUBMITTED, not inserted (ignore-duplicates + return=minimal cannot
        # tell them apart) — see _write_archive. Do not chart this as archive
        # growth. `archive_status` is the writer's liveness signal:
        # "disabled_no_write_key" means history is being lost right now.
        "archive_status": archive["status"],
        "archive_rows_submitted": archive["rows_submitted"],
        "archive_rows_skipped": archive["rows_skipped"],
        "diagnostics_status": diagnostics["status"],
        "diagnostics_rows_submitted": diagnostics["rows_submitted"],
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
            # str(exc) is NOT safe here. _write_cache/_read_cache guard only
            # `requests.RequestException`, but a key with a trailing "\n" makes
            # http.client raise a PLAIN ValueError quoting the Authorization
            # header — credential and all — which lands right here and would be
            # served to the public over HTTP. Type + scrubbed/withheld message.
            return self._send(502, {"error": "compute_failed",
                                    "detail": _safe_detail(exc)})
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
