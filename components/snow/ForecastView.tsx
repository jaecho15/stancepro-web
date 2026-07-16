"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowUp,
  Cloud,
  CloudSnow,
  Info,
  Loader2,
  Navigation,
  Snowflake,
  Sun,
  Umbrella,
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

/** Only show rain/snow/mix glyphs when models agree on measurable water —
 *  rain_risk alone must not imply umbrella on a 0 mm day. */
function hasMeasurablePrecip(row: {
  snow_cm_p50: number;
  precip_mm_p50?: number | null;
}): boolean {
  return row.snow_cm_p50 > 0 || (row.precip_mm_p50 ?? 0) > 0.5;
}

function DayConditionIcon({ row }: { row: DailyRow }) {
  if (hasMeasurablePrecip(row)) return <PrecipIcon kind={precipKind(row)} />;
  const code = row.weather_code;
  if (code === 0 || code === 1) return <Sun className="w-4 h-4 text-amber-400 shrink-0" />;
  if (code === 2) return <Cloud className="w-4 h-4 text-slate-400 shrink-0" />;
  return <Cloud className="w-4 h-4 text-slate-400 shrink-0" />;
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
     "measured = nearby station · estimated = weather model · satellite gates bands it saw bare and overrides a model 0 where it saw snow"],
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

