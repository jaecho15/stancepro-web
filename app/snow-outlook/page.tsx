import type { Metadata } from "next";
import Link from "next/link";
import { fetchSeasonalOutlooks } from "@/lib/snow/fetch";
import { SeasonalOutlookCard } from "@/components/snow/SeasonalOutlookCard";
import { WorldOutlookHero } from "@/components/snow/WorldOutlookHero";
import { OutlookHeroSync } from "@/components/snow/OutlookHeroSync";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Seasonal Snow Outlook - Winter Snowfall Tendency by Region | StancePro",
  description:
    "Season-ahead snowfall outlook for major ski regions: long-term trend, validated ENSO signal with probabilities, and analog winters. Updated monthly.",
  alternates: { canonical: "/snow-outlook" },
  openGraph: {
    title: "Seasonal Snow Outlook | StancePro",
    description:
      "Season-ahead snowfall tendency: trend, ENSO signal and analog winters per region.",
    url: "https://stance-pro.com/snow-outlook",
  },
};

export default async function SnowOutlookPage() {
  const rows = await fetchSeasonalOutlooks();

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <section className="relative container mx-auto px-6 pt-28 pb-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Seasonal <span className="gradient-text">Snow Outlook</span>
            </h1>
            <p className="text-lg text-slate-400 max-w-3xl mx-auto">
              Season-ahead snowfall tendency per region: the long-term trend is always
              shown; a probabilistic signal appears only where it has been validated
              against 40+ years of winters. Everything else stays honest — trend only.
            </p>
          </div>

          {rows.length === 0 ? (
            <p className="text-center text-slate-400">
              Outlook data is temporarily unavailable. Please check back later.
            </p>
          ) : (
            <>
              <div className="mb-8">
                <WorldOutlookHero rows={rows} />
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                {rows.map((row, i) => (
                  <div
                    key={row.climate_region}
                    id={row.climate_region}
                    data-outlook-card={row.climate_region}
                    className="scroll-mt-24"
                  >
                    <SeasonalOutlookCard row={row} index={i + 1} />
                  </div>
                ))}
              </div>
              <OutlookHeroSync />
            </>
          )}

          <div className="mt-12 glass rounded-2xl p-6 text-sm text-slate-400 space-y-2">
            <p className="text-slate-300 font-medium">How to read this</p>
            <p>
              <span className="text-slate-200">Trend</span> — snowfall change per decade
              over the ERA5 record.{" "}
              <span className="text-slate-200">Above / Near / Below</span> — tercile
              probabilities from the validated ENSO relationship for this region (only
              shown where it beats climatology out-of-sample).{" "}
              <span className="text-slate-200">Analog winters</span> — past seasons with
              a similar ENSO state, detrended.{" "}
              <span className="text-slate-200">Watch</span> — experimental factors,
              never given a probability.
            </p>
            <p>
              Looking for the next two weeks instead?{" "}
              <Link href="/snow-forecast" className="text-brand-400 hover:text-brand-300">
                Short-range snow forecast →
              </Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
