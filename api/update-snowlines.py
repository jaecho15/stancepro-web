"""Daily satellite snowline sync (Vercel cron worker).

GET /api/update-snowlines

Two-phase, stateless, async around AppEEARS' task queue:

  Phase A (collect): list our recent AppEEARS tasks (name `snowline_daily_*`),
  download each DONE task's results CSV, run the elevation-vs-snow regression
  per resort per day, and upsert each resort's most recent CONFIDENT read into
  `public.snow_snowlines`. Ingest is idempotent (same rows upsert cleanly), so
  no local state is kept — AppEEARS' own task list is the queue.

  Phase B (submit): for every resort in the serving table
  (`short_range_forecasts`), build a 5x5 point grid (~400 m spacing) around the
  centroid, fetch grid elevations (Open-Meteo elevation API) and EMBED each
  point's elevation in its sample id (`p{n}_e{elev}`) so Phase A needs no
  side-channel, then submit VJ110A1 (NOAA-20 VIIRS) NDSI_Snow_Cover point tasks
  chunked ≤400 points). The daily path covers the last 3 days and is skipped if
  today's tasks exist; a backfill (?start=&end=) is keyed by its WINDOW instead,
  so it is never suppressed by the daily guard.

Regression rules (validated on Cardrona/Mt Hutt, 2026-07-10):
  clear pixels < 12 → no read; all snow / all bare → classified directly;
  otherwise threshold fit, accepted only when misclassification ≤ 20%.

Requires EARTHDATA_USERNAME / EARTHDATA_PASSWORD (AppEEARS accepts only Basic
login; the 48 h token is fetched per run — nothing long-lived to renew) and
SUPABASE_SECRET_KEY for the upsert. CRON_SECRET (when set) gates the endpoint.
"""
from __future__ import annotations

import csv
import io
import json
import math
import os
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler

import requests

# Open-Meteo commercial plan (2026-08-03). Hosts and key live in one place —
# see short_range_core.open_meteo_key for why there is no free-tier fallback.
# The canonical core sits in StancePro/scripts; the web functions carry a
# byte-identical vendored copy beside them, so both names are tried.
import sys as _sys
from pathlib import Path as _Path
_here = _Path(__file__).resolve()
# This file's own directory goes on the path UNCONDITIONALLY: the vendored
# `_short_range_core.py` sits beside it and the fallback import below is what
# resolves it. Gating that insert behind a search for the canonical
# `short_range_core.py` — as this block did until 2026-08-15 — left sys.path
# untouched wherever only the underscore-prefixed copy exists, i.e. on Vercel,
# and BOTH imports below then raised ModuleNotFoundError at module load. That
# killed all four core-importing api/ workers from 2026-08-05 to 08-15: the
# crons fired, the functions 500'd before their handlers ran, and nothing was
# written. A run that dies at import leaves no trace but a stale table, which
# is why only a freshness alert found it. Running the file directly hides the
# bug — Python puts the script's own directory on sys.path itself — so the
# guard belongs here and cannot be covered by a local test.
if str(_here.parent) not in _sys.path:
    _sys.path.insert(0, str(_here.parent))
# The canonical core still wins where it is reachable (StancePro/scripts),
# which is the case for runs out of the app tree.
for _candidate in (_here.parents[i] / "scripts" for i in range(min(4, len(_here.parents)))):
    if (_candidate / "short_range_core.py").exists():
        if str(_candidate) not in _sys.path:
            _sys.path.insert(0, str(_candidate))
        break
try:
    from short_range_core import OPEN_METEO_HOSTS, open_meteo_params
except ImportError:                       # web functions sit beside the vendored copy
    from _short_range_core import OPEN_METEO_HOSTS, open_meteo_params


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
APPEEARS = "https://appeears.earthdatacloud.nasa.gov/api"
TASK_PREFIX = "snowline_daily_"
GRID_N = 5                       # 5x5 grid
GRID_SPACING_DEG = 0.0036        # ~400 m
POINTS_PER_TASK = 400
LOOKBACK_DAYS = 3                # observation window per task
MIN_CLEAR = 12                   # fewer cloud-free pixels → no read
MAX_ERR_FRACTION = 0.2           # threshold fit acceptance
SNOW_MIN_NDSI = 40.0             # NDSI_Snow_Cover >= 40 → snow
TIMEOUT_S = 50


