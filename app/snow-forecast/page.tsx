import type { Metadata } from "next";
import Link from "next/link";
import { fetchResortIndex } from "@/lib/snow/fetch";
import { ResortSearchList } from "@/components/snow/ResortSearchList";

export const revalidate = 21600; // resort list changes rarely

export const metadata: Metadata = {
  title: "Snow Forecast by Ski Resort - 16-Day Snowfall by Elevation | StancePro",
  description:
    "Multi-model 16-day snow forecasts for ski resorts worldwide: snowfall by elevation band (base / mid / top), time-of-day detail, rain risk and freezing level.",
  alternates: { canonical: "/snow-forecast" },
  openGraph: {
    title: "Snow Forecast by Ski Resort | StancePro",
    description:
      "16-day snowfall by elevation band, time-of-day detail, rain risk and freezing level.",
    url: "https://stance-pro.com/snow-forecast",
  },
};

export default async function SnowForecastIndexPage() {
  const resorts = await fetchResortIndex();

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
              Resort <span className="gradient-text">Snow Forecast</span>
            </h1>
            <p className="text-lg text-slate-400 max-w-3xl mx-auto">
              16-day snowfall from a four-model ensemble, resolved per elevation band —
              base, mid and top — with time-of-day detail, rain risk and freezing level.
            </p>
            <p className="text-sm text-slate-500 mt-3">
              Planning a whole season?{" "}
              <Link href="/snow-outlook" className="text-brand-400 hover:text-brand-300">
                Seasonal snow outlook →
              </Link>
            </p>
          </div>

          {resorts.length === 0 ? (
            <p className="text-center text-slate-400">
              Resort list is temporarily unavailable. Please check back later.
            </p>
          ) : (
            <ResortSearchList resorts={resorts} />
          )}
        </div>
      </section>
    </div>
  );
}
