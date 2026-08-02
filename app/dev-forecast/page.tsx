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
 * Not linked from anywhere and carries no auth, so it must never hold anything
 * that is not already public in a forecast payload.
 */

import { useEffect, useState } from "react";

import { ForecastView } from "@/components/snow/ForecastView";

import fixture from "./fixture.json";

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
        return new Response(JSON.stringify(fixture), {
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