def _appeears_token() -> str:
    user = os.environ.get("EARTHDATA_USERNAME")
    password = os.environ.get("EARTHDATA_PASSWORD")
    if not user or not password:
        raise RuntimeError("EARTHDATA_USERNAME / EARTHDATA_PASSWORD not set")
    response = requests.post(f"{APPEEARS}/login", auth=(user, password),
                             headers={"Content-Length": "0"}, timeout=TIMEOUT_S)
    response.raise_for_status()
    return response.json()["token"]


def _served_resorts() -> list[dict]:
    """resort_id + centroid of every resort in the serving table."""
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/short_range_forecasts",
        params={"select": "resort_id,lat:payload->lat,lon:payload->lon"},
        headers={"apikey": READ_KEY, "Authorization": f"Bearer {READ_KEY}"},
        timeout=30,
    )
    response.raise_for_status()
    return [r for r in response.json()
            if isinstance(r.get("lat"), (int, float)) and isinstance(r.get("lon"), (int, float))]


def _grid_elevations(coords: list[tuple[float, float]]) -> list[float | None]:
    """Open-Meteo elevation API — max batch (100 coords/call), gentle pacing and
    backoff on 429 so a fleet-sized run stays inside the free rate limit."""
    import time
    out: list[float | None] = []
    for i in range(0, len(coords), 100):
        chunk = coords[i:i + 100]
        for attempt in range(4):
            response = requests.get(
                OPEN_METEO_HOSTS["elevation"],
                params=open_meteo_params(
                    {"latitude": ",".join(f"{lat:.6f}" for lat, _ in chunk),
                     "longitude": ",".join(f"{lon:.6f}" for _, lon in chunk)}),
                timeout=30,
            )
            if response.status_code == 429:
                time.sleep(1.5 * (2 ** attempt))
                continue
            response.raise_for_status()
            out.extend(response.json().get("elevation") or [None] * len(chunk))
            break
        else:
            out.extend([None] * len(chunk))   # rate-limited out — skip these points
        time.sleep(0.3)
    return out


# --- Phase B: submit -----------------------------------------------------------

def _backfill_tag(start_date: str | None, end_date: str | None) -> str:
    """Window identity for a backfill task name. Two requests for the same
    window are the same task; the daily tag would collide across windows."""
    return f"bf{(start_date or '').replace('-', '')}_{(end_date or '').replace('-', '')}"