function SnowAmount({ row }: { row: {
  snow_cm_p10: number;
  snow_cm_p50: number;
  snow_cm_p90: number;
  precip_mm_p50?: number | null;
} }) {
  // Rain-only days: show mm so "0 cm + umbrella" is not confusing.
  if (row.snow_cm_p50 <= 0 && (row.precip_mm_p50 ?? 0) > 0.5) {
    const mm = row.precip_mm_p50 ?? 0;
    return (
      <span>
        <span className="font-semibold text-sky-300">{mm.toFixed(mm >= 10 ? 0 : 1)}</span>
        <span className="text-slate-500 text-xs">{" "}mm rain</span>
      </span>
    );
  }
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

function blockAmount(block: {
  snow_cm_p50: number;
  precip_mm_p50?: number | null;
}): { value: number; unit: string } {
  if (block.snow_cm_p50 > 0) return { value: block.snow_cm_p50, unit: "cm" };
  if ((block.precip_mm_p50 ?? 0) > 0.5) return { value: block.precip_mm_p50 ?? 0, unit: "mm" };
  return { value: 0, unit: "cm" };
}

function fmtAmt(v: number): string {
  return v >= 10 ? String(Math.round(v)) : v.toFixed(1);
}

function MiniBar({
  value,
  scaleMax,
  className,
}: {
  value: number;
  scaleMax: number;
  className?: string;
}) {
  const frac = scaleMax > 0 ? Math.min(1, value / scaleMax) : 0;
  return (
    <span className="relative mx-auto block h-[48px] w-[55%] rounded-sm bg-slate-700/40 overflow-hidden">
      <span
        className={`absolute inset-x-0 bottom-0 rounded-sm ${className ?? "bg-sky-400/80"}`}
        style={{ height: `${Math.max(12, frac * 100)}%` }}
      />
    </span>
  );
}

/** Wide day card (~3 visible): amount + always-visible dawn/AM/PM/night + wind. */
function WideDayCard({
  row,
  selected,
  onSelect,
  blockScaleMax,
}: {
  row: DailyRow;
  selected: boolean;
  onSelect: () => void;
  blockScaleMax: number;
}) {
  const amount = blockAmount(row);
  const rainScale = Math.max(
    1,
    ...(row.time_of_day ?? []).map((b) => b.precip_mm_p50 ?? 0)
  );
  const accent =
    hasMeasurablePrecip(row) && precipKind(row) === "rain"
      ? "border-sky-400/70"
      : hasMeasurablePrecip(row)
        ? "border-blue-400/70"
        : "border-slate-600/60";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`shrink-0 w-[min(38vw,11.5rem)] sm:w-44 rounded-xl border px-2.5 py-5 text-left transition-colors ${
        selected ? `${accent} bg-slate-800/70` : "border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50"
      }`}
    >
      <div className="flex items-start justify-between gap-1 mb-2">
        <div>
          <p className="text-sm font-semibold text-white leading-tight">
            {formatDate(row.date).split(",")[0]}
          </p>
          <p className="text-[10px] text-slate-500">
            {formatDate(row.date).split(",")[1]?.trim() ?? row.date.slice(5)}
          </p>
        </div>
        <DayConditionIcon row={row} />
      </div>
      <div className="flex items-baseline gap-1 mb-0.5">
        <span className={`text-xl font-semibold ${amount.value > 0 ? "text-white" : "text-slate-500"}`}>
          {fmtAmt(amount.value)}
        </span>
        <span className="text-xs text-slate-500">{amount.unit}</span>
        <span className="ml-auto text-xs text-slate-500">
          {row.tmean_c_p50 !== null ? `${row.tmean_c_p50.toFixed(0)}°` : ""}
        </span>
      </div>
      {row.time_of_day && row.time_of_day.length > 0 && (
        <div className="mt-4 grid grid-cols-4 gap-1">
          {row.time_of_day.map((block) => {
            const amt = blockAmount(block);
            const has = amt.value > 0;
            const barValue = block.snow_cm_p50 > 0 ? block.snow_cm_p50 : (block.precip_mm_p50 ?? 0);
            const barMax = block.snow_cm_p50 > 0 ? blockScaleMax : rainScale;
            return (
              <div key={block.block} className="text-center min-w-0">
                <p className={`text-xs font-semibold truncate ${has ? "text-slate-100" : "text-slate-600"}`}>
                  {has ? fmtAmt(amt.value) : "–"}
                </p>
                <MiniBar
                  value={barValue}
                  scaleMax={barMax}
                  className={has ? "bg-sky-400/80" : "bg-slate-600/40"}
                />
                <p className="text-[9px] text-slate-500 truncate">
                  {BLOCK_LABELS[block.block]?.slice(0, 4) ?? block.block.slice(0, 4)}
                </p>
                <p className="text-[9px] text-slate-500 flex items-center justify-center gap-0.5 h-3.5">
                  {block.wind_kmh != null ? (
                    <>
                      {block.wind_dir_deg != null && (
                        <WindArrow deg={block.wind_dir_deg} className="w-2.5 h-2.5" />
                      )}
                      {block.wind_kmh}
                    </>
                  ) : (
                    " "
                  )}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </button>
  );
}

function ThinDayDetail({ row }: { row: DailyRow }) {
  return (
    <div className="rounded-xl bg-slate-800/40 px-3.5 py-2.5 text-xs text-slate-400 space-y-1">
      <p className="text-sm text-slate-300 font-medium">{formatDate(row.date)}</p>
      {row.snow_cm_p50 > 0 ? (
        <p>
          range {fmtAmt(row.snow_cm_p10)}–{fmtAmt(row.snow_cm_p90)} cm (p10–p90)
        </p>
      ) : (row.precip_mm_p50 ?? 0) > 0.5 ? (
        <p>{fmtAmt(row.precip_mm_p50 ?? 0)} mm rain expected</p>
      ) : (
        <p>
          range {fmtAmt(row.snow_cm_p10)}–{fmtAmt(row.snow_cm_p90)} cm (p10–p90)
        </p>
      )}
      {row.freezing_level_m != null && (
        <p className={row.rain_risk ? "text-amber-300" : ""}>
          0°C near {Math.round(row.freezing_level_m)} m
          {row.rain_risk && hasMeasurablePrecip(row) ? " · rain risk" : ""}
        </p>
      )}
    </div>
  );
}

/** D8–16 compact row (no time-of-day grid). */
function BandDayRow({ row, maxP90 }: { row: DailyRow; maxP90: number }) {
  const barWidth = maxP90 > 0 ? Math.min(100, (row.snow_cm_p50 / maxP90) * 100) : 0;
  const whiskerWidth = maxP90 > 0 ? Math.min(100, (row.snow_cm_p90 / maxP90) * 100) : 0;
  return (
    <div className="rounded-xl bg-slate-800/40 px-4 py-3 grid grid-cols-[8.5rem_1fr_auto] items-center gap-3">
      <span className="flex items-center gap-2 text-sm text-slate-300">
        <DayConditionIcon row={row} />
        {formatDate(row.date)}
      </span>
      <span className="relative h-5 rounded bg-slate-700/40 overflow-hidden">
        <span className="absolute inset-y-0 left-0 bg-sky-500/25" style={{ width: `${whiskerWidth}%` }} />
        <span className="absolute inset-y-0 left-0 bg-sky-400/80 rounded-r" style={{ width: `${barWidth}%` }} />
      </span>
      <span className="text-sm text-right">
        <SnowAmount row={row} />
      </span>
    </div>
  );
}

export function ForecastView({ resort }: { resort: SnowResort }) {
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty">("loading");
  const [band, setBand] = useState<BandKey>("top");
  const [showLegend, setShowLegend] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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

  const quantRows = useMemo(
    () => bandRows.filter((row) => row.day_index >= 1 && row.day_index <= 7),
    [bandRows]
  );
  const bandOnlyRows = useMemo(
    () => bandRows.filter((row) => row.day_index >= 8 && row.day_index <= 16),
    [bandRows]
  );
  const blockScaleMax = useMemo(
    () =>
      Math.max(
        1,
        ...quantRows.flatMap((row) => (row.time_of_day ?? []).map((b) => b.snow_cm_p50))
      ),
    [quantRows]
  );
  const selectedRow =
    quantRows.find((row) => row.date === selectedDay) ?? quantRows[0] ?? null;

  useEffect(() => {
    if (quantRows.length && (!selectedDay || !quantRows.some((r) => r.date === selectedDay))) {
      setSelectedDay(quantRows[0].date);
    }
  }, [quantRows, selectedDay]);

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
  // Satellite-first (mirrors the iOS depth card): an observed snow cover
  // overrides a contradictory model 0 cm. NDSI proves cover, not depth, so no
  // number is invented. Same 100 m confidence margin above the line;
  // all_snow generalizes upward (snow below implies snow above).
  const bandElevation = payload.bands?.[band] ?? null;
  const bandDepthCm = depth ? depth[`${band}_cm` as const] : null;
  const satelliteSaysSnow =
    bandElevation !== null &&
    (depth?.snowline?.status === "all_snow" ||
      (depth?.snowline?.status === "snowline" &&
        depth.snowline.snowline_m != null &&
        bandElevation > depth.snowline.snowline_m + 100));
  const depthShowsSatSnow = bandDepthCm === 0 && satelliteSaysSnow;

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
            {depthShowsSatSnow ? "snow" : bandDepthCm !== null && bandDepthCm !== undefined ? `${bandDepthCm} cm` : "—"}
          </p>
          <p className="text-xs text-slate-500">
            {depthShowsSatSnow
              ? `satellite-observed · ${depth?.snowline?.obs_date ?? ""}`
              : `${
                  depth?.source === "station"
                    ? "measured · "
                    : depth?.estimate
                      ? "estimated · "
                      : ""
                }${depth ? depth.asof.slice(0, 10) : ""}`}
          </p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Ensemble</p>
          <p className="text-2xl font-bold text-white">{payload.models.length}</p>
          <p className="text-xs text-slate-500">weather models</p>
        </div>
      </div>

      {/* D1–7 wide cards with inline timing */}
      <div className="space-y-2">
        <p className="text-sm text-slate-400 flex items-center gap-2">
          <CloudSnow className="w-4 h-4 text-brand-400" />
          D1–7 at {BAND_LABELS[band].toLowerCase()} — swipe · timing on each card
          <button
            type="button"
            onClick={() => setShowLegend(true)}
            aria-label="What the icons mean"
            className="ml-auto text-slate-500 hover:text-white transition-colors"
          >
            <Info className="w-4 h-4" />
          </button>
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
          {quantRows.map((row) => (
            <WideDayCard
              key={`${row.band}-${row.date}`}
              row={row}
              selected={row.date === selectedRow?.date}
              onSelect={() => setSelectedDay(row.date)}
              blockScaleMax={blockScaleMax}
            />
          ))}
        </div>
        {selectedRow && <ThinDayDetail row={selectedRow} />}
      </div>

      {bandOnlyRows.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-slate-400">D8–16 band — beyond model agreement</p>
          {bandOnlyRows.map((row) => (
            <BandDayRow key={`${row.band}-${row.date}`} row={row} maxP90={maxP90} />
          ))}
        </div>
      )}

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
