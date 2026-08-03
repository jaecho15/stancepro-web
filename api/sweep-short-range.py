"""Scheduled sweep that refreshes the short-range forecast fleet.

GET /api/sweep-short-range[?limit=N][&max_seconds=S][&dry_run=1]

WHY THIS EXISTS
---------------------------------------------------------------------------
Nothing recomputes a forecast on a schedule. `/api/short-range-snow` is
on-demand: a row is refreshed only when somebody opens that resort and the
cached row is older than the serving TTL. The consequence was measured on
2026-07-29 — 50 of the 55 rows in `short_range_forecasts` still carried
`config_version='base'` and generation dates of 2026-07-17..27, ten days after
the physics that produced them had been replaced. Nobody had looked at those
resorts.

That is tolerable for serving (a reader always triggers a fresh compute) but it
is fatal for verification. Lead-time skill scoring needs, for one valid date,
the forecasts issued 1 / 2 / 3 ... days ahead of it. Traffic-driven refresh
produces a ragged, popularity-weighted sample: busy resorts get several cycles a
day, quiet ones get none, and the gaps are not missing at random. A daily sweep
gives every resort in the fleet exactly one cycle per day, which is precisely
the series `short_range_forecast_archive` needs.

HOW
---------------------------------------------------------------------------
This endpoint deliberately holds NO forecast logic. It calls the ordinary
serving endpoint with ?refresh=1, once per resort, so the cache write, the
archive write, the credential scrubbing and the payload contract all stay in
exactly one place. A second copy of that logic here would drift.

Ordering is STALEST FIRST (`generated_at` ascending). Combined with the deadline
guard this makes coverage self-levelling: whatever the budget cannot reach today
sits at the head of tomorrow's queue. A fixed alphabetical order would starve
the tail of the list forever.

Concurrency is deliberately small. Each serving call fans out to roughly nine
Open-Meteo requests (three band forecasts, three ensembles, seasonal, archive,
past-days tail), so N concurrent sweeps mean 9N in flight against a keyless
free tier. Politeness here protects the same quota the user-facing path depends
on — the sweep must never be the reason a real reader gets rate-limited.

COORDINATE FALLBACK (measured 2026-08-03): 8 of the 55 serving rows are OSM ids
with no curated-slug reverse mapping, so a bare ?refresh=1 makes the serving
endpoint's metadata lookup 404 and — because ordering is stalest-first — those
rows sat frozen at generated_at 2026-07-17, failing at the head of the queue
every day. The serving row's own payload carries lat/lon/bands/country_code, so
on a 404 this sweep retries once with those as the endpoint's documented
coordinate-override parameters. The fallback is retry-only: mapped resorts keep
the DB-lookup path, which is the one that preserves region_id.

SUPABASE_SECRET_KEY is optional here and used ONLY to append one row per run to
`short_range_sweep_runs` — the run log that makes a silently missing cron cycle
(measured 2026-08-02: the daily sweep left no trace anywhere but Vercel logs)
detectable by querying for gaps. Refreshing itself still needs nothing beyond
the public serving endpoint. CRON_SECRET (when set) gates this endpoint, same
as the sibling workers.
"""
from __future__ import annotations

import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import requests

TABLE = "short_range_forecasts"

# The serving origin to call. The production domain comes FIRST, and that
# ordering is load-bearing: VERCEL_URL is the per-deployment host, and those
# hosts sit behind Vercel's Deployment Protection. Measured 2026-07-29 — the
# deployment URL answers 302 (SSO redirect) while www.stance-pro.com answers
# 200, so preferring VERCEL_URL would have made every cron sweep fail all 55
# resorts. It stays only as a last resort for an environment that genuinely has
# no production alias.
SITE_ORIGIN = (
    os.environ.get("SWEEP_ORIGIN")
    or "https://www.stance-pro.com"
    or (f"https://{os.environ['VERCEL_URL']}" if os.environ.get("VERCEL_URL") else None)
).rstrip("/")

SUPABASE_URL = (
    os.environ.get("SUPABASE_URL")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    or "https://ryiitcblrrqvjvxkobpf.supabase.co"
).rstrip("/")
READ_KEY = (
    os.environ.get("SUPABASE_ANON_KEY")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    or "sb_publishable_QAigcpa5fpKsYihAaHr-4Q_eW_EwBUk"
)
# Only for the run log below; refreshing needs no elevated key.
WRITE_KEY = os.environ.get("SUPABASE_SECRET_KEY")
RUNS_TABLE = "short_range_sweep_runs"

