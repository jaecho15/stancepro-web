import subregions from "./snow-outlook-subregions.json";

// Coordinate → climate region_id by point-in-polygon against the snow-outlook
// subregion boundaries — a TS port of iOS SeasonalRegionLocator, using a
// slimmed copy of the app-bundled snow_outlook_subregions.geojson. This is how
// the ~3,466 map-index resorts (no curated slug) inherit a seasonal outlook.
// Server-side only: keep out of client bundles.

type Ring = number[][]; // [lon, lat] pairs

interface SlimFeature {
  properties: { region_id: string };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
}

// Ray-casting on the exterior ring, planar lon/lat (fine at subregion scale) —
// same algorithm as the Swift original.
function ringContains(ring: Ring, lat: number, lon: number): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  let j = ring.length - 1;
  for (let i = 0; i < ring.length; i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
    j = i;
  }
  return inside;
}

export function regionIdFor(lat: number, lon: number): string | null {
  for (const feature of (subregions as { features: SlimFeature[] }).features) {
    const { type, coordinates } = feature.geometry;
    const exteriorRings =
      type === "Polygon"
        ? [(coordinates as Ring[])[0]]
        : (coordinates as Ring[][]).map((polygon) => polygon[0]);
    for (const ring of exteriorRings) {
      if (ring && ringContains(ring, lat, lon)) {
        return feature.properties.region_id;
      }
    }
  }
  return null;
}
