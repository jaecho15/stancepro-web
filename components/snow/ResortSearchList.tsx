"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Mountain } from "lucide-react";
import type { SnowResort } from "@/lib/snow/types";

import { countryName } from "@/lib/snow/country-name";

export function ResortSearchList({ resorts }: { resorts: SnowResort[] }) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? resorts.filter(
          (r) =>
            r.display_name.toLowerCase().includes(q) ||
            countryName(r.country_code).toLowerCase().includes(q) ||
            r.country_code.toLowerCase() === q
        )
      : resorts;
    const byCountry = new Map<string, SnowResort[]>();
    for (const resort of filtered) {
      const key = countryName(resort.country_code);
      const list = byCountry.get(key) ?? [];
      list.push(resort);
      byCountry.set(key, list);
    }
    return [...byCountry.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [resorts, query]);

  return (
    <div>
      <div className="relative max-w-xl mx-auto mb-10">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search resorts or countries…"
          className="w-full rounded-2xl bg-slate-800/60 border border-slate-700 pl-12 pr-4 py-3.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
        />
      </div>

      {groups.length === 0 && (
        <p className="text-center text-slate-400">No resorts match “{query}”.</p>
      )}

      <div className="space-y-8">
        {groups.map(([country, list]) => (
          <div key={country}>
            <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-3">
              {country} <span className="text-slate-600">({list.length})</span>
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {list.map((resort) => (
                <Link
                  key={resort.resort_id}
                  href={`/snow-forecast/${resort.resort_id}`}
                  className="glass rounded-xl px-4 py-3 flex items-center gap-3 hover:border-brand-500/50 border border-transparent transition-all"
                >
                  <Mountain className="w-4 h-4 text-brand-400 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-white truncate">
                      {resort.display_name}
                    </span>
                    {resort.base_elevation_m !== null && resort.top_elevation_m !== null && (
                      <span className="block text-xs text-slate-500">
                        {Math.round(resort.base_elevation_m)}–
                        {Math.round(resort.top_elevation_m)} m
                      </span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
