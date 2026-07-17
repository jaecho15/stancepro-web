import bridge from "@/api/data/snow_outlook_slug_to_osm.json";

type SlugEntry = { osm_id?: string };
const bySlug: Record<string, SlugEntry> =
  (bridge as { by_slug?: Record<string, SlugEntry> }).by_slug ?? {};

// The 3D terrain artifacts (offpiste 5m tiles, aspect/elevation PNGs) are stored
// under the resort's OSM/manual weather id — the same id the Ride Tracker index
// and short-range forecasts use — not the curated snow_outlook slug. So the
// /resort/{slug} page must hand the 3D viewer the mapped weather id; otherwise the
// engine requests slug-keyed artifacts that 404 (coarse 30 m fallback terrain and
// a permanently-disabled aspect toggle). osm-/manual- ids pass through unchanged;
// an unmapped slug falls back to itself (never worse than the slug it started as).
export function terrainResortId(resortId: string): string {
  if (resortId.startsWith("osm-") || resortId.startsWith("manual-")) return resortId;
  return bySlug[resortId]?.osm_id ?? resortId;
}
