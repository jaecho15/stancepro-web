import { regionIdFor } from "./region-locator";
import { countryName } from "./country-name";
import type { SnowResort } from "./types";

// Groups the ~3,466-resort index for browse-by-region UX (user directive:
// the forecast landing shows search / my resorts / region cards instead of
// a full dump). Resorts inside a climate subregion get that region; the
// rest fall back to country groups. Server-side only (polygon data).

export interface RegionGroup {
  key: string; // "r:jp_hokkaido" or "c:AT"
  name: string;
  flags: string;
  count: number;
}

export interface BrowseResort extends SnowResort {
  regionKey: string;
}

const FLAG: Record<string, string> = {};
function flagFor(cc: string): string {
  const upper = cc.toUpperCase();
  if (!FLAG[upper]) {
    FLAG[upper] =
      upper.length === 2 && /^[A-Z]{2}$/.test(upper)
        ? String.fromCodePoint(
            ...[...upper].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)
          )
        : "";
  }
  return FLAG[upper];
}

// "jp_hokkaido" → "Hokkaido", "us_colorado_rockies" → "Colorado Rockies",
// short geo tokens stay fully capitalised ("ca_coastal_bc" → "Coastal BC").
function regionDisplayName(regionId: string): string {
  const [, ...rest] = regionId.split("_");
  return rest
    .map((word) =>
      word.length <= 2
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}

export function buildRegionBrowse(resorts: SnowResort[]): {
  regions: RegionGroup[];
  resorts: BrowseResort[];
} {
  const groups = new Map<string, RegionGroup>();
  const enriched: BrowseResort[] = resorts.map((resort) => {
    const regionId = regionIdFor(resort.lat, resort.lon);
    let key: string;
    if (regionId) {
      key = `r:${regionId}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          name: regionDisplayName(regionId),
          flags: flagFor(regionId.split("_")[0]),
          count: 0,
        });
      }
    } else {
      key = `c:${resort.country_code.toUpperCase()}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          name: countryName(resort.country_code),
          flags: flagFor(resort.country_code),
          count: 0,
        });
      }
    }
    groups.get(key)!.count += 1;
    return { ...resort, regionKey: key };
  });

  // Climate regions first (they're the curated ski geographies), then
  // country buckets — each alphabetical, biggest groups still easy to scan.
  const regions = [...groups.values()].sort((a, b) => {
    const aRegion = a.key.startsWith("r:");
    const bRegion = b.key.startsWith("r:");
    if (aRegion !== bRegion) return aRegion ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { regions, resorts: enriched };
}
