import { createClient } from "@supabase/supabase-js";
import type { ForecastResponse, SeasonalOutlookRow, SnowResort } from "./types";

// Cookie-free server-side reads (anon key) so snow pages stay ISR-cacheable,
// mirroring lib/stance/fetch-rules.ts.
function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const STORAGE_BASE = () =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/ride-tracker-static`;

interface ResortIndexEntry {
  id: string;
  name: string;
  names?: { en?: string };
  lat: number;
  lon: number;
  country: string;
  base_elevation_m?: number | null;
  top_elevation_m?: number | null;
}

// The full map ski-resort index (~3,466 OSM resorts) — the same catalog the
// app's Ride Tracker map and short-range list use. Published to Storage as
// ski-resorts/manifest.json → production/ski_resorts_v<N>.json.
export async function fetchResortIndex(): Promise<SnowResort[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  try {
    const manifestRes = await fetch(`${STORAGE_BASE()}/ski-resorts/manifest.json`, {
      next: { revalidate: 21600 },
    });
    if (!manifestRes.ok) return [];
    const manifest = (await manifestRes.json()) as { file?: string };
    if (!manifest.file) return [];

    const indexRes = await fetch(`${STORAGE_BASE()}/ski-resorts/${manifest.file}`, {
      next: { revalidate: 21600 },
    });
    if (!indexRes.ok) return [];
    const index = (await indexRes.json()) as { resorts?: ResortIndexEntry[] };

    return (index.resorts ?? [])
      .map((entry) => ({
        resort_id: entry.id,
        display_name: entry.names?.en ?? entry.name,
        country_code: entry.country,
        region_id: null,
        lat: entry.lat,
        lon: entry.lon,
        base_elevation_m: entry.base_elevation_m ?? null,
        top_elevation_m: entry.top_elevation_m ?? null,
      }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  } catch {
    return [];
  }
}

export async function fetchSnowResorts(): Promise<SnowResort[]> {
  const supabase = anonClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("snow_outlook_resorts")
    .select(
      "resort_id, display_name, country_code, region_id, lat, lon, base_elevation_m, top_elevation_m"
    )
    .eq("is_active", true)
    .order("display_name");
  return (data as SnowResort[] | null) ?? [];
}

// Detail-page resolution across both id spaces: OSM index ids (osm-way-…)
// live in the Storage index; curated slugs (cardrona, …) in the DB table.
export async function resolveResort(resortId: string): Promise<SnowResort | null> {
  if (resortId.startsWith("osm-")) {
    const index = await fetchResortIndex();
    return index.find((resort) => resort.resort_id === resortId) ?? null;
  }
  return fetchSnowResort(resortId);
}

export async function fetchSnowResort(resortId: string): Promise<SnowResort | null> {
  const supabase = anonClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("snow_outlook_resorts")
    .select(
      "resort_id, display_name, country_code, region_id, lat, lon, base_elevation_m, top_elevation_m"
    )
    .eq("resort_id", resortId)
    .maybeSingle();
  return (data as SnowResort | null) ?? null;
}

export async function fetchSeasonalOutlooks(): Promise<SeasonalOutlookRow[]> {
  const supabase = anonClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("seasonal_snow_outlooks")
    .select(
      "climate_region, label, region_ids, resort_ids, payload, enso_state, target_season, generated_at"
    )
    .order("label");
  return (data as SeasonalOutlookRow[] | null) ?? [];
}

// locatedRegionId: the geographic fallback (region-locator) for index resorts
// that have no curated slug/region — resolved by the caller so this module
// stays free of the polygon data (client bundles import fetchForecastClient).
export function seasonalOutlookForResort(
  rows: SeasonalOutlookRow[],
  resort: { resort_id: string; region_id: string | null },
  locatedRegionId?: string | null
): SeasonalOutlookRow | null {
  const regionId = resort.region_id ?? locatedRegionId ?? null;
  return (
    rows.find((row) => row.resort_ids.includes(resort.resort_id)) ??
    (regionId ? rows.find((row) => row.region_ids.includes(regionId)) : null) ??
    null
  );
}

// Client-side forecast fetch: prefer the on-demand Vercel function (computes
// and caches when stale); fall back to the Supabase serving table directly
// (cache-only) — e.g. under `next dev`, which doesn't run api/*.py functions.
// OSM index resorts aren't rows in snow_outlook_resorts, so their coordinates
// and band elevations ride along as the API's documented override params.
export async function fetchForecastClient(resort: SnowResort): Promise<ForecastResponse | null> {
  const resortId = resort.resort_id;
  const params = new URLSearchParams({ resort_id: resortId });
  if (resortId.startsWith("osm-")) {
    params.set("lat", String(resort.lat));
    params.set("lon", String(resort.lon));
    if (resort.base_elevation_m !== null) params.set("base_m", String(resort.base_elevation_m));
    if (resort.top_elevation_m !== null) params.set("top_m", String(resort.top_elevation_m));
    params.set("country", resort.country_code);
  }
  try {
    const response = await fetch(`/api/short-range-snow?${params.toString()}`, {
      signal: AbortSignal.timeout(45_000),
    });
    if (response.ok) {
      const body = (await response.json()) as ForecastResponse;
      if (body?.payload) return body;
    }
  } catch {
    // fall through to the cache table
  }

  const supabase = anonClient();
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from("short_range_forecasts")
      .select("resort_id, payload, summary, generated_at, config_version")
      .eq("resort_id", resortId)
      .maybeSingle();
    if (!data?.payload) return null;
    return { ...(data as ForecastResponse), cached: true };
  } catch {
    return null;
  }
}
