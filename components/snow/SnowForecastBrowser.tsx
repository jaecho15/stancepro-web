"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Mountain,
  Plus,
  Search,
  Star,
  X,
} from "lucide-react";
import { countryName } from "@/lib/snow/country-name";
import type { BrowseResort, RegionGroup } from "@/lib/snow/region-browse";
import { useMyResorts } from "./useMyResorts";

// Forecast landing (user directive): reaching a resort must be staged, not a
// long scroll. One screen shows search + saved resorts + region tiles;
// choosing a region *replaces* the view with that region's resort list
// (drill-in, not an inline append). Search is a shortcut at any point.

const SEARCH_LIMIT = 30;

function elevationLabel(resort: BrowseResort): string | null {
  if (resort.base_elevation_m === null || resort.top_elevation_m === null) return null;
  return `${Math.round(resort.base_elevation_m)}–${Math.round(resort.top_elevation_m)} m`;
}

function resortSub(resort: BrowseResort): string {
  const elev = elevationLabel(resort);
  return elev ? `${countryName(resort.country_code)} · ${elev}` : countryName(resort.country_code);
}

function ResortRow({
  href,
  name,
  sub,
}: {
  href: string;
  name: string;
  sub?: string | null;
}) {
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

function RegionTile({
  region,
  onClick,
}: {
  region: RegionGroup;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left rounded-2xl bg-slate-800/50 border border-slate-700/70 p-4 hover:border-brand-500/60 hover:bg-slate-800/80 transition-all"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-2xl leading-none" aria-hidden>
          {region.flags || "🏔"}
        </span>
        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all" />
      </span>
      <span className="block text-sm font-semibold text-white leading-tight mt-3">
        {region.name}
      </span>
      <span className="block text-xs text-slate-500 mt-0.5">
        {region.count} resort{region.count === 1 ? "" : "s"}
      </span>
    </button>
  );
}

export function SnowForecastBrowser({
  regions,
  resorts,
}: {
  regions: RegionGroup[];
  resorts: BrowseResort[];
}) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<RegionGroup | null>(null);
  const [showCountries, setShowCountries] = useState(false);
  const my = useMyResorts();

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

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

  const byId = useMemo(() => {
    const map = new Map<string, BrowseResort>();
    for (const resort of resorts) map.set(resort.resort_id, resort);
    return map;
  }, [resorts]);

  const regionResorts = useMemo(
    () =>
      region
        ? resorts
            .filter((r) => r.regionKey === region.key)
            .sort((a, b) => a.display_name.localeCompare(b.display_name))
        : [],
    [resorts, region]
  );

  const namedRegions = useMemo(() => regions.filter((r) => r.key.startsWith("r:")), [regions]);
  const countryRegions = useMemo(() => regions.filter((r) => r.key.startsWith("c:")), [regions]);

  const openRegion = (r: RegionGroup) => {
    setRegion(r);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-8">
      {/* Search — persistent shortcut to any resort */}
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

      {/* View precedence: search → region drill-in → browse */}
      {searching ? (
        <section>
          {hits.length === 0 ? (
            <p className="text-center text-slate-400">No resorts match “{query}”.</p>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-3">
                {hits.length}
                {hits.length === SEARCH_LIMIT ? "+" : ""} result
                {hits.length === 1 ? "" : "s"}
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {hits.map((resort) => (
                  <ResortRow
                    key={resort.resort_id}
                    href={`/resort/${resort.resort_id}`}
                    name={resort.display_name}
                    sub={resortSub(resort)}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      ) : region ? (
        <section>
          <button
            type="button"
            onClick={() => setRegion(null)}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/60 border border-slate-700 px-3.5 py-1.5 text-sm text-slate-300 hover:text-white hover:border-slate-500 transition-all mb-5"
          >
            <ArrowLeft className="w-4 h-4" /> All regions
          </button>
          <div className="flex items-baseline gap-3 mb-4">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2.5">
              <span aria-hidden>{region.flags || "🏔"}</span> {region.name}
            </h2>
            <span className="text-sm text-slate-500">
              {region.count} resort{region.count === 1 ? "" : "s"}
            </span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {regionResorts.map((resort) => (
              <ResortRow
                key={resort.resort_id}
                href={`/resort/${resort.resort_id}`}
                name={resort.display_name}
                sub={elevationLabel(resort)}
              />
            ))}
          </div>
        </section>
      ) : (
        <>
          {/* My resorts */}
          <section>
            <h2 className="text-xs uppercase tracking-wide text-slate-500 mb-3 flex items-center gap-2">
              <Star className="w-3.5 h-3.5 text-amber-400" /> My resorts
            </h2>
            {my.ready && my.resorts.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nothing saved yet — open a resort and hit “Save resort”. Saved resorts show up
                here for one-tap access.
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {my.resorts.map((saved) => {
                  const resort = byId.get(saved.id);
                  return (
                    <ResortRow
                      key={saved.id}
                      href={`/resort/${saved.id}`}
                      name={resort?.display_name ?? saved.name}
                      sub={resort ? resortSub(resort) : null}
                    />
                  );
                })}
              </div>
            )}
          </section>

          {/* Browse by region */}
          <section>
            <h2 className="text-xs uppercase tracking-wide text-slate-500 mb-3">
              Browse by region
            </h2>
            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
              {namedRegions.map((r) => (
                <RegionTile key={r.key} region={r} onClick={() => openRegion(r)} />
              ))}
            </div>

            {countryRegions.length > 0 && (
              <div className="mt-4">
                {showCountries ? (
                  <>
                    <h3 className="text-xs uppercase tracking-wide text-slate-600 mb-3">
                      More countries
                    </h3>
                    <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
                      {countryRegions.map((r) => (
                        <RegionTile key={r.key} region={r} onClick={() => openRegion(r)} />
                      ))}
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCountries(true)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/50 border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:text-white hover:border-slate-500 transition-all"
                  >
                    <Plus className="w-4 h-4" /> {countryRegions.length} more countr
                    {countryRegions.length === 1 ? "y" : "ies"}
                  </button>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