DEFAULT_LIMIT = 80          # comfortably above today's 55-row fleet
DEFAULT_MAX_SECONDS = 240   # vercel.json gives this function 300 s
CONCURRENCY = 4             # x ~9 Open-Meteo calls per resort in flight
PER_RESORT_TIMEOUT_S = 60


def _safe_detail(exc: BaseException, limit: int = 160) -> str:
    """Exception type plus a scrubbed message. A Supabase key with stray
    whitespace makes http.client quote the Authorization header VALUE in the
    exception text, so raw exceptions are never echoed."""
    name = type(exc).__name__
    try:
        if isinstance(exc, ValueError) or "header" in name.lower():
            return f"{name}: message withheld (it can embed a credential)"
        text = str(exc)
    except Exception:  # noqa: BLE001 — a hostile __str__ must not break logging
        return name
    for env_name in ("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY",
                     "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "CRON_SECRET"):
        value = os.environ.get(env_name) or ""
        for variant in (value, value.strip()):
            if len(variant) >= 8:
                text = text.replace(variant, "[redacted]")
    return f"{name}: {' '.join(text.split())[:limit]}"


def fleet(limit: int) -> list[dict]:
    """Serving rows, stalest first, each with the coordinate identity its own
    payload carries (lat/lon/bands/country_code) for the 404 fallback below.

    The fleet is defined as "resorts that already have a serving row", i.e. the
    ones somebody has actually looked at. That is the honest scope: sweeping the
    full ~3,466-resort map index would be a different, much larger decision
    about quota, not a verification-coverage fix.
    """
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/{TABLE}",
        params={"select": ("resort_id,generated_at,"
                           "lat:payload->lat,lon:payload->lon,"
                           "bands:payload->bands,country:payload->>country_code"),
                "order": "generated_at.asc",
                "limit": limit},
        headers={"apikey": READ_KEY, "Authorization": f"Bearer {READ_KEY}"},
        timeout=20,
    )
    response.raise_for_status()
    return [row for row in response.json() if row.get("resort_id")]


def _coordinate_params(row: dict) -> dict | None:
    """The serving endpoint's coordinate-override query params, built from what
    the serving row itself recorded — or None when the payload carries no usable
    coordinates (then a 404 is final, exactly as before)."""
    lat, lon = row.get("lat"), row.get("lon")
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)) \
            or isinstance(lat, bool) or isinstance(lon, bool):
        return None
    params: dict = {"lat": lat, "lon": lon}
    bands = row.get("bands") if isinstance(row.get("bands"), dict) else {}
    for source, target in (("base", "base_m"), ("top", "top_m")):
        value = bands.get(source)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            params[target] = value
    country = row.get("country")
    if isinstance(country, str) and country.strip():
        params["country"] = country.strip()
    return params


def refresh(row: dict) -> tuple[str, bool, str | None, int | None, bool]:
    """(resort_id, ok, error, archive_rows_submitted, used_coordinate_fallback)
    for one serving row."""
    resort_id = row["resort_id"]

    def _call(params: dict) -> requests.Response:
        return requests.get(
            f"{SITE_ORIGIN}/api/short-range-snow",
            params=params,
            timeout=PER_RESORT_TIMEOUT_S,
            # Do NOT follow redirects. A protected origin answers 302 to an SSO
            # page that then returns 200 with HTML, which would surface as a
            # confusing JSON parse error instead of the real cause.
            allow_redirects=False,
        )

    used_fallback = False
    try:
        response = _call({"resort_id": resort_id, "refresh": "1"})
        if response.status_code == 404:
            # resort_not_found: the endpoint's metadata lookup failed (an OSM id
            # with no curated slug). Retry once with the coordinates this row's
            # own payload recorded — the endpoint's documented override path.
            coords = _coordinate_params(row)
            if coords:
                used_fallback = True
                response = _call({"resort_id": resort_id, "refresh": "1", **coords})
        if response.status_code != 200:
            return resort_id, False, f"HTTP {response.status_code}", None, used_fallback
        body = response.json()
        return resort_id, True, None, body.get("archive_rows_submitted"), used_fallback
    except Exception as exc:  # noqa: BLE001 — one resort must not sink the sweep
        return resort_id, False, _safe_detail(exc), None, used_fallback


