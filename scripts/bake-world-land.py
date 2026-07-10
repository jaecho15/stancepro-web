#!/usr/bin/env python3
"""Bake a compact world-land silhouette for the seasonal-card world locator.

Input: Natural Earth 110m land geojson (public domain), e.g.
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson
Output: lib/snow/world-land.json — SVG path strings in a 360x135 space
(equirectangular, lon -180..180 -> x 0..360, lat 75..-60 -> y 0..135;
Antarctica and sub-pixel islands dropped).

Usage: python3 scripts/bake-world-land.py <ne_110m_land.geojson>
Regenerate only if the locator projection changes — output is committed.
"""
import json
import sys

LAT_TOP, LAT_BOTTOM = 75.0, -60.0  # crop poles/Antarctica


def rings(geometry):
    if geometry["type"] == "Polygon":
        yield geometry["coordinates"][0]
    elif geometry["type"] == "MultiPolygon":
        for polygon in geometry["coordinates"]:
            yield polygon[0]


def bake(src_path):
    data = json.load(open(src_path))
    paths = []
    for feature in data["features"]:
        for ring in rings(feature["geometry"]):
            lons = [p[0] for p in ring]
            lats = [p[1] for p in ring]
            # drop Antarctica & specks too small to see at locator scale
            if max(lats) < LAT_BOTTOM:
                continue
            if (max(lons) - min(lons)) * (max(lats) - min(lats)) < 3.0:
                continue
            pts = []
            for lon, lat in ring:
                x = round(lon + 180.0, 1)
                y = round(min(max(LAT_TOP - lat, 0.0), LAT_TOP - LAT_BOTTOM), 1)
                if not pts or pts[-1] != (x, y):
                    pts.append((x, y))
            if len(pts) < 3:
                continue
            d = "M" + "L".join(f"{x} {y}" for x, y in pts) + "Z"
            paths.append(d)
    return {
        "viewBox": f"0 0 360 {LAT_TOP - LAT_BOTTOM:.0f}",
        "latTop": LAT_TOP,
        "paths": paths,
    }


if __name__ == "__main__":
    out = bake(sys.argv[1])
    dest = "lib/snow/world-land.json"
    with open(dest, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    size = len(json.dumps(out, separators=(",", ":")))
    print(f"wrote {dest}: {len(out['paths'])} rings, {size/1024:.1f} KB")
