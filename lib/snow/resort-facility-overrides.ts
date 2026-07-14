// Curated official facility figures for famous resorts, keyed by resort_id.
//
// WHY: for well-known resorts the OSM-derived stats are visibly off from the
// numbers people know — OSM fragments long runs across inconsistently-named
// segments (Whistler's Peak to Creek won't reconstruct to its true ~11 km), and
// "runs" counted from OSM names differ from a resort's marketing figure. For
// these headliners we overlay the resort's own published numbers; everything
// else falls back to the OSM computation with its honest caveat.
//
// These are editorially curated (StancePro) from each resort's official figures
// — not live-scraped. Any field left undefined falls back to the OSM value.
// Extend freely: key is the resort_id (osm-way-… / osm-relation-…), values are
// the official headline figures. km figures are total marked-piste length;
// US/Canada resorts that publish acres instead keep km from OSM (omit pisteKm).

export interface FacilityOverride {
  lifts?: number;
  runs?: number;
  pisteKm?: number;
  longestRunKm?: number;
  longestRunName?: string;
  source?: string; // defaults to "Editorially curated (StancePro)"
}

export const FACILITY_OVERRIDES: Record<string, FacilityOverride> = {
  // Whistler Blackcomb (CA) — 8,171 acres; famous Peak to Creek ~11 km.
  "osm-way-474288286": {
    lifts: 37,
    runs: 200,
    pisteKm: 200,
    longestRunKm: 11,
    longestRunName: "Peak to Creek",
  },
  // Zermatt – Breuil-Cervinia (CH/IT), Matterhorn ski paradise — 360 km combined.
  "osm-way-540681046": {
    lifts: 53,
    runs: 200,
    pisteKm: 360,
    longestRunKm: 25,
    longestRunName: "Klein Matterhorn – Zermatt",
  },
  // Val Thorens (FR), resort proper within the 3 Vallées — 150 km.
  "osm-way-1422277144": {
    lifts: 29,
    runs: 79,
    pisteKm: 150,
    longestRunKm: 12,
  },
  // Tignes – Val d'Isère (FR), Espace Killy — 300 km.
  "osm-way-45421423": {
    lifts: 78,
    runs: 150,
    pisteKm: 300,
  },
  // 4 Vallées – Verbier (CH) — 410 km.
  "osm-way-660203241": {
    lifts: 80,
    runs: 200,
    pisteKm: 410,
  },
  // Sölden (AT) — 144 km.
  "osm-way-438793320": {
    lifts: 31,
    pisteKm: 144,
  },
  // Ischgl / Silvretta Arena Ischgl-Samnaun (AT/CH) — 239 km.
  "osm-way-539395530": {
    lifts: 45,
    pisteKm: 239,
  },
  // La Plagne (FR), within Paradiski — 225 km.
  "osm-way-589003346": {
    lifts: 80,
    pisteKm: 225,
  },
  // Cortina d'Ampezzo (IT) — 120 km.
  "osm-relation-6990942": {
    lifts: 34,
    pisteKm: 120,
  },
  // Vail (US) — 5,317 acres; longest Riva Ridge ~6.4 km (km from OSM).
  "osm-way-531009607": {
    lifts: 31,
    runs: 195,
    longestRunKm: 6.4,
    longestRunName: "Riva Ridge",
  },
  // Breckenridge (US) — 2,908 acres; longest Four O'Clock ~5.6 km (km from OSM).
  "osm-way-531005985": {
    lifts: 35,
    runs: 187,
    longestRunKm: 5.6,
    longestRunName: "Four O'Clock",
  },
};
