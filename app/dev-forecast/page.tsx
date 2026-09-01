"use client";

/**
 * Dev-only harness that renders the REAL ForecastView against a frozen payload.
 *
 * Why this exists: the live forecast page sits behind the auth gate, so it
 * cannot be opened to check a rendering change. Building a lookalike mockup
 * instead is worse than useless — it shows a layout the product does not have
 * and invites sign-off on something that was never built.
 *
 * So this renders the actual component, imports and all. The only thing faked
 * is the network: `fetchForecastClient` calls `/api/short-range-snow`, and that
 * one request is answered from `fixture.json` — a real serving row pulled
 * straight from `short_range_forecasts`. Everything below the fetch is
 * production code on production data.
 *
 * Not linked from anywhere and carries no auth. It is also compiled out of
 * production: the live forecast page sits behind the auth gate for a reason,
 * and an unauthenticated route rendering a frozen payload has no business
 * existing there even though the data itself is public. Locally it is the only
 * way to review a rendering change.
 */

import { useEffect, useState } from "react";

import { ForecastView } from "@/components/snow/ForecastView";

import fixture from "./fixture.json";

/** Frozen fixture predates hourly slots. Synthesize 24 local hours so this
 *  harness can review the 24h strip without a live fetch. */
function fixtureWithHourly() {
  const clone = JSON.parse(JSON.stringify(fixture)) as {
    payload?: { daily?: Array<Record<string, unknown> & {
      layer?: string;
      time_of_day?: Array<{
        snow_cm_p50?: number;
        precip_mm_p50?: number;
        temp_c_p50?: number;
        precip_type?: string;
        weather_code?: number | null;
        wind_kmh?: number | null;
        wind_dir_deg?: number | null;
        wind_gust_kmh?: number | null;
      }>;
    }> };
  };
  const daily = clone.payload?.daily ?? [];
  for (const row of daily) {
    if (row.layer !== "D1-7") continue;
    const blocks = row.time_of_day ?? [];
    row.hourly = Array.from({ length: 24 }, (_, hour) => {
      const block = blocks[Math.min(3, Math.floor(hour / 6))];
      const snow = (block?.snow_cm_p50 ?? 0) / 6;
      return {
        hour,
        snow_cm_p50: Math.round(snow * 10) / 10,
        precip_mm_p50: Math.round(((block?.precip_mm_p50 ?? 0) / 6) * 10) / 10,
        rain_mm_p50: 0,
        temp_c_p50: block?.temp_c_p50 ?? 0,
        precip_type: block?.precip_type ?? "snow",
        weather_code: block?.weather_code ?? 73,
        wind_kmh: block?.wind_kmh ?? null,
        wind_dir_deg: block?.wind_dir_deg ?? null,
        wind_gust_kmh: block?.wind_gust_kmh ?? null,
      };
    });
  }
  return clone;
}

const FIXTURE_RESORT = {
  resort_id: "osm-way-482928467",
  name: "Cardrona",
  country_code: "NZ",
  lat: -44.86575,
  lon: 168.945702,
  base_elevation_m: 1259,
  top_elevation_m: 1904,
} as const;

export default function DevForecastPage() {
  const [ready, setReady] = useState(false);


  useEffect(() => {
    const original = window.fetch;
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/short-range-snow")) {
        return new Response(JSON.stringify(fixtureWithHourly()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return original(input, init);
    }) as typeof window.fetch;
    setReady(true);
    // The pane's scroll is unreliable, so jump once the strip has mounted.
    // jumpTo-style, not smooth: a hidden tab starves the animation frames a
    // smooth scroll depends on and it silently never arrives.
    const timer = window.setTimeout(() => {
      document.querySelector(".overflow-x-auto")?.scrollIntoView({ block: "start" });
    }, 400);
    return () => {
      window.clearTimeout(timer);
      window.fetch = original;
    };
  }, []);

  // AFTER every hook: an early return placed between useState and useEffect
  // changes the hook count between environments, which is the rules-of-hooks
  // violation that type-checking does not catch and the build happily ships.
  if (process.env.NODE_ENV === "production") {
    return (
      <main className="min-h-screen bg-slate-900 p-6">
        <p className="text-sm text-slate-400">Not available.</p>
      </main>
    );
  }

  return (
    // Deliberately chrome-free: the preview pane cannot scroll reliably (a
    // hidden tab starves rAF), so anything below the fold is unreviewable. The
    // component under review has to land in the first screen.
    <main className="min-h-screen bg-slate-900 px-3 py-2">
      <div className="mx-auto max-w-3xl space-y-2">
        {ready ? (
          <ForecastView resort={FIXTURE_RESORT as never} />
        ) : (
          <p className="text-sm text-slate-400">preparing fixture…</p>
        )}
      </div>
    </main>
  );
}
