"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Mountain, Plus, Search, X } from "lucide-react";
import { countryName } from "@/lib/snow/country-name";
import type { BrowseResort, RegionGroup } from "@/lib/snow/region-browse";
import type { SeasonalOutlookRow } from "@/lib/snow/types";
import { WorldOutlookHero } from "./WorldOutlookHero";
import { SeasonalOutlookCard } from "./SeasonalOutlookCard";
import { useMyResorts } from "./useMyResorts";

// Unified geographic browser for /snow-forecast (merges the seasonal outlook):
// world map + search + a master-detail 2-pane. Zoom = time horizon — the
// region level shows the seasonal outlook, drilling to a resort is the 16-day
// forecast. The rail toggles between climate regions and countries; the map,
// rail and detail all select the same region.

const SEARCH_LIMIT = 30;

function flagFor(cc: string): string {
  const u = cc.toUpperCase();
  return /^[A-Z]{2}$/.test(u)
    ? String.fromCodePoint(...[...u].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : "🏔";
}

function elevationLabel(r: BrowseResort): string | null {
  if (r.base_elevation_m === null || r.top_elevation_m === null) return null;
  return `${Math.round(r.base_elevation_m)}–${Math.round(r.top_elevation_m)} m`;
}

function resortSub(r: BrowseResort): string {
  const e = elevationLabel(r);
  return e ? `${countryName(r.country_code)} · ${e}` : countryName(r.country_code);
}

function ResortRow({ href, name, sub }: { href: string; name: string; sub?: string | null }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl bg-slate-800/40 border border-transparent px-4 py-3 hover:border-brand-500/50 hover:bg-slate-800/70 transition-all"
    >
      <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-500/10 shrink-0">
        <Mountain className="w-[18px] h-[18px] text-brand-400" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-white truncate">{name}</span>
        {sub && <span className="block text-xs text-slate-500 truncate">{sub}</span>}
      </span>
      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all shrink-0" />
    </Link>
  );
}

interface CountryGroup {
  cc: string;
  name: string;
  flag: string;
  regionKeys: string[];
  count: number;
}

