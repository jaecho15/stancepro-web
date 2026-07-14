"""Attach the climate-driver profile to each seasonal-outlook card.

GET /api/update-climate-drivers

Merges payload.driver onto every seasonal_snow_outlooks row that has a profile
in _driver_profiles.json — the large-scale index (ENSO/NAO/AO/SAM) that region's
winter snow historically tracks, from a 45-year ERA5 survey. The static part
(index, sign, r, predictability, index_series) is precomputed and committed;
this worker adds only the LIVE part each run: the current index value, an
in-season flag (a region's own winter), and a "favorable now" signal when the
index currently leans the region's snow-favorable way.

HONEST BY DESIGN: subseasonal drivers (NAO/AO/SAM) are only skillful at 2–4
weeks, so their "favorable now" flag is gated to the region's winter and framed
as a near-term nudge, never a months-ahead forecast. Regions with no serveable
signal (index=null in the profile) still get a driver block that says so.

Only the 15 regions whose climate_region matches the ERA5 profile taxonomy are
covered; the battle-taxonomy / Japan / non-Italian-Alps rows are a follow-up.

Requires SUPABASE_SECRET_KEY; CRON_SECRET (when set) gates the endpoint.
"""
from __future__ import annotations

import json
import math
import os
import statistics
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from pathlib import Path

import requests

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
HEADERS_READ = {"apikey": READ_KEY, "Authorization": f"Bearer {READ_KEY}"}
TIMEOUT_S = 30

PROFILES = json.loads((Path(__file__).with_name("_driver_profiles.json")).read_text("utf-8"))

# NOAA CPC monthly index sources for the live current value.
IDX_URL = {
    "NAO": "https://www.cpc.ncep.noaa.gov/products/precip/CWlink/pna/norm.nao.monthly.b5001.current.ascii",
    "AO": "https://www.cpc.ncep.noaa.gov/products/precip/CWlink/daily_ao_index/monthly.ao.index.b50.current.ascii",
    "SAM": "https://www.cpc.ncep.noaa.gov/products/precip/CWlink/daily_ao_index/aao/monthly.aao.index.b79.current.ascii",
}
ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
# "Favorable now" needs the index to actually be in a phase, not just off zero.
PHASE_MIN = {"ENSO": 0.5, "NAO": 0.3, "AO": 0.3, "SAM": 0.3}


def _latest3(url: str) -> float | None:
    """Mean of the three most recent monthly values (a ~seasonal current state)."""
    try:
        rows: dict[tuple[int, int], float] = {}
        for line in requests.get(url, timeout=TIMEOUT_S).text.split("\n"):
            p = line.split()
            if len(p) >= 3:
                try:
                    rows[(int(p[0]), int(p[1]))] = float(p[2])
                except ValueError:
                    continue
        keys = sorted(rows)
        return round(statistics.mean(rows[k] for k in keys[-3:]), 2) if keys else None
    except requests.RequestException:
        return None


def _current_oni() -> float | None:
    """Latest ONI (3-month ERSST Niño-3.4 anomaly) — the live ENSO state."""
    try:
        vals = []
        for line in requests.get(ONI_URL, timeout=TIMEOUT_S).text.split("\n")[1:]:
            p = line.split()
            if len(p) == 4:
                try:
                    vals.append(float(p[3]))
                except ValueError:
                    continue
        return round(vals[-1], 2) if vals else None
    except requests.RequestException:
        return None


def _normal_cdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def enso_signal(profile: dict, nino34: float | None) -> dict | None:
    """Served ENSO tercile lean for seasonal-predictable ENSO regions (Andes).
    Mirrors the Vercel enso-network core: mu = slope*(nino/nino_sd); tercile
    probabilities from the region's ERA5-Land-derived boundaries + residual.
    Fires only on a real ENSO event. slope is the LOOCV-shrunk (honest) effect."""
    s = profile.get("enso_serving")
    if not s or profile.get("index") != "ENSO" or nino34 is None or abs(nino34) < PHASE_MIN["ENSO"]:
        return None
    mu = s["slope"] * (nino34 / s["nino_sd"])
    resid = s["resid_std"]
    p_above = 1 - _normal_cdf((s["q67"] - mu) / resid)
    p_below = _normal_cdf((s["q33"] - mu) / resid)
    p_near = max(0.0, 1 - p_above - p_below)
    lean = ("above" if p_above > p_below + 0.05
            else "below" if p_below > p_above + 0.05 else "near")
    # Andes lean is regression-based (not analog-matched); ship empty analogs so
    # the SeasonalSignal contract holds and the card's analog section stays hidden.
    return {"driver": "enso",
            "probabilities": {"above": round(p_above, 3), "near": round(p_near, 3),
                              "below": round(p_below, 3)},
            "lean": lean, "confidence": s.get("confidence", "medium"),
            "analogs": [], "analog_summary": {"above": 0, "near": 0, "below": 0, "mean_pct": 0.0}}


