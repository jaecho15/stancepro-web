// Resort facility stats (lifts / piste length / difficulty mix) — a faithful
// port of the iOS/Android app's piste + aerialway classification.
//
// SOURCE: the same per-resort GeoJSON the app's Ride Tracker map uses,
// published to Storage at
//   ride-tracker-static/terrain_offpiste_v1/<resortId>/geometry.json
// Features carry RAW OSM tags (aerialway, piste:type, piste:difficulty, …).
//
// The classification below mirrors the app's
// `ResortMapPisteOverpass.feature(fromElement:)` normalisation and the
// `RideTrackerPisteDifficulty` / `RideTrackerLiftType` enums
// (StancePro/Services/ResortMap/ResortMapPisteModels.swift). We do NOT invent
// our own tag mapping — the goal is parity with what the app draws.
//
// RUN COUNT = distinct downhill piste NAMES, not segment count. Only
// piste:type=downhill counts (the app renders these as ski runs); nordic /
// skitour / hike / sled / snowshoe / connection pistes are excluded. OSM also
// splits one run into many `way` segments at every junction, so counting
// segments over-states runs wildly (Whistler = 863 segments). Grouping segments
// by their `name` tag and counting distinct names recovers real runs.
// Freeride/off-piste terrain is not a marked run and is excluded from the count
// and the difficulty mix. Unnamed piste segments (connectors) are not counted,
// and named access pistes (…Traverse / …Drive) are excluded as non-runs.
// NOTE: OSM still names some runs more granularly than a resort's marketing "N
// runs" figure, so for thoroughly-mapped resorts this can run higher — surfaced
// in the UI caveat, not silently trimmed.
//
// Documented refinements for a headline stat (vs. the app's render, which
// harmlessly draws everything):
//   • aerialway=station / pylon are lift infrastructure, not lifts → excluded.
//   • aerialway=zip_line / goods are non-passenger → excluded from the count.
//   • When the resort's footprint bbox is published (meta.json → bbox_4326),
//     features whose centroid falls outside it are clipped, matching the 3D
//     viewer. NOTE: the bbox is the terrain footprint, not a tight boundary, so
//     large LINKED ski areas can still include connected sectors.

import { FACILITY_OVERRIDES, type FacilityOverride } from "./resort-facility-overrides";

