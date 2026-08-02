"""Daily capture of what we actually served, and of the snowline snapshot.

GET /api/archive-served-payloads

Two tables in this codebase overwrite themselves and are therefore losing
history every day:

  short_range_forecasts   one row per resort, `payload` jsonb replaced on every
                          refresh. It carries fields the flat archive does not —
                          the confidence tier and its reasons, per-band
                          time-of-day blocks, wind gusts — so once it is
                          overwritten those are gone even though the flat
                          archive row survives.
  snow_snowlines          one row per resort, keyed by resort_id alone.
                          Measured 2026-08-02: 66 rows over 66 resorts, 1.0 per
                          resort. The several distinct obs_date values are
                          different resorts last seen on different days, not a
                          series. Satellite snow line is the designated TRUTH
                          for forecast phase, and none of it is being kept.

Both are appended here into `served_payload_archive`, keyed so that re-running
inside one day is a no-op rather than a duplicate.

WHY NOT JUST WIDEN THE FLAT ARCHIVE
-----------------------------------------------------------------------------
Adding tier / wind_gust columns to short_range_forecast_archive is the tidier
answer and it is written (migration 20260802160000). It is blocked behind
another session's unpushed migration, and `--include-all` would deploy their
work. Rather than wait and lose the days, this stores the payload whole — which
also captures fields nobody has thought to add a column for yet.

Storing the blob is not a substitute for the columns. When the migration lands,
the columns become the query surface and this stays as the raw record behind
them.

THE TABLE DOES NOT EXIST YET, AND THAT MUST NOT STOP COLLECTION
-----------------------------------------------------------------------------
Its migration (20260802170000) is blocked behind the same parallel-session
migration as the tier columns. So a POST that fails because the table is absent
falls back to writing the same payload to disk under `--out-dir`, and the
loader replays those files once the table lands. A blocked migration is a
reason to buffer, not a reason to lose the day.

Writes require SUPABASE_SECRET_KEY. When CRON_SECRET is configured the endpoint
only accepts requests carrying it.
"""
from __future__ import annotations

import gzip
import json
import os
import sys
from datetime import date, datetime, timezone
from http.server import BaseHTTPRequestHandler
from pathlib import Path

import requests

SUPABASE_URL = os.environ.get(
    "SUPABASE_URL", "https://ryiitcblrrqvjvxkobpf.supabase.co")
ARCHIVE_TABLE = "served_payload_archive"
SOURCE_TABLES = ("short_range_forecasts", "snow_snowlines")
TIMEOUT_S = 60
PAGE = 200
SPOOL_DIR = Path(os.environ.get("SERVED_PAYLOAD_SPOOL", "/tmp/served_payload_spool"))


def _key() -> str | None:
    for name in ("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_KEY"):
        value = os.environ.get(name)
        if value:
            return value.strip()
    return None


def _headers(key: str, write: bool = False) -> dict:
    head = {"apikey": key, "Authorization": f"Bearer {key}"}
    if write:
        head["Content-Type"] = "application/json"
        head["Prefer"] = "resolution=ignore-duplicates,return=minimal"
    return head


def _fetch_all(table: str, key: str) -> list[dict]:
    """Every row, paged. A partial read would archive a partial day and the
    ignore-duplicates key would then refuse to complete it later."""
    rows: list[dict] = []
    offset = 0
    while True:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers={**_headers(key), "Range-Unit": "items",
                     "Range": f"{offset}-{offset + PAGE - 1}"},
            params={"select": "*"}, timeout=TIMEOUT_S,
        )
        response.raise_for_status()
        page = response.json() or []
        rows.extend(page)
        if len(page) < PAGE:
            return rows
        offset += PAGE


def capture(key: str, captured_on: str) -> dict:
    summary: dict = {}
    for table in SOURCE_TABLES:
        try:
            rows = _fetch_all(table, key)
        except Exception as exc:  # noqa: BLE001 — one table must not sink the other
            summary[table] = {"error": f"{type(exc).__name__}: {str(exc)[:120]}"}
            continue

        payload = [{
            "captured_on": captured_on,
            "source_table": table,
            # Both source tables are keyed by resort_id; keeping that as the
            # archive key means one row per resort per day, and a re-run inside
            # the same day is a no-op.
            "resort_id": row.get("resort_id") or "",
            "captured_at": datetime.now(tz=timezone.utc).isoformat(),
            "row": row,
        } for row in rows]

        if not payload:
            summary[table] = {"rows": 0, "note": "source empty"}
            continue

        try:
            response = requests.post(
                f"{SUPABASE_URL}/rest/v1/{ARCHIVE_TABLE}"
                "?on_conflict=captured_on,source_table,resort_id",
                headers=_headers(key, write=True), json=payload, timeout=TIMEOUT_S,
            )
            response.raise_for_status()
            summary[table] = {"rows": len(payload)}
        except Exception as exc:  # noqa: BLE001
            spooled = _spool(table, captured_on, payload)
            summary[table] = {
                "rows": len(payload),
                "error": f"{type(exc).__name__}: {str(exc)[:120]}",
                "spooled_to": spooled,
            }
    return summary


def _spool(table: str, captured_on: str, payload: list[dict]) -> str | None:
    """Last resort when the archive table rejects the write.

    Almost always because the table does not exist yet — its migration is
    blocked behind a parallel session's. The day is unrecoverable if dropped, so
    it goes to disk and gets replayed later. Returns the path, or None if even
    this failed, which is then visible in the response rather than silent.
    """
    try:
        SPOOL_DIR.mkdir(parents=True, exist_ok=True)
        path = SPOOL_DIR / f"{captured_on}_{table}.jsonl.gz"
        with gzip.open(path, "wt", encoding="utf-8") as handle:
            for row in payload:
                handle.write(json.dumps(row, separators=(",", ":")) + "\n")
        return str(path)
    except Exception:  # noqa: BLE001
        return None


class handler(BaseHTTPRequestHandler):  # noqa: N801 — Vercel's required name
    def do_GET(self) -> None:  # noqa: N802
        secret = os.environ.get("CRON_SECRET")
        if secret:
            supplied = self.headers.get("Authorization") or ""
            if supplied != f"Bearer {secret}":
                self._send(401, {"error": "unauthorized"})
                return

        key = _key()
        if not key:
            self._send(500, {"error": "no write key"})
            return

        captured_on = date.today().isoformat()
        summary = capture(key, captured_on)
        failed = [t for t, s in summary.items() if s.get("error")]
        self._send(200 if not failed else 207,
                   {"captured_on": captured_on, "tables": summary,
                    "failed": failed})

    def _send(self, status: int, body: dict) -> None:
        blob = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(blob)))
        self.end_headers()
        self.wfile.write(blob)


if __name__ == "__main__":
    api_key = _key()
    if not api_key:
        print("set SUPABASE_SECRET_KEY", file=sys.stderr)
        raise SystemExit(1)
    print(json.dumps(capture(api_key, date.today().isoformat()), indent=2))
