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
import { ForecastView } from "@/components/snow/ForecastView";
import { SeasonalOutlookCard } from "@/components/snow/SeasonalOutlookCard";

export const revalidate = 3600;

type Params = { params: Promise<{ resortId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { resortId } = await params;
  const resort = await resolveResort(resortId);
  if (!resort) return { title: "Snow Forecast | StancePro" };
  return {
    title: `${resort.display_name} Snow Forecast - 16-Day Snowfall by Elevation | StancePro`,
    description: `16-day snow forecast for ${resort.display_name}: snowfall per elevation band, time-of-day detail, rain risk, freezing level and weeks 3–6 tendency.`,
    alternates: { canonical: `/snow-forecast/${resort.resort_id}` },
  };
}

export default async function ResortForecastPage({ params }: Params) {
  const { resortId } = await params;
  const resort = await resolveResort(resortId);
  if (!resort) notFound();

  const seasonalRows = await fetchSeasonalOutlooks();
  // Index resorts carry no curated region_id — locate one geographically,
  // the same way the iOS app maps the OSM index onto climate regions.
  const locatedRegionId = resort.region_id ? null : regionIdFor(resort.lat, resort.lon);
  const seasonal = seasonalOutlookForResort(seasonalRows, resort, locatedRegionId);

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

          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold">
              {resort.display_name}{" "}
              <span className="gradient-text">Snow Forecast</span>
            </h1>
            <p className="text-slate-400 mt-2">
              {resort.country_code.toUpperCase()}
              {resort.base_elevation_m !== null && resort.top_elevation_m !== null
                ? ` · ${Math.round(resort.base_elevation_m)}–${Math.round(resort.top_elevation_m)} m`
                : ""}
              {/* 3D terrain artifacts are keyed by OSM index ids only */}
              {resort.resort_id.startsWith("osm-") && (
                <>
                  {" · "}
                  <Link
                    href={`/resort-3d/${resort.resort_id}/view?name=${encodeURIComponent(resort.display_name)}`}
                    className="text-brand-400 hover:text-brand-300"
                  >
                    View in 3D →
                  </Link>
                </>
              )}
            </p>
          </div>

          {/* Season outlook first — same "discoverable, not buried" placement
              as the app's forecast screen. */}
          {seasonal && (
            <div className="mb-6">
              <SeasonalOutlookCard row={seasonal} compact />
              <p className="text-xs text-slate-500 mt-2 text-right">
                <Link href="/snow-forecast" className="text-brand-400 hover:text-brand-300">
                  All regions →
                </Link>
              </p>
            </div>
          )}

          <ForecastView resort={resort} />
        </div>
      </section>
    </div>
  );
}