def sweep(limit: int, max_seconds: float, dry_run: bool) -> dict:
    started = time.monotonic()
    deadline = started + max_seconds
    try:
        rows = fleet(limit)
    except Exception as exc:  # noqa: BLE001
        return {"error": "fleet_lookup_failed", "detail": _safe_detail(exc)}

    if dry_run:
        return {"dry_run": True, "fleet": len(rows), "origin": SITE_ORIGIN,
                "would_refresh": [row["resort_id"] for row in rows]}

    done: list[str] = []
    failed: dict[str, str] = {}
    coordinate_fallback: list[str] = []
    archived = 0
    skipped_deadline = 0

    # Submit lazily in slices so the deadline can stop the sweep between slices
    # rather than only after every future has been created.
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        for index in range(0, len(rows), CONCURRENCY):
            if time.monotonic() >= deadline:
                skipped_deadline = len(rows) - index
                break
            batch = rows[index:index + CONCURRENCY]
            for resort_id, ok, error, archive_rows, used_fallback in pool.map(refresh, batch):
                if used_fallback:
                    coordinate_fallback.append(resort_id)
                if ok:
                    done.append(resort_id)
                    archived += archive_rows or 0
                else:
                    failed[resort_id] = error or "unknown"

    return {
        "origin": SITE_ORIGIN,
        "fleet": len(rows),
        "refreshed": len(done),
        "failed": len(failed),
        "failures": failed,
        # Resorts whose bare refresh 404ed and were retried (successfully or
        # not) from their own payload coordinates. Persistently non-empty means
        # the slug map still lacks these ids — the fallback is a safety net,
        # not the fix for that.
        "coordinate_fallback": coordinate_fallback,
        # Rows the archive ACCEPTED, not rows it inserted: the archive collapses
        # repeats inside one cycle bucket, so read this as liveness, not growth.
        "archive_rows_submitted": archived,
        "skipped_deadline": skipped_deadline,
        "elapsed_s": round(time.monotonic() - started, 1),
    }


def record_run(result: dict, started_at_utc: str) -> str:
    """Append one row per executed sweep to `short_range_sweep_runs`, so a
    missing daily cycle is detectable from the database (Vercel logs were the
    only trace when the 2026-08-02 run vanished) and per-run failure detail
    outlives log retention. Best-effort telemetry: never raises into the
    response path, and failure details are already scrubbed by _safe_detail.
    """
    if not WRITE_KEY:
        return "disabled_no_write_key"
    row = {
        "started_at": started_at_utc,
        "origin": result.get("origin", SITE_ORIGIN),
        "fleet": result.get("fleet"),
        "refreshed": result.get("refreshed"),
        "failed": result.get("failed"),
        "failures": result.get("failures") or None,
        "coordinate_fallback": result.get("coordinate_fallback") or None,
        "archive_rows_submitted": result.get("archive_rows_submitted"),
        "skipped_deadline": result.get("skipped_deadline"),
        "elapsed_s": result.get("elapsed_s"),
        # fleet_lookup_failed carries its (scrubbed) cause in `detail`.
        "error": ": ".join(filter(None, (result.get("error"), result.get("detail")))) or None,
    }
    try:
        response = requests.post(
            f"{SUPABASE_URL}/rest/v1/{RUNS_TABLE}",
            headers={
                "apikey": WRITE_KEY,
                "Authorization": f"Bearer {WRITE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            data=json.dumps([row]),
            timeout=15,
        )
        response.raise_for_status()
        return "ok"
    except Exception as exc:  # noqa: BLE001 — telemetry must never sink the sweep
        return f"error: {_safe_detail(exc)}"


class handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 (Vercel/BaseHTTPRequestHandler contract)
        cron_secret = os.environ.get("CRON_SECRET")
        if cron_secret and self.headers.get("Authorization") != f"Bearer {cron_secret}":
            self._send(401, {"error": "unauthorized"})
            return
        query = parse_qs(urlparse(self.path).query)

        def _int(name: str, default: int) -> int:
            try:
                return int(query.get(name, [default])[0])
            except (TypeError, ValueError):
                return default

        dry_run = query.get("dry_run", ["0"])[0] not in ("0", "", "false")
        started_at_utc = datetime.now(tz=timezone.utc).isoformat()
        result = sweep(
            limit=max(1, _int("limit", DEFAULT_LIMIT)),
            max_seconds=max(10, _int("max_seconds", DEFAULT_MAX_SECONDS)),
            dry_run=dry_run,
        )
        # A dry run refreshed nothing, so it must not look like a live cycle in
        # the gap-detection series.
        if not dry_run:
            result["run_recorded"] = record_run(result, started_at_utc)
        self._send(200 if "error" not in result else 500, result)

    def _send(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
