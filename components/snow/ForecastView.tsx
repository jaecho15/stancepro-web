"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowUp,
  Cloud,
  CloudSnow,
  Eye,
  Info,
  Loader2,
  Mountain,
  Navigation,
  Snowflake,
  Sun,
  Umbrella,
  Wind,
  X,
} from "lucide-react";
import { fetchForecastClient } from "@/lib/snow/fetch";
import { useUnitFormat, useUnitPref, type UnitFormat, type UnitSystemPref } from "@/lib/snow/units";
import type {
  BandKey,
  DailyRow,
  ForecastResponse,
  SnowDepth,
  SnowResort,
  TendencyWeek,
  TimeBlock,
} from "@/lib/snow/types";

const BAND_LABELS: Record<BandKey, string> = {
  top: "Top",
  mid: "Mid",
  base: "Base",
  low: "Low",
};
// `low` only appears where the terrain runs well below the base area (see the
// serving function's elevation_bands); most resorts still return three.
const BAND_ORDER: BandKey[] = ["top", "mid", "base", "low"];
const BLOCK_LABELS: Record<string, string> = {
  dawn: "Dawn",
  morning: "Morning",
  afternoon: "Afternoon",
  night: "Night",
};
// Period colours (dark-mode palette, mirrors iOS blockColor):
// 00-06 night · 06-12 morning · 12-18 afternoon · 18-24 evening.
const BLOCK_COLORS: Record<string, string> = {
  dawn: "#4363CC",
  morning: "#60A5FA",
  afternoon: "#3B82F6",
  night: "#A78BFA",
};
const BLOCK_TRACK_PX = 44;
const ACCENT = "#3B82F6";
const SNOWLINE_COLOR = "#EC4899";
const FREEZING_COLOR = "#3B82F6";

// ---- date + number helpers ----

function parseISO(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}
function dayLabel(iso: string): string {
  return parseISO(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  });
}
function dayWeekday(iso: string): string {
  return parseISO(iso).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}
function dayMonthDay(iso: string): string {
  return parseISO(iso).toLocaleDateString("en-US", { month: "numeric", day: "numeric", timeZone: "UTC" });
}
function fmt(v: number): string {
  return v >= 10 ? String(Math.round(v)) : v.toFixed(1);
}
function fmtInt(v: number): string {
  return String(Math.round(v));
}
function msFromKmh(kmh: number | null | undefined): number | null {
  if (kmh == null) return null;
  return Math.round(kmh / 3.6);
}
function enDash(s: string): string {
  return s.replace(/-/g, "\u2013");
}

// ---- precip classification (matches the apps) ----

type PrecipKind = "snow" | "mix" | "rain";

function precipKind(row: {
  rain_risk: boolean;
  snow_cm_p50: number;
  snow_level_margin_m?: number | null;
}): PrecipKind {
  if (row.rain_risk && row.snow_cm_p50 <= 0.5) return "rain";
  if ((row.snow_level_margin_m ?? 0) < 0) return "mix";
  return "snow";
}
function hasMeasurablePrecip(row: {
  snow_cm_p50: number;
  precip_mm_p50?: number | null;
}): boolean {
  return row.snow_cm_p50 > 0 || (row.precip_mm_p50 ?? 0) > 0.5;
}
/** Block precip class — prefers the payload's precomputed precip_type. */
function blockKind(b: TimeBlock): PrecipKind {
  if (b.precip_type === "rain") return "rain";
  if (b.precip_type === "mix") return "mix";
  if (b.precip_type === "snow") return "snow";
  return precipKind(b);
}

/**
 * Human text for a demotion reason. Shown, not logged — "models disagree" and
 * "may fall as rain" are different decisions for a rider, and a single badge
 * cannot express either.
 *
 * `region_unverified` is deliberately absent: it is true of every row today
 * because no region has a scored verdict yet, so surfacing it would put an
 * identical caveat on the entire product and teach people to ignore all of them.
 * It still ships in the payload and still blocks alerts.
 */
const REASON_TEXT: Record<string, string> = {
  rain_risk: "may fall as rain at this elevation",
  marginal_snow_level: "snow line sits close to this band",
  wide_spread_for_lead: "models disagree unusually widely for this range",
  moderate_spread_for_lead: "models disagree more than usual for this range",
  few_models: "fewer models than usual",
  reduced_models: "one model missing",
  single_model: "one model only",
};
const SLOPE_TEXT: Record<string, string> = {
  wind_transport: "wind moving snow between slopes",
  strong_wind_transport: "strong wind — snow redistributed, totals are not local",
};
function rowNotes(row: DailyRow): string[] {
  const notes = (row.reasons ?? [])
    .filter((r) => r !== "region_unverified")
    .map((r) => REASON_TEXT[r])
    .filter((t): t is string => Boolean(t));
  const slope = row.slope_condition ? SLOPE_TEXT[row.slope_condition] : null;
  if (slope) notes.push(slope);
  return notes;
}
/**
 * Whether to print a single number for this row.
 *
 * Defaults to TRUE when the field is absent, so an older cached payload keeps
 * rendering exactly as it did rather than silently collapsing to ranges.
 */
function showsPointValue(row: DailyRow): boolean {
  return row.show_point_value ?? true;
}
/** Headline amount, already display-converted (metric = unchanged). */
function dayAmount(row: {
  snow_cm_p50: number;
  precip_mm_p50?: number | null;
}, u: UnitFormat): { value: number; unit: string } {
  if (row.snow_cm_p50 > 0) return { value: u.snow(row.snow_cm_p50), unit: u.snowUnit };
  if ((row.precip_mm_p50 ?? 0) > 0.5) return { value: u.rain(row.precip_mm_p50 ?? 0), unit: u.rainUnit };
  return { value: 0, unit: u.snowUnit };
}
function precipChance(row: {
  snow_cm_p10: number;
  snow_cm_p50: number;
  snow_cm_p90: number;
  precip_mm_p50?: number | null;
}): number | null {
  if (row.snow_cm_p10 >= 0.5) return 90;
  if (row.snow_cm_p50 >= 0.5) return 65;
  if (row.snow_cm_p90 >= 0.5) return 35;
  if ((row.precip_mm_p50 ?? 0) > 0.5) return 50;
  return null;
}
function dayTempRange(row: DailyRow): { min: number; max: number } {
  const temps = (row.time_of_day ?? []).map((b) => b.temp_c_p50).filter((t): t is number => t != null);
  if (temps.length) return { min: Math.min(...temps), max: Math.max(...temps) };
  const t = row.tmean_c_p50 ?? 0;
  return { min: t, max: t };
}

// ---- icons ----

/** Arrow points where the wind blows TO (+180°; wind_dir_deg is the FROM dir). */
function WindArrow({ deg, className }: { deg: number; className?: string }) {
  return (
    <ArrowUp
      className={className ?? "w-3 h-3 inline-block"}
      style={{ transform: `rotate(${deg + 180}deg)` }}
    />
  );
}

function PrecipIcon({ kind, className }: { kind: PrecipKind; className?: string }) {
  const size = className ?? "w-4 h-4";
  if (kind === "rain") return <Umbrella className={`${size} text-sky-400 shrink-0`} />;
  if (kind === "mix") {
    return (
      <span className="inline-flex items-center text-amber-400 shrink-0">
        <Snowflake className="w-3 h-3" />
        <span className="text-[10px] font-medium mx-px leading-none">/</span>
        <Umbrella className="w-3 h-3" />
      </span>
    );
  }
  return <Snowflake className={`${size} text-blue-400 shrink-0`} />;
}

/** WMO code → sky glyph. */
function SkyIcon({ code, className }: { code: number | null | undefined; className?: string }) {
  const size = className ?? "w-4 h-4";
  if (code === 0 || code === 1) return <Sun className={`${size} text-amber-400 shrink-0`} />;
  if (code === 2) return <Cloud className={`${size} text-slate-400 shrink-0`} />;
  if (code === 45 || code === 48) return <Cloud className={`${size} text-slate-400 shrink-0`} />;
  return <Cloud className={`${size} text-slate-500 shrink-0`} />;
}

/** The sky facet of the day icon, read from the DAYTIME blocks
 *  (morning + afternoon) — night/dawn cloud must not pollute the day glyph.
 *  Daytime precip means the daytime sky IS a precipitating deck → cloud; a
 *  clear↔cloudy split shows the partly glyph; no blocks (D8-16) falls back
 *  to the day-level code. Parity with the apps. */
