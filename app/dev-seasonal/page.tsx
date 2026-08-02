"use client";

/**
 * Dev-only harness that renders the REAL SeasonalOutlookCard against a frozen
 * row. Sibling of /dev-forecast, same reasoning: the seasonal outlook lives on
 * pages behind the auth gate, so a rendering change to the year-by-year chart
 * cannot otherwise be reviewed. A lookalike mockup would be worse than useless
 * — it shows a layout the product does not have.
 *
 * SeasonalOutlookCard takes its whole input as one prop, so nothing needs to be
 * faked at the network layer: `fixture.json` is a real `seasonal_snow_outlooks`
 * row (no_southern_norway, 35 seasons, rising snow line) passed straight in.
 * Everything rendered below is production code on production data.
 *
 * Not linked from anywhere and carries no auth. Compiled out of production for
 * the same reason /dev-forecast is.
 */

import type { SeasonalOutlookRow } from "@/lib/snow/types";

import { SeasonalOutlookCard } from "@/components/snow/SeasonalOutlookCard";

import fixture from "./fixture.json";

export default function DevSeasonalPage() {
  if (process.env.NODE_ENV === "production") {
    return (
      <main className="min-h-screen bg-slate-900 p-6">
        <p className="text-sm text-slate-400">Not available.</p>
      </main>
    );
  }

  return (
    // Deliberately chrome-free: the preview pane cannot scroll reliably (a
    // hidden tab starves rAF), so the component under review has to land in
    // the first screen.
    <main className="min-h-screen bg-slate-900 px-3 py-2">
      <div className="mx-auto max-w-3xl">
        <SeasonalOutlookCard row={fixture as unknown as SeasonalOutlookRow} />
      </div>
    </main>
  );
}
