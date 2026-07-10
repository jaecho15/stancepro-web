"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowUp,
  CloudSnow,
  Info,
  Loader2,
  Navigation,
  Snowflake,
  Thermometer,
  Umbrella,
  Wind,
  X,
} from "lucide-react";
import { fetchForecastClient } from "@/lib/snow/fetch";
import type {
  BandKey,
  DailyRow,
  ForecastResponse,
  SnowResort,
} from "@/lib/snow/types";

const BAND_LABELS: Record<BandKey, string> = {
  top: "Top",
  mid: "Mid",
  base: "Base",
};
const BAND_ORDER: BandKey[] = ["top", "mid", "base"];
const BLOCK_LABELS: Record<string, string> = {
  dawn: "Dawn",
  morning: "Morning",
  afternoon: "Afternoon",
  night: "Night",
};

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function windDirection(deg: number | null | undefined): string {
  if (deg === null || deg === undefined) return "";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

/** Arrow pointing where the wind blows TO (consumer convention; +180° because
 *  wind_dir_deg is the meteorological FROM direction — the letters stay FROM). */
function WindArrow({ deg, className }: { deg: number; className?: string }) {
  return (
    <ArrowUp
      className={className ?? "w-3 h-3 inline-block"}
      style={{ transform: `rotate(${deg + 180}deg)` }}
    />
  );
}

type PrecipKind = "snow" | "mix" | "rain";

/** Same classification the apps use: rain when rain risk with almost no snow,
 *  mix when the rain–snow line sits above the band, else snow. */
function precipKind(row: {
  rain_risk: boolean;
  snow_cm_p50: number;
  snow_level_margin_m?: number | null;
}): PrecipKind {
  if (row.rain_risk && row.snow_cm_p50 <= 0.5) return "rain";
  if ((row.snow_level_margin_m ?? 0) < 0) return "mix";
  return "snow";
}

/** Precip-type glyph: snowflake (snow), umbrella (rain), and for mix a
 *  "snowflake / umbrella" composite — the rain–snow line sits inside the
 *  resort, so both are true at once. */
function PrecipIcon({ kind }: { kind: PrecipKind }) {
  if (kind === "rain") return <Umbrella className="w-4 h-4 text-sky-400 shrink-0" />;
  if (kind === "mix") {
    return (
      <span className="inline-flex items-center text-amber-400 shrink-0">
        <Snowflake className="w-3 h-3" />
        <span className="text-[10px] font-medium mx-px leading-none">/</span>
        <Umbrella className="w-3 h-3" />
      </span>
    );
  }
  return <Snowflake className="w-4 h-4 text-blue-400 shrink-0" />;
}

/** ⓘ What the icons mean. */
function LegendModal({ onClose }: { onClose: () => void }) {
  const rows: Array<[ReactNode, string, string]> = [
    [<PrecipIcon key="s" kind="snow" />, "Snow",
     "Falls as snow · number = expected cm (most likely value, p50)"],
    [<PrecipIcon key="m" kind="mix" />, "Rain/snow mix",
     "Rain–snow line sits inside the resort — snow up top, rain lower down"],
    [<PrecipIcon key="r" kind="rain" />, "Rain",
     "Mostly rain, little or no snow"],
    [<span key="w" className="inline-flex items-center gap-1 text-slate-300">
        <WindArrow deg={315} /> <span className="text-xs">NW 25</span>
      </span>, "Wind",
     "Arrow points where the wind blows to; letters are where it comes from (NW = northwesterly) · number = gust km/h"],
    [<span key="f" className="text-xs text-slate-400">0°C at 1,900 m</span>, "Freezing level",
     "Snow above this altitude, rain below it"],
    [<span key="d" className="text-xs text-slate-400">measured</span>, "Snow depth",
     "measured = nearby station · estimated = weather model · satellite gates bands it saw bare"],
  ];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
      role="dialog"
      aria-label="What the icons mean"
    >
      <div
        className="glass rounded-2xl p-6 max-w-md w-full space-y-4 bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">What the icons mean</h2>
          <button type="button" onClick={onClose} aria-label="Close"
                  className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        {rows.map(([icon, title, desc]) => (
          <div key={title} className="flex items-start gap-3">
            <span className="w-14 flex justify-center pt-0.5">{icon}</span>
            <div>
              <p className="text-sm text-white font-medium">{title}</p>
              <p className="text-xs text-slate-400">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SnowAmount({ row }: { row: { snow_cm_p10: number; snow_cm_p50: number; snow_cm_p90: number } }) {
  if (row.snow_cm_p90 < 0.05) {
    return <span className="text-slate-600">—</span>;
  }
  return (
    <span>
      <span className="font-semibold text-white">{row.snow_cm_p50.toFixed(row.snow_cm_p50 >= 10 ? 0 : 1)}</span>
      <span className="text-slate-500 text-xs">
        {" "}
        ({row.snow_cm_p10.toFixed(0)}–{row.snow_cm_p90.toFixed(0)}) cm
      </span>
    </span>
  );
}

function DayRow({ row, maxP90 }: { row: DailyRow; maxP90: number }) {
  const [expanded, setExpanded] = useState(false);
  const barWidth = maxP90 > 0 ? Math.min(100, (row.snow_cm_p50 / maxP90) * 100) : 0;
  const whiskerWidth = maxP90 > 0 ? Math.min(100, (row.snow_cm_p90 / maxP90) * 100) : 0;

  return (
    <div className="rounded-xl bg-slate-800/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 grid grid-cols-[8.5rem_1fr_auto] sm:grid-cols-[9.5rem_1fr_5rem_7rem_5rem] items-center gap-3 text-left hover:bg-slate-800/60 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm text-slate-300">
          <PrecipIcon kind={precipKind(row)} />
          {formatDate(row.date)}
        </span>
        <span className="relative h-5 rounded bg-slate-700/40 overflow-hidden">
          <span
            className="absolute inset-y-0 left-0 bg-sky-500/25"
            style={{ width: `${whiskerWidth}%` }}
          />
          <span
            className="absolute inset-y-0 left-0 bg-sky-400/80 rounded-r"
            style={{ width: `${barWidth}%` }}
          />
        </span>
        <span className="text-sm text-right">
          <SnowAmount row={row} />
        </span>
        <span className="hidden sm:flex items-center gap-1 text-xs text-slate-400 justify-end">
          <Thermometer className="w-3.5 h-3.5" />
          {row.tmean_c_p50 !== null ? `${row.tmean_c_p50.toFixed(0)}°C` : "–"}
          <Wind className="w-3.5 h-3.5 ml-2" />
          {row.wind_gust_kmh !== null ? `${Math.round(row.wind_gust_kmh)}` : "–"}
        </span>
        <span className="hidden sm:block text-right">
          {row.rain_risk && (
            <span className="inline-flex items-center gap-1 text-xs text-rose-300 bg-rose-500/15 border border-rose-500/30 rounded-full px-2 py-0.5">
              <Umbrella className="w-3 h-3" /> rain
            </span>
          )}
        </span>
      </button>

      {expanded && row.time_of_day && (
        <div className="px-4 pb-4 grid grid-cols-2 lg:grid-cols-4 gap-2">
          {row.time_of_day.map((block) => (
            <div key={block.block} className="rounded-lg bg-slate-900/50 p-3">
              <p className="text-xs text-slate-500 mb-1">
                {BLOCK_LABELS[block.block] ?? block.block}{" "}
                <span className="text-slate-600">{block.hours}h</span>
              </p>
              <p className="text-sm text-white">
                <SnowAmount row={block} />
              </p>
              <p className="text-xs text-slate-400 mt-1 space-x-2">
                <span>{block.temp_c_p50 !== null ? `${block.temp_c_p50.toFixed(0)}°C` : ""}</span>
                <span>
                  {block.wind_gust_kmh !== null && (
                    <>
                      {block.wind_dir_deg !== null && (
                        <WindArrow deg={block.wind_dir_deg} className="w-3 h-3 inline-block mr-0.5 -mt-px" />
                      )}
                      {windDirection(block.wind_dir_deg)} {Math.round(block.wind_gust_kmh)} km/h
                    </>
                  )}
                </span>
              </p>
              {block.rain_risk && <p className="text-xs text-rose-300 mt-1">rain risk</p>}
              {block.freezing_level_m !== null && (
                <p className="text-xs text-slate-500 mt-1">
                  0°C at {Math.round(block.freezing_level_m)} m
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ForecastView({ resort }: { resort: SnowResort }) {
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty">("loading");
  const [band, setBand] = useState<BandKey>("top");
  const [showLegend, setShowLegend] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchForecastClient(resort).then((response) => {
      if (cancelled) return;
      setForecast(response);
      setStatus(response ? "ready" : "empty");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resort is stable per page
  }, [resort.resort_id]);

  const bandRows = useMemo(() => {
    const daily = forecast?.payload.daily ?? [];
    return daily
      .filter((row) => row.band === band)
      .sort((a, b) => a.day_index - b.day_index);
  }, [forecast, band]);

  const maxP90 = useMemo(
    () => bandRows.reduce((max, row) => Math.max(max, row.snow_cm_p90), 0),
    [bandRows]
  );

  if (status === "loading") {
    return (
      <div className="glass rounded-2xl p-12 flex flex-col items-center gap-3 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
        Computing the latest multi-model forecast…
      </div>
    );
  }

  if (status === "empty" || !forecast) {
    return (
      <div className="glass rounded-2xl p-12 text-center text-slate-400">
        No forecast is available for this resort right now. Please try again shortly.
      </div>
    );
  }

  const { payload, summary } = forecast;
  const depth = payload.depth;
  const bestDay = summary?.best_day;
  const total7d = summary?.bands?.[band]?.snow_7d_p50;

  return (
    <div className="space-y-6">
      {/* Band selector */}
      <div className="flex rounded-xl bg-slate-800/60 p-1 gap-1 max-w-md">
        {BAND_ORDER.map((key) => {
          const elevation = payload.bands?.[key];
          if (elevation === undefined) return null;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setBand(key)}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                band === key ? "bg-brand-500 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              {BAND_LABELS[key]}
              {elevation !== null && (
                <span className="block text-xs opacity-75">{Math.round(elevation)} m</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Next 7 days</p>
          <p className="text-2xl font-bold text-white">
            {total7d !== undefined ? `${total7d.toFixed(0)} cm` : "—"}
          </p>
          <p className="text-xs text-slate-500">median, {BAND_LABELS[band].toLowerCase()}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Best day</p>
          <p className="text-2xl font-bold text-white">
            {bestDay ? formatDate(bestDay.date).replace(",", "") : "—"}
          </p>
          {bestDay && (
            <p className="text-xs text-slate-500">
              {bestDay.snow_cm_p50.toFixed(0)} cm at {BAND_LABELS[bestDay.band].toLowerCase()}
            </p>
          )}
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Snow depth</p>
          <p className="text-2xl font-bold text-white">
            {depth && depth[`${band}_cm` as const] !== null
              ? `${depth[`${band}_cm` as const]} cm`
              : "—"}
          </p>
          <p className="text-xs text-slate-500">
            {depth?.source === "station"
              ? "measured · "
              : depth?.estimate
                ? "estimated · "
                : ""}
            {depth ? depth.asof.slice(0, 10) : ""}
          </p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Ensemble</p>
          <p className="text-2xl font-bold text-white">{payload.models.length}</p>
          <p className="text-xs text-slate-500">weather models</p>
        </div>
      </div>

      {/* Daily rows */}
      <div className="space-y-2">
        <p className="text-sm text-slate-400 flex items-center gap-2">
          <CloudSnow className="w-4 h-4 text-brand-400" />
          Daily snowfall at {BAND_LABELS[band].toLowerCase()} — tap a day for time-of-day
          detail
          <button
            type="button"
            onClick={() => setShowLegend(true)}
            aria-label="What the icons mean"
            className="ml-auto text-slate-500 hover:text-white transition-colors"
          >
            <Info className="w-4 h-4" />
          </button>
        </p>
        {bandRows.map((row) => (
          <DayRow key={`${row.band}-${row.date}`} row={row} maxP90={maxP90} />
        ))}
      </div>

      {/* Weekly tendency */}
      {payload.tendency_weekly && payload.tendency_weekly.length > 0 && (
        <div>
          <p className="text-sm text-slate-400 flex items-center gap-2 mb-2">
            <Snowflake className="w-4 h-4 text-brand-400" />
            Weeks 3–6 tendency (51-member ensemble)
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {payload.tendency_weekly.map((week) => (
              <div key={week.week} className="glass rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1">
                  {formatDate(week.date_start)} – {formatDate(week.date_end)}
                </p>
                <p className="text-lg font-semibold text-white">
                  {week.snow_cm_p50.toFixed(0)}
                  <span className="text-sm font-normal text-slate-500">
                    {" "}
                    ({week.snow_cm_p10.toFixed(0)}–{week.snow_cm_p90.toFixed(0)}) cm
                  </span>
                </p>
                {week.prob_snow_ge_10cm !== null && (
                  <p className="text-xs text-slate-400 mt-1">
                    ≥10 cm: {Math.round(week.prob_snow_ge_10cm * 100)}%
                    {week.prob_snow_ge_30cm !== null &&
                      ` · ≥30 cm: ${Math.round(week.prob_snow_ge_30cm * 100)}%`}
                  </p>
                )}
                <p className="text-xs text-slate-600 mt-1">{week.confidence} confidence</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-600 flex items-center gap-1.5">
        <Navigation className="w-3 h-3" />
        {payload.models.join(" · ")} — generated{" "}
        {payload.generated_utc.slice(0, 16).replace("T", " ")} UTC
        {forecast.cached ? " (cached)" : ""}
      </p>

      {showLegend && <LegendModal onClose={() => setShowLegend(false)} />}
    </div>
  );
}