function DaytimeSkyIcon({ row, className }: { row: DailyRow; className?: string }) {
  const daytime = (row.time_of_day ?? []).filter(
    (b) => b.block === "morning" || b.block === "afternoon",
  );
  if (daytime.some((b) => b.snow_cm_p50 > 0 || (b.precip_mm_p50 ?? 0) > 0.5)) {
    return <Cloud className={`${className ?? "w-4 h-4"} text-slate-500 shrink-0`} />;
  }
  const codes = daytime.map((b) => b.weather_code).filter((c): c is number => c != null);
  if (!codes.length) return <SkyIcon code={row.weather_code} className={className} />;
  const hasClear = codes.some((c) => c <= 1);
  const hasCloud = codes.some((c) => c >= 2);
  if (hasClear && hasCloud) return <SkyIcon code={2} className={className} />;
  return <SkyIcon code={Math.max(...codes)} className={className} />;
}

/** Day glyph. A precip day never collapses to one facet: the glyph is
 *  "[what falls] / [daytime sky]" — dawn snow before a clear day reads ❄/☀,
 *  trace snow under overcast reads ❄/☁. Mix keeps its own two-sided ❄/☂
 *  glyph. Dry days show the daytime sky alone. */
function DayConditionIcon({ row, className }: { row: DailyRow; className?: string }) {
  if (!hasMeasurablePrecip(row)) return <DaytimeSkyIcon row={row} className={className} />;
  const kind = precipKind(row);
  if (kind === "mix") return <PrecipIcon kind="mix" className={className} />;
  return (
    <span className="inline-flex items-center shrink-0">
      <PrecipIcon kind={kind} className="w-3 h-3" />
      <span className="text-[10px] font-medium mx-px leading-none text-slate-400">/</span>
      <DaytimeSkyIcon row={row} className="w-3 h-3" />
    </span>
  );
}

function BlockSkyIcon({ block, className }: { block: TimeBlock; className?: string }) {
  if (block.snow_cm_p50 > 0 || (block.precip_mm_p50 ?? 0) > 0.5) {
    return <PrecipIcon kind={blockKind(block)} className={className} />;
  }
  return <SkyIcon code={block.weather_code} className={className} />;
}

// ---- section header ----

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline gap-2 px-1">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-300">{title}</h3>
      {subtitle && <span className="text-[11px] text-slate-500">{subtitle}</span>}
    </div>
  );
}

// ---- ⓘ legend ----