def submit_tasks(token: str, start_date: str | None = None,
                 end_date: str | None = None) -> dict:
    """Submit today's point tasks unless they already exist."""
    today_tag = datetime.now(tz=timezone.utc).strftime("%Y%m%d")
    backfill = bool(start_date or end_date)
    existing = requests.get(f"{APPEEARS}/task", params={"limit": 200},
                            headers={"Authorization": f"Bearer {token}"}, timeout=TIMEOUT_S)
    existing.raise_for_status()
    names = {(t.get("task_name") or "") for t in existing.json()}

    if not backfill:
        # Daily path: one set of tasks per day, no more.
        if any(n.startswith(f"{TASK_PREFIX}{today_tag}") for n in names):
            return {"submitted": 0, "note": "today's tasks already exist"}
    else:
        # A backfill is keyed by the WINDOW it covers, not by the day it was
        # asked for. Sharing the daily guard meant a backfill submitted after
        # the 05:40 cron was silently dropped — the run reported success and
        # queued nothing, which is how the first attempt at this failed.
        window_tag = _backfill_tag(start_date, end_date)
        if any(n.startswith(f"{TASK_PREFIX}{window_tag}") for n in names):
            return {"submitted": 0, "note": f"backfill {window_tag} already queued"}

    resorts = _served_resorts()
    # Build every grid first, then resolve elevations in ONE batched pass —
    # per-resort elevation calls trip Open-Meteo's rate limit at fleet size.
    grid_points: list[tuple[str, float, float]] = []
    offsets = range(-(GRID_N // 2), GRID_N // 2 + 1)
    for resort in resorts:
        clat, clon = float(resort["lat"]), float(resort["lon"])
        dlon = GRID_SPACING_DEG / max(math.cos(math.radians(clat)), 0.2)
        grid_points.extend(
            (resort["resort_id"], clat + i * GRID_SPACING_DEG, clon + j * dlon)
            for i in offsets for j in offsets
        )
    elevations = _grid_elevations([(lat, lon) for _, lat, lon in grid_points])
    coordinates: list[dict] = []
    for n, ((resort_id, lat, lon), elev) in enumerate(zip(grid_points, elevations), start=1):
        if elev is None:
            continue
        coordinates.append({
            # elevation rides in the id so Phase A needs no side-channel
            "id": f"p{n}_e{int(round(elev))}",
            "latitude": round(lat, 6), "longitude": round(lon, 6),
            "category": resort_id,
        })

    # Defaults to the rolling window; a backfill passes an explicit range.
    # AppEEARS itself has no such limit — LOOKBACK_DAYS was the only thing
    # keeping this to recent days.
    end = date.fromisoformat(end_date) if end_date else date.today()
    start = date.fromisoformat(start_date) if start_date else end - timedelta(days=LOOKBACK_DAYS)
    dates = [{"startDate": start.strftime("%m-%d-%Y"), "endDate": end.strftime("%m-%d-%Y")}]
    submitted = 0
    for part, i in enumerate(range(0, len(coordinates), POINTS_PER_TASK), start=1):
        task = {
            "task_type": "point",
            "task_name": (f"{TASK_PREFIX}{today_tag}_p{part}" if not backfill
                              else f"{TASK_PREFIX}{_backfill_tag(start_date, end_date)}_p{part}"),
            "params": {
                "dates": dates,
                # VJ110A1 (NOAA-20), not VNP10A1 (Suomi-NPP): SNPP's product
                # stream stopped delivering granules after 2026-07-10 (aging
                # platform, no recovery ETA); NOAA-20 is current and verified.
                "layers": [{"product": "VJ110A1.002", "layer": "NDSI_Snow_Cover"}],
                "coordinates": coordinates[i:i + POINTS_PER_TASK],
            },
        }
        response = requests.post(f"{APPEEARS}/task", json=task,
                                 headers={"Authorization": f"Bearer {token}"}, timeout=TIMEOUT_S)
        response.raise_for_status()
        submitted += 1
    return {"submitted": submitted, "resorts": len(resorts), "points": len(coordinates)}


# --- Phase A: collect ----------------------------------------------------------

def _regress(samples: list[tuple[int, bool]]) -> tuple[str, int | None, int] | None:
    """(status, snowline_m, fit_err) from (elevation, snow) points, or None."""
    if len(samples) < MIN_CLEAR:
        return None
    snow_n = sum(1 for _, s in samples if s)
    if snow_n == len(samples):
        return ("all_snow", None, 0)
    if snow_n == 0:
        return ("all_bare", None, 0)
    best_thr, best_err = None, len(samples) + 1
    for thr in sorted({e for e, _ in samples}):
        err = sum(1 for e, s in samples if (e >= thr) != s)
        if err < best_err:
            best_err, best_thr = err, thr
    if best_err / len(samples) > MAX_ERR_FRACTION:
        return None                      # mixed / noisy day — don't serve it
    return ("snowline", int(best_thr), best_err)


def collect_tasks(token: str) -> dict:
    """Ingest every recently completed snowline task into snow_snowlines."""
    listing = requests.get(f"{APPEEARS}/task", params={"limit": 60},
                           headers={"Authorization": f"Bearer {token}"}, timeout=TIMEOUT_S)
    listing.raise_for_status()
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=3)
    done = []
    for t in listing.json():
        if not (t.get("task_name") or "").startswith(TASK_PREFIX):
            continue
        if t.get("status") != "done":
            continue
        completed = t.get("completed")
        try:
            when = datetime.fromisoformat(str(completed).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            continue
        if when.tzinfo is None:           # AppEEARS omits the offset — it's UTC
            when = when.replace(tzinfo=timezone.utc)
        if when >= cutoff:
            done.append(t["task_id"])

    # (resort, date) -> [(elev, snow)]
    by_key: dict[tuple[str, str], list[tuple[int, bool]]] = {}
    span: dict[str, tuple[int, int]] = {}
    for task_id in done:
        bundle = requests.get(f"{APPEEARS}/bundle/{task_id}",
                              headers={"Authorization": f"Bearer {token}"}, timeout=TIMEOUT_S)
        bundle.raise_for_status()
        csv_meta = next((f for f in bundle.json().get("files", [])
                         if f["file_name"].endswith("-results.csv")), None)
        if csv_meta is None:
            continue
        data = requests.get(f"{APPEEARS}/bundle/{task_id}/{csv_meta['file_id']}",
                            headers={"Authorization": f"Bearer {token}"}, timeout=TIMEOUT_S)
        data.raise_for_status()
        for row in csv.DictReader(io.StringIO(data.text)):
            try:
                value = float(row["VJ110A1_002_NDSI_Snow_Cover"])
                elev = int(row["ID"].rsplit("_e", 1)[1])
            except (KeyError, IndexError, ValueError):
                continue
            resort = row.get("Category") or ""
            lo, hi = span.get(resort, (elev, elev))
            span[resort] = (min(lo, elev), max(hi, elev))
            if value <= 100:             # >100 = cloud/night/fill flags
                by_key.setdefault((resort, row["Date"]), []).append(
                    (elev, value >= SNOW_MIN_NDSI))

    # EVERY (resort, day) read, kept for the history table — including the ones
    # the confidence rules reject. A cloudy day is a real fact about coverage:
    # without it, "40 scored days" cannot be told apart from "200 asked, 160
    # cloudy", and the second is what decides whether a cell can ever reach the
    # minimum n (EXPERIMENT.md A4.2).
    history: list[dict] = []
    # most recent confident read per resort — the snapshot table's contract
    best: dict[str, dict] = {}
    for (resort, obs_date), samples in by_key.items():
        read = _regress(samples)
        lo, hi = span.get(resort, (None, None))
        if read is None:
            history.append({
                "resort_id": resort, "obs_date": obs_date, "status": "insufficient",
                "snowline_m": None, "sampled_min_m": lo, "sampled_max_m": hi,
                "clear_n": len(samples), "total_n": GRID_N * GRID_N, "fit_err_n": None,
            })
            continue
        status, snowline_m, fit_err = read
        history.append({
            "resort_id": resort, "obs_date": obs_date, "status": status,
            "snowline_m": snowline_m, "sampled_min_m": lo, "sampled_max_m": hi,
            "clear_n": len(samples), "total_n": GRID_N * GRID_N, "fit_err_n": fit_err,
        })
        current = best.get(resort)
        if current is None or obs_date > current["obs_date"]:
            best[resort] = {
                "resort_id": resort, "obs_date": obs_date, "status": status,
                "snowline_m": snowline_m, "sampled_min_m": lo, "sampled_max_m": hi,
                "clear_n": len(samples), "total_n": GRID_N * GRID_N, "fit_err_n": fit_err,
            }

    # History first: the snapshot can be rebuilt from any later run, but a day
    # that is not written here is gone once the task bundle expires.
    history_written = 0
    if history and WRITE_KEY:
        try:
            response = requests.post(
                f"{SUPABASE_URL}/rest/v1/snowline_observations",
                params={"on_conflict": "resort_id,obs_date"},
                headers={"apikey": WRITE_KEY, "Authorization": f"Bearer {WRITE_KEY}",
                         "Content-Type": "application/json",
                         "Prefer": "resolution=merge-duplicates,return=minimal"},
                data=json.dumps(history), timeout=60,
            )
            response.raise_for_status()
            history_written = len(history)
        except Exception:  # noqa: BLE001 — history must not break the snapshot
            history_written = -1

    written = 0
    if best and WRITE_KEY:
        now = datetime.now(tz=timezone.utc).isoformat()
        rows = list(best.values())
        for row in rows:
            row["updated_at"] = now
        response = requests.post(
            f"{SUPABASE_URL}/rest/v1/snow_snowlines",
            params={"on_conflict": "resort_id"},
            headers={"apikey": WRITE_KEY, "Authorization": f"Bearer {WRITE_KEY}",
                     "Content-Type": "application/json",
                     "Prefer": "resolution=merge-duplicates,return=minimal"},
            data=json.dumps(rows), timeout=30,
        )
        response.raise_for_status()
        written = len(rows)
    return {"tasks_ingested": len(done), "resorts_read": len(best), "written": written,
            "history_rows": history_written}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 (Vercel/BaseHTTPRequestHandler contract)
        cron_secret = os.environ.get("CRON_SECRET")
        if cron_secret and self.headers.get("Authorization") != f"Bearer {cron_secret}":
            self._send(401, {"error": "unauthorized"})
            return
        result: dict = {}
        try:
            token = _appeears_token()
            result["collect"] = collect_tasks(token)
            from urllib.parse import urlparse, parse_qs
            query = parse_qs(urlparse(self.path).query)
            result["submit"] = submit_tasks(
                token, (query.get("start") or [None])[0], (query.get("end") or [None])[0])
            result["write_key_present"] = bool(WRITE_KEY)
            self._send(200, result)
        except Exception as exc:  # noqa: BLE001
            result["error"] = f"{type(exc).__name__}: {exc}"
            self._send(500, result)

    def _send(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