def _in_season(hemi: str, month: int) -> bool:
    """A region's own winter: SH = May–Oct (JJA core), NH = Nov–Apr (DJF core)."""
    return (5 <= month <= 10) if hemi == "S" else (month >= 11 or month <= 4)


def _seasonal_rows() -> list[dict]:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/seasonal_snow_outlooks",
        params={"select": "climate_region,label,region_ids,resort_ids,payload,"
                          "enso_state,target_season,model_version,generated_at"},
        headers=HEADERS_READ, timeout=TIMEOUT_S)
    r.raise_for_status()
    return r.json()


def _upsert(rows: list[dict]) -> None:
    if not rows:
        return
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/seasonal_snow_outlooks",
        params={"on_conflict": "climate_region"},
        headers={"apikey": WRITE_KEY, "Authorization": f"Bearer {WRITE_KEY}",
                 "Content-Type": "application/json",
                 "Prefer": "resolution=merge-duplicates,return=minimal"},
        data=json.dumps(rows), timeout=TIMEOUT_S)
    resp.raise_for_status()


def build_driver(region: str, profile: dict, enso_nino34: float | None,
                 current_idx: dict[str, float | None], month: int) -> dict:
    idx = profile.get("index")
    # historical_relevance = STABILITY of the region's historical index↔snow link
    # (distinct from predictability/confidence). Curated per verified analysis;
    # NEVER auto-derived from raw r (trend/reanalysis artifacts overstate it).
    relevance = profile.get("historical_relevance", "insufficient_data")
    if not idx:
        return {"index": None, "sign": None, "r": None, "predictability": None,
                "weak": False, "historical_relevance": relevance,
                "in_season": _in_season(profile["hemi"], month),
                "current_index": None, "current_signal": None, "index_series": {}}
    cur = enso_nino34 if idx == "ENSO" else current_idx.get(idx)
    in_season = _in_season(profile["hemi"], month)
    signal = "neutral"
    if cur is not None:
        favorable = (cur >= PHASE_MIN[idx]) if profile["sign"] == "+" else (cur <= -PHASE_MIN[idx])
        signal = "positive" if favorable else "neutral"
    return {
        "index": idx, "sign": profile["sign"], "r": profile["r"],
        "predictability": profile["predictability"], "weak": profile["weak"],
        "historical_relevance": relevance,
        "in_season": in_season, "current_index": cur, "current_signal": signal,
        "index_series": profile.get("index_series", {}),
    }


def run() -> dict:
    if not WRITE_KEY:
        return {"error": "SUPABASE_SECRET_KEY not set"}
    month = datetime.now(tz=timezone.utc).month
    now = datetime.now(tz=timezone.utc).isoformat()
    current_idx = {k: _latest3(u) for k, u in IDX_URL.items()}
    nino34_live = _current_oni()
    rows = _seasonal_rows()
    merged, skipped, errors, signalled = [], 0, {}, []
    out_rows = []
    for row in rows:
        region = row["climate_region"]
        profile = PROFILES.get(region)
        if profile is None:
            skipped += 1
            continue
        enso = (row.get("enso_state") or {}).get("nino34")
        if enso is None:
            enso = nino34_live  # lowercase-taxonomy rows carry no enso_state
        driver = build_driver(region, profile, enso, current_idx, month)
        payload = dict(row.get("payload") or {})
        payload["driver"] = driver
        # Validated seasonal ENSO tercile lean (Andes El Niño→wet); preserves the
        # existing driver/history/in-season blocks (no clobber of the other layers).
        sig = enso_signal(profile, enso)
        if sig is not None:
            payload["signal"] = sig
            signalled.append(region)
        out_rows.append({
            "climate_region": region, "label": row["label"],
            "region_ids": row["region_ids"], "resort_ids": row["resort_ids"],
            "payload": payload, "enso_state": row["enso_state"],
            "target_season": row["target_season"],
            "model_version": row.get("model_version") or "seasonal",
            "generated_at": row.get("generated_at") or now, "updated_at": now,
        })
        merged.append(region)
    try:
        _upsert(out_rows)
    except Exception as exc:  # noqa: BLE001
        errors["upsert"] = f"{type(exc).__name__}: {exc}"
    return {"merged": merged, "skipped_no_profile": skipped, "signalled": signalled,
            "current_index": current_idx, "nino34": nino34_live, "month": month, "errors": errors}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        cron_secret = os.environ.get("CRON_SECRET")
        if cron_secret and self.headers.get("Authorization") != f"Bearer {cron_secret}":
            self._send(401, {"error": "unauthorized"})
            return
        try:
            self._send(200, run())
        except Exception as exc:  # noqa: BLE001
            self._send(500, {"error": f"{type(exc).__name__}: {exc}"})

    def _send(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
