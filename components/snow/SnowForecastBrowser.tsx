"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Mountain, Search, Star, X } from "lucide-react";
import { countryName } from "@/lib/snow/country-name";
import type { BrowseResort, RegionGroup } from "@/lib/snow/region-browse";
import { useMyResorts } from "./useMyResorts";

// Forecast landing browser (user directive): no full resort dump — a search
// box, the user's saved resorts, and region cards that expand into that
// region's list. Rows link to the unified resort page.

const SEARCH_LIMIT = 30;

function ResortRow({ resort }: { resort: BrowseResort }) {
  return (
    <Link
      href={`/resort/${resort.resort_id}`}
      className="glass rounded-xl px-4 py-3 flex items-center gap-3 hover:border-brand-500/50 border border-transparent transition-all"
    >
      <Mountain className="w-4 h-4 text-brand-400 shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-white truncate">
          {resort.display_name}
        </span>
        <span className="block text-xs text-slate-500">
          {countryName(resort.country_code)}
          {resort.base_elevation_m !== null && resort.top_elevation_m !== null
            ? ` · ${Math.round(resort.base_elevation_m)}–${Math.round(resort.top_elevation_m)} m`
            : ""}
        </span>
      </span>
    </Link>
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
  const [openRegion, setOpenRegion] = useState<string | null>(null);
  const my = useMyResorts();

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return resorts
      .filter(
        (r) =>
          r.display_name.toLowerCase().includes(q) ||
          countryName(r.country_code).toLowerCase().includes(q) ||
          r.country_code.toLowerCase() === q
      )
      .slice(0, SEARCH_LIMIT);
  }, [resorts, query]);

  const byId = useMemo(() => {
    const map = new Map<string, BrowseResort>();
    for (const resort of resorts) map.set(resort.resort_id, resort);
    return map;
  }, [resorts]);

  const openRegionResorts = useMemo(
    () =>
      openRegion
        ? resorts
            .filter((r) => r.regionKey === openRegion)
            .sort((a, b) => a.display_name.localeCompare(b.display_name))
        : [],
    [resorts, openRegion]
  );

  return (
    <div className="space-y-10">
      {/* Search */}
      <div>
        <div className="relative max-w-xl mx-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${resorts.length.toLocaleString()} resorts or countries…`}
            className="w-full rounded-2xl bg-slate-800/60 border border-slate-700 pl-12 pr-4 py-3.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
          />
        </div>
        {hits && (
          <div className="mt-4">
            {hits.length === 0 ? (
              <p className="text-center text-slate-400">No resorts match “{query}”.</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {hits.map((resort) => (
                  <ResortRow key={resort.resort_id} resort={resort} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* My resorts */}
      {!hits && (
        <section>
          <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-3 flex items-center gap-2">
            <Star className="w-3.5 h-3.5 text-amber-400" /> My resorts
          </h2>
          {my.ready && my.resorts.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nothing saved yet — search for a resort or browse a region, then
              hit “Save resort” on its page. Saved resorts show up here.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {my.resorts.map((saved) => {
                const resort = byId.get(saved.id);
                return resort ? (
                  <ResortRow key={saved.id} resort={resort} />
                ) : (
                  <Link
                    key={saved.id}
                    href={`/resort/${saved.id}`}
                    className="glass rounded-xl px-4 py-3 flex items-center gap-3 hover:border-brand-500/50 border border-transparent transition-all"
                  >
                    <Mountain className="w-4 h-4 text-brand-400 shrink-0" />
                    <span className="text-sm font-medium text-white truncate">
                      {saved.name}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Browse by region */}
      {!hits && (
        <section>
          <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-3">
            Browse by region
          </h2>
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
            {regions.filter((r) => r.key.startsWith("r:")).map((region) => {
              const open = openRegion === region.key;
              return (
                <button
                  key={region.key}
                  type="button"
                  onClick={() => setOpenRegion(open ? null : region.key)}
                  className={`glass rounded-xl p-4 text-left border transition-all ${
                    open
                      ? "border-brand-500/60"
                      : "border-transparent hover:border-slate-500/60"
                  }`}
                >
                  <span className="flex items-start justify-between gap-1">
                    <span className="text-sm font-semibold text-white leading-tight">
                      {region.flags} {region.name}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5 transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </span>
                  <span className="block text-xs text-slate-500 mt-1">
                    {region.count} resort{region.count === 1 ? "" : "s"}
                  </span>
                </button>
              );
            })}
          </div>

          {regions.some((r) => r.key.startsWith("c:")) && (
            <>
              <h3 className="text-xs uppercase tracking-wide text-slate-600 mt-6 mb-3">
                More countries
              </h3>
              <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
                {regions.filter((r) => r.key.startsWith("c:")).map((region) => {
                  const open = openRegion === region.key;
                  return (
                    <button
                      key={region.key}
                      type="button"
                      onClick={() => setOpenRegion(open ? null : region.key)}
                      className={`glass rounded-xl p-4 text-left border transition-all ${
                        open
                          ? "border-brand-500/60"
                          : "border-transparent hover:border-slate-500/60"
                      }`}
                    >
                      <span className="flex items-start justify-between gap-1">
                        <span className="text-sm font-semibold text-white leading-tight">
                          {region.flags} {region.name}
                        </span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5 transition-transform ${open ? "rotate-180" : ""}`}
                        />
                      </span>
                      <span className="block text-xs text-slate-500 mt-1">
                        {region.count} resort{region.count === 1 ? "" : "s"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {openRegion && (
            <div className="mt-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">
                  {regions.find((r) => r.key === openRegion)?.flags}{" "}
                  {regions.find((r) => r.key === openRegion)?.name}
                </h3>
                <button
                  type="button"
                  onClick={() => setOpenRegion(null)}
                  className="text-slate-500 hover:text-white transition-colors"
                  aria-label="Close region list"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {openRegionResorts.map((resort) => (
                  <ResortRow key={resort.resort_id} resort={resort} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