function LegendModal({ onClose }: { onClose: () => void }) {
  const u = useUnitFormat();
  const rows: Array<[ReactNode, string, string]> = [
    [<PrecipIcon key="s" kind="snow" />, "Snow", "Falls as snow · number = expected cm (p50)"],
    [<PrecipIcon key="m" kind="mix" />, "Rain/snow mix", "Rain–snow line sits inside the resort"],
    [<PrecipIcon key="r" kind="rain" />, "Rain", "Mostly rain, little or no snow"],
    [<span key="w" className="inline-flex items-center gap-1 text-slate-300"><WindArrow deg={315} /> <span className="text-xs">NW 20</span></span>, "Wind", "Arrow points where wind blows to; number = km/h"],
    [<span key="f" className="text-xs" style={{ color: FREEZING_COLOR }}>1,900 m</span>, "Freezing level", "Snow above this altitude, rain below"],
    [<span key="l" className="text-xs" style={{ color: SNOWLINE_COLOR }}>snowline</span>, "Snowline", "Forecast rain/snow line; dashed = satellite observed"],
    [<span key="d" className="text-xs text-slate-400">measured</span>, "Snow depth", "measured = nearby station · estimated = model · satellite gates bare bands"],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose} role="dialog" aria-label="What the icons mean">
      <div className="glass rounded-2xl p-6 max-w-md w-full space-y-4 bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">What the icons mean</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        {rows.map(([icon, title, desc]) => (
          <div key={title} className="flex items-start gap-3">
            <span className="w-14 flex justify-center pt-0.5">{icon}</span>
            <div>
              <p className="text-sm text-white font-medium">{title}</p>
              <p className="text-xs text-slate-400">{u.swapUnitTokens(desc)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 1) Summary banner
// ============================================================================

function summarySentence(quantRows: DailyRow[], bandKey: BandKey, u: UnitFormat): string {
  const bandLower = BAND_LABELS[bandKey].toLowerCase();
  const total = quantRows.reduce((s, r) => s + r.snow_cm_p50, 0);
  const peak = quantRows.reduce<DailyRow | null>((best, r) => (best && best.snow_cm_p50 >= r.snow_cm_p50 ? best : r), null);
  if (total < 1 || !peak || peak.snow_cm_p50 < 1) {
    return `Little snow expected at ${bandLower} over the next 8 days.`;
  }
  const intensity = total >= 40 ? "Heavy snow ahead" : total >= 15 ? "Good snow ahead" : "Some snow expected";
  let sentence = `${intensity} — biggest day ${dayLabel(peak.date)} (~${fmt(u.snow(peak.snow_cm_p50))} ${u.snowUnit} at ${bandLower}).`;
  if (quantRows.some((r) => r.rain_risk)) sentence += " Some rain possible.";
  else if (quantRows.every((r) => (r.tmean_c_p50 ?? 0) < 0)) sentence += " Staying cold.";
  return sentence;
}

function SummaryBanner({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ background: `${ACCENT}22` }}>
      <Snowflake className="w-4 h-4 mt-0.5 shrink-0" style={{ color: ACCENT }} />
      <p className="text-sm text-slate-100">{text}</p>
    </div>
  );
}

// ============================================================================
// 2) Seven-day strip (tap to re-center the grid)
// ============================================================================


/**
 * The day's snow as a bar, with the p10–p90 band drawn BEHIND it on the same
 * scale.
 *
 * Both shapes are centimetres against one axis, so the bar answers "how much"
 * and the band answers "how sure" without the two competing. An earlier version
 * drew only the range, and it inverted on large values: a 70 cm day spanning
 * 53–85 rendered SHORTER than a 17 cm day spanning 8–31, because range length
 * is not amount. Putting the bar back gives magnitude its own encoding again.
 *
 * The band is drawn first and sits behind, so a wide band reads as a halo
 * around a confident bar rather than as a second object to decode.
 *
 * DEGENERATE BANDS ARE NOT DRAWN AS BANDS
 * Past about day 9 the payload carries 2 models, and sometimes 1 by day 15.
 * With one model min == max, so the span is exactly zero — and a zero-width
 * band reads as perfect certainty when it actually means "one model". With two
 * it is the gap between two deterministic runs, not a quantile: measured across
 * the archive the spread sits between 1.54 and 1.59 of the median over the
 * whole range, which is arithmetic rather than information. Those render as a
 * dashed outline so the shape itself says "do not read width here".
 */
function SnowBar({ row, scaleMax }: { row: DailyRow; scaleMax: number }) {
  const lo = row.snow_cm_p10 ?? 0;
  const hi = row.snow_cm_p90 ?? 0;
  const mid = row.snow_cm_p50 ?? 0;
  const H = 30;
  // Always occupies the same box, even with nothing to draw: a bar that appears
  // and disappears shifts the number left and right and breaks the scan line
  // down the strip.
  if (scaleMax <= 0 || hi <= 0) return <span className="block w-3 shrink-0" style={{ height: H }} aria-hidden />;

  const y = (v: number) => H * (1 - Math.min(1, Math.max(0, v / scaleMax)));
  const degenerate = (row.n_models ?? 4) <= 2 || hi - lo < 0.05;

  return (
    <span
      className="relative block w-3 shrink-0"
      style={{ height: H }}
      role="img"
      aria-label={
        degenerate
          ? `${fmt(mid)}, single-model estimate`
          : `${fmt(mid)}, likely ${fmt(lo)} to ${fmt(hi)}`
      }
    >
      <span
        className="absolute inset-x-0 rounded-[2px]"
        style={{
          top: y(hi), height: Math.max(2, y(lo) - y(hi)),
          background: degenerate ? "transparent" : `${ACCENT}33`,
          border: degenerate ? `1px dashed ${ACCENT}66` : "none",
        }}
      />
      {/* Floor of 2px: at a 62 cm scale a 4.7 cm day is 7% and would render as a
          hairline, reading as "nothing" on a day that is not nothing. */}
      <span
        className="absolute inset-x-0 bottom-0 rounded-t-[2px]"
        style={{ top: Math.min(y(mid), H - 2), background: ACCENT, opacity: 0.9 }}
      />
    </span>
  );
}

function SevenDayStrip({ rows, selectedDate, onSelect }: { rows: DailyRow[]; selectedDate: string | null; onSelect: (d: string) => void }) {
  const u = useUnitFormat();
  // One scale across the visible strip, so bar heights are comparable between
  // days. Per-day scaling would make a 1 cm day look like a 30 cm day.
  const scaleMax = Math.max(0, ...rows.map((r) => r.snow_cm_p90 ?? 0));
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
        {rows.map((row) => {
          const selected = row.date === selectedDate;
          const amount = dayAmount(row, u);
          const chance = precipChance(row);
          return (
            <button
              key={row.date}
              type="button"
              onClick={() => onSelect(row.date)}
              className={`shrink-0 w-[4.6rem] rounded-lg border px-1 py-2 flex flex-col items-center gap-1 transition-colors ${
                selected ? "border-blue-400/80 bg-slate-800/70" : "border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50"
              }`}
            >
              <span className="text-[11px] font-semibold text-slate-200">{dayWeekday(row.date)}</span>
              <span className="text-[9px] text-slate-500">{row.date.slice(5)}</span>
              <DayConditionIcon row={row} className="w-[18px] h-[18px]" />
              <span className="flex items-end gap-1">
                <SnowBar row={row} scaleMax={scaleMax} />
                <span className="flex items-baseline gap-0.5">
                  <span className="text-sm font-bold text-white">{fmt(amount.value)}</span>
                  <span className="text-[8px] text-slate-500">{amount.unit}</span>
                </span>
              </span>
              <span className="text-[9px] font-semibold" style={{ color: ACCENT }}>{chance != null ? `${chance}%` : "\u00a0"}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500 px-1">Tap a day to center the grid below</p>
    </div>
  );
}

// ============================================================================
// 3) Aligned forecast grid (header / time / sky / per-band snow bars)
// ============================================================================

function gridTemplate(n: number): string {
  return `3rem repeat(${n}, minmax(0,1fr))`;
}

/** Small mountain glyph with the slice for this band filled white. */
function MountainGlyph({ index, count }: { index: number; count: number }) {
  const w = 32, h = 24, top = 2, bot = h - 2, peak = w / 2, left = 2, right = w - 2;
  const edges = (y: number): [number, number] => {
    const t = (y - top) / (bot - top);
    return [peak + (left - peak) * t, peak + (right - peak) * t];
  };
  const yA = top + (bot - top) * (index / Math.max(count, 1));
  const yB = top + (bot - top) * ((index + 1) / Math.max(count, 1));
  const [la, ra] = edges(yA);
  const [lb, rb] = edges(yB);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polygon points={`${peak},${top} ${right},${bot} ${left},${bot}`} fill={ACCENT} fillOpacity={0.55} />
      <polygon points={`${la},${yA} ${ra},${yA} ${rb},${yB} ${lb},${yB}`} fill="#ffffff" />
    </svg>
  );
}

function ForecastGrid({
  detailDays,
  bands,
  bandElevations,
  daysForBand,
  blockScaleMax,
  selectedBand,
}: {
  detailDays: DailyRow[];
  bands: BandKey[];
  bandElevations: Partial<Record<BandKey, number | null>>;
  daysForBand: (b: BandKey) => DailyRow[];
  blockScaleMax: number;
  selectedBand: BandKey;
}) {
  // One scale across the days shown here, so bar heights compare between them.
  const detailSnowMax = Math.max(0, ...detailDays.map((d) => d.snow_cm_p90 ?? 0));

  const u = useUnitFormat();
  const n = detailDays.length;
  const tpl = gridTemplate(n);
  const dayCellClass = (i: number) => `min-w-0 ${i !== n - 1 ? "border-r border-slate-700/40" : ""}`;

  return (
    <div className="space-y-2">
      {/* period legend */}
      <div className="flex items-center gap-3 px-1">
        {(["dawn", "morning", "afternoon", "night"] as const).map((b) => (
          <span key={b} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: BLOCK_COLORS[b] }} />
            <span className="text-[8.5px] text-slate-500">{BLOCK_LABELS[b]}</span>
          </span>
        ))}
      </div>

      <div className="rounded-2xl bg-slate-800/40 p-3">
        {/* header row */}
        <div className="grid items-end" style={{ gridTemplateColumns: tpl }}>
          <span />
          {detailDays.map((day, i) => {
            const amount = dayAmount(day, u);
            const chance = precipChance(day);
            const range = dayTempRange(day);
            return (
              <div key={day.date} className={`${dayCellClass(i)} flex flex-col items-center gap-1 pb-1.5`}>
                <span className="text-[11px] font-semibold text-slate-200">{dayLabel(day.date)}</span>
                <DayConditionIcon row={day} className="w-7 h-7" />
                <span className="flex items-end gap-1">
                  <SnowBar row={day} scaleMax={detailSnowMax} />
                  <span className="flex items-baseline gap-0.5">
                    <span className="text-lg font-bold text-white">{fmt(amount.value)}</span>
                    <span className="text-[9px] text-slate-500">{amount.unit}</span>
                  </span>
                </span>
                {chance != null && <span className="text-[10px] font-semibold" style={{ color: ACCENT }}>{chance}%</span>}
                <span className="text-[9px] text-slate-500">{u.tempInt(range.max)}° / {u.tempInt(range.min)}°</span>
              </div>
            );
          })}
        </div>

        {/* time row */}
        <div className="grid" style={{ gridTemplateColumns: tpl }}>
          <span className="text-[8.5px] font-medium text-slate-500 self-center">TIME</span>
          {detailDays.map((day, i) => (
            <div key={day.date} className={`${dayCellClass(i)} grid grid-cols-4 gap-1`}>
              {(day.time_of_day ?? []).map((b) => (
                <span key={b.block} className="text-[7.5px] text-slate-500 text-center truncate">{enDash(b.hours)}</span>
              ))}
            </div>
          ))}
        </div>

        {/* sky row */}
        <div className="grid py-1" style={{ gridTemplateColumns: tpl }}>
          <span className="text-[8.5px] font-medium text-slate-500 self-center">SKY</span>
          {detailDays.map((day, i) => (
            <div key={day.date} className={`${dayCellClass(i)} grid grid-cols-4 gap-1`}>
              {(day.time_of_day ?? []).map((b) => (
                <span key={b.block} className="flex justify-center">
                  <BlockSkyIcon block={b} className="w-3 h-3" />
                </span>
              ))}
            </div>
          ))}
        </div>

        <div className="h-px bg-slate-700/40 my-1.5" />
        <p className="text-[9px] font-bold text-slate-500 mb-1">SNOWFALL BY ELEVATION ({u.snowUnit})</p>

        {/* per-band elevation rows */}
        {bands.map((band, bi) => {
          const days = daysForBand(band);
          const elev = bandElevations[band];
          return (
            <div key={band} className="relative grid py-1" style={{ gridTemplateColumns: tpl }}>
              <div className="flex flex-col items-center gap-0.5 self-center">
                <MountainGlyph index={bi} count={bands.length} />
                {elev != null && <span className="text-[8px] font-medium text-slate-500">{u.elevationLabel(elev)}</span>}
              </div>
              {/* Envelope overlaid on the row WITHOUT wrapping the day cells.
                  An earlier attempt nested them in a wrapper div to position
                  against; that broke the grid — the cells shifted a column and
                  the bars ended up rendering a different band's blocks than the
                  curve above them. The grid structure stays exactly as it was
                  and only this absolutely-positioned span is added. */}
              {/* A div, absolutely positioned over the day columns. Two earlier
                  attempts failed on width: an inline <span> never established
                  one, so the SVG fell back to its 1000px viewBox and stretched
                  ~3.5x; adding `block` then collapsed it to 32px because a
                  positioned element still needs both edges pinned. left/right
                  pin it to exactly the day area, and the SVG fills that. */}
              <div
                className="pointer-events-none absolute"
                style={{ left: "3rem", right: 0, top: 0, bottom: "0.25rem" }}
              >
                <BandEnvelope
                  blocks={days.flatMap((d) => d.time_of_day ?? [])}
                  scaleMax={blockScaleMax}
                />
              </div>
              {days.map((day, i) => (
                <div key={day.date} className={`${dayCellClass(i)} grid grid-cols-4 gap-1 items-end`}>
                  {(day.time_of_day ?? []).map((b) => (
                    <ElevBarCell key={b.block} block={b} scaleMax={blockScaleMax} />
                  ))}
                </div>
              ))}
            </div>
          );
        })}

        {/* temp + feels-like rows for the SELECTED band (parity with the apps) —
            colored by the freezing boundary, which stays keyed on °C. */}
        {(() => {
          const tempDays = daysForBand(selectedBand);
          if (!tempDays.some((d) => (d.time_of_day ?? []).length > 0)) return null;
          const hasFeels = tempDays.some((d) => (d.time_of_day ?? []).some((b) => b.feels_c_p50 != null));
          const tempColor = (c: number) => {
            const r = Math.round(c);
            return r > 0 ? "#EF4444" : r < 0 ? FREEZING_COLOR : "#94a3b8";
          };
          const row = (label: string, pick: (b: TimeBlock) => number | null | undefined) => (
            <div className="grid py-0.5" style={{ gridTemplateColumns: tpl }}>
              <span className="text-[8.5px] font-medium text-slate-500 self-center">{label}</span>
              {tempDays.map((day, i) => (
                <div key={day.date} className={`${dayCellClass(i)} grid grid-cols-4 gap-1`}>
                  {(day.time_of_day ?? []).map((b) => {
                    const c = pick(b);
                    return (
                      <span key={b.block} className="text-[10px] font-semibold text-center"
                            style={{ color: c != null ? tempColor(c) : "#64748b" }}>
                        {c != null ? `${u.tempInt(c)}°` : "–"}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          );
          return (
            <>
              <div className="h-px bg-slate-700/40 my-1.5" />
              {row("TEMP", (b) => b.temp_c_p50)}
              {hasFeels && row("FEELS", (b) => b.feels_c_p50)}
            </>
          );
        })()}
      </div>
    </div>
  );
}

/** ElevBar with its period colour applied to the fill. */
function ElevBarCell({ block, scaleMax }: { block: TimeBlock; scaleMax: number }) {
  const u = useUnitFormat();
  const value = block.snow_cm_p50;
  const has = value >= 0.5;
  // The p10-p90 band is NOT drawn here. Per-block rectangles broke the band into
  // eight disconnected slabs across a day, which reads as eight separate
  // statements rather than one uncertainty envelope moving through time. It is
  // drawn once per elevation row instead, as a continuous curve behind these
  // bars — see BandEnvelope.
  const h = Math.max(2, Math.min(value / scaleMax, 1) * BLOCK_TRACK_PX);
  return (
    <div className="flex flex-col items-center justify-end h-[60px] gap-0.5 min-w-0">
      <span className={`text-[8px] font-semibold leading-none ${has ? "text-slate-100" : "text-transparent"}`}>
        {has ? fmtInt(u.snow(value)) : "0"}
      </span>
      <span
        className="w-[11px] rounded-sm"
        style={{ height: h, background: value > 0 ? BLOCK_COLORS[block.block] ?? ACCENT : "rgba(148,163,184,0.18)" }}
      />
    </div>
  );
}

/**
 * One continuous p10-p90 envelope behind a whole elevation row.
 *
 * Drawn as a single smoothed shape spanning every 6-hour block in view, rather
 * than a rectangle per block: uncertainty is continuous in time, and slicing it
 * into per-block slabs made a storm read as a row of unrelated guesses instead
 * of one widening and narrowing envelope.
 *
 * Positioned absolutely over the bar row and pointer-events-none, so it sits
 * behind the bars without touching their layout or hit targets.
 */
function BandEnvelope({ blocks, scaleMax }: { blocks: TimeBlock[]; scaleMax: number }) {
  // Below three models min/max is the gap between deterministic runs rather
  // than a quantile, and at one model it is exactly zero — a zero-width band
  // reads as certainty when it means the opposite. Drop the envelope rather
  // than draw a misleading one.
  const usable = blocks.filter((b) => (b.n_models ?? 4) >= 3);
  if (usable.length < 2 || scaleMax <= 0) return null;
  if (!blocks.some((b) => (b.snow_cm_p90 ?? 0) - (b.snow_cm_p10 ?? 0) >= 0.05)) return null;

  // Spans the WHOLE row, every day in view, so the envelope stays continuous
  // across midnight. Drawn per day it broke at each date boundary, which
  // implied the uncertainty resets overnight — it does not; a storm's spread
  // carries straight through.
  const W = 1000, H = BLOCK_TRACK_PX;
  const x = (i: number) => ((i + 0.5) / blocks.length) * W;
  const y = (v: number) => H * (1 - Math.min(Math.max(v, 0) / scaleMax, 1));
  const top = blocks.map((b, i) => ({ x: x(i), y: y(b.snow_cm_p90 ?? 0) }));
  const bottom = blocks.map((b, i) => ({ x: x(i), y: y(b.snow_cm_p10 ?? 0) }));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 bottom-0 w-full"
      style={{ height: H }}
      aria-hidden
    >
      <path d={fanBandPath(top, bottom)} fill={ACCENT} fillOpacity={0.18} />
    </svg>
  );
}

// ============================================================================
// 4) Wind table (km/h), same column skeleton as the grid
// ============================================================================

function WindTable({ days }: { days: DailyRow[] }) {
  const u = useUnitFormat();
  const n = days.length;
  const tpl = gridTemplate(n);
  const dayCellClass = (i: number) => `min-w-0 ${i !== n - 1 ? "border-r border-slate-700/40" : ""}`;
  return (
    <div className="space-y-2">
      <SectionHeader title="Wind" subtitle={`at 10 m · ${u.windKmhUnit}`} />
      <div className="rounded-2xl bg-slate-800/40 p-3">
        {/* hours */}
        <div className="grid pb-1" style={{ gridTemplateColumns: tpl }}>
          <span />
          {days.map((day, i) => (
            <div key={day.date} className={`${dayCellClass(i)} grid grid-cols-4 gap-1`}>
              {(day.time_of_day ?? []).map((b) => (
                <span key={b.block} className="text-[7px] text-slate-500 text-center truncate">{enDash(b.hours)}</span>
              ))}
            </div>
          ))}
        </div>
        <div className="h-px bg-slate-700/30 my-1" />
        {/* direction */}
        <div className="grid py-1" style={{ gridTemplateColumns: tpl }}>
          <span className="text-[9px] font-medium text-slate-500 self-center">DIR</span>
          {days.map((day, i) => (
            <div key={day.date} className={`${dayCellClass(i)} grid grid-cols-4 gap-1`}>
              {(day.time_of_day ?? []).map((b) => (
                <span key={b.block} className="flex justify-center" style={{ color: ACCENT }}>
                  {b.wind_dir_deg != null ? <WindArrow deg={b.wind_dir_deg} className="w-2.5 h-2.5" /> : <span className="text-slate-600">–</span>}
                </span>
              ))}
            </div>
          ))}
        </div>
        {/* speed + gust */}
        {(["speed", "gust"] as const).map((kind) => (
          <div key={kind} className="grid py-1" style={{ gridTemplateColumns: tpl }}>
            <span className="text-[9px] font-medium text-slate-500 self-center">{kind === "gust" ? "GUST" : "SPD"}</span>
            {days.map((day, i) => (
              <div key={day.date} className={`${dayCellClass(i)} grid grid-cols-4 gap-1`}>
                {(day.time_of_day ?? []).map((b) => {
                  const kmh = kind === "gust" ? b.wind_gust_kmh : b.wind_kmh;
                  const v = kmh != null ? u.windKmh(kmh) : null;
                  return (
                    // 10px matches the TEMP row in the identical column skeleton — km/h
                    // gusts reach 3 digits, which 11px overflows the cell on ≤375px screens.
                    <span key={b.block} className="text-[10px] font-semibold text-center" style={{ color: kind === "gust" ? "#F59E0B" : "#14B8A6" }}>
                      {v ?? "–"}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 5) Snowline + freezing level chart
// ============================================================================

/** Forecast snow (rain/snow) level for a block: ~200 m below the freezing level. */
function snowLevelM(block: TimeBlock): number | null {
  if (block.freezing_level_m != null) return block.freezing_level_m - 200;
  return null;
}

function SnowlineFreezingChart({ days, satelliteSnowlineM, satelliteLabel }: {
  days: DailyRow[];
  satelliteSnowlineM: number | null;
  satelliteLabel: string | null;
}) {
  const u = useUnitFormat();
  const W = 560, H = 168, leftPad = 48, rightPad = 8, topPad = 10, bottomPad = 26;
  const plotW = W - leftPad - rightPad, plotH = H - topPad - bottomPad;
  const blocksPer = 4;
  const numDays = Math.max(1, days.length);
  const dayW = plotW / numDays;
  const blockSpacing = 4;
  const blockW = (dayW - blockSpacing * (blocksPer - 1)) / blocksPer;

  // Values display-converted up front: the chart normalizes to the sample
  // range, so a uniform unit scale keeps the shape and converts the axis.
  const satelliteLine = satelliteSnowlineM != null ? u.elevation(satelliteSnowlineM) : null;
  const samples: Array<{ freezing: number | null; snow: number | null }> = days.flatMap((day) =>
    (day.time_of_day ?? []).map((b) => {
      const snow = snowLevelM(b);
      return {
        freezing: b.freezing_level_m != null ? u.elevation(b.freezing_level_m) : null,
        snow: snow != null ? u.elevation(snow) : null,
      };
    })
  );
  const values: number[] = [];
  samples.forEach((s) => {
    if (s.freezing != null) values.push(s.freezing);
    if (s.snow != null) values.push(s.snow);
  });
  if (satelliteLine != null) values.push(satelliteLine);
  if (!values.length) {
    return (
      <div className="rounded-2xl bg-slate-800/40 p-6 text-center text-sm text-slate-500">
        No snowline / freezing-level data for this window.
      </div>
    );
  }
  const rawMin = Math.min(...values), rawMax = Math.max(...values);
  const pad = Math.max(100, (rawMax - rawMin) * 0.15);
  const yMin = Math.max(0, rawMin - pad), yMax = rawMax + pad;
  const span = Math.max(1, yMax - yMin);
  const x = (i: number) => {
    const d = Math.floor(i / blocksPer), b = i % blocksPer;
    return leftPad + dayW * d + b * (blockW + blockSpacing) + blockW / 2;
  };
  const y = (v: number) => topPad + plotH * (1 - (v - yMin) / span);

  const line = (key: "freezing" | "snow", color: string) => {
    const pts = samples.map((s, i) => ({ i, v: s[key] })).filter((p): p is { i: number; v: number } => p.v != null);
    if (!pts.length) return null;
    const d = pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
    return (
      <g key={key}>
        <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p) => <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={2} fill={color} />)}
      </g>
    );
  };

  return (
    <div className="space-y-2">
      <SectionHeader title="Snowline & freezing level" subtitle={`${u.elevationUnit} · median`} />
      <div className="flex items-center gap-4 px-1">
        <span className="flex items-center gap-1"><span className="w-3.5 h-[3px] rounded" style={{ background: SNOWLINE_COLOR }} /><span className="text-[9px] text-slate-400">Snowline</span></span>
        <span className="flex items-center gap-1"><span className="w-3.5 h-[3px] rounded" style={{ background: FREEZING_COLOR }} /><span className="text-[9px] text-slate-400">Freezing level</span></span>
      </div>
      <div className="rounded-2xl bg-slate-800/40 p-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
          {[0, 1, 2].map((k) => {
            const v = yMin + (span * k) / 2;
            const gy = y(v);
            return (
              <g key={k}>
                <line x1={leftPad} y1={gy} x2={W - rightPad} y2={gy} stroke="#94a3b8" strokeOpacity={0.14} strokeWidth={0.5} />
                <text x={leftPad - 4} y={gy + 3} textAnchor="end" fontSize={8} fill="#94a3b8">{Math.round(v / 50) * 50}</text>
              </g>
            );
          })}
          {days.map((day, d) => {
            const dayLeft = leftPad + dayW * d;
            return (
              <g key={day.date}>
                {d > 0 && <line x1={dayLeft} y1={topPad} x2={dayLeft} y2={topPad + plotH} stroke="#94a3b8" strokeOpacity={0.12} strokeWidth={0.5} />}
                <text x={dayLeft + dayW / 2} y={H - bottomPad + 14} textAnchor="middle" fontSize={8.5} fontWeight={500} fill="#94a3b8">{dayLabel(day.date)}</text>
              </g>
            );
          })}
          {satelliteLine != null && satelliteLine >= yMin && satelliteLine <= yMax && (
            <line x1={leftPad} y1={y(satelliteLine)} x2={W - rightPad} y2={y(satelliteLine)} stroke={SNOWLINE_COLOR} strokeOpacity={0.7} strokeWidth={1} strokeDasharray="3 3" />
          )}
          {line("freezing", FREEZING_COLOR)}
          {line("snow", SNOWLINE_COLOR)}
        </svg>
        {satelliteLabel && <p className="text-[10px] text-slate-500 mt-1">{satelliteLabel}</p>}
      </div>
    </div>
  );
}

// ============================================================================
// 6) Key indicators
// ============================================================================

type Indicator = {
  icon: ReactNode;
  title: string;
  value: string;
  valueColor?: string;
  detail?: string;
  description?: string;
};

function computeIndicators(
  selectedDays: DailyRow[],
  bands: BandKey[],
  daysForBand: (b: BandKey) => DailyRow[],
  u: UnitFormat
): Indicator[] {
  const out: Indicator[] = [];

  // peak snow block
  let peak: { day: DailyRow; block: TimeBlock } | null = null;
  selectedDays.forEach((day) => (day.time_of_day ?? []).forEach((b) => {
    if (b.snow_cm_p50 > 0 && (!peak || b.snow_cm_p50 > peak.block.snow_cm_p50)) peak = { day, block: b };
  }));
  if (peak) {
    const p = peak as { day: DailyRow; block: TimeBlock };
    out.push({ icon: <Snowflake className="w-3.5 h-3.5" style={{ color: ACCENT }} />, title: "Peak snow", value: `${fmt(u.snow(p.block.snow_cm_p50))} ${u.snowUnit}`, detail: `${dayWeekday(p.day.date)} ${enDash(p.block.hours)}`, description: "Heaviest 6-hour block" });
  }

  // best elevation
  const totals = bands.map((b) => ({ band: b, total: daysForBand(b).reduce((s, r) => s + r.snow_cm_p50, 0) }));
  const bestElev = totals.reduce((best, t) => (best && best.total >= t.total ? best : t), totals[0]);
  if (bestElev && bestElev.total >= 1) {
    out.push({ icon: <Mountain className="w-3.5 h-3.5" style={{ color: "#22C55E" }} />, title: "Best elevation", value: BAND_LABELS[bestElev.band], valueColor: "#22C55E", detail: `${Math.round(u.snow(bestElev.total))} ${u.snowUnit} total`, description: "Most snow this window" });
  }

  // strongest wind
  let wind: { day: DailyRow; block: TimeBlock } | null = null;
  selectedDays.forEach((day) => (day.time_of_day ?? []).forEach((b) => {
    const g = b.wind_gust_kmh ?? b.wind_kmh ?? 0;
    const bg = wind ? (wind.block.wind_gust_kmh ?? wind.block.wind_kmh ?? 0) : -1;
    if (g > bg) wind = { day, block: b };
  }));
  if (wind) {
    const w = wind as { day: DailyRow; block: TimeBlock };
    const speed = w.block.wind_kmh != null ? u.windKmh(w.block.wind_kmh) : null;
    const gust = w.block.wind_gust_kmh != null ? u.windKmh(w.block.wind_gust_kmh) : null;
    if (speed != null) {
      out.push({ icon: <Wind className="w-3.5 h-3.5" style={{ color: "#38BDF8" }} />, title: "Strongest wind", value: gust != null ? `${speed}\u2192${gust} ${u.windKmhUnit}` : `${speed} ${u.windKmhUnit}`, detail: `${dayWeekday(w.day.date)} ${enDash(w.block.hours)}`, description: "Peak gust" });
    }
  }

  // base precip
  const baseBand = bands[bands.length - 1];
  if (baseBand) {
    const blocks = daysForBand(baseBand).flatMap((d) => d.time_of_day ?? []).filter((b) => b.snow_cm_p50 > 0 || (b.precip_mm_p50 ?? 0) > 0.5);
    if (!blocks.length) {
      out.push({ icon: <Cloud className="w-3.5 h-3.5 text-slate-400" />, title: "Base precip", value: "Dry", description: "No rain/snow at the base" });
    } else {
      const rain = blocks.filter((b) => blockKind(b) === "rain").length;
      const mix = blocks.filter((b) => blockKind(b) === "mix").length;
      let value = "Snow", detail = "All snow at the base";
      if (rain > blocks.length / 2) { value = "Rain"; detail = "Mostly rain at the base"; }
      else if (mix > 0 || rain > 0) { value = "Rain/snow"; detail = "Mixed at the base"; }
      out.push({ icon: <CloudSnow className="w-3.5 h-3.5" style={{ color: ACCENT }} />, title: "Base precip", value, detail, description: "Rain/snow at the base" });
    }
  }

  // visibility
  const allBlocks = selectedDays.flatMap((d) => d.time_of_day ?? []);
  // Physical thresholds, NOT a display value: maxGust is m/s regardless of the
  // user's unit preference, so 17/11 stay 17/11 m/s (≈61/40 km/h) now that wind
  // renders in km/h. Rescale only together with the iOS/Android ports.
  const maxGust = Math.max(0, ...allBlocks.map((b) => msFromKmh(b.wind_gust_kmh) ?? 0));
  const maxSnow = Math.max(0, ...allBlocks.map((b) => b.snow_cm_p50));
  const poor = maxGust >= 17 || maxSnow >= 8;
  const moderate = maxGust >= 11 || maxSnow >= 3;
  const level = poor ? "Poor" : moderate ? "Moderate" : "Good";
  const color = poor ? "#EF4444" : moderate ? "#F59E0B" : "#22C55E";
  out.push({ icon: <Eye className="w-3.5 h-3.5" style={{ color }} />, title: "Visibility", value: level, valueColor: color, description: "From wind + snowfall" });

  return out;
}

function KeyIndicators({ items }: { items: Indicator[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      <SectionHeader title="Key indicators" />
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
        {items.map((it) => (
          <div key={it.title + it.value} className="shrink-0 w-[9.25rem] h-[9.25rem] rounded-2xl bg-slate-800/40 p-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              {it.icon}
              <span className="text-[8.5px] font-bold uppercase text-slate-500 leading-tight">{it.title}</span>
            </div>
            <span className="text-lg font-bold leading-tight" style={{ color: it.valueColor ?? "#fff" }}>{it.value}</span>
            {it.detail && <span className="text-[10px] font-medium text-slate-200 leading-tight">{it.detail}</span>}
            {it.description && <span className="text-[9px] text-slate-500 leading-tight">{it.description}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 7) Snowpack depth (mountain cross-section + table)
// ============================================================================

// Depth is estimated for base/mid/top only — the `low` band is a forecast band,
// not a snowpack one, so it simply has no depth to report.
type DepthBand = Exclude<BandKey, "low">;
const hasDepth = (band: BandKey): band is DepthBand => band !== "low";

function depthCm(depth: SnowDepth, band: BandKey): number | null {
  if (!hasDepth(band)) return null;
  return depth[`${band}_cm` as const] ?? null;
}
function seasonCm(depth: SnowDepth, band: BandKey): number | null {
  if (!hasDepth(band)) return null;
  return depth.season_snowfall?.[`${band}_cm` as const] ?? null;
}

function MountainBands({ rows, snowlineM, elevationUnit = "m" }: { rows: DepthRowT[]; snowlineM: number | null; elevationUnit?: string }) {
  const W = 112, H = 128, top = 4, bot = H - 4, peak = W / 2, left = 4, right = W - 4;
  const count = rows.length;
  const edges = (y: number): [number, number] => {
    const t = (y - top) / (bot - top);
    return [peak + (left - peak) * t, peak + (right - peak) * t];
  };
  const elevs = rows.map((r) => r.elevationM).filter((e): e is number => e != null);
  const eMax = elevs.length ? Math.max(...elevs) : null;
  const eMin = elevs.length ? Math.min(...elevs) : null;
  const snowlineY =
    snowlineM != null && eMax != null && eMin != null && eMax > eMin
      ? top + (bot - top) * (1 - (snowlineM - eMin) / (eMax - eMin))
      : null;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0">
      {rows.map((row, i) => {
        const yA = top + (bot - top) * (i / count);
        const yB = top + (bot - top) * ((i + 1) / count);
        const [la, ra] = edges(yA);
        const [lb, rb] = edges(yB);
        return (
          <g key={row.band}>
            <polygon points={`${la},${yA} ${ra},${yA} ${rb},${yB} ${lb},${yB}`} fill={ACCENT} fillOpacity={row.tintOpacity} />
            {row.elevationM != null && (
              <text x={peak} y={(yA + yB) / 2 + 3} textAnchor="middle" fontSize={9} fontWeight={600} fill="#fff">{row.elevationM} {elevationUnit}</text>
            )}
          </g>
        );
      })}
      {snowlineY != null && snowlineY > top && snowlineY < bot && (
        <line x1={left} y1={snowlineY} x2={right} y2={snowlineY} stroke={SNOWLINE_COLOR} strokeWidth={1.5} strokeDasharray="4 3" />
      )}
    </svg>
  );
}

type DepthRowT = {
  band: BandKey;
  elevationM: number | null;
  depthCm: number | null;
  incomingCm: number;
  seasonCm: number | null;
  tintOpacity: number;
  chip: "measured" | "estimate" | "bare" | "satSnow";
};

function chipLabel(chip: DepthRowT["chip"]): string {
  return chip === "measured" ? "measured" : chip === "bare" ? "bare" : chip === "satSnow" ? "snow (satellite)" : "estimate";
}

function DepthSection({ depth, bands, bandElevations, incomingByBand }: {
  depth: SnowDepth;
  bands: BandKey[];
  bandElevations: Partial<Record<BandKey, number | null>>;
  incomingByBand: (b: BandKey) => number;
}) {
  const u = useUnitFormat();
  const present = bands.filter((b) => depthCm(depth, b) != null || bandElevations[b] != null);
  const snowlineStatus = depth.snowline?.status;
  const snowlineM = depth.snowline?.snowline_m ?? null;
  const satelliteSaysBare = (elev: number | null) =>
    elev != null && ((snowlineStatus === "all_bare") || (snowlineStatus === "snowline" && snowlineM != null && elev < snowlineM - 100));
  const satelliteSaysSnow = (elev: number | null) =>
    elev != null && ((snowlineStatus === "all_snow") || (snowlineStatus === "snowline" && snowlineM != null && elev > snowlineM + 100));

  const rows: DepthRowT[] = present.map((band, idx) => {
    const elev = bandElevations[band] != null ? Math.round(bandElevations[band] as number) : null;
    const cm = depthCm(depth, band);
    let chip: DepthRowT["chip"];
    if (cm === 0 && satelliteSaysBare(elev)) chip = "bare";
    else if (cm === 0 && satelliteSaysSnow(elev)) chip = "satSnow";
    else chip = depth.source === "station" ? "measured" : "estimate";
    const tintOpacity = present.length > 1 ? 0.82 + (0.18 * idx) / (present.length - 1) : 0.9;
    // elevationM display-converted AFTER the satellite chip logic (which runs on raw m).
    return { band, elevationM: elev != null ? u.elevation(elev) : null, depthCm: cm, incomingCm: incomingByBand(band), seasonCm: seasonCm(depth, band), tintOpacity, chip };
  });

  return (
    <div className="space-y-2">
      <SectionHeader title="Snowpack" subtitle="on ground · next 8 days · season" />
      <div className="rounded-2xl bg-slate-800/40 p-3.5 space-y-2.5">
        <div className="flex items-center gap-3.5">
          <MountainBands
            rows={rows}
            snowlineM={snowlineStatus === "snowline" && snowlineM != null ? u.elevation(snowlineM) : null}
            elevationUnit={u.elevationUnit}
          />
          <div className="flex-1 min-w-0">
            <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 pb-1.5 border-b border-slate-700/40">
              <span className="text-[10px] font-semibold text-slate-300 pl-3">Depth</span>
              <span className="text-[10px] font-semibold" style={{ color: ACCENT }}>7-day</span>
              <span className="text-[10px] font-semibold text-slate-400">Season</span>
            </div>
            {rows.map((row, idx) => (
              <div key={row.band} className={`grid grid-cols-[1fr_1fr_1fr] gap-2 py-1.5 items-center ${idx !== rows.length - 1 ? "border-b border-slate-700/20" : ""}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-1 h-5 rounded" style={{ background: ACCENT, opacity: row.tintOpacity }} />
                  <div className="flex flex-col leading-tight min-w-0">
                    {row.chip === "satSnow" ? (
                      <Snowflake className="w-3.5 h-3.5" style={{ color: ACCENT }} />
                    ) : row.depthCm != null ? (
                      <span className="text-sm font-bold" style={{ color: ACCENT }}>{u.snowInt(row.depthCm)}<span className="text-[9px] text-slate-500 font-normal"> {u.snowUnit}</span></span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                    <span className="text-[8.5px] text-slate-500 truncate">{chipLabel(row.chip)}</span>
                  </div>
                </div>
                <span className="text-sm font-semibold" style={{ color: ACCENT }}>{row.incomingCm >= 0.5 ? `+${Math.round(u.snow(row.incomingCm))}` : "—"}<span className="text-[9px] text-slate-500 font-normal">{row.incomingCm >= 0.5 ? ` ${u.snowUnit}` : ""}</span></span>
                <span className="text-sm font-semibold text-slate-300">{row.seasonCm && row.seasonCm > 0 ? u.snowInt(row.seasonCm) : "—"}<span className="text-[9px] text-slate-500 font-normal">{row.seasonCm && row.seasonCm > 0 ? ` ${u.snowUnit}` : ""}</span></span>
              </div>
            ))}
          </div>
        </div>
        <DepthProvenance depth={depth} />
      </div>
    </div>
  );
}

function DepthProvenance({ depth }: { depth: SnowDepth }) {
  const u = useUnitFormat();
  const lines: string[] = [];
  if (depth.station?.name) lines.push(`Anchored to ${depth.station.name} (${u.distance(depth.station.distance_km ?? 0).toFixed(1)} ${u.imperial ? "mi" : "km"})`);
  const sl = depth.snowline;
  if (sl?.obs_date) {
    if (sl.status === "snowline" && sl.snowline_m != null) lines.push(`Satellite snowline ${u.elevation(sl.snowline_m)} ${u.elevationUnit} · ${sl.obs_date}`);
    else if (sl.status === "all_bare") lines.push(`Satellite saw bare terrain · ${sl.obs_date}`);
    else if (sl.status === "all_snow") lines.push(`Satellite saw full snow cover · ${sl.obs_date}`);
  }
  if (depth.asof) lines.push(`Model estimate as of ${depth.asof.slice(0, 10)}`);
  if (!lines.length) return null;
  return (
    <div className="space-y-0.5">
      {lines.map((l) => <p key={l} className="text-[10px] text-slate-500">{l}</p>)}
    </div>
  );
}

// ============================================================================
// D8-16 fan chart (p50 curve + p10–p90 fan) + D17-44 week cards
// ============================================================================

type Pt = { x: number; y: number };

/** Smooth path through points via midpoint cubic segments (no y overshoot). */
function smoothPath(points: Pt[]): string {
  if (!points.length) return "";
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i], p1 = points[i + 1];
    const mx = (p0.x + p1.x) / 2;
    d += ` C${mx.toFixed(1)},${p0.y.toFixed(1)} ${mx.toFixed(1)},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
  }
  return d;
}
function fanBandPath(top: Pt[], bottom: Pt[]): string {
  let d = smoothPath(top);
  const rev = [...bottom].reverse();
  if (!rev.length) return d;
  d += ` L${rev[0].x.toFixed(1)},${rev[0].y.toFixed(1)}`;
  for (let i = 0; i < rev.length - 1; i++) {
    const p0 = rev[i], p1 = rev[i + 1];
    const mx = (p0.x + p1.x) / 2;
    d += ` C${mx.toFixed(1)},${p0.y.toFixed(1)} ${mx.toFixed(1)},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
  }
  return d + " Z";
}
function fanLabel(v: number): string {
  return v >= 10 ? String(Math.round(v)) : v.toFixed(1);
}

function SnowFanChart({ days, tint, labelScale = 1, rolling = false }:
  { days: DailyRow[]; tint: string; labelScale?: number; rolling?: boolean }) {
  const W = 560, H = 104, padT = 13;
  const n = Math.max(days.length, 1);
  // D9-16 draws the centred 3-day window, not the day (DECISIONS.md #1 step 1).
  // The daily series there is mostly zeros — a storm is placed within a few
  // days, not on one — so a day-by-day band renders as a flat line at the axis.
  // Preference order in D9-16: ensemble quantiles, then the 3-day window, then
  // the daily band. Measured on a live payload the first two disagree in BOTH
  // directions — 8/12 read 1.5-14.0 rolling against 0.0-2.8 from 72 members,
  // and 8/15 read 0.0-0.4 rolling against 0.0-13.0. Summing daily quantiles
  // does not merely widen the band, it distorts it: neighbouring days inflate
  // the quiet ones and a genuinely fat tail gets averaged away.
  const useEns = rolling && days.some((d) => d.ens_cm_p90 != null);
  const lo = (d: DailyRow) => (useEns ? d.ens_cm_p10 ?? 0 : rolling ? d.roll3_cm_p10 ?? d.snow_cm_p10 : d.snow_cm_p10);
  const mid = (d: DailyRow) => (useEns ? d.ens_cm_p50 ?? 0 : rolling ? d.roll3_cm_p50 ?? d.snow_cm_p50 : d.snow_cm_p50);
  const hi = (d: DailyRow) => (useEns ? d.ens_cm_p90 ?? 0 : rolling ? d.roll3_cm_p90 ?? d.snow_cm_p90 : d.snow_cm_p90);
  const maxY = Math.max(1, Math.max(0, ...days.map(hi)) * 1.1);
  const plotH = H - padT;
  const x = (i: number) => ((i + 0.5) / n) * W;
  const y = (v: number) => padT + plotH * (1 - Math.min(v / maxY, 1));
  const p90 = days.map((d, i) => ({ x: x(i), y: y(hi(d)) }));
  const p10 = days.map((d, i) => ({ x: x(i), y: y(lo(d)) }));
  const p50 = days.map((d, i) => ({ x: x(i), y: y(mid(d)) }));
  // Inner band, only when EVERY day carries one. p10-p90 over a zero-inflated
  // membership pins its floor at zero whenever a tenth of members forecast
  // nothing — true, but it leaves a band reading "0 to 21 cm" that says little.
  // p25-p75 shows where the mass sits WITHOUT replacing the outer band, because
  // narrowing what is drawn would hide the quarter forecasting nothing and the
  // tenth forecasting a lot, and the tail is the half a rider plans around.
  const hasInner = useEns && days.every((d) => d.ens_cm_p25 != null && d.ens_cm_p75 != null);
  const p75 = hasInner ? days.map((d, i) => ({ x: x(i), y: y(d.ens_cm_p75 ?? 0) })) : null;
  const p25 = hasInner ? days.map((d, i) => ({ x: x(i), y: y(d.ens_cm_p25 ?? 0) })) : null;
  // Most of this window runs on 2 models or fewer.
  // Still keyed on member count, not on the width that came out: a 3-day sum of
  // two-model days is a wider number but not a better-supported one.
  // With real members the band is a quantile, so the dashed "do not read width"
  // treatment no longer applies — unless the member count itself has collapsed.
  const degenerateFan = useEns
    ? days.filter((d) => (d.ens_members ?? 0) < 30).length > days.length / 2
    : days.length > 0 && days.filter((d) => (d.n_models ?? 4) <= 2).length > days.length / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      {/* The band is always FILLED. An earlier version dropped the fill when
          members were thin, but D9-16 is band-only by decision and is thin by
          definition — that combination left an empty outline with nothing
          inside it. Thin support changes how the band is drawn, not whether it
          exists: dashed edge and a lighter fill say "wide because we do not
          know", which is the honest reading. */}
      <path
        d={fanBandPath(p90, p10)}
        fill={tint}
        fillOpacity={degenerateFan ? 0.10 : 0.18}
        stroke={degenerateFan ? tint : "none"}
        strokeOpacity={degenerateFan ? 0.4 : 0}
        strokeWidth={degenerateFan ? 1 : 0}
        strokeDasharray={degenerateFan ? "3 3" : undefined}
      />
      {/* Same hue, denser fill, drawn over the outer so the opacities add: the
          two read as one distribution thickening toward the middle rather than
          as two separate quantities. */}
      {p75 && p25 && (
        <path
          d={fanBandPath(p75, p25)}
          fill={tint}
          fillOpacity={degenerateFan ? 0.14 : 0.22}
          stroke="none"
        />
      )}
      {/* No centre line in rolling mode. DECISIONS.md #1 makes D9-16 range-only,
          and a p50 curve is a point estimate drawn as a line — removing the
          number but keeping the line would have kept the claim and lost only
          the legibility. */}
      {!rolling && (
        <path d={smoothPath(p50)} fill="none" stroke={tint} strokeWidth={2}
              strokeLinecap="round" strokeLinejoin="round" />
      )}
      {/* No p50 markers or numbers here. DECISIONS.md #1 makes D9-16 range-only:
          with ~1.9 models the p10-p90 is a min/max of two runs, and printing a
          centre value on top of it claims a precision the arithmetic does not
          support. The band is the whole statement. */}
    </svg>
  );
}

function BandFanSection({ days }: { days: DailyRow[] }) {
  const u = useUnitFormat();
  return (
    <div className="space-y-2">
      <SectionHeader title="D9–16 range" subtitle="ensemble range · 3-day windows where members are thin" />
      <div className="rounded-2xl bg-slate-800/40 p-3">
        <SnowFanChart days={days} tint="#38BDF8" labelScale={u.snowScale} rolling />
        <div className="flex mt-1">
          {days.map((day) => (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
              <span className="text-[8.5px] text-slate-500">{dayMonthDay(day.date)}</span>
              {day.wind_dir_deg != null && <WindArrow deg={day.wind_dir_deg} className="w-2 h-2 text-slate-500" />}
              {day.wind_kmh != null && <span className="text-[8px] text-slate-500">{u.windKmh(day.wind_kmh)}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function confidenceMeta(confidence: string | null | undefined): { color: string; short: string } {
  const k = (confidence ?? "").toLowerCase();
  if (k === "high") return { color: "#22C55E", short: "High" };
  if (k === "medium") return { color: "#F59E0B", short: "Med" };
  return { color: "#9CA3AF", short: "Low" };
}

function WeekCard({ week }: { week: TendencyWeek }) {
  const u = useUnitFormat();
  const c = confidenceMeta(week.confidence);
  return (
    <div className="shrink-0 w-[5.25rem] rounded-xl bg-slate-800/40 p-2 flex flex-col items-center gap-1">
      <span className="text-[11px] font-medium text-slate-200">{week.week.replace(/D/g, "")}</span>
      <span className="flex items-baseline gap-0.5">
        <span className="text-sm font-semibold text-white">{fmt(u.snow(week.snow_cm_p50))}</span>
        <span className="text-[9px] text-slate-500">{u.snowUnit}</span>
      </span>
      <span className="text-[9px] text-slate-500">{fmt(u.snow(week.snow_cm_p10))}–{fmt(u.snow(week.snow_cm_p90))}</span>
      <span className="text-[9px] text-slate-500">{u.imperial ? "≥4in" : "≥10cm"} {Math.round((week.prob_snow_ge_10cm ?? 0) * 100)}%</span>
      <span className="text-[9px] font-bold rounded-full px-1.5 py-0.5" style={{ color: c.color, background: `${c.color}33` }}>{c.short}</span>
    </div>
  );
}

// ============================================================================
// Main view
// ============================================================================

function UnitsToggle() {
  const [pref, setPref] = useUnitPref();
  const options: Array<[UnitSystemPref, string]> = [
    ["automatic", "Auto"],
    ["metric", "°C·cm"],
    ["imperial", "°F·in"],
  ];
  return (
    <div className="flex rounded-lg bg-slate-800/60 p-0.5 gap-0.5 shrink-0" role="group" aria-label="Measurement units">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => setPref(key)}
          className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
            pref === key ? "bg-slate-600/80 text-white" : "text-slate-500 hover:text-white"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function ForecastView({ resort }: { resort: SnowResort }) {
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty">("loading");
  const [band, setBand] = useState<BandKey>("top");
  const u = useUnitFormat();
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

  const payload = forecast?.payload;

  // bands present, summit → base
  const presentBands = useMemo<BandKey[]>(
    () => BAND_ORDER.filter((k) => payload?.bands?.[k] !== undefined),
    [payload]
  );

  const bandRows = useMemo(() => {
    const daily = payload?.daily ?? [];
    return daily.filter((r) => r.band === band).sort((a, b) => a.day_index - b.day_index);
  }, [payload, band]);

  // DECISIONS.md #1: two zones, boundary at 8. D1-8 carries a point value,
  // D9-16 is band-only.
  const quantRows = useMemo(() => bandRows.filter((r) => r.day_index >= 1 && r.day_index <= 8), [bandRows]);
  const bandOnlyRows = useMemo(() => bandRows.filter((r) => r.day_index >= 9 && r.day_index <= 16), [bandRows]);

  useEffect(() => {
    if (quantRows.length && (!selectedDay || !quantRows.some((r) => r.date === selectedDay))) {
      setSelectedDay(quantRows[0].date);
    }
  }, [quantRows, selectedDay]);

  // 3-day detail window: selected + next two (clamped)
  const detailDays = useMemo(() => {
    if (!quantRows.length) return [];
    const selIdx = Math.max(0, quantRows.findIndex((r) => r.date === selectedDay));
    const start = Math.min(selIdx < 0 ? 0 : selIdx, Math.max(0, quantRows.length - 3));
    return quantRows.slice(start, start + 3);
  }, [quantRows, selectedDay]);

  const detailDates = useMemo(() => new Set(detailDays.map((d) => d.date)), [detailDays]);

  const daysForBand = useMemo(
    () => (b: BandKey) =>
      (payload?.daily ?? [])
        .filter((r) => r.band === b && detailDates.has(r.date) && r.day_index >= 1 && r.day_index <= 7)
        .sort((a, z) => a.day_index - z.day_index),
    [payload, detailDates]
  );

  const detailBlockSnowMax = useMemo(() => {
    let m = 1;
    presentBands.forEach((b) => daysForBand(b).forEach((d) => (d.time_of_day ?? []).forEach((blk) => { m = Math.max(m, blk.snow_cm_p50); })));
    return m;
  }, [presentBands, daysForBand]);

  const incomingByBand = useMemo(
    () => (b: BandKey) =>
      (payload?.daily ?? [])
        .filter((r) => r.band === b && r.day_index >= 1 && r.day_index <= 7)
        .reduce((s, r) => s + r.snow_cm_p50, 0),
    [payload]
  );

  const indicators = useMemo(
    () => computeIndicators(daysForBand(band), presentBands, daysForBand, u),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- u is value-keyed by imperial
    [daysForBand, band, presentBands, u.imperial]
  );

  if (status === "loading") {
    return (
      <div className="glass rounded-2xl p-12 flex flex-col items-center gap-3 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
        Computing the latest multi-model forecast…
      </div>
    );
  }
  if (status === "empty" || !forecast || !payload) {
    return (
      <div className="glass rounded-2xl p-12 text-center text-slate-400">
        No forecast is available for this resort right now. Please try again shortly.
      </div>
    );
  }

  const depth = payload.depth;
  const satellite = depth?.snowline;
  const confidence = (() => {
    const n = payload.models.length;
    if (n >= 4) return { text: "high", color: "#22C55E" };
    if (n === 3) return { text: "medium", color: "#F59E0B" };
    return { text: "low", color: "#9CA3AF" };
  })();

  return (
    <div className="space-y-6">
      {/* Band selector + units */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex rounded-xl bg-slate-800/60 p-1 gap-1 max-w-md flex-1 min-w-[16rem]">
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
                {elevation !== null && <span className="block text-xs opacity-75">{u.elevationLabel(elevation)}</span>}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShowLegend(true)}
            aria-label="What the icons mean"
            className="px-3 text-slate-500 hover:text-white transition-colors"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
        <UnitsToggle />
      </div>

      {/* 1) Summary */}
      <SummaryBanner text={summarySentence(quantRows, band, u)} />

      {/* 2) 7-day strip */}
      <SevenDayStrip rows={quantRows} selectedDate={detailDays[0]?.date ?? null} onSelect={setSelectedDay} />

      {/* 3) Aligned forecast grid */}
      {detailDays.length > 0 && (
        <ForecastGrid
          detailDays={detailDays}
          bands={presentBands}
          bandElevations={payload.bands ?? {}}
          daysForBand={daysForBand}
          blockScaleMax={detailBlockSnowMax}
          selectedBand={band}
        />
      )}

      {/* 4) Wind */}
      {daysForBand(band).some((d) => (d.time_of_day ?? []).length > 0) && <WindTable days={daysForBand(band)} />}

      {/* 5) Snowline & freezing */}
      <SnowlineFreezingChart
        days={daysForBand(band)}
        satelliteSnowlineM={satellite?.status === "snowline" ? satellite?.snowline_m ?? null : null}
        satelliteLabel={satellite?.obs_date ? `Satellite snowline · ${satellite.obs_date}` : null}
      />

      {/* 6) Key indicators */}
      <KeyIndicators items={indicators} />

      {/* 7) Snowpack depth */}
      {depth && (
        <DepthSection depth={depth} bands={presentBands} bandElevations={payload.bands ?? {}} incomingByBand={incomingByBand} />
      )}

      {/* D8-16 band — p50 curve + p10–p90 fan */}
      {bandOnlyRows.length > 0 && <BandFanSection days={bandOnlyRows} />}

      {/* D17-44 weekly tendency */}
      {payload.tendency_weekly && payload.tendency_weekly.length > 0 && (
        <div className="space-y-2">
          <SectionHeader title="D17–44 outlook" subtitle="EC46 ensemble · weekly" />
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
            {payload.tendency_weekly.map((week) => <WeekCard key={week.week} week={week} />)}
          </div>
        </div>
      )}

      {/* Confidence footer */}
      <div className="flex items-start gap-1.5 px-1">
        <Info className="w-3 h-3 mt-0.5 text-slate-500 shrink-0" />
        <p className="text-[11px] text-slate-500">
          Confidence is <span className="font-bold" style={{ color: confidence.color }}>{confidence.text}</span> · based on how many weather models agree.
        </p>
      </div>

      <p className="text-xs text-slate-600 flex items-center gap-1.5">
        <Navigation className="w-3 h-3" />
        {payload.models.join(" · ")} — generated {payload.generated_utc.slice(0, 16).replace("T", " ")} UTC
        {forecast.cached ? " (cached)" : ""}
      </p>

      {showLegend && <LegendModal onClose={() => setShowLegend(false)} />}
    </div>
  );
}