const STORAGE_BASE = () =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/ride-tracker-static`;

// --- OSM tag → normalised enums (ported verbatim from the app) ---

export type DifficultyKey =
  | "novice"
  | "easy"
  | "intermediate"
  | "advanced"
  | "expert"
  | "extreme"
  | "freeride"
  | "unknown";

const DIFFICULTY_VALUES = new Set<DifficultyKey>([
  "novice",
  "easy",
  "intermediate",
  "advanced",
  "expert",
  "extreme",
  "freeride",
]);

// RideTrackerPisteDifficulty(osmValue:)
function difficultyFor(raw: string | undefined): DifficultyKey {
  const v = raw?.trim().toLowerCase();
  return v && DIFFICULTY_VALUES.has(v as DifficultyKey) ? (v as DifficultyKey) : "unknown";
}

// RideTrackerLiftType(osmValue:) — passenger aerialway types we count as lifts.
// station/pylon (infrastructure) and zip_line/goods (non-transport) are not here
// and are excluded from the count.
type LiftGroup = "aerial" | "chair" | "surface";
const LIFT_GROUP: Record<string, LiftGroup> = {
  cable_car: "aerial",
  gondola: "aerial",
  mixed_lift: "aerial",
  chair_lift: "chair",
  drag_lift: "surface",
  "t-bar": "surface",
  "j-bar": "surface",
  platter: "surface",
  rope_tow: "surface",
  magic_carpet: "surface",
};

// Hardest-wins when a run's segments disagree on difficulty. unknown = 0 so any
// tagged difficulty overrides an untagged segment of the same run.
const DIFFICULTY_RANK: Record<DifficultyKey, number> = {
  unknown: 0,
  novice: 1,
  easy: 2,
  intermediate: 3,
  advanced: 4,
  expert: 5,
  extreme: 6,
  freeride: 0,
};

export interface ResortFacilityStats {
  resortId: string;
  liftCount: number;
  liftsByGroup: { aerial: number; chair: number; surface: number };
  runCount: number; // distinct named pistes (excl. freeride)
  totalRunKm: number; // summed length of all counted runs
  longestRunKm: number; // longest single run (segments merged by name)
  longestRunName?: string; // name of that longest run, if known
  // Per-run difficulty counts, in display order; only non-zero buckets.
  difficulty: { key: DifficultyKey; count: number }[];
  clipped: boolean; // footprint bbox was available and applied
  verified: boolean; // curated official figures applied (vs. OSM-derived)
  source?: string; // attribution when verified
}

type Coord = [number, number];
interface GeoGeometry {
  type: string;
  coordinates: unknown;
}
interface GeoFeature {
  properties?: Record<string, string> | null;
  geometry?: GeoGeometry | null;
}

// Order used for the difficulty distribution bar (green → black → off-piste).
export const DIFFICULTY_ORDER: DifficultyKey[] = [
  "novice",
  "easy",
  "intermediate",
  "advanced",
  "expert",
  "extreme",
  "freeride",
  "unknown",
];

// Piste colours for the difficulty bar. novice/easy/intermediate follow the app
// map (RideTrackerMapLibreStyle); advanced/expert diverge on purpose — the map's
// near-black is invisible on this dark UI, so advanced is purple and expert grey.
export const DIFFICULTY_COLOR: Record<DifficultyKey, string> = {
  novice: "#2BAA52",
  easy: "#2870C9",
  intermediate: "#D72D27",
  advanced: "#A855F7",
  expert: "#94A3B8",
  extreme: "#7C3AED",
  freeride: "#5F7F99",
  unknown: "#64748B",
};

export const DIFFICULTY_LABEL: Record<DifficultyKey, string> = {
  novice: "Novice",
  easy: "Easy",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
  extreme: "Extreme",
  freeride: "Off-piste",
  unknown: "Unmarked",
};

// --- geometry helpers ---

function isCoord(c: unknown): c is Coord {
  return Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number";
}

function haversineKm(a: Coord, b: Coord): number {
  const R = 6371;
  const toR = (x: number) => (x * Math.PI) / 180;
  const dLat = toR(b[1] - a[1]);
  const dLon = toR(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(a[1])) * Math.cos(toR(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Length in km over a LineString or MultiLineString coordinate array.
function lineLengthKm(coords: unknown): number {
  if (!Array.isArray(coords) || coords.length === 0) return 0;
  if (isCoord(coords[0])) {
    let len = 0;
    for (let i = 1; i < coords.length; i++) {
      if (isCoord(coords[i - 1]) && isCoord(coords[i])) {
        len += haversineKm(coords[i - 1] as Coord, coords[i] as Coord);
      }
    }
    return len;
  }
  return (coords as unknown[]).reduce<number>((s, part) => s + lineLengthKm(part), 0);
}

// Collapse positional variants of the same run to one key: "Peak to Creek -
// Upper" + "Peak to Creek - Lower" → "peak to creek". OSM commonly splits a run
// into Upper/Lower/Middle sections, each separately named; these are one run.
// Numbers are NOT stripped ("Piste 1" / "Piste 2" are genuinely distinct).
// Access/connector pistes that are tagged as downhill but aren't actual runs.
// "Glacier Drive", "Blackcomb Glacier Traverse" etc. are ways to get around, not
// skiable runs, so they're excluded from the run count.
const CONNECTOR_NAME = /\b(traverse|drive)\b/i;

const POSITION_WORDS = /\b(upper|lower|middle|mid|top|bottom)\b/gi;
function baseRunName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(POSITION_WORDS, " ")
    .replace(/[-–—/(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // If a run was literally just "Upper" (base collapses to empty), keep the
  // original so unrelated such runs don't all merge together.
  return base || name.trim().toLowerCase();
}

// Mean of all coordinates — good enough to decide which footprint a feature
// belongs to for clipping.
function centroid(coords: unknown): Coord | null {
  let x = 0;
  let y = 0;
  let n = 0;
  const walk = (c: unknown) => {
    if (isCoord(c)) {
      x += c[0];
      y += c[1];
      n += 1;
    } else if (Array.isArray(c)) {
      c.forEach(walk);
    }
  };
  walk(coords);
  return n ? [x / n, y / n] : null;
}

function computeStats(
  resortId: string,
  features: GeoFeature[],
  bbox: [number, number, number, number] | null
): ResortFacilityStats {
  const liftsByGroup = { aerial: 0, chair: 0, surface: 0 };
  let liftCount = 0;
  // base name → { hardest difficulty, summed length, display name } over that
  // run's segments (freeride / traverse / drive / unnamed excluded).
  const runs = new Map<string, { diff: DifficultyKey; km: number; name: string }>();

  const inBbox = (c: Coord | null) =>
    !bbox || (!!c && c[0] >= bbox[0] && c[0] <= bbox[2] && c[1] >= bbox[1] && c[1] <= bbox[3]);

  for (const f of features) {
    const t = f.properties ?? {};
    const geom = f.geometry;
    if (!geom) continue;

    // Lifecycle filter — the app drops disused=yes / abandoned=yes outright.
    if (t.disused === "yes" || t.abandoned === "yes") continue;
    // Admin boundaries that overlap the bbox are dropped by the app.
    if (t.boundary != null) continue;
    // Resort-perimeter / terrain-park area polygons are kind=boundary in the app.
    if (t.landuse === "winter_sports" || t.area === "yes" || t["piste:area"] === "yes") continue;

    if (!inBbox(centroid(geom.coordinates))) continue;

    if (t.aerialway) {
      const group = LIFT_GROUP[t.aerialway.trim().toLowerCase()];
      if (!group) continue; // station / pylon / zip_line / goods → not a lift
      liftCount += 1;
      liftsByGroup[group] += 1;
    } else if (t["piste:type"]?.trim().toLowerCase() === "downhill") {
      // Only downhill runs — the app renders these as ski runs. nordic / skitour
      // / hike / sled / snowshoe / connection pistes are not counted (they'd
      // otherwise skew the longest run, e.g. Whistler's skitour "Singing Pass").
      const key = difficultyFor(t["piste:difficulty"]);
      if (key === "freeride") continue; // off-piste is not a counted run
      const rawName = (t.name ?? t["piste:name"] ?? "").trim();
      if (!rawName) continue; // unnamed connector segment — not a distinct run
      if (CONNECTOR_NAME.test(rawName)) continue; // traverse / drive — not a run
      const name = baseRunName(rawName);
      const segKm = lineLengthKm(geom.coordinates);
      const run = runs.get(name);
      if (run) {
        run.km += segKm;
        if (DIFFICULTY_RANK[key] > DIFFICULTY_RANK[run.diff]) run.diff = key;
      } else {
        runs.set(name, { diff: key, km: segKm, name: rawName });
      }
    }
  }

  const diffCounts: Partial<Record<DifficultyKey, number>> = {};
  let totalRunKm = 0;
  let longestRunKm = 0;
  let longestRunName: string | undefined;
  for (const run of runs.values()) {
    diffCounts[run.diff] = (diffCounts[run.diff] ?? 0) + 1;
    totalRunKm += run.km;
    if (run.km > longestRunKm) {
      longestRunKm = run.km;
      longestRunName = run.name;
    }
  }
  const difficulty = DIFFICULTY_ORDER.filter((k) => (diffCounts[k] ?? 0) > 0).map((key) => ({
    key,
    count: diffCounts[key] as number,
  }));

  return {
    resortId,
    liftCount,
    liftsByGroup,
    runCount: runs.size,
    totalRunKm,
    longestRunKm,
    longestRunName,
    difficulty,
    clipped: bbox != null,
    verified: false,
  };
}

function emptyStats(resortId: string): ResortFacilityStats {
  return {
    resortId,
    liftCount: 0,
    liftsByGroup: { aerial: 0, chair: 0, surface: 0 },
    runCount: 0,
    totalRunKm: 0,
    longestRunKm: 0,
    difficulty: [],
    clipped: false,
    verified: false,
  };
}

// Build a verified card from curated official figures only. We deliberately do
// NOT fall back to the OSM value for uncurated headline fields — under a
// "verified" badge, mixing an official lift count with an OSM-fragmented
// "longest run" would be misleading. Uncurated fields stay 0 (their card is
// hidden). The OSM difficulty distribution IS kept — shown as a percentage mix,
// it's a proportion indicator that doesn't claim to be an official count.
function applyOverride(
  base: ResortFacilityStats,
  ov: FacilityOverride
): ResortFacilityStats {
  return {
    ...base,
    liftCount: ov.lifts ?? 0,
    liftsByGroup: { aerial: 0, chair: 0, surface: 0 },
    runCount: ov.runs ?? 0,
    totalRunKm: ov.pisteKm ?? 0,
    longestRunKm: ov.longestRunKm ?? 0,
    longestRunName: ov.longestRunName,
    verified: true,
    source: ov.source ?? "Editorially curated (StancePro)",
  };
}

// Fetch + classify. Returns null when the resort has neither published geometry
// nor a curated override (most non-offpiste resorts).
export async function fetchResortFacilityStats(
  resortId: string
): Promise<ResortFacilityStats | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const override = FACILITY_OVERRIDES[resortId];
  const dir = `${STORAGE_BASE()}/terrain_offpiste_v1/${encodeURIComponent(resortId)}`;
  try {
    const [geoRes, metaRes] = await Promise.all([
      fetch(`${dir}/geometry.json`, { next: { revalidate: 21600 } }),
      fetch(`${dir}/meta.json`, { next: { revalidate: 21600 } }),
    ]);

    let osm: ResortFacilityStats | null = null;
    if (geoRes.ok) {
      const geo = (await geoRes.json()) as { features?: GeoFeature[] };
      if (geo.features?.length) {
        let bbox: [number, number, number, number] | null = null;
        if (metaRes.ok) {
          const meta = (await metaRes.json()) as { bbox_4326?: number[] };
          if (Array.isArray(meta.bbox_4326) && meta.bbox_4326.length === 4) {
            bbox = meta.bbox_4326 as [number, number, number, number];
          }
        }
        const s = computeStats(resortId, geo.features, bbox);
        if (s.liftCount > 0 || s.runCount > 0) osm = s;
      }
    }

    if (override) return applyOverride(osm ?? emptyStats(resortId), override);
    return osm;
  } catch {
    return override ? applyOverride(emptyStats(resortId), override) : null;
  }
}
