"""Daily measured snow station sync (Vercel cron worker).

GET /api/update-snow-stations

Pulls the latest readings from public mountain observation networks and does two
independent things with them:

  1. SNAPSHOT — upserts one row per station into `public.snow_stations`
     (on_conflict=station_id). This is the serving path: `_short_range_core.
     fetch_nearby_station` reads it for the measured depth anchor. Unchanged.
  2. ARCHIVE  — appends every reading to `public.snow_station_observations`
     (on_conflict=station_id,observed_at, ignore-duplicates). The snapshot
     overwrites itself daily, so without this table there is no observation
     history to calibrate the forecast against.

Sources:

  - US SNOTEL (USDA AWDB REST, ~900 stations): station metadata + one wildcard
    daily call PER ELEMENT for SNWD (depth), WTEQ (snow water equivalent) and
    PREC (accumulated precipitation). Inches → cm / mm, feet → m.
  - Swiss SLF IMIS (~200 high-alpine stations): one bulk measurements call
    (a rolling ~24 h window at ~30 min sampling, HS in cm) + one stations call
    (lat/lon/elevation). The snapshot takes the latest HS per station; the
    archive takes the whole window — see `_rows_slf`.
  - Japan JMA AMeDAS (~300 snow-measuring stations): latest map JSON (all
    stations' current obs; `snow` = depth cm, present only in winter) + the
    station table (deg/min arrays → decimal degrees, alt m).

WHY THREE SNOTEL CALLS AND NOT ONE MULTI-ELEMENT CALL
-----------------------------------------------------------------------------
The AWDB data endpoint accepts `elements=WTEQ,SNWD,PREC` only when the station
triplet is explicit. With the `*:*:SNTL` wildcard this worker relies on, any
multi-element request is rejected with HTTP 400 (verified live 2026-07-29,
including the repeated-parameter form). So each element gets its own wildcard
call and they are merged here by (stationTriplet, date). The three calls run
concurrently, so wall time is that of the slowest single call (~15-20 s) rather
than their sum.

Responses also do NOT come back in the requested element order (a multi-element
request returned PRCP, SNWD, WTEQ), so blocks are matched on
`stationElement.elementCode` and never by position.

PREC, NOT PRCP, FILLS precip_accum_mm
-----------------------------------------------------------------------------
These are two different SNOTEL elements and only one of them matches the
column. Verified live on 335:CO:SNTL over 2024-11-01..2025-04-30:

    PREC  accumulated precipitation — monotonically non-decreasing,
          1.8 in → 28.2 in over the season. derivedData=false.
    PRCP  precipitation INCREMENT — a per-day delta, not monotonic,
          max 1.2 in, summing to 26.4 in. derivedData=true.

The cross-check closes exactly: 28.2 − 1.8 = 26.4. `precip_accum_mm` is
documented as season-cumulative and as something you DIFFERENCE consecutive
rows of to get an interval total, which is true of PREC and meaningless for
PRCP. Writing PRCP there would put per-day deltas in a column everyone will
difference, so this worker sends PREC. The increment stays recoverable by
differencing; the reverse (rebuilding an accumulation from increments across
runs that may have gaps) is not reliably possible.

WHY DEPTH IS NOT ENOUGH
-----------------------------------------------------------------------------
Depth is not what the pipeline forecasts. A depth delta is new snow minus
settlement, melt, wind loss and sublimation. WTEQ and PRCP are the honest
comparison targets, which is why the archive carries them.

Each adapter is independent — one network failing (or, like AMeDAS in summer,
reporting nothing) degrades coverage, never the run. The archive write is
best-effort on top of that: it can never fail the snapshot upsert or the
response.

Writes require SUPABASE_SECRET_KEY. When Vercel's CRON_SECRET is configured the
endpoint only accepts requests carrying it (cron sends it automatically).
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from html import unescape
from http.server import BaseHTTPRequestHandler

import requests

SUPABASE_URL = (
    os.environ.get("SUPABASE_URL")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    or "https://ryiitcblrrqvjvxkobpf.supabase.co"
)
WRITE_KEY = os.environ.get("SUPABASE_SECRET_KEY")
TABLE = "snow_stations"
OBSERVATIONS_TABLE = "snow_station_observations"
TIMEOUT_S = 50

# Archive writes are chunked so one oversized POST cannot stall the run, and are
# bounded by a deadline so a slow archive can never push the function past its
# 60 s maxDuration and take the (already-completed) snapshot upsert with it.
#
# THE DEADLINE IS ENFORCED THROUGH THE TIMEOUT, NOT JUST CHECKED BEFORE IT
# -----------------------------------------------------------------------------
# Checking the clock before each POST bounds when a chunk STARTS, which is not
# what the deadline is for. With a fixed 30 s socket timeout a chunk starting at
# 49.9 s could still return at 79.9 s — past the 60 s maxDuration in vercel.json,
# which kills the function mid-write. So each POST's timeout is clamped to the
# time actually left (`min(ARCHIVE_POST_TIMEOUT_S, deadline - now)`) and a chunk
# is not started below ARCHIVE_MIN_POST_S. Every POST therefore ENDS by
# ARCHIVE_DEADLINE_S, not merely starts before it, leaving 10 s of maxDuration
# headroom to serialise the response. Verified against a mocked server that burns
# its entire allotted timeout on every chunk: the run ends at exactly 50.0 s.
#
# Residual caveat, stated rather than hidden: requests' read timeout is per
# socket read, not a total-time cap, so a server trickling one byte at a time
# could still outlive the budget. Nothing short of a watchdog thread fixes that,
# and it is not a failure mode Supabase exhibits.
#
# CHUNK SIZE vs THE POST-FIX-1 VOLUME
# -----------------------------------------------------------------------------
# Measured live 2026-07-29: imis ~6.1k rows (summer; ~9.5k when snow-depth
# sensors are in service), snotel ~2.7k, amedas 0 out of season (~300 in winter)
# => ~8.9k rows/run now, ~12.5k at winter peak, against ~200+2.7k before FIX 1.
# At 500 rows/chunk that is 18-25 round trips. 1,000 keeps each body at 266 KB
# average / 303 KB worst (measured) — small for PostgREST — and halves the round
# trips to 9-13, which is what actually costs time here: the function (sin1) and
# the database (Singapore) are co-located, so per-chunk latency is dominated by
# the round trip, not the insert.
#
# Budget check against the real run (measured live, POSTs mocked): the three
# adapters fetch sequentially in ~22.9 s, so the archive starts with ~27 s of the
# 50 s deadline left and needs ~3.5 s for 10 chunks. Winter peak (~13 chunks)
# still fits with ~22 s to spare. The larger volume did NOT eat the budget.
ARCHIVE_CHUNK = 1000
ARCHIVE_DEADLINE_S = 50.0
ARCHIVE_POST_TIMEOUT_S = 30.0   # per-chunk cap when the budget is not the binding one
# The floor is sized to what a chunk actually needs (~0.35 s measured in-region
# for a 300 KB body), not to a round number. Too low starts POSTs that cannot
# finish; too HIGH is the worse error here — it strands the tail of the budget
# and, for IMIS, those rows are gone permanently rather than merely late. 2 s is
# ~6x the observed per-chunk cost. A POST that does time out is not a corruption
# risk: the insert may still commit server-side, and ignore-duplicates makes the
# next run's re-submission a no-op.
ARCHIVE_MIN_POST_S = 2.0
ARCHIVE_CONNECT_TIMEOUT_S = 5.0
# Unbackfillable networks first, on purpose. The SLF endpoint is a rolling ~24 h
# window and AIC publishes no history for its snow stations at all, so a row not
# archived today is gone permanently for either. SNOTEL is backfillable from the
# AWDB REST API, so it is the safe one to lose to a deadline.
ARCHIVE_PRIORITY = ("aic", "imis", "amedas", "snotel")

SNOTEL_STATIONS_URL = "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/stations"
SNOTEL_DATA_URL = "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data"
SLF_STATIONS_URL = "https://measurement-api.slf.ch/public/api/imis/stations"
SLF_MEASUREMENTS_URL = "https://measurement-api.slf.ch/public/api/imis/measurements"
JMA_LATEST_TIME_URL = "https://www.jma.go.jp/bosai/amedas/data/latest_time.txt"
JMA_MAP_URL = "https://www.jma.go.jp/bosai/amedas/data/map/{stamp}.json"
JMA_META_URL = "https://www.jma.go.jp/bosai/amedas/const/amedastable.json"
AIC_STATIONS_URL = "https://www.aic.gob.ar/estaciones"
OPEN_METEO_ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"

IN_TO_CM = 2.54
IN_TO_MM = 25.4


class ArchiveStats:
    """Per-source archive accounting, surfaced in the response.

    A silently failing archive is the exact failure mode this table exists to
    prevent, so every count is reported even when it is zero — and every reading
    the adapter sees ends up in exactly one bucket. Nothing is dropped silently.

    Field units are deliberately explicit in the names, because two of these
    count different things and used to be confusable:

      * `negative_fields_dropped` counts individual VALUES, so one row with a
        negative depth and a negative SWE adds 2.
      * `rows_with_negative_field` counts ROWS, so that same row adds 1.

    Overlaps that are intentional and not double-counting bugs:

      * a row whose only value was negative is nulled out and then lands in
        `skipped_no_value` as well — it is one reading, counted once per stage
        it failed.
      * `skipped_no_value` is large and boring for IMIS: SLF returns a row per
        station per 30 min including stations with no snow-depth sensor at all,
        and only HS maps to a column here. Those rows are unstorable, not lost.
    """

    def __init__(self) -> None:
        self.collected = 0                 # rows built and eligible for the archive
        self.skipped_no_timestamp = 0      # no station timestamp → observed_at is NOT NULL
        self.skipped_no_value = 0          # all of depth/swe/precip null → CHECK would reject
        self.dropped_no_station_meta = 0   # reading with no station row (lat/lon are NOT NULL)
        self.negative_fields_dropped = 0   # individual impossible values nulled (per FIELD)
        self.rows_with_negative_field = 0  # rows that lost >=1 field that way (per ROW)
        self.rows_submitted = 0            # rows POSTed and accepted — NOT rows inserted
        self.error: str | None = None

    def as_dict(self) -> dict:
        return {
            "collected": self.collected,
            "rows_submitted": self.rows_submitted,
            "skipped_no_timestamp": self.skipped_no_timestamp,
            "skipped_no_value": self.skipped_no_value,
            "dropped_no_station_meta": self.dropped_no_station_meta,
            "negative_fields_dropped": self.negative_fields_dropped,
            "rows_with_negative_field": self.rows_with_negative_field,
            "error": self.error,
        }


def _observation(station_id: str, source: str, observed_at, *, name, lat, lon,
                 elevation_m, stats: ArchiveStats,
                 depth_cm=None, swe_mm=None, precip_accum_mm=None,
                 precip_daily_mm=None) -> dict | None:
    """Build one archive row, or None if it cannot legally be stored.

    Values arrive UNROUNDED, already converted into the column's unit. Rounding
    happens HERE, after validation, and that order matters: rounding first turns
    a -0.4 cm sensor fault into a stored 0, which passes every CHECK and reads
    downstream as a genuine "no snow" observation. Validate, then round.

    Never fabricates a value to satisfy a constraint: a reading with no station
    timestamp is dropped (observed_at is NOT NULL and is part of the primary
    key), and negative depth/SWE/precip are dropped as impossible rather than
    clamped — one such row would fail the CHECK and take the whole batch with
    it. If nothing survives, the row itself is dropped.
    """
    if not observed_at:
        stats.skipped_no_timestamp += 1
        return None

    negative_fields = 0

    def valid(value):
        """Reject before rounding. Counts FIELDS; the row tally is done once,
        below, so a row with two bad sensors is still one row."""
        nonlocal negative_fields
        if value is None:
            return None
        if value < 0:                      # sensor fault; not a real reading
            negative_fields += 1
            return None
        return value

    depth_cm, swe_mm = valid(depth_cm), valid(swe_mm)
    precip_accum_mm, precip_daily_mm = valid(precip_accum_mm), valid(precip_daily_mm)
    if negative_fields:
        stats.negative_fields_dropped += negative_fields
        stats.rows_with_negative_field += 1

    if (depth_cm is None and swe_mm is None
            and precip_accum_mm is None and precip_daily_mm is None):
        stats.skipped_no_value += 1
        return None

    stats.collected += 1
    return {
        "station_id": station_id,
        "observed_at": observed_at,
        "source": source,
        "name": name,
        "lat": lat,
        "lon": lon,
        "elevation_m": elevation_m,
        # depth_cm is an INTEGER column; swe/precip are double precision and
        # keep 2 dp, which is finer than either sensor's real resolution.
        "depth_cm": None if depth_cm is None else round(depth_cm),
        "swe_mm": None if swe_mm is None else round(swe_mm, 2),
        "precip_accum_mm": None if precip_accum_mm is None else round(precip_accum_mm, 2),
        # A day's total, NOT an accumulator. These two never both apply to one
        # network: differencing precip_daily_mm is meaningless (it resets daily),
        # and reading precip_accum_mm as a day's total is off by a whole season.
        "precip_daily_mm": None if precip_daily_mm is None else round(precip_daily_mm, 2),
        "ingest_source": "live",
    }


def _snotel_stations() -> dict[str, dict]:
    meta = requests.get(
        SNOTEL_STATIONS_URL,
        params={"stationTriplets": "*:*:SNTL", "activeOnly": "true"},
        timeout=TIMEOUT_S,
    )
    meta.raise_for_status()
    return {
        s["stationTriplet"]: s
        for s in meta.json()
        if s.get("latitude") is not None and s.get("longitude") is not None
    }


def _snotel_element(element: str, begin: str, end: str) -> dict[str, dict[str, float]]:
    """One wildcard daily call for a single element → {triplet: {date: value}}.

    Matches blocks on elementCode rather than position: the API does not return
    blocks in request order, and with the wildcard it only ever accepts one
    element anyway.
    """
    response = requests.get(
        SNOTEL_DATA_URL,
        params={
            "stationTriplets": "*:*:SNTL",
            "elements": element,
            "beginDate": begin,
            "endDate": end,
            "duration": "DAILY",
        },
        timeout=TIMEOUT_S,
    )
    response.raise_for_status()

    series: dict[str, dict[str, float]] = {}
    for entry in response.json():
        triplet = entry.get("stationTriplet")
        if not triplet or triplet in series:
            continue
        for block in entry.get("data") or []:
            if ((block.get("stationElement") or {}).get("elementCode")) != element:
                continue
            values = {
                v["date"]: float(v["value"])
                for v in block.get("values") or []
                if v.get("value") is not None and v.get("date")
            }
            if values:
                series[triplet] = values
            break                       # first matching block wins, as before
    return series


def _rows_snotel() -> tuple[list[dict], list[dict], ArchiveStats]:
    """SNOTEL snapshot rows (latest daily depth) and archive rows (every day in
    the window, with SWE and accumulated precip alongside depth).

    The archive keeps EVERY day the window returned, not just the latest one.
    The snapshot only ever needs the newest reading, but the window overlaps
    across runs, so archiving all of it means a single missed run loses nothing
    — and the rows cost nothing, since the primary key makes a repeat a no-op.

    SNWD drives the snapshot and is required. WTEQ and PREC are enrichment: if
    either call fails the snapshot is unaffected and those archive columns are
    simply null.
    """
    today = datetime.now(tz=timezone.utc).date()
    begin, end = (today - timedelta(days=3)).isoformat(), today.isoformat()

    with ThreadPoolExecutor(max_workers=4) as pool:
        meta_future = pool.submit(_snotel_stations)
        element_futures = {
            element: pool.submit(_snotel_element, element, begin, end)
            for element in ("SNWD", "WTEQ", "PREC")
        }
        by_triplet = meta_future.result()
        series: dict[str, dict[str, dict[str, float]]] = {}
        for element, future in element_futures.items():
            try:
                series[element] = future.result()
            except Exception:           # noqa: BLE001
                if element == "SNWD":   # the snapshot depends on it — let it raise
                    raise
                series[element] = {}

    depth, swe, precip = series["SNWD"], series["WTEQ"], series["PREC"]
    stats = ArchiveStats()
    snapshot: list[dict] = []
    archive: list[dict] = []

    for triplet in set(depth) | set(swe) | set(precip):
        station_depth = depth.get(triplet, {})
        station_swe = swe.get(triplet, {})
        station_precip = precip.get(triplet, {})

        station = by_triplet.get(triplet)
        if not station:                 # lat/lon are NOT NULL in both tables
            # Not silent: a station that reports data but is absent from the
            # metadata call (retired mid-window, or a failed metadata fetch)
            # loses every reading it had, so count the READINGS, not the station.
            stats.dropped_no_station_meta += len(
                set(station_depth) | set(station_swe) | set(station_precip)
            )
            continue

        elevation_ft = station.get("elevation")
        elevation_m = round(float(elevation_ft) * 0.3048, 1) if elevation_ft is not None else None
        name = station.get("name")
        lat, lon = float(station["latitude"]), float(station["longitude"])
        station_id = f"sntl:{triplet}"

        # --- snapshot: unchanged behaviour (latest non-null daily depth) -----
        if station_depth:
            latest_date = max(station_depth)
            snapshot.append({
                "station_id": station_id,
                "source": "snotel",
                "name": name,
                "lat": lat,
                "lon": lon,
                "elevation_m": elevation_m,
                "depth_cm": round(station_depth[latest_date] * IN_TO_CM),  # inches → cm
                "asof": f"{latest_date}T12:00:00Z",   # daily value, nominal midday
            })

        # --- archive: every day we were given, not just the latest -----------
        for date in sorted(set(station_depth) | set(station_swe) | set(station_precip)):
            raw_depth = station_depth.get(date)
            raw_swe = station_swe.get(date)
            raw_precip = station_precip.get(date)
            # Converted but NOT rounded — _observation validates first, so a
            # negative reading cannot round its way into a stored zero.
            row = _observation(
                station_id, "snotel", f"{date}T12:00:00Z",
                name=name, lat=lat, lon=lon, elevation_m=elevation_m, stats=stats,
                depth_cm=raw_depth * IN_TO_CM if raw_depth is not None else None,
                swe_mm=raw_swe * IN_TO_MM if raw_swe is not None else None,
                precip_accum_mm=raw_precip * IN_TO_MM if raw_precip is not None else None,
            )
            if row:
                archive.append(row)

    return snapshot, archive, stats


def _rows_slf() -> tuple[list[dict], list[dict], ArchiveStats]:
    """SLF IMIS: snapshot = latest HS per station; archive = the ENTIRE window.

    IMIS publishes no SWE or precipitation, so those archive columns stay null.

    THE ARCHIVE TAKES EVERY ROW, NOT THE REDUCTION
    -------------------------------------------------------------------------
    One `measurements` call returns a rolling ~24 h window at ~30 min sampling:
    9,530 rows across 203 stations, of which 6,084 carry an HS value (measured
    live 2026-07-29, mid-summer; the HS share rises in winter as snow-depth
    sensors come back into service). Reducing that to one row per station — the
    shape the SNAPSHOT needs — keeps ~200 rows and discards ~97% of them.

    That discard is unrecoverable in a way no other source here is. SLF serves
    no history whatsoever: what is not captured while it sits in the rolling
    window is gone permanently, unlike SNOTEL which can be refetched from AWDB
    for whole seasons. So the reduction happens for the snapshot ONLY, and the
    archive is built from the raw payload.

    The cost of keeping it all is close to zero: the primary key is
    (station_id, observed_at), each measure_date is distinct per station, and
    the write uses ON CONFLICT DO NOTHING — so a re-run, an overlapping window
    or a retry re-submits rows that the server simply ignores.

    The two paths are kept as separate passes on purpose. The snapshot pass is
    unchanged, so `snow_stations` — which `_short_range_core.fetch_nearby_station`
    serves from — receives exactly what it received before.
    """
    stations = requests.get(SLF_STATIONS_URL, timeout=TIMEOUT_S)
    stations.raise_for_status()
    meta = {s["code"]: s for s in stations.json() if s.get("lat") and s.get("lon")}

    measurements = requests.get(SLF_MEASUREMENTS_URL, timeout=TIMEOUT_S)
    measurements.raise_for_status()
    readings = measurements.json()

    # --- snapshot: unchanged. Latest non-null HS per station. ----------------
    latest: dict[str, dict] = {}
    for row in readings:
        if row.get("HS") is None:
            continue
        code = row.get("station_code")
        stamp = row.get("measure_date") or ""
        if code and (code not in latest or stamp > (latest[code].get("measure_date") or "")):
            latest[code] = row

    snapshot: list[dict] = []
    for code, row in latest.items():
        station = meta.get(code)
        if not station:
            continue
        snapshot.append({
            "station_id": f"imis:{code}",
            "source": "imis",
            "name": station.get("label"),
            "lat": float(station["lat"]),
            "lon": float(station["lon"]),
            "elevation_m": station.get("elevation"),
            "depth_cm": round(float(row["HS"])),           # HS already cm
            "asof": row.get("measure_date"),
        })

    # --- archive: every station, every timestamp the window gave us ----------
    stats = ArchiveStats()
    archive: list[dict] = []
    for row in readings:
        code = row.get("station_code")
        station = meta.get(code) if code else None
        if not station:                 # lat/lon are NOT NULL in both tables
            stats.dropped_no_station_meta += 1
            continue
        hs = row.get("HS")
        # HS-less rows still go through _observation so they are COUNTED
        # (skipped_no_value) rather than vanishing: many IMIS stations are
        # wind/temperature sites with no snow-depth sensor, and only HS maps to
        # a column in this table.
        observation = _observation(
            f"imis:{code}", "imis", row.get("measure_date"),
            name=station.get("label"),
            lat=float(station["lat"]), lon=float(station["lon"]),
            elevation_m=station.get("elevation"), stats=stats,
            depth_cm=float(hs) if hs is not None else None,   # unrounded, cm
        )
        if observation:
            archive.append(observation)

    return snapshot, archive, stats


def _rows_amedas() -> tuple[list[dict], list[dict], ArchiveStats]:
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
    stats = ArchiveStats()
    snapshot: list[dict] = []
    archive: list[dict] = []
    for station_id, ob in obs.json().items():
        snow = (ob or {}).get("snow")
        if not isinstance(snow, list) or not snow or snow[0] is None:
            continue
        # A station reporting snow that we cannot place is a lost reading, not a
        # non-event — both of these joins are counted. (Stations with no `snow`
        # field at all are skipped above without a counter: that is the normal
        # off-season state of most of the ~1,300-station network, not a drop.)
        station = meta_by_id.get(station_id)
        if not station:
            stats.dropped_no_station_meta += 1
            continue
        lat_dm, lon_dm = station.get("lat"), station.get("lon")
        if not lat_dm or not lon_dm:
            stats.dropped_no_station_meta += 1
            continue
        name = station.get("kjName") or station.get("enName")
        lat = lat_dm[0] + lat_dm[1] / 60.0
        lon = lon_dm[0] + lon_dm[1] / 60.0
        depth_cm = round(float(snow[0]))                   # cm
        snapshot.append({
            "station_id": f"amedas:{station_id}",
            "source": "amedas",
            "name": name,
            "lat": lat,
            "lon": lon,
            "elevation_m": station.get("alt"),
            "depth_cm": depth_cm,
            "asof": asof,
        })
        observation = _observation(
            f"amedas:{station_id}", "amedas", asof,
            name=name, lat=lat, lon=lon, elevation_m=station.get("alt"),
            stats=stats, depth_cm=float(snow[0]),   # unrounded; validated first
        )
        if observation:
            archive.append(observation)

    return snapshot, archive, stats


def _aic_terrain_elevations(points: list[tuple[float, float]]) -> dict[tuple[float, float], float]:
    """Ground elevation for AIC sites, from a DEM — NOT the station's surveyed height.

    AIC does not publish station elevation anywhere on the map or the station
    list, and without it a reading cannot be placed against a forecast band: our
    Andean bands span roughly 1,400-1,850 m and a station 500 m below the base
    band is a different climate, not a validation of it.

    So elevation is looked up from Open-Meteo's DEM at the station coordinate.
    That is terrain height at a grid cell, which is NOT the same quantity as a
    surveyed instrument elevation: it carries the DEM's own error, and in steep
    terrain the cell average can sit well off the actual mast.

    HOW FAR OFF, MEASURED
    -------------------------------------------------------------------------
    Two AIC stations put their true height in their own name, which makes them
    an accidental control. Run 2026-08-01:

        CERRO CASA QUILA (1600)   DEM 1571 m    -29 m
        CERRO CASA QUILA (1800)   DEM 1652 m   -148 m

    Both low, one badly so, and the two sites are 300 m apart horizontally. So
    treat these numbers as good enough to say which forecast band a station
    belongs near, and not good enough to lapse-rate a temperature with or to
    call a 100 m disagreement meaningful. Every row records that the value is
    DEM-derived, so the whole set can be replaced the day AIC supplies surveyed
    figures — which is one of the things the Part 5 data request asks for.

    A failure here degrades to NULL elevation, exactly the state before this
    function existed; it must never sink the archive write.
    """
    if not points:
        return {}
    try:
        response = requests.get(
            OPEN_METEO_ELEVATION_URL,
            params={"latitude": ",".join(f"{lat:.6f}" for lat, _ in points),
                    "longitude": ",".join(f"{lon:.6f}" for _, lon in points)},
            timeout=TIMEOUT_S,
        )
        response.raise_for_status()
        heights = response.json().get("elevation") or []
    except Exception:  # noqa: BLE001 — elevation is an enrichment, never a gate
        return {}
    if len(heights) != len(points):
        # A partial response cannot be aligned to inputs positionally without
        # risking one station's height being written onto another's row.
        return {}
    return {point: height for point, height in zip(points, heights) if height is not None}


def _aic_elevation(lat: float, lon: float, elevations: dict) -> float | None:
    return elevations.get((lat, lon))


def _rows_aic() -> tuple[list[dict], list[dict], ArchiveStats]:
    """Argentine AIC — the first snow-water-equivalent network in the fleet's
    southern hemisphere, and the only one sitting ON our resorts.

    AIC (Autoridad Interjurisdiccional de las Cuencas de los rios Limay, Neuquen
    y Negro) runs ~97 hydrometeorological stations across northern Patagonia.
    Twelve report `Equivalente Agua Nieve` (snow water equivalent) and three of
    those are effectively on a resort we serve — Cerro Chapelco 0.0 km, Caviahue
    0.1 km, Batea Mahuida 0.0 km — with Cerro Nevado 31 km from Catedral.

    WHY THIS NETWORK MATTERS MORE THAN ITS SIZE
    -------------------------------------------------------------------------
    SWE is the measurement that separates our two error sources. A depth report
    cannot tell "we predicted the wrong amount of water" from "we predicted the
    wrong density", and until this adapter every southern-hemisphere resort had
    neither. Measured 2026-07-29: 53 of 55 serving resorts had no station within
    50 km, New Zealand and the Andes had zero.

    THERE IS NO HISTORY ENDPOINT — TODAY'S READ IS THE ONLY READ
    -------------------------------------------------------------------------
    The public site exposes per-station history for exactly two lowland showcase
    stations (Fernandez Oro, Paseo de la Costa); `estaciones-detalle?a=<n>`
    ignores its parameter and re-serves the list page. So the snow stations have
    a live snapshot and nothing else: a day not captured here is gone for good.
    That is why `aic` sits at the front of ARCHIVE_PRIORITY alongside IMIS.

    WHAT IS DELIBERATELY NOT WRITTEN
    -------------------------------------------------------------------------
    `Precipitacion Diaria` is a DAILY total, and precip_accum_mm is documented
    as season-cumulative — the column everyone downstream will difference. That
    is precisely the PRCP-vs-PREC trap described above for SNOTEL, so the daily
    value is dropped rather than parked in a column that would silently turn a
    per-day figure into a nonsense delta. Depth is not written because AIC does
    not measure it. That also means this adapter contributes NOTHING to the
    `snow_stations` snapshot, whose serving path wants a measured depth anchor:
    it returns an empty snapshot list on purpose and is archive-only.

    TWO SWE SENSORS AT ONE SITE ARE KEPT APART
    -------------------------------------------------------------------------
    Cerro Nevado publishes both a standard `Equivalente Agua Nieve` (260.01 mm)
    and an `EAN Snow Pillow Sensor` (642.4 mm) — the same site, the same day,
    2.5x apart. Merging them would invent a number neither sensor reported, and
    picking one now would bury the discrepancy. Each gets its own station_id
    (`#pillow` suffix) so both series accumulate and the question stays open and
    answerable later.

    SAMPLING TIME IS FIXED AND MUST STAY FIXED
    -------------------------------------------------------------------------
    The Vercel cron for this worker is `20 5 * * *` — 05:20 UTC daily, which is
    02:20 in Argentina (UTC-3), so each run reads the previous day's settled
    figures. Vercel crons are UTC and do not shift with daylight saving, which
    is the property that matters. A snow pillow has a daily melt/refreeze cycle,
    so its reading depends on the hour it is taken: if sampling time drifted, a
    day-to-day delta would blend real snowfall with the diurnal cycle and the
    two could not be separated afterwards. Do not move this schedule without
    re-basing the series.

    Elevation comes from a DEM rather than from AIC — see
    `_aic_terrain_elevations` for what that does and does not license.
    """
    response = requests.get(AIC_STATIONS_URL, timeout=TIMEOUT_S)
    response.raise_for_status()
    page = response.text

    # Readings live in Google Maps infowindow HTML built inline as `var mensajeN`;
    # coordinates and name come from the matching `var markerN`. Both are keyed
    # by the same index, which is the only thing joining a reading to a place.
    positions: dict[str, tuple[float, float, str]] = {}
    for marker in re.finditer(
        r'var marker(\d+) = new google\.maps\.Marker\(\{ map: mapa, '
        r'position: new google\.maps\.LatLng\(([-\d.]+),([-\d.]+)\),\s*title:"([^"]*)"',
        page,
    ):
        positions[marker.group(1)] = (
            float(marker.group(2)), float(marker.group(3)), marker.group(4).strip(),
        )

    stats = ArchiveStats()
    archive: list[dict] = []
    messages = list(re.finditer(r"var mensaje(\d+) = '(.*?)';\s*var infowindow\1", page, re.S))

    # Elevation is fetched ONCE for the snow sites, before any row is built, so
    # the DEM lookup is a single request per run rather than one per station.
    # Only SWE-carrying sites are asked about — the ~85 river gauges are not
    # archived here, so their heights would be a wasted lookup.
    snow_points: list[tuple[float, float]] = []
    for message in messages:
        place = positions.get(message.group(1))
        if not place:
            continue
        if re.search(r'<td class="MenDatosBold">(?:[^<]*Equivalente Agua Nieve|EAN )', message.group(2)):
            snow_points.append((place[0], place[1]))
    elevations = _aic_terrain_elevations(sorted(set(snow_points)))

    for message in messages:
        index, blob = message.group(1), message.group(2)
        place = positions.get(index)
        if not place:
            stats.dropped_no_station_meta += 1
            continue
        lat, lon, name = place

        readings: dict[str, str] = {}
        for cell in re.finditer(
            r'<td class="MenDatosBold">([^<]+)</td><td align="right">([^<]*)</td>', blob,
        ):
            readings[unescape(cell.group(1)).strip()] = cell.group(2).strip()

        swe_labels = [label for label in readings
                      if "Equivalente Agua Nieve" in label or label.startswith("EAN ")]
        # Most of the ~97 stations are river gauges with no snow sensor. They are
        # not archivable here and are skipped WITHOUT a counter — counting them
        # would report ~85 phantom losses a day and bury a real one. Only a
        # station that actually carries an SWE reading can be "skipped".
        if not swe_labels:
            continue

        # Per-station update date, dd/mm/yyyy, no clock time. Stations update on
        # their own cadence — two were a day behind the rest when sampled — so
        # this must come from the row and never from "now", or a stale reading
        # would be archived under today and read later as a fresh observation.
        stamped = re.search(r'ltima actualizaci[^:]*:\s*(\d{2})/(\d{2})/(\d{4})', blob)
        if not stamped:
            stats.skipped_no_timestamp += len(swe_labels)
            continue
        day, month, year = (int(part) for part in stamped.groups())
        observed_at = datetime(
            year, month, day, tzinfo=timezone(timedelta(hours=-3)),  # Argentina, UTC-3
        ).isoformat()

        # The rain gauge on the same mast, kept as its own column. Only labels
        # that SAY they are a day's total are taken: "Precipitacion Diaria",
        # anything "diaria", anything "24hs". Deliberately NOT taken are the
        # bare tipping-bucket counters ("LluviaTippingBucket") and anything
        # "totalizada" — the first does not state its window and the second is
        # an accumulator, and guessing wrong here puts a season total in a
        # column documented as one day. None of the excluded labels appears on
        # an SWE station today (checked across all ~97 stations, 2026-08-01); if
        # one ever does it is dropped loudly below rather than mis-stored.
        daily_precip_mm = None
        for label, value in readings.items():
            lowered = label.lower()
            if "totaliz" in lowered:
                continue
            if "diaria" not in lowered and "24hs" not in lowered:
                continue
            if "precipitaci" not in lowered and "lluvia" not in lowered:
                continue
            parsed = re.match(r'^(-?[\d.]+)\s*mm$', value)
            if parsed:
                daily_precip_mm = float(parsed.group(1))
                break
            stats.skipped_no_value += 1

        slug = re.sub(r"[^A-Z0-9]+", "_", name.upper()).strip("_") or index
        for label in swe_labels:
            millimetres = re.match(r'^(-?[\d.]+)\s*mm$', readings[label])
            if not millimetres:
                stats.skipped_no_value += 1
                continue
            # A site with two SWE sensors is two series, but it still has ONE
            # rain gauge. The gauge reading rides on the primary series only —
            # copying it onto the #pillow row would double-count the same
            # measurement under two station_ids.
            suffix = "#pillow" if "Snow Pillow" in label else ""
            observation = _observation(
                f"aic:{slug}{suffix}", "aic", observed_at,
                precip_daily_mm=None if suffix else daily_precip_mm,
                name=name, lat=lat, lon=lon,
                elevation_m=_aic_elevation(lat, lon, elevations),
                stats=stats, swe_mm=float(millimetres.group(1)),
            )
            if observation:
                archive.append(observation)

    return [], archive, stats


# --- credential-safe error text -------------------------------------------
# A Supabase key with a stray newline makes http.client raise a plain
# ValueError whose message quotes the Authorization header VALUE verbatim, and
# `\r\n` / leading space raise InvalidHeader with the same exposure. Neither is
# safe to echo into a log line or an HTTP response body, so nothing in this
# module formats a raw exception. Credentials are re-read from os.environ on
# every call so a mid-process rotation cannot slip a new key past a redaction
# pinned to the old one.
def _safe_detail(exc: BaseException, limit: int = 200) -> str:
    name = type(exc).__name__
    try:
        if isinstance(exc, ValueError) or "header" in name.lower():
            return f"{name}: message withheld (it can embed a credential); check the Supabase *_KEY env vars for stray whitespace/newline"
        text = str(exc)
    except Exception:  # noqa: BLE001 — a hostile __str__ must not break logging
        return name
    for env_name in ("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY",
                     "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "CRON_SECRET"):
        value = os.environ.get(env_name) or ""
        for variant in (value, value.strip()):
            if len(variant) >= 8:
                text = text.replace(variant, "[redacted]")
    text = " ".join(text.split())
    return f"{name}: {text[:limit]}"


def collect() -> tuple[list[dict], dict[str, list[dict]], dict[str, ArchiveStats], dict[str, str]]:
    """Run every adapter; a failure records the error and skips that network."""
    rows: list[dict] = []
    archive: dict[str, list[dict]] = {}
    stats: dict[str, ArchiveStats] = {}
    errors: dict[str, str] = {}
    for name, adapter in (("snotel", _rows_snotel), ("imis", _rows_slf),
                          ("amedas", _rows_amedas), ("aic", _rows_aic)):
        try:
            snapshot_rows, archive_rows, adapter_stats = adapter()
            rows.extend(snapshot_rows)
            archive[name] = archive_rows
            stats[name] = adapter_stats
        except Exception as exc:  # noqa: BLE001 — one network must not sink the run
            errors[name] = _safe_detail(exc)
            archive[name] = []
            failed = ArchiveStats()
            failed.error = "adapter failed"
            stats[name] = failed
    return rows, archive, stats, errors


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


def append_observations(archive: dict[str, list[dict]], stats: dict[str, ArchiveStats],
                        deadline: float) -> None:
    """Append readings to the observation archive. BEST-EFFORT, always.

    This runs after the snapshot upsert has already succeeded and swallows every
    failure into per-source `stats.error`. The archive is telemetry: it must
    never break serving, and a partial write is strictly better than none.

    `resolution=ignore-duplicates` + on_conflict on the full primary key makes
    re-reading a value a no-op rather than an error or an overwrite, so an
    overlapping window across runs costs nothing.
    """
    if not WRITE_KEY:
        for source_stats in stats.values():
            if source_stats.error is None:
                source_stats.error = "no write key"
        return

    fetched_at = datetime.now(tz=timezone.utc).isoformat()
    for source in ARCHIVE_PRIORITY:
        rows = archive.get(source) or []
        source_stats = stats.get(source)
        if source_stats is None or not rows:
            continue

        # Deduplicate on the primary key: the same (station_id, observed_at)
        # twice in one payload is ambiguous, so resolve it here rather than
        # relying on the server's conflict handling.
        unique: dict[tuple, dict] = {}
        for row in rows:
            unique[(row["station_id"], row["observed_at"])] = dict(row, fetched_at=fetched_at)
        payload = list(unique.values())

        for start in range(0, len(payload), ARCHIVE_CHUNK):
            remaining = deadline - time.monotonic()
            if remaining < ARCHIVE_MIN_POST_S:
                # Loud and quantified. Dropped archive rows are a data loss, and
                # for IMIS an unrecoverable one, so the response says exactly how
                # many and how much budget was left rather than reporting success.
                source_stats.error = (
                    f"deadline: submitted {source_stats.rows_submitted} of "
                    f"{len(payload)} rows, {len(payload) - source_stats.rows_submitted} "
                    f"dropped ({remaining:.1f}s left, need >={ARCHIVE_MIN_POST_S:.0f}s)"
                )
                break
            # Clamp the socket timeout to the budget so the POST cannot outlive
            # the deadline it was just checked against.
            budget = min(ARCHIVE_POST_TIMEOUT_S, remaining)
            connect_timeout = min(ARCHIVE_CONNECT_TIMEOUT_S, budget / 2)
            chunk = payload[start:start + ARCHIVE_CHUNK]
            try:
                response = requests.post(
                    f"{SUPABASE_URL}/rest/v1/{OBSERVATIONS_TABLE}",
                    params={"on_conflict": "station_id,observed_at"},
                    headers={
                        "apikey": WRITE_KEY,
                        "Authorization": f"Bearer {WRITE_KEY}",
                        "Content-Type": "application/json",
                        "Prefer": "resolution=ignore-duplicates,return=minimal",
                    },
                    data=json.dumps(chunk),
                    timeout=(connect_timeout, budget - connect_timeout),
                )
                response.raise_for_status()
                # Rows the server ACCEPTED, not rows it inserted: return=minimal
                # returns no body and ignore-duplicates makes a repeat a silent
                # no-op, so this is an upper bound on new rows. Named
                # `rows_submitted` so it cannot be read as an insert count.
                source_stats.rows_submitted += len(chunk)
            except Exception as exc:  # noqa: BLE001 — archive never breaks the run
                source_stats.error = _safe_detail(exc)
                # Do NOT break: IMIS is a rolling 24 h endpoint with no history,
                # so one transient 5xx must not forfeit the remaining chunks of
                # data that can never be re-fetched. Try the next chunk.
                continue


class handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 (Vercel/BaseHTTPRequestHandler contract)
        started = time.monotonic()
        cron_secret = os.environ.get("CRON_SECRET")
        if cron_secret and self.headers.get("Authorization") != f"Bearer {cron_secret}":
            self._send(401, {"error": "unauthorized"})
            return
        rows, archive, stats, errors = collect()
        try:
            written = upsert(rows)
        except Exception as exc:  # noqa: BLE001
            self._send(500, {"error": f"upsert failed: {_safe_detail(exc)}", "collected": len(rows),
                             "adapter_errors": errors})
            return

        # Only after the snapshot is safely written. Belt and braces: the function
        # is written not to raise, and this guard makes that an enforced property
        # rather than a claim in a comment.
        try:
            append_observations(archive, stats, deadline=started + ARCHIVE_DEADLINE_S)
        except Exception as exc:  # noqa: BLE001 — archive never breaks the run
            print(f"[archive] append failed: {_safe_detail(exc)}", file=sys.stderr)

        counts: dict[str, int] = {}
        for row in rows:
            counts[row["source"]] = counts.get(row["source"], 0) + 1
        archive_stats = {name: source_stats.as_dict() for name, source_stats in stats.items()}
        self._send(200, {
            "collected": len(rows),
            "written": written,
            "by_source": counts,
            "adapter_errors": errors,
            "write_key_present": bool(WRITE_KEY),
            "archive": {
                "table": OBSERVATIONS_TABLE,
                # `rows_submitted`, not `appended`: these rows were POSTed and
                # accepted, which is NOT the number inserted. `return=minimal`
                # sends no body back and `resolution=ignore-duplicates` turns a
                # re-read into a silent no-op, so this is an upper bound on new
                # rows — and on a normal run most of it IS duplicate, because the
                # source windows deliberately overlap between runs. Naming it
                # honestly is the same choice the serving writer made with
                # `archive_rows`. A true inserted count needs the write to return
                # representations (or a Prefer: count) — deliberately not done,
                # since it would cost a response body per chunk for telemetry.
                "rows_submitted": sum(s["rows_submitted"] for s in archive_stats.values()),
                "collected": sum(s["collected"] for s in archive_stats.values()),
                "by_source": archive_stats,
                "errors": {name: s["error"] for name, s in archive_stats.items() if s["error"]},
            },
            "elapsed_s": round(time.monotonic() - started, 1),
        })

    def _send(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
