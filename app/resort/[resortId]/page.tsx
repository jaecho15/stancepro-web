import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  fetchSeasonalOutlooks,
  resolveResort,
  seasonalOutlookForResort,
} from "@/lib/snow/fetch";
import { regionIdFor } from "@/lib/snow/region-locator";
import { countryName } from "@/lib/snow/country-name";
import { ForecastView } from "@/components/snow/ForecastView";
import { SeasonalOutlookCard } from "@/components/snow/SeasonalOutlookCard";
import { SaveResortButton } from "@/components/snow/SaveResortButton";
import { ResortTabs } from "@/components/resort/ResortTabs";

export const revalidate = 3600;

type Params = { params: Promise<{ resortId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { resortId } = await params;
  const resort = await resolveResort(resortId);
  if (!resort) return { title: "Resort | StancePro" };
  return {
    title: `${resort.display_name} - Snow Forecast, Season Outlook & 3D Map | StancePro`,
    description: `Everything for ${resort.display_name} in one place: 16-day snow forecast by elevation band, the season outlook for its region, and an interactive 3D terrain map.`,
    alternates: { canonical: `/resort/${resort.resort_id}` },
  };
}

export default async function ResortPage({ params }: Params) {
  const { resortId } = await params;
  const resort = await resolveResort(resortId);
  if (!resort) notFound();

  const seasonalRows = await fetchSeasonalOutlooks();
  const locatedRegionId = resort.region_id ?? regionIdFor(resort.lat, resort.lon);
  const seasonal = seasonalOutlookForResort(seasonalRows, resort, locatedRegionId);

  const facts: { label: string; value: string }[] = [
    { label: "Country", value: countryName(resort.country_code) },
    ...(resort.base_elevation_m !== null && resort.top_elevation_m !== null
      ? [
          {
            label: "Elevation",
            value: `${Math.round(resort.base_elevation_m)}–${Math.round(resort.top_elevation_m)} m`,
          },
          {
            label: "Vertical drop",
            value: `${Math.round(resort.top_elevation_m - resort.base_elevation_m)} m`,
          },
        ]
      : []),
    ...(locatedRegionId
      ? [{ label: "Climate region", value: seasonal?.label ?? locatedRegionId }]
      : []),
    {
      label: "Coordinates",
      value: `${resort.lat.toFixed(4)}, ${resort.lon.toFixed(4)}`,
    },
  ];

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -right-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl" />
      </div>

      <section className="relative container mx-auto px-6 pt-28 pb-24">
        <div className="max-w-5xl mx-auto">
          <Link
            href="/snow-forecast"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" /> All resorts
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold">
                {resort.display_name}
              </h1>
              <p className="text-slate-400 mt-2">
                {countryName(resort.country_code)}
                {resort.base_elevation_m !== null && resort.top_elevation_m !== null
                  ? ` · ${Math.round(resort.base_elevation_m)}–${Math.round(resort.top_elevation_m)} m`
                  : ""}
              </p>
            </div>
            <SaveResortButton
              resort={{
                id: resort.resort_id,
                name: resort.display_name,
                country: resort.country_code,
              }}
            />
          </div>

          <ResortTabs
            resortId={resort.resort_id}
            resortName={resort.display_name}
            forecast={<ForecastView resort={resort} />}
            season={
              seasonal ? (
                <SeasonalOutlookCard row={seasonal} />
              ) : (
                <div className="glass rounded-2xl p-8 text-slate-400">
                  No seasonal outlook covers this region yet — the network only
                  serves regions where the signal (or, in southern winters, the
                  observed status) is validated.{" "}
                  <Link href="/snow-forecast" className="text-brand-400 hover:text-brand-300">
                    See covered regions →
                  </Link>
                </div>
              )
            }
            info={
              <div className="glass rounded-2xl p-6">
                <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
                  {facts.map((fact) => (
                    <div key={fact.label} className="flex items-baseline justify-between gap-4 border-b border-slate-700/40 pb-2">
                      <dt className="text-sm text-slate-500">{fact.label}</dt>
                      <dd className="text-sm text-slate-200 text-right">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-slate-600 mt-4">
                  Runs, lifts and terrain difficulty live in the 3D map — more
                  resort facts are coming to this tab.
                </p>
              </div>
            }
          />
        </div>
      </section>
    </div>
  );
}
