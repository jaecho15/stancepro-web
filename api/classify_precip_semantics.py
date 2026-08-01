#!/usr/bin/env python3
"""Decide what each station's precip_daily_mm actually means, from its history.

EXPERIMENT.md §5.1 item 8.

THE PROBLEM
-----------------------------------------------------------------------------
AIC runs at least two precipitation conventions under one column header, and
the label does not say which. Measured from AIC's own hourly archives on
2026-08-01:

    PASEO DE LA COSTA   646 hourly rows, 12 downward steps, 10 at exactly
                        07:00 local -> a DAILY total, resetting at 07:00
    FERNANDEZ ORO       746 hourly rows, ZERO downward steps, rising
                        181.86 -> 243.08 mm -> an ANNUAL accumulator

Both are served under "Precipitacion". If a snow station is quietly of the
second kind, its "daily" figure is a season-to-date total, and scoring a
forecast against it would compare one day of model precipitation with several
months of observed — an error large enough to look like a physics result.

THE TEST
-----------------------------------------------------------------------------
Monotonicity across days, which separates the two without needing the hourly
archive that snow stations do not have:

    a daily total moves both directions — dry days follow wet ones
    an accumulator only ever rises, apart from a year boundary

So: count strictly-decreasing steps in the stored series. Any decrease at all
proves it is not an accumulator. A long run with no decrease and a clear upward
trend proves it is.

WHY THE THRESHOLDS ARE ASYMMETRIC
-----------------------------------------------------------------------------
One decrease is conclusive for 'daily'; the value went down, so it cannot be an
accumulator. Proving 'annual' needs much more, because a genuinely daily series
can rise several days running during a long storm and look like an accumulator
by accident. MIN_DAYS_FOR_ANNUAL is therefore deliberately far above
MIN_DAYS_FOR_DAILY, and the annual verdict additionally requires the total to
have risen well beyond what a plausible run of daily values would reach.

Everything else is 'unknown', and unknown means EXCLUDED from scoring — never
assumed to be daily because that is the common case. The whole point of this
classifier is that the common case is not evidence.

On one day of history every station reads 'unknown'. That is correct, not a
defect.

Usage:
  python3 api/classify_precip_semantics.py            # report only
  python3 api/classify_precip_semantics.py --write    # persist verdicts
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://ryiitcblrrqvjvxkobpf.supabase.co")
TABLE = "snow_station_observations"

MIN_DAYS_FOR_DAILY = 3     # one decrease inside this window settles it
MIN_DAYS_FOR_ANNUAL = 21   # never call a station an accumulator on a short storm
ANNUAL_MIN_RISE_MM = 50.0  # and not without a rise no daily series would show


def _key() -> str:
    for name in ("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_KEY"):
        value = os.environ.get(name)
        if value:
            return value.strip()
    raise SystemExit("set SUPABASE_SECRET_KEY (or SERVICE_ROLE_KEY) to read/write")


def _request(method: str, path: str, body: object | None = None) -> object:
    key = _key()
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}", data=data, method=method,
        headers={"apikey": key, "Authorization": f"Bearer {key}",
                 "Content-Type": "application/json", "Prefer": "return=minimal"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = response.read()
    return json.loads(payload) if payload else None


def classify(series: list[tuple[str, float]]) -> tuple[str, str]:
    """(verdict, reason) from a date-ordered [(observed_at, precip_daily_mm)]."""
    values = [value for _, value in series]
    if len(values) < MIN_DAYS_FOR_DAILY:
        return "unknown", f"only {len(values)} day(s) of history"

    decreases = sum(1 for i in range(1, len(values)) if values[i] < values[i - 1] - 1e-9)
    if decreases:
        # Conclusive. An accumulator does not go down mid-season.
        return "daily_0700", f"{decreases} decrease(s) over {len(values)} days"

    if len(values) < MIN_DAYS_FOR_ANNUAL:
        return "unknown", (f"no decrease yet, but {len(values)} days is short of "
                           f"{MIN_DAYS_FOR_ANNUAL}; a long storm looks like this too")

    rise = values[-1] - values[0]
    if rise >= ANNUAL_MIN_RISE_MM:
        return "annual", (f"never decreased over {len(values)} days and rose "
                          f"{rise:.1f} mm — an accumulator, mislabelled")
    return "unknown", (f"never decreased over {len(values)} days but only rose "
                       f"{rise:.1f} mm; consistent with a long dry spell")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--write", action="store_true",
                        help="persist verdicts (default: report only)")
    parser.add_argument("--source", default="aic")
    args = parser.parse_args()

    rows = _request("GET", (
        f"{TABLE}?select=station_id,observed_at,precip_daily_mm"
        f"&source=eq.{args.source}&precip_daily_mm=not.is.null"
        f"&order=station_id.asc,observed_at.asc&limit=100000"
    )) or []

    by_station: dict[str, list[tuple[str, float]]] = {}
    for row in rows:
        by_station.setdefault(row["station_id"], []).append(
            (row["observed_at"], float(row["precip_daily_mm"])))

    if not by_station:
        print("no gauge history yet — nothing to classify")
        return 0

    print(f"{'station_id':<32}{'days':>5}  {'verdict':<12} reason")
    verdicts: dict[str, str] = {}
    for station_id, series in sorted(by_station.items()):
        verdict, reason = classify(series)
        verdicts[station_id] = verdict
        print(f"{station_id:<32}{len(series):>5}  {verdict:<12} {reason}")

    counts: dict[str, int] = {}
    for verdict in verdicts.values():
        counts[verdict] = counts.get(verdict, 0) + 1
    print(f"\n{counts}")
    excluded = counts.get("unknown", 0)
    if excluded:
        print(f"{excluded} station(s) EXCLUDED from gauge scoring until decidable "
              f"(EXPERIMENT.md §5.1 item 8)")

    if not args.write:
        print("\n(report only — pass --write to persist)")
        return 0

    for station_id, verdict in verdicts.items():
        _request("PATCH",
                 f"{TABLE}?station_id=eq.{urllib.parse.quote(station_id, safe='')}"
                 f"&source=eq.{args.source}",
                 {"precip_semantics": verdict})
    print(f"\nwrote precip_semantics for {len(verdicts)} station(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
