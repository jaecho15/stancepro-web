import subregions from "./snow-outlook-subregions.json";

// Server-side mini-map builder for the seasonal outlook cards: renders a
// climate region's subregion polygons (slim geojson, same file the region
// locator uses) as SVG path strings fitted to a small viewBox.

export const MINIMAP_W = 120;
export const MINIMAP_H = 80;

type Ring = number[][];

interface SlimFeature {
  properties: { region_id: string };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
}

function exteriorRings(feature: SlimFeature): Ring[] {
  const { type, coordinates } = feature.geometry;
  return type === "Polygon"
    ? [(coordinates as Ring[])[0]]
    : (coordinates as Ring[][]).map((polygon) => polygon[0]);
}

export function regionMiniMapPaths(regionIds: string[]): string[] | null {
  const rings: Ring[] = [];
  for (const feature of (subregions as { features: SlimFeature[] }).features) {
    if (regionIds.includes(feature.properties.region_id)) {
      rings.push(...exteriorRings(feature).filter((r) => r && r.length > 2));
    }
  }
  if (rings.length === 0) return null;

  // Equirectangular with mid-latitude x-compression, aspect-fit with padding.
  let minLon = Infinity,
    maxLon = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  const midLat = (minLat + maxLat) / 2;
  const cos = Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
  const spanX = Math.max((maxLon - minLon) * cos, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const pad = 0.12;
  const scale = Math.min(
    (MINIMAP_W * (1 - 2 * pad)) / spanX,
    (MINIMAP_H * (1 - 2 * pad)) / spanY
  );
  const offsetX = (MINIMAP_W - spanX * scale) / 2;
  const offsetY = (MINIMAP_H - spanY * scale) / 2;

  const project = ([lon, lat]: number[]) => [
    offsetX + (lon - minLon) * cos * scale,
    offsetY + (maxLat - lat) * scale,
  ];

  return rings.map((ring) => {
    // Downsample long rings — thumbnails don't need full fidelity.
    const step = Math.max(1, Math.floor(ring.length / 80));
    const pts = ring.filter((_, i) => i % step === 0).map(project);
    return (
      pts
        .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
        .join("") + "Z"
    );
  });
}
