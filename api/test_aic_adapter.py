#!/usr/bin/env python3
"""Regression guards for the AIC adapter in update-snow-stations.py.

Offline: every case runs against a hand-built fixture of the AIC page's Google
Maps infowindow markup, so the suite neither depends on nor hammers aic.gob.ar,
and it still fails if the parsing contract breaks.

Each test pins a decision that was made deliberately and would be silent and
expensive to lose:

  1. observed_at comes from the STATION's own update date, never from "now".
     Two stations were a day behind the rest on the day this adapter shipped;
     stamping those with today would file a stale reading as a fresh one.
  2. skipped_no_timestamp counts only readings that were actually lost. Most of
     the ~97 stations are river gauges with no snow sensor and must not be
     counted as losses — ~85 phantom drops a day would bury a real one.
  3. A daily rain total goes to precip_daily_mm and NEVER to precip_accum_mm,
     which is the column downstream code differences.
  4. A site's two SWE sensors stay separate, and the single rain gauge is not
     copied onto both series.

Usage:
  python3 api/test_aic_adapter.py
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parent / "update-snow-stations.py"
spec = importlib.util.spec_from_file_location("update_snow_stations", MODULE_PATH)
uss = importlib.util.module_from_spec(spec)
spec.loader.exec_module(uss)


def _station(index: int, name: str, lat: float, lon: float,
             rows: list[tuple[str, str]], updated: str | None) -> str:
    """One station exactly as the live page emits it: a Marker for the place and
    a mensaje blob for the readings, joined only by the shared index."""
    cells = "".join(
        f'<td class="MenDatosBold">{label}</td><td align="right">{value}</td>'
        for label, value in rows
    )
    stamp = (f'<div class="MenLeyendaOK">(última actualización: {updated})</div>'
             if updated else "")
    return (
        f'var marker{index} = new google.maps.Marker({{ map: mapa, '
        f'position: new google.maps.LatLng({lat},{lon}),  title:"{name}"}});\n'
        f"var mensaje{index} = '<div class=\"MenDatos\"><table><tbody>{cells}"
        f'</tbody></table></div>{stamp}\';\n'
        f'var infowindow{index} = new google.maps.InfoWindow();\n'
    )


FIXTURE = "".join([
    # Snow station, current.
    _station(1, "CERRO CHAPELCO", -40.264333, -71.354083,
             [("Equivalente Agua Nieve", "351.5 mm"),
              ("Precipitación Diaria", "14 mm")], "01/08/2026"),
    # Snow station reporting a day late — the case that motivated per-row dates.
    _station(2, "CERRO LITRAN", -38.787333, -70.815,
             [("Equivalente Agua Nieve", "337.84 mm")], "30/07/2026"),
    # River gauge: no snow sensor at all. Must be skipped WITHOUT a counter.
    _station(3, "ALLEN", -39.03232, -67.841194,
             [("Altura Río/Lago", "1.2 m"),
              ("Precipitación Diaria", "0.76 mm")], "01/08/2026"),
    # Two SWE sensors, one rain gauge, at one site.
    _station(4, "CERRO NEVADO", -40.970833, -71.712667,
             [("Equivalente Agua Nieve", "260.01 mm"),
              ("EAN Snow Pillow Sensor presión/nivel transm.ORBCOMM", "642.4 mm"),
              ("Precipitación Diaria", "29.6 mm")], "01/08/2026"),
    # Snow station with no update date: a genuine loss, and the only kind that
    # may increment skipped_no_timestamp.
    _station(5, "CERRO SIN FECHA", -39.5, -71.0,
             [("Equivalente Agua Nieve", "100.0 mm")], None),
    # Accumulator on a station with no snow sensor. Must never reach a column.
    _station(6, "LINDERO ATRAVESADO", -38.749474, -68.249677,
             [("altura virtual de lluvia totalizada TB", "1313.5 mm")], "31/07/2026"),
])


class _Response:
    status_code = 200

    def __init__(self, text: str) -> None:
        self.text = text

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return {}


def _run() -> list[dict]:
    """Parse the fixture with the real adapter, elevation lookup stubbed out."""
    original_get, original_elevations = uss.requests.get, uss._aic_terrain_elevations
    uss.requests.get = lambda *args, **kwargs: _Response(FIXTURE)
    uss._aic_terrain_elevations = lambda points: {p: 1500.0 for p in points}
    try:
        snapshot, archive, stats = uss._rows_aic()
    finally:
        uss.requests.get, uss._aic_terrain_elevations = original_get, original_elevations
    _run.snapshot, _run.stats = snapshot, stats
    return archive


def test_observed_at_is_the_stations_own_date(rows: list[dict]) -> None:
    by_id = {row["station_id"]: row for row in rows}
    assert by_id["aic:CERRO_CHAPELCO"]["observed_at"].startswith("2026-08-01"), \
        by_id["aic:CERRO_CHAPELCO"]["observed_at"]
    # The whole point: a station a day behind keeps ITS date, not the run's.
    assert by_id["aic:CERRO_LITRAN"]["observed_at"].startswith("2026-07-30"), \
        by_id["aic:CERRO_LITRAN"]["observed_at"]
    assert by_id["aic:CERRO_LITRAN"]["observed_at"].endswith("-03:00"), \
        "Argentina is UTC-3; a naive or UTC stamp shifts the day boundary"


def test_skipped_counter_counts_only_real_losses(rows: list[dict]) -> None:
    stats = _run.stats
    # ALLEN and LINDERO ATRAVESADO have no SWE sensor; neither is a loss.
    # CERRO SIN FECHA has SWE but no date: exactly one lost reading.
    assert stats.skipped_no_timestamp == 1, stats.as_dict()
    assert not any("SIN_FECHA" in row["station_id"] for row in rows)


def test_daily_precip_never_lands_in_the_accumulator_column(rows: list[dict]) -> None:
    chapelco = next(r for r in rows if r["station_id"] == "aic:CERRO_CHAPELCO")
    assert chapelco["precip_daily_mm"] == 14.0, chapelco
    assert chapelco["precip_accum_mm"] is None, \
        "a daily total in precip_accum_mm would be differenced downstream"
    # The one accumulator in the fixture belongs to a station with no SWE, so it
    # must not appear anywhere in the output.
    assert all(r["precip_accum_mm"] is None for r in rows)
    assert all(r["precip_daily_mm"] != 1313.5 for r in rows)


def test_two_sensors_stay_apart_and_the_gauge_is_not_duplicated(rows: list[dict]) -> None:
    nevado = {r["station_id"]: r for r in rows if r["station_id"].startswith("aic:CERRO_NEVADO")}
    assert set(nevado) == {"aic:CERRO_NEVADO", "aic:CERRO_NEVADO#pillow"}, sorted(nevado)
    # 260.01 vs 642.4 at one site on one day. Merging would invent a third
    # number that neither sensor reported.
    assert nevado["aic:CERRO_NEVADO"]["swe_mm"] == 260.01
    assert nevado["aic:CERRO_NEVADO#pillow"]["swe_mm"] == 642.4
    # One mast, one rain gauge — counted once.
    assert nevado["aic:CERRO_NEVADO"]["precip_daily_mm"] == 29.6
    assert nevado["aic:CERRO_NEVADO#pillow"]["precip_daily_mm"] is None


def test_adapter_writes_no_snapshot_row(rows: list[dict]) -> None:
    # AIC measures no depth, and snow_stations exists to serve a depth anchor.
    assert _run.snapshot == [], _run.snapshot


def main() -> int:
    rows = _run()
    tests = [
        test_observed_at_is_the_stations_own_date,
        test_skipped_counter_counts_only_real_losses,
        test_daily_precip_never_lands_in_the_accumulator_column,
        test_two_sensors_stay_apart_and_the_gauge_is_not_duplicated,
        test_adapter_writes_no_snapshot_row,
    ]
    failures = 0
    for test in tests:
        try:
            test(rows)
            print(f"PASS  {test.__name__}")
        except AssertionError as exc:
            failures += 1
            print(f"FAIL  {test.__name__}: {exc}")
    print(f"\n{len(tests) - failures}/{len(tests)} passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
