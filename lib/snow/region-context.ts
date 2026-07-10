import subregions from "./snow-outlook-subregions.json";
import world from "./world-land.json";

// Geographic context for seasonal-outlook regions: a world-locator (baked
// Natural Earth silhouette + the region's highlight box) and a human subtitle
// (flags + country names) so labels like "Honshu" read worldwide.
// Server-side only — keep the baked JSON out of client bundles.

export const WORLD_VIEWBOX: string = (world as { viewBox: string }).viewBox;
export const WORLD_PATHS: string[] = (world as { paths: string[] }).paths;

const LAT_TOP = (world as { latTop: number }).latTop; // projection: x=lon+180, y=latTop-lat

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

/** The region's bounding box in the world-locator projection, padded and
 *  clamped to a visible minimum size. */
export function regionHighlightRect(
  regionIds: string[]
): { x: number; y: number; w: number; h: number } | null {
  let minLon = Infinity,
    maxLon = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const feature of (subregions as { features: SlimFeature[] }).features) {
    if (!regionIds.includes(feature.properties.region_id)) continue;
    for (const ring of exteriorRings(feature)) {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  if (!Number.isFinite(minLon)) return null;

  const pad = 1.5;
  let x = minLon + 180 - pad;
  let y = LAT_TOP - maxLat - pad;
  let w = maxLon - minLon + 2 * pad;
  let h = maxLat - minLat + 2 * pad;
  const MIN = 10; // degrees — keep small regions visible at locator scale
  if (w < MIN) {
    x -= (MIN - w) / 2;
    w = MIN;
  }
  if (h < MIN) {
    y -= (MIN - h) / 2;
    h = MIN;
  }
  return { x, y, w, h };
}

/** The region's actual subregion polygons projected into the world-locator
 *  space (x = lon+180, y = latTop−lat) — for drawing real zones on the world
 *  hero map instead of bounding boxes. */
export function regionZonePaths(regionIds: string[]): string[] {
  const paths: string[] = [];
  for (const feature of (subregions as { features: SlimFeature[] }).features) {
    if (!regionIds.includes(feature.properties.region_id)) continue;
    for (const ring of exteriorRings(feature)) {
      if (!ring || ring.length < 3) continue;
      const pts = ring.map(([lon, lat]) => [
        (lon + 180).toFixed(1),
        Math.min(Math.max(LAT_TOP - lat, 0), 135).toFixed(1),
      ]);
      paths.push(
        pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join("") + "Z"
      );
    }
  }
  return paths;
}

// --- Subtitle: flags + country names (+ optional descriptor) ---

const COUNTRY: Record<string, { flag: string; name: string }> = {
  ad: { flag: "🇦🇩", name: "Andorra" },
  ar: { flag: "🇦🇷", name: "Argentina" },
  at: { flag: "🇦🇹", name: "Austria" },
  au: { flag: "🇦🇺", name: "Australia" },
  bg: { flag: "🇧🇬", name: "Bulgaria" },
  ca: { flag: "🇨🇦", name: "Canada" },
  ch: { flag: "🇨🇭", name: "Switzerland" },
  cl: { flag: "🇨🇱", name: "Chile" },
  cn: { flag: "🇨🇳", name: "China" },
  cz: { flag: "🇨🇿", name: "Czechia" },
  de: { flag: "🇩🇪", name: "Germany" },
  es: { flag: "🇪🇸", name: "Spain" },
  fi: { flag: "🇫🇮", name: "Finland" },
  fr: { flag: "🇫🇷", name: "France" },
  ge: { flag: "🇬🇪", name: "Georgia" },
  in: { flag: "🇮🇳", name: "India" },
  it: { flag: "🇮🇹", name: "Italy" },
  jp: { flag: "🇯🇵", name: "Japan" },
  kr: { flag: "🇰🇷", name: "South Korea" },
  kz: { flag: "🇰🇿", name: "Kazakhstan" },
  no: { flag: "🇳🇴", name: "Norway" },
  nz: { flag: "🇳🇿", name: "New Zealand" },
  pl: { flag: "🇵🇱", name: "Poland" },
  se: { flag: "🇸🇪", name: "Sweden" },
  si: { flag: "🇸🇮", name: "Slovenia" },
  sk: { flag: "🇸🇰", name: "Slovakia" },
  us: { flag: "🇺🇸", name: "United States" },
};

// Hand-written "where exactly" hints for the served climate regions; countries
// alone cover any region added later.
const DESCRIPTOR: Record<string, string> = {
  Hokkaido: "northern island",
  Honshu: "main island",
  Asia_interior: "inland ranges",
  NA_interior: "Utah, Colorado & eastern Canada",
  NA_northern_rockies: "Montana, Idaho & Alberta",
  NA_pacific_nw: "Washington, Oregon & BC",
  Sierra: "California",
};

export function regionContext(
  climateRegion: string,
  regionIds: string[]
): { flags: string; subtitle: string } {
  const seen = new Set<string>();
  const countries: { flag: string; name: string }[] = [];
  for (const id of regionIds) {
    const prefix = id.split("_")[0];
    if (seen.has(prefix)) continue;
    seen.add(prefix);
    const country = COUNTRY[prefix];
    if (country) countries.push(country);
  }
  const flags = countries.map((c) => c.flag).join("");
  const names = countries.map((c) => c.name).join(" · ");
  const descriptor = DESCRIPTOR[climateRegion];
  return {
    flags,
    subtitle: descriptor && names ? `${names} — ${descriptor}` : names,
  };
}