export function SnowBrowser({
  regions,
  resorts,
  mapRows,
  seasonalByRegionKey,
  cardIndexByClimate,
  climatePinToRegionKey,
}: {
  regions: RegionGroup[];
  resorts: BrowseResort[];
  mapRows: SeasonalOutlookRow[];
  seasonalByRegionKey: Record<string, SeasonalOutlookRow>;
  cardIndexByClimate: Record<string, number>;
  climatePinToRegionKey: Record<string, string>;
}) {
  const byKey = useMemo(() => {
    const m = new Map<string, RegionGroup>();
    for (const r of regions) m.set(r.key, r);
    return m;
  }, [regions]);

  const namedRegions = useMemo(() => regions.filter((r) => r.key.startsWith("r:")), [regions]);

  // Default to the first served (map) region so the detail is never empty.
  const firstServedKey = useMemo(() => {
    for (const row of mapRows) {
      const k = climatePinToRegionKey[row.climate_region];
      if (k && byKey.has(k)) return k;
    }
    return namedRegions[0]?.key ?? null;
  }, [mapRows, climatePinToRegionKey, byKey, namedRegions]);

  const [query, setQuery] = useState("");
  const [regionKey, setRegionKey] = useState<string | null>(firstServedKey);
  const [tab, setTab] = useState<"regions" | "countries">("regions");
  const [country, setCountry] = useState<CountryGroup | null>(null);
  const [showAllRegions, setShowAllRegions] = useState(false);
  const my = useMyResorts();
  const mapRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const region = regionKey ? byKey.get(regionKey) ?? null : null;

  const hits = useMemo(() => {
    if (!q) return [];
    return resorts
      .filter(
        (r) =>
          r.display_name.toLowerCase().includes(q) ||
          countryName(r.country_code).toLowerCase().includes(q) ||
          r.country_code.toLowerCase() === q
      )
      .slice(0, SEARCH_LIMIT);
  }, [resorts, q]);

  const regionResorts = useMemo(
    () =>
      regionKey
        ? resorts
            .filter((r) => r.regionKey === regionKey)
            .sort((a, b) => a.display_name.localeCompare(b.display_name))
        : [],
    [resorts, regionKey]
  );

  const countries = useMemo<CountryGroup[]>(() => {
    const m = new Map<string, CountryGroup>();
    const keys = new Map<string, Set<string>>();
    for (const r of resorts) {
      const cc = r.country_code.toUpperCase();
      if (!m.has(cc)) {
        m.set(cc, { cc, name: countryName(cc), flag: flagFor(cc), regionKeys: [], count: 0 });
        keys.set(cc, new Set());
      }
      m.get(cc)!.count += 1;
      keys.get(cc)!.add(r.regionKey);
    }
    for (const [cc, set] of keys) m.get(cc)!.regionKeys = [...set];
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [resorts]);

  const selectRegion = (key: string) => {
    setRegionKey(key);
    setTab("regions");
    setCountry(null);
    setQuery("");
  };

  // Deep link from the seasonal tiles: /snow-forecast?region=<climate_region>.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("region");
    const key = p ? climatePinToRegionKey[p] : undefined;
    if (key && byKey.has(key)) {
      setRegionKey(key);
      setTab("regions");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map pin → select its region (same DOM-enhancement pattern as OutlookHeroSync).
  useEffect(() => {
    const root = mapRef.current;
    if (!root) return;
    const pins = root.querySelectorAll<SVGGElement>("[data-pin]");
    const cleanups: Array<() => void> = [];
    pins.forEach((pin) => {
      const climate = pin.dataset.pin;
      const key = climate ? climatePinToRegionKey[climate] : undefined;
      if (!key || !byKey.has(key)) return;
      const onClick = () => {
        selectRegion(key);
        if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      };
      pin.style.cursor = "pointer";
      pin.addEventListener("click", onClick);
      cleanups.push(() => pin.removeEventListener("click", onClick));
    });
    return () => cleanups.forEach((fn) => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [climatePinToRegionKey, byKey]);

  const seasonalRow = regionKey ? seasonalByRegionKey[regionKey] : undefined;

  const railRegions = showAllRegions ? namedRegions : namedRegions.slice(0, 12);

  return (
    <div className="space-y-6">
      {/* World map — served regions, lean-coloured; tap a pin to open it */}
      <div ref={mapRef}>
        <WorldOutlookHero rows={mapRows} caption="Tap a region on the map, the list, or search a resort" />
      </div>

      {/* Search — jump straight to any resort's 16-day forecast */}
      <div className="relative max-w-2xl mx-auto">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${resorts.length.toLocaleString()} resorts or countries…`}
          className="w-full rounded-2xl bg-slate-800/60 border border-slate-700 pl-12 pr-11 py-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/40 transition-all"
        />
        {searching && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {searching ? (
        <section>
          {hits.length === 0 ? (
            <p className="text-center text-slate-400">No resorts match “{query}”.</p>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-3">
                {hits.length}
                {hits.length === SEARCH_LIMIT ? "+" : ""} result{hits.length === 1 ? "" : "s"}
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {hits.map((r) => (
                  <ResortRow
                    key={r.resort_id}
                    href={`/resort/${r.resort_id}`}
                    name={r.display_name}
                    sub={resortSub(r)}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      ) : (
        <div className="grid lg:grid-cols-[220px_1fr] gap-6 items-start">
          {/* Master rail */}
          <div className="glass rounded-2xl p-2.5 lg:sticky lg:top-24">
            <div className="flex rounded-xl bg-slate-800/60 p-1 mb-2.5">
              {(["regions", "countries"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTab(t);
                    setCountry(null);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                    tab === t ? "bg-brand-500 text-white shadow" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="max-h-[420px] overflow-y-auto space-y-0.5 pr-0.5">
              {tab === "regions" ? (
                <>
                  {railRegions.map((r) => {
                    const lean = seasonalByRegionKey[r.key]?.payload.signal?.lean;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => selectRegion(r.key)}
                        className={`w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-all ${
                          regionKey === r.key
                            ? "bg-brand-500/15 text-white"
                            : "text-slate-300 hover:bg-slate-800/60"
                        }`}
                      >
                        <span aria-hidden>{r.flags || "🏔"}</span>
                        <span className="flex-1 truncate">{r.name}</span>
                        {seasonalByRegionKey[r.key] && (
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{
                              background:
                                lean === "above"
                                  ? "#378ADD"
                                  : lean === "below"
                                    ? "#EF9F27"
                                    : "#94a3b8",
                            }}
                          />
                        )}
                      </button>
                    );
                  })}
                  {namedRegions.length > 12 && !showAllRegions && (
                    <button
                      type="button"
                      onClick={() => setShowAllRegions(true)}
                      className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800/60"
                    >
                      <Plus className="w-3.5 h-3.5 inline mr-1" />
                      {namedRegions.length - 12} more regions
                    </button>
                  )}
                </>
              ) : (
                countries.map((c) => (
                  <button
                    key={c.cc}
                    type="button"
                    onClick={() => setCountry(c)}
                    className={`w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-all ${
                      country?.cc === c.cc
                        ? "bg-brand-500/15 text-white"
                        : "text-slate-300 hover:bg-slate-800/60"
                    }`}
                  >
                    <span aria-hidden>{c.flag}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-slate-500">{c.count}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Detail */}
          <div className="min-w-0">
            {tab === "countries" && country ? (
              <section>
                <button
                  type="button"
                  onClick={() => setCountry(null)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/60 border border-slate-700 px-3.5 py-1.5 text-sm text-slate-300 hover:text-white hover:border-slate-500 transition-all mb-4"
                >
                  <ArrowLeft className="w-4 h-4" /> Countries
                </button>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2.5 mb-1">
                  <span aria-hidden>{country.flag}</span> {country.name}
                </h2>
                <p className="text-sm text-slate-500 mb-4">
                  {country.regionKeys.length} region
                  {country.regionKeys.length === 1 ? "" : "s"} · pick one
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {country.regionKeys
                    .map((k) => byKey.get(k))
                    .filter((r): r is RegionGroup => !!r)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => selectRegion(r.key)}
                        className="group text-left rounded-xl bg-slate-800/40 border border-transparent px-4 py-3 hover:border-brand-500/50 hover:bg-slate-800/70 transition-all flex items-center gap-3"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-white truncate">
                            {r.name}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {r.count} resort{r.count === 1 ? "" : "s"}
                          </span>
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all" />
                      </button>
                    ))}
                </div>
              </section>
            ) : region ? (
              <section className="space-y-5">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-2xl font-bold text-white flex items-center gap-2.5">
                    <span aria-hidden>{region.flags || "🏔"}</span> {region.name}
                  </h2>
                  <span className="text-sm text-slate-500">
                    {region.count} resort{region.count === 1 ? "" : "s"}
                  </span>
                </div>

                {seasonalRow && (
                  <SeasonalOutlookCard
                    row={seasonalRow}
                    index={cardIndexByClimate[seasonalRow.climate_region] ?? 0}
                  />
                )}

                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 mb-3">
                    Resorts — open for the 16-day forecast
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {regionResorts.map((r) => (
                      <ResortRow
                        key={r.resort_id}
                        href={`/resort/${r.resort_id}`}
                        name={r.display_name}
                        sub={elevationLabel(r)}
                      />
                    ))}
                  </div>
                </div>
              </section>
            ) : (
              <p className="text-slate-400">Pick a region to see its outlook and resorts.</p>
            )}

            {/* My resorts — quick access under the detail */}
            {my.ready && my.resorts.length > 0 && (
              <section className="mt-8">
                <h2 className="text-xs uppercase tracking-wide text-slate-500 mb-3">My resorts</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  {my.resorts.map((saved) => (
                    <ResortRow
                      key={saved.id}
                      href={`/resort/${saved.id}`}
                      name={saved.name}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
