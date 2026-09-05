"""Short-range forecast history for the expert layer (Vercel Python function).

GET /api/short-range-history?resort_id=<id>[&band=mid][&date=YYYY-MM-DD][&runs=16]

Two read-only views over what the pipeline already archives:

  run_history  — how the forecast for ONE valid date moved across the last
                 `runs` model cycles (p10/p50/p90 + confidence tier per run).
                 This is the "is this storm settling or still swinging" signal.
  latest_run   — the newest archived cycle's D1-7 rows for the band, with the
                 per-model candidates the served quantiles were reduced from.
                 Agreement and spread come from these; no accuracy ranking is
                 derived or served (no southern-hemisphere truth to rank on).

The archive sits behind an internal-only RLS policy, so this reads with the
secret key and shapes the rows down to what the apps draw. Nothing here is
computed; it is a projection of `short_range_forecast_archive`.

Response 200:
  { resort_id, band, date,
    run_history: [{run_init_time, lead_time_days, snow_cm_p10, snow_cm_p50,
                   snow_cm_p90, tier, n_models, config_version}, ...]  (oldest first)
    latest_run: {run_init_time, config_version,
                 days: [{date, lead_time_days, snow_cm_p10, snow_cm_p50,
                         snow_cm_p90, tier, temp_source,
                         models: [{model, snow_cm}, ...]}, ...] } | null }
503 history_unavailable when the secret key is not configured.
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _short_range_core as core  # noqa: E402

ARCHIVE_TABLE = "short_range_forecast_archive"
SUPABASE_URL = (
    os.environ.get("SUPABASE_URL")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    or core.DEFAULT_SUPABASE_URL
).rstrip("/")
# The archive's SELECT policy is is_internal_member(); the publishable key
# cannot read it. Same secret the forecast function writes with.
SERVICE_KEY = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

BANDS = ("low", "base", "mid", "top")
DEFAULT_RUNS = 16
MAX_RUNS = 40
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_ID_RE = re.compile(r"^[A-Za-z0-9_\-.]{1,80}$")
MODEL_LABELS = {
    "ecmwf_ifs025": "ECMWF",
    "gfs_seamless": "GFS",
    "icon_seamless": "ICON",
    "gem_seamless": "GEM",
}


def _headers() -> dict[str, str]:
    key = (SERVICE_KEY or "").strip()
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def _get(params: dict[str, str]) -> list[dict]:
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/{ARCHIVE_TABLE}", params=params,
        headers=_headers(), timeout=15,
    )
    response.raise_for_status()
    return response.json()


def _num(value):
    return None if value is None else float(value)


def _run_row(row: dict) -> dict:
    return {
        "run_init_time": row.get("run_init_time"),
        "lead_time_days": row.get("lead_time_days"),
        "snow_cm_p10": _num(row.get("snow_cm_low")),
        "snow_cm_p50": _num(row.get("snow_cm_median")),
        "snow_cm_p90": _num(row.get("snow_cm_high")),
        "tier": row.get("tier"),
        "n_models": row.get("n_models"),
        "config_version": row.get("config_version"),
    }


def _models(candidates: dict | None) -> list[dict]:
    """Per-model snow from the archived quantile provenance. Order follows the
    archive's model list; a model without a value is omitted, not zeroed."""
    if not isinstance(candidates, dict):
        return []
    names = candidates.get("models") or []
    values = candidates.get("candidates") or []
    out = []
    for name, value in zip(names, values):
        if value is None:
            continue
        out.append({
            "model": MODEL_LABELS.get(str(name), str(name)),
            "model_id": str(name),
            "snow_cm": round(float(value), 1),
        })
    return out


def _day_row(row: dict) -> dict:
    base = _run_row(row)
    base.pop("run_init_time", None)
    base.pop("n_models", None)
    base.pop("config_version", None)
    base["date"] = row.get("valid_date")
    base["temp_source"] = row.get("temp_source")
    base["models"] = _models(row.get("snow_candidates"))
    return base


def build(resort_id: str, band: str, date: str | None, runs: int) -> tuple[int, dict]:
    if not SERVICE_KEY:
        return 503, {"error": "history_unavailable"}
    now_iso = datetime.now(timezone.utc).isoformat()
    # Newest REAL cycle: the archive has carried a run stamped in the future
    # (2026-09-05 06Z seen on 2026-09-03), so "latest" is bounded by now.
    latest = _get({
        "resort_id": f"eq.{resort_id}", "band": f"eq.{band}",
        "run_init_time": f"lte.{now_iso}",
        "select": "run_init_time,config_version",
        "order": "run_init_time.desc", "limit": "1",
    })
    latest_run = None
    if latest:
        run_time = latest[0]["run_init_time"]
        days = _get({
            "resort_id": f"eq.{resort_id}", "band": f"eq.{band}",
            "run_init_time": f"eq.{run_time}", "lead_time_days": "lte.7",
            "select": ("valid_date,lead_time_days,snow_cm_low,snow_cm_median,"
                       "snow_cm_high,tier,temp_source,snow_candidates"),
            "order": "valid_date.asc",
        })
        latest_run = {
            "run_init_time": run_time,
            "config_version": latest[0].get("config_version"),
            "days": [_day_row(r) for r in days],
        }
        if not date and days:
            date = days[0].get("valid_date")
    history: list[dict] = []
    if date:
        rows = _get({
            "resort_id": f"eq.{resort_id}", "band": f"eq.{band}",
            "valid_date": f"eq.{date}", "run_init_time": f"lte.{now_iso}",
            "select": ("run_init_time,lead_time_days,snow_cm_low,snow_cm_median,"
                       "snow_cm_high,tier,n_models,config_version"),
            "order": "run_init_time.desc", "limit": str(runs),
        })
        history = [_run_row(r) for r in reversed(rows)]
    return 200, {
        "resort_id": resort_id, "band": band, "date": date,
        "run_history": history, "latest_run": latest_run,
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 (Vercel/BaseHTTPRequestHandler contract)
        query = parse_qs(urlparse(self.path).query)
        resort_id = (query.get("resort_id") or query.get("resortId") or [""])[0].strip()
        if not resort_id or not _ID_RE.match(resort_id):
            return self._send(400, {"error": "missing_resort_id"})
        band = (query.get("band") or ["mid"])[0].strip().lower()
        if band not in BANDS:
            return self._send(400, {"error": "bad_band"})
        date = (query.get("date") or [""])[0].strip() or None
        if date and not _DATE_RE.match(date):
            return self._send(400, {"error": "bad_date"})
        try:
            runs = max(1, min(MAX_RUNS, int((query.get("runs") or [DEFAULT_RUNS])[0])))
        except ValueError:
            runs = DEFAULT_RUNS
        try:
            status, body = build(resort_id, band, date, runs)
        except Exception as exc:  # noqa: BLE001 — never a 500 HTML page
            # Type only. An exception raised by the HTTP stack can quote the
            # Authorization header (the secret) verbatim in its message.
            return self._send(502, {"error": "history_failed", "detail": type(exc).__name__})
        return self._send(status, body)

    def _send(self, status: int, body: dict):
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        # Runs land every 3 h; hold briefly, allow stale while the next lands.
        self.send_header("Cache-Control", "public, max-age=600, stale-while-revalidate=3600")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
