"use client";

import { useMemo, useState } from "react";
import { Mountain, Search } from "lucide-react";
import { countryName } from "@/lib/snow/country-name";
import type { SnowResort } from "@/lib/snow/types";

export interface FeaturedResort {
  id: string;
  name: string;
  country: string;
  blurb: string;
}

const MAX_HITS = 30;

export function ShowcaseViewer({
  resorts,
  index,
}: {
  resorts: FeaturedResort[];
  index: SnowResort[];
}) {
  const [active, setActive] = useState(resorts[0]);
  const [query, setQuery] = useState("");

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return index
      .filter(
        (r) =>
          r.display_name.toLowerCase().includes(q) ||
          countryName(r.country_code).toLowerCase().includes(q) ||
          r.country_code.toLowerCase() === q
      )
      .slice(0, MAX_HITS);
  }, [index, query]);

  function openResort(resort: SnowResort) {
    setActive({
      id: resort.resort_id,
      name: resort.display_name,
      country: resort.country_code.toUpperCase(),
      blurb:
        resort.base_elevation_m !== null && resort.top_elevation_m !== null
          ? `${Math.round(resort.base_elevation_m)}–${Math.round(resort.top_elevation_m)} m · ${countryName(resort.country_code)}`
          : countryName(resort.country_code),
    });
    setQuery("");
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 justify-center">
        {resorts.map((resort) => (
          <button
            key={resort.id}
            type="button"
            onClick={() => setActive(resort)}
            className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
              active.id === resort.id
                ? "border-brand-500 bg-brand-500/15 text-white"
                : "border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-500"
            }`}
          >
            {resort.name}
            <span className="ml-1.5 text-xs opacity-60">{resort.country}</span>
          </button>
        ))}
      </div>

      {/* Any-resort search over the full map index */}
      <div className="relative max-w-xl mx-auto mb-5">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`…or search all ${index.length.toLocaleString()} resorts`}
          className="w-full rounded-2xl bg-slate-800/60 border border-slate-700 pl-11 pr-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
        />
        {hits.length > 0 && (
          <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur max-h-80 overflow-y-auto shadow-xl">
            {hits.map((resort) => (
              <button
                key={resort.resort_id}
                type="button"
                onClick={() => openResort(resort)}
                className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-slate-800 transition-colors"
              >
                <Mountain className="w-4 h-4 text-brand-400 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm text-white truncate">
                    {resort.display_name}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {countryName(resort.country_code)}
                    {resort.base_elevation_m !== null && resort.top_elevation_m !== null
                      ? ` · ${Math.round(resort.base_elevation_m)}–${Math.round(resort.top_elevation_m)} m`
                      : ""}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <iframe
          key={active.id}
          src={`/resort-3d/${active.id}/view?name=${encodeURIComponent(active.name)}`}
          title={`${active.name} 3D terrain`}
          className="w-full h-[70vh] min-h-[420px] block border-0"
          allow="fullscreen"
        />
        <div className="px-5 py-3 flex items-center gap-2 text-sm text-slate-400 border-t border-slate-700/50">
          <Mountain className="w-4 h-4 text-brand-400 shrink-0" />
          <span>
            <span className="text-slate-200 font-medium">{active.name}</span>
            {" — "}
            {active.blurb}
          </span>
        </div>
      </div>
    </div>
  );
}
