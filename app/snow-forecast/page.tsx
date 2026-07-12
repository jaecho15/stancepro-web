import type { Metadata } from "next";
import { fetchResortIndex, fetchSeasonalOutlooks } from "@/lib/snow/fetch";
import { buildRegionBrowse } from "@/lib/snow/region-browse";
import { SnowBrowser } from "@/components/snow/SnowBrowser";
import type { SeasonalOutlookRow } from "@/lib/snow/types";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Snow Forecast & Seasonal Outlook by Ski Resort | StancePro",
  description:
    "One map for the whole season and the next two weeks: a validated seasonal snow outlook per region, then 16-day multi-model snowfall by elevation band for any of 3,466 resorts.",
  alternates: { canonical: "/snow-forecast" },
  openGraph: {
    title: "Snow Forecast & Seasonal Outlook | StancePro",
    description:
      "Seasonal outlook per region plus 16-day snowfall by elevation for 3,466 resorts — one geographic browser.",
    url: "https://stance-pro.com/snow-forecast",
  },
};

export default async function SnowForecastIndexPage() {
  const [index, seasonalRows] = await Promise.all([
    fetchResortIndex(),
    fetchSeasonalOutlooks(),
  ]);
  const { regions, resorts } = buildRegionBrowse(index);

  // Numbering runs north (validated forecasts) then south (in-season status),
  // matching the map pins.
  const forecastRows = seasonalRows.filter((r) => r.payload.mode !== "in_season_status");
  const statusRows = seasonalRows.filter((r) => r.payload.mode === "in_season_status");
  const mapRows: SeasonalOutlookRow[] = [...forecastRows, ...statusRows];

  // Join seasonal outlooks to browse regions via shared region_ids.
  const regionKeys = new Set(regions.map((r) => r.key));
  const seasonalByRegionKey: Record<string, SeasonalOutlookRow> = {};
  const climatePinToRegionKey: Record<string, string> = {};
  const cardIndexByClimate: Record<string, number> = {};
  mapRows.forEach((row, i) => {
    cardIndexByClimate[row.climate_region] = i + 1;
    for (const regionId of row.region_ids) {
      const key = `r:${regionId}`;
      if (regionKeys.has(key)) {
        seasonalByRegionKey[key] = row;
        if (!climatePinToRegionKey[row.climate_region]) {
          climatePinToRegionKey[row.climate_region] = key;
        }
      }
    }
  });

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -right-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 -left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      <section className="relative container mx-auto px-6 pt-28 pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Snow <span className="gradient-text">Forecast &amp; Outlook</span>
            </h1>
            <p className="text-lg text-slate-400 max-w-3xl mx-auto">
              Zoom out for the season, zoom in for the next two weeks. Pick a region for its
              validated seasonal outlook, then a resort for the 16-day multi-model forecast by
              elevation band.
            </p>
          </div>

          {resorts.length === 0 ? (
            <p className="text-center text-slate-400">
              Resort list is temporarily unavailable. Please check back later.
            </p>
          ) : (
            <SnowBrowser
              regions={regions}
              resorts={resorts}
              mapRows={mapRows}
              seasonalByRegionKey={seasonalByRegionKey}
              cardIndexByClimate={cardIndexByClimate}
              climatePinToRegionKey={climatePinToRegionKey}
            />
          )}
        </div>
      </section>
    </div>
  );
}
