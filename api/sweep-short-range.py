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

Concurrency is deliberately small. Each serving call fans out to roughly five
Open-Meteo requests, so N concurrent sweeps mean 5N in flight against a keyless
free tier. Politeness here protects the same quota the user-facing path depends
on — the sweep must never be the reason a real reader gets rate-limited.

Requires nothing beyond the public serving endpoint; SUPABASE_SECRET_KEY is used
by that endpoint, not this one. CRON_SECRET (when set) gates this endpoint, same
as the sibling workers.
"""
from __future__ import annotations

import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import requests

TABLE = "short_range_forecasts"

# The serving origin to call. VERCEL_URL is the per-deployment host, which is
# what a cron invocation should hit: it keeps a preview deployment's sweep on
# that preview rather than reaching across to production.
SITE_ORIGIN = (
    os.environ.get("SWEEP_ORIGIN")
    or (f"https://{os.environ['VERCEL_URL']}" if os.environ.get("VERCEL_URL") else None)
    or "https://www.stance-pro.com"
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

DEFAULT_LIMIT = 80          # comfortably above today's 55-row fleet
DEFAULT_MAX_SECONDS = 240   # vercel.json gives this function 300 s
CONCURRENCY = 4             # x ~5 Open-Meteo calls per resort in flight
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


def fleet(limit: int) -> list[str]:
    """Serving resort ids, stalest first.

    The fleet is defined as "resorts that already have a serving row", i.e. the
    ones somebody has actually looked at. That is the honest scope: sweeping the
    full ~3,466-resort map index would be a different, much larger decision
    about quota, not a verification-coverage fix.
    """
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/{TABLE}",
        params={"select": "resort_id,generated_at", "order": "generated_at.asc",
                "limit": limit},
        headers={"apikey": READ_KEY, "Authorization": f"Bearer {READ_KEY}"},
        timeout=20,
    )
    response.raise_for_status()
    return [row["resort_id"] for row in response.json() if row.get("resort_id")]


def refresh(resort_id: str) -> tuple[str, bool, str | None, int | None]:
    """(resort_id, ok, error, archive_rows_submitted) for one resort."""
    try:
        response = requests.get(
            f"{SITE_ORIGIN}/api/short-range-snow",
            params={"resort_id": resort_id, "refresh": "1"},
            timeout=PER_RESORT_TIMEOUT_S,
        )
        if response.status_code != 200:
            return resort_id, False, f"HTTP {response.status_code}", None
        body = response.json()
        return resort_id, True, None, body.get("archive_rows_submitted")
    except Exception as exc:  # noqa: BLE001 — one resort must not sink the sweep
        return resort_id, False, _safe_detail(exc), None


def sweep(limit: int, max_seconds: float, dry_run: bool) -> dict:
    started = time.monotonic()
    deadline = started + max_seconds
    try:
        ids = fleet(limit)
    except Exception as exc:  # noqa: BLE001
        return {"error": "fleet_lookup_failed", "detail": _safe_detail(exc)}

    if dry_run:
        return {"dry_run": True, "fleet": len(ids), "would_refresh": ids,
                "origin": SITE_ORIGIN}

    done: list[str] = []
    failed: dict[str, str] = {}
    archived = 0
    skipped_deadline = 0

    # Submit lazily in slices so the deadline can stop the sweep between slices
    # rather than only after every future has been created.
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        for index in range(0, len(ids), CONCURRENCY):
            if time.monotonic() >= deadline:
                skipped_deadline = len(ids) - index
                break
            batch = ids[index:index + CONCURRENCY]
            for resort_id, ok, error, rows in pool.map(refresh, batch):
                if ok:
                    done.append(resort_id)
                    archived += rows or 0
                else:
                    failed[resort_id] = error or "unknown"

    return {
        "origin": SITE_ORIGIN,
        "fleet": len(ids),
        "refreshed": len(done),
        "failed": len(failed),
        "failures": failed,
        # Rows the archive ACCEPTED, not rows it inserted: the archive collapses
        # repeats inside one cycle bucket, so read this as liveness, not growth.
        "archive_rows_submitted": archived,
        "skipped_deadline": skipped_deadline,
        "elapsed_s": round(time.monotonic() - started, 1),
    }


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

        result = sweep(
            limit=max(1, _int("limit", DEFAULT_LIMIT)),
            max_seconds=max(10, _int("max_seconds", DEFAULT_MAX_SECONDS)),
            dry_run=query.get("dry_run", ["0"])[0] not in ("0", "", "false"),
        )
        self._send(200 if "error" not in result else 500, result)

    def _send(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
